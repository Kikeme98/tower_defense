import * as THREE from 'three';

/**
 * Lote de instancias en modo inmediato: cada frame se hace begin() → push()* → end().
 * Sin gestión de ids ni huecos; se escribe directo al buffer de matrices, que es
 * lo que permite miles de enemigos/proyectiles sin coste de CPU apreciable.
 */
export class InstancedBatch {
  /**
   * `culled` activa el descarte por frustum. Sólo tiene sentido en lotes cuyo
   * contenido es estático (el terreno, la vegetación): para eso hay que
   * recalcular la esfera envolvente al llenarlos, lo que sería un desperdicio
   * en lotes que se reescriben enteros cada frame.
   */
  constructor(geometry, material, capacity = 256, { shadows = true, colors = true, culled = false } = {}) {
    this.geometry = geometry;
    this.material = material;
    this.capacity = capacity;
    this.useColors = colors;
    this.shadows = shadows;
    this.culled = culled;
    this.n = 0;
    this._build(capacity);
  }

  _build(capacity) {
    const old = this.mesh;
    const mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow = this.shadows;
    mesh.receiveShadow = this.shadows;
    // En los lotes dinámicos el contenido cambia cada frame y el culling daría
    // falsos negativos; en los estáticos es justo lo que evita dibujar el mapa
    // entero cuando sólo se ve un trozo.
    mesh.frustumCulled = this.culled;
    if (this.useColors) {
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    this.mesh = mesh;
    this.mat = mesh.instanceMatrix.array;
    this.col = this.useColors ? mesh.instanceColor.array : null;
    this.capacity = capacity;

    if (old && old.parent) {
      old.parent.add(mesh);
      old.parent.remove(old);
      old.dispose();
    }
  }

  _grow() {
    const cap = this.capacity * 2;
    const oldMat = this.mat, oldCol = this.col, n = this.n;
    this._build(cap);
    this.mat.set(oldMat.subarray(0, n * 16));
    if (this.col && oldCol) this.col.set(oldCol.subarray(0, n * 3));
  }

  addTo(scene) {
    scene.add(this.mesh);
    return this;
  }

  begin() {
    this.n = 0;
  }

  /** Instancia con rotación solo en Y: la matriz se escribe a mano, sin objetos temporales. */
  push(x, y, z, sx, sy, sz, rotY = 0, r = 1, g = 1, b = 1) {
    if (this.n >= this.capacity) this._grow();
    const o = this.n * 16;
    const m = this.mat;
    const c = Math.cos(rotY), s = Math.sin(rotY);
    m[o] = c * sx;      m[o + 1] = 0;   m[o + 2] = -s * sx;  m[o + 3] = 0;
    m[o + 4] = 0;       m[o + 5] = sy;  m[o + 6] = 0;        m[o + 7] = 0;
    m[o + 8] = s * sz;  m[o + 9] = 0;   m[o + 10] = c * sz;  m[o + 11] = 0;
    m[o + 12] = x;      m[o + 13] = y;  m[o + 14] = z;       m[o + 15] = 1;
    if (this.col) {
      const co = this.n * 3;
      this.col[co] = r; this.col[co + 1] = g; this.col[co + 2] = b;
    }
    return this.n++;
  }

  /** Para casos que necesitan orientación arbitraria (proyectiles en vuelo). */
  pushMatrix(m4, r = 1, g = 1, b = 1) {
    if (this.n >= this.capacity) this._grow();
    this.mat.set(m4.elements, this.n * 16);
    if (this.col) {
      const co = this.n * 3;
      this.col[co] = r; this.col[co + 1] = g; this.col[co + 2] = b;
    }
    return this.n++;
  }

  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    // La esfera envolvente sólo se recalcula en lotes estáticos, que se llenan
    // de uvas a peras. Three la necesita para decidir si el lote entra en cámara.
    if (this.culled) {
      if (this.n > 0) this.mesh.computeBoundingSphere();
      else this.mesh.boundingSphere = null;
    }
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}
