// Rejilla del mundo: almacenamiento disperso (el mapa crece sin límite conocido
// de antemano) y catálogo de terrenos con sus efectos sobre las torres.

export const TILE = 2; // tamaño de celda en unidades de mundo

export const T = {
  WATER: 0,
  SAND: 1,
  GRASS: 2,
  FOREST: 3,
  ROCK: 4,
  MOUNTAIN: 5,
  PATH: 6,
  CORE: 7,
  SPAWN: 8,
};

/**
 * `mods` son multiplicadores que se aplican a la torre construida encima.
 * Son la razón para pensar dónde construir en vez de amontonar torres.
 */
/**
 * Los tonos son deliberadamente poco saturados y algo desviados hacia el ocre o
 * el azul según el bioma: los colores puros y muy saturados hacen que el mapa
 * parezca plástico y compiten con los efectos y las torres, que sí deben cantar.
 */
export const TERRAIN = {
  [T.WATER]: {
    name: 'Agua', color: 0x1d4f7a, buildable: false, top: 0x2f7fa8,
    desc: 'Solo torres anfibias.', mods: { fireRate: 1.15 },
  },
  [T.SAND]: {
    name: 'Arena', color: 0xc2a86a, buildable: true, top: 0xcfbb8c,
    desc: '+10% cadencia', mods: { fireRate: 1.10 },
  },
  [T.GRASS]: {
    name: 'Pradera', color: 0x3f7d3a, buildable: true, top: 0x6d9b52,
    desc: 'Sin bonus ni penalización', mods: {},
  },
  [T.FOREST]: {
    name: 'Bosque', color: 0x1f5230, buildable: true, top: 0x4a7a4a,
    desc: '+20% daño, -12% alcance', mods: { damage: 1.20, range: 0.88 },
  },
  [T.ROCK]: {
    name: 'Roca', color: 0x5c5c63, buildable: true, top: 0x8b867e,
    desc: '+15% daño, -8% cadencia', mods: { damage: 1.15, fireRate: 0.92 },
  },
  [T.MOUNTAIN]: {
    name: 'Montaña', color: 0x6e6a7d, buildable: true, top: 0xa9a49c,
    desc: '+30% alcance', mods: { range: 1.30 },
  },
  [T.PATH]: {
    name: 'Camino', color: 0x6b5a45, buildable: false, top: 0xb0966f,
    desc: 'Ruta enemiga', mods: {},
  },
  [T.CORE]: {
    name: 'Núcleo', color: 0x2b3a6b, buildable: false, top: 0x4a63b0, desc: '', mods: {},
  },
  [T.SPAWN]: {
    name: 'Portal', color: 0x6b2b4a, buildable: false, top: 0xb03a63, desc: '', mods: {},
  },
};

export const isBuildable = (t) => TERRAIN[t].buildable;

/** Empaqueta coordenadas con signo en una sola clave entera para el Map. */
export const key = (x, y) => ((x + 4096) << 13) | (y + 4096);

export class Cell {
  constructor(x, y, terrain, height) {
    this.x = x;
    this.y = y;
    this.terrain = terrain;
    this.height = height;      // altura en niveles discretos (0..N)
    this.path = false;
    this.pathDist = 999;       // distancia en celdas al camino más cercano
    this.tower = null;
    this.tint = 1;             // variación de color por celda
    this.feature = undefined;  // 'vein' | 'obelisk' | null (undefined = sin decidir)
  }
  get wx() { return this.x * TILE; }
  get wz() { return this.y * TILE; }
  /**
   * Altura del suelo en unidades de mundo (la parte superior del bloque).
   * El escalón es generoso a propósito: con desniveles pequeños el mapa se lee
   * como una alfombra plana y el bonus de elevación no se aprecia.
   */
  get wy() { return this.height * 0.8; }
}

export class Grid {
  constructor() {
    this.cells = new Map();
    this.minX = 0; this.maxX = 0; this.minY = 0; this.maxY = 0;
    this.version = 0; // se incrementa al mutar: la malla del terreno se reconstruye
  }

  get(x, y) {
    return this.cells.get(key(x, y));
  }

  set(x, y, terrain, height) {
    const k = key(x, y);
    let c = this.cells.get(k);
    if (c) {
      c.terrain = terrain;
      c.height = height;
    } else {
      c = new Cell(x, y, terrain, height);
      this.cells.set(k, c);
      if (x < this.minX) this.minX = x;
      if (x > this.maxX) this.maxX = x;
      if (y < this.minY) this.minY = y;
      if (y > this.maxY) this.maxY = y;
    }
    this.version++;
    return c;
  }

  has(x, y) {
    return this.cells.has(key(x, y));
  }

  /** Celda bajo un punto del mundo. */
  atWorld(wx, wz) {
    return this.get(Math.round(wx / TILE), Math.round(wz / TILE));
  }

  get radius() {
    return Math.max(
      Math.abs(this.minX), Math.abs(this.maxX),
      Math.abs(this.minY), Math.abs(this.maxY),
    ) * TILE;
  }

  *neighbors(x, y) {
    const d = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of d) {
      const c = this.get(x + dx, y + dy);
      if (c) yield c;
    }
  }

  countPathNeighbors(x, y, exclude = null) {
    let n = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const c = this.get(x + dx, y + dy);
      if (c && c.path && c !== exclude) n++;
    }
    return n;
  }
}
