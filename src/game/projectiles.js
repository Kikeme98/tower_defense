import * as THREE from 'three';
import { InstancedBatch } from '../engine/instanced.js';

/**
 * Proyectiles. Tres comportamientos:
 *  - bullet: persigue a su objetivo (impacto garantizado salvo evasión)
 *  - arc:    parábola hacia un punto predicho, estalla al aterrizar
 *  - pierce: línea recta que atraviesa varios enemigos
 */
export class ProjectileSystem {
  constructor(scene, enemies, fx) {
    this.enemies = enemies;
    this.fx = fx;
    this.list = [];
    this.pool = [];
    this._hits = [];

    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    this.batch = new InstancedBatch(
      new THREE.SphereGeometry(0.5, 6, 5), mat, 1024, { shadows: false },
    ).addTo(scene);
    this.boltBatch = new InstancedBatch(
      new THREE.BoxGeometry(0.12, 0.12, 1), mat, 512, { shadows: false },
    ).addTo(scene);
    this._dummy = new THREE.Object3D();
    this._c = new THREE.Color();
  }

  spawn(opts) {
    const p = this.pool.pop() || {};
    Object.assign(p, {
      type: 'bullet', splash: 0, slow: 0, dot: null, pierce: 0, target: null,
      color: 0xffdd88, size: 0.28, life: 4, vs: null, towerId: null,
      ...opts,
    });
    p.hits = p.hits || new Set();
    p.hits.clear();
    p.t = 0;
    this.list.push(p);
    return p;
  }

  update(dt) {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= dt;
      let done = false;

      // Estela a intervalos fijos, no por frame: así no depende del framerate
      // ni satura el sistema de partículas con proyectiles rápidos.
      p.trailAcc = (p.trailAcc || 0) + dt;
      if (p.trailAcc > 0.02) {
        p.trailAcc = 0;
        this.fx.trail(p.x, p.y, p.z, p.color, p.size * 0.8, 0.18);
      }

      if (p.type === 'arc') {
        p.t += dt / p.duration;
        const k = Math.min(1, p.t);
        p.x = p.x0 + (p.tx - p.x0) * k;
        p.z = p.z0 + (p.tz - p.z0) * k;
        p.y = p.y0 + (p.ty - p.y0) * k + Math.sin(k * Math.PI) * p.height;
        if (p.t >= 1) { this._impact(p, p.tx, p.ty, p.tz, null); done = true; }
      } else if (p.type === 'pierce') {
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        for (const e of this.enemies.list) {
          if (!e.alive || p.hits.has(e)) continue;
          if (p.targets === 'ground' && e.flying) continue;
          if (p.targets === 'air' && !e.flying) continue;
          const dx = e.x - p.x, dy = e.y + 0.6 - p.y, dz = e.z - p.z;
          const rr = e.size + 0.4;
          if (dx * dx + dy * dy + dz * dz < rr * rr) {
            p.hits.add(e);
            this._hitEnemy(p, e);
            this.fx.sparks(e.x, e.y + 0.6, e.z, 6, p.color, 5, 0.2, 0.3);
            this.fx.flash(e.x, e.y + 0.6, e.z, 0.55, p.color, 0.1);
            if (p.hits.size >= p.pierce) { done = true; break; }
          }
        }
      } else {
        // Homing suave: si el objetivo muere, sigue hasta su última posición.
        const tgt = p.target;
        if (tgt && tgt.alive) { p.tx = tgt.x; p.ty = tgt.y + 0.6; p.tz = tgt.z; }
        const dx = p.tx - p.x, dy = p.ty - p.y, dz = p.tz - p.z;
        const d = Math.hypot(dx, dy, dz);
        const step = p.speed * dt;
        if (d <= step + 0.2) {
          this._impact(p, p.tx, p.ty, p.tz, tgt && tgt.alive ? tgt : null);
          done = true;
        } else {
          p.x += (dx / d) * step; p.y += (dy / d) * step; p.z += (dz / d) * step;
          p.vx = dx / d; p.vy = dy / d; p.vz = dz / d;
        }
      }

      if (done || p.life <= 0) {
        const last = list.pop();
        if (i < list.length) list[i] = last;
        this.pool.push(p);
      }
    }
  }

  _hitEnemy(p, e, scale = 1) {
    // La evasión del espectro usa el generador global: no altera la simulación.
    if (e.def.dodge && Math.random() < e.def.dodge) return;
    const dmg = p.damage * scale;
    e.damage(dmg, p.vs, p.towerId);
    if (p.dot) e.applyDot(p.dot.type, dmg * p.dot.factor);
    if (p.slow) e.applySlow(p.slow);
  }

  _impact(p, x, y, z, direct) {
    if (p.splash > 0) {
      const hits = this.enemies.queryRadius(x, z, p.splash, this._hits);
      for (const e of hits) {
        if (p.targets === 'ground' && e.flying) continue;
        if (p.targets === 'air' && !e.flying) continue;
        const d = Math.hypot(e.x - x, e.z - z);
        this._hitEnemy(p, e, 1 - 0.45 * (d / p.splash)); // el centro duele más
      }
      this.fx.explosion(x, y, z, p.splash, p.color);
    } else if (direct) {
      this._hitEnemy(p, direct);
      this.fx.sparks(x, y, z, 7, p.color, 5.5, 0.2, 0.32);
      this.fx.flash(x, y, z, 0.6, p.color, 0.1);
    }
  }

  render() {
    const b = this.batch, bolt = this.boltBatch;
    b.begin(); bolt.begin();
    const d = this._dummy, c = this._c;
    for (const p of this.list) {
      c.setHex(p.color);
      if (p.type === 'pierce') {
        d.position.set(p.x, p.y, p.z);
        d.lookAt(p.x + p.vx, p.y + p.vy, p.z + p.vz);
        d.scale.set(1.4, 1.4, 2.2);
        d.updateMatrix();
        bolt.pushMatrix(d.matrix, c.r, c.g, c.b);
      } else {
        const s = p.size;
        b.push(p.x, p.y, p.z, s, s, s, 0, c.r, c.g, c.b);
      }
    }
    b.end(); bolt.end();
  }

  clear() {
    for (const p of this.list) this.pool.push(p);
    this.list.length = 0;
  }
}
