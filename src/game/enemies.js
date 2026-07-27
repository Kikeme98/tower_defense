import * as THREE from 'three';
import { InstancedBatch } from '../engine/instanced.js';
import { buildEnemyModels } from './enemy-models.js';
import { TILE } from '../world/grid.js';
import { BALANCE, hpScale, goldScale } from './balance.js';

/**
 * Modelo de daño en tres capas (idea tomada de Rogue Tower): cada enemigo tiene
 * ESCUDO, ARMADURA y SALUD como depósitos separados que se vacían siempre en
 * ese orden. Cada torre tiene un multiplicador distinto contra cada capa, así
 * que "qué torre construyo" deja de ser "la que más daño hace" y pasa a ser
 * "la que rompe lo que viene". Los tres venenos refuerzan lo mismo: cada uno
 * hace daño completo a su capa afín y la mitad a las otras dos.
 */

export const LAYER = { SHIELD: 's', ARMOR: 'a', HEALTH: 'h' };

/** Afinidad de cada efecto persistente: completo a su capa, mitad al resto. */
export const DOT_AFFINITY = {
  bleed: { h: 1.0, a: 0.5, s: 0.5 },   // hemorragia: anula la regeneración de salud
  burn: { h: 0.5, a: 1.0, s: 0.5 },   // fuego: anula la regeneración de armadura
  poison: { h: 0.5, a: 0.5, s: 1.0 },   // veneno: anula la regeneración de escudo
};
const DOT_BLOCKS = { bleed: 'health', burn: 'armor', poison: 'shield' };
const DOT_DRAIN = 0.45; // fracción del depósito de veneno que se aplica por segundo

export const SLOW_CAP = 0.60;   // ralentización máxima acumulable
export const SLOW_DECAY = 0.10; // puntos de ralentización que se pierden por segundo

/**
 * `hp/armor/shield` son valores base; se escalan con la oleada.
 * `regen` está en fracción del máximo de esa capa por segundo.
 */
export const ENEMY_DEFS = [
  {
    id: 'grunt', name: 'Soldado', shape: 0, color: 0xc0554a,
    hp: 55, armor: 0, shield: 0, speed: 2.6, gold: 7, size: 0.5, from: 1, weight: 10,
  },
  {
    id: 'runner', name: 'Corredor', shape: 1, color: 0xe0a03a,
    hp: 30, armor: 0, shield: 0, speed: 5.4, gold: 6, size: 0.42, from: 3, weight: 7,
  },
  {
    id: 'swarm', name: 'Enjambre', shape: 1, color: 0xb0d04a,
    hp: 18, armor: 0, shield: 0, speed: 4.6, gold: 3, size: 0.3, from: 4, weight: 6, burst: 5,
  },
  {
    id: 'brute', name: 'Bruto', shape: 2, color: 0x8a4ac0,
    hp: 260, armor: 0, shield: 0, speed: 1.7, gold: 20, size: 0.78, from: 5,
    weight: 5, regen: { health: 0.05 },
  },
  {
    id: 'flyer', name: 'Aguijón', shape: 3, color: 0x4ac0b0, flying: true,
    hp: 70, armor: 0, shield: 70, speed: 3.4, gold: 12, size: 0.5, from: 7, weight: 5,
  },
  {
    id: 'armored', name: 'Acorazado', shape: 2, color: 0x6a7a8a,
    hp: 70, armor: 185, shield: 0, speed: 2.1, gold: 18, size: 0.62, from: 8,
    weight: 5, regen: { armor: 0.04 },
  },
  {
    id: 'shielded', name: 'Égida', shape: 2, color: 0x3a8ad0,
    hp: 90, armor: 0, shield: 230, speed: 2.3, gold: 26, size: 0.6, from: 11,
    weight: 5, regen: { shield: 0.08 },
  },
  {
    id: 'healer', name: 'Sanador', shape: 4, color: 0x4ad07a,
    hp: 140, armor: 60, shield: 60, speed: 2.2, gold: 26, size: 0.55, from: 13, weight: 3,
    heal: { radius: 7, hps: 0.04 },
  },
  {
    id: 'wraith', name: 'Espectro', shape: 3, color: 0x9a5ad0, flying: true,
    hp: 130, armor: 0, shield: 190, speed: 4.2, gold: 30, size: 0.55, from: 16,
    weight: 4, dodge: 0.18,
  },
  {
    id: 'bulwark', name: 'Baluarte', shape: 2, color: 0xd08a3a,
    hp: 120, armor: 290, shield: 175, speed: 1.6, gold: 40, size: 0.75, from: 20,
    weight: 4, regen: { armor: 0.05, shield: 0.05 }, coreDamage: 2,
  },
  {
    id: 'juggernaut', name: 'Coloso', shape: 5, color: 0xd04a4a,
    hp: 700, armor: 500, shield: 200, speed: 1.35, gold: 90, size: 1.05, from: 24,
    weight: 3, regen: { health: 0.04 }, coreDamage: 3,
  },
];

export const BOSS_DEF = {
  id: 'boss', name: 'Titán', shape: 5, color: 0xff3a5a,
  hp: 1400, armor: 900, shield: 900, speed: 1.25, gold: 140, size: 1.6, boss: true,
  regen: { health: 0.03, armor: 0.03, shield: 0.03 }, coreDamage: 6,
};


/**
 * Ruta de vuelo: los mismos waypoints, pero muestreados de N en N. El volador
 * sigue el trazado general del camino cortando las curvas, así que es más
 * rápido y más difícil de cubrir, pero no ignora por completo la defensa
 * construida. Un volador en línea recta pura convierte el mapa en irrelevante.
 */
function flightPath(route, stride = 6) {
  if (route.flyPath) return route.flyPath;
  const cs = route.cells;
  const out = [cs[0]];
  for (let i = stride; i < cs.length - 1; i += stride) out.push(cs[i]);
  out.push(cs[cs.length - 1]);
  route.flyPath = out;
  return out;
}

export class Enemy {
  constructor() {
    this.alive = false;
  }

  spawn(def, route, wave, sector, lane, mods = {}) {
    this.def = def;
    this.route = route;
    this.idx = 0;
    this.t = 0;
    this.lane = lane;
    this.flying = !!def.flying;

    const s = hpScale(wave, sector) * (mods.hp || 1);
    const armorBoost = 1 + (mods.armorBoost || 0);
    this.maxHealth = def.hp * s;
    this.maxArmor = def.armor * s * armorBoost;
    this.maxShield = def.shield * s * armorBoost;
    this.health = this.maxHealth;
    this.armor = this.maxArmor;
    this.shield = this.maxShield;

    this.baseSpeed = def.speed * (1 + wave * BALANCE.speedPerWave) * (mods.speed || 1);
    this.gold = Math.round(def.gold * goldScale(wave)
      * (def.boss ? BALANCE.bossGoldMult : 1) * (mods.gold || 1));
    this.size = def.size * (def.boss ? 1 + Math.min(sector * 0.05, 0.7) : 1);

    this.slow = 0;
    this.dot = { bleed: 0, burn: 0, poison: 0 };
    this.hitFlash = 0;
    // Desfase inicial distinto por unidad: si arrancan sincronizados, la oleada
    // entera bota a la vez y parece un solo objeto.
    this.gait = lane * 9;
    this.alive = true;
    this.reachedCore = false;
    // Se premia dañar a un enemigo con torres de tipos distintos.
    this.hitBy = new Set();

    this.path = this.flying ? flightPath(route) : route.cells;
    this.flyHeight = 4.2 + (lane + 1) * 1.1;
    const c0 = this.path[0];
    this.x = c0.wx;
    this.z = c0.wz;
    this.y = this.flying ? c0.wy + this.flyHeight : c0.wy;
    this.heading = 0;
    return this;
  }

  get speed() {
    return this.baseSpeed * (1 - this.slow);
  }

  get totalHp() {
    return this.health + this.armor + this.shield;
  }
  get maxTotalHp() {
    return this.maxHealth + this.maxArmor + this.maxShield;
  }

  /** Capa que recibiría el próximo impacto. El HUD y el objetivo lo usan. */
  get topLayer() {
    if (this.shield > 0) return LAYER.SHIELD;
    if (this.armor > 0) return LAYER.ARMOR;
    return LAYER.HEALTH;
  }

  /** Progreso hacia el núcleo en [0,1]: define el objetivo "más avanzado". */
  get progress() {
    return (this.idx + this.t) / Math.max(1, this.path.length - 1);
  }

  /**
   * Aplica daño respetando el orden escudo → armadura → salud. `mult` lleva un
   * multiplicador por capa; el sobrante al romper una capa pasa a la siguiente
   * reconvertido a daño base, de forma que ningún impacto se desperdicia.
   */
  damage(amount, mult, towerId = null) {
    if (!this.alive || amount <= 0) return 0;
    if (towerId) this.hitBy.add(towerId);
    let base = amount;
    let dealt = 0;

    for (const [pool, k] of [['shield', 's'], ['armor', 'a'], ['health', 'h']]) {
      if (base <= 0) break;
      if (this[pool] <= 0 && pool !== 'health') continue;
      const m = (mult && mult[k]) || 1;
      const applied = base * m;
      if (applied < this[pool] || pool === 'health') {
        this[pool] -= applied;
        dealt += applied;
        base = 0;
      } else {
        dealt += this[pool];
        base -= this[pool] / m; // lo que sobra, en unidades de daño base
        this[pool] = 0;
      }
    }

    this.hitFlash = 0.12;
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
    }
    return dealt;
  }

  /** Añade daño a un depósito de veneno; se drena poco a poco. */
  applyDot(type, amount) {
    if (this.dot[type] !== undefined) this.dot[type] += amount;
  }

  /** La ralentización se acumula hasta un tope y decae con el tiempo. */
  applySlow(amount) {
    this.slow = Math.min(SLOW_CAP, this.slow + amount);
  }

  update(dt, time) {
    if (this.slow > 0) this.slow = Math.max(0, this.slow - SLOW_DECAY * dt);
    if (this.hitFlash > 0) this.hitFlash -= dt;
    // Fase de zancada: avanza con la velocidad real, así los ralentizados
    // también se mueven a cámara lenta en vez de seguir agitándose igual.
    this.gait += this.speed * dt * 2.6;

    // Venenos: drenan su depósito y bloquean la regeneración de su capa afín.
    for (const type in this.dot) {
      const pool = this.dot[type];
      if (pool <= 0) continue;
      const tick = Math.min(pool, Math.max(1, pool * DOT_DRAIN) * dt);
      this.dot[type] -= tick;
      this.damage(tick, DOT_AFFINITY[type]);
      if (!this.alive) return;
    }

    const regen = this.def.regen;
    if (regen) {
      for (const pool in regen) {
        const blocked = Object.entries(DOT_BLOCKS)
          .some(([dotType, target]) => target === pool && this.dot[dotType] > 0);
        if (blocked) continue;
        const max = pool === 'health' ? this.maxHealth : pool === 'armor' ? this.maxArmor : this.maxShield;
        if (this[pool] < max) this[pool] = Math.min(max, this[pool] + max * regen[pool] * dt);
      }
    }

    const step = this.speed * dt;
    const cells = this.path;
    let remaining = step;
    while (remaining > 0 && this.idx < cells.length - 1) {
      const a = cells[this.idx], b = cells[this.idx + 1];
      const segLen = Math.hypot(b.wx - a.wx, b.wz - a.wz) || TILE;
      const advance = remaining / segLen;
      if (this.t + advance >= 1) {
        remaining -= (1 - this.t) * segLen;
        this.t = 0;
        this.idx++;
      } else {
        this.t += advance;
        remaining = 0;
      }
    }
    if (this.idx >= cells.length - 1) {
      this.reachedCore = true;
      this.alive = false;
      return;
    }
    const a = cells[this.idx], b = cells[this.idx + 1];
    const nx = b.wx - a.wx, nz = b.wz - a.wz;
    const len = Math.hypot(nx, nz) || 1;
    // Desplazamiento lateral: evita que toda la oleada vaya en fila india.
    const px = -nz / len, pz = nx / len;
    const off = this.lane * TILE * 0.3;
    this.x = a.wx + nx * this.t + px * off;
    this.z = a.wz + nz * this.t + pz * off;
    this.y = a.wy + (b.wy - a.wy) * this.t;
    if (this.flying) this.y += this.flyHeight + Math.sin(time * 2.5 + this.lane * 4) * 0.35;
    this.heading = Math.atan2(nx, nz);
  }
}

export class EnemySystem {
  constructor(scene) {
    this.list = [];
    this.pool = [];
    // Un lote para el cuerpo y otro para las extremidades de cada especie: las
    // extremidades necesitan su propia transformación para poder animarse.
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68, metalness: 0.18 });
    this.models = buildEnemyModels();
    this.batches = this.models.map((m) => new InstancedBatch(m.body, mat, 512).addTo(scene));
    this.limbs = this.models.map((m) => new InstancedBatch(m.limb, mat, 1024).addTo(scene));
    this._dummy = new THREE.Object3D();

    const bar = new THREE.PlaneGeometry(1, 1);
    const barMat = new THREE.MeshBasicMaterial({ toneMapped: false, depthWrite: false });
    this.bars = new InstancedBatch(bar, barMat, 2048, { shadows: false }).addTo(scene);
    this.bars.mesh.renderOrder = 5;

    // Lado de la celda del índice espacial: del orden del alcance típico de una
    // torre, para que una consulta toque pocas celdas y cada una tenga pocos.
    this._cellSize = 8;
    this._index = null;
  }

  spawn(def, route, wave, sector, lane, mods) {
    const e = (this.pool.pop() || new Enemy()).spawn(def, route, wave, sector, lane, mods);
    this.list.push(e);
    return e;
  }

  get count() {
    return this.list.length;
  }

  /** Se inyecta desde el juego para poder reventar al enemigo al morir. */
  setFX(fx) {
    this.fx = fx;
  }

  update(dt, time, goldPerTowerType = 1) {
    let gold = 0, killed = 0, leaked = 0, coreDamage = 0;
    const leakedDefs = [];

    for (const e of this.list) {
      if (!e.alive || !e.def.heal) continue;
      const r2 = e.def.heal.radius * e.def.heal.radius;
      for (const o of this.list) {
        if (o === e || !o.alive || o.health >= o.maxHealth) continue;
        const dx = o.x - e.x, dz = o.z - e.z;
        if (dx * dx + dz * dz < r2) {
          o.health = Math.min(o.maxHealth, o.health + o.maxHealth * e.def.heal.hps * dt);
        }
      }
    }

    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      e.update(dt, time);
      if (!e.alive) {
        if (e.reachedCore) {
          leaked++;
          coreDamage += e.def.coreDamage || 1;
          leakedDefs.push(e.def);
        } else {
          gold += e.gold + e.hitBy.size * goldPerTowerType;
          killed++;
          if (this.fx) {
            // Los grandes revientan con onda expansiva; los pequeños, sólo chispas.
            const s = e.size;
            if (s > 0.7) this.fx.explosion(e.x, e.y + 0.4, e.z, s * 2.2, e.def.color);
            else {
              this.fx.sparks(e.x, e.y + 0.5, e.z, Math.round(6 + s * 10), e.def.color, 4 + s * 4, 0.22, 0.42);
              this.fx.flash(e.x, e.y + 0.5, e.z, s * 1.6, e.def.color, 0.12);
            }
          }
        }
        const last = this.list.pop();
        if (i < this.list.length) this.list[i] = last;
        this.pool.push(e);
      }
    }
    return { gold, killed, leaked, coreDamage, leakedDefs };
  }

  /**
   * Rejilla espacial de los enemigos vivos.
   *
   * Sin ella cada torre recorre la lista entera en busca de objetivo: con 300
   * torres y 80 enemigos son 24.000 comprobaciones por frame, y es lo primero
   * que ahoga a un equipo modesto en las partidas largas. Se reconstruye una
   * vez por frame porque todos se mueven a la vez.
   */
  rebuildIndex() {
    const cell = this._cellSize;
    let map = this._index;
    if (!map) map = this._index = new Map();
    for (const bucket of map.values()) bucket.length = 0;

    for (const e of this.list) {
      if (!e.alive) continue;
      const k = ((Math.floor(e.x / cell) + 512) << 10) | (Math.floor(e.z / cell) + 512);
      let bucket = map.get(k);
      if (!bucket) map.set(k, (bucket = []));
      bucket.push(e);
    }
  }

  /** Recorre los enemigos de las celdas que solapan un círculo. */
  _forEachNear(x, z, radius, fn) {
    const cell = this._cellSize;
    const map = this._index;
    if (!map) { for (const e of this.list) fn(e); return; }
    const x0 = Math.floor((x - radius) / cell), x1 = Math.floor((x + radius) / cell);
    const z0 = Math.floor((z - radius) / cell), z1 = Math.floor((z + radius) / cell);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const bucket = map.get(((cx + 512) << 10) | (cz + 512));
        if (!bucket) continue;
        for (let i = 0; i < bucket.length; i++) fn(bucket[i]);
      }
    }
  }

  findTarget(x, z, range, minRange, targets, mode = 'first') {
    const r2 = range * range, min2 = minRange * minRange;
    let best = null, bestScore = -Infinity;
    this._forEachNear(x, z, range, (e) => {
      if (!e.alive) return;
      if (targets === 'ground' && e.flying) return;
      if (targets === 'air' && !e.flying) return;
      const dx = e.x - x, dz = e.z - z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2 || d2 < min2) return;
      let score;
      switch (mode) {
        case 'strong': score = e.totalHp; break;
        case 'weak': score = -e.totalHp; break;
        case 'close': score = -d2; break;
        case 'fast': score = e.speed; break;
        default: score = e.progress;
      }
      if (score > bestScore) { bestScore = score; best = e; }
    });
    return best;
  }

  queryRadius(x, z, radius, out = []) {
    out.length = 0;
    const r2 = radius * radius;
    this._forEachNear(x, z, radius, (e) => {
      if (!e.alive) return;
      const dx = e.x - x, dz = e.z - z;
      if (dx * dx + dz * dz < r2) out.push(e);
    });
    return out;
  }

  render(cameraYaw) {
    for (const b of this.batches) b.begin();
    for (const b of this.limbs) b.begin();
    this.bars.begin();
    const c = new THREE.Color();
    const d = this._dummy;

    for (const e of this.list) {
      const b = this.batches[e.def.shape];
      // El modelo ya trae sus colores de material, así que el color de instancia
      // sólo tiñe: identifica la especie sin borrar el metal, el cuero y la piel.
      c.setHex(e.def.color);
      let r = 0.58 + c.r * 0.82, g = 0.58 + c.g * 0.82, bl = 0.58 + c.b * 0.82;
      if (e.hitFlash > 0) { r = g = bl = 2.4; }
      else if (e.slow > 0.05) { r *= 0.6; g *= 0.9; bl *= 1.7; }
      else if (e.dot.poison > 0) { r *= 0.7; g *= 1.5; bl *= 0.6; }
      else if (e.dot.burn > 0) { r *= 1.7; g *= 0.85; bl *= 0.4; }

      // Los enemigos van algo sobreescalados respecto a la casilla: a tamaño
      // "realista" son puntitos indistinguibles con la cámara alejada.
      const s = e.size * 1.45;
      // Bamboleo de marcha: se aplasta y se estira al ritmo de su velocidad, lo
      // que basta para que la horda no parezca un montón de piezas deslizándose.
      const gait = e.gait || 0;
      const bounce = Math.abs(Math.sin(gait));
      const sy = s * (1 + bounce * 0.10 - 0.05);
      const sxz = s * (1 - bounce * 0.05 + 0.025);
      const lean = Math.sin(gait * 0.5) * 0.07;
      const rot = e.heading + lean;
      const by = e.y + bounce * 0.09 * s;
      b.push(e.x, by, e.z, sxz, sy, sxz, rot, r, g, bl);

      // Extremidades: dos instancias espejadas que alternan la zancada, o baten
      // si son alas. Es lo que separa "una figura que se desliza" de algo que
      // camina o vuela.
      const model = this.models[e.def.shape];
      const limbBatch = this.limbs[e.def.shape];
      const [lx, ly, lz] = model.limbAt;
      const cosR = Math.cos(rot), sinR = Math.sin(rot);
      for (const side of [-1, 1]) {
        const phase = gait + (side > 0 ? Math.PI : 0);
        const ox = lx * side;
        let oy = ly, oz = lz, pitch = 0, roll = 0;

        if (model.kind === 'wing') {
          // Batido: giro sobre el eje de avance, más marcado hacia arriba.
          roll = side * (0.5 + Math.sin(phase * 2.2) * 0.85);
          oy += Math.sin(phase * 2.2) * 0.05;
        } else {
          const swing = Math.sin(phase);
          pitch = swing * 0.55;
          oz += swing * 0.16;
          oy -= Math.max(0, -swing) * 0.06; // la pierna atrasada baja
        }

        d.position.set(
          e.x + (ox * cosR + oz * sinR) * s,
          by + oy * s,
          e.z + (-ox * sinR + oz * cosR) * s,
        );
        // Orden YXZ: primero encara el cuerpo, luego zancada y batido, que es
        // como se compone de forma natural. `roll` ya lleva el espejado.
        d.rotation.order = 'YXZ';
        d.rotation.set(pitch, rot, roll);
        d.scale.setScalar(s);
        d.updateMatrix();
        limbBatch.pushMatrix(d.matrix, r, g, bl);
      }

      // Tres barras apiladas: escudo (azul), armadura (gris), salud (verde/rojo).
      const dmgd = e.health < e.maxHealth || e.armor < e.maxArmor || e.shield < e.maxShield;
      if (dmgd || e.def.boss) {
        const w = 1.8 * s;
        const by = e.y + 1.5 * s + 0.5;
        const layers = [
          [e.health / e.maxHealth, 0.35, 0.85, 0.30],
          [e.maxArmor > 0 ? e.armor / e.maxArmor : 0, 0.72, 0.72, 0.78],
          [e.maxShield > 0 ? e.shield / e.maxShield : 0, 0.35, 0.72, 1.0],
        ];
        let row = 0;
        for (const [frac, cr, cg, cb] of layers) {
          if (frac <= 0 && row > 0) continue;
          const y = by + row * 0.17;
          // Fondo gris, no negro: en negro puro las barras parecen agujeros en el mapa.
          this.bars.push(e.x, y, e.z, w, 0.14, 1, cameraYaw, 0.16, 0.15, 0.19);
          if (frac > 0) {
            this.bars.push(e.x - w * (1 - frac) / 2, y, e.z, w * frac, 0.10, 1, cameraYaw, cr, cg, cb);
          }
          row++;
        }
      }
    }

    for (const b of this.batches) b.end();
    for (const b of this.limbs) b.end();
    this.bars.end();
  }

  clear() {
    for (const e of this.list) { e.alive = false; this.pool.push(e); }
    this.list.length = 0;
  }
}

export function pickEnemyDef(rng, wave) {
  const avail = ENEMY_DEFS.filter((d) => d.from <= wave);
  const weights = avail.map((d) => d.weight * Math.min(1, 0.35 + (wave - d.from) * 0.12));
  return avail[rng.weighted(weights)];
}
