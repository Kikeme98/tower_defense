extends SceneTree

## Comprobaciones del campo de batalla: objetivos, proyectiles y muertes.
##   godot --headless --script tests/test_battle.gd
##
## Se simula sin renderizar nada, así que una partida de 60 oleadas tarda
## segundos. Es lo que permite tocar el balance sin abrir el juego.

const BattleScript = preload("res://scripts/game/battle.gd")
const TowerDefsScript = preload("res://scripts/game/tower_defs.gd")
const MapGenScript = preload("res://scripts/world/mapgen.gd")
const GridScript = preload("res://scripts/world/grid.gd")
const RngScript = preload("res://scripts/core/rng.gd")

var checks := 0
var failures := 0


func ok(cond: bool, msg: String) -> void:
	checks += 1
	if not cond:
		failures += 1
		printerr("  ✗ ", msg)


## Blanco quieto: para comprobar puntería y daño sin que la posición cambie
## entre frames y enturbie el resultado.
const DUMMY := {"id": "dummy", "hp": 400, "armor": 0, "shield": 0, "speed": 0.0,
	"gold": 5, "size": 0.5, "color": Color.RED}
## El que sí camina, para fugas al núcleo y simulaciones largas.
const WALKER := {"id": "walker", "hp": 120, "armor": 0, "shield": 0, "speed": 3.0,
	"gold": 5, "size": 0.5, "color": Color.ORANGE}


func _init() -> void:
	_test_targeting()
	_test_shooting()
	_test_splash()
	_test_chain()
	_test_economy()
	_test_placement()
	_test_auras()
	_test_expansion_keeps_towers()
	_test_long_run()

	if failures == 0:
		print("✓ %d comprobaciones correctas" % checks)
	else:
		printerr("✗ %d de %d fallaron" % [failures, checks])
	quit(1 if failures > 0 else 0)


## Mapa de verdad: usar la generación real evita que los tests pasen sobre una
## geometría que nunca ocurre en juego. Se expande un par de sectores para que
## las rutas den de sí y quepan enemigos a distinta altura del camino.
func _make_map():
	var m = MapGenScript.new("batalla").generate_initial()
	m.expand()
	m.expand()
	return m


func _battle(map):
	return BattleScript.new(RngScript.new("combate"), map.grid)


## Deja un enemigo quieto en un punto concreto del camino.
func _park(b, route, at: int, def := DUMMY):
	var e = b.spawn_enemy(def, route, 1, 1, 0.0)
	e.idx = mini(at, route.cells.size() - 2)
	e.update(0.0)  # coloca x/z según su índice
	return e


func _test_targeting() -> void:
	var map = _make_map()
	var b = _battle(map)
	var route = map.routes[0]
	var last: int = route.cells.size() - 2

	# Tres enemigos en la misma ruta con distinto avance hacia el núcleo.
	var a = _park(b, route, 0)
	var c = _park(b, route, last / 2)
	var d = _park(b, route, last)
	b._rebuild_index()

	# "first" busca al más avanzado hacia el núcleo.
	var best = b.find_target(d.x, d.z, 999.0, 0.0, "both", "first")
	ok(best == d, "el modo 'first' no eligió al más avanzado")

	# El alcance se respeta: fuera del radio no hay objetivo.
	ok(b.find_target(a.x + 500.0, a.z, 5.0, 0.0, "both") == null,
		"encontró objetivo fuera de alcance")

	# El alcance mínimo excluye lo que está pegado, como el mortero.
	ok(b.find_target(d.x, d.z, 999.0, 50.0, "both") != d,
		"el alcance mínimo no excluyó al objetivo pegado")

	# Los muertos no cuentan.
	for e in b.enemies:
		e.alive = false
	b._rebuild_index()
	ok(b.find_target(d.x, d.z, 999.0, 0.0, "both") == null,
		"eligió como objetivo a un enemigo muerto")

	# Filtro por tipo: una torre antiaérea ignora lo que va por tierra.
	var b2 = _battle(map)
	var g = _park(b2, route, 3)
	b2._rebuild_index()
	ok(b2.find_target(g.x, g.z, 20.0, 0.0, "air") == null,
		"una torre antiaérea eligió un objetivo terrestre")
	ok(b2.find_target(g.x, g.z, 20.0, 0.0, "ground") == g,
		"una torre de tierra no encontró un objetivo terrestre")


## Una ballesta junto al camino debe matar a un enemigo parado.
func _test_shooting() -> void:
	var map = _make_map()
	var b = _battle(map)
	var route = map.routes[0]
	var e = _park(b, route, 4)

	var cell = _free_cell_near(map, e.x, e.z)
	ok(cell != null, "no hay ninguna casilla construible cerca del camino")
	if cell == null:
		return
	var t = b.place(TowerDefsScript.by_id("crossbow"), cell)

	var guard := 0
	while e.alive and guard < 3000:
		b.update(1.0 / 60.0)
		guard += 1
	ok(not e.alive, "la ballesta no llegó a matar en %d frames" % guard)
	ok(t.damage_dealt > 0.0, "la torre no registró daño")
	ok(t.kills == 1, "la torre no se apuntó la muerte (%d)" % t.kills)

	# El pilón no dispara: es sólo aura.
	var b2 = _battle(map)
	var e2 = _park(b2, route, 4)
	var cell2 = _free_cell_near(map, e2.x, e2.z)
	if cell2 != null:
		b2.place(TowerDefsScript.by_id("pylon"), cell2)
		for i in 300:
			b2.update(1.0 / 60.0)
		ok(e2.alive and is_equal_approx(e2.health, e2.max_health),
			"el pilón hizo daño, y no debería")


## El cañón debe alcanzar a varios enemigos apiñados con un solo impacto.
func _test_splash() -> void:
	var map = _make_map()
	var b = _battle(map)
	var route = map.routes[0]
	var group: Array = []
	for i in 4:
		group.append(_park(b, route, 4 + i))

	var cell = _free_cell_near(map, group[0].x, group[0].z)
	if cell == null:
		return
	b.place(TowerDefsScript.by_id("cannon"), cell)
	for i in 200:
		b.update(1.0 / 60.0)

	var hurt := 0
	for e in group:
		if e.health < e.max_health or not e.alive:
			hurt += 1
	ok(hurt >= 2, "el área sólo alcanzó a %d de 4 enemigos apiñados" % hurt)


## La bobina debe saltar entre enemigos cercanos con un solo disparo.
func _test_chain() -> void:
	var map = _make_map()
	var b = _battle(map)
	var route = map.routes[0]
	var group: Array = []
	for i in 3:
		group.append(_park(b, route, 4 + i))

	var cell = _free_cell_near(map, group[0].x, group[0].z)
	if cell == null:
		return
	b.place(TowerDefsScript.by_id("tesla"), cell)
	# Un solo disparo: con más, todos acabarían igual de tocados y el test no
	# distinguiría una cadena de tres disparos sueltos.
	for i in 70:
		b.update(1.0 / 60.0)

	var hurt := 0
	for e in group:
		if e.health < e.max_health:
			hurt += 1
	ok(hurt >= 2, "el rayo en cadena sólo tocó a %d de 3" % hurt)


## Matar paga oro; llegar al núcleo no.
func _test_economy() -> void:
	var map = _make_map()
	var b = _battle(map)
	var route = map.routes[0]
	var e = _park(b, route, 4)
	e.health = 1.0
	e.max_health = 1.0

	var cell = _free_cell_near(map, e.x, e.z)
	if cell == null:
		return
	b.place(TowerDefsScript.by_id("crossbow"), cell)

	var total := 0
	var kills := 0
	for i in 400:
		var r: Dictionary = b.update(1.0 / 60.0)
		total += int(r["gold"])
		kills += int(r["killed"])
	ok(kills == 1, "se contaron %d muertes en vez de 1" % kills)
	ok(total > 0, "matar no pagó oro")

	# Fuga: el que camina hasta el final resta vida al núcleo y no paga nada.
	var b2 = _battle(map)
	var f = b2.spawn_enemy(WALKER, route, 1, 1, 0.0)
	f.idx = route.cells.size() - 3
	var leaked := 0
	var paid := 0
	var damage := 0
	for i in 400:
		var r2: Dictionary = b2.update(1.0 / 60.0)
		leaked += int(r2["leaked"])
		paid += int(r2["gold"])
		damage += int(r2["core_damage"])
	ok(leaked == 1, "la fuga al núcleo no se contabilizó (%d)" % leaked)
	ok(paid == 0, "una fuga pagó oro")
	ok(damage == 1, "la fuga no restó vida al núcleo (%d)" % damage)


func _test_placement() -> void:
	var map = _make_map()
	var b = _battle(map)
	var crossbow := TowerDefsScript.by_id("crossbow")
	var harpoon := TowerDefsScript.by_id("harpoon")

	var buildable = null
	var water = null
	var path_cell = null
	for c in map.grid.cells.values():
		if buildable == null and not c.path and GridScript.is_buildable(c.terrain):
			buildable = c
		if water == null and c.terrain == GridScript.T.WATER:
			water = c
		if path_cell == null and c.path:
			path_cell = c

	ok(b.can_place(buildable, crossbow), "no deja construir en terreno válido")
	ok(not b.can_place(path_cell, crossbow), "deja construir sobre el camino")
	if water != null:
		ok(not b.can_place(water, crossbow), "deja construir una ballesta sobre agua")
		ok(b.can_place(water, harpoon), "no deja construir el arpón sobre agua")

	# El precio sube con cada torre del mismo tipo.
	var p0 := b.price_of(crossbow)
	b.place(crossbow, buildable)
	var p1 := b.price_of(crossbow)
	ok(p1 > p0, "el precio no subió tras construir (%d → %d)" % [p0, p1])
	ok(not b.can_place(buildable, crossbow), "deja construir dos torres en la misma casilla")

	# Y vender devuelve parte, libera la casilla y baja el precio otra vez.
	var t = buildable.tower
	var refund := b.sell(t)
	ok(refund > 0, "vender no devolvió oro")
	ok(buildable.tower == null, "vender no liberó la casilla")
	ok(b.price_of(crossbow) == p0, "el precio no bajó al vender")


## El pilón debe potenciar a las torres de su radio y a nadie más.
func _test_auras() -> void:
	var map = _make_map()
	var b = _battle(map)
	var crossbow := TowerDefsScript.by_id("crossbow")

	var near = null
	var far = null
	var pylon_cell = null
	for c in map.grid.cells.values():
		if c.path or not GridScript.is_buildable(c.terrain) or c.tower != null:
			continue
		if pylon_cell == null:
			pylon_cell = c
			continue
		var d: float = sqrt(pow(c.wx - pylon_cell.wx, 2.0) + pow(c.wz - pylon_cell.wz, 2.0))
		if near == null and d > 0.5 and d < 5.0:
			near = c
		if far == null and d > 40.0:
			far = c

	if pylon_cell == null or near == null or far == null:
		return
	var a = b.place(crossbow, near)
	var f = b.place(crossbow, far)
	b.recompute_all()
	var base_damage: float = f.stats["damage"]
	var near_before: float = a.stats["damage"]

	b.place(TowerDefsScript.by_id("pylon"), pylon_cell)
	b.recompute_all()
	ok(a.stats["damage"] > near_before, "el pilón no potenció a la torre cercana")
	ok(is_equal_approx(f.stats["damage"], base_damage),
		"el pilón potenció a una torre fuera de su radio")


## Al crecer, el mapa no puede llevarse por delante lo ya construido.
##
## El generador retrocede cuando el camino se acorrala, y al retroceder borraba
## las casillas que había pisado. Si una de ellas tenía torre, la torre quedaba
## apuntando a una celda que ya no estaba en el mapa, y a partir de ahí fallaba
## el recálculo de estadísticas en cada frame. Sólo se manifestaba después de
## varias expansiones con el mapa lleno, que es justo lo que aquí se reproduce.
func _test_expansion_keeps_towers() -> void:
	var map = _make_map()
	var b = _battle(map)
	var crossbow := TowerDefsScript.by_id("crossbow")

	# Se llena de torres toda la banda junto al camino: cuanto más ocupado esté,
	# más probable es que el trazado nuevo tropiece con una.
	var built := 0
	for c in map.grid.cells.values():
		if c.path or c.tower != null or not GridScript.is_buildable(c.terrain):
			continue
		if c.path_dist > 2:
			continue
		b.place(crossbow, c)
		built += 1
	ok(built > 10, "sólo se pudieron plantar %d torres junto al camino" % built)

	for i in 6:
		map.expand()
		for t in b.towers:
			ok(t.cell != null, "una torre perdió su casilla al expandir (sector %d)" % (i + 2))
			if t.cell != null:
				ok(map.grid.get_cell(t.cell.x, t.cell.y) == t.cell,
					"la casilla de una torre ya no está en el mapa")
				ok(not t.cell.path, "el camino se trazó sobre una torre construida")

	# Y las estadísticas se siguen pudiendo recalcular, que es lo que fallaba.
	b.dirty = true
	b.update(1.0 / 60.0)
	ok(not b.dirty, "el recálculo de estadísticas abortó tras expandir")


## Una partida larga sin errores: es lo que caza los fallos que sólo aparecen
## con muchos enemigos, proyectiles en vuelo y torres muriendo a la vez.
func _test_long_run() -> void:
	var map = _make_map()
	map.expand()
	var b = _battle(map)

	# Una defensa variada junto al camino.
	var ids := ["crossbow", "cannon", "frost", "tesla", "venom", "mortar", "ballista"]
	var built := 0
	for c in map.grid.cells.values():
		if built >= 14:
			break
		if c.path or c.tower != null or not GridScript.is_buildable(c.terrain):
			continue
		if c.path_dist > 2:
			continue
		b.place(TowerDefsScript.by_id(ids[built % ids.size()]), c)
		built += 1
	ok(built > 0, "no se pudo construir ninguna torre junto al camino")

	var spawned := 0
	var killed := 0
	var leaked := 0
	for frame in 9000:
		if frame % 30 == 0 and spawned < 120:
			var route = map.routes[spawned % map.routes.size()]
			b.spawn_enemy(WALKER, route, 6, 2, float(spawned % 3) - 1.0)
			spawned += 1
		var r: Dictionary = b.update(1.0 / 60.0)
		killed += int(r["killed"])
		leaked += int(r["leaked"])

	ok(killed + leaked == spawned,
		"se perdieron enemigos: %d aparecieron, %d murieron, %d llegaron"
			% [spawned, killed, leaked])
	ok(killed > 0, "la defensa no mató a nadie en toda la simulación")
	ok(b.enemies.is_empty(), "quedaron %d enemigos colgados" % b.enemies.size())
	ok(b.projectiles.size() < 400,
		"los proyectiles no se liberan: %d en vuelo al final" % b.projectiles.size())


## Casilla libre y construible más cercana a un punto, para plantar la torre de
## prueba donde de verdad alcance.
func _free_cell_near(map, wx: float, wz: float):
	var best = null
	var best_d := INF
	for c in map.grid.cells.values():
		if c.path or c.tower != null or not GridScript.is_buildable(c.terrain):
			continue
		var d: float = pow(c.wx - wx, 2.0) + pow(c.wz - wz, 2.0)
		if d < best_d:
			best_d = d
			best = c
	return best
