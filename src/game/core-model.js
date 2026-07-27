import * as THREE from 'three';
import { piece, merge, ring, BOX, CYL, CONE, TORUS, OCTA, SPH } from '../engine/geo.js';

/**
 * La ciudadela que hay que defender.
 *
 * Es lo único que el jugador mira cuando las cosas van mal, así que además de
 * tener presencia comunica su estado: el cristal y los anillos cambian de color
 * y de ritmo según la vida que queda, y la torre se sacude al recibir un golpe.
 * Así se sabe cómo va la partida sin apartar la vista del mapa.
 */

const STONE = 0x4a5570;
const STONE_DARK = 0x333c52;
const STONE_LIGHT = 0x6a769a;
const GOLD = 0xc9a04a;
const BANNER = 0x2f4f9e;

/** Parte fija: piedra, almenas, contrafuertes y estandartes. */
function buildStructure() {
  const parts = [];

  // Zócalo escalonado: asienta la torre en el terreno.
  parts.push(piece(BOX(3.4, 0.34, 3.4), STONE_DARK, [0, 0.17, 0]));
  parts.push(piece(BOX(2.9, 0.3, 2.9), STONE, [0, 0.48, 0]));
  parts.push(piece(CYL(1.25, 1.45, 0.4, 8), STONE_LIGHT, [0, 0.82, 0]));

  // Muralla baja con almenas alrededor del patio.
  parts.push(...ring(12, (a) => piece(
    BOX(0.42, 0.42, 0.3), STONE,
    [Math.cos(a) * 1.42, 1.16, Math.sin(a) * 1.42], [0, -a, 0],
  )));

  // Cuerpo de la torre, ligeramente troncocónico.
  parts.push(piece(CYL(0.78, 0.96, 2.5, 8), STONE, [0, 2.2, 0]));
  // Cornisa e hiladas: rompen la verticalidad lisa del cilindro.
  parts.push(piece(CYL(0.9, 0.9, 0.14, 8), STONE_DARK, [0, 1.6, 0]));
  parts.push(piece(CYL(0.86, 0.86, 0.12, 8), STONE_DARK, [0, 2.55, 0]));
  parts.push(piece(CYL(1.0, 0.86, 0.22, 8), STONE_LIGHT, [0, 3.5, 0]));

  // Contrafuertes: cuatro pilares inclinados que apuntalan el fuste.
  parts.push(...ring(4, (a) => piece(
    BOX(0.26, 1.9, 0.5), STONE_DARK,
    [Math.cos(a) * 1.05, 1.75, Math.sin(a) * 1.05], [0, -a, 0.12],
  )));

  // Almenas de coronación.
  parts.push(...ring(8, (a) => piece(
    BOX(0.28, 0.44, 0.24), STONE,
    [Math.cos(a) * 0.92, 3.82, Math.sin(a) * 0.92], [0, -a, 0],
  )));

  // Arcada superior: cuatro pilares que sostienen el cristal.
  parts.push(...ring(4, (a) => piece(
    CYL(0.09, 0.11, 1.15, 5), GOLD,
    [Math.cos(a) * 0.62, 4.4, Math.sin(a) * 0.62],
  )));
  parts.push(piece(TORUS(0.66, 0.07, 5, 16), GOLD, [0, 4.98, 0], [Math.PI / 2, 0, 0]));

  // Aguja y remate.
  parts.push(piece(CONE(0.3, 0.9, 6), STONE_LIGHT, [0, 5.5, 0]));
  parts.push(piece(SPH(0.12, 6), GOLD, [0, 6.05, 0]));

  // Estandartes colgando entre los contrafuertes.
  parts.push(...ring(4, (a, i) => piece(
    BOX(0.5, 0.9, 0.04), i % 2 ? BANNER : 0x8a3050,
    [Math.cos(a + 0.78) * 1.12, 2.35, Math.sin(a + 0.78) * 1.12], [0, -a - 0.78, 0],
  )));

  return merge(parts);
}

export class CoreModel {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    const stoneMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.82, metalness: 0.22,
    });
    this.structure = new THREE.Mesh(buildStructure(), stoneMat);
    this.structure.castShadow = true;
    this.structure.receiveShadow = true;
    this.group.add(this.structure);

    // Cristal: el corazón. Va sin mapeo de tonos para que destaque siempre.
    this.crystalMat = new THREE.MeshBasicMaterial({ color: 0x9fe4ff, toneMapped: false });
    this.crystal = new THREE.Mesh(OCTA(0.44), this.crystalMat);
    this.crystal.position.y = 4.42;
    this.group.add(this.crystal);

    // Halo alrededor del cristal. Discreto a propósito: con el resplandor del
    // postprocesado, una esfera grande se convierte en una bola blanca que
    // tapa el cristal y la arcada que hay debajo.
    this.haloMat = new THREE.MeshBasicMaterial({
      color: 0x6fd0ff, transparent: true, opacity: 0.13,
      toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.halo = new THREE.Mesh(SPH(0.52, 10), this.haloMat);
    this.halo.position.y = 4.42;
    this.group.add(this.halo);

    // Dos anillos orbitando en planos distintos: dan movimiento continuo y son
    // el indicador de salud más visible desde lejos.
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0x7dd8ff, transparent: true, opacity: 0.75,
      toneMapped: false, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.rings = [];
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(TORUS(0.95 + i * 0.28, 0.035, 5, 28), this.ringMat);
      m.position.y = 4.42;
      this.group.add(m);
      this.rings.push(m);
    }

    this._shake = 0;
    this._hue = new THREE.Color();
  }

  setPosition(x, y, z) {
    this.group.position.set(x, y, z);
    this._baseY = y;
  }

  /** Sacudida y destello al recibir un impacto. */
  hit() {
    this._shake = 1;
  }

  /**
   * @param {number} health fracción de vida del núcleo, de 0 a 1.
   */
  update(dt, time, health) {
    const hp = Math.max(0, Math.min(1, health));

    // De cian a rojo conforme cae la vida, y el pulso se acelera: en las
    // últimas vidas la ciudadela late deprisa y se ve desde cualquier zoom.
    const urgency = 1 - hp;
    const beat = 1.8 + urgency * 5.5;
    const pulse = 0.5 + Math.sin(time * beat) * 0.5;
    // El tono cae más rápido que la vida: a media salud ya está en ámbar, y en
    // las últimas vidas es rojo saturado en vez de un rosa pálido.
    this._hue.setHSL(0.55 * Math.pow(hp, 1.5), 0.8 + urgency * 0.2,
      0.52 + pulse * 0.14 - urgency * 0.06);
    this.crystalMat.color.copy(this._hue);
    this.ringMat.color.copy(this._hue);
    this.haloMat.color.copy(this._hue);
    this.haloMat.opacity = 0.10 + pulse * 0.09 + urgency * 0.10;

    this.crystal.rotation.y += dt * 0.9;
    this.crystal.rotation.x = Math.sin(time * 0.7) * 0.2;
    this.crystal.position.y = 4.42 + Math.sin(time * 1.5) * 0.12;
    this.crystal.scale.setScalar(1 + pulse * 0.08);
    this.halo.position.y = this.crystal.position.y;
    this.halo.scale.setScalar(1 + pulse * 0.1);

    const spin = 0.6 + urgency * 1.8;
    this.rings[0].rotation.set(Math.PI / 2.4, time * spin, 0);
    this.rings[1].rotation.set(Math.PI / 1.7, -time * spin * 0.8, time * 0.3);
    for (const r of this.rings) r.position.y = this.crystal.position.y;

    // La sacudida decae rápido: es un golpe, no un temblor prolongado.
    if (this._shake > 0) {
      this._shake = Math.max(0, this._shake - dt * 3.5);
      const k = this._shake * this._shake;
      this.group.position.x = Math.sin(time * 90) * 0.16 * k;
      this.group.position.z = Math.cos(time * 78) * 0.16 * k;
      this.group.position.y = this._baseY + Math.sin(time * 110) * 0.06 * k;
      this.structure.scale.setScalar(1 + k * 0.04);
    } else if (this.structure.scale.x !== 1) {
      this.group.position.set(0, this._baseY, 0);
      this.structure.scale.setScalar(1);
    }
  }
}
