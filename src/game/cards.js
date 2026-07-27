import { TOWER_DEFS, TOWERS } from './tower-defs.js';

/**
 * Draft roguelike: al terminar cada oleada se ofrecen tres cartas y se elige una.
 * Las cartas son la progresión real de la partida —el oro sólo compra torres—
 * y algunas son maldiciones: suben la dificultad a cambio de más recompensa.
 */

export const RARITY = {
  common: { name: 'Común', color: '#9fb4c8', weight: 100 },
  rare: { name: 'Rara', color: '#5aa8ff', weight: 42 },
  epic: { name: 'Épica', color: '#c46bff', weight: 15 },
  curse: { name: 'Pacto', color: '#ff6b6b', weight: 26 },
};

const g = (s, stat, amount) => ({
  apply: (st) => { st.global[stat] = (st.global[stat] || 1) * amount; },
});

export const CARDS = [
  // --- Poder de combate ---
  { id: 'dmg1', name: 'Filo afilado', rarity: 'common', desc: '+15% daño de todas las torres', icon: '⚔', ...g(0, 'damage', 1.15) },
  { id: 'dmg2', name: 'Forja de guerra', rarity: 'rare', desc: '+30% daño de todas las torres', icon: '⚔', ...g(0, 'damage', 1.30) },
  { id: 'rate1', name: 'Mecanismo ágil', rarity: 'common', desc: '+15% cadencia de disparo', icon: '⟳', ...g(0, 'fireRate', 1.15) },
  { id: 'rate2', name: 'Frenesí', rarity: 'rare', desc: '+28% cadencia de disparo', icon: '⟳', ...g(0, 'fireRate', 1.28) },
  { id: 'range1', name: 'Lente de vigía', rarity: 'common', desc: '+12% alcance', icon: '◎', ...g(0, 'range', 1.12) },
  { id: 'range2', name: 'Ojo del halcón', rarity: 'rare', desc: '+25% alcance', icon: '◎', ...g(0, 'range', 1.25) },
  { id: 'splash1', name: 'Pólvora inestable', rarity: 'common', desc: '+30% radio de daño en área', icon: '✸', ...g(0, 'splash', 1.30) },
  {
    id: 'crit1', name: 'Punto débil', rarity: 'rare', desc: '+25% de probabilidad de crítico', icon: '✦',
    apply: (st) => { st.global.critChance = (st.global.critChance || 0) + 0.25; },
  },
  {
    id: 'crit2', name: 'Golpe letal', rarity: 'epic', desc: '+1 al multiplicador de todos los críticos',
    icon: '✦', requires: (st) => (st.global.critChance || 0) > 0,
    apply: (st) => { st.global.critBonus = (st.global.critBonus || 0) + 1; },
  },

  // --- Especialización contra capas ---
  { id: 'vs_h', name: 'Corta-carne', rarity: 'common', desc: '+35% de daño contra SALUD', icon: '❤', ...g(0, 'vsHealth', 1.35) },
  { id: 'vs_a', name: 'Rompe-placas', rarity: 'common', desc: '+35% de daño contra ARMADURA', icon: '▣', ...g(0, 'vsArmor', 1.35) },
  { id: 'vs_s', name: 'Disruptor', rarity: 'common', desc: '+35% de daño contra ESCUDO', icon: '◈', ...g(0, 'vsShield', 1.35) },
  {
    id: 'breaker', name: 'Ariete', rarity: 'epic', unique: true, icon: '➤',
    desc: '+30% de daño contra armadura Y escudo: rompe cualquier defensa',
    apply: (st) => {
      st.global.vsArmor = (st.global.vsArmor || 1) * 1.30;
      st.global.vsShield = (st.global.vsShield || 1) * 1.30;
    },
  },
  {
    id: 'dot1', name: 'Corrosión', rarity: 'rare', icon: '☣',
    desc: '+60% de hemorragia, fuego y veneno aplicados',
    apply: (st) => { st.global.dotMult = (st.global.dotMult || 1) * 1.60; },
  },
  {
    id: 'dot2', name: 'Putrefacción', rarity: 'epic', unique: true, icon: '☣',
    desc: 'Los venenos se aplican al doble. Recuerda: cada veneno bloquea la regeneración de su capa',
    requires: (st) => (st.global.dotMult || 1) > 1,
    apply: (st) => { st.global.dotMult = (st.global.dotMult || 1) * 2.0; },
  },

  // --- Economía ---
  {
    id: 'gold1', name: 'Botín de guerra', rarity: 'common', desc: '+20% oro por enemigo', icon: '⬢',
    apply: (st) => { st.global.goldMult = (st.global.goldMult || 1) * 1.20; },
  },
  {
    id: 'gold2', name: 'Saqueo', rarity: 'rare', desc: '+40% oro por enemigo', icon: '⬢',
    apply: (st) => { st.global.goldMult = (st.global.goldMult || 1) * 1.40; },
  },
  {
    id: 'interest', name: 'Usurero', rarity: 'rare', desc: '+4% de interés sobre el oro ahorrado entre oleadas', icon: '⬢',
    apply: (st) => { st.interest += 0.04; },
  },
  {
    id: 'discount', name: 'Gremio de ingenieros', rarity: 'rare', desc: 'Las torres cuestan un 15% menos', icon: '⬢',
    apply: (st) => { st.global.costMult = (st.global.costMult || 1) * 0.85; },
  },
  {
    id: 'cash', name: 'Arcón olvidado', rarity: 'common', desc: 'Recibes 220 de oro al instante', icon: '⬢',
    apply: (st) => { st.gold += 220; },
  },
  {
    id: 'prospect', name: 'Prospección', rarity: 'rare', icon: '◆',
    desc: '+25 de oro por oleada por cada filón con una torre adyacente',
    apply: (st) => { st.veinGold += 25; },
  },
  {
    id: 'diversify', name: 'Arsenal variado', rarity: 'rare', icon: '⬢',
    desc: '+3 de oro extra por cada TIPO de torre distinto que dañe a un enemigo',
    apply: (st) => { st.goldPerTowerType += 3; },
  },

  // --- Supervivencia ---
  {
    id: 'lives1', name: 'Muralla reforzada', rarity: 'common', desc: '+5 vidas del núcleo', icon: '♥',
    apply: (st) => { st.lives += 5; st.maxLives += 5; },
  },
  {
    id: 'lives2', name: 'Ciudadela', rarity: 'epic', desc: '+12 vidas y restaura 5', icon: '♥',
    apply: (st) => { st.maxLives += 12; st.lives = Math.min(st.maxLives, st.lives + 17); },
  },
  {
    id: 'repair', name: 'Reparaciones', rarity: 'common', desc: 'Restaura 4 vidas', icon: '♥',
    requires: (st) => st.lives < st.maxLives,
    apply: (st) => { st.lives = Math.min(st.maxLives, st.lives + 4); },
  },

  // --- Sinergias de terreno ---
  {
    id: 'highground', name: 'Ventaja del terreno', rarity: 'rare', unique: true, icon: '⛰',
    desc: 'Las torres en altura ganan +6% de daño por nivel de elevación',
    apply: (st) => { st.synergy.height = (st.synergy.height || 0) + 0.06; },
  },
  {
    id: 'forestry', name: 'Emboscada', rarity: 'rare', unique: true, icon: '🌲',
    desc: 'Las torres en bosque ganan +35% de daño adicional',
    apply: (st) => { st.synergy.forest = (st.synergy.forest || 0) + 0.35; },
  },
  {
    id: 'clustering', name: 'Fuego cruzado', rarity: 'epic', unique: true, icon: '⊞',
    desc: 'Cada torre adyacente a otra torre otorga +7% de cadencia a ambas',
    apply: (st) => { st.synergy.adjacency = (st.synergy.adjacency || 0) + 0.07; },
  },

  // --- Pactos: más dificultad a cambio de más poder ---
  {
    id: 'curse_hp', name: 'Pacto de la carne', rarity: 'curse', icon: '☠',
    desc: 'Los enemigos tienen +30% de vida, pero ganas +55% de oro',
    apply: (st) => {
      st.curse.hp = (st.curse.hp || 1) * 1.30;
      st.global.goldMult = (st.global.goldMult || 1) * 1.55;
    },
  },
  {
    id: 'curse_speed', name: 'Pacto de la prisa', rarity: 'curse', icon: '☠',
    desc: 'Los enemigos son un 20% más rápidos, pero todas las torres ganan +30% de daño',
    apply: (st) => {
      st.curse.speed = (st.curse.speed || 1) * 1.20;
      st.global.damage = (st.global.damage || 1) * 1.30;
    },
  },
  {
    id: 'curse_count', name: 'Pacto de la horda', rarity: 'curse', icon: '☠',
    desc: '+35% de enemigos por oleada, pero +35% de cadencia en todas las torres',
    apply: (st) => {
      st.curse.count = (st.curse.count || 1) * 1.35;
      st.global.fireRate = (st.global.fireRate || 1) * 1.35;
    },
  },
  {
    id: 'curse_glass', name: 'Pacto de cristal', rarity: 'curse', unique: true, icon: '☠',
    desc: 'Pierdes la mitad de tus vidas, pero todas las torres ganan +65% de daño',
    requires: (st) => st.lives > 6,
    apply: (st) => {
      st.lives = Math.ceil(st.lives / 2);
      st.global.damage = (st.global.damage || 1) * 1.65;
    },
  },
  {
    id: 'curse_armor', name: 'Pacto del yunque', rarity: 'curse', icon: '☠',
    desc: '+40% de armadura y escudo enemigos, pero recibes 400 de oro y +25% de alcance',
    apply: (st) => {
      st.curse.armorBoost = (st.curse.armorBoost || 0) + 0.40;
      st.gold += 400;
      st.global.range = (st.global.range || 1) * 1.25;
    },
  },
];

// Una carta de desbloqueo por cada torre bloqueada, generadas a partir del catálogo.
for (const def of TOWER_DEFS.filter((d) => d.unlock)) {
  CARDS.push({
    id: `unlock_${def.id}`,
    name: `Plano: ${def.name}`,
    rarity: def.cost > 200 ? 'epic' : 'rare',
    desc: def.desc,
    icon: '✚',
    unique: true,
    weightBonus: 2.2, // desbloquear torres nuevas debe salir a menudo: es lo que da variedad
    requires: (st) => !st.unlocked.has(def.id),
    apply: (st) => { st.unlocked.add(def.id); st.justUnlocked = def.id; },
    tower: def.id,
  });
}

export const CARDS_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));

/**
 * Genera las opciones de un draft. En oleada de jefe se garantiza al menos
 * una carta rara o mejor.
 */
export function drawCards(rng, state, count = 3, guaranteeRare = false) {
  const pool = CARDS.filter((c) => {
    if (c.unique && state.taken.has(c.id)) return false;
    if (c.requires && !c.requires(state)) return false;
    return true;
  });

  // Con pocas torres desbloqueadas no hay respuesta posible para media parte
  // del bestiario, así que mientras el arsenal sea corto el primer hueco del
  // draft se reserva a un plano de torre nueva.
  const forceUnlock = state.unlocked.size < 5 && pool.some((c) => c.tower);

  const picked = [];
  const used = new Set();
  for (let i = 0; i < count && pool.length; i++) {
    const wantUnlock = forceUnlock && i === 0;
    const wantRare = guaranteeRare && i === 0 && !wantUnlock;
    const weights = pool.map((c) => {
      if (used.has(c.id)) return 0;
      if (wantUnlock) return c.tower ? 1 : 0;
      let w = RARITY[c.rarity].weight * (c.weightBonus || 1);
      // Las épicas y los pactos ganan peso a medida que avanza la partida.
      if (c.rarity === 'epic') w *= 0.4 + state.sector * 0.18;
      if (c.rarity === 'curse') w *= 0.5 + state.sector * 0.12;
      if (wantRare && c.rarity === 'common') w = 0;
      return w;
    });
    if (weights.every((w) => w === 0)) break;
    const c = pool[rng.weighted(weights)];
    used.add(c.id);
    picked.push(c);
  }
  return picked;
}
