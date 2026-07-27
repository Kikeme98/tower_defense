# Rogue Spire

Tower defense roguelike en Three.js, con mapa generado proceduralmente que
**crece durante la partida**. Inspirado en Rogue Tower.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build
```

`?seed=loquesea` en la URL reproduce exactamente la misma partida.

## Cómo se juega

Construyes torres junto al camino, lanzas la oleada, y al terminarla eliges una
de tres cartas. Cada cinco oleadas el mapa se expande: los caminos se alargan,
aparece territorio nuevo y a veces se abre una ruta más. No hay final: se juega
hasta que el núcleo cae.

| Tecla | Acción |
|---|---|
| Clic izq. | Construir / seleccionar torre |
| Arrastrar | Mover el mapa agarrando el terreno |
| Clic der. | Cancelar · arrastrar con él gira la cámara |
| Mayús + clic | Construir en serie |
| `1`–`9`, `0`, `-` | Elegir torre |
| `Espacio` | Lanzar oleada |
| `V` | Vender la torre seleccionada |
| `P` | Pausa |
| `WASD` | Desplazar la cámara · `Q`/`E` girar |
| Rueda | Zoom hacia el cursor |

## Las tres ideas que sostienen el diseño

**Vida en tres capas.** Cada enemigo tiene escudo, armadura y salud como
depósitos separados que se vacían siempre en ese orden, y cada torre tiene un
multiplicador distinto contra cada capa (el Cañón hace ×1,7 a la armadura pero
×0,4 al escudo). Ninguna torre sirve para todo, así que la composición de la
defensa importa más que el daño bruto. Los tres venenos refuerzan lo mismo:
hemorragia, fuego y veneno hacen daño completo a su capa afín y la mitad a las
otras dos, y cada uno bloquea la regeneración de la suya.

**El mapa crece y los portales emergen.** Los caminos se generan del núcleo
hacia afuera con un random walk sesgado, y cada sector se alargan. Cuando una
ruta queda encajonada por los caminos que ya existen y no puede avanzar más, se
sella: su extremo se convierte en un portal permanente. El jugador se genera sus
propios frentes al dejar que el mapa se enrede.

**El terreno decide dónde construir.** La elevación da daño y alcance, el bosque
cambia daño por alcance, la montaña es escasa y muy codiciada, y sobre el agua
sólo se puede construir el Arpón. Repartidos junto al camino hay filones (oro
por oleada si los tocas con una torre) y obeliscos (+18% de daño a las torres
adyacentes).

## Presentación

**Iluminación de tres puntos** con proporción de clave dominante: el sol pesa
varias veces más que la hemisférica, el relleno frío y el mapa de entorno
juntos. Con el ambiente subido las sombras existen pero quedan lavadas y el
mapa se ve plano, así que la intensidad del entorno se mantiene baja a
propósito. El cielo es un degradado procedural que además se convierte en mapa
de entorno y da el color de la niebla, y su paleta se oscurece cada dos
sectores: un aviso de dificultad que se lee sin mirar la interfaz.

**Partículas** como billboards instanciados con tamaño, giro, color y opacidad
propios de cada una — necesario para que el humo se disipe y las chispas se
apaguen sin pintar manchas negras. Cuatro dibujos (humo, chispa, destello,
anillo) en un atlas generado por código, en dos sistemas: aditivo para lo que
emite luz, mezcla normal para el humo.

**Superficies** con textura procedural: grano fino más un oscurecimiento hacia
los bordes que separa visualmente cada casilla. La vegetación son coníferas,
frondosos, rocas y matojos colocados de forma determinista, así que reconstruir
el mapa no hace bailar el bosque.

**El agua** es una única malla subdividida con sombreador propio, no una caja
por casilla: las olas se calculan a partir de la posición del mundo y por eso
cruzan de una casilla a la siguiente sin costuras. Lleva reflejo del cielo con
Fresnel, brillo especular del sol sobre las crestas, aclarado por profundidad y
espuma en la orilla. Cada lago se asienta un escalón por debajo de su orilla más
baja, para que sea una lámina hundida en el paisaje y no un pozo.

**Los enemigos** son modelos por piezas —torso, cabeza, casco, brazos, armas—
con el cuerpo y las extremidades en lotes separados: eso es lo que permite que
las piernas alternen la zancada y las alas batan, cosa imposible dentro de una
sola malla instanciada. El color de instancia sólo tiñe, así que cada especie se
identifica sin borrar el metal, el cuero y la piel del modelo.

## Interfaz

Diseñada contra una lista de comprobación de UI de juego: **ningún texto por
debajo de 14px** (24px+ para las cifras críticas), **ningún objetivo pulsable
por debajo de 44px**, margen de seguridad para que nada toque el borde, y el
color nunca como único portador de información — los tres depósitos de vida
llevan símbolo (♥ ▣ ◈), la rareza de las cartas se distingue por el grosor del
marco, y el cursor de construcción usa un marco o un aspa, no verde y rojo.
Todo lo enfocable tiene indicador visible y se respeta `prefers-reduced-motion`.

## Estructura

```
src/
  core/      rng con semilla y ruido · bucle de paso fijo · entrada
  engine/    render y postprocesado · cielo · cámara RTS · lotes instanciados ·
             partículas · efectos
  world/     rejilla y terrenos · generación procedural · malla del terreno
  game/      balance · torres · enemigos · proyectiles · oleadas · cartas · orquestador
  ui/        HUD en HTML sobre el canvas
```

Todo el mapa se dibuja en unos **9 draw calls** gracias a `InstancedBatch`
(`src/engine/instanced.js`), un lote de instancias en modo inmediato que escribe
las matrices a mano en el buffer, sin objetos temporales por frame. Un mapa
maduro con 1.400 casillas y decenas de torres cuesta ~0,6 ms de frame.

Los números que definen la curva de dificultad están todos en
`src/game/balance.js`.

## Comprobaciones

```bash
node test.mjs     # lógica: rutas conectadas y sin saltos, orden de capas de daño, draft
node smoke.mjs 60 # juega 3 partidas completas hasta la oleada 60 con un bot
```

`smoke.mjs` monta el juego entero con un renderer simulado y lo juega sin
navegador. Es lo que se usó para calibrar el balance: informa de la oleada
alcanzada, qué enemigos se colaron y el coste por frame.

## Consola

`spire` está expuesto en `window`: `spire.game`, `spire.loop.timeScale = 4`,
`spire.BALANCE`, `spire.game.state.gold = 9999`.
