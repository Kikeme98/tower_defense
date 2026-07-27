extends SceneTree

## Comprobaciones de torres y oleadas, sin abrir ventana.
##   godot --headless --script tests/test_towers.gd

const TowerScript = preload("res://scripts/game/tower.gd")
const DefsScript = preload("res://scripts/game/tower_defs.gd")
const WavesScript = preload("res://scripts/game/waves.gd")
const RngScript = preload("res://scripts/core/rng.gd")
const GridScript = preload("res://scripts/world/grid.gd")

var checks := 0
var failures := 0


func ok(cond: bool, msg: String) -> void:
	checks += 1
	if not cond:
		failures += 1
		printerr("  ✗ ", msg)


func cell_of(terrain: int, height := 0):
	var g = GridScript.new()
	return g.set_cell(0, 0, terrain, height)


func _init() -> void:
	_test_catalog()
	_test_stats()
	_test_upgrades()
	_test_waves()

	if failures == 0:
		print("✓ %d comprobaciones correctas" % checks)
	else:
		printerr("✗ %d de %d fallaron" % [failures, checks])
	quit(1 if failures > 0 else 0)


func _test_catalog() -> void:
	var ids := {}
	for d in DefsScript.LIST:
		ok(not ids.has(d["id"]), "id de torre duplicado: %s" % d["id"])
		ids[d["id"]] = true
		ok(d.has("vs") and d["vs"]["h"] > 0.0 and d["vs"]["a"] > 0.0 and d["vs"]["s"] > 0.0,
			"%s: multiplicadores vs incompletos" % d["id"])
		ok(int(d["cost"]) > 0 and int(d["price_step"]) > 0, "%s: precio mal definido" % d["id"])

	# Debe haber alguna torre inicial capaz de atacar aéreos.
	var air := 0
	for d in DefsScript.LIST:
		if not d.get("unlock", false) and d["targets"] in ["both", "air"]:
			air += 1
	ok(air > 0, "ninguna torre inicial puede atacar a los voladores")

	# Y el reparto de especialidades debe cubrir las tres capas.
	var best := {"h": 0.0, "a": 0.0, "s": 0.0}
	for d in DefsScript.LIST:
		for k in best:
			best[k] = maxf(best[k], float(d["vs"][k]))
	for k in best:
		ok(best[k] >= 1.3, "ninguna torre destaca contra la capa '%s' (máx %.2f)" % [k, best[k]])


func _test_stats() -> void:
	var cannon: Dictionary = DefsScript.by_id("cannon")
	var t = TowerScript.new(cannon, cell_of(GridScript.T.GRASS))
	ok(t.stats["damage"] > 0.0, "el daño base no se calculó")
	ok(is_equal_approx(t.stats["vs"]["a"], 1.7), "el multiplicador contra armadura se perdió")

	# El bosque cambia daño por alcance.
	var forest = TowerScript.new(cannon, cell_of(GridScript.T.FOREST))
	ok(forest.stats["damage"] > t.stats["damage"], "el bosque no aumentó el daño")
	ok(forest.stats["range"] < t.stats["range"], "el bosque no redujo el alcance")

	# La montaña da alcance.
	var mount = TowerScript.new(cannon, cell_of(GridScript.T.MOUNTAIN))
	ok(mount.stats["range"] > t.stats["range"], "la montaña no aumentó el alcance")

	# La elevación da daño y alcance.
	var high = TowerScript.new(cannon, cell_of(GridScript.T.GRASS, 5))
	ok(high.stats["damage"] > t.stats["damage"], "la elevación no aumentó el daño")
	ok(high.stats["range"] > t.stats["range"], "la elevación no aumentó el alcance")

	# Los modificadores globales de las cartas se aplican.
	var buffed = TowerScript.new(cannon, cell_of(GridScript.T.GRASS))
	buffed.recompute({"damage": 2.0, "vs_armor": 2.0}, {})
	ok(is_equal_approx(buffed.stats["damage"], t.stats["damage"] * 2.0),
		"el modificador global de daño no se aplicó")
	ok(is_equal_approx(buffed.stats["vs"]["a"], 3.4),
		"el modificador contra armadura no se aplicó")

	# El aura de un pilón potencia sin tocar la base.
	var aura_t = TowerScript.new(cannon, cell_of(GridScript.T.GRASS))
	aura_t.recompute({}, {"damage": 1.22})
	ok(aura_t.stats["damage"] > t.stats["damage"], "el aura no potenció la torre")

	# El pilón no dispara.
	var pylon = TowerScript.new(DefsScript.by_id("pylon"), cell_of(GridScript.T.GRASS))
	ok(pylon.stats["fire_rate"] == 0.0, "el pilón no debería disparar")
	ok(not pylon.stats["aura"].is_empty(), "el pilón perdió su aura")


func _test_upgrades() -> void:
	var t = TowerScript.new(DefsScript.by_id("crossbow"), cell_of(GridScript.T.GRASS))
	var base: float = t.stats["damage"]
	var c1: int = t.upgrade_cost("damage")
	t.levels["damage"] = 1
	t.recompute({}, {})
	ok(t.stats["damage"] > base, "mejorar el daño no lo aumentó")
	var c2: int = t.upgrade_cost("damage")
	ok(c2 > c1, "el coste de mejora no crece (%d → %d)" % [c1, c2])
	# Aritmético, no exponencial: el segundo nivel cuesta el doble que el primero.
	# Aritmético, no exponencial. Se admite 1 de holgura porque el primer
	# nivel puede redondear hacia arriba (27,5 -> 28).
	ok(absi(c2 - c1 * 2) <= 1, "el coste debería ser aritmético: %d vs %d" % [c2, c1 * 2])

	# Al llegar al máximo deja de poder mejorarse.
	t.levels["damage"] = 12
	ok(t.upgrade_cost("damage") == -1, "la línea de daño no tiene tope")
	ok(t.total_level == 12, "el nivel total no suma bien")

	# La mejora especial del cañón amplía el área.
	var cannon = TowerScript.new(DefsScript.by_id("cannon"), cell_of(GridScript.T.GRASS))
	var splash0: float = cannon.stats["splash"]
	cannon.levels["special"] = 3
	cannon.recompute({}, {})
	ok(cannon.stats["splash"] > splash0, "la mejora especial no amplió el área")


func _test_waves() -> void:
	var defs := [
		{"id": "grunt", "hp": 55, "speed": 2.6, "gold": 7, "size": 0.5, "from": 1, "weight": 10},
		{"id": "runner", "hp": 30, "speed": 5.4, "gold": 6, "size": 0.42, "from": 3, "weight": 7},
		{"id": "brute", "hp": 260, "speed": 1.7, "gold": 20, "size": 0.78, "from": 5, "weight": 5},
	]
	var boss := {"id": "boss", "hp": 1400, "speed": 1.25, "gold": 140, "size": 1.6, "boss": true}
	var routes := [{"cells": []}, {"cells": []}]

	# Sólo deben salir enemigos ya desbloqueados en esa oleada.
	var w = WavesScript.new(RngScript.new("oleadas"))
	w.start(2, 1, routes, {}, defs, boss)
	var only_early := true
	for e in w.queue:
		if int(e["def"]["from"]) > 2:
			only_early = false
	ok(only_early, "salieron enemigos que aún no deberían aparecer")
	ok(w.queue.size() == Balance.enemy_count(2), "el número de enemigos no cuadra")

	# La cola tiene que estar ordenada por tiempo.
	var sorted := true
	for i in range(w.queue.size() - 1):
		if float(w.queue[i]["at"]) > float(w.queue[i + 1]["at"]):
			sorted = false
	ok(sorted, "la cola de apariciones no está ordenada")

	# En oleada de jefe aparece el jefe.
	var wb = WavesScript.new(RngScript.new("jefe"))
	wb.start(10, 2, routes, {}, defs, boss)
	var has_boss := false
	for e in wb.queue:
		if e["def"].get("boss", false):
			has_boss = true
	ok(has_boss, "la oleada 10 no trae jefe")

	# Se vacía por completo al avanzar el tiempo.
	var spawned := [0]  # array: los lambda capturan las locales por valor
	var done := false
	var guard := 0
	while not done and guard < 100000:
		done = w.update(1.0 / 60.0, func(_s): spawned[0] += 1)
		guard += 1
	ok(spawned[0] == w.queue.size(), "no se soltaron todos los enemigos (%d de %d)"
		% [spawned[0], w.queue.size()])
	ok(w.remaining == 0, "quedaron enemigos en la cola")

	# Los pactos que aumentan la horda tienen efecto.
	var wc = WavesScript.new(RngScript.new("pacto"))
	wc.start(5, 1, routes, {"count": 2.0}, defs, boss)
	ok(wc.queue.size() > Balance.enemy_count(5), "el pacto de la horda no añadió enemigos")
