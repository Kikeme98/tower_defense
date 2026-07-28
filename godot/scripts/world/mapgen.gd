class_name MapGen
extends RefCounted

## Generación procedural del mundo.
##
## Idea central (tomada de Rogue Tower): el mapa no se genera una vez, sino que
## *crece*. Cada sector alarga los caminos desde sus portales hacia afuera,
## amplía el radio de terreno y, cada pocos sectores, abre una nueva ruta.
##
## Los portales son *emergentes*: cuando una ruta ya no puede avanzar porque los
## caminos existentes la encajonan, se sella y su extremo queda como punto de
## aparición permanente. El jugador se genera sus propios frentes al dejar que el
## mapa se enrede.
##
## Los caminos se generan del núcleo hacia afuera (así la conexión está
## garantizada por construcción) y se almacenan invertidos, en orden de marcha.

const T := Grid.T

const DIRS := [Vector2i(1, 0), Vector2i(0, 1), Vector2i(-1, 0), Vector2i(0, -1)]


class Route extends RefCounted:
	var id: int
	var cells: Array = []
	var dir: int
	var spawn = null
	var sealed := false

	## Ruta de vuelo: los mismos puntos, muestreados de N en N. El volador sigue
	## el trazado general cortando las curvas, así que es más rápido y más
	## difícil de cubrir, pero no ignora la defensa construida. Uno que fuese en
	## línea recta al núcleo volvería irrelevante el mapa entero.
	##
	## Se recalcula en cada aparición en vez de guardarse: las rutas se alargan al
	## expandir el mapa, y un caché habría que invalidarlo desde cuatro sitios.
	func fly_path(stride := 6) -> Array:
		var out: Array = [cells[0]]
		var i := stride
		while i < cells.size() - 1:
			out.append(cells[i])
			i += stride
		out.append(cells[cells.size() - 1])
		return out


var rng: Rng
var seed_value: int
var grid: Grid
var routes: Array = []
var level := 0
var radius := 0.0
var core = null


func _init(s = 0) -> void:
	rng = Rng.new(s)
	seed_value = rng.seed_value
	grid = Grid.new()


static func _left(d: int) -> int:
	return (d + 3) % 4


static func _right(d: int) -> int:
	return (d + 1) % 4


## Sector 1: núcleo, primera ruta y terreno inicial.
func generate_initial() -> MapGen:
	core = grid.set_cell(0, 0, T.CORE, 1)
	core.path = true
	_new_route(core, rng.randi_range_(0, 3), 26)
	level = 1
	_repaint()
	return self


## Avanza un sector: alarga cada ruta y, periódicamente, añade una nueva.
## Devuelve cuántas rutas se sellaron en este paso.
func expand() -> int:
	level += 1
	var extra := 8 + int(float(level) * 1.6)
	var sealed_now := 0

	for r in routes:
		if r.sealed:
			continue
		var added := _extend_route(r, extra)
		if float(added) < float(extra) * 0.4:
			r.sealed = true
			sealed_now += 1

	var open := 0
	for r in routes:
		if not r.sealed:
			open += 1
	if (level % 3 == 0 or open == 0) and routes.size() < 5:
		_branch_route()

	_repaint()
	return sealed_now


## Longitud del recorrido más corto: sirve para calibrar la dificultad.
var shortest_route: int:
	get:
		var m := 1 << 30
		for r in routes:
			m = mini(m, r.cells.size())
		return m


# --- Rutas ---

func _new_route(from_cell, dir: int, steps: int) -> Route:
	var route := Route.new()
	route.id = routes.size()
	route.dir = dir
	var built := _walk(from_cell, dir, steps, route, false)
	# Se genera núcleo→afuera; los enemigos marchan al revés.
	built.reverse()
	route.cells = built
	route.cells.append(core)
	_set_spawn(route)
	routes.append(route)
	return route


func _extend_route(route: Route, steps: int) -> int:
	var from = route.spawn
	# El portal deja de serlo: vuelve a ser camino normal.
	from.terrain = T.PATH
	var built := _walk(from, route.dir, steps, route, false)
	if built.is_empty():
		from.terrain = T.SPAWN
		return 0
	var n := built.size()
	built.reverse()
	route.cells = built + route.cells
	_set_spawn(route)
	return n


## Abre una bifurcación desde un punto intermedio de una ruta existente.
func _branch_route():
	var base: Route = rng.pick(routes)
	# Punto de bifurcación en el tercio medio: ni pegado al núcleo ni al portal.
	var lo := int(float(base.cells.size()) * 0.25)
	var hi := int(float(base.cells.size()) * 0.7)
	if hi - lo < 4:
		return null

	for attempt in 12:
		var idx := rng.randi_range_(lo, hi)
		var from = base.cells[idx]
		# Sale perpendicular al tramo local del camino.
		var prev = base.cells[idx + 1] if idx + 1 < base.cells.size() else base.cells[idx - 1]
		var along := 0 if absi(from.x - prev.x) > 0 else 1
		var dir: int
		if along == 0:
			dir = 1 if rng.chance() else 3
		else:
			dir = 0 if rng.chance() else 2

		var route := Route.new()
		route.id = routes.size()
		route.dir = dir
		var built := _walk(from, dir, 16 + level * 2, route, true)
		if built.size() < 8:
			for c in built:
				_unmark_path(c)
			continue
		built.reverse()
		# La rama comparte con la ruta base el tramo desde el punto de unión.
		route.cells = built + base.cells.slice(idx)
		_set_spawn(route)
		routes.append(route)
		return route
	return null


func _set_spawn(route: Route) -> void:
	var s = route.cells[0]
	s.terrain = T.SPAWN
	route.spawn = s
	# Dirección con la que salió del mapa: se reutiliza al extender.
	if route.cells.size() > 1:
		var nxt = route.cells[1]
		var dx := signi(s.x - nxt.x)
		var dy := signi(s.y - nxt.y)
		for i in DIRS.size():
			if DIRS[i].x == dx and DIRS[i].y == dy:
				route.dir = i
				break


func _mark_path(x: int, y: int):
	var c := grid.set_cell(x, y, T.PATH, 0)
	c.path = true
	return c


func _unmark_path(c) -> void:
	c.path = false
	# Una casilla con torre no se borra nunca: la torre guarda una referencia
	# débil a su celda, y quitarla del mapa la dejaría huérfana y sin poder
	# recalcular sus estadísticas. `_walk` ya las evita, pero esto lo garantiza.
	if c.tower != null:
		return
	grid.cells.erase(Grid.key(c.x, c.y))


## Random walk direccional con sesgo hacia afuera, tramos rectos mínimos y
## retroceso si se acorrala. Es lo que produce caminos serpenteantes en vez de
## ruido o líneas rectas.
func _walk(start, dir: int, steps: int, route: Route, force_straight_start: bool) -> Array:
	var built: Array = []
	var cur = start
	var d := dir
	var since_turn := 99
	var fails := 0
	var max_r := _target_radius() + 4.0

	var i := 0
	while i < steps:
		i += 1
		var opts: Array = []
		var weights: Array = []
		var can_turn := since_turn >= 2 and not (force_straight_start and i < 2)
		var candidates := [d, _left(d), _right(d)] if can_turn else [d]

		for nd in candidates:
			var nx: int = cur.x + DIRS[nd].x
			var ny: int = cur.y + DIRS[nd].y
			var existing := grid.get_cell(nx, ny)
			if existing != null and existing.path:
				continue
			# Lo construido no se lo lleva el mapa por delante: al crecer, el
			# camino rodea las torres. Si el jugador acaba cercando un portal,
			# la ruta se sella, que es una jugada legítima y ya está prevista.
			if existing != null and existing.tower != null:
				continue
			# Regla clave: la casilla nueva no puede tocar otro camino (salvo el
			# que venimos recorriendo). Sin esto los caminos se funden en manchas.
			if grid.count_path_neighbors(nx, ny, cur) > 0:
				continue

			var dist := sqrt(float(nx * nx + ny * ny))
			var cur_dist := sqrt(float(cur.x * cur.x + cur.y * cur.y))
			var w := 0.60 if nd == d else 0.20
			w *= 1.6 if dist > cur_dist else 0.5  # premiar alejarse del núcleo
			if dist > max_r:
				w *= 0.04  # frenar en el borde del sector
			if dist < 3.0:
				w *= 0.05  # no rodear el núcleo
			opts.append([nx, ny, nd])
			weights.append(w)

		if opts.is_empty():
			# Acorralado: retrocede unos pasos y vuelve a intentarlo desde ahí.
			if built.size() > 3 and fails < 40:
				for k in 3:
					if built.is_empty():
						break
					_unmark_path(built.pop_back())
				cur = built[built.size() - 1] if not built.is_empty() else start
				d = rng.randi_range_(0, 3)
				since_turn = 99
				fails += 1
				i -= 2
				continue
			break

		var chosen = opts[rng.weighted(weights)]
		var nd2: int = chosen[2]
		since_turn = since_turn + 1 if nd2 == d else 0
		d = nd2
		cur = _mark_path(chosen[0], chosen[1])
		built.append(cur)

	route.dir = d
	return built


# --- Terreno ---

## Crece con el sector, pero siempre cubriendo lo que ocupan los caminos.
func _target_radius() -> float:
	var max_path := 0.0
	for r in routes:
		for c in r.cells:
			max_path = maxf(max_path, sqrt(float(c.x * c.x + c.y * c.y)))
	return maxf(14.0 + float(level) * 3.0, max_path + 7.0)


## Recalcula alturas, biomas y distancias al camino para todo el sector.
func _repaint() -> void:
	var s := seed_value
	var R := _target_radius()
	radius = R

	_smooth_path_heights()

	# Distancia al camino (BFS multi-fuente): decide dónde hay montaña y lago.
	var queue: Array = []
	for c in grid.cells.values():
		if c.path:
			c.path_dist = 0
			queue.append(c)
		else:
			c.path_dist = 999

	var dist := {}
	for c in queue:
		dist[Grid.key(c.x, c.y)] = 0

	var qi := 0
	while qi < queue.size():
		var c = queue[qi]
		qi += 1
		var d: int = dist[Grid.key(c.x, c.y)]
		if d >= 8:
			continue
		for dd in DIRS:
			var nx: int = c.x + dd.x
			var ny: int = c.y + dd.y
			var k := Grid.key(nx, ny)
			if dist.has(k):
				continue
			if sqrt(float(nx * nx + ny * ny)) > R + 1.0:
				continue
			dist[k] = d + 1
			var n := grid.get_cell(nx, ny)
			if n == null:
				n = grid.set_cell(nx, ny, T.GRASS, 0)
			n.path_dist = d + 1
			queue.append(n)

	# Se pinta sólo la banda de terreno que el BFS acaba de crear alrededor de
	# los caminos. Rellenar el disco completo generaría decenas de miles de
	# casillas de esquina donde nadie construye nunca.
	for c in grid.cells.values():
		if c.path or c.tower != null:
			continue
		var x: int = c.x
		var y: int = c.y

		# Menos octavas y más frecuencia: el fbm de muchas octavas se apelotona
		# en torno a 0,5 y produce mesetas uniformes sin biomas reconocibles.
		var h0 := Rng.fbm(float(x) * 0.075, float(y) * 0.075, s, 3)
		var moist := Rng.fbm(float(x) * 0.075 + 100.0, float(y) * 0.075 - 40.0, s + 7717, 2)
		# Los lagos tienen su propio ruido: hacerlos depender de la intersección
		# de relieve bajo y humedad baja daba mapas sin una sola gota de agua.
		var lake := Rng.fbm(float(x) * 0.09 - 60.0, float(y) * 0.09 + 20.0, s + 31337, 2)
		var near := clampf(float(c.path_dist), 0.0, 7.0) / 7.0
		# Se estira el contraste para que haya biomas y alturas de verdad.
		var h := clampf((h0 * 0.85 + near * 0.15 - 0.5) * 2.1 + 0.5, 0.0, 1.0)

		var t: int
		if c.path_dist >= 2 and lake < 0.34:
			t = T.WATER
		elif h < 0.34:
			t = T.FOREST if moist > 0.54 else T.GRASS
		elif h < 0.54:
			t = T.FOREST if moist > 0.48 else T.GRASS
		elif h < 0.70:
			t = T.FOREST if moist > 0.46 else T.ROCK
		elif h < 0.84:
			t = T.ROCK
		else:
			t = T.MOUNTAIN

		c.terrain = t
		# La cota del agua se ajusta después, a partir de la orilla.
		c.height = 0 if t == T.WATER else int(round(h * 6.0))
		c.tint = 0.88 + Rng.fbm(float(x) * 0.7, float(y) * 0.7, s + 31, 1) * 0.24

		# Yacimientos: puntos fijos y deterministas junto al camino que hacen que
		# ciertas casillas valgan mucho más que sus vecinas.
		if c.feature == "":
			c.feature = "none"
			if c.path_dist >= 1 and c.path_dist <= 4 and Grid.is_buildable(t):
				# En coordenadas enteras noise2d no interpola: hash puro, uniforme.
				var n2 := Rng.noise2d(float(x), float(y), s + 4242)
				if n2 > 0.968:
					c.feature = "vein"
				elif n2 > 0.936:
					c.feature = "obelisk"

	# Cota de los lagos: cada masa de agua se asienta un escalón por debajo de la
	# orilla más baja que la rodea, de modo que se ve una lámina hundida en el
	# paisaje y no un agujero en el fondo de un cañón.
	var waters: Array = []
	for c in grid.cells.values():
		if c.terrain == T.WATER:
			waters.append(c)
	for c in waters:
		var lowest := 1 << 30
		for n in grid.neighbors(c.x, c.y):
			if n.terrain != T.WATER:
				lowest = mini(lowest, n.height)
		c.height = (lowest - 1) if lowest < (1 << 30) else 0
	# El interior del lago se nivela con su propia orilla.
	for pass_i in 3:
		for c in waters:
			var m: int = c.height
			for n in grid.neighbors(c.x, c.y):
				if n.terrain == T.WATER:
					m = mini(m, n.height)
			c.height = m

	# Playas: cualquier terreno bajo que toque agua se vuelve arena.
	for c in grid.cells.values():
		if c.terrain != T.GRASS and c.terrain != T.FOREST:
			continue
		if c.height > 3:
			continue
		for n in grid.neighbors(c.x, c.y):
			if n.terrain == T.WATER:
				c.terrain = T.SAND
				break

	grid.version += 1


## El camino ondula suavemente en vez de saltar entre alturas de ruido.
func _smooth_path_heights() -> void:
	var s := seed_value
	for r in routes:
		for c in r.cells:
			c.height = int(round(Rng.fbm(float(c.x) * 0.03, float(c.y) * 0.03, s + 555, 2) * 3.0))
	# Media móvil a lo largo de cada ruta: elimina escalones bruscos.
	for pass_i in 3:
		for r in routes:
			var cs = r.cells
			for i in range(1, cs.size() - 1):
				cs[i].height = int(round(
					float(cs[i - 1].height + cs[i].height * 2 + cs[i + 1].height) / 4.0))
	if core != null:
		core.height = 1
