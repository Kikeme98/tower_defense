import * as THREE from 'three';

/**
 * Cielo procedural: una esfera invertida con un degradado de cenit a suelo y
 * un sol difuso. Además de verse, sirve de fuente de luz ambiental (se convierte
 * en mapa de entorno) y da el color de la niebla, así que todo el encuadre queda
 * teñido de forma coherente.
 *
 * Cada paleta corresponde a un tramo de la partida: el mundo va oscureciendo y
 * enrojeciendo conforme se avanza, que es un aviso de dificultad que se lee sin
 * mirar la interfaz.
 */

/**
 * Las intensidades siguen una proporción de clave dominante: el sol pesa varias
 * veces más que hemisférica, relleno y entorno juntos. Con el ambiente subido,
 * las sombras proyectadas existen pero quedan lavadas y el mapa se ve plano.
 */
export const PALETTES = [
  {
    name: 'Alba', top: 0x2a4a8a, mid: 0x7fa8d8, bottom: 0x2a3348,
    sun: 0xfff0d0, sunDir: [0.42, 0.36, 0.28], fog: 0x8faccc,
    key: 0xfff2d8, keyI: 3.2, hemiSky: 0xa8c8ff, hemiGround: 0x3a3020, hemiI: 0.34,
    fill: 0x6a90ff, fillI: 0.22, envI: 0.30, exposure: 1.0,
  },
  {
    name: 'Mediodía', top: 0x2f6bc0, mid: 0x9fc4e8, bottom: 0x35404f,
    sun: 0xffffff, sunDir: [0.34, 0.62, 0.24], fog: 0xa8c2d8,
    key: 0xfffaf0, keyI: 3.5, hemiSky: 0xbdd8ff, hemiGround: 0x46402c, hemiI: 0.36,
    fill: 0x88a8ff, fillI: 0.2, envI: 0.32, exposure: 0.96,
  },
  {
    name: 'Ocaso', top: 0x1b2a6b, mid: 0xd88a5a, bottom: 0x2a1e28,
    sun: 0xffb060, sunDir: [0.62, 0.3, -0.3], fog: 0xb07858,
    key: 0xffb878, keyI: 3.3, hemiSky: 0xff9f70, hemiGround: 0x2a1c18, hemiI: 0.3,
    fill: 0x5060c0, fillI: 0.3, envI: 0.28, exposure: 1.0,
  },
  {
    name: 'Crepúsculo', top: 0x120f2e, mid: 0x6a4a8a, bottom: 0x140f1c,
    sun: 0xc890ff, sunDir: [-0.42, 0.4, -0.38], fog: 0x4a3a66,
    key: 0xb890ff, keyI: 2.9, hemiSky: 0x7a6aff, hemiGround: 0x1a1424, hemiI: 0.28,
    fill: 0x4a70ff, fillI: 0.34, envI: 0.26, exposure: 1.06,
  },
  {
    name: 'Noche roja', top: 0x0c0a1a, mid: 0x8a2a3a, bottom: 0x120a10,
    sun: 0xff5a4a, sunDir: [-0.32, 0.44, 0.48], fog: 0x5a2028,
    key: 0xff8a70, keyI: 2.8, hemiSky: 0xff5a5a, hemiGround: 0x180c10, hemiI: 0.26,
    fill: 0x6a40ff, fillI: 0.36, envI: 0.24, exposure: 1.08,
  },
  {
    name: 'Vacío', top: 0x060612, mid: 0x2a2a5a, bottom: 0x08060e,
    sun: 0x90ffe0, sunDir: [0.24, 0.52, -0.56], fog: 0x1e2040,
    key: 0xa0ffe8, keyI: 2.7, hemiSky: 0x60ffd0, hemiGround: 0x0e0c1a, hemiI: 0.26,
    fill: 0xff4a90, fillI: 0.34, envI: 0.24, exposure: 1.1,
  },
];

const VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position;
    // La esfera se dibuja siempre alrededor de la cámara y sin profundidad.
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;

const FRAG = /* glsl */`
  varying vec3 vDir;
  uniform vec3 uTop, uMid, uBottom, uSun;
  uniform vec3 uSunDir;
  uniform float uTime;

  // Ruido de valor barato, sólo para romper las bandas del degradado.
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 c = h > 0.0
      ? mix(uMid, uTop, pow(h, 0.55))
      : mix(uMid, uBottom, pow(-h, 0.42));

    // Sol: un núcleo intenso y un halo amplio.
    float cosSun = max(dot(d, normalize(uSunDir)), 0.0);
    c += uSun * pow(cosSun, 900.0) * 3.5;
    c += uSun * pow(cosSun, 12.0) * 0.35;

    // Cinta de nubes muy tenue sobre el horizonte.
    float band = smoothstep(0.02, 0.30, h) * (1.0 - smoothstep(0.30, 0.75, h));
    float n = hash(floor((d.xz / max(abs(h), 0.08)) * 6.0 + uTime * 0.02));
    c += vec3(0.05, 0.06, 0.08) * band * n;

    // Tramado sutil: sin esto el degradado se ve a bandas en pantallas de 8 bits.
    c += (hash(gl_FragCoord.xy) - 0.5) * 0.012;
    gl_FragColor = vec4(c, 1.0);
  }
`;

export class Sky {
  constructor(renderer, scene) {
    this.scene = scene;
    this.uniforms = {
      uTop: { value: new THREE.Color() },
      uMid: { value: new THREE.Color() },
      uBottom: { value: new THREE.Color() },
      uSun: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0.4, 0.4, 0.3) },
      uTime: { value: 0 },
    };
    const geo = new THREE.SphereGeometry(1, 32, 16);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    scene.add(this.mesh);

    // Escena aparte para el mapa de entorno: sólo el cielo ilumina, no el mapa.
    this.envScene = new THREE.Scene();
    this.envScene.add(new THREE.Mesh(geo, mat));
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();

    // Estado interpolado: el cambio de paleta es gradual, no un corte seco.
    this.current = null;
    this.from = null;
    this.to = null;
    this.mix = 1;
    this.setPalette(0, true);
    // El primer mapa de entorno hay que pedirlo explícitamente: la mezcla ya
    // nace terminada, así que el ciclo de actualización nunca lo marcaría.
    this._envDirty = true;
  }

  /** Paleta correspondiente al sector, con transición suave salvo que se fuerce. */
  setPalette(index, instant = false) {
    const p = PALETTES[Math.min(index, PALETTES.length - 1)];
    if (this.current === p) return;
    this.from = instant || !this.current ? p : this._snapshot();
    this.to = p;
    this.mix = instant || !this.current ? 1 : 0;
    this.current = p;
    if (instant) this._apply(p, p, 1);
  }

  _snapshot() {
    // Copia del estado visible actual, para arrancar la mezcla desde ahí.
    const u = this.uniforms;
    return {
      top: u.uTop.value.getHex(), mid: u.uMid.value.getHex(),
      bottom: u.uBottom.value.getHex(), sun: u.uSun.value.getHex(),
      sunDir: [u.uSunDir.value.x, u.uSunDir.value.y, u.uSunDir.value.z],
      fog: this._fog ?? this.to.fog,
      key: this._key ?? this.to.key, keyI: this._keyI ?? this.to.keyI,
      hemiSky: this.to.hemiSky, hemiGround: this.to.hemiGround, hemiI: this.to.hemiI,
      fill: this.to.fill, fillI: this.to.fillI, envI: this.to.envI,
      exposure: this.to.exposure,
    };
  }

  _apply(a, b, t) {
    const u = this.uniforms;
    const lerpHex = (target, x, y) => target.setHex(x).lerp(new THREE.Color(y), t);
    lerpHex(u.uTop.value, a.top, b.top);
    lerpHex(u.uMid.value, a.mid, b.mid);
    lerpHex(u.uBottom.value, a.bottom, b.bottom);
    lerpHex(u.uSun.value, a.sun, b.sun);
    u.uSunDir.value.set(
      a.sunDir[0] + (b.sunDir[0] - a.sunDir[0]) * t,
      a.sunDir[1] + (b.sunDir[1] - a.sunDir[1]) * t,
      a.sunDir[2] + (b.sunDir[2] - a.sunDir[2]) * t,
    ).normalize();

    this._fog = new THREE.Color(a.fog).lerp(new THREE.Color(b.fog), t).getHex();
    this._key = new THREE.Color(a.key).lerp(new THREE.Color(b.key), t).getHex();
    this._keyI = a.keyI + (b.keyI - a.keyI) * t;
    this.blend = {
      fog: this._fog, key: this._key, keyI: this._keyI,
      hemiSky: new THREE.Color(a.hemiSky).lerp(new THREE.Color(b.hemiSky), t).getHex(),
      hemiGround: new THREE.Color(a.hemiGround).lerp(new THREE.Color(b.hemiGround), t).getHex(),
      hemiI: a.hemiI + (b.hemiI - a.hemiI) * t,
      fill: new THREE.Color(a.fill).lerp(new THREE.Color(b.fill), t).getHex(),
      fillI: a.fillI + (b.fillI - a.fillI) * t,
      envI: a.envI + (b.envI - a.envI) * t,
      exposure: a.exposure + (b.exposure - a.exposure) * t,
      sunDir: u.uSunDir.value,
    };
  }

  update(dt, time) {
    this.uniforms.uTime.value = time;
    if (this.mix < 1) {
      this.mix = Math.min(1, this.mix + dt * 0.35);
      this._apply(this.from, this.to, this.mix);
      this._envDirty = true;
    } else if (!this.blend) {
      this._apply(this.to, this.to, 1);
      this._envDirty = true;
    }
  }

  /** Regenera el mapa de entorno. Cuesta, así que sólo al cambiar de paleta. */
  refreshEnvironment() {
    const t = this.pmrem.fromScene(this.envScene);
    if (this.envMap) this.envMap.dispose();
    this.envMap = t.texture;
    this.scene.environment = this.envMap;
    this._envDirty = false;
    return this.envMap;
  }

  get needsEnvRefresh() {
    return this._envDirty;
  }

  /** La esfera acompaña a la cámara: es un fondo, no un objeto del mundo. */
  follow(camera) {
    this.mesh.position.copy(camera.position);
    this.mesh.scale.setScalar(camera.far * 0.5);
  }
}
