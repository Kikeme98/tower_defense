extends SceneTree

## Comprobaciones del draft roguelike.
##   godot --headless --script tests/test_cards.gd

const CardsScript = preload("res://scripts/game/cards.gd")
const RngScript = preload("res://scripts/core/rng.gd")

var checks := 0
var failures := 0


func ok(cond: bool, msg: String) -> void:
	checks += 1
	if not cond:
		failures += 1
		printerr("  ✗ ", msg)


func _init() -> void:
	var catalog: Array = CardsScript.build_catalog()
	ok(catalog.size() > 20, "el catálogo tiene pocas cartas: %d" % catalog.size())

	# Ninguna carta duplicada y todas con lo mínimo para mostrarse.
	var ids := {}
	for c in catalog:
		ok(not ids.has(c["id"]), "carta duplicada: %s" % c["id"])
		ids[c["id"]] = true
		ok(c.has("name") and c.has("desc") and c.has("rarity"),
			"%s: le faltan campos para mostrarse" % c["id"])
		ok(CardsScript.RARITY.has(c["rarity"]), "%s: rareza desconocida" % c["id"])

	# Con el arsenal corto, el primer hueco debe ser un plano de torre.
	var rng = RngScript.new("draft")
	var st: Dictionary = CardsScript.new_state()
	var first: Array = CardsScript.draw(rng, catalog, st, 3)
	ok(first.size() == 3, "el draft no ofreció tres cartas")
	ok(first[0].has("tower"), "con pocas torres, la primera carta debería ser un plano")

	# Nunca se repite una carta dentro del mismo draft.
	for i in 40:
		var opts: Array = CardsScript.draw(rng, catalog, st, 3)
		var seen := {}
		for c in opts:
			ok(not seen.has(c["id"]), "draft con cartas repetidas: %s" % c["id"])
			seen[c["id"]] = true

	# Las cartas únicas no vuelven a ofrecerse una vez tomadas.
	st = CardsScript.new_state()
	var uniq: Dictionary = {}
	for c in catalog:
		if c.get("unique", false):
			uniq = c
			break
	CardsScript.apply(uniq, st)
	ok(st["taken"].has(uniq["id"]), "la carta única no quedó marcada")
	var repeated := false
	for i in 60:
		for c in CardsScript.draw(rng, catalog, st, 3):
			if c["id"] == uniq["id"]:
				repeated = true
	ok(not repeated, "la carta única %s volvió a ofrecerse" % uniq["id"])

	# Los efectos se acumulan de verdad sobre el estado.
	st = CardsScript.new_state()
	var dmg: Dictionary = {}
	for c in catalog:
		if c["id"] == "dmg1":
			dmg = c
	CardsScript.apply(dmg, st)
	CardsScript.apply(dmg, st)
	ok(absf(float(st["global"]["damage"]) - 1.15 * 1.15) < 0.0001,
		"los modificadores no se acumulan: %f" % float(st["global"]["damage"]))

	# Un pacto sube la dificultad Y da la recompensa: las dos cosas.
	st = CardsScript.new_state()
	for c in catalog:
		if c["id"] == "curse_hp":
			CardsScript.apply(c, st)
	ok(float(st["curse"]["hp"]) > 1.0, "el pacto no subió la vida enemiga")
	ok(float(st["global"]["gold_mult"]) > 1.0, "el pacto no dio su recompensa")

	# Las cartas con requisito no salen si no se cumple.
	st = CardsScript.new_state()
	st["lives"] = st["max_lives"]  # a vida completa, "Reparaciones" no procede
	var offered_repair := false
	for i in 80:
		for c in CardsScript.draw(rng, catalog, st, 3):
			if c["id"] == "repair":
				offered_repair = true
	ok(not offered_repair, "se ofreció reparar a vida completa")

	# El draft nunca se queda sin cartas en una partida larga.
	st = CardsScript.new_state()
	st["sector"] = 6
	var empty := false
	for i in 120:
		var opts: Array = CardsScript.draw(rng, catalog, st, 3)
		if opts.is_empty():
			empty = true
			break
		CardsScript.apply(opts[i % opts.size()], st)
	ok(not empty, "el mazo se quedó sin cartas en una partida larga")
	ok(int(st["unlocked"].size()) > 3, "no se desbloquearon torres a lo largo de la partida")

	if failures == 0:
		print("✓ %d comprobaciones correctas" % checks)
	else:
		printerr("✗ %d de %d fallaron" % [failures, checks])
	quit(1 if failures > 0 else 0)
