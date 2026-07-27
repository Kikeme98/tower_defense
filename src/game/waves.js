import { BALANCE, enemyCount, isBossWave } from './balance.js';
import { ENEMY_DEFS, BOSS_DEF, pickEnemyDef } from './enemies.js';

/**
 * Director de oleadas: construye la cola de apariciones antes de empezar
 * (así la composición es determinista respecto a la semilla) y la va soltando
 * por tiempo. Los enemigos salen en tandas del mismo tipo para que la oleada
 * se lea de un vistazo y el jugador pueda reaccionar.
 */
export class WaveDirector {
  constructor(rng) {
    this.rng = rng;
    this.queue = [];
    this.cursor = 0;
    this.timer = 0;
    this.active = false;
    this.plan = [];
  }

  start(wave, sector, routes, curse) {
    const rng = this.rng;
    this.queue.length = 0;
    this.cursor = 0;
    this.timer = 0;
    this.active = true;

    const total = Math.round(enemyCount(wave) * (curse.count || 1));
    const interval = Math.max(
      BALANCE.spawnIntervalMin,
      BALANCE.spawnInterval - wave * 0.008,
    );

    let t = 0;
    let placed = 0;
    const counts = new Map();

    while (placed < total) {
      const def = pickEnemyDef(rng, wave);
      const batch = Math.min(total - placed, def.burst || rng.int(3, 6));
      // Cada tanda entra por una ruta; con varias rutas hay que cubrir todos los frentes.
      const route = routes[rng.int(0, routes.length - 1)];
      for (let i = 0; i < batch; i++) {
        this.queue.push({
          def, route, at: t,
          lane: rng.float(-0.85, 0.85),
          hpMult: curse.hp || 1,
        });
        t += def.burst ? interval * 0.25 : interval;
        placed++;
      }
      counts.set(def.name, (counts.get(def.name) || 0) + batch);
      t += interval * 0.8; // respiro entre tandas
    }

    if (isBossWave(wave)) {
      const bosses = 1 + Math.floor((sector - 1) / 4);
      for (let i = 0; i < bosses; i++) {
        this.queue.push({
          def: BOSS_DEF,
          route: routes[i % routes.length],
          at: t + i * 2.5,
          lane: 0,
          hpMult: BALANCE.bossHpMult * (curse.hp || 1),
        });
      }
      counts.set(BOSS_DEF.name, bosses);
    }

    this.queue.sort((a, b) => a.at - b.at);
    this.duration = this.queue.length ? this.queue[this.queue.length - 1].at : 0;
    this.plan = [...counts.entries()].map(([name, n]) => ({ name, n }));
    return this.plan;
  }

  /** Saca de la cola lo que toque; devuelve true cuando ya no queda nada por aparecer. */
  update(dt, spawnFn) {
    if (!this.active) return true;
    this.timer += dt;
    while (this.cursor < this.queue.length && this.queue[this.cursor].at <= this.timer) {
      const s = this.queue[this.cursor++];
      spawnFn(s);
    }
    if (this.cursor >= this.queue.length) {
      this.active = false;
      return true;
    }
    return false;
  }

  get remaining() {
    return this.queue.length - this.cursor;
  }

  /** Vista previa de la siguiente oleada, para el HUD. */
  static preview(rng, wave, curse) {
    const total = Math.round(enemyCount(wave) * (curse.count || 1));
    return { total, boss: isBossWave(wave) };
  }
}
