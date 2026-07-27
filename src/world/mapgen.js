import { Rng, fbm, noise2D, clamp } from '../core/rng.js';
import { Grid, T, key, isBuildable } from './grid.js';

/**
 * Generación procedural del mundo.
 *
 * Idea central (tomada de Rogue Tower): el mapa no se genera una vez, sino que
 * *crece*. Cada sector alarga los caminos desde sus portales hacia afuera,
 * amplía el radio de terreno y, cada pocos sectores, abre una nueva ruta.
 * El resultado es que el mapa que ya conoces sigue ahí, pero el recorrido
 * enemigo se hace más largo y el territorio construible más grande.
 *
 * Los caminos se generan del núcleo hacia afuera (así la conexión está
 * garantizada por construcción) y se almacenan invertidos, en orden de marcha.
 */

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const left = (d) => (d + 3) % 4;
const right = (d) => (d + 1) % 4;

export class MapGenerator {
  constructor(seed) {
    this.rng = new Rng(seed);
    this.seed = this.rng.seed;
    this.grid = new Grid();
    this.routes = [];
    this.level = 0;
    this.radius = 0;
    this.core = null;
  }

  // --- API pública ---

  /** Sector 1: núcleo, primera ruta y terreno inicial. */
  generateInitial() {
    const g = this.grid;
    this.core = g.set(0, 0, T.CORE, 1);
    this.core.path = true;

    const dir = this.rng.int(0, 3);
    this._newRoute(this.core, dir, 26);

    this.level = 1;
    this._repaint();
    return this;
  }

  /**
   * Avanza un sector: alarga cada ruta y, periódicamente, añade una nueva.
   *
   * Los portales son *emergentes*: cuando una ruta ya no puede avanzar porque
   * los caminos existentes la encajonan, se sella y su extremo queda como punto
   * de aparición permanente. El jugador se genera sus propios frentes al
   * dejar que el mapa se enrede.
   */
  expand() {
    this.level++;
    const before = new Set(this.grid.cells.keys());
    const extra = 8 + Math.floor(this.level * 1.6);

    let sealedNow = 0;
    for (const r of this.routes) {
      if (r.sealed) continue;
      const added = this._extendRoute(r, extra);
      if (added < extra * 0.4) { r.sealed = true; sealedNow++; }
    }

    // Una ruta nueva cada tres sectores, o de inmediato si todas quedaron selladas.
    const open = this.routes.filter((r) => !r.sealed).length;
    if ((this.level % 3 === 0 || open === 0) && this.routes.length < 5) {
      this._branchRoute();
    }

    this._repaint();

    const fresh = [];
    for (const [k, c] of this.grid.cells) if (!before.has(k)) fresh.push(c);
    return { cells: fresh, sealed: sealedNow };
  }

  /** Longitud del recorrido más corto: sirve para calibrar la dificultad. */
  get shortestRoute() {
    return Math.min(...this.routes.map((r) => r.cells.length));
  }

  // --- Rutas ---

  _newRoute(fromCell, dir, steps) {
    const route = { id: this.routes.length, cells: [], dir, spawn: null, sealed: false };
    const built = this._walk(fromCell, dir, steps, route);
    // Se genera núcleo→afuera; los enemigos marchan al revés.
    route.cells = built.slice().reverse();
    route.cells.push(this.core);
    this._setSpawn(route);
    this.routes.push(route);
    return route;
  }

  _extendRoute(route, steps) {
    const from = route.spawn;
    // El portal deja de serlo: vuelve a ser camino normal.
    from.terrain = T.PATH;
    const built = this._walk(from, route.dir, steps, route);
    if (!built.length) { from.terrain = T.SPAWN; return 0; }
    route.cells = built.slice().reverse().concat(route.cells);
    this._setSpawn(route);
    return built.length;
  }

  /** Abre una bifurcación desde un punto intermedio de una ruta existente. */
  _branchRoute() {
    const base = this.rng.pick(this.routes);
    // Punto de bifurcación en el tercio medio: ni pegado al núcleo ni al portal.
    const lo = Math.floor(base.cells.length * 0.25);
    const hi = Math.floor(base.cells.length * 0.7);
    if (hi - lo < 4) return;

    for (let attempt = 0; attempt < 12; attempt++) {
      const idx = this.rng.int(lo, hi);
      const from = base.cells[idx];
      // Sale perpendicular al tramo local del camino.
      const prev = base.cells[idx + 1] || base.cells[idx - 1];
      const along = Math.abs(from.x - prev.x) > 0 ? 0 : 1;
      const dir = along === 0 ? (this.rng.bool() ? 1 : 3) : (this.rng.bool() ? 0 : 2);

      const route = { id: this.routes.length, cells: [], dir, spawn: null, sealed: false };
      const built = this._walk(from, dir, 16 + this.level * 2, route, true);
      if (built.length < 8) {
        for (const c of built) this._unmarkPath(c);
        continue;
      }
      // La rama comparte con la ruta base todo el tramo desde el punto de unión.
      route.cells = built.slice().reverse().concat(base.cells.slice(idx));
      this._setSpawn(route);
      this.routes.push(route);
      return route;
    }
  }

  _setSpawn(route) {
    const s = route.cells[0];
    s.terrain = T.SPAWN;
    route.spawn = s;
    // Dirección con la que salió del mapa: se reutiliza al extender.
    const next = route.cells[1];
    if (next) {
      const dx = Math.sign(s.x - next.x), dy = Math.sign(s.y - next.y);
      route.dir = DIRS.findIndex((d) => d[0] === dx && d[1] === dy);
    }
  }

  _markPath(x, y) {
    const c = this.grid.set(x, y, T.PATH, 0);
    c.path = true;
    return c;
  }

  _unmarkPath(c) {
    c.path = false;
    this.grid.cells.delete(key(c.x, c.y));
  }

  /**
   * Random walk direccional con sesgo hacia afuera, tramos rectos mínimos y
   * retroceso si se acorrala. Es lo que produce caminos serpenteantes en vez
   * de ruido o líneas rectas.
   */
  _walk(start, dir, steps, route, forceStraightStart = false) {
    const built = [];
    let cur = start;
    let d = dir;
    let sinceTurn = 99;
    let fails = 0;
    const maxR = this._targetRadius() + 4;

    for (let i = 0; i < steps; i++) {
      const opts = [];
      const weights = [];
      const canTurn = sinceTurn >= 2 && !(forceStraightStart && i < 2);

      for (const nd of canTurn ? [d, left(d), right(d)] : [d]) {
        const nx = cur.x + DIRS[nd][0];
        const ny = cur.y + DIRS[nd][1];
        const existing = this.grid.get(nx, ny);
        if (existing && existing.path) continue;
        // Regla clave: la celda nueva no puede tocar otro camino (salvo el que
        // venimos recorriendo). Sin esto los caminos se funden en manchas.
        if (this.grid.countPathNeighbors(nx, ny, cur) > 0) continue;

        const dist = Math.hypot(nx, ny);
        const curDist = Math.hypot(cur.x, cur.y);
        let w = nd === d ? 0.60 : 0.20;
        w *= dist > curDist ? 1.6 : 0.5;       // premiar alejarse del núcleo
        if (dist > maxR) w *= 0.04;            // frenar en el borde del sector
        if (dist < 3) w *= 0.05;               // no rodear el núcleo
        opts.push([nx, ny, nd]);
        weights.push(w);
      }

      if (!opts.length) {
        // Acorralado: retrocede unos pasos y vuelve a intentarlo desde ahí.
        if (built.length > 3 && fails < 40) {
          for (let k = 0; k < 3 && built.length; k++) this._unmarkPath(built.pop());
          cur = built[built.length - 1] || start;
          d = this.rng.int(0, 3);
          sinceTurn = 99;
          fails++;
          i -= 2;
          continue;
        }
        break;
      }

      const [nx, ny, nd] = opts[this.rng.weighted(weights)];
      sinceTurn = nd === d ? sinceTurn + 1 : 0;
      d = nd;
      cur = this._markPath(nx, ny);
      built.push(cur);
    }

    route.dir = d;
    return built;
  }

  // --- Terreno ---

  _targetRadius() {
    // Crece con el sector, pero siempre cubriendo lo que ocupan los caminos.
    let maxPath = 0;
    for (const r of this.routes) {
      for (const c of r.cells) maxPath = Math.max(maxPath, Math.hypot(c.x, c.y));
    }
    return Math.max(14 + this.level * 3, maxPath + 7);
  }

  /** Recalcula alturas, biomas y distancias al camino para todo el sector. */
  _repaint() {
    const g = this.grid;
    const R = this._targetRadius();
    this.radius = R;
    const s = this.seed;

    this._smoothPathHeights();

    // Distancia al camino (BFS multi-fuente) — decide dónde hay montaña y lago.
    const queue = [];
    for (const c of g.cells.values()) {
      if (c.path) { c.pathDist = 0; queue.push(c); }
      else c.pathDist = 999;
    }
    // El BFS puede salir a celdas que aún no existen: se crean como marcador.
    const dist = new Map();
    for (const c of queue) dist.set(key(c.x, c.y), 0);
    for (let qi = 0; qi < queue.length; qi++) {
      const c = queue[qi];
      const d = dist.get(key(c.x, c.y));
      if (d >= 8) continue;
      for (const [dx, dy] of DIRS) {
        const nx = c.x + dx, ny = c.y + dy;
        const k = key(nx, ny);
        if (dist.has(k)) continue;
        if (Math.hypot(nx, ny) > R + 1) continue;
        dist.set(k, d + 1);
        let n = g.get(nx, ny);
        if (!n) n = g.set(nx, ny, T.GRASS, 0);
        n.pathDist = d + 1;
        queue.push(n);
      }
    }

    // Se pinta sólo la banda de terreno que el BFS acaba de crear alrededor de
    // los caminos. Rellenar el disco completo generaría decenas de miles de
    // celdas de esquina donde nadie construye nunca.
    for (const c of g.cells.values()) {
      if (c.path || c.tower) continue; // no reescribir el camino ni bajo una torre
      const x = c.x, y = c.y;

      // Menos octavas y más frecuencia: el fbm de muchas octavas se apelotona
      // en torno a 0,5 y produce mesetas uniformes sin biomas reconocibles.
      const h0 = fbm(x * 0.075, y * 0.075, s, 3);
      const moist = fbm(x * 0.075 + 100, y * 0.075 - 40, s + 7717, 2);
      // Los lagos tienen su propio ruido: hacerlos depender de la intersección
      // de relieve bajo y humedad baja daba mapas sin una sola gota de agua.
      const lake = fbm(x * 0.09 - 60, y * 0.09 + 20, s + 31337, 2);
      // Ligera tendencia a subir al alejarse del camino, pero mandando el ruido:
      // si el relieve dependiera sobre todo de la distancia, todo lo construible
      // sería llano y los bonus de terreno no decidirían nada.
      const near = clamp(c.pathDist, 0, 7) / 7;
      // Se estira el contraste para que haya biomas y alturas de verdad.
      const h = clamp((h0 * 0.85 + near * 0.15 - 0.5) * 2.1 + 0.5, 0, 1);

      let t;
      if (c.pathDist >= 2 && lake < 0.34) t = T.WATER;
      else if (h < 0.34) t = moist > 0.54 ? T.FOREST : T.GRASS;
      else if (h < 0.54) t = moist > 0.48 ? T.FOREST : T.GRASS;
      else if (h < 0.70) t = moist > 0.46 ? T.FOREST : T.ROCK;
      else if (h < 0.84) t = T.ROCK;
      else t = T.MOUNTAIN;

      c.terrain = t;
      // La cota del agua se ajusta después, a partir de la orilla: fijarla en un
      // valor constante dejaba los lagos en el fondo de un pozo cuando el
      // terreno de alrededor era alto.
      c.height = t === T.WATER ? 0 : Math.round(h * 6);
      c.tint = 0.88 + fbm(x * 0.7, y * 0.7, s + 31, 1) * 0.24;

      // Yacimientos: puntos fijos y deterministas junto al camino que hacen
      // que ciertas casillas valgan mucho más que sus vecinas.
      if (c.feature === undefined) {
        c.feature = null;
        if (c.pathDist >= 1 && c.pathDist <= 4 && isBuildable(t)) {
          // En coordenadas enteras noise2D no interpola: devuelve el hash puro,
          // uniforme en [0,1]. Con ruido interpolado los extremos casi no salen
          // y los yacimientos se volvían inencontrables.
          const n = noise2D(x, y, s + 4242);
          if (n > 0.968) c.feature = 'vein';
          else if (n > 0.936) c.feature = 'obelisk';
        }
      }
    }

    // Cota de los lagos: cada masa de agua se asienta un escalón por debajo de
    // la orilla más baja que la rodea, de modo que se ve una lámina hundida en
    // el paisaje y no un agujero en el fondo de un cañón.
    const waters = [];
    for (const c of g.cells.values()) if (c.terrain === T.WATER) waters.push(c);
    for (const c of waters) {
      let lowest = Infinity;
      for (const n of g.neighbors(c.x, c.y)) {
        if (n.terrain !== T.WATER) lowest = Math.min(lowest, n.height);
      }
      c.height = Number.isFinite(lowest) ? lowest - 1 : 0;
    }
    // Segunda pasada: el interior del lago se nivela con su propia orilla, para
    // que una masa grande no quede escalonada por dentro.
    for (let pass = 0; pass < 3; pass++) {
      for (const c of waters) {
        let min = c.height;
        for (const n of g.neighbors(c.x, c.y)) {
          if (n.terrain === T.WATER) min = Math.min(min, n.height);
        }
        c.height = min;
      }
    }

    // Playas: cualquier terreno bajo que toque agua se vuelve arena.
    for (const c of g.cells.values()) {
      if (c.terrain !== T.GRASS && c.terrain !== T.FOREST) continue;
      if (c.height > 3) continue;
      for (const n of g.neighbors(c.x, c.y)) {
        if (n.terrain === T.WATER) { c.terrain = T.SAND; break; }
      }
    }

    g.version++;
  }

  /** El camino ondula suavemente en vez de saltar entre alturas de ruido. */
  _smoothPathHeights() {
    const s = this.seed;
    for (const r of this.routes) {
      for (const c of r.cells) {
        c.height = Math.round(fbm(c.x * 0.03, c.y * 0.03, s + 555, 2) * 3);
      }
    }
    // Media móvil a lo largo de cada ruta: elimina escalones bruscos.
    for (let pass = 0; pass < 3; pass++) {
      for (const r of this.routes) {
        const cs = r.cells;
        for (let i = 1; i < cs.length - 1; i++) {
          cs[i].height = Math.round((cs[i - 1].height + cs[i].height * 2 + cs[i + 1].height) / 4);
        }
      }
    }
    if (this.core) this.core.height = 1;
  }
}
