import * as THREE from 'three';
import { Rng } from '../core/rng.js';
import { CameraRig } from '../engine/camera-rig.js';
import { FX } from '../engine/fx.js';
import { MapGenerator } from '../world/mapgen.js';
import { TerrainView } from '../world/terrain.js';
import { T, TERRAIN } from '../world/grid.js';
import { TOWER_DEFS, TOWERS, UPGRADE_PATHS } from './tower-defs.js';
import { TowerSystem } from './towers.js';
import { EnemySystem } from './enemies.js';
import { ProjectileSystem } from './projectiles.js';
import { WaveDirector } from './waves.js';
import { CoreModel } from './core-model.js';
import { drawCards } from './cards.js';
import { BALANCE, sectorOf, isBossWave } from './balance.js';

export const PHASE = {
  BUILD: 'build',
  COMBAT: 'combat',
  DRAFT: 'draft',
  EXPANDING: 'expanding',
  GAMEOVER: 'gameover',
};

/**
 * Orquestador de la partida: posee el estado, los sistemas y la máquina de
 * fases (construir → combatir → elegir carta → [expandir mapa] → construir).
 */
export class Game {
  constructor(renderer, input, seed) {
    this.r = renderer;
    this.scene = renderer.scene;
    this.input = input;
    this.rig = new CameraRig(renderer.camera, input);
    this.seedText = String(seed);
    this.listeners = [];

    this.fx = new FX(this.scene);
    this.terrain = new TerrainView(this.scene);
    this.enemies = new EnemySystem(this.scene);
    this.enemies.setFX(this.fx);
    this.projectiles = new ProjectileSystem(this.scene, this.enemies, this.fx);
    this.towers = new TowerSystem(this.scene);
    this.markers = new THREE.Group();
    this.scene.add(this.markers);

    this.reset(seed);
  }

  /** Propaga el nivel de calidad a lo que se genera por CPU. */
  applyQuality(preset) {
    this.terrain.setQuality(preset);
    this.fx.setQuality(preset);
  }

  on(fn) {
    this.listeners.push(fn);
  }
  emit(evt, data) {
    for (const fn of this.listeners) fn(evt, data);
  }

  reset(seed = Date.now()) {
    this.seedText = String(seed);
    this.rng = new Rng(this.seedText);
    this.combatRng = this.rng.fork('combat');
    this.cardRng = this.rng.fork('cards');
    this.waveRng = this.rng.fork('waves');

    this.map = new MapGenerator(this.rng.fork('map').seed).generateInitial();
    this.grid = this.map.grid;

    this.towers.clear();
    this.enemies.clear();
    this.projectiles.clear();
    this.fx.clear();
    this.terrain.lastVersion = -1;

    this.director = new WaveDirector(this.waveRng);

    this.state = {
      gold: BALANCE.startGold,
      lives: BALANCE.startLives,
      maxLives: BALANCE.startLives,
      wave: 0,
      sector: 1,
      score: 0,
      kills: 0,
      leaked: 0,
      leakedBy: {},
      interest: BALANCE.interest,
      veinGold: 0,          // oro por oleada y filón explotado
      goldPerTowerType: 1,  // premio por dañar con torres de tipos distintos
      global: {
        damage: 1, range: 1, fireRate: 1, splash: 1,
        vsHealth: 1, vsArmor: 1, vsShield: 1, dotMult: 1,
        goldMult: 1, costMult: 1, critChance: 0, critBonus: 0,
        synergy: {},
      },
      synergy: {},
      curse: { hp: 1, speed: 1, count: 1, armorBoost: 0 },
      taken: new Set(),
      unlocked: this.towers.unlocked,
      justUnlocked: null,
    };
    this.state.global.synergy = this.state.synergy;

    this.phase = PHASE.BUILD;
    this.selectedDef = null;
    this.selectedTower = null;
    this.hoverCell = null;
    this.targetMode = 'first';
    this.time = 0;
    this.cards = [];
    this.expandTimer = 0;
    this.freshCells = [];
    this.towers.dirty = true;

    this._buildMarkers();
    this.rig.focus(0, 0);
    // El límite se toma de la extensión real de la rejilla: calcularlo con el
    // radio objetivo del generador dejaba la cámara sin poder llegar al borde.
    this.rig.setBounds(this.grid.radius * 0.95);
    this.emit('reset');
  }

  // --- Marcadores de núcleo y portales ---

  _buildMarkers() {
    this.markers.clear();

    if (!this.coreModel) this.coreModel = new CoreModel(this.scene);
    this.coreModel.setPosition(0, this.map.core.wy, 0);

    this.portals = [];
    this._syncPortals();
  }

  _syncPortals() {
    for (const p of this.portals) this.markers.remove(p);
    this.portals.length = 0;
    const geo = new THREE.TorusGeometry(1.05, 0.22, 8, 18);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff5a8a, toneMapped: false });
    for (const r of this.map.routes) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(r.spawn.wx, r.spawn.wy + 1.3, r.spawn.wz);
      m.rotation.y = Math.PI / 2;
      this.markers.add(m);
      this.portals.push(m);
    }
  }

  // --- Acciones del jugador ---

  selectTowerDef(id) {
    const def = TOWERS[id];
    if (!def || !this.state.unlocked.has(id)) return;
    this.selectedDef = this.selectedDef === def ? null : def;
    this.selectedTower = null;
    this.emit('selection');
  }

  /** El precio sube con cada torre del mismo tipo ya construida. */
  costOf(def) {
    return Math.round(this.towers.priceOf(def) * (this.state.global.costMult || 1));
  }

  place(cell) {
    const def = this.selectedDef;
    if (!def || !this.towers.canPlace(cell, def)) return false;
    const cost = this.costOf(def);
    if (this.state.gold < cost) { this.emit('nogold'); return false; }
    this.state.gold -= cost;
    const t = this.towers.place(def, cell);
    t.invested = cost;
    t.bornAt = this.time; // dispara la animación de aparición
    this.fx.shockwave(cell.wx, cell.wy, cell.wz, 2.4, 0x9fd8ff, 0.45);
    this.fx.sparks(cell.wx, cell.wy + 0.5, cell.wz, 12, def.accent, 5, 0.22, 0.45);
    this.fx.puff(cell.wx, cell.wy + 0.2, cell.wz, 4, 0x8a8a90, 0.8, 0.6, 0.8);
    this.emit('build', t);
    return true;
  }

  sellTower(t) {
    const refund = Math.round(t.invested * BALANCE.sellRatio);
    this.state.gold += refund;
    this.fx.burst(t.x, t.y + 0.6, t.z, 12, 0xffd06b, 5, 0.18, 0.5);
    this.towers.sell(t);
    if (this.selectedTower === t) this.selectedTower = null;
    this.emit('sell', refund);
  }

  upgradeTower(t, pathId) {
    const cost = t.upgradeCost(pathId);
    if (cost === null || this.state.gold < cost) { this.emit('nogold'); return false; }
    this.state.gold -= cost;
    t.invested += cost;
    this.towers.upgrade(t, pathId);
    this.fx.ring(t.x, t.y, t.z, 2.4, 0xffe08a, 0.35);
    this.emit('upgrade', t);
    return true;
  }

  startWave() {
    if (this.phase !== PHASE.BUILD) return;
    this.state.wave++;
    this.state.sector = sectorOf(this.state.wave);
    // El cielo se oscurece conforme avanzan los sectores: un aviso de
    // dificultad que se lee sin mirar la interfaz.
    this.r.setSector(this.state.sector);
    this.director.start(this.state.wave, this.state.sector, this.map.routes, this.state.curse);
    this.phase = PHASE.COMBAT;
    this.emit('wave', this.state.wave);
  }

  chooseCard(card) {
    if (this.phase !== PHASE.DRAFT) return;
    card.apply(this.state);
    if (card.unique) this.state.taken.add(card.id);
    this.towers.unlocked = this.state.unlocked;
    this.towers.dirty = true;
    this.cards = [];
    this.emit('card', card);
    this._afterDraft();
  }

  _afterDraft() {
    // Cambio de sector: el mapa crece justo antes de volver a la fase de construcción.
    if (this.state.wave > 0 && this.state.wave % BALANCE.wavesPerSector === 0) {
      const { cells, sealed } = this.map.expand();
      this.freshCells = cells;
      this._syncPortals();
      this.rig.setBounds(this.grid.radius * 0.95);
      this.phase = PHASE.EXPANDING;
      this.expandTimer = 1.4;
      for (const r of this.map.routes) {
        this.fx.ring(r.spawn.wx, r.spawn.wy, r.spawn.wz, 4, 0xff5a8a, 1.2);
      }
      this.emit('expand', { level: this.map.level, sealed, routes: this.map.routes.length });
    } else {
      this.phase = PHASE.BUILD;
      this.emit('phase');
    }
  }

  setTargetMode(mode) {
    this.targetMode = mode;
    this.emit('selection');
  }

  // --- Bucle ---

  /** Simulación pura, a paso fijo. Nada de cámara ni de entrada de un frame. */
  update(dt) {
    this.time += dt;

    if (this.phase === PHASE.EXPANDING) {
      this.expandTimer -= dt;
      if (this.expandTimer <= 0) {
        this.phase = PHASE.BUILD;
        this.emit('phase');
      }
    }

    if (this.phase === PHASE.COMBAT) this._updateCombat(dt);

    // El índice espacial se reconstruye una vez por paso y lo aprovechan todas
    // las torres y los proyectiles de área.
    this.enemies.rebuildIndex();

    const ctx = {
      enemies: this.enemies, projectiles: this.projectiles, fx: this.fx,
      time: this.time, rng: this.combatRng, global: this.state.global,
      grid: this.grid, targetMode: this.targetMode,
    };
    this.towers.update(dt, ctx);
    this.projectiles.update(dt);
    this.fx.update(dt);

    this.coreModel.update(dt, this.time, this.state.lives / this.state.maxLives);

    for (let i = 0; i < this.portals.length; i++) {
      this.portals[i].rotation.z += dt * (1.2 + i * 0.2);
    }

    // Los portales escupen partículas sin parar, y con más fuerza en combate:
    // marcan de un vistazo por dónde va a entrar la oleada.
    this._emitAcc = (this._emitAcc || 0) + dt;
    if (this._emitAcc > 0.09) {
      this._emitAcc = 0;
      const hot = this.phase === PHASE.COMBAT;
      for (const r of this.map.routes) {
        this.fx.column(r.spawn.wx, r.spawn.wy + 0.3, r.spawn.wz,
          hot ? 3 : 1, hot ? 0xff5a8a : 0xa03a63, 2.2, 0.8);
      }
    }
  }

  _updateCombat(dt) {
    const spawned = this.director.update(dt, (s) => {
      this.enemies.spawn(s.def, s.route, this.state.wave, this.state.sector, s.lane, {
        hp: s.hpMult,
        speed: this.state.curse.speed,
        armorBoost: this.state.curse.armorBoost,
      });
      this.fx.burst(s.route.spawn.wx, s.route.spawn.wy + 1, s.route.spawn.wz, 5, 0xff5a8a, 4, 0.14, 0.3);
    });

    const res = this.enemies.update(dt, this.time, this.state.goldPerTowerType);
    if (res.gold) {
      this.state.gold += Math.round(res.gold * (this.state.global.goldMult || 1));
    }
    if (res.killed) {
      this.state.kills += res.killed;
      this.state.score += res.killed;
    }
    if (res.leaked) {
      this.state.lives -= res.coreDamage;
      this.state.leaked += res.leaked;
      // Qué tipo se está colando: es la información que dice qué torre falta.
      for (const d of res.leakedDefs) {
        this.state.leakedBy[d.name] = (this.state.leakedBy[d.name] || 0) + 1;
      }
      this.coreModel.hit();
      this.fx.explosion(0, this.map.core.wy + 1.5, 0, 5, 0xff3a3a);
      this.fx.flash(0, this.map.core.wy + 4.4, 0, 4.5, 0xff8080, 0.3);
      this.emit('damage');
      if (this.state.lives <= 0) {
        this.state.lives = 0;
        this.phase = PHASE.GAMEOVER;
        this._saveRecord();
        this.emit('gameover');
        return;
      }
    }

    if (spawned && this.enemies.count === 0) this._endWave();
  }

  /** Filones con al menos una torre adyacente: producen oro cada oleada. */
  activeVeins() {
    if (!this.state.veinGold) return 0;
    let n = 0;
    for (const cell of this.grid.cells.values()) {
      if (cell.feature !== 'vein') continue;
      for (const c of this.grid.neighbors(cell.x, cell.y)) {
        if (c.tower) { n++; break; }
      }
    }
    return n;
  }

  _endWave() {
    const st = this.state;
    const interest = Math.min(BALANCE.interestCap, Math.floor(st.gold * st.interest));
    const veins = this.activeVeins() * st.veinGold;
    const bonus = BALANCE.waveBonusBase + st.wave * BALANCE.waveBonusPerWave + interest + veins;
    st.gold += Math.round(bonus * (st.global.goldMult || 1));
    st.score += st.wave * 10;

    this.cards = drawCards(this.cardRng, st, BALANCE.cardChoices, isBossWave(st.wave));
    if (!this.cards.length) { this._afterDraft(); return; }
    this.phase = PHASE.DRAFT;
    this.emit('draft', { cards: this.cards, bonus: Math.round(bonus), interest, veins });
  }

  _saveRecord() {
    try {
      const best = JSON.parse(localStorage.getItem('rogueSpireBest') || '{}');
      if ((best.wave || 0) < this.state.wave) {
        localStorage.setItem('rogueSpireBest', JSON.stringify({
          wave: this.state.wave, score: this.state.score, seed: this.seedText,
        }));
      }
    } catch { /* almacenamiento no disponible: el récord es opcional */ }
  }

  get best() {
    try { return JSON.parse(localStorage.getItem('rogueSpireBest') || 'null'); }
    catch { return null; }
  }

  /** Celda bajo el cursor, corrigiendo el paralaje de la altura del terreno. */
  _updateHover() {
    if (this.input.blocked || this.phase === PHASE.DRAFT || this.phase === PHASE.GAMEOVER) {
      this.hoverCell = null;
      return;
    }
    let p = this.rig.pickGround(0);
    if (!p) { this.hoverCell = null; return; }
    let cell = this.grid.atWorld(p.x, p.z);
    if (cell) {
      // Segunda pasada a la altura real de esa celda: sin esto el cursor se
      // desvía varias casillas sobre las montañas.
      p = this.rig.pickGround(cell.wy);
      if (p) cell = this.grid.atWorld(p.x, p.z) || cell;
    }
    this.hoverCell = cell;
  }

  handleClick(button) {
    if (this.phase === PHASE.DRAFT || this.phase === PHASE.GAMEOVER) return;
    const cell = this.hoverCell;
    if (button === 2) {
      this.selectedDef = null;
      this.selectedTower = null;
      this.emit('selection');
      return;
    }
    if (button !== 0 || !cell) return;

    if (this.selectedDef) {
      const placed = this.place(cell);
      // Shift mantiene la torre seleccionada para construir en serie.
      if (placed && !this.input.isDown('ShiftLeft') && !this.input.isDown('ShiftRight')) {
        this.selectedDef = null;
        this.emit('selection');
      }
      return;
    }
    this.selectedTower = cell.tower || null;
    this.emit('selection');
  }

  /**
   * Presentación: corre exactamente una vez por frame y en tiempo real, así
   * que la cámara y el cursor no dependen de la velocidad de simulación.
   */
  render(frameTime) {
    this.rig.update(frameTime);
    this.r.update(frameTime, this.time);
    // El agua refleja el cielo y el sol de la paleta activa, así que hay que
    // pasarle la iluminación vigente cuando cambia de sector.
    const sky = this.r.sky?.blend;
    if (sky) {
      this.terrain.water.setEnvironment({
        sunDir: sky.sunDir, sunColor: sky.key,
        skyTop: this.r.sky.uniforms.uTop.value.getHex(),
        skyHorizon: this.r.sky.uniforms.uMid.value.getHex(),
      });
    }
    this._updateHover();
    this.terrain.rebuild(this.grid);
    this.terrain.animate(this.time);

    // Cursor de construcción y anillo de alcance.
    const cell = this.hoverCell;
    if (this.selectedDef && cell) {
      const ok = this.towers.canPlace(cell, this.selectedDef) && this.state.gold >= this.costOf(this.selectedDef);
      this.terrain.showCursor(cell, ok);
      const r = this.selectedDef.range * (this.state.global.range || 1)
        * (TERRAIN[cell.terrain].mods.range || 1)
        * (1 + Math.max(0, cell.height) * 0.045);
      this.terrain.showRange(cell.wx, cell.wy, cell.wz, r);
      this.towers.ghost = { def: this.selectedDef, cell, valid: ok };
    } else if (this.selectedTower) {
      const t = this.selectedTower;
      this.terrain.showCursor(t.cell, true);
      this.terrain.showRange(t.x, t.y, t.z, t.stats.range || t.def.range);
      this.towers.ghost = null;
    } else {
      this.terrain.showCursor(cell, cell ? this.towers.canPlace(cell, TOWERS.crossbow) : false);
      this.terrain.showRange(0, 0, 0, 0);
      this.towers.ghost = null;
    }

    this.towers.render(this.time);
    this.enemies.render(this.rig.yaw);
    this.projectiles.render();
    this.fx.render();
    this.r.followShadow(this.rig.target);
    this.r.render();
  }
}
