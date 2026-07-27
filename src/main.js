import { Renderer } from './engine/renderer.js';
import { Input } from './core/input.js';
import { Loop } from './core/loop.js';
import { Game } from './game/game.js';
import { HUD } from './ui/hud.js';
import { TOWERS } from './game/tower-defs.js';
import { BALANCE } from './game/balance.js';
import { QualityMonitor, PRESETS, LEVELS } from './engine/quality.js';

const canvas = document.getElementById('viewport');
const renderer = new Renderer(canvas);
const input = new Input(canvas);

// ?seed=loquesea reproduce exactamente la misma partida.
const seed = new URLSearchParams(location.search).get('seed') || String(Date.now());
const game = new Game(renderer, input, seed);

// Vigila el ritmo real y baja la calidad si el equipo no llega.
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
loop.start();

// Acceso desde la consola del navegador para depurar y trastear con el balance.
globalThis.spire = { game, loop, renderer, input, TOWERS, BALANCE, quality, PRESETS };
