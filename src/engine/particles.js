import * as THREE from 'three';

/**
 * Partículas como billboards instanciados.
 *
 * Cada partícula tiene su propio tamaño, giro, color y opacidad, que es lo que
 * permite humo que se disipa y chispas que se apagan. Con mallas instanciadas
 * normales sólo se puede variar el color, y "apagar" una partícula bajando su
 * color a negro pinta manchas oscuras en vez de desvanecerla.
 *
 * Los cuatro dibujos (humo, chispa, destello, anillo) viven en un único atlas
 * generado por código, así que todo el sistema es una sola llamada de dibujo.
 */

export const SPRITE = { SMOKE: 0, SPARK: 1, FLARE: 2, RING: 3 };

function makeAtlas(size = 256) {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const h = size / 2;

  // 0: humo — mancha difusa e irregular.
  let g = ctx.createRadialGradient(h / 2, h / 2, 0, h / 2, h / 2, h / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, h, h);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const r = h * (0.14 + Math.random() * 0.16);
    const bx = h / 2 + Math.cos(a) * h * 0.2;
    const by = h / 2 + Math.sin(a) * h * 0.2;
    const bg = ctx.createRadialGradient(bx, by, 0, bx, by, r);
    bg.addColorStop(0, 'rgba(255,255,255,0.30)');
    bg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, h, h);
  }

  // 1: chispa — núcleo compacto y muy brillante.
  g = ctx.createRadialGradient(h + h / 2, h / 2, 0, h + h / 2, h / 2, h / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(h, 0, h, h);

  // 2: destello — núcleo con cuatro puntas.
  const cx = h / 2, cy = h + h / 2;
  g = ctx.createRadialGradient(cx, cy, 0, cx, cy, h / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.3)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, h, h, h);
  ctx.save();
  ctx.translate(cx, cy);
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    const lg = ctx.createLinearGradient(0, 0, h * 0.48, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0.85)');
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(0, -h * 0.035);
    ctx.lineTo(h * 0.48, 0);
    ctx.lineTo(0, h * 0.035);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 3: anillo — onda expansiva, con el borde exterior más marcado.
  g = ctx.createRadialGradient(h + h / 2, h + h / 2, 0, h + h / 2, h + h / 2, h / 2);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.62, 'rgba(255,255,255,0)');
  g.addColorStop(0.80, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.93, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(h, h, h, h);

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let sharedAtlas;
export function particleAtlas() {
  if (sharedAtlas === undefined) sharedAtlas = makeAtlas();
  return sharedAtlas;
}

const VERT = /* glsl */`
  attribute vec3 iPos;
  attribute vec4 iMisc;    // x: tamaño, y: giro, z: sprite, w: opacidad
  attribute vec3 iColor;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  #include <fog_pars_vertex>

  void main() {
    vColor = iColor;
    vAlpha = iMisc.w;
    // Media celda del atlas 2x2 según el índice de sprite. La fila se invierte
    // porque el lienzo se dibuja con el origen arriba y las UV lo tienen abajo:
    // sin esto cada efecto sale con el dibujo de otro.
    float idx = iMisc.z;
    vec2 cell = vec2(mod(idx, 2.0), 1.0 - floor(idx / 2.0));
    vUv = uv * 0.5 + cell * 0.5;

    float c = cos(iMisc.y), s = sin(iMisc.y);
    vec2 p = position.xy * iMisc.x;
    vec2 rp = vec2(p.x * c - p.y * s, p.x * s + p.y * c);

    // Billboard: se orienta con los ejes de la cámara sacados de la matriz de vista.
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 world = iPos + right * rp.x + up * rp.y;

    vec4 mv = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mv;

    #ifdef USE_FOG
      vFogDepth = -mv.z;
    #endif
  }
`;

const FRAG = /* glsl */`
  uniform sampler2D uMap;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vAlpha;
  #include <fog_pars_fragment>

  void main() {
    vec4 t = texture2D(uMap, vUv);
    gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
    if (gl_FragColor.a < 0.004) discard;
    #include <fog_fragment>
  }
`;

export class ParticleSystem {
  constructor(scene, { capacity = 2000, additive = true, atlas = null } = {}) {
    this.capacity = capacity;
    this.count = 0;
    this.list = [];
    this.pool = [];

    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = quad.index;
    geo.attributes.position = quad.attributes.position;
    geo.attributes.uv = quad.attributes.uv;

    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.aMisc = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    for (const a of [this.aPos, this.aMisc, this.aColor]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iMisc', this.aMisc);
    geo.setAttribute('iColor', this.aColor);
    geo.instanceCount = 0;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    const mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        { uMap: { value: atlas || particleAtlas() } },
      ]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      fog: true,
    });
    mat.uniforms.uMap.value = atlas || particleAtlas();

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 20 : 18;
    scene.add(this.mesh);
    this.geo = geo;
    this._c = new THREE.Color();
  }

  /**
   * Lanza una partícula. Tamaño, color y opacidad interpolan del valor inicial
   * al final a lo largo de su vida.
   */
  emit(o) {
    if (this.list.length >= this.capacity) return null;
    const p = this.pool.pop() || {};
    p.x = o.x; p.y = o.y; p.z = o.z;
    p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
    p.gravity = o.gravity ?? 0;
    p.drag = o.drag ?? 0;
    p.size = o.size ?? 0.5;
    p.sizeEnd = o.sizeEnd ?? p.size;
    p.rot = o.rot ?? Math.random() * Math.PI * 2;
    p.spin = o.spin ?? 0;
    p.sprite = o.sprite ?? SPRITE.SPARK;
    p.alpha = o.alpha ?? 1;
    p.alphaEnd = o.alphaEnd ?? 0;
    p.life = p.maxLife = o.life ?? 0.5;
    p.floor = o.floor;
    this._c.set(o.color ?? 0xffffff);
    p.r = this._c.r; p.g = this._c.g; p.b = this._c.b;
    if (o.colorEnd !== undefined) {
      this._c.set(o.colorEnd);
      p.r2 = this._c.r; p.g2 = this._c.g; p.b2 = this._c.b;
    } else {
      p.r2 = p.r; p.g2 = p.g; p.b2 = p.b;
    }
    this.list.push(p);
    return p;
  }

  update(dt) {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) {
        const last = l.pop();
        if (i < l.length) l[i] = last;
        this.pool.push(p);
        continue;
      }
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k; p.vy *= k; p.vz *= k;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.rot += p.spin * dt;
      if (p.floor !== undefined && p.y < p.floor) {
        p.y = p.floor;
        p.vy *= -0.3;
        p.vx *= 0.7; p.vz *= 0.7;
      }
    }
  }

  /** Vuelca el estado a los buffers de instancia. */
  flush() {
    const l = this.list;
    const pos = this.aPos.array, misc = this.aMisc.array, col = this.aColor.array;
    for (let i = 0; i < l.length; i++) {
      const p = l[i];
      const t = 1 - p.life / p.maxLife; // 0 al nacer, 1 al morir
      const o = i * 3, m = i * 4;
      pos[o] = p.x; pos[o + 1] = p.y; pos[o + 2] = p.z;
      misc[m] = p.size + (p.sizeEnd - p.size) * t;
      misc[m + 1] = p.rot;
      misc[m + 2] = p.sprite;
      misc[m + 3] = p.alpha + (p.alphaEnd - p.alpha) * t;
      col[o] = p.r + (p.r2 - p.r) * t;
      col[o + 1] = p.g + (p.g2 - p.g) * t;
      col[o + 2] = p.b + (p.b2 - p.b) * t;
    }
    this.geo.instanceCount = l.length;
    this.aPos.needsUpdate = true;
    this.aMisc.needsUpdate = true;
    this.aColor.needsUpdate = true;
    this.count = l.length;
  }

  clear() {
    for (const p of this.list) this.pool.push(p);
    this.list.length = 0;
    this.geo.instanceCount = 0;
  }
}
