class_name WaveDirector
extends RefCounted

## Director de oleadas: construye la cola de apariciones antes de empezar (así la
## composición es determinista respecto a la semilla) y la va soltando por tiempo.
## Los enemigos salen en tandas del mismo tipo para que la oleada se lea de un
## vistazo y el jugador pueda reaccionar.

var rng: Rng
var queue: Array = []
var cursor := 0
var timer := 0.0
var active := false
var duration := 0.0


func _init(r: Rng) -> void:
	rng = r


func start(wave: int, sector: int, routes: Array, curse: Dictionary, defs: Array,
		boss_def: Dictionary) -> void:
	queue.clear()
	cursor = 0
	timer = 0.0
	active = true

	var total := int(round(float(Balance.enemy_count(wave)) * float(curse.get("count", 1.0))))
	var interval := maxf(Balance.SPAWN_INTERVAL_MIN, Balance.SPAWN_INTERVAL - float(wave) * 0.008)

	var t := 0.0
	var placed := 0
	while placed < total:
		var d := _pick(defs, wave)
		var batch: int = mini(total - placed, int(d.get("burst", rng.randi_range_(3, 6))))
		var route = routes[rng.randi_range_(0, routes.size() - 1)]
		for i in batch:
			queue.append({"def": d, "route": route, "at": t,
				"lane": rng.randf_range_(-0.85, 0.85), "hp": float(curse.get("hp", 1.0))})
			t += interval * (0.25 if d.has("burst") else 1.0)
			placed += 1
		t += interval * 0.8  # respiro entre tandas

	if Balance.is_boss_wave(wave):
		var bosses := 1 + (sector - 1) / 4
		for i in bosses:
			queue.append({"def": boss_def, "route": routes[i % routes.size()],
				"at": t + float(i) * 2.5, "lane": 0.0,
				"hp": Balance.BOSS_HP_MULT * float(curse.get("hp", 1.0))})

	queue.sort_custom(func(a, b): return float(a["at"]) < float(b["at"]))
	duration = float(queue[queue.size() - 1]["at"]) if queue.size() > 0 else 0.0


func _pick(defs: Array, wave: int) -> Dictionary:
	var avail: Array = []
	var weights: Array = []
	for d in defs:
		if int(d["from"]) <= wave:
			avail.append(d)
			# Los recién desbloqueados aparecen poco al principio y luego más.
			var age: int = wave - int(d["from"])
			weights.append(float(d["weight"]) * minf(1.0, 0.35 + float(age) * 0.12))
	if avail.is_empty():
		return defs[0]
	return avail[rng.weighted(weights)]


## Saca de la cola lo que toque; devuelve true cuando ya no queda nada.
func update(dt: float, spawn_fn: Callable) -> bool:
	if not active:
		return true
	timer += dt
	while cursor < queue.size() and float(queue[cursor]["at"]) <= timer:
		spawn_fn.call(queue[cursor])
		cursor += 1
	if cursor >= queue.size():
		active = false
		return true
	return false


var remaining: int:
	get: return queue.size() - cursor
