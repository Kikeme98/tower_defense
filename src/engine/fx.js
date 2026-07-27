import * as THREE from 'three';
import { ParticleSystem, SPRITE } from './particles.js';

/**
 * Biblioteca de efectos. Dos sistemas de partículas: uno aditivo para lo que
 * emite luz (chispas, destellos, ondas) y otro con mezcla normal para el humo,
 * que debe poder oscurecer el fondo en vez de aclararlo siempre.
 *
 * Los rayos y estelas siguen siendo geometría, no billboards, porque necesitan
 * unir dos puntos concretos del mundo.
 */
export class FX {
  constructor(scene) {
    this.glow = new ParticleSystem(scene, { capacity: 3000, additive: true });
    this.smoke = new ParticleSystem(scene, { capacity: 1200, additive: false });

    // Rayos: un núcleo brillante y un halo más ancho y tenue alrededor.
    const beamMat = (opacity, blending) => new THREE.MeshBasicMaterial({
      vertexColors: true, toneMapped: false, transparent: true,
      opacity, blending, depthWrite: false,
    });
    this.beams = [];
    this.beamCore = this._beamBatch(scene, beamMat(1, THREE.AdditiveBlending));
    this.beamHalo = this._beamBatch(scene, beamMat(0.35, THREE.AdditiveBlending));

    this._dummy = new THREE.Object3D();
    this._c = new THREE.Color();
    this._scale = 1;
  }

  /**
   * Escala la cantidad de partículas. Los efectos siguen apareciendo —quitarlos
   * del todo se nota mucho más que verlos con menos densidad— pero emiten menos.
   */
  setQuality(preset) {
    this._scale = preset.particleScale;
    this.glow.capacity = Math.min(3000, preset.maxParticles);
    this.smoke.capacity = Math.min(1200, Math.round(preset.maxParticles * 0.4));
  }

  /** Cantidad efectiva, con al menos una partícula si el efecto se pidió. */
  _n(count) {
    return Math.max(1, Math.round(count * this._scale));
  }

  _beamBatch(scene, material) {
    const geo = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, true);
    geo.rotateX(Math.PI / 2); // eje a lo largo de Z, que es lo que orienta lookAt
    const mesh = new THREE.InstancedMesh(geo, material, 256);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(256 * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = 19;
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  }

  // --- Emisores ---

  /** Chispas: trozos rápidos y luminosos que rebotan y se apagan. */
  sparks(x, y, z, count, color, speed = 7, size = 0.3, life = 0.45) {
    const n = this._n(count);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const p = Math.random() * Math.PI * 0.5;
      const s = speed * (0.35 + Math.random());
      this.glow.emit({
        x, y, z,
        vx: Math.cos(a) * Math.cos(p) * s,
        vy: Math.sin(p) * s * 1.1 + speed * 0.2,
        vz: Math.sin(a) * Math.cos(p) * s,
        gravity: -16, drag: 1.6, floor: 0.08,
        size: size * (0.6 + Math.random() * 0.8), sizeEnd: 0.02,
        color, colorEnd: 0x40200c,
        alpha: 1, alphaEnd: 0,
        life: life * (0.6 + Math.random() * 0.8),
        sprite: SPRITE.SPARK,
      });
    }
  }

  /** Humo: bocanadas lentas que suben, crecen y se disipan. */
  puff(x, y, z, count, color = 0x6a6a72, spread = 1.2, size = 1.0, life = 1.1) {
    const n = this._n(count);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * spread;
      this.smoke.emit({
        x: x + Math.cos(a) * r * 0.4, y: y + Math.random() * 0.3, z: z + Math.sin(a) * r * 0.4,
        vx: Math.cos(a) * r * 0.8, vy: 0.7 + Math.random() * 0.9, vz: Math.sin(a) * r * 0.8,
        drag: 1.1, gravity: 0.35,
        size: size * (0.5 + Math.random() * 0.5), sizeEnd: size * (1.6 + Math.random()),
        color, colorEnd: 0x2a2a32,
        alpha: 0.5, alphaEnd: 0,
        rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 1.2,
        life: life * (0.7 + Math.random() * 0.6),
        sprite: SPRITE.SMOKE,
      });
    }
  }

  /** Destello puntual: el fogonazo de un disparo o un impacto. */
  flash(x, y, z, size, color, life = 0.16) {
    this.glow.emit({
      x, y, z, size: size * 1.5, sizeEnd: size * 0.2,
      color, alpha: 1, alphaEnd: 0, life,
      rot: Math.random() * 6.28, sprite: SPRITE.FLARE,
    });
  }

  /** Onda expansiva: anillo plano que se abre y se afina. */
  shockwave(x, y, z, radius, color, life = 0.45) {
    this.glow.emit({
      x, y: y + 0.35, z, size: radius * 0.5, sizeEnd: radius * 2.3,
      color, colorEnd: color, alpha: 0.85, alphaEnd: 0, life,
      sprite: SPRITE.RING, rot: Math.random() * 6.28,
    });
  }

  /** Explosión completa: destello, onda, chispas y humo. */
  explosion(x, y, z, radius, color) {
    this.flash(x, y + 0.3, z, radius * 0.9, 0xffffff, 0.12);
    this.shockwave(x, y, z, radius, color, 0.42);
    this.sparks(x, y + 0.3, z, Math.round(8 + radius * 4), color, 5 + radius * 1.6, 0.3, 0.5);
    this.puff(x, y + 0.4, z, Math.round(3 + radius), 0x55505a, radius * 0.5, radius * 0.55, 1.0);
  }

  /** Estela: puntos que se quedan atrás y se desvanecen rápido. */
  trail(x, y, z, color, size = 0.22, life = 0.22) {
    this.glow.emit({
      x, y, z, size, sizeEnd: 0.01,
      color, colorEnd: color, alpha: 0.8, alphaEnd: 0, life,
      sprite: SPRITE.SPARK,
    });
  }

  /** Columna ascendente, para portales y apariciones. */
  column(x, y, z, count, color, height = 2.5, life = 0.9) {
    const n = this._n(count);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.5 + Math.random() * 0.6;
      this.glow.emit({
        x: x + Math.cos(a) * r, y: y + Math.random() * 0.4, z: z + Math.sin(a) * r,
        vx: -Math.cos(a) * 0.5, vy: height * (0.5 + Math.random() * 0.6), vz: -Math.sin(a) * 0.5,
        drag: 0.9,
        size: 0.3 + Math.random() * 0.25, sizeEnd: 0.02,
        color, alpha: 0.9, alphaEnd: 0,
        life: life * (0.6 + Math.random() * 0.7),
        sprite: SPRITE.SPARK,
      });
    }
  }

  beam(x1, y1, z1, x2, y2, z2, color, life = 0.12, width = 0.12) {
    if (this.beams.length > 220) this.beams.shift();
    this.beams.push({ x1, y1, z1, x2, y2, z2, color, life, maxLife: life, width });
  }

  // Alias conservados para no reescribir las llamadas del juego.
  burst(x, y, z, count, color, speed, size, life) {
    this.sparks(x, y, z, count, color, speed, size, life);
  }
  ring(x, y, z, radius, color, life) {
    this.shockwave(x, y, z, radius, color, life);
  }

  update(dt) {
    this.glow.update(dt);
    this.smoke.update(dt);
    for (let i = this.beams.length - 1; i >= 0; i--) {
      this.beams[i].life -= dt;
      if (this.beams[i].life <= 0) this.beams.splice(i, 1);
    }
  }

  render() {
    this.glow.flush();
    this.smoke.flush();

    const d = this._dummy;
    let n = 0;
    const core = this.beamCore, halo = this.beamHalo;
    for (const b of this.beams) {
      if (n >= 256) break;
      const k = Math.min(1, b.life / b.maxLife);
      const dx = b.x2 - b.x1, dy = b.y2 - b.y1, dz = b.z2 - b.z1;
      const len = Math.hypot(dx, dy, dz) || 0.001;
      d.position.set(b.x1 + dx / 2, b.y1 + dy / 2, b.z1 + dz / 2);
      d.lookAt(b.x2, b.y2, b.z2);
      const w = b.width * (0.4 + k * 0.6);
      d.scale.set(w, w, len);
      d.updateMatrix();
      core.setMatrixAt(n, d.matrix);
      d.scale.set(w * 3.2, w * 3.2, len);
      d.updateMatrix();
      halo.setMatrixAt(n, d.matrix);
      const c = this._c.setHex(b.color);
      core.instanceColor.setXYZ(n, 1 * k + c.r * k, 1 * k + c.g * k, 1 * k + c.b * k);
      halo.instanceColor.setXYZ(n, c.r * k, c.g * k, c.b * k);
      n++;
    }
    core.count = halo.count = n;
    core.instanceMatrix.needsUpdate = true;
    halo.instanceMatrix.needsUpdate = true;
    core.instanceColor.needsUpdate = true;
    halo.instanceColor.needsUpdate = true;
  }

  clear() {
    this.glow.clear();
    this.smoke.clear();
    this.beams.length = 0;
  }

  get particleCount() {
    return this.glow.count + this.smoke.count;
  }
}
