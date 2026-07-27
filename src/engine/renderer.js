import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { VignetteShader } from 'three/examples/jsm/shaders/VignetteShader.js';
import { Sky } from './sky.js';
import { PRESETS, guessQuality } from './quality.js';

/**
 * Capa de render: escena, luces, cielo y postprocesado.
 *
 * La iluminación es de tres puntos: un sol con sombras que define la forma, una
 * luz hemisférica que recoge el color del cielo y del suelo, y un relleno frío
 * opuesto al sol para que las zonas en sombra no se apaguen del todo. Encima, el
 * cielo se convierte en mapa de entorno, que es lo que hace que los materiales
 * metálicos tengan algo que reflejar.
 */
export class Renderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      // El suavizado lo pone el búfer multimuestra del composer, que se puede
      // apagar por nivel de calidad. El del lienzo se fija al crear el contexto
      // y no hay forma de desactivarlo después: dejarlo puesto hacía que el
      // nivel bajo, que no usa composer, fuese más lento que el medio.
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.5, 900);

    // Niebla exponencial: se integra con el horizonte sin un corte visible,
    // al contrario que la lineal, que deja un plano de recorte evidente.
    this.scene.fog = new THREE.FogExp2(0x8faccc, 0.0055);

    this.sky = new Sky(this.renderer, this.scene);

    const sun = new THREE.DirectionalLight(0xfff2d8, 3.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 320;
    sun.shadow.bias = -0.0008;
    sun.shadow.normalBias = 0.05;
    sun.shadow.radius = 3;
    const s = 70;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
    sun.shadow.camera.updateProjectionMatrix();
    this.scene.add(sun, sun.target);
    this.sun = sun;

    this.hemi = new THREE.HemisphereLight(0xa8c8ff, 0x3a3020, 0.34);
    this.scene.add(this.hemi);

    // Relleno frío desde el lado contrario al sol: separa las siluetas del fondo.
    this.fill = new THREE.DirectionalLight(0x6a90ff, 0.22);
    this.fill.position.set(-40, 25, -30);
    this.scene.add(this.fill);

    this.quality = null;
    this.setQuality(guessQuality(this.renderer));
    this.applyPalette();

    this.resize();
    addEventListener('resize', () => this.resize());
  }

  /**
   * Aplica un nivel de calidad. Reconstruye el composer porque las pasadas
   * caras (oclusión ambiental, resplandor) no se pueden abaratar: se quitan.
   */
  setQuality(level) {
    if (this.quality === level) return;
    this.quality = level;
    const q = PRESETS[level];
    this.preset = q;

    this.renderer.setPixelRatio(Math.min(devicePixelRatio, q.maxDpr));
    this.renderer.shadowMap.enabled = q.shadows;
    if (q.shadows) {
      this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      // Al cambiar el tamaño hay que tirar el mapa anterior para que se recree.
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
    this.sun.castShadow = q.shadows;
    this.scene.fog.density = q.fogFar;
    this.usePost = q.post;

    if (this._disposeComposer) this._disposeComposer();
    if (q.post) this._buildComposer(q);

    // Los materiales tienen que recompilarse al cambiar el estado de sombras.
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    this.resize();
  }

  _buildComposer(q) {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: q.msaa,
    });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    // Oclusión ambiental: da sensación de que las piezas se apoyan en el suelo,
    // pero es con diferencia lo más caro del encadenado.
    if (q.gtao) {
      this.gtao = new GTAOPass(this.scene, this.camera, size.x, size.y);
      this.gtao.output = GTAOPass.OUTPUT.Default;
      this.gtao.updateGtaoMaterial({
        radius: 0.55, distanceExponent: 1.2, thickness: 1.4,
        scale: 1.1, samples: 12, screenSpaceRadius: false,
      });
      this.gtao.blendIntensity = 0.85;
      this.composer.addPass(this.gtao);
    } else {
      this.gtao = null;
    }

    if (q.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.42, 0.62, 0.82);
      this.composer.addPass(this.bloom);
    } else {
      this.bloom = null;
    }

    this.vignette = new ShaderPass(VignetteShader);
    this.vignette.uniforms.offset.value = 1.15;
    this.vignette.uniforms.darkness.value = 1.05;
    this.composer.addPass(this.vignette);

    this.composer.addPass(new OutputPass());

    this._disposeComposer = () => {
      this.composer.renderTarget1?.dispose();
      this.composer.renderTarget2?.dispose();
      for (const p of this.composer.passes) p.dispose?.();
      this.composer = null;
      this._disposeComposer = null;
    };
  }

  /** Vuelca la paleta activa del cielo sobre luces, niebla y exposición. */
  applyPalette() {
    const b = this.sky.blend;
    if (!b) return;
    this.sun.color.setHex(b.key);
    this.sun.intensity = b.keyI;
    this.hemi.color.setHex(b.hemiSky);
    this.hemi.groundColor.setHex(b.hemiGround);
    this.hemi.intensity = b.hemiI;
    this.fill.color.setHex(b.fill);
    this.fill.intensity = b.fillI;
    // El mapa de entorno ilumina desde todas partes: a intensidad plena borra
    // las sombras del sol y deja la escena plana.
    this.scene.environmentIntensity = b.envI;
    this.scene.fog.color.setHex(b.fog);
    this.renderer.toneMappingExposure = b.exposure;
    this._sunDir = b.sunDir;
  }

  setSector(sector) {
    this.sky.setPalette(Math.floor((sector - 1) / 2));
  }

  update(dt, time) {
    this.sky.update(dt, time);
    this.applyPalette();
    if (this.sky.needsEnvRefresh) this.sky.refreshEnvironment();
    this.sky.follow(this.camera);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    if (this.composer) this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Mantiene la sombra centrada en lo que mira el jugador. */
  followShadow(target) {
    const d = this._sunDir || { x: 0.4, y: 0.5, z: 0.3 };
    this.sun.target.position.copy(target);
    this.sun.position.set(
      target.x + d.x * 110,
      target.y + Math.max(0.25, d.y) * 110,
      target.z + d.z * 110,
    );
    this.fill.target = this.sun.target;
    this.fill.position.set(target.x - d.x * 90, target.y + 45, target.z - d.z * 90);
  }

  render() {
    if (this.usePost && this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
