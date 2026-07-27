// Bucle principal con paso fijo: la simulación avanza siempre en incrementos
// idénticos (determinismo, física estable) y el render interpola entre pasos.

export class Loop {
  constructor({ update, render, hz = 60, maxSubSteps = 5 }) {
    this.update = update;
    this.render = render;
    this.step = 1 / hz;
    this.maxSubSteps = maxSubSteps;
    this.acc = 0;
    this.last = 0;
    this.running = false;
    this.timeScale = 1;
    this.elapsed = 0;
    this.fps = 60;
    this._fpsAcc = 0;
    this._fpsFrames = 0;
    this._tick = this._tick.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this._tick);
  }

  stop() {
    this.running = false;
  }

  _tick(now) {
    if (!this.running) return;
    requestAnimationFrame(this._tick);

    let frameTime = (now - this.last) / 1000;
    this.last = now;
    // Un frame gigante (pestaña en segundo plano, GC) no debe disparar 200 sub-pasos.
    if (frameTime > 0.25) frameTime = 0.25;

    this._fpsAcc += frameTime;
    this._fpsFrames++;
    if (this._fpsAcc >= 0.5) {
      this.fps = this._fpsFrames / this._fpsAcc;
      this._fpsAcc = 0;
      this._fpsFrames = 0;
    }

    this.acc += frameTime * this.timeScale;

    let steps = 0;
    while (this.acc >= this.step && steps < this.maxSubSteps) {
      this.update(this.step, this.elapsed);
      this.elapsed += this.step;
      this.acc -= this.step;
      steps++;
    }
    // Si no hemos podido alcanzar el ritmo, descartamos el resto en vez de
    // acumular deuda temporal (evita la "espiral de la muerte").
    if (steps === this.maxSubSteps) this.acc = 0;

    this.render(this.acc / this.step, frameTime);
  }
}
