/**
 * Niveles de calidad gráfica.
 *
 * El juego se veía bien en una máquina potente y se arrastraba en una modesta
 * porque tenía activado sin condiciones lo más caro que hay: oclusión ambiental,
 * resplandor, sombras grandes, multimuestreo y densidad de píxel doble.
 *
 * Aquí se define qué se apaga en cada nivel, se estima uno inicial a partir del
 * hardware y, sobre todo, se vigila el ritmo real: si el equipo no llega, baja
 * solo. La medición manda sobre la heurística, que sólo sirve para no empezar
 * con la peor opción posible.
 */

export const PRESETS = {
  low: {
    name: 'Bajo',
    post: false,          // sin composer: se dibuja directo a pantalla
    gtao: false,
    bloom: false,
    msaa: 0,
    shadows: false,
    shadowSize: 512,
    maxDpr: 1,
    decoDensity: 0,       // sin árboles, hierba ni rocas sueltas
    waterSub: 1,          // lámina de agua casi plana
    waterDetail: false,   // sin normales por diferencias ni espuma de cresta
    particleScale: 0.3,
    maxParticles: 400,
    fogFar: 0.011,        // más niebla: menos terreno lejano visible
  },
  medium: {
    name: 'Medio',
    post: true,
    gtao: false,          // la oclusión ambiental es lo más caro de todo
    bloom: true,
    msaa: 2,
    shadows: true,
    shadowSize: 1024,
    maxDpr: 1.35,
    decoDensity: 0.55,
    waterSub: 2,
    waterDetail: true,
    particleScale: 0.7,
    maxParticles: 1200,
    fogFar: 0.0075,
  },
  high: {
    name: 'Alto',
    post: true,
    gtao: true,
    bloom: true,
    msaa: 4,
    shadows: true,
    shadowSize: 2048,
    maxDpr: 2,
    decoDensity: 1,
    waterSub: 3,
    waterDetail: true,
    particleScale: 1,
    maxParticles: 3000,
    fogFar: 0.0055,
  },
};

export const LEVELS = ['low', 'medium', 'high'];

/** Nombre de la GPU, si el navegador lo expone. */
function gpuName(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return '';
    return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '').toLowerCase();
  } catch { return ''; }
}

/**
 * Conjetura inicial. No pretende acertar: sólo evitar que una máquina modesta
 * arranque en alto y pase los primeros segundos a trompicones.
 */
export function guessQuality(renderer) {
  const gpu = gpuName(renderer);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;

  // Gráficas integradas antiguas y móviles: directamente el nivel bajo.
  const weak = /(intel).*(hd|uhd) graphics (5|6|4|3)|mali|adreno [1-5]|powervr|videocore|swiftshader|llvmpipe/;
  if (weak.test(gpu)) return 'low';
  if (cores <= 2 || mem <= 2) return 'low';

  const strong = /(rtx|radeon rx|apple m[1-9]|geforce (gtx 1[06]|rtx))/;
  if (strong.test(gpu) && cores >= 8) return 'high';

  if (cores <= 4 || mem <= 4 || /intel|integrated/.test(gpu)) return 'medium';
  return 'high';
}

/**
 * Vigila el ritmo y ajusta el nivel.
 *
 * Baja rápido —un jugador que va a tirones lo nota de inmediato— y sube muy
 * despacio y una sola vez, para no entrar en un ciclo de subir y bajar que
 * resulta peor que quedarse en el nivel de abajo.
 */
export class QualityMonitor {
  constructor(level, onChange) {
    this.level = level;
    this.onChange = onChange;
    this.samples = [];
    this.cooldown = 2.5;   // margen tras arrancar o tras cambiar de nivel
    this.raisedOnce = false;
    this.locked = false;   // si el jugador elige a mano, se deja de tocar
  }

  lock() { this.locked = true; }

  /** @param {number} dt segundos reales del último frame */
  update(dt) {
    if (this.locked) return;
    if (this.cooldown > 0) { this.cooldown -= dt; return; }

    this.samples.push(dt);
    if (this.samples.length < 90) return;

    // Mediana: un pico aislado por recolección de basura no debe decidir nada.
    const sorted = this.samples.slice().sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    this.samples.length = 0;

    const idx = LEVELS.indexOf(this.level);
    if (median > 1 / 40 && idx > 0) {
      this._set(LEVELS[idx - 1], median);
    } else if (median < 1 / 110 && idx < LEVELS.length - 1 && !this.raisedOnce) {
      this.raisedOnce = true;
      this._set(LEVELS[idx + 1], median);
    }
  }

  _set(level, median) {
    this.level = level;
    this.cooldown = 4;
    this.onChange(level, Math.round(1 / median));
  }
}
