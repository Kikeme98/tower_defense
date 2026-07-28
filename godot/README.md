# Rogue Spire — migración a Godot 4

Puerto del juego web (`../src`). Se portó primero la lógica pura, que es la que
no depende del motor y por tanto la única que se puede verificar sin abrir una
ventana; después la capa visual y la interfaz.

## Estado

**Jugable de principio a fin**: construir, combatir, elegir carta, ver crecer el
mapa y perder el núcleo. Lo que queda es acabado visual.

| Parte | Estado |
|---|---|
| Aleatoriedad con semilla y ruido | ✅ portado |
| Rejilla y catálogo de terrenos | ✅ portado |
| Generación procedural del mapa | ✅ portado y verificado |
| Terreno renderizado (MultiMesh por regiones) | ✅ se ve |
| Balance y curva de dificultad | ✅ portado |
| Enemigos: daño en tres capas y venenos | ✅ portado y verificado |
| Bestiario completo, con voladores y sanadores | ✅ portado |
| Catálogo de torres y estadísticas | ✅ portado y verificado |
| Combate: puntería, proyectiles, área, cadena, rayo | ✅ portado y verificado |
| Director de oleadas | ✅ portado y verificado |
| Cartas y draft | ✅ portado y verificado |
| Partida completa: fases, oro, vidas, expansión | ✅ portado y verificado |
| Cámara isométrica con zoom y arrastre | ✅ |
| Interfaz: recursos, tienda, mejoras, draft | ✅ con test de accesibilidad |
| Barras de las tres capas sobre los enemigos | ✅ |
| Partículas de impacto, explosión y rayo | ✅ |
| Núcleo y portales | ✅ |
| Modelos por piezas (enemigos y torres) | ⬜ pendiente: son primitivas |
| Agua con oleaje | ⬜ pendiente: es terreno azul |
| Sonido | ⬜ pendiente |

## Comprobar

```bash
GODOT=/Applications/Godot.app/Contents/MacOS/Godot

# Lógica e interfaz, sin ventana
$GODOT --headless --script tests/test_mapgen.gd   # generación del mapa
$GODOT --headless --script tests/test_combat.gd   # daño en tres capas y balance
$GODOT --headless --script tests/test_towers.gd   # torres, terreno y oleadas
$GODOT --headless --script tests/test_cards.gd    # draft roguelike
$GODOT --headless --script tests/test_battle.gd   # puntería, disparos y economía
$GODOT --headless --script tests/test_ui.gd       # tipografía, objetivos, glifos

# Partidas completas jugadas por un bot: es la herramienta de balance
$GODOT --headless --script tests/smoke.gd -- --runs=5 --waves=60

# Ver el juego: renderiza y guarda shot.png
$GODOT --quit-after 1000 res://scenes/main.tscn -- --shot --sectors=2 --shot-at=420

# Jugar
$GODOT res://scenes/main.tscn
```

El modo captura es lo que permite verificar el resultado visual sin abrir el
editor. Sin él, cada cambio exigiría lanzar el juego y mirar a ojo, que es el
ciclo lento que conviene evitar.

## Controles

| Acción | Control |
|---|---|
| Construir | clic izquierdo con una torre elegida en la tienda |
| Construir en serie | mantener Mayús al construir |
| Seleccionar torre / cancelar | clic izquierdo sobre ella / clic derecho |
| Acercar y alejar | rueda del ratón |
| Desplazar el mapa | arrastrar con el botón derecho o central |

La cámara no gira, y es deliberado: el jugador reconoce una posición de un
vistazo en vez de reorientarse cada vez. En la versión web el control libre de
cámara costó tres rondas de arreglos y no aportaba nada al juego.

## Notas de la migración

Cuatro diferencias de GDScript que costaron tiempo y conviene recordar:

- **Inferencia de tipos.** `var x := c.x` falla si `c` viene de un diccionario
  sin tipar. Hay que anotar bastante más que en JavaScript.
- **`class_name` no se resuelve al ejecutar con `--script`** en headless, aunque
  la clase esté registrada. En los tests hay que usar `preload`.
- **Los errores despistan.** Un fallo de parseo en un archivo aparece como
  *"Nonexistent function 'new'"* en el que lo usa, no donde está el error real.
  Peor todavía: un `const` que sombrea una clase nativa hace que la escena no
  arranque **sin imprimir nada**. Si el juego no dice ni «mapa: N casillas»,
  cargar los scripts uno a uno con `load()` señala al culpable.
- **Los lambda capturan las locales por valor**, no por referencia como en
  JavaScript. Un contador acumulado dentro de un `func()` no se ve fuera: hay
  que meterlo en un array o en una propiedad.

Y cuatro del motor:

- Los colores de instancia de `MultiMesh` se interpretan en **espacio lineal**;
  los de la paleta están en sRGB y hay que convertirlos o salen lavados.
- `--headless` no rasteriza, así que para capturar hay que ejecutar con ventana.
- **Los presets de anclaje no sirven para esquinas con margen.**
  `PRESET_CENTER_BOTTOM` deja el borde superior por debajo del inferior en
  cuanto se aplica el margen de seguridad, y el panel sale con altura negativa.
  Hay que fijar los cuatro anclajes y dejar que `grow_*` decida hacia dónde
  crece el contenido.
- **El contador de referencias no recoge ciclos.** Una celda que apunta a su
  torre y una torre que apunta a su celda no se liberan nunca. Con `weakref` en
  el lado que no es dueño, el ciclo desaparece.

## Dos fallos que la versión web también tiene

Salieron aquí y merece la pena anotarlos:

1. **El mapa podía llevarse por delante lo construido.** El generador retrocede
   cuando el camino se acorrala, y al retroceder borraba las casillas pisadas.
   Si una tenía torre, la torre quedaba huérfana. Ahora el camino rodea las
   torres.
2. **Símbolos que dependen de la fuente del sistema.** ♥, ⬢ y ⚔ se ven en macOS
   por el mecanismo de reserva del motor, pero no están en la fuente incrustada.
   En la web pasa lo mismo con las fuentes del navegador.
