// Juega partidas completas sin navegador, con un renderer simulado.
// Ejercita todos los sistemas (mapa, torres, enemigos, proyectiles, cartas,
// expansión de sector) y falla ante cualquier error de ejecución o valor
// imposible. Ejecutar con: node smoke.mjs
import * as THREE from 'three';
import { Game, PHASE } from './src/game/game.js';
import { TOWER_DEFS } from './src/game/tower-defs.js';
import { UPGRADE_PATHS } from './src/game/tower-defs.js';
import { Rng } from './src/core/rng.js';

// El juego sólo pide a la capa de render una escena, una cámara y que dibuje.
const fakeRenderer = () => ({
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(50, 1.6, 0.5, 800),
  followShadow() {},
  update() {},
  setSector() {},
  render() {},
});

const fakeInput = () => ({
  keys: new Set(), pressed: new Set(), buttons: new Set(),
  mouse: { x: 0, y: 0, ndcX: 0, ndcY: 0 }, dragDelta: { x: 0, y: 0 },
  wheel: 0, clicked: null, blocked: false,
  isDown: () => false, wasPressed: () => false, setBlocked() {}, endFrame() {},
});

const DT = 1 / 60;

function playRun(seed, maxWaves) {
  const game = new Game(fakeRenderer(), fakeInput(), seed);
  const rng = new Rng('bot-' + seed);
  const stats = { waves: 0, kills: 0, built: 0, upgraded: 0, maxEnemies: 0, frames: 0 };

  const step = () => {
    game.update(DT);
    game.render(DT);
    stats.frames++;
    stats.maxEnemies = Math.max(stats.maxEnemies, game.enemies.count);
    // Ningún valor puede salirse de rango sin que sea un error real.
    if (!Number.isFinite(game.state.gold)) throw new Error('oro no finito');
    if (game.state.gold < 0) throw new Error('oro negativo');
    for (const e of game.enemies.list) {
      if (!Number.isFinite(e.x) || !Number.isFinite(e.z)) throw new Error('enemigo en posición no finita');
      if (!Number.isFinite(e.health)) throw new Error('salud no finita');
    }
    for (const t of game.towers.towers) {
      if (!Number.isFinite(t.stats.damage) || t.stats.damage < 0) throw new Error(`daño inválido en ${t.def.id}`);
      if (!Number.isFinite(t.stats.range) || t.stats.range <= 0) throw new Error(`alcance inválido en ${t.def.id}`);
    }
  };

  // Estrategia del bot: gastar casi todo el oro cada fase de construcción,
  // alternando entre torres nuevas y mejoras de las existentes.
  const spend = () => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const wantUpgrade = game.towers.towers.length > 3 && rng.bool(0.55);
      if (wantUpgrade) {
        const t = rng.pick(game.towers.towers);
        const path = rng.pick(UPGRADE_PATHS);
        const cost = t.upgradeCost(path.id);
        if (cost !== null && cost <= game.state.gold) {
          game.upgradeTower(t, path.id);
          stats.upgraded++;
          continue;
        }
      }
      const options = TOWER_DEFS.filter((d) => game.state.unlocked.has(d.id)
        && game.costOf(d) <= game.state.gold);
      if (!options.length) break;
      const def = rng.pick(options);
      // Concentra la defensa junto al camino y cerca del núcleo, que es como
      // juega una persona; repartir torres por todo el mapa diluye el daño.
      const cells = [...game.grid.cells.values()]
        .filter((c) => game.towers.canPlace(c, def) && c.pathDist >= 1 && c.pathDist <= 3)
        .sort((a, b) => (a.x * a.x + a.y * a.y) - (b.x * b.x + b.y * b.y))
        .slice(0, 45);
      if (!cells.length) break;
      game.selectedDef = def;
      if (game.place(rng.pick(cells))) stats.built++;
      game.selectedDef = null;
    }
  };

  while (stats.waves < maxWaves && game.phase !== PHASE.GAMEOVER) {
    if (game.phase === PHASE.BUILD) {
      spend();
      game.startWave();
      stats.waves++;
    } else if (game.phase === PHASE.DRAFT) {
      game.chooseCard(rng.pick(game.cards));
    } else {
      step();
    }
    // Salvaguarda: una oleada no puede durar eternamente.
    if (stats.frames > 60 * 60 * 90) throw new Error('la partida no progresa');
  }

  stats.kills = game.state.kills;
  return { game, stats };
}

const MAX_WAVES = Number(process.argv[2]) || 26;
let failed = 0;
for (const seed of ['smoke-1', 'smoke-2', 'smoke-3']) {
  try {
    const t0 = performance.now();
    const { game, stats } = playRun(seed, MAX_WAVES);
    const ms = (performance.now() - t0) / stats.frames;
    const s = game.state;
    const routes = game.map.routes.length;
    console.log(
      `${seed}: oleada ${s.wave} · sector ${s.sector} · ${stats.kills} bajas · ` +
      `${game.towers.towers.length} torres (${stats.built} construidas, ${stats.upgraded} mejoras) · ` +
      `${routes} rutas · ${game.grid.cells.size} celdas · pico ${stats.maxEnemies} enemigos · ` +
      `vidas ${s.lives}/${s.maxLives} · ${game.phase} · ${ms.toFixed(2)} ms/frame`,
    );
    const leaks = Object.entries(s.leakedBy).sort((a, b) => b[1] - a[1]);
    if (leaks.length) console.log(`         se colaron: ${leaks.map(([n, c]) => `${n} ×${c}`).join(', ')}`);
    if (s.wave < 10) { console.error(`  ✗ ${seed}: la partida acabó demasiado pronto`); failed++; }
    if (game.towers.towers.length === 0) { console.error(`  ✗ ${seed}: no se construyó ninguna torre`); failed++; }
    if (stats.kills === 0) { console.error(`  ✗ ${seed}: cero bajas`); failed++; }
  } catch (err) {
    console.error(`  ✗ ${seed}: ${err.stack}`);
    failed++;
  }
}

console.log(failed ? `\n✗ ${failed} fallos` : '\n✓ simulación completa sin errores');
process.exit(failed ? 1 : 0);
