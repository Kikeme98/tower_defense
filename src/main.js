import { Renderer } from './engine/renderer.js';
import { Input } from './core/input.js';
import { Loop } from './core/loop.js';
import { Game } from './game/game.js';
import { HUD } from './ui/hud.js';
import { TOWERS } from './game/tower-defs.js';
import { BALANCE } from './game/balance.js';
import { QualityMonitor, PRESETS, LEVELS } from './engine/quality.js';

/**
 * Arranque.
 *
 * El coste de entrada no está en descargar ni en generar el mapa (milisegundos),
 * sino en que WebGL compila más de treinta programas de sombreado la primera vez
 * que se dibuja. Eso bloquea el hilo principal de golpe. Aquí se reparte en
 * fases con la pantalla de carga delante, y se usa compilación asíncrona cuando
 * el navegador la soporta para no congelar la página.
 */

const boot = document.getElementById('boot');
const bootBar = document.getElementById('boot-bar');
const bootStep = document.getElementById('boot-step');

/** Actualiza la pantalla de carga y cede el hilo para que llegue a pintarse. */
function step(pct, text) {
  if (bootBar) bootBar.style.width = pct + '%';
  if (bootStep && text) bootStep.textContent = text;
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    // Dos frames: uno para aplicar el estilo y otro para que se pinte de verdad.
    requestAnimationFrame(() => requestAnimationFrame(finish));
    // Respaldo obligatorio: en una pestaña de segundo plano el navegador no
    // ejecuta requestAnimationFrame, y sin esto el arranque se queda colgado
    // para siempre en vez de terminar sin animación.
    setTimeout(finish, 80);
  });
}

const canvas = document.getElementById('viewport');
const renderer = new Renderer(canvas);
const input = new Input(canvas);

await step(20, 'Preparando el motor…');

// ?seed=loquesea reproduce exactamente la misma partida.
const seed = new URLSearchParams(location.search).get('seed') || String(Date.now());
const game = new Game(renderer, input, seed);

await step(45, 'Generando el mapa…');

const quality = new QualityMonitor(renderer.quality, (level, fps) => {
  renderer.setQuality(level);
  game.applyQuality(PRESETS[level]);
  hud.onQualityChange(level, fps);
});

const loop = new Loop({
  hz: 60,
  update: (dt) => game.update(dt),
  render: (alpha, frameTime) => {
    quality.update(frameTime);
    // La entrada de un solo frame se consume aquí, no en la simulación: así no
    // se duplica cuando el bucle ejecuta varios sub-pasos. Los atajos siguen
    // activos con el ratón sobre un panel; sólo los clics sobre el mapa no.
    if (input.clicked !== null && !input.blocked) game.handleClick(input.clicked);
    for (const code of input.pressed) hud.handleKey(code);
    game.render(frameTime);
    hud.update();
    input.endFrame();
  },
});

const hud = new HUD(game, loop, {
  levels: LEVELS,
  current: () => renderer.quality,
  set: (level) => {
    quality.lock(); // elección manual: el vigilante deja de intervenir
    renderer.setQuality(level);
    game.applyQuality(PRESETS[level]);
  },
});
game.applyQuality(PRESETS[renderer.quality]);

await step(65, 'Compilando efectos…');

// Compilación asíncrona: con KHR_parallel_shader_compile el trabajo se va a
// hilos del driver y la página sigue respondiendo. Si el navegador no lo
// soporta, three cae a compilación normal y sólo perdemos el reparto.
try {
  await renderer.renderer.compileAsync(renderer.scene, renderer.camera);
} catch {
  // Un fallo aquí no es fatal: los shaders se compilarán al primer dibujado.
}

await step(85, 'Ajustando la escena…');

// Primer dibujado completo, ya con casi todo compilado. Incluye las pasadas de
// postprocesado, cuyos shaders no entran en compileAsync.
game.render(1 / 60);

await step(100, 'Listo');

loop.start();

boot.classList.add('done');
setTimeout(() => boot.remove(), 500);

// Acceso desde la consola del navegador para depurar y trastear con el balance.
globalThis.spire = { game, loop, renderer, input, TOWERS, BALANCE, quality, PRESETS };
