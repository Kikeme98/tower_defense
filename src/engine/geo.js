import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Utilidades para montar modelos por piezas.
 *
 * Todo se desindexa antes de fusionar: los poliedros de three no llevan índice
 * y las cajas y cilindros sí, y mergeGeometries se niega a mezclar ambas cosas.
 * El color va por vértice, de modo que un modelo entero de varios materiales
 * cabe en una sola llamada de dibujo.
 */

export const flat = (g) => (g.index ? g.toNonIndexed() : g);
export const merge = (parts) => BufferGeometryUtils.mergeGeometries(parts);

export const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const SPH = (r, s = 7) => new THREE.SphereGeometry(r, s, s);
export const CYL = (rt, rb, h, s = 6) => new THREE.CylinderGeometry(rt, rb, h, s);
export const CONE = (r, h, s = 6) => new THREE.ConeGeometry(r, h, s);
export const TORUS = (r, t, s = 8, ts = 16) => new THREE.TorusGeometry(r, t, s, ts);
export const OCTA = (r) => new THREE.OctahedronGeometry(r);

/** Aplica un color plano a una geometría ya posicionada. */
export function tint(geo, color) {
  const g = flat(geo);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Coloca una primitiva: escala, rota y traslada en un paso. */
export function piece(geo, color, pos = [0, 0, 0], rot, scale) {
  if (scale) geo.scale(scale[0], scale[1], scale[2]);
  if (rot) {
    if (rot[0]) geo.rotateX(rot[0]);
    if (rot[1]) geo.rotateY(rot[1]);
    if (rot[2]) geo.rotateZ(rot[2]);
  }
  geo.translate(pos[0], pos[1], pos[2]);
  return tint(geo, color);
}

/** Repite una pieza en círculo: almenas, contrafuertes, púas de una corona. */
export function ring(count, fn) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(fn((i / count) * Math.PI * 2, i));
  return out;
}
