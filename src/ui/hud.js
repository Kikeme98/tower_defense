import { TOWER_DEFS, TOWERS, UPGRADE_PATHS } from '../game/tower-defs.js';
import { RARITY } from '../game/cards.js';
import { PHASE } from '../game/game.js';
import { BALANCE, enemyCount, isBossWave } from '../game/balance.js';
import { TERRAIN } from '../world/grid.js';

const fmt = (n) => (n >= 10000 ? (n / 1000).toFixed(1) + 'k' : Math.round(n).toLocaleString('es'));
const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6',
  'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus'];
const LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'];

/** Los tres depósitos llevan símbolo propio: el color por sí solo no basta. */
const LAYER_SYMBOL = { health: '♥', armor: '▣', shield: '◈' };

/**
 * Interfaz en HTML sobre el lienzo. Se sincroniza con el juego por eventos
 * (para lo que cambia poco: tienda, panel, draft) y por sondeo cada frame
 * (para lo que cambia siempre: oro, vidas, enemigos restantes).
 */
export class HUD {
  constructor(game, loop, quality) {
    this.game = game;
    this.loop = loop;
    this.quality = quality;
    this.root = document.getElementById('ui');
    this.root.innerHTML = `
      <div id="topbar" class="panel" role="status" aria-live="polite">
        <div class="stat gold">
          <span class="label">Oro</span><span class="value" data-gold>0</span>
        </div>
        <div class="stat lives">
          <span class="label">Núcleo</span><span class="value" data-lives>0</span>
          <div class="core-bar"><span data-corebar style="width:100%"></span></div>
        </div>
        <div class="stat wave">
          <span class="label">Oleada</span><span class="value" data-wave>0</span>
        </div>
        <div class="stat">
          <span class="label">Sector</span><span class="value" data-sector>1</span>
        </div>
        <div id="speed" role="group" aria-label="Velocidad del juego">
          <button class="spd" data-speed="0" aria-pressed="false" title="Pausa (P)">❚❚</button>
          <button class="spd" data-speed="1" aria-pressed="true">1×</button>
          <button class="spd" data-speed="2" aria-pressed="false">2×</button>
          <button class="spd" data-speed="4" aria-pressed="false">4×</button>
        </div>
      </div>

      <div id="shop" class="panel">
        <div class="section-title">Torres</div>
        <div data-shop></div>
      </div>
      <div id="panel" class="panel"></div>

      <div id="bottom" class="panel">
        <div id="priority">
          <label for="prio">Prioridad</label>
          <select id="prio" data-priority>
            <option value="first">Más avanzado</option>
            <option value="strong">Más resistente</option>
            <option value="weak">Más débil</option>
            <option value="close">Más cercano</option>
            <option value="fast">Más rápido</option>
          </select>
        </div>
        <button id="next">Siguiente oleada</button>
        <div id="wave-info" role="status"></div>
      </div>

      <div id="settings">
        <label for="qual">Gráficos</label>
        <select id="qual" data-quality>
          <option value="low">Bajo</option>
          <option value="medium">Medio</option>
          <option value="high">Alto</option>
        </select>
      </div>
      <button id="help-toggle" aria-expanded="false" aria-controls="help">? Controles</button>
      <div id="help" hidden role="dialog" aria-modal="true" aria-label="Controles">
        <div class="sheet">
          <h3>Controles</h3>
          <dl>
            <dt><kbd>Clic</kbd></dt><dd>Construir la torre elegida o seleccionar una existente</dd>
            <dt><kbd>Clic der.</kbd></dt><dd>Cancelar la selección</dd>
            <dt><kbd>Mayús</kbd> + <kbd>Clic</kbd></dt><dd>Construir varias seguidas sin volver a elegir</dd>
            <dt><kbd>Arrastrar</kbd></dt><dd>Mover el mapa agarrando el terreno</dd>
            <dt><kbd>Rueda</kbd></dt><dd>Acercar y alejar hacia el cursor</dd>
            <dt><kbd>Arrastrar der.</kbd></dt><dd>Girar la cámara (también <kbd>Q</kbd> y <kbd>E</kbd>)</dd>
            <dt><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></dt><dd>Desplazar la cámara</dd>
            <dt><kbd>1</kbd>…<kbd>9</kbd></dt><dd>Elegir torre de la lista</dd>
            <dt><kbd>Espacio</kbd></dt><dd>Lanzar la siguiente oleada</dd>
            <dt><kbd>V</kbd></dt><dd>Vender la torre seleccionada</dd>
            <dt><kbd>P</kbd></dt><dd>Pausar o reanudar</dd>
            <dt><kbd>Esc</kbd></dt><dd>Cancelar o cerrar</dd>
          </dl>
          <button class="close">Entendido</button>
        </div>
      </div>
      <div id="perf" class="panel"><span data-perf></span></div>

      <div id="draft" role="dialog" aria-modal="true" aria-label="Elige tu recompensa">
        <h2>Elige tu recompensa</h2>
        <div class="lead" data-draft-lead></div>
        <div class="cards" data-cards></div>
      </div>

      <div id="banner" role="status"><div class="big" data-banner-big></div><div class="small" data-banner-small></div></div>
      <div id="toast" role="status" aria-live="polite"></div>
      <div id="tip" class="panel" role="tooltip"></div>

      <div id="over" role="dialog" aria-modal="true">
        <h1>El núcleo ha caído</h1>
        <div class="grid" data-over></div>
        <button data-restart>Nueva partida</button>
      </div>
    `;

    this.el = {
      gold: this.q('[data-gold]'), lives: this.q('[data-lives]'),
      coreBar: this.q('[data-corebar]'),
      wave: this.q('[data-wave]'), sector: this.q('[data-sector]'),
      shop: this.q('[data-shop]'), panel: this.q('#panel'),
      next: this.q('#next'), waveInfo: this.q('#wave-info'),
      draft: this.q('#draft'), cards: this.q('[data-cards]'), draftLead: this.q('[data-draft-lead]'),
      banner: this.q('#banner'), bannerBig: this.q('[data-banner-big]'), bannerSmall: this.q('[data-banner-small]'),
      toast: this.q('#toast'), over: this.q('#over'), overGrid: this.q('[data-over]'),
      perf: this.q('[data-perf]'), tip: this.q('#tip'), priority: this.q('[data-priority]'),
      help: this.q('#help'), helpToggle: this.q('#help-toggle'),
    };

    this.el.qual = this.q('[data-quality]');
    this._buildShop();
    this._bind();
    game.on((evt, data) => this._onEvent(evt, data));

    if (this.quality) {
      this.el.qual.value = this.quality.current();
      this.el.qual.onchange = (e) => this.quality.set(e.target.value);
    }
  }

  /** Aviso cuando el vigilante de rendimiento cambia la calidad por su cuenta. */
  onQualityChange(level, fps) {
    const names = { low: 'bajo', medium: 'medio', high: 'alto' };
    if (this.el.qual) this.el.qual.value = level;
    this._toast(`Gráficos en ${names[level]} para ir más fluido (iba a ${fps} fps)`);
  }

  q(sel) { return this.root.querySelector(sel); }

  _bind() {
    this.el.next.onclick = () => this.game.startWave();
    this.q('[data-restart]').onclick = () => {
      this.game.reset(Date.now());
      this.el.over.classList.remove('show');
    };
    this.el.priority.onchange = (e) => this.game.setTargetMode(e.target.value);

    for (const b of this.root.querySelectorAll('.spd')) {
      b.onclick = () => {
        this.loop.timeScale = Number(b.dataset.speed);
        for (const o of this.root.querySelectorAll('.spd')) {
          o.setAttribute('aria-pressed', String(o === b));
        }
      };
    }

    const setHelp = (open) => {
      this.el.help.hidden = !open;
      this.el.helpToggle.setAttribute('aria-expanded', String(open));
      this.game.input.setBlocked(open);
      if (open) this.el.help.querySelector('.close').focus();
      else this.el.helpToggle.focus();
    };
    this.el.helpToggle.onclick = () => setHelp(true);
    this.el.help.querySelector('.close').onclick = () => setHelp(false);
    // Clic fuera de la hoja también cierra, que es lo que espera todo el mundo.
    this.el.help.onclick = (e) => { if (e.target === this.el.help) setHelp(false); };
    this._setHelp = setHelp;
  }

  _buildShop() {
    const g = this.game;
    this.el.shop.innerHTML = '';
    this.shopBtns = [];
    TOWER_DEFS.forEach((def, i) => {
      const b = document.createElement('button');
      b.className = 'tower-btn';
      b.setAttribute('aria-pressed', 'false');
      b.innerHTML = `
        <span class="swatch" style="background:${hex(def.accent)}"></span>
        <span class="nm">${def.name}</span>
        <span class="price" data-p></span>
        <span class="kbd">${LABELS[i] || ''}</span>`;
      b.onclick = () => g.selectTowerDef(def.id);
      // Retardo antes de mostrar la descripción: al recorrer la lista con el
      // ratón, sin él los tooltips parpadean uno tras otro.
      b.onpointerenter = (e) => {
        const anchor = e.currentTarget;
        clearTimeout(this._tipTimer);
        this._tipTimer = setTimeout(() => this._showTip(def, anchor), 350);
      };
      b.onpointerleave = () => {
        clearTimeout(this._tipTimer);
        this.el.tip.classList.remove('show');
      };
      b.onfocus = () => this._showTip(def, b);
      b.onblur = () => this.el.tip.classList.remove('show');
      this.el.shop.appendChild(b);
      this.shopBtns.push({ el: b, def, price: b.querySelector('[data-p]') });
    });
  }

  _showTip(def, anchor) {
    const g = this.game;
    const t = this.el.tip;
    const r = anchor.getBoundingClientRect();
    const vs = def.vs || { h: 1, a: 1, s: 1 };
    const row = (k, v) => `<span class="k">${k}</span><span class="v">${v}</span>`;
    const targets = def.targets === 'air' ? 'Sólo aéreos'
      : def.targets === 'ground' ? 'Sólo terrestres'
        : def.targets === 'none' ? 'No ataca' : 'Aéreos y terrestres';
    t.innerHTML = `
      <div class="nm" style="color:${hex(def.accent)}">${def.name}</div>
      <div class="ds">${def.desc}</div>
      <div class="st">
        ${def.damage ? row('Daño', def.damage) : ''}
        ${def.fireRate ? row('Cadencia', def.fireRate.toFixed(2) + '/s') : ''}
        ${row('Alcance', (def.range / 2).toFixed(1) + ' casillas')}
        ${def.splash ? row('Área', (def.splash / 2).toFixed(1) + ' casillas') : ''}
        ${def.minRange ? row('Alcance mínimo', (def.minRange / 2).toFixed(1)) : ''}
        ${row(`${LAYER_SYMBOL.health} Salud`, `<span style="color:var(--health)">×${vs.h}</span>`)}
        ${row(`${LAYER_SYMBOL.armor} Armadura`, `<span style="color:var(--armor)">×${vs.a}</span>`)}
        ${row(`${LAYER_SYMBOL.shield} Escudo`, `<span style="color:var(--shield)">×${vs.s}</span>`)}
        ${row('Objetivos', targets)}
        ${row('Precio', `<span style="color:var(--gold)">${fmt(g.costOf(def))}</span>`)}
      </div>`;
    t.classList.add('show');
    // Se coloca al lado del botón, sin salirse de la pantalla.
    const top = Math.min(innerHeight - t.offsetHeight - 16, Math.max(16, r.top - 16));
    t.style.left = (r.right + 12) + 'px';
    t.style.top = top + 'px';
  }

  _onEvent(evt, data) {
    switch (evt) {
      case 'reset':
        this._buildShop();
        this.el.over.classList.remove('show');
        this.el.draft.classList.remove('show');
        this.el.priority.value = 'first';
        break;
      case 'draft': this._showDraft(data); break;
      case 'gameover': this._showOver(); break;
      case 'expand':
        this._banner(`Sector ${data.level}`,
          data.sealed
            ? `Un camino quedó encajonado: su portal es ya permanente. ${data.routes} rutas activas.`
            : 'El territorio se expande y los caminos se alargan.');
        break;
      case 'wave':
        if (isBossWave(data)) this._banner('☠ ¡Titán!', 'Un jefe se acerca. Si llega, cuesta 6 vidas.');
        break;
      case 'nogold': this._toast('Oro insuficiente'); break;
      case 'card':
        if (data.tower) this._toast(`Nueva torre disponible: ${TOWERS[data.tower].name}`);
        break;
      case 'sell': this._toast(`Torre vendida · +${data} de oro`); break;
    }
    if (evt === 'selection' || evt === 'build' || evt === 'sell' || evt === 'upgrade' || evt === 'card') {
      this._refreshPanel();
    }
  }

  _showDraft({ cards, bonus, interest, veins }) {
    const c = this.el.cards;
    c.innerHTML = '';
    const parts = [`+${fmt(bonus)} de oro por completar la oleada`];
    if (interest) parts.push(`incluye ${fmt(interest)} de interés`);
    if (veins) parts.push(`${fmt(veins)} de filones`);
    this.el.draftLead.textContent = parts.join(' · ');

    for (const card of cards) {
      const r = RARITY[card.rarity];
      const el = document.createElement('button');
      el.className = `card rar-${card.rarity}`;
      el.innerHTML = `
        <div class="icon">${card.icon || '✦'}</div>
        <div class="rar" style="color:${r.color}">${r.name}</div>
        <div class="nm">${card.name}</div>
        <div class="ds">${card.desc}</div>
        ${card.tower ? '<div class="tag">✚ Desbloquea una torre</div>' : ''}`;
      el.onclick = () => {
        this.el.draft.classList.remove('show');
        this.game.input.setBlocked(false);
        this.game.chooseCard(card);
      };
      c.appendChild(el);
    }
    this.el.draft.classList.add('show');
    this.game.input.setBlocked(true);
    // El foco entra en el modal para poder elegir con teclado.
    requestAnimationFrame(() => c.firstElementChild?.focus());
  }

  _showOver() {
    const s = this.game.state;
    const best = this.game.best;
    this.el.overGrid.innerHTML = `
      <span class="k">Oleada alcanzada</span><span class="v">${s.wave}</span>
      <span class="k">Sector</span><span class="v">${s.sector}</span>
      <span class="k">Enemigos eliminados</span><span class="v">${fmt(s.kills)}</span>
      <span class="k">Puntuación</span><span class="v">${fmt(s.score)}</span>
      <span class="k">Torres en pie</span><span class="v">${this.game.towers.towers.length}</span>
      <span class="k">Mejor marca</span><span class="v">${best ? 'oleada ' + best.wave : '—'}</span>
      <span class="k">Semilla</span><span class="v">${this.game.seedText}</span>`;
    this.el.over.classList.add('show');
    requestAnimationFrame(() => this.q('[data-restart]').focus());
  }

  _banner(big, small) {
    this.el.bannerBig.textContent = big;
    this.el.bannerSmall.textContent = small || '';
    this.el.banner.classList.add('show');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => this.el.banner.classList.remove('show'), 2800);
  }

  _toast(msg) {
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = msg;
    this.el.toast.appendChild(d);
    setTimeout(() => d.remove(), 2400);
  }

  _refreshPanel() {
    const g = this.game;
    const t = g.selectedTower;
    const p = this.el.panel;
    if (!t) { p.classList.remove('show'); return; }
    p.classList.add('show');

    const s = t.stats;
    const terr = TERRAIN[t.cell.terrain];
    const feat = t.cell.feature;
    const mods = Object.entries(terr.mods || {})
      .map(([k, v]) => `${k === 'damage' ? 'daño' : k === 'range' ? 'alcance' : 'cadencia'} ×${v}`)
      .join(', ');

    const upgrades = UPGRADE_PATHS.map((path) => {
      const lvl = t.levels[path.id];
      const cost = t.upgradeCost(path.id);
      const name = path.id === 'special' ? (t.def.special?.name || 'Especial') : path.name;
      const dots = Array.from({ length: path.max }, (_, i) =>
        `<span class="dot ${i < lvl ? 'f' : ''}"></span>`).join('');
      const dis = cost === null || g.state.gold < cost;
      const hint = path.id === 'special' ? (t.def.special?.desc || '') : `Nivel ${lvl} de ${path.max}`;
      return `<button class="up" data-up="${path.id}" ${dis ? 'disabled' : ''} title="${hint}">
        <span class="sym">${path.symbol}</span>
        <span class="nm">${name}</span>
        <span class="dots">${dots}</span>
        <span class="c">${cost === null ? 'MÁX' : fmt(cost)}</span>
      </button>`;
    }).join('');

    p.innerHTML = `
      <div class="title"><b style="color:${hex(t.def.accent)}">${t.def.name}</b>
        <span class="lvl">Nivel ${t.totalLevel}</span></div>
      <div class="sub">${terr.name}${mods ? ' · ' + mods : ''}${t.cell.height > 0 ? ` · altura +${t.cell.height}` : ''}${feat ? ` · junto a ${feat === 'vein' ? 'filón' : 'obelisco'}` : ''}</div>
      <div class="vs">
        <div class="health"><div class="t">${LAYER_SYMBOL.health} Salud</div><div class="n">×${s.vs.h.toFixed(2)}</div></div>
        <div class="armor"><div class="t">${LAYER_SYMBOL.armor} Armad.</div><div class="n">×${s.vs.a.toFixed(2)}</div></div>
        <div class="shield"><div class="t">${LAYER_SYMBOL.shield} Escudo</div><div class="n">×${s.vs.s.toFixed(2)}</div></div>
      </div>
      <div class="rows">
        <span class="k">Daño por impacto</span><span class="v">${fmt(s.damage)}</span>
        <span class="k">Cadencia</span><span class="v">${s.fireRate ? s.fireRate.toFixed(2) + '/s' : '—'}</span>
        <span class="k">Alcance</span><span class="v">${(s.range / 2).toFixed(1)} casillas</span>
        ${s.splash ? `<span class="k">Radio de área</span><span class="v">${(s.splash / 2).toFixed(1)}</span>` : ''}
        ${s.chain ? `<span class="k">Saltos</span><span class="v">${s.chain.count}</span>` : ''}
        ${s.pierce ? `<span class="k">Atraviesa</span><span class="v">${s.pierce + 1}</span>` : ''}
        ${s.slow ? `<span class="k">Ralentización</span><span class="v">${(s.slow * 100).toFixed(0)}%/impacto</span>` : ''}
        ${s.dot ? `<span class="k">${s.dot.type === 'poison' ? 'Veneno' : s.dot.type === 'burn' ? 'Fuego' : 'Hemorragia'}</span><span class="v">×${s.dot.factor.toFixed(2)}</span>` : ''}
        ${s.critChance ? `<span class="k">Crítico</span><span class="v">${(s.critChance * 100).toFixed(0)}%</span>` : ''}
        <span class="k">DPS estimado</span><span class="v">${fmt(s.dps)}</span>
        <span class="k">Bajas</span><span class="v">${t.kills || 0}</span>
      </div>
      ${upgrades}
      <button class="sell">Vender · +${fmt(Math.round(t.invested * BALANCE.sellRatio))} oro</button>`;

    for (const b of p.querySelectorAll('[data-up]')) {
      b.onclick = () => g.upgradeTower(t, b.dataset.up);
    }
    p.querySelector('.sell').onclick = () => g.sellTower(t);
  }

  /** Sondeo por frame: sólo textos, nunca reconstrucción de DOM. */
  update() {
    const g = this.game, s = g.state;
    this.el.gold.textContent = fmt(s.gold);
    this.el.lives.textContent = `${s.lives}/${s.maxLives}`;
    this.el.coreBar.style.width = `${Math.max(0, (s.lives / s.maxLives) * 100)}%`;
    this.el.wave.textContent = s.wave;
    this.el.sector.textContent = s.sector;

    for (const b of this.shopBtns) {
      const unlocked = s.unlocked.has(b.def.id);
      b.el.style.display = unlocked ? '' : 'none';
      if (!unlocked) continue;
      const cost = g.costOf(b.def);
      b.price.textContent = fmt(cost);
      b.el.classList.toggle('poor', s.gold < cost);
      b.el.setAttribute('aria-pressed', String(g.selectedDef === b.def));
    }

    const combat = g.phase === PHASE.COMBAT;
    this.el.next.disabled = g.phase !== PHASE.BUILD;
    const nextWave = s.wave + 1;
    if (combat) {
      this.el.waveInfo.innerHTML = `Quedan <b>${g.enemies.count + g.director.remaining}</b> enemigos`;
    } else {
      const n = Math.round(enemyCount(nextWave) * s.curse.count);
      this.el.waveInfo.innerHTML = isBossWave(nextWave)
        ? `Oleada <b>${nextWave}</b> · <span class="boss">☠ JEFE</span> y ${n} enemigos`
        : `Oleada <b>${nextWave}</b> · ${n} enemigos`;
    }

    // Refresco del panel al cambiar el oro: habilita o deshabilita las mejoras.
    if (g.selectedTower && s.gold !== this._lastGold) {
      this._lastGold = s.gold;
      this._refreshPanel();
    }

    this.el.perf.textContent =
      `${this.loop.fps.toFixed(0)} fps · ${g.enemies.count} enem · ${g.towers.towers.length} torres`;
  }

  /** Atajos de teclado; devuelve true si consumió la tecla. */
  handleKey(code) {
    const g = this.game;
    if (code === 'Space') { g.startWave(); return true; }
    if (code === 'Escape') {
      if (!this.el.help.hidden) { this._setHelp(false); return true; }
      g.selectedDef = null; g.selectedTower = null; g.emit('selection'); return true;
    }
    if (code === 'KeyV' && g.selectedTower) { g.sellTower(g.selectedTower); return true; }
    if (code === 'KeyP') {
      const btn = this.root.querySelector(`.spd[data-speed="${this.loop.timeScale ? 0 : 1}"]`);
      if (btn) btn.click();
      return true;
    }
    const i = KEYS.indexOf(code);
    if (i >= 0 && TOWER_DEFS[i] && g.state.unlocked.has(TOWER_DEFS[i].id)) {
      g.selectTowerDef(TOWER_DEFS[i].id);
      return true;
    }
    return false;
  }
}
