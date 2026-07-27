// Estado de entrada centralizado. Los sistemas consultan `input` en vez de
// registrar sus propios listeners dispersos por el código.

export class Input {
  constructor(domElement) {
    this.el = domElement;
    this.keys = new Set();
    this.pressed = new Set(); // teclas que bajaron en este frame
    this.mouse = { x: 0, y: 0, ndcX: 0, ndcY: 0 };
    this.buttons = new Set();
    this.clicked = null;      // botón que se soltó como clic limpio
    this.wheel = 0;           // desplazamiento acumulado del frame, en píxeles
    this.dragDelta = { x: 0, y: 0 };
    this.dragging = false;    // el arrastre superó el umbral de clic
    this._downPos = { x: 0, y: 0 };
    this._prev = { x: 0, y: 0 };
    this._overUI = false;
    this._forceBlock = false;
    this._bind();
  }

  /**
   * Bloqueo manual, para modales que cubren la pantalla. El bloqueo normal se
   * deduce del elemento bajo el cursor, que no puede quedarse pegado.
   */
  setBlocked(v) {
    this._forceBlock = v;
  }

  get blocked() {
    return this._overUI || this._forceBlock;
  }

  /** Posición del puntero en píxeles del canvas y en coordenadas normalizadas. */
  _track(e) {
    const r = this.el.getBoundingClientRect();
    this.mouse.x = e.clientX - r.left;
    this.mouse.y = e.clientY - r.top;
    this.mouse.ndcX = (this.mouse.x / r.width) * 2 - 1;
    this.mouse.ndcY = -(this.mouse.y / r.height) * 2 + 1;
  }

  _bind() {
    const el = this.el;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement
        || t instanceof HTMLTextAreaElement) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.buttons.clear();
      this.dragging = false;
    });

    el.addEventListener('contextmenu', (e) => e.preventDefault());

    // El movimiento se escucha en la ventana, no en el canvas: así el arrastre
    // sigue funcionando aunque el puntero pase por encima de un panel, y saber
    // si estamos sobre la interfaz se reduce a mirar el destino del evento
    // (en vez de parejas enter/leave, que se quedan pegadas si un panel se
    // oculta con el ratón encima).
    addEventListener('pointermove', (e) => {
      this._track(e);
      this.dragDelta.x += this.mouse.x - this._prev.x;
      this.dragDelta.y += this.mouse.y - this._prev.y;
      this._prev.x = this.mouse.x;
      this._prev.y = this.mouse.y;
      // Durante la captura de puntero el destino sigue siendo el canvas.
      this._overUI = e.target !== el;
      if (this.buttons.size && !this.dragging) {
        const dx = this.mouse.x - this._downPos.x;
        const dy = this.mouse.y - this._downPos.y;
        if (dx * dx + dy * dy > 25) this.dragging = true;
      }
    });

    el.addEventListener('pointerdown', (e) => {
      try { el.setPointerCapture(e.pointerId); } catch { /* puntero ya liberado */ }
      // La posición se toma del propio evento: con un toque sin movimiento
      // previo, `mouse` conservaría la posición vieja y el toque se
      // confundiría con un arrastre.
      this._track(e);
      this._prev.x = this.mouse.x;
      this._prev.y = this.mouse.y;
      this._downPos.x = this.mouse.x;
      this._downPos.y = this.mouse.y;
      this.buttons.add(e.button);
      this.dragging = false;
    });

    addEventListener('pointerup', (e) => {
      // Sólo cuenta como clic si apenas se movió: arrastrar es mover la cámara.
      if (this.buttons.has(e.button) && !this.dragging) this.clicked = e.button;
      this.buttons.delete(e.button);
      if (!this.buttons.size) this.dragging = false;
    });

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      // Se acumula el desplazamiento real normalizado a píxeles. Con
      // Math.sign() cada evento valía lo mismo, y un solo gesto de trackpad
      // emite decenas de eventos: el zoom se disparaba de golpe.
      let d = e.deltaY;
      if (e.deltaMode === 1) d *= 16;        // líneas
      else if (e.deltaMode === 2) d *= 100;  // páginas
      this.wheel += d;
    }, { passive: false });
  }

  isDown(code) {
    return this.keys.has(code);
  }
  wasPressed(code) {
    return this.pressed.has(code);
  }
  /** Llamar al final de cada frame: limpia los estados de un solo frame. */
  endFrame() {
    this.pressed.clear();
    this.clicked = null;
    this.wheel = 0;
    this.dragDelta.x = 0;
    this.dragDelta.y = 0;
  }
}
