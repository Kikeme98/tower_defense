// Comprobaciones de la lógica que no se ve a simple vista en pantalla.
// Ejecutar con: node test.mjs
import assert from 'node:assert/strict';
import { MapGenerator } from './src/world/mapgen.js';
import { T, TERRAIN, isBuildable } from './src/world/grid.js';
import { Enemy, ENEMY_DEFS } from './src/game/enemies.js';
import { Rng } from './src/core/rng.js';
import { drawCards, CARDS } from './src/game/cards.js';
import { TOWER_DEFS } from './src/game/tower-defs.js';

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

// --- Generación del mapa ---
for (const seed of ['a', 'b', 'c', 'semilla-larga', '12345']) {
  const map = new MapGenerator(seed).generateInitial();

  for (let i = 0; i < 12; i++) map.expand();

  for (const r of map.routes) {
    // La ruta debe terminar en el núcleo y empezar en un portal.
    ok(r.cells[r.cells.length - 1] === map.core, `${seed}: la ruta no termina en el núcleo`);
    ok(r.cells[0] === r.spawn, `${seed}: la primera celda no es el portal`);
    ok(r.cells.length > 20, `${seed}: ruta demasiado corta (${r.cells.length})`);

    // Cada paso debe ser a una celda ortogonalmente adyacente: sin saltos.
    for (let i = 0; i < r.cells.length - 1; i++) {
      const a = r.cells[i], b = r.cells[i + 1];
      const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      ok(d === 1, `${seed}: salto de ${d} celdas en la ruta ${r.id} (índice ${i})`);
    }

    // Sin celdas repetidas: un enemigo nunca debe pasar dos veces por el mismo sitio.
    const seen = new Set();
    for (const c of r.cells) {
      ok(!seen.has(c), `${seed}: celda repetida en la ruta ${r.id}`);
      seen.add(c);
    }
  }

  // Debe quedar territorio construible alrededor del camino.
  let buildable = 0;
  for (const c of map.grid.cells.values()) if (!c.path && isBuildable(c.terrain)) buildable++;
  ok(buildable > 200, `${seed}: sólo ${buildable} celdas construibles`);

  // Ninguna celda de camino puede estar marcada como construible.
  for (const c of map.grid.cells.values()) {
    if (c.path) ok(!isBuildable(c.terrain), `${seed}: celda de camino construible`);
  }
}

// Misma semilla, mismo mapa: la generación es determinista.
{
  const a = new MapGenerator('repetible').generateInitial();
  const b = new MapGenerator('repetible').generateInitial();
  a.expand(); b.expand();
  ok(a.grid.cells.size === b.grid.cells.size, 'la generación no es determinista (nº de celdas)');
  const ka = [...a.grid.cells.keys()].sort().join(',');
  const kb = [...b.grid.cells.keys()].sort().join(',');
  ok(ka === kb, 'la generación no es determinista (celdas distintas)');
}

// --- Modelo de daño en tres capas ---
{
  const route = { cells: [{ wx: 0, wz: 0, wy: 0 }, { wx: 2, wz: 0, wy: 0 }] };
  const def = { id: 'x', hp: 100, armor: 100, shield: 100, speed: 1, gold: 1, size: 1, shape: 0, color: 0 };
  // Se normalizan los depósitos a 100 para poder razonar sobre números redondos
  // sin depender de la curva de escalado por oleada.
  const mk = () => {
    const e = new Enemy().spawn(def, route, 1, 1, 0);
    e.health = e.maxHealth = 100;
    e.armor = e.maxArmor = 100;
    e.shield = e.maxShield = 100;
    return e;
  };

  // El daño entra por el escudo y no toca las capas inferiores.
  let e = mk();
  e.damage(50, { h: 1, a: 1, s: 1 });
  ok(e.shield === 50 && e.armor === 100 && e.health === 100, 'el daño no respetó el orden de capas');

  // Un multiplicador alto contra escudo lo rompe antes; el sobrante pasa a armadura
  // reconvertido a daño base, sin desperdiciarse ni duplicarse.
  e = mk();
  e.damage(100, { h: 1, a: 1, s: 2 });
  ok(e.shield === 0, 'el escudo debería haberse roto');
  ok(Math.abs(e.armor - 50) < 1e-9, `sobrante mal convertido: armadura ${e.armor}, se esperaba 50`);

  // Un golpe enorme atraviesa las tres capas y mata.
  e = mk();
  e.damage(1000, { h: 1, a: 1, s: 1 });
  ok(!e.alive && e.health <= 0, 'un golpe letal no mató al enemigo');

  // El multiplicador contra una capa no afecta a las demás.
  e = mk();
  e.damage(100, { h: 1, a: 1, s: 1 });   // rompe el escudo exacto
  e.damage(10, { h: 1, a: 0.5, s: 1 });  // 10 × 0.5 = 5 de armadura
  ok(Math.abs(e.armor - 95) < 1e-9, `multiplicador de armadura mal aplicado: ${e.armor}`);

  // La ralentización se acumula hasta el tope y decae con el tiempo.
  e = mk();
  for (let i = 0; i < 20; i++) e.applySlow(0.1);
  ok(e.slow <= 0.6001, `la ralentización superó el tope: ${e.slow}`);
  const before = e.slow;
  e.update(1, 0);
  ok(e.slow < before, 'la ralentización no decae');

  // El veneno drena su depósito y termina matando.
  e = mk();
  e.damage(1000, { h: 1, a: 1, s: 1 });
  e = mk();
  e.applyDot('poison', 500);
  for (let i = 0; i < 600 && e.alive; i++) e.update(1 / 60, i / 60);
  ok(!e.alive, 'el veneno no llegó a matar');
}

// --- Progreso y llegada al núcleo ---
{
  const cells = Array.from({ length: 10 }, (_, i) => ({ wx: i * 2, wz: 0, wy: 0 }));
  const route = { cells };
  const def = { id: 'y', hp: 10, armor: 0, shield: 0, speed: 4, gold: 1, size: 1, shape: 0, color: 0 };
  const e = new Enemy().spawn(def, route, 1, 1, 0);
  ok(e.progress === 0, 'el progreso inicial no es 0');
  for (let i = 0; i < 600 && e.alive; i++) e.update(1 / 60, 0);
  ok(e.reachedCore, 'el enemigo no llegó al núcleo');
}

// --- Cartas ---
{
  const rng = new Rng('cartas');
  const state = {
    gold: 0, lives: 10, maxLives: 10, sector: 3, interest: 0, veinGold: 0, goldPerTowerType: 1,
    global: { synergy: {} }, synergy: {}, curse: {}, taken: new Set(),
    unlocked: new Set(['crossbow']),
  };
  for (let i = 0; i < 60; i++) {
    const cards = drawCards(rng, state, 3);
    ok(cards.length > 0, 'el mazo se quedó sin cartas');
    ok(new Set(cards.map((c) => c.id)).size === cards.length, 'draft con cartas repetidas');
    const pick = cards[i % cards.length];
    pick.apply(state);
    if (pick.unique) state.taken.add(pick.id);
  }
  // Toda carta única sólo puede tomarse una vez.
  for (const c of CARDS) {
    if (c.unique && state.taken.has(c.id)) {
      const drawn = drawCards(rng, state, 3);
      ok(!drawn.includes(c), `la carta única ${c.id} volvió a ofrecerse`);
    }
  }
}

// --- Cámara: direcciones de WASD ---
// Es matemática pura de vectores y ya se torció una vez (los senos con el signo
// cambiado mandaban la cámara a 90° de donde miraba), así que se fija aquí.
{
  const { PerspectiveCamera } = await import('three');
  const { CameraRig } = await import('./src/engine/camera-rig.js');

  const fakeInput = () => ({
    keys: new Set(), buttons: new Set(), dragging: false, wheel: 0,
    dragDelta: { x: 0, y: 0 }, mouse: { ndcX: 0, ndcY: 0 },
    isDown(c) { return this.keys.has(c); },
  });

  const inp = fakeInput();
  const rig = new CameraRig(new PerspectiveCamera(50, 1.6, 0.5, 800), inp);

  // Hacia dónde mira la cámara proyectado al suelo, y su derecha en pantalla.
  const look = (yaw) => [-Math.sin(yaw), -Math.cos(yaw)];
  const right = (yaw) => [Math.cos(yaw), -Math.sin(yaw)];
  const neg = ([x, z]) => [-x, -z];

  const held = (code, yaw) => {
    rig.desiredTarget.set(0, 0, 0);
    rig.target.set(0, 0, 0);
    rig.yaw = yaw;
    rig.pitch = 0.95;
    rig.dist = rig.desiredDist = 46;
    inp.keys.clear();
    inp.keys.add(code);
    for (let i = 0; i < 30; i++) rig.update(1 / 60);
    inp.keys.clear();
    const d = rig.desiredTarget;
    const len = Math.hypot(d.x, d.z);
    return { dir: [d.x / len, d.z / len], len };
  };

  const alineado = (a, b) => a[0] * b[0] + a[1] * b[1] > 0.999;

  for (const yaw of [0, 0.785, 1.571, 2.356, 3.142, 4.0, 5.5]) {
    const w = held('KeyW', yaw), s = held('KeyS', yaw);
    const a = held('KeyA', yaw), d = held('KeyD', yaw);
    ok(alineado(w.dir, look(yaw)), `yaw ${yaw}: W no avanza hacia donde mira la cámara`);
    ok(alineado(s.dir, neg(look(yaw))), `yaw ${yaw}: S no retrocede`);
    ok(alineado(d.dir, right(yaw)), `yaw ${yaw}: D no va a la derecha de la pantalla`);
    ok(alineado(a.dir, neg(right(yaw))), `yaw ${yaw}: A no va a la izquierda`);
    // Media pantalla por segundo aproximadamente: ni inservible ni incontrolable.
    ok(w.len > 5 && w.len < 40, `yaw ${yaw}: avance de ${w.len.toFixed(1)} uds en 0,5 s`);
  }

  // Las diagonales no deben ser más rápidas que los ejes.
  rig.desiredTarget.set(0, 0, 0); rig.target.set(0, 0, 0);
  rig.yaw = 0.5; rig.dist = rig.desiredDist = 46;
  inp.keys.clear(); inp.keys.add('KeyW'); inp.keys.add('KeyD');
  for (let i = 0; i < 30; i++) rig.update(1 / 60);
  inp.keys.clear();
  const diag = Math.hypot(rig.desiredTarget.x, rig.desiredTarget.z);
  const recto = held('KeyW', 0.5).len;
  ok(Math.abs(diag - recto) < 0.01, `la diagonal (${diag.toFixed(1)}) no iguala al eje (${recto.toFixed(1)})`);

  // La inclinación se mantiene siempre dentro del rango utilizable.
  rig.pitch = -5; rig.update(1 / 60);
  ok(rig.pitch >= 0.65 && rig.pitch <= 1.45, `inclinación fuera de rango: ${rig.pitch}`);
  rig.pitch = 99; rig.update(1 / 60);
  ok(rig.pitch >= 0.65 && rig.pitch <= 1.45, `inclinación fuera de rango: ${rig.pitch}`);
}

// --- Coherencia del catálogo ---
{
  const ids = new Set();
  for (const d of TOWER_DEFS) {
    ok(!ids.has(d.id), `id de torre duplicado: ${d.id}`);
    ids.add(d.id);
    ok(d.vs && d.vs.h > 0 && d.vs.a > 0 && d.vs.s > 0, `${d.id}: multiplicadores vs incompletos`);
    ok(d.cost > 0 && d.priceStep > 0, `${d.id}: precio mal definido`);
    ok(d.geo, `${d.id}: sin geometría`);
  }
  const eids = new Set();
  for (const d of ENEMY_DEFS) {
    ok(!eids.has(d.id), `id de enemigo duplicado: ${d.id}`);
    eids.add(d.id);
    ok(d.hp > 0 && d.speed > 0, `${d.id}: estadísticas inválidas`);
    ok(d.shape >= 0 && d.shape <= 5, `${d.id}: forma fuera de rango`);
  }
  // Debe haber al menos una torre capaz de atacar aéreos desde el principio.
  const air = TOWER_DEFS.filter((d) => !d.unlock && (d.targets === 'both' || d.targets === 'air'));
  ok(air.length > 0, 'ninguna torre inicial puede atacar a los voladores');
}

console.log(`✓ ${checks} comprobaciones correctas`);
