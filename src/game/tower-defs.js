import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Une primitivas coloreadas en una sola geometría (una torre = 1 draw call por lote).
 * Se desindexa todo: los poliedros de three no llevan índice y las cajas y
 * cilindros sí, y mergeGeometries se niega a mezclar ambas cosas.
 */
function part(geo, color, pos = [0, 0, 0], rot = null) {
  if (rot) { geo.rotateX(rot[0] || 0); geo.rotateY(rot[1] || 0); geo.rotateZ(rot[2] || 0); }
  geo.translate(pos[0], pos[1], pos[2]);
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const merge = (parts) => BufferGeometryUtils.mergeGeometries(parts);

const CYL = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);
const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const SPH = (r, s = 8) => new THREE.SphereGeometry(r, s, s);

const pedestal = (color) => merge([
  part(BOX(1.5, 0.28, 1.5), color, [0, 0.14, 0]),
  part(CYL(0.45, 0.6, 0.55, 8), color, [0, 0.5, 0]),
]);

/**
 * Catálogo de torres.
 *
 * `vs` es el multiplicador de daño contra cada capa del enemigo:
 * h = salud, a = armadura, s = escudo. Ninguna torre es buena contra todo,
 * y por eso la composición de la defensa importa más que el daño bruto.
 *
 * `cost` es el precio de la primera; `priceStep` es cuánto sube por cada
 * torre de ese mismo tipo ya construida — así llenar el mapa de la torre
 * más rentable deja de ser la respuesta correcta a todo.
 */
export const TOWER_DEFS = [
  {
    id: 'crossbow', name: 'Ballesta', cost: 55, priceStep: 14, unlock: false,
    color: 0x8a6b4a, accent: 0xd9c48a,
    range: 9, damage: 15, fireRate: 1.5, projSpeed: 45, targets: 'both',
    vs: { h: 1.3, a: 0.5, s: 0.6 },
    desc: 'Barata y fiable. Excelente contra salud, inútil contra blindados.',
    special: { id: 'pierce', name: 'Virote perforante', desc: '+1 enemigo atravesado por nivel' },
    geo: () => ({
      base: pedestal(0x6b5540),
      head: merge([
        part(BOX(0.5, 0.42, 0.7), 0x8a6b4a, [0, 0.2, 0]),
        part(BOX(1.3, 0.1, 0.1), 0xd9c48a, [0, 0.3, 0.15]),
        part(BOX(0.12, 0.12, 0.9), 0xe8dcc0, [0, 0.3, -0.15]),
      ]),
    }),
  },
  {
    id: 'cannon', name: 'Cañón', cost: 110, priceStep: 32, unlock: false,
    color: 0x4a4a52, accent: 0xff8a3a,
    range: 8.5, damage: 44, fireRate: 0.55, projSpeed: 32, targets: 'ground',
    splash: 2.6, vs: { h: 0.9, a: 1.7, s: 0.4 },
    desc: 'Rompe armaduras en área. Lento y sin efecto sobre escudos.',
    special: { id: 'splash', name: 'Carga pesada', desc: '+35% radio y +15% daño de área por nivel' },
    geo: () => ({
      base: pedestal(0x3d3d45),
      head: merge([
        part(CYL(0.42, 0.48, 0.4, 8), 0x5a5a64, [0, 0.24, 0]),
        part(CYL(0.2, 0.26, 1.25, 10), 0x33333a, [0, 0.34, -0.5], [Math.PI / 2, 0, 0]),
        part(CYL(0.29, 0.29, 0.16, 10), 0xff8a3a, [0, 0.34, -1.05], [Math.PI / 2, 0, 0]),
      ]),
    }),
  },
  {
    id: 'frost', name: 'Glaciar', cost: 95, priceStep: 26, unlock: false,
    color: 0x3a7ea8, accent: 0x9fe8ff,
    range: 7.5, damage: 8, fireRate: 1.1, projSpeed: 30, targets: 'both',
    splash: 3.2, slow: 0.14, vs: { h: 0.8, a: 0.8, s: 1.1 },
    desc: 'Poco daño, pero ralentiza en área. La columna vertebral de toda defensa.',
    special: { id: 'freeze', name: 'Escarcha profunda', desc: '+40% ralentización aplicada por nivel' },
    geo: () => ({
      base: pedestal(0x2c5a78),
      head: merge([
        part(CYL(0.34, 0.42, 0.45, 6), 0x3a7ea8, [0, 0.25, 0]),
        part(new THREE.OctahedronGeometry(0.34), 0x9fe8ff, [0, 0.75, 0]),
        part(new THREE.OctahedronGeometry(0.16), 0xcdf4ff, [0.32, 0.5, 0.2]),
        part(new THREE.OctahedronGeometry(0.16), 0xcdf4ff, [-0.32, 0.5, -0.2]),
      ]),
    }),
  },
  {
    id: 'tesla', name: 'Bobina Tesla', cost: 165, priceStep: 48, unlock: true,
    color: 0x5b4a8a, accent: 0x9fd8ff,
    range: 7, damage: 24, fireRate: 1.0, targets: 'both',
    chain: { count: 3, falloff: 0.72 }, hitscan: true, vs: { h: 0.5, a: 0.4, s: 2.0 },
    desc: 'Rayo que salta entre enemigos. Demoledora contra escudos.',
    special: { id: 'chain', name: 'Sobrecarga', desc: '+1 salto y menos pérdida por salto' },
    geo: () => ({
      base: pedestal(0x453a68),
      head: merge([
        part(CYL(0.14, 0.2, 1.1, 6), 0x6b5a9a, [0, 0.55, 0]),
        part(new THREE.TorusGeometry(0.34, 0.07, 6, 12), 0x9fd8ff, [0, 0.75, 0], [Math.PI / 2, 0, 0]),
        part(SPH(0.24, 10), 0xcfe8ff, [0, 1.2, 0]),
      ]),
    }),
  },
  {
    id: 'venom', name: 'Escupidor', cost: 130, priceStep: 36, unlock: true,
    color: 0x3f6b3a, accent: 0xb6ff5a,
    range: 8, damage: 10, fireRate: 1.3, projSpeed: 26, targets: 'ground',
    dot: { type: 'poison', factor: 2.6 }, vs: { h: 0.7, a: 0.5, s: 1.0 },
    desc: 'Aplica veneno: daño persistente que bloquea la regeneración de escudo.',
    special: { id: 'dot', name: 'Toxina virulenta', desc: '+50% de veneno aplicado por nivel' },
    geo: () => ({
      base: pedestal(0x2e4f2c),
      head: merge([
        part(SPH(0.42, 8), 0x3f6b3a, [0, 0.34, 0]),
        part(CYL(0.1, 0.18, 0.8, 6), 0x2a4a28, [0, 0.42, -0.4], [Math.PI / 2, 0, 0]),
        part(SPH(0.16, 8), 0xb6ff5a, [0, 0.42, -0.78]),
      ]),
    }),
  },
  {
    id: 'mortar', name: 'Mortero', cost: 190, priceStep: 55, unlock: true,
    color: 0x6b5a3a, accent: 0xffd06b,
    range: 22, minRange: 6, damage: 66, fireRate: 0.3, projSpeed: 20, targets: 'ground',
    splash: 3.6, arc: true, vs: { h: 1.0, a: 1.6, s: 0.5 },
    desc: 'Alcance enorme y gran área, pero incapaz de disparar de cerca.',
    special: { id: 'salvo', name: 'Andanada', desc: '+1 proyectil por disparo cada 2 niveles' },
    geo: () => ({
      base: pedestal(0x554832),
      head: merge([
        part(BOX(0.8, 0.3, 0.8), 0x6b5a3a, [0, 0.2, 0]),
        part(CYL(0.26, 0.3, 1.1, 8), 0x4a4030, [0, 0.6, -0.2], [-0.75, 0, 0]),
        part(CYL(0.3, 0.3, 0.12, 8), 0xffd06b, [0, 0.95, -0.5], [-0.75, 0, 0]),
      ]),
    }),
  },
  {
    id: 'flak', name: 'Flak', cost: 145, priceStep: 40, unlock: true,
    color: 0x7a3a3a, accent: 0xffb03a,
    range: 11, damage: 32, fireRate: 1.8, projSpeed: 60, targets: 'air',
    splash: 2.0, vs: { h: 1.3, a: 1.0, s: 1.0 },
    desc: 'Sólo antiaérea. Los voladores cruzan en línea recta ignorando el camino.',
    special: { id: 'flak', name: 'Metralla', desc: '+30% daño y radio por nivel' },
    geo: () => ({
      base: pedestal(0x5f2f2f),
      head: merge([
        part(CYL(0.4, 0.46, 0.36, 8), 0x7a3a3a, [0, 0.22, 0]),
        part(CYL(0.11, 0.13, 1.0, 6), 0x33333a, [-0.16, 0.55, -0.3], [-0.6, 0, 0]),
        part(CYL(0.11, 0.13, 1.0, 6), 0x33333a, [0.16, 0.55, -0.3], [-0.6, 0, 0]),
        part(BOX(0.5, 0.18, 0.3), 0xffb03a, [0, 0.42, 0.28]),
      ]),
    }),
  },
  {
    id: 'beam', name: 'Prisma', cost: 220, priceStep: 62, unlock: true,
    color: 0x8a3a7a, accent: 0xff6bd8,
    range: 10, damage: 26, fireRate: 8, targets: 'both', hitscan: true, beam: true,
    rampUp: { max: 3.0, perSec: 0.8 }, dot: { type: 'burn', factor: 0.5 },
    vs: { h: 0.6, a: 1.7, s: 0.8 },
    desc: 'Rayo continuo que funde armaduras y quema. Su daño crece si no cambia de objetivo.',
    special: { id: 'ramp', name: 'Resonancia', desc: '+0.5 al multiplicador máximo por nivel' },
    geo: () => ({
      base: pedestal(0x6b2d5f),
      head: merge([
        part(new THREE.OctahedronGeometry(0.4), 0x8a3a7a, [0, 0.5, 0]),
        part(CYL(0.16, 0.16, 0.7, 6), 0xff6bd8, [0, 0.5, -0.45], [Math.PI / 2, 0, 0]),
        part(new THREE.TorusGeometry(0.5, 0.05, 5, 14), 0xff9fe8, [0, 0.5, 0], [Math.PI / 2, 0, 0]),
      ]),
    }),
  },
  {
    id: 'ballista', name: 'Balista', cost: 260, priceStep: 75, unlock: true,
    color: 0x5a4a3a, accent: 0xffe08a,
    range: 15, damage: 145, fireRate: 0.28, projSpeed: 70, targets: 'both',
    pierce: 3, dot: { type: 'bleed', factor: 0.6 }, vs: { h: 1.6, a: 0.9, s: 0.5 },
    desc: 'Virote gigante que atraviesa filas enteras y provoca hemorragia.',
    special: { id: 'pierce', name: 'Asta de asedio', desc: '+2 atravesados y +25% daño por nivel' },
    geo: () => ({
      base: pedestal(0x463a2c),
      head: merge([
        part(BOX(0.6, 0.3, 1.2), 0x5a4a3a, [0, 0.3, 0]),
        part(BOX(1.8, 0.12, 0.12), 0x3a3028, [0, 0.5, 0.3]),
        part(BOX(0.14, 0.14, 1.9), 0xffe08a, [0, 0.5, -0.4]),
      ]),
    }),
  },
  {
    id: 'pylon', name: 'Pilón', cost: 175, priceStep: 90, unlock: true,
    color: 0xb08a3a, accent: 0xffe9a8,
    range: 7, damage: 0, fireRate: 0, targets: 'none',
    aura: { damage: 1.22, fireRate: 1.15, range: 1.10 }, vs: { h: 1, a: 1, s: 1 },
    desc: 'No dispara: potencia a todas las torres dentro de su radio.',
    special: { id: 'aura', name: 'Armónico', desc: '+8% a todos los bonus del aura por nivel' },
    geo: () => ({
      base: pedestal(0x8a6b2c),
      head: merge([
        part(CYL(0.06, 0.28, 1.6, 4), 0xb08a3a, [0, 0.8, 0]),
        part(new THREE.OctahedronGeometry(0.3), 0xffe9a8, [0, 1.75, 0]),
      ]),
    }),
  },
  {
    id: 'harpoon', name: 'Arpón', cost: 120, priceStep: 34, unlock: true, amphibious: true,
    color: 0x2c6e8a, accent: 0x8ae8ff,
    range: 10, damage: 36, fireRate: 0.9, projSpeed: 40, targets: 'ground',
    slow: 0.10, vs: { h: 1.0, a: 1.1, s: 1.1 },
    desc: 'La única torre que se construye sobre agua. Engancha, frena y daña de forma pareja.',
    special: { id: 'reel', name: 'Cabrestante', desc: '+50% ralentización y +20% daño por nivel' },
    geo: () => ({
      base: pedestal(0x1f5266),
      head: merge([
        part(BOX(0.7, 0.36, 0.7), 0x2c6e8a, [0, 0.24, 0]),
        part(CYL(0.09, 0.09, 1.3, 6), 0x8ae8ff, [0, 0.4, -0.5], [Math.PI / 2, 0, 0]),
        part(new THREE.ConeGeometry(0.18, 0.35, 5), 0xcdf4ff, [0, 0.4, -1.15], [-Math.PI / 2, 0, 0]),
      ]),
    }),
  },
];

export const TOWERS = Object.fromEntries(TOWER_DEFS.map((d) => [d.id, d]));

/**
 * Líneas de mejora comunes. El coste crece de forma aritmética (base × nivel),
 * no exponencial: subir mucho una torre debe seguir siendo viable en la oleada 40.
 */
export const UPGRADE_PATHS = [
  { id: 'damage', name: 'Daño', symbol: '⚔', stat: 'damage', mult: 1.26, costMult: 0.5, max: 12 },
  { id: 'range', name: 'Alcance', symbol: '◎', stat: 'range', mult: 1.12, costMult: 0.4, max: 8 },
  { id: 'fireRate', name: 'Cadencia', symbol: '⟳', stat: 'fireRate', mult: 1.18, costMult: 0.55, max: 12 },
  { id: 'special', name: 'Especial', symbol: '★', stat: null, costMult: 1.0, max: 5 },
];
