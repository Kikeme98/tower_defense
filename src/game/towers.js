import * as THREE from 'three';
import { InstancedBatch } from '../engine/instanced.js';
import { TERRAIN, T, isBuildable } from '../world/grid.js';
import { TOWER_DEFS, TOWERS, UPGRADE_PATHS } from './tower-defs.js';

/** Posición estimada del enemigo dentro de `t` segundos: sin esto los proyectiles lentos siempre fallan. */
function predict(e, t) {
  const h = e.heading || 0;
  return [e.x + Math.sin(h) * e.speed * t, e.y, e.z + Math.cos(h) * e.speed * t];
}

/**
 * Crítico escalonado: la probabilidad se reparte en tramos de 50%, y cada tramo
 * desbloquea un multiplicador mayor. Se tira del más alto al más bajo, así
 * acumular probabilidad nunca es un desperdicio.
 */
function rollCrit(chance, bonus, rng) {
  if (chance <= 0) return 1;
  const p4 = Math.min(0.5, Math.max(0, chance - 1.0));
  const p3 = Math.min(0.5, Math.max(0, chance - 0.5));
  const p2 = Math.min(0.5, Math.max(0, chance));
  if (p4 > 0 && rng.next() < p4) return 4 + bonus;
  if (p3 > 0 && rng.next() < p3) return 3 + bonus;
  if (p2 > 0 && rng.next() < p2) return 2 + bonus;
  return 1;
}

export class Tower {
  constructor(def, cell) {
    this.def = def;
    this.cell = cell;
    this.x = cell.wx;
    this.y = cell.wy;
    this.z = cell.wz;
    this.levels = { damage: 0, range: 0, fireRate: 0, special: 0 };
    this.cooldown = 0;
    this.angle = 0;
    this.target = null;
    this.recoil = 0;
    this.kills = 0;
    this.damageDealt = 0;
    this.invested = def.cost;
    this.beamTime = 0;
    // Se calculan ya con valores base: seleccionar la torre en el mismo frame
    // en que se construye leería un objeto vacío y reventaría el panel.
    this.stats = {};
    this.recompute({}, {});
  }

  get totalLevel() {
    return this.levels.damage + this.levels.range + this.levels.fireRate + this.levels.special;
  }

  upgradeCost(pathId) {
    const path = UPGRADE_PATHS.find((p) => p.id === pathId);
    const lvl = this.levels[pathId];
    if (lvl >= path.max) return null;
    // Coste aritmético: 1×, 2×, 3×… Mejorar sigue siendo viable en oleadas altas.
    return Math.round(this.def.cost * path.costMult * (lvl + 1));
  }

  recompute(global, aura) {
    const d = this.def;
    const terrain = TERRAIN[this.cell.terrain].mods || {};
    const paths = Object.fromEntries(UPGRADE_PATHS.map((p) => [p.id, p]));

    const mult = (stat) => {
      const p = paths[stat];
      const up = p && p.mult ? Math.pow(p.mult, this.levels[stat]) : 1;
      return up * (terrain[stat] || 1) * (global[stat] || 1) * (aura[stat] || 1);
    };

    const sp = this.levels.special;
    const height = Math.max(0, this.cell.height);
    const s = this.stats;

    s.damage = d.damage * mult('damage');
    // La elevación da daño y alcance: el terreno alto es territorio disputado.
    s.damage *= 1 + height * (0.05 + (global.synergy?.height || 0));
    s.range = d.range * mult('range') * (1 + height * 0.045);
    s.fireRate = d.fireRate * mult('fireRate');
    s.minRange = d.minRange || 0;
    s.splash = (d.splash || 0) * (global.splash || 1);
    s.pierce = d.pierce || 0;
    s.chain = d.chain ? { ...d.chain } : null;
    s.slow = d.slow || 0;
    s.dot = d.dot ? { ...d.dot } : null;
    s.aura = d.aura ? { ...d.aura } : null;
    s.rampMax = d.rampUp ? d.rampUp.max : 1;
    s.salvo = 1;
    s.critChance = global.critChance || 0;
    s.critBonus = global.critBonus || 0;
    s.vs = {
      h: (d.vs?.h ?? 1) * (global.vsHealth || 1),
      a: (d.vs?.a ?? 1) * (global.vsArmor || 1),
      s: (d.vs?.s ?? 1) * (global.vsShield || 1),
    };

    switch (d.special?.id) {
      case 'pierce':
        s.pierce = (d.pierce || 0) + sp * (d.id === 'ballista' ? 2 : 1);
        if (d.id === 'ballista') s.damage *= Math.pow(1.25, sp);
        break;
      case 'splash': s.splash *= 1 + 0.35 * sp; s.damage *= 1 + 0.15 * sp; break;
      case 'freeze': s.slow *= 1 + 0.40 * sp; break;
      case 'chain':
        if (s.chain) {
          s.chain.count += sp;
          s.chain.falloff = Math.min(0.95, s.chain.falloff + 0.05 * sp);
        }
        break;
      case 'dot': if (s.dot) s.dot.factor *= 1 + 0.50 * sp; break;
      case 'salvo': s.salvo = 1 + Math.floor(sp / 2); break;
      case 'flak': s.damage *= 1 + 0.30 * sp; s.splash *= 1 + 0.30 * sp; break;
      case 'ramp': s.rampMax += 0.5 * sp; break;
      case 'aura':
        if (s.aura) for (const k in s.aura) s.aura[k] = 1 + (s.aura[k] - 1) * (1 + 0.08 * sp);
        break;
      case 'reel': s.slow *= 1 + 0.50 * sp; s.damage *= 1 + 0.20 * sp; break;
    }

    if (s.dot) s.dot.factor *= global.dotMult || 1;

    // DPS orientativo para el panel: daño medio contra la capa más gruesa.
    const avgVs = (s.vs.h + s.vs.a + s.vs.s) / 3;
    const critAvg = 1 + Math.min(0.5, s.critChance) * (1 + s.critBonus);
    s.dps = s.damage * (s.fireRate || 0) * avgVs * critAvg;
  }

  update(dt, ctx) {
    const s = this.stats;
    if (this.def.aura) return; // los pilones no disparan
    if (!s.fireRate) return;

    const { enemies } = ctx;
    const t = this.target;
    if (t && (!t.alive || this._outOfRange(t, s))) this.target = null;
    if (!this.target) {
      this.target = enemies.findTarget(this.x, this.z, s.range, s.minRange, this.def.targets, ctx.targetMode);
      this.beamTime = 0;
    }
    if (!this.target) { this.recoil *= Math.max(0, 1 - dt * 8); return; }

    const tgt = this.target;
    const want = Math.atan2(tgt.x - this.x, tgt.z - this.z);
    let diff = want - this.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.angle += diff * Math.min(1, dt * 12);

    if (this.def.beam) {
      this.beamTime += dt;
      const ramp = Math.min(s.rampMax, 1 + this.beamTime * (this.def.rampUp.perSec || 0.8));
      const raw = s.damage * s.fireRate * dt * ramp;
      this.damageDealt += tgt.damage(raw, s.vs, this.def.id);
      if (s.dot) tgt.applyDot(s.dot.type, raw * s.dot.factor);
      if (s.slow) tgt.applySlow(s.slow * dt);
      ctx.fx.beam(this.x, this.y + 1.1, this.z, tgt.x, tgt.y + 0.6, tgt.z,
        this.def.accent, 0.05, 0.1 + ramp * 0.05);
      if (!tgt.alive) { this.kills++; this.target = null; }
      return;
    }

    this.recoil *= Math.max(0, 1 - dt * 8);
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    this.cooldown = 1 / s.fireRate;
    this._shoot(ctx, tgt, s);
  }

  _outOfRange(t, s) {
    const dx = t.x - this.x, dz = t.z - this.z;
    const d2 = dx * dx + dz * dz;
    return d2 > s.range * s.range || d2 < s.minRange * s.minRange;
  }

  _shoot(ctx, tgt, s) {
    const { projectiles, fx, rng } = ctx;
    const d = this.def;
    const my = this.y + 1.0;
    this.recoil = 1;

    const dmg = s.damage * rollCrit(s.critChance, s.critBonus, rng);
    const payload = {
      damage: dmg, vs: s.vs, slow: s.slow, dot: s.dot,
      towerId: d.id, targets: d.targets, color: d.accent,
    };

    if (d.chain) {
      let cur = tgt, px = this.x, py = my, pz = this.z;
      let power = dmg;
      const hit = new Set();
      for (let i = 0; i < s.chain.count && cur; i++) {
        hit.add(cur);
        this.damageDealt += cur.damage(power, s.vs, d.id);
        if (s.dot) cur.applyDot(s.dot.type, power * s.dot.factor);
        if (s.slow) cur.applySlow(s.slow);
        fx.beam(px, py, pz, cur.x, cur.y + 0.6, cur.z, d.accent, 0.14, 0.16);
        fx.burst(cur.x, cur.y + 0.6, cur.z, 4, d.accent, 5, 0.14, 0.25);
        px = cur.x; py = cur.y + 0.6; pz = cur.z;
        power *= s.chain.falloff;
        let next = null, bd = 36;
        for (const e of ctx.enemies.list) {
          if (!e.alive || hit.has(e)) continue;
          if (d.targets === 'ground' && e.flying) continue;
          const dd = (e.x - px) ** 2 + (e.z - pz) ** 2;
          if (dd < bd) { bd = dd; next = e; }
        }
        cur = next;
      }
      return;
    }

    if (d.arc) {
      for (let i = 0; i < s.salvo; i++) {
        const flight = Math.hypot(tgt.x - this.x, tgt.z - this.z) / d.projSpeed;
        const [px, , pz] = predict(tgt, flight);
        const spread = i === 0 ? 0 : rng.float(-1.8, 1.8);
        projectiles.spawn({
          ...payload, type: 'arc',
          x: this.x, y: my, z: this.z, x0: this.x, y0: my, z0: this.z,
          tx: px + spread, ty: tgt.y, tz: pz + spread,
          duration: Math.max(0.35, flight), height: 6 + flight * 3,
          splash: s.splash, size: 0.34,
        });
      }
      this._muzzle(fx, my, s);
      return;
    }

    if (s.pierce > 0) {
      const flight = Math.hypot(tgt.x - this.x, tgt.z - this.z) / d.projSpeed;
      const [px, , pz] = predict(tgt, flight);
      const dx = px - this.x, dy = tgt.y + 0.6 - my, dz = pz - this.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      projectiles.spawn({
        ...payload, type: 'pierce',
        x: this.x, y: my, z: this.z,
        vx: dx / len * d.projSpeed, vy: dy / len * d.projSpeed, vz: dz / len * d.projSpeed,
        pierce: s.pierce + 1, life: s.range / d.projSpeed + 0.3,
      });
      this._muzzle(fx, my, s);
      return;
    }

    projectiles.spawn({
      ...payload,
      x: this.x, y: my, z: this.z, target: tgt,
      tx: tgt.x, ty: tgt.y + 0.6, tz: tgt.z,
      speed: d.projSpeed, splash: s.splash, size: s.splash ? 0.32 : 0.22,
    });
    this._muzzle(fx, my, s);
  }

  /** Fogonazo en la boca del cañón: destello, chispas y humo si es artillería. */
  _muzzle(fx, my, s) {
    const d = this.def;
    const mx = this.x + Math.sin(this.angle) * 0.95;
    const mz = this.z + Math.cos(this.angle) * 0.95;
    const heavy = (s.splash || 0) > 1.5;
    fx.flash(mx, my, mz, heavy ? 1.0 : 0.55, d.accent, heavy ? 0.14 : 0.09);
    fx.sparks(mx, my, mz, heavy ? 6 : 3, d.accent, heavy ? 5 : 3, 0.14, 0.2);
    if (heavy) fx.puff(mx, my, mz, 2, 0x6a6560, 0.5, 0.5, 0.7);
  }
}

export class TowerSystem {
  constructor(scene) {
    this.towers = [];
    this.dirty = true;
    this.ghost = null;
    this.counts = {};
    this.batches = {};
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.25 });
    const ghostMat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.45, depthWrite: false,
    });
    for (const def of TOWER_DEFS) {
      const { base, head } = def.geo();
      // Las cabezas se modelan con el cañón hacia -Z porque es lo natural al
      // escribir las piezas, pero el apuntado usa atan2(dx, dz), que orienta el
      // +Z del modelo hacia el objetivo. Sin esta media vuelta todas las torres
      // disparan de espaldas.
      head.rotateY(Math.PI);
      this.batches[def.id] = {
        base: new InstancedBatch(base, mat, 64).addTo(scene),
        head: new InstancedBatch(head, mat, 64).addTo(scene),
        ghostBase: new InstancedBatch(base.clone(), ghostMat, 2, { shadows: false }).addTo(scene),
        ghostHead: new InstancedBatch(head.clone(), ghostMat, 2, { shadows: false }).addTo(scene),
      };
    }
    this.unlocked = new Set(TOWER_DEFS.filter((d) => !d.unlock).map((d) => d.id));
  }

  countOf(id) {
    return this.counts[id] || 0;
  }

  /** Precio actual: sube con cada torre del mismo tipo ya construida. */
  priceOf(def) {
    return def.cost + (def.priceStep || 0) * this.countOf(def.id);
  }

  canPlace(cell, def) {
    if (!cell || cell.tower) return false;
    if (cell.terrain === T.WATER) return !!def.amphibious;
    return isBuildable(cell.terrain);
  }

  place(def, cell) {
    const t = new Tower(def, cell);
    cell.tower = t;
    this.towers.push(t);
    this.counts[def.id] = this.countOf(def.id) + 1;
    this.dirty = true;
    return t;
  }

  sell(tower) {
    tower.cell.tower = null;
    const i = this.towers.indexOf(tower);
    if (i >= 0) this.towers.splice(i, 1);
    this.counts[tower.def.id] = Math.max(0, this.countOf(tower.def.id) - 1);
    this.dirty = true;
  }

  upgrade(tower, pathId) {
    tower.levels[pathId]++;
    this.dirty = true;
  }

  recomputeAll(global, grid) {
    const pylons = this.towers.filter((t) => t.def.aura);
    for (const p of pylons) p.recompute(global, {});
    const syn = global.synergy || {};

    for (const t of this.towers) {
      const aura = {};
      const mul = (k, v) => { aura[k] = (aura[k] || 1) * v; };

      if (!t.def.aura) {
        for (const p of pylons) {
          const d2 = (p.x - t.x) ** 2 + (p.z - t.z) ** 2;
          if (d2 > p.stats.range * p.stats.range) continue;
          for (const k in p.stats.aura) mul(k, p.stats.aura[k]);
        }
      }
      if (syn.forest && t.cell.terrain === T.FOREST) mul('damage', 1 + syn.forest);
      if (grid) {
        let adj = 0, feature = 1;
        for (const c of grid.neighbors(t.cell.x, t.cell.y)) {
          if (c.tower) adj++;
          if (c.feature === 'obelisk') feature *= 1.18;
        }
        if (syn.adjacency && adj) mul('fireRate', 1 + syn.adjacency * adj);
        if (feature !== 1) mul('damage', feature);
      }
      t.recompute(global, aura);
    }
    this.dirty = false;
  }

  update(dt, ctx) {
    if (this.dirty) this.recomputeAll(ctx.global, ctx.grid);
    for (const t of this.towers) t.update(dt, ctx);
  }

  render(time) {
    for (const id in this.batches) {
      const b = this.batches[id];
      b.base.begin(); b.head.begin(); b.ghostBase.begin(); b.ghostHead.begin();
    }
    for (const t of this.towers) {
      const b = this.batches[t.def.id];
      const lvl = t.totalLevel;
      // Las torres mejoradas crecen y aclaran: se lee su nivel de un vistazo.
      let grow = 1 + Math.min(lvl, 24) * 0.016;

      // Aparición: sale del suelo con un rebote corto al construirse.
      let rise = 0;
      if (t.bornAt !== undefined) {
        const age = (time - t.bornAt) / 0.42;
        if (age < 1) {
          const e = 1 - Math.pow(1 - age, 3);
          rise = (1 - e) * -1.8;
          grow *= 0.4 + e * 0.6 + Math.sin(age * Math.PI) * 0.16;
        } else {
          t.bornAt = undefined;
        }
      }

      b.base.push(t.x, t.y + rise, t.z, grow, grow, grow, 0, 1, 1, 1);
      const back = t.recoil * 0.22;
      const bob = t.def.aura ? Math.sin(time * 2 + t.x) * 0.06 : 0;
      // Retroceso: además de echarse atrás, se achata un poco.
      const squash = 1 - t.recoil * 0.13;
      const tint = 1 + Math.min(lvl, 24) * 0.018 + t.recoil * 0.5;
      b.head.push(
        t.x - Math.sin(t.angle) * back, t.y + 0.75 + bob + rise, t.z - Math.cos(t.angle) * back,
        grow * (2 - squash), grow * squash, grow * (2 - squash), t.angle, tint, tint, tint,
      );
    }
    if (this.ghost) {
      const { def, cell, valid } = this.ghost;
      const b = this.batches[def.id];
      const c = valid ? [0.7, 1, 0.8] : [1, 0.45, 0.45];
      b.ghostBase.push(cell.wx, cell.wy, cell.wz, 1, 1, 1, 0, ...c);
      b.ghostHead.push(cell.wx, cell.wy + 0.75, cell.wz, 1, 1, 1, 0, ...c);
    }
    for (const id in this.batches) {
      const b = this.batches[id];
      b.base.end(); b.head.end(); b.ghostBase.end(); b.ghostHead.end();
    }
  }

  clear() {
    for (const t of this.towers) t.cell.tower = null;
    this.towers.length = 0;
    this.counts = {};
    this.ghost = null;
    this.unlocked = new Set(TOWER_DEFS.filter((d) => !d.unlock).map((d) => d.id));
    this.dirty = true;
  }
}
