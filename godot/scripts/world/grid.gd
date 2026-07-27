class_name Grid
extends RefCounted

## Rejilla del mundo: almacenamiento disperso (el mapa crece sin límite conocido
## de antemano) y catálogo de terrenos con sus efectos sobre las torres.

const TILE := 2.0  ## tamaño de casilla en unidades de mundo
const HEIGHT_STEP := 0.8  ## altura de cada escalón de relieve

enum T { WATER, SAND, GRASS, FOREST, ROCK, MOUNTAIN, PATH, CORE, SPAWN }

## `mods` son multiplicadores que se aplican a la torre construida encima.
## Son la razón para pensar dónde construir en vez de amontonar torres.
const TERRAIN := {
	T.WATER: {
		"name": "Agua", "top": Color8(0x2f, 0x7f, 0xa8), "buildable": false,
		"desc": "Solo torres anfibias.", "mods": {"fireRate": 1.15},
	},
	T.SAND: {
		"name": "Arena", "top": Color8(0xcf, 0xbb, 0x8c), "buildable": true,
		"desc": "+10% cadencia", "mods": {"fireRate": 1.10},
	},
	T.GRASS: {
		"name": "Pradera", "top": Color8(0x6d, 0x9b, 0x52), "buildable": true,
		"desc": "Sin bonus ni penalización", "mods": {},
	},
	T.FOREST: {
		"name": "Bosque", "top": Color8(0x4a, 0x7a, 0x4a), "buildable": true,
		"desc": "+20% daño, -12% alcance", "mods": {"damage": 1.20, "range": 0.88},
	},
	T.ROCK: {
		"name": "Roca", "top": Color8(0x8b, 0x86, 0x7e), "buildable": true,
		"desc": "+15% daño, -8% cadencia", "mods": {"damage": 1.15, "fireRate": 0.92},
	},
	T.MOUNTAIN: {
		"name": "Montaña", "top": Color8(0xa9, 0xa4, 0x9c), "buildable": true,
		"desc": "+30% alcance", "mods": {"range": 1.30},
	},
	T.PATH: {
		"name": "Camino", "top": Color8(0xb0, 0x96, 0x6f), "buildable": false,
		"desc": "Ruta enemiga", "mods": {},
	},
	T.CORE: {
		"name": "Núcleo", "top": Color8(0x4a, 0x63, 0xb0), "buildable": false,
		"desc": "", "mods": {},
	},
	T.SPAWN: {
		"name": "Portal", "top": Color8(0xb0, 0x3a, 0x63), "buildable": false,
		"desc": "", "mods": {},
	},
}


static func is_buildable(t: int) -> bool:
	return TERRAIN[t]["buildable"]


## Empaqueta coordenadas con signo en una sola clave entera para el diccionario.
static func key(x: int, y: int) -> int:
	return ((x + 4096) << 13) | (y + 4096)


class Cell extends RefCounted:
	var x: int
	var y: int
	var terrain: int
	var height: int
	var path := false
	var path_dist := 999  ## distancia en casillas al camino más cercano
	var tower = null
	var tint := 1.0  ## variación de color por casilla
	var feature := ""  ## "vein" | "obelisk" | "" · sin decidir = null

	func _init(px: int, py: int, t: int, h: int) -> void:
		x = px
		y = py
		terrain = t
		height = h

	var wx: float:
		get: return float(x) * Grid.TILE

	var wz: float:
		get: return float(y) * Grid.TILE

	## Altura del suelo en unidades de mundo (la parte superior del bloque).
	## El escalón es generoso a propósito: con desniveles pequeños el mapa se
	## lee como una alfombra plana y el bonus de elevación no se aprecia.
	var wy: float:
		get: return float(height) * Grid.HEIGHT_STEP


var cells := {}
var min_x := 0
var max_x := 0
var min_y := 0
var max_y := 0
var version := 0  ## se incrementa al mutar: la malla del terreno se reconstruye

const DIRS := [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]


func get_cell(x: int, y: int) -> Cell:
	return cells.get(key(x, y))


func set_cell(x: int, y: int, terrain: int, height: int) -> Cell:
	var k := key(x, y)
	var c: Cell = cells.get(k)
	if c != null:
		c.terrain = terrain
		c.height = height
	else:
		c = Cell.new(x, y, terrain, height)
		cells[k] = c
		min_x = mini(min_x, x)
		max_x = maxi(max_x, x)
		min_y = mini(min_y, y)
		max_y = maxi(max_y, y)
	version += 1
	return c


func has_cell(x: int, y: int) -> bool:
	return cells.has(key(x, y))


## Casilla bajo un punto del mundo.
func at_world(wx: float, wz: float) -> Cell:
	return get_cell(int(round(wx / TILE)), int(round(wz / TILE)))


var radius: float:
	get:
		var m := maxi(maxi(absi(min_x), absi(max_x)), maxi(absi(min_y), absi(max_y)))
		return float(m) * TILE


func neighbors(x: int, y: int) -> Array:
	var out := []
	for d in DIRS:
		var c := get_cell(x + d.x, y + d.y)
		if c != null:
			out.append(c)
	return out


func count_path_neighbors(x: int, y: int, exclude: Cell = null) -> int:
	var n := 0
	for d in DIRS:
		var c := get_cell(x + d.x, y + d.y)
		if c != null and c.path and c != exclude:
			n += 1
	return n
