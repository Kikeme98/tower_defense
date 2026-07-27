extends SceneTree

# Se cargan con preload en vez de por class_name: al ejecutar con --script en
# modo headless las clases globales no siempre están resueltas, y la llamada
# falla con un error que no dice nada útil.
const MapGenScript = preload("res://scripts/world/mapgen.gd")
const GridScript = preload("res://scripts/world/grid.gd")

## Comprobaciones de la generación procedural, sin abrir ventana.
##
##   godot --headless --script tests/test_mapgen.gd
##
## Es el equivalente de test.mjs en la versión web: la lógica no depende del
## motor, así que se puede verificar entera sin renderizar nada. Sin esto, cada
## cambio en el generador exigiría abrir el juego y mirar, que es justo el ciclo
## lento que conviene evitar.

var checks := 0
var failures := 0


func ok(cond: bool, msg: String) -> void:
	checks += 1
	if not cond:
		failures += 1
		printerr("  ✗ ", msg)


func _init() -> void:
	_test_routes()
	_test_determinism()
	_test_terrain()
	_test_growth()

	if failures == 0:
		print("✓ %d comprobaciones correctas" % checks)
	else:
		printerr("✗ %d de %d comprobaciones fallaron" % [failures, checks])
	quit(1 if failures > 0 else 0)


func _test_routes() -> void:
	for s in ["a", "b", "c", "semilla-larga", "12345"]:
		var map := MapGenScript.new(s).generate_initial()
		for i in 12:
			map.expand()

		for r in map.routes:
			# La ruta debe terminar en el núcleo y empezar en un portal.
			ok(r.cells[r.cells.size() - 1] == map.core, "%s: la ruta no termina en el núcleo" % s)
			ok(r.cells[0] == r.spawn, "%s: la primera casilla no es el portal" % s)
			ok(r.cells.size() > 20, "%s: ruta demasiado corta (%d)" % [s, r.cells.size()])

			# Cada paso debe ser a una casilla ortogonalmente adyacente.
			for i in range(r.cells.size() - 1):
				var a = r.cells[i]
				var b = r.cells[i + 1]
				var d: int = absi(a.x - b.x) + absi(a.y - b.y)
				ok(d == 1, "%s: salto de %d casillas en la ruta %d (índice %d)" % [s, d, r.id, i])

			# Sin casillas repetidas: nadie debe pasar dos veces por el mismo sitio.
			var seen := {}
			for c in r.cells:
				var k := GridScript.key(c.x, c.y)
				ok(not seen.has(k), "%s: casilla repetida en la ruta %d" % [s, r.id])
				seen[k] = true

		# Debe quedar territorio construible alrededor del camino.
		var buildable := 0
		for c in map.grid.cells.values():
			if not c.path and GridScript.is_buildable(c.terrain):
				buildable += 1
		ok(buildable > 200, "%s: sólo %d casillas construibles" % [s, buildable])

		# Ninguna casilla de camino puede estar marcada como construible.
		for c in map.grid.cells.values():
			if c.path:
				ok(not GridScript.is_buildable(c.terrain), "%s: casilla de camino construible" % s)


## Misma semilla, mismo mapa: la generación es determinista.
func _test_determinism() -> void:
	var a := MapGenScript.new("repetible").generate_initial()
	var b := MapGenScript.new("repetible").generate_initial()
	a.expand()
	b.expand()
	ok(a.grid.cells.size() == b.grid.cells.size(),
		"la generación no es determinista (nº de casillas: %d vs %d)"
			% [a.grid.cells.size(), b.grid.cells.size()])

	var ka := a.grid.cells.keys()
	var kb := b.grid.cells.keys()
	ka.sort()
	kb.sort()
	ok(ka == kb, "la generación no es determinista (casillas distintas)")

	# Y el relieve también debe coincidir, no sólo qué casillas existen.
	var same_height := true
	for k in ka:
		if a.grid.cells[k].height != b.grid.cells[k].height:
			same_height = false
			break
	ok(same_height, "la generación no es determinista (alturas distintas)")


func _test_terrain() -> void:
	var map := MapGenScript.new("terreno").generate_initial()
	for i in 4:
		map.expand()

	var counts := {}
	var water_ok := true
	for c in map.grid.cells.values():
		counts[c.terrain] = counts.get(c.terrain, 0) + 1
		# El agua debe quedar por debajo de toda orilla que la rodea.
		if c.terrain == GridScript.T.WATER:
			for n in map.grid.neighbors(c.x, c.y):
				if n.terrain != GridScript.T.WATER and n.height <= c.height:
					water_ok = false
	ok(water_ok, "hay agua a la misma cota o por encima de su orilla")

	# Debe haber variedad: un mapa de un solo bioma sería un fallo del ruido.
	var kinds := 0
	for t in counts:
		if counts[t] > 5:
			kinds += 1
	ok(kinds >= 4, "muy poca variedad de terreno (%d biomas con presencia)" % kinds)

	# Y territorio construible suficiente para jugar.
	var buildable := 0
	for c in map.grid.cells.values():
		if not c.path and GridScript.is_buildable(c.terrain):
			buildable += 1
	ok(buildable > 400, "sólo %d casillas construibles tras 4 sectores" % buildable)


## El mapa tiene que crecer de verdad en cada sector.
func _test_growth() -> void:
	var map := MapGenScript.new("crecimiento").generate_initial()
	var prev: int = map.grid.cells.size()
	var prev_path: int = map.routes[0].cells.size()
	for i in 8:
		map.expand()
		var now: int = map.grid.cells.size()
		ok(now >= prev, "el mapa encogió en el sector %d (%d → %d)" % [i + 2, prev, now])
		prev = now
	ok(map.grid.cells.size() > 800, "el mapa creció poco: %d casillas" % map.grid.cells.size())
	# Alguna ruta debe haberse alargado respecto al inicio.
	var longest := 0
	for r in map.routes:
		longest = maxi(longest, r.cells.size())
	ok(longest > prev_path, "ninguna ruta se alargó (%d → %d)" % [prev_path, longest])
