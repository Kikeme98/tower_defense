# Rogue Spire — migración a Godot 4

Puerto en curso del juego web (`../src`). Se porta primero la lógica pura, que
es la que no depende del motor y por tanto la única que se puede verificar sin
abrir una ventana.

## Estado

| Parte | Estado |
|---|---|
| Aleatoriedad con semilla y ruido | ✅ portado |
| Rejilla y catálogo de terrenos | ✅ portado |
| Generación procedural del mapa | ✅ portado y verificado |
| Terreno renderizado (MultiMesh por regiones) | ✅ se ve |
| Balance y curva de dificultad | ✅ portado |
| Enemigos: daño en tres capas y venenos | ✅ portado y verificado |
| Torres, oleadas, cartas | ⬜ pendiente |
| Interfaz | ⬜ pendiente |
| Agua, partículas, modelos | ⬜ pendiente |

## Comprobar

```bash
GODOT=/Applications/Godot.app/Contents/MacOS/Godot

# Lógica, sin ventana (equivalente a test.mjs)
$GODOT --headless --script tests/test_mapgen.gd   # generación del mapa
$GODOT --headless --script tests/test_combat.gd   # daño en tres capas y balance

# Ver el mapa: renderiza y guarda shot.png
$GODOT --quit-after 300 res://scenes/main.tscn -- --shot --sectors=4
```

El modo captura es lo que permite verificar el resultado visual sin abrir el
editor. Sin él, cada cambio exigiría lanzar el juego y mirar a ojo, que es el
ciclo lento que conviene evitar.

## Notas de la migración

Tres diferencias de GDScript que costaron tiempo y conviene recordar:

- **Inferencia de tipos.** `var x := c.x` falla si `c` viene de un diccionario
  sin tipar. Hay que anotar bastante más que en JavaScript.
- **`class_name` no se resuelve al ejecutar con `--script`** en headless, aunque
  la clase esté registrada. En los tests hay que usar `preload`.
- **Los errores despistan.** Un fallo de parseo en un archivo aparece como
  *"Nonexistent function 'new'"* en el que lo usa, no donde está el error real.

Y dos del motor:

- Los colores de instancia de `MultiMesh` se interpretan en **espacio lineal**;
  los de la paleta están en sRGB y hay que convertirlos o salen lavados.
- `--headless` no rasteriza, así que para capturar hay que ejecutar con ventana.
