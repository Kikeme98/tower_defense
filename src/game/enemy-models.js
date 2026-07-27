import { piece, merge, BOX, SPH, CYL, CONE } from '../engine/geo.js';

/**
 * Modelos de los enemigos.
 *
 * Cada criatura son dos piezas: un cuerpo con todo el detalle horneado (torso,
 * cabeza, brazos, armas) y una extremidad que se instancia dos veces y se anima
 * por separado — piernas que alternan al andar o alas que baten. Separarlas es
 * lo que permite que se muevan: dentro de una sola malla instanciada no hay
 * forma de animar una parte sin mover el conjunto.
 *
 * El color va por vértice, así que un lote entero se dibuja de una vez y aun así
 * cada pieza tiene su tono (piel, metal, cuero, tela).
 */

// Paleta común: da coherencia de material entre criaturas distintas.
const C = {
  skin: 0x9d6b4f, skinDark: 0x7a5039,
  metal: 0x8e97a4, metalDark: 0x5c646f,
  leather: 0x6b4a32, cloth: 0x46506b,
  bone: 0xd8cfc0, eye: 0xffe98a,
};

/** Soldado: bípedo con casco, hombreras y un hacha corta. */
function grunt() {
  const body = merge([
    piece(BOX(0.62, 0.62, 0.44), C.leather, [0, 0.86, 0]),            // torso
    piece(BOX(0.86, 0.16, 0.5), C.metalDark, [0, 1.12, 0]),           // hombreras
    piece(SPH(0.25), C.skin, [0, 1.34, 0.02]),                        // cabeza
    piece(CYL(0.27, 0.29, 0.2, 7), C.metal, [0, 1.46, 0]),            // casco
    piece(BOX(0.07, 0.07, 0.07), C.eye, [-0.09, 1.32, 0.22]),         // ojos
    piece(BOX(0.07, 0.07, 0.07), C.eye, [0.09, 1.32, 0.22]),
    piece(CYL(0.09, 0.09, 0.5, 5), C.skinDark, [-0.38, 0.92, 0.06], [0.4, 0, 0]),  // brazos
    piece(CYL(0.09, 0.09, 0.5, 5), C.skinDark, [0.38, 0.92, 0.06], [0.4, 0, 0]),
    piece(CYL(0.05, 0.05, 0.62, 5), C.leather, [0.42, 1.0, 0.3], [1.2, 0, 0]),     // mango
    piece(BOX(0.1, 0.26, 0.3), C.metal, [0.42, 1.02, 0.62]),                       // hoja
  ]);
  const limb = merge([
    piece(CYL(0.11, 0.13, 0.52, 5), C.skinDark, [0, -0.26, 0]),
    piece(BOX(0.2, 0.12, 0.3), C.leather, [0, -0.5, 0.05]),
  ]);
  return { body, limb, limbAt: [0.17, 0.56, 0], kind: 'leg' };
}

/** Corredor: inclinado hacia delante, zancada larga, cabeza afilada. */
function runner() {
  const body = merge([
    piece(BOX(0.42, 0.5, 0.62), C.skin, [0, 0.82, 0.06], [0.35, 0, 0]),
    piece(CONE(0.22, 0.5, 6), C.skinDark, [0, 1.02, 0.34], [1.25, 0, 0]),    // cabeza
    piece(BOX(0.06, 0.06, 0.06), 0xff5a4a, [-0.08, 1.06, 0.48]),
    piece(BOX(0.06, 0.06, 0.06), 0xff5a4a, [0.08, 1.06, 0.48]),
    piece(CYL(0.06, 0.06, 0.42, 5), C.skinDark, [-0.26, 0.86, 0.16], [0.9, 0, 0]),
    piece(CYL(0.06, 0.06, 0.42, 5), C.skinDark, [0.26, 0.86, 0.16], [0.9, 0, 0]),
    piece(CONE(0.1, 0.42, 5), C.bone, [0, 0.9, -0.34], [-1.4, 0, 0]),        // cola
  ]);
  const limb = merge([
    piece(CYL(0.08, 0.1, 0.6, 5), C.skin, [0, -0.3, 0]),
    piece(BOX(0.16, 0.1, 0.3), C.skinDark, [0, -0.58, 0.08]),
  ]);
  return { body, limb, limbAt: [0.14, 0.62, 0], kind: 'leg' };
}

/** Blindado: torso ancho de placas, yelmo con visera y escudo. */
function armored() {
  const body = merge([
    piece(BOX(0.8, 0.7, 0.56), C.metal, [0, 0.9, 0]),
    piece(BOX(0.88, 0.14, 0.62), C.metalDark, [0, 1.2, 0]),
    piece(BOX(0.9, 0.1, 0.6), C.metalDark, [0, 0.62, 0]),
    piece(CYL(0.26, 0.3, 0.34, 7), C.metal, [0, 1.42, 0]),               // yelmo
    piece(BOX(0.34, 0.08, 0.1), 0x1a1a20, [0, 1.42, 0.24]),              // visera
    piece(BOX(0.16, 0.5, 0.44), C.metalDark, [-0.5, 0.94, 0.08]),        // escudo
    piece(BOX(0.12, 0.12, 0.5), C.leather, [0.48, 0.98, 0.14]),          // brazo armado
  ]);
  const limb = merge([
    piece(CYL(0.14, 0.16, 0.5, 5), C.metalDark, [0, -0.25, 0]),
    piece(BOX(0.26, 0.14, 0.34), C.metal, [0, -0.48, 0.04]),
  ]);
  return { body, limb, limbAt: [0.22, 0.6, 0], kind: 'leg' };
}

/** Volador: cuerpo fusiforme con alas membranosas. */
function flyer() {
  const body = merge([
    piece(SPH(0.3), C.cloth, [0, 0.9, 0], null, [1, 0.85, 1.5]),
    piece(CONE(0.2, 0.42, 6), C.cloth, [0, 0.9, 0.42], [1.4, 0, 0]),      // morro
    piece(SPH(0.1), 0x9fe8ff, [-0.1, 0.98, 0.26]),
    piece(SPH(0.1), 0x9fe8ff, [0.1, 0.98, 0.26]),
    piece(CONE(0.12, 0.5, 5), C.metalDark, [0, 0.88, -0.5], [-1.5, 0, 0]), // cola
  ]);
  // El ala nace en el origen para que rotar la instancia la haga batir.
  const limb = merge([
    piece(BOX(0.62, 0.05, 0.42), C.cloth, [0.34, 0, 0]),
    piece(BOX(0.06, 0.06, 0.46), C.metalDark, [0.06, 0.02, 0]),
  ]);
  return { body, limb, limbAt: [0.16, 0.92, 0], kind: 'wing' };
}

/** Sanador: figura encapuchada con orbe flotante. */
function healer() {
  const body = merge([
    piece(CONE(0.4, 0.9, 7), C.cloth, [0, 0.45, 0]),                     // túnica
    piece(SPH(0.22), C.cloth, [0, 1.02, 0]),                             // capucha
    piece(CONE(0.24, 0.3, 7), C.cloth, [0, 1.16, -0.02]),
    piece(BOX(0.16, 0.06, 0.06), 0x4ad07a, [0, 1.0, 0.18]),              // mirada
    piece(CYL(0.04, 0.04, 0.9, 5), C.leather, [0.3, 0.78, 0.06]),        // báculo
    piece(SPH(0.16, 8), 0x7dffb0, [0.3, 1.3, 0.06]),                     // orbe
  ]);
  // "Extremidad" decorativa: los bajos de la túnica, que ondean al avanzar.
  const limb = merge([piece(CONE(0.16, 0.34, 5), C.cloth, [0, -0.17, 0])]);
  return { body, limb, limbAt: [0.2, 0.24, 0], kind: 'leg' };
}

/** Coloso: mole bípeda de piedra y metal. */
function colossus() {
  const body = merge([
    piece(BOX(1.0, 0.86, 0.72), 0x6b5a52, [0, 1.1, 0]),                  // torso
    piece(BOX(1.3, 0.24, 0.8), C.metalDark, [0, 1.46, 0]),               // hombreras
    piece(SPH(0.26), 0x4a3f38, [0, 1.62, 0.04]),                         // cabeza hundida
    piece(BOX(0.4, 0.1, 0.1), 0xff5a4a, [0, 1.62, 0.24]),                // visor
    piece(CYL(0.18, 0.16, 0.8, 6), 0x6b5a52, [-0.66, 1.0, 0], [0.15, 0, 0]),  // brazos
    piece(CYL(0.18, 0.16, 0.8, 6), 0x6b5a52, [0.66, 1.0, 0], [0.15, 0, 0]),
    piece(BOX(0.34, 0.34, 0.34), C.metal, [-0.68, 0.58, 0.04]),          // puños
    piece(BOX(0.34, 0.34, 0.34), C.metal, [0.68, 0.58, 0.04]),
    piece(BOX(0.2, 0.3, 0.2), 0x8a7a6a, [0, 1.9, -0.1]),                 // cresta
  ]);
  const limb = merge([
    piece(CYL(0.2, 0.24, 0.62, 6), 0x5a4a42, [0, -0.31, 0]),
    piece(BOX(0.38, 0.18, 0.5), C.metalDark, [0, -0.6, 0.06]),
  ]);
  return { body, limb, limbAt: [0.3, 0.68, 0], kind: 'leg' };
}

/** Índice por `shape`: coincide con el campo de los enemigos. */
export function buildEnemyModels() {
  return [grunt(), runner(), armored(), flyer(), healer(), colossus()];
}
