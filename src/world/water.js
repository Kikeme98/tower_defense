import * as THREE from 'three';
import { TILE, T } from './grid.js';

/**
 * Superficie de agua.
 *
 * En vez de una caja por casilla, se construye una sola malla subdividida que
 * cubre todas las casillas de agua. Las olas se calculan en el sombreador a
 * partir de la posición **del mundo**, así que cruzan de una casilla a la
 * siguiente sin costuras: con geometría por casilla cada una ondulaba por su
 * cuenta y se veía la rejilla.
 *
 * El atributo `aShore` guarda lo cerca que está cada vértice de la orilla, y es
 * lo que permite aclarar el agua poco profunda y dibujar la espuma sin tener
 * que consultar el terreno desde el sombreador.
 */

const VERT = /* glsl */`
  uniform float uTime;
  attribute float aShore;
  varying vec3 vWorld;
  varying vec3 vNrm;
  varying float vShore;
  varying float vCrest;
  #include <fog_pars_vertex>

  // Tres trenes de olas cruzados: uno solo se lee como un patrón repetido.
  float waveHeight(vec2 p, float t) {
    float h = 0.0;
    h += sin(dot(p, vec2(0.80, 0.60)) * 0.85 + t * 1.5) * 0.075;
    h += sin(dot(p, vec2(-0.52, 0.85)) * 1.45 + t * 2.0) * 0.045;
    h += sin(dot(p, vec2(0.31, -0.95)) * 2.60 + t * 2.7) * 0.022;
    return h;
  }

  void main() {
    vec3 pos = position;
    vec2 p = pos.xz;
    float h = waveHeight(p, uTime);
    // Junto a la orilla la ola se aplana: si no, el agua se despega del terreno.
    float damp = 1.0 - aShore * 0.75;
    pos.y += h * damp;

    #if SIMPLE == 1
      // En calidad baja la lámina es plana: se ahorran dos evaluaciones de ola
      // por vértice y el agua sigue reflejando el cielo igual.
      vNrm = vec3(0.0, 1.0, 0.0);
    #else
      // Normal por diferencias finitas sobre la misma función de ola.
      float e = 0.4;
      float hx = waveHeight(p + vec2(e, 0.0), uTime) * damp;
      float hz = waveHeight(p + vec2(0.0, e), uTime) * damp;
      vNrm = normalize(vec3((h * damp - hx) / e, 1.0, (h * damp - hz) / e));
    #endif

    vShore = aShore;
    vCrest = h;
    vec4 wp = modelMatrix * vec4(pos, 1.0);
    vWorld = wp.xyz;
    vec4 mv = viewMatrix * wp;
    gl_Position = projectionMatrix * mv;
    // La niebla se calcula a mano: el fragmento la declara y sin esto el
    // programa no enlaza y el agua no se dibuja en absoluto.
    #ifdef USE_FOG
      vFogDepth = -mv.z;
    #endif
  }
`;

const FRAG = /* glsl */`
  uniform vec3 uDeep, uShallow, uSkyTop, uSkyHorizon, uSunColor;
  uniform vec3 uSunDir;
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vNrm;
  varying float vShore;
  varying float vCrest;
  #include <fog_pars_fragment>

  void main() {
    vec3 N = normalize(vNrm);
    vec3 V = normalize(cameraPosition - vWorld);

    // Agua somera más clara: es lo que da sensación de profundidad sin
    // necesitar leer el búfer de profundidad.
    vec3 base = mix(uDeep, uShallow, smoothstep(0.0, 0.85, vShore));

    // Reflejo del cielo aproximado por la inclinación del rayo reflejado.
    vec3 R = reflect(-V, N);
    vec3 sky = mix(uSkyHorizon, uSkyTop, clamp(R.y * 0.5 + 0.5, 0.0, 1.0));

    // Fresnel: de frente se ve el fondo, en rasante domina el reflejo. El
    // mínimo no es cero porque desde arriba, sin nada de cielo reflejado, el
    // agua se ve como un agujero negro.
    float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    fres = mix(0.30, 0.95, fres);
    vec3 col = mix(base, sky, fres);

    // Luz difusa del sol sobre la lámina, para que no quede plana en sombra.
    // El factor final compensa que el color se escribe en espacio lineal y
    // luego pasa por el mapeo de tonos: sin él el lago se ve casi negro.
    float diff = max(dot(N, normalize(uSunDir)), 0.0);
    col *= (0.9 + diff * 0.6) * 2.1;

    // Brillo especular del sol sobre las crestas.
    vec3 H = normalize(normalize(uSunDir) + V);
    float spec = pow(max(dot(N, H), 0.0), 200.0);
    col += uSunColor * spec * 2.2;

    // Espuma: una banda en la orilla que late con la propia ola, más un toque
    // en las crestas altas de mar abierto.
    float foamBand = smoothstep(0.55, 0.95, vShore + vCrest * 2.2);
    float crestFoam = smoothstep(0.055, 0.085, vCrest) * (1.0 - vShore) * 0.35;
    col = mix(col, vec3(0.92, 0.96, 1.0), clamp(foamBand * 0.75 + crestFoam, 0.0, 1.0));

    // Bastante opaca: el bloque del lecho es oscuro y transparentarse de más
    // ensucia el color del agua.
    float alpha = mix(0.93, 0.99, vShore);
    gl_FragColor = vec4(col, alpha);
    #include <fog_fragment>
  }
`;

export class Water {
  constructor(scene) {
    this.uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uDeep: { value: new THREE.Color(0x1b5f80) },
        uShallow: { value: new THREE.Color(0x58c4d8) },
        uSkyTop: { value: new THREE.Color(0x2a4a8a) },
        uSkyHorizon: { value: new THREE.Color(0x7fa8d8) },
        uSunColor: { value: new THREE.Color(0xfff0d0) },
        uSunDir: { value: new THREE.Vector3(0.4, 0.5, 0.3) },
      },
    ]);

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      defines: { SIMPLE: 0 },
      transparent: true,
      fog: true,
      side: THREE.FrontSide,
      // Sin escritura de profundidad la superficie queda fuera del prepaso de
      // la oclusión ambiental, que si no interpreta cada ola como un recoveco
      // y llena el lago de manchas grises.
      depthWrite: false,
    });

    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
  }

  /**
   * Detalle de la lámina. Menos subdivisiones bajan mucho el coste de vértices
   * y de sombreado; sin detalle, además, se calcula la normal plana y se quita
   * la espuma de cresta, que son varias evaluaciones extra de la ola por píxel.
   */
  setDetail(sub, detail) {
    const changed = this._sub !== sub || this._detail !== detail;
    this._sub = sub;
    this._detail = detail;
    if (this.material.defines.SIMPLE !== (detail ? 0 : 1)) {
      this.material.defines.SIMPLE = detail ? 0 : 1;
      this.material.needsUpdate = true;
    }
    if (changed && this._lastBuild) this.build(...this._lastBuild);
  }

  /** Rehace la malla a partir de las casillas de agua de la rejilla. */
  build(grid, cells) {
    this._lastBuild = [grid, cells];
    const SUB = this._sub || 3; // subdivisiones por casilla
    const pos = [];
    const shore = [];
    const idx = [];
    const step = TILE / SUB;
    const half = TILE / 2;
    let base = 0;

    const isLand = (x, y) => {
      const c = grid.get(x, y);
      return !c || c.terrain !== T.WATER;
    };

    for (const cell of cells) {
      const y = cell.wy + 0.62;
      // Vecinos de tierra: definen hacia qué lados sube la orilla.
      const lpx = isLand(cell.x + 1, cell.y) ? 1 : 0;
      const lnx = isLand(cell.x - 1, cell.y) ? 1 : 0;
      const lpz = isLand(cell.x, cell.y + 1) ? 1 : 0;
      const lnz = isLand(cell.x, cell.y - 1) ? 1 : 0;

      for (let j = 0; j <= SUB; j++) {
        for (let i = 0; i <= SUB; i++) {
          const u = i / SUB, v = j / SUB;
          pos.push(cell.wx - half + i * step, y, cell.wz - half + j * step);
          // Rampa desde el centro hacia cada borde que da a tierra.
          const s = Math.max(lpx * u, lnx * (1 - u), lpz * v, lnz * (1 - v));
          shore.push(s * s); // al cuadrado: la espuma se concentra en el borde
        }
      }
      const row = SUB + 1;
      for (let j = 0; j < SUB; j++) {
        for (let i = 0; i < SUB; i++) {
          const a = base + j * row + i;
          idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
        }
      }
      base += row * row;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aShore', new THREE.Float32BufferAttribute(shore, 1));
    geo.setIndex(idx);
    geo.computeBoundingSphere();

    this.mesh.geometry.dispose();
    this.mesh.geometry = geo;
    this.mesh.visible = cells.length > 0;
  }

  /** Sincroniza la luz y el cielo para que el agua refleje lo que le rodea. */
  setEnvironment({ sunDir, sunColor, skyTop, skyHorizon }) {
    if (sunDir) this.uniforms.uSunDir.value.copy(sunDir);
    if (sunColor !== undefined) this.uniforms.uSunColor.value.setHex(sunColor);
    if (skyTop !== undefined) this.uniforms.uSkyTop.value.setHex(skyTop);
    if (skyHorizon !== undefined) this.uniforms.uSkyHorizon.value.setHex(skyHorizon);
  }

  update(time) {
    this.uniforms.uTime.value = time;
  }
}
