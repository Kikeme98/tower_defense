// Todos los números que definen la curva de dificultad viven aquí.
// Tocar el juego = tocar este archivo, no perseguir constantes por el código.

export const BALANCE = {
  startGold: 320,
  startLives: 20,

  // Escalado enemigo por oleada. El exponencial es lo que obliga a mejorar
  // torres en vez de limitarse a construir más; el oro crece mucho más despacio.
  // Calibrado con el bot de smoke.mjs: por debajo de esto la partida se vuelve
  // trivial, por encima es imposible antes de tener torres desbloqueadas.
  hpExp: 1.115,
  // El exponente crece con la oleada: si fuese constante, a partir de cierto
  // punto acumular torres gana siempre y la partida se vuelve un trámite.
  hpExpGrowth: 0.0005,
  hpLinear: 0.04,
  speedPerWave: 0.005,
  goldPerWave: 0.028,

  // Cuántos enemigos y de qué tipo.
  baseCount: 7,
  countPerWave: 1.35,
  countMax: 90,
  spawnInterval: 0.62,     // segundos entre enemigos de la misma tanda
  spawnIntervalMin: 0.16,

  bossEvery: 10,
  bossHpMult: 32,
  bossGoldMult: 14,

  // Un sector = un tramo de oleadas. Al cambiar de sector el mapa crece.
  wavesPerSector: 5,
  sectorDifficulty: 1.08,  // multiplicador de vida adicional por sector

  // Oro entre oleadas: interés sobre lo ahorrado, con tope. Premia no gastar
  // todo de golpe sin convertirse en la única estrategia.
  waveBonusBase: 25,
  waveBonusPerWave: 7,
  interest: 0.05,
  interestCap: 60,

  // Coste de reventa: se recupera parte de lo invertido.
  sellRatio: 0.6,

  // Draft: cartas ofrecidas al terminar cada oleada.
  cardChoices: 3,
};

/** Multiplicador de vida para una oleada dada. */
export function hpScale(wave, sector) {
  const exp = BALANCE.hpExp + wave * BALANCE.hpExpGrowth;
  return Math.pow(exp, wave - 1)
    * (1 + wave * BALANCE.hpLinear)
    * Math.pow(BALANCE.sectorDifficulty, sector - 1);
}

export function goldScale(wave) {
  return 1 + (wave - 1) * BALANCE.goldPerWave;
}

export function enemyCount(wave) {
  return Math.min(
    BALANCE.countMax,
    Math.round(BALANCE.baseCount + (wave - 1) * BALANCE.countPerWave),
  );
}

export const isBossWave = (wave) => wave % BALANCE.bossEvery === 0;
export const sectorOf = (wave) => Math.floor((wave - 1) / BALANCE.wavesPerSector) + 1;
