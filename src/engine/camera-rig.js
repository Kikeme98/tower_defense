import * as THREE from 'three';
import { clamp } from '../core/rng.js';

/**
 * Cámara orbital estilo RTS.
 *
 * Arrastrar con el botón izquierdo desplaza el mapa y un clic limpio construye
 * o selecciona: el Input distingue ambos por el umbral de movimiento. Es lo que
 * permite jugar entero con un trackpad, donde no hay botón central y el derecho
 * es incómodo de mantener mientras se arrastra.
 *
 *  - arrastrar izq. o central: desplazar   - arrastrar der. (o Q/E): girar
 *  - rueda / dos dedos: zoom hacia el cursor
 *  - WASD y flechas: desplazar
 */
export class CameraRig {
  constructor(camera, input) {
    this.camera = camera;
    this.input = input;
    this.target = new THREE.Vector3(0, 0, 0);
    this.desiredTarget = this.target.clone();
    this.yaw = Math.PI * 0.25;
    this.pitch = 0.95;
    this.dist = 46;
    this.desiredDist = 46;
    this.minDist = 8;
    this.maxDist = 150; // más lejos no aporta encuadre y agrava la perspectiva
    this.bounds = 60;
    this._ray = new THREE.Ray();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._hit = new THREE.Vector3();
  }

  setBounds(r) {
    this.bounds = Math.max(30, r);
  }

  update(dt) {
    const inp = this.input;

    if (inp.wheel !== 0) {
      // Zoom exponencial sobre el desplazamiento real, acotado por frame para
      // que un golpe de trackpad no atraviese todo el rango de una vez.
      const step = clamp(inp.wheel, -240, 240) * 0.0018;
      const before = this.desiredDist;
      this.desiredDist = clamp(this.desiredDist * Math.exp(step), this.minDist, this.maxDist);
      // Zoom hacia el cursor: el punto del suelo bajo el ratón se queda quieto.
      const ground = this.pickGround(0);
      if (ground && before > 0) {
        const k = 1 - this.desiredDist / before;
        this.desiredTarget.x += (ground.x - this.desiredTarget.x) * k * 0.85;
        this.desiredTarget.z += (ground.z - this.desiredTarget.z) * k * 0.85;
      }
    }

    // Girar sólo con el botón derecho; el izquierdo se reserva al juego.
    if (inp.buttons.has(2)) {
      this.yaw -= inp.dragDelta.x * 0.006;
      this.pitch -= inp.dragDelta.y * 0.005;
    }
    // Se acota siempre, no sólo al girar. El mínimo deja el borde superior del
    // encuadre por debajo del horizonte (inclinación > medio campo de visión,
    // con margen): más tumbada, el rayo del cursor roza el suelo, el agarre da
    // saltos enormes y además se ve el vacío por encima del mapa.
    this.pitch = clamp(this.pitch, 0.65, 1.45);
    if (inp.isDown('KeyQ')) this.yaw += dt * 1.4;
    if (inp.isDown('KeyE')) this.yaw -= dt * 1.4;

    const cos = Math.cos(this.yaw), sin = Math.sin(this.yaw);
    // La cámara se sitúa en target + (sin, ·, cos)·dist, luego mira hacia
    // (-sin, -cos). Los ejes de movimiento se derivan de ahí en vez de aplicar
    // una rotación genérica, que es donde se colaba el signo cambiado.
    const fwdX = -sin, fwdZ = -cos;   // hacia donde mira la cámara
    const rightX = cos, rightZ = -sin;

    let mx = 0, mf = 0;
    if (inp.isDown('KeyW') || inp.isDown('ArrowUp')) mf += 1;
    if (inp.isDown('KeyS') || inp.isDown('ArrowDown')) mf -= 1;
    if (inp.isDown('KeyA') || inp.isDown('ArrowLeft')) mx -= 1;
    if (inp.isDown('KeyD') || inp.isDown('ArrowRight')) mx += 1;
    if (mx || mf) {
      // Velocidad proporcional al zoom: recorre algo menos de una pantalla por
      // segundo, así que sigue siendo manejable de cerca y útil de lejos.
      const speed = dt * this.dist * 0.8 / Math.hypot(mx, mf);
      this.desiredTarget.x += (fwdX * mf + rightX * mx) * speed;
      this.desiredTarget.z += (fwdZ * mf + rightZ * mx) * speed;
    }

    // Arrastrar el mapa agarrando el terreno: se memoriza el punto del suelo
    // bajo el cursor al pulsar y cada frame se desplaza la cámara para que ese
    // punto vuelva a quedar bajo el cursor. Es exacto para cualquier zoom,
    // inclinación y campo de visión; convertir píxeles a unidades con un factor
    // sólo acierta con la cámara alta y deriva al tumbarla.
    const holding = inp.buttons.has(0) || inp.buttons.has(1);
    const dragging = holding && inp.dragging;
    if (holding) {
      const hit = this.pickGround(0);
      // Cerca del horizonte el rayo roza el suelo y devuelve puntos absurdos.
      const sane = hit && Math.hypot(hit.x - this.target.x, hit.z - this.target.z) < this.dist * 3;
      if (sane) {
        if (!this._grab) this._grab = hit.clone();
        else if (dragging) {
          this.desiredTarget.x += this._grab.x - hit.x;
          this.desiredTarget.z += this._grab.z - hit.z;
        }
      }
    } else {
      this._grab = null;
    }
    this.panning = dragging;

    // Contención circular: el jugador no puede perderse en el vacío.
    const d = Math.hypot(this.desiredTarget.x, this.desiredTarget.z);
    if (d > this.bounds) {
      this.desiredTarget.x *= this.bounds / d;
      this.desiredTarget.z *= this.bounds / d;
    }

    // Suavizado exponencial independiente del framerate. Al arrastrar no hay
    // suavizado: el mapa debe seguir al cursor sin inercia o el agarre patina.
    const k = 1 - Math.exp(-dt * 14);
    if (dragging) this.target.copy(this.desiredTarget);
    else this.target.lerp(this.desiredTarget, k);
    this.dist += (this.desiredDist - this.dist) * k;

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.dist,
      this.target.y + sp * this.dist,
      this.target.z + Math.cos(this.yaw) * cp * this.dist,
    );
    this.camera.lookAt(this.target);
  }

  /** Punto del plano horizontal a altura `y` bajo el cursor, o null. */
  pickGround(y = 0) {
    const inp = this.input;
    this._ray.origin.copy(this.camera.position);
    this._ray.direction
      .set(inp.mouse.ndcX, inp.mouse.ndcY, 0.5)
      .unproject(this.camera)
      .sub(this.camera.position)
      .normalize();
    this._plane.constant = -y;
    return this._ray.intersectPlane(this._plane, this._hit) ? this._hit : null;
  }

  focus(x, z) {
    this.desiredTarget.set(x, 0, z);
  }
}
