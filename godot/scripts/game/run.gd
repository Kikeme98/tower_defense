class_name Run
extends RefCounted

## Una partida: el estado, la economía y la máquina de fases.
##
##   construir → combatir → elegir carta → [expandir mapa] → construir
##
## No sabe nada de la pantalla. Esa es la razón de que exista separada de la
## escena: una partida completa se puede simular en headless en segundos, que es
## lo único que hace practicable ajustar el balance.

const MapGenScript = preload("res://scripts/world/mapgen.gd")
const BattleScript = preload("res://scripts/game/battle.gd")
const WavesScript = preload("res://scripts/game/waves.gd")
const CardsScript = preload("res://scripts/game/cards.gd")
const TowerDefsScript = preload("res://scripts/game/tower_defs.gd")
const EnemyDefsScript = preload("res://scripts/game/enemy_defs.gd")
const RngScript = preload("res://scripts/core/rng.gd")

enum Phase { BUILD, COMBAT, DRAFT, EXPANDING, GAMEOVER }

## Segundos que dura la animación de crecimiento del mapa antes de poder volver
## a construir. Sin la pausa, el sector nuevo aparece de golpe y no se ve.
const EXPAND_TIME := 1.4

signal changed(what: String)  ## "phase", "gold", "wave", "build", "damage"…

var seed_text := ""
var rng
var map
var grid
var battle
var director
var catalog: Array = []

var phase: int = Phase.BUILD
var state := {}
var cards: Array = []
var time := 0.0
var expand_timer := 0.0
var last_expand := {}  ## resumen de la última expansión, para avisos en pantalla


func _init(s := "semilla") -> void:
	reset(s)


func reset(s := "semilla") -> void:
	seed_text = s
	rng = RngScript.new(s)
	map = MapGenScript.new(rng.fork("map").seed_value).generate_initial()
	grid = map.grid

	battle = BattleScript.new(rng.fork("combat"), grid)
	director = WavesScript.new(rng.fork("waves"))
	catalog = CardsScript.build_catalog()
	_card_rng = rng.fork("cards")

	state = CardsScript.new_state()
	state.merge({
		"wave": 0, "sector": 1, "score": 0, "kills": 0, "leaked": 0,
		"leaked_by": {}, "interest": Balance.INTEREST,
		"vein_gold": 0,  # oro por oleada y filón explotado
	}, true)
	# Premio por dañar a un enemigo con torres de tipos distintos: empuja a
	# combinar defensas en vez de amontonar la más rentable.
	state["global"]["gold_per_tower_type"] = 1
	# Las torres que no exigen desbloqueo están disponibles desde el principio.
	for d in TowerDefsScript.LIST:
		if not d["unlock"]:
			state["unlocked"][d["id"]] = true
	battle.global_mods = state["global"]

	phase = Phase.BUILD
	cards.clear()
	time = 0.0
	expand_timer = 0.0
	changed.emit("reset")


var _card_rng


# --- Consultas --------------------------------------------------------------

var gold: int:
	get: return int(state["gold"])

var lives: int:
	get: return int(state["lives"])

var unlocked_defs: Array:
	get:
		var out: Array = []
		for d in TowerDefsScript.LIST:
			if state["unlocked"].has(d["id"]):
				out.append(d)
		return out


## Precio con el descuento de las cartas aplicado.
func cost_of(def: Dictionary) -> int:
	return int(round(float(battle.price_of(def)) * float(state["global"].get("cost_mult", 1.0))))


# --- Acciones del jugador ---------------------------------------------------

func can_afford(def: Dictionary) -> bool:
	return gold >= cost_of(def)


func place(def: Dictionary, cell) -> bool:
	if not state["unlocked"].has(def["id"]):
		return false
	if not battle.can_place(cell, def):
		return false
	var cost := cost_of(def)
	if gold < cost:
		changed.emit("nogold")
		return false
	state["gold"] = gold - cost
	var t = battle.place(def, cell)
	t.invested = cost
	changed.emit("build")
	return true


func sell(tower) -> int:
	var refund: int = battle.sell(tower)
	state["gold"] = gold + refund
	changed.emit("sell")
	return refund


func upgrade(tower, path_id: String) -> bool:
	var cost: int = tower.upgrade_cost(path_id)
	if cost < 0 or gold < cost:
		changed.emit("nogold")
		return false
	state["gold"] = gold - cost
	tower.invested += cost
	battle.upgrade(tower, path_id)
	changed.emit("upgrade")
	return true


func start_wave() -> void:
	if phase != Phase.BUILD:
		return
	state["wave"] = int(state["wave"]) + 1
	state["sector"] = Balance.sector_of(int(state["wave"]))
	director.start(int(state["wave"]), int(state["sector"]), map.routes,
		state["curse"], EnemyDefsScript.LIST, EnemyDefsScript.BOSS)
	phase = Phase.COMBAT
	changed.emit("wave")


func choose_card(card: Dictionary) -> void:
	if phase != Phase.DRAFT:
		return
	CardsScript.apply(card, state)
	# Las cartas tocan `global`, y las torres tienen que enterarse.
	battle.global_mods = state["global"]
	battle.dirty = true
	cards.clear()
	changed.emit("card")
	_after_draft()


func set_target_mode(mode: String) -> void:
	battle.target_mode = mode
	changed.emit("target_mode")


# --- Bucle ------------------------------------------------------------------

## Un paso de simulación. `dt` fijo: el resultado no depende de los fps.
func update(dt: float) -> void:
	time += dt

	if phase == Phase.EXPANDING:
		expand_timer -= dt
		if expand_timer <= 0.0:
			phase = Phase.BUILD
			changed.emit("phase")

	var spawned := true
	if phase == Phase.COMBAT:
		spawned = director.update(dt, func(s): _spawn(s))

	var res: Dictionary = battle.update(dt)
	if phase != Phase.COMBAT:
		return

	if int(res["gold"]) > 0:
		state["gold"] = gold + int(round(float(res["gold"])
			* float(state["global"].get("gold_mult", 1.0))))
	if int(res["killed"]) > 0:
		state["kills"] = int(state["kills"]) + int(res["killed"])
		state["score"] = int(state["score"]) + int(res["killed"])
	if int(res["leaked"]) > 0:
		state["lives"] = lives - int(res["core_damage"])
		state["leaked"] = int(state["leaked"]) + int(res["leaked"])
		# Qué tipo se está colando es la información que dice qué torre falta.
		for d in res["leaked_defs"]:
			var n: String = d["name"]
			state["leaked_by"][n] = int(state["leaked_by"].get(n, 0)) + 1
		changed.emit("damage")
		if lives <= 0:
			state["lives"] = 0
			phase = Phase.GAMEOVER
			changed.emit("gameover")
			return

	if spawned and battle.enemies.is_empty():
		_end_wave()


func _spawn(s: Dictionary) -> void:
	battle.spawn_enemy(s["def"], s["route"], int(state["wave"]), int(state["sector"]),
		float(s["lane"]), {
			"hp": float(s["hp"]),
			"speed": float(state["curse"].get("speed", 1.0)),
			"armor_boost": float(state["curse"].get("armor_boost", 0.0)),
		})


## Filones con al menos una torre adyacente: producen oro cada oleada. Premian
## construir donde el mapa lo pide en vez de sólo donde conviene disparar.
func active_veins() -> int:
	if int(state["vein_gold"]) == 0:
		return 0
	var n := 0
	for cell in grid.cells.values():
		if cell.feature != "vein":
			continue
		for c in grid.neighbors(cell.x, cell.y):
			if c.tower != null:
				n += 1
				break
	return n


func _end_wave() -> void:
	var w: int = int(state["wave"])
	# Interés sobre lo ahorrado, con tope: premia no gastarlo todo de golpe sin
	# que guardar oro se convierta en la única estrategia.
	var interest: int = mini(Balance.INTEREST_CAP,
		int(floor(float(gold) * float(state["interest"]))))
	var veins: int = active_veins() * int(state["vein_gold"])
	var bonus: int = Balance.WAVE_BONUS_BASE + w * Balance.WAVE_BONUS_PER_WAVE \
		+ interest + veins
	state["gold"] = gold + int(round(float(bonus) * float(state["global"].get("gold_mult", 1.0))))
	state["score"] = int(state["score"]) + w * 10

	cards = CardsScript.draw(_card_rng, catalog, state, Balance.CARD_CHOICES,
		Balance.is_boss_wave(w))
	if cards.is_empty():
		_after_draft()
		return
	phase = Phase.DRAFT
	changed.emit("draft")


func _after_draft() -> void:
	# Cambio de sector: el mapa crece justo antes de volver a construir.
	var w: int = int(state["wave"])
	if w > 0 and w % Balance.WAVES_PER_SECTOR == 0:
		# Las rutas que se quedan sin sitio por donde crecer se sellan: su portal
		# deja de escupir y el mapa se reorganiza alrededor de las que siguen.
		last_expand = {"level": map.level, "sealed": map.expand(),
			"routes": map.routes.size()}
		phase = Phase.EXPANDING
		expand_timer = EXPAND_TIME
		changed.emit("expand")
	else:
		phase = Phase.BUILD
		changed.emit("phase")
