import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { InstancedBatch } from '../engine/instanced.js';
import { TILE, T, TERRAIN } from './grid.js';
import { Water } from './water.js';
import { noise2D } from '../core/rng.js';

/**
 * Textura de superficie generada por código: grano fino para que el color no
 * quede plano, más un oscurecimiento hacia los bordes que hace las veces de
 * oclusión de contacto y separa visualmente una casilla de la siguiente.
 * Se multiplica sobre el color de instancia, así que sirve para todos los biomas.
 */
function surfaceTexture(size = 128) {
  // La simulación sin navegador (smoke.mjs) monta la vista sin lienzo.
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Dos frecuencias de ruido: manchas amplias y grano fino.
      const coarse = noise2D(x * 0.055, y * 0.055, 11);
      const fine = noise2D(x * 0.42, y * 0.42, 23);
      let v = 0.86 + coarse * 0.20 + (fine - 0.5) * 0.11;

      // Marco: los bordes de cada cara se oscurecen.
      const edge = Math.min(x, y, size - 1 - x, size - 1 - y) / (size * 0.16);
      v *= 0.66 + 0.34 * Math.min(1, edge);

      const i = (y * size + x) * 4;
      const b = Math.max(0, Math.min(255, v * 255));
      img.data[i] = img.data[i + 1] = img.data[i + 2] = b;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Sombreado de caras horneado en la geometría: da el look facetado sin luces extra. */
function shadedBox() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, -0.5, 0); // origen en la cara superior: escalar en Y hunde el bloque
  const shade = [0.82, 0.66, 1.0, 0.4, 0.9, 0.6]; // +X -X +Y -Y +Z -Z
  const col = new Float32Array(g.attributes.position.count * 3);
  for (let face = 0; face < 6; face++) {
    for (let v = 0; v < 4; v++) {
      const i = (face * 4 + v) * 3;
      col[i] = col[i + 1] = col[i + 2] = shade[face];
    }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** mergeGeometries exige que todas las piezas coincidan en tener índice o no. */
const flat = (g) => (g.index ? g.toNonIndexed() : g);

function colored(geo, colors) {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const y = geo.attributes.position.getY(i);
    c.setHex(colors(y, i));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/** Conífera: tres conos escalonados sobre un tronco. */
function coniferGeometry() {
  const trunk = new THREE.CylinderGeometry(0.08, 0.12, 0.55, 5);
  trunk.translate(0, 0.27, 0);
  const parts = [trunk];
  for (let i = 0; i < 3; i++) {
    const cone = new THREE.ConeGeometry(0.46 - i * 0.12, 0.62, 7);
    cone.translate(0, 0.62 + i * 0.36, 0);
    parts.push(cone);
  }
  const g = BufferGeometryUtils.mergeGeometries(parts.map(flat));
  return colored(g, (y) => (y < 0.5 ? 0x53402a : y < 1.0 ? 0x2f6b3c : 0x3f8248));
}

/** Frondoso: copa irregular de icosaedros. */
function broadleafGeometry() {
  const trunk = new THREE.CylinderGeometry(0.09, 0.14, 0.7, 5);
  trunk.translate(0, 0.35, 0);
  const parts = [trunk];
  const blobs = [[0, 1.0, 0, 0.44], [0.24, 0.82, 0.1, 0.3], [-0.2, 0.86, -0.16, 0.28]];
  for (const [x, y, z, r] of blobs) {
    const b = new THREE.IcosahedronGeometry(r, 0);
    b.translate(x, y, z);
    parts.push(b);
  }
  const g = BufferGeometryUtils.mergeGeometries(parts.map(flat));
  return colored(g, (y) => (y < 0.6 ? 0x5c4630 : 0x63924a));
}

/** Roca: icosaedro achatado. */
function rockGeometry() {
  const g = new THREE.IcosahedronGeometry(0.36, 0);
  g.scale(1, 0.62, 1);
  g.translate(0, 0.2, 0);
  return colored(flat(g), () => 0x8d8880);
}

/** Matojo: tres aspas cruzadas, suficiente para insinuar hierba alta. */
function grassGeometry() {
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.PlaneGeometry(0.34, 0.34);
    blade.rotateY((i * Math.PI) / 3);
    blade.translate(0, 0.17, 0);
    parts.push(blade);
  }
  const g = BufferGeometryUtils.mergeGeometries(parts.map(flat));
  return colored(g, (y) => (y > 0.2 ? 0x86ad5c : 0x5c8040));
}

/**
 * Vista del terreno. Todo el mapa —decenas de miles de casillas— cabe en unos
 * pocos draw calls porque cada tipo de pieza es un único lote instanciado.
 */
export class TerrainView {
  constructor(scene) {
    this.scene = scene;
    this.lastVersion = -1;

    const tex = surfaceTexture();
    const solidMat = new THREE.MeshStandardMaterial({
      vertexColors: true, map: tex, roughness: 0.92, metalness: 0.0,
    });
    this.solid = new InstancedBatch(shadedBox(), solidMat, 8192).addTo(scene);

    this.water = new Water(scene);

    const flora = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    const floraFlat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.9, side: THREE.DoubleSide,
    });
    this.conifer = new InstancedBatch(coniferGeometry(), flora, 4096).addTo(scene);
    this.broadleaf = new InstancedBatch(broadleafGeometry(), flora, 4096).addTo(scene);
    this.rocks = new InstancedBatch(rockGeometry(), flora, 2048).addTo(scene);
    this.grass = new InstancedBatch(grassGeometry(), floraFlat, 4096, { shadows: false }).addTo(scene);

    const featMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    this.veins = new InstancedBatch(
      new THREE.OctahedronGeometry(0.34), featMat, 256, { shadows: false },
    ).addTo(scene);
    this.obelisks = new InstancedBatch(
      new THREE.ConeGeometry(0.26, 1.5, 4), featMat, 256, { shadows: false },
    ).addTo(scene);

    this._waterCells = [];
    this._featureCells = [];

    // Cursor de construcción. Son dos figuras distintas, no el mismo marco en
    // dos colores: quien no distingue rojo de verde necesita ver la diferencia
    // igualmente. Marco = se puede construir, aspa = no se puede.
    const ringGeo = new THREE.RingGeometry(TILE * 0.36, TILE * 0.52, 4);
    ringGeo.rotateX(-Math.PI / 2);
    ringGeo.rotateY(Math.PI / 4);
    this.cursor = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0x7dffb0, transparent: true, opacity: 0.9, depthTest: false, toneMapped: false,
    }));
    this.cursor.renderOrder = 10;
    this.cursor.visible = false;
    scene.add(this.cursor);

    const barA = new THREE.PlaneGeometry(TILE * 0.95, TILE * 0.16);
    barA.rotateX(-Math.PI / 2);
    barA.rotateY(Math.PI / 4);
    const barB = barA.clone();
    barB.rotateY(Math.PI / 2);
    this.cursorBad = new THREE.Mesh(
      BufferGeometryUtils.mergeGeometries([flat(barA), flat(barB)]),
      new THREE.MeshBasicMaterial({
        color: 0xff5a5a, transparent: true, opacity: 0.92, depthTest: false, toneMapped: false,
      }),
    );
    this.cursorBad.renderOrder = 10;
    this.cursorBad.visible = false;
    scene.add(this.cursorBad);

    const rangeGeo = new THREE.RingGeometry(0.97, 1.0, 64);
    rangeGeo.rotateX(-Math.PI / 2);
    this.rangeRing = new THREE.Mesh(rangeGeo, new THREE.MeshBasicMaterial({
      color: 0x8fd8ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
      depthTest: false, toneMapped: false,
    }));
    this.rangeRing.renderOrder = 9;
    this.rangeRing.visible = false;
    scene.add(this.rangeRing);
  }

  /**
   * Ajusta la densidad de vegetación y el detalle del agua. La vegetación es
   * pura geometría extra: a densidad 0 desaparecen miles de instancias de golpe.
   */
  setQuality(preset) {
    const changed = !this._preset
      || this._preset.decoDensity !== preset.decoDensity
      || this._preset.waterSub !== preset.waterSub;
    this._preset = preset;
    this.water.setDetail(preset.waterSub, preset.waterDetail);
    if (changed) this.lastVersion = -1; // fuerza reconstrucción con la nueva densidad
  }

  /** Reconstruye los buffers a partir del estado de la rejilla. */
  rebuild(grid) {
    if (grid.version === this.lastVersion) return;
    this.lastVersion = grid.version;
    const density = this._preset ? this._preset.decoDensity : 1;

    const { solid, conifer, broadleaf, rocks, grass } = this;
    for (const b of [solid, conifer, broadleaf, rocks, grass]) b.begin();
    this._waterCells.length = 0;
    this._featureCells.length = 0;

    const c = new THREE.Color();
    const size = TILE * 0.985;

    for (const cell of grid.cells.values()) {
      const def = TERRAIN[cell.terrain];
      const y = cell.wy;
      const depth = y + 6; // los bloques bajan hasta una base común: no se ve el vacío
      c.setHex(def.top);
      // Variación por casilla y ligera pérdida de color con la altura, que
      // insinúa exposición: las cotas altas se ven más lavadas.
      const tint = (cell.tint || 1) * (1 - Math.max(0, cell.height) * 0.012);
      c.multiplyScalar(tint);

      if (cell.terrain === T.WATER) {
        this._waterCells.push(cell);
        // Lecho arenoso bajo la lámina: en tono oscuro el agua se ensuciaba.
        solid.push(cell.wx, y - 0.35, cell.wz, size, depth, size, 0, 0.38, 0.34, 0.25);
        continue;
      }

      solid.push(cell.wx, y, cell.wz, size, depth, size, 0, c.r, c.g, c.b);
      if (cell.feature) this._featureCells.push(cell);
      if (cell.tower) continue;

      // Vegetación determinista: la misma casilla produce siempre lo mismo, así
      // que reconstruir el mapa no hace bailar el bosque.
      if (density <= 0) continue;
      const n = noise2D(cell.x * 3.1, cell.y * 3.1, 991);
      const m = noise2D(cell.x * 5.7, cell.y * 5.7, 337);
      // El recorte por densidad usa el propio ruido: siempre desaparecen las
      // mismas casillas, no un subconjunto que baile al cambiar de calidad.
      if (density < 1 && n > density) continue;

      if (cell.terrain === T.FOREST) {
        const count = n > 0.78 ? 3 : n > 0.34 ? 2 : 1;
        for (let i = 0; i < count; i++) {
          const a = noise2D(cell.x * 7 + i * 13, cell.y * 7 - i * 5, 31) * Math.PI * 2;
          const r = 0.22 + noise2D(cell.x * 5 - i, cell.y * 5 + i, 77) * 0.44;
          const s = 0.7 + noise2D(cell.x + i * 3, cell.y - i * 2, 13) * 0.7;
          const batch = (m + i * 0.31) % 1 > 0.45 ? conifer : broadleaf;
          batch.push(cell.wx + Math.cos(a) * r, y, cell.wz + Math.sin(a) * r, s, s, s, a, 1, 1, 1);
        }
      } else if (cell.terrain === T.GRASS && n > 0.55) {
        const count = n > 0.86 ? 3 : 2;
        for (let i = 0; i < count; i++) {
          const a = noise2D(cell.x * 9 + i * 7, cell.y * 9 - i * 3, 53) * Math.PI * 2;
          const r = 0.15 + noise2D(cell.x * 3 + i, cell.y * 3 - i, 61) * 0.5;
          const s = 0.6 + noise2D(cell.x - i, cell.y + i, 97) * 0.7;
          grass.push(cell.wx + Math.cos(a) * r, y, cell.wz + Math.sin(a) * r, s, s, s, a, 1, 1, 1);
        }
      } else if ((cell.terrain === T.ROCK || cell.terrain === T.MOUNTAIN) && n > 0.5) {
        const count = n > 0.85 ? 2 : 1;
        for (let i = 0; i < count; i++) {
          const a = noise2D(cell.x * 11 + i * 5, cell.y * 11 + i, 71) * Math.PI * 2;
          const r = 0.18 + noise2D(cell.x * 4 + i, cell.y * 4 - i, 43) * 0.42;
          const s = 0.6 + noise2D(cell.x * 2 + i, cell.y * 2 + i, 89) * 0.8;
          rocks.push(cell.wx + Math.cos(a) * r, y, cell.wz + Math.sin(a) * r, s, s, s, a, 1, 1, 1);
        }
      }
    }

    for (const b of [solid, conifer, broadleaf, rocks, grass]) b.end();
    this.water.build(grid, this._waterCells);
  }

  /** Anima agua y yacimientos: sólo toca lotes pequeños. */
  animate(t) {
    this.water.update(t);

    const v = this.veins, o = this.obelisks;
    v.begin(); o.begin();
    for (const cell of this._featureCells) {
      const ph = t * 1.4 + cell.x * 0.7 + cell.y * 0.4;
      if (cell.feature === 'vein') {
        v.push(cell.wx, cell.wy + 0.8 + Math.sin(ph) * 0.12, cell.wz,
          1, 1, 1, t * 0.9, 1.6, 1.25, 0.4);
      } else {
        const pulse = 0.8 + Math.sin(ph) * 0.3;
        o.push(cell.wx, cell.wy + 0.78, cell.wz, 1, 1, 1, t * 0.5,
          1.0 * pulse, 0.55 * pulse, 1.5 * pulse);
      }
    }
    v.end(); o.end();
  }

  showCursor(cell, valid) {
    if (!cell) {
      this.cursor.visible = this.cursorBad.visible = false;
      return;
    }
    const m = valid ? this.cursor : this.cursorBad;
    const other = valid ? this.cursorBad : this.cursor;
    other.visible = false;
    m.visible = true;
    m.position.set(cell.wx, cell.wy + 0.06, cell.wz);
  }

  showRange(x, y, z, radius) {
    if (radius <= 0) { this.rangeRing.visible = false; return; }
    this.rangeRing.visible = true;
    this.rangeRing.position.set(x, y + 0.1, z);
    this.rangeRing.scale.set(radius, 1, radius);
  }
}
