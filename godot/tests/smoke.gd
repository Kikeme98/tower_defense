extends SceneTree

## Partidas completas jugadas por un bot, sin abrir ventana.
##
##   godot --headless --script tests/smoke.gd -- --runs=5 --waves=60
##
## No comprueba una función concreta: comprueba que el juego se puede jugar y
## que la dificultad está donde debe. Un bot que llega a la oleada 60 sin
## despeinarse significa que el juego es demasiado fácil; uno que muere en la 8,
## que es injusto. Es la herramienta de balance, y de paso caza los fallos que
## sólo salen con miles de enemigos, torres y proyectiles a la vez.

const RunScript = preload("res://scripts/game/run.gd")
const TowerDefsScript = preload("res://scripts/game/tower_defs.gd")
const GridScript = preload("res://scripts/world/grid.gd")

const DT := 1.0 / 30.0  ## paso de simulación; más grueso que el juego, y basta
const MAX_SECONDS := 400.0  ## corte por oleada, para que un cuelgue no bloquee

var runs := 5
var max_waves := 60


func _init() -> void:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--runs="):
			runs = int(a.substr(7))
		elif a.begins_with("--waves="):
			max_waves = int(a.substr(8))

	var reached: Array = []
	var failed := 0
	for i in runs:
		var r := _play("bot-%d" % i)
		reached.append(r["wave"])
		print("  semilla bot-%d · oleada %d · %d torres · %d de oro · %s"
			% [i, r["wave"], r["towers"], r["gold"], r["end"]])
		if r["end"] == "atasco":
			failed += 1
		if not r["leaked_by"].is_empty():
			print("     se coló: %s" % _top_leaks(r["leaked_by"]))

	reached.sort()
	var median: int = reached[reached.size() / 2]
	print("mediana: oleada %d · rango %d–%d" % [median, reached[0], reached[reached.size() - 1]])

	# Los márgenes son anchos a propósito: esto detecta que el balance se ha ido
	# a un extremo, no afina el número exacto.
	var problems: Array = []
	if failed > 0:
		problems.append("%d partidas se atascaron" % failed)
	if median < 12:
		problems.append("demasiado difícil: mediana en la oleada %d" % median)
	if median >= max_waves:
		problems.append("demasiado fácil: el bot termina las %d oleadas" % max_waves)

	if problems.is_empty():
		print("✓ el balance está en su sitio")
		quit(0)
	for p in problems:
		printerr("✗ ", p)
	quit(1)


func _top_leaks(by: Dictionary) -> String:
	var keys := by.keys()
	keys.sort_custom(func(a, b): return int(by[a]) > int(by[b]))
	var out: Array = []
	for k in keys.slice(0, 3):
		out.append("%s ×%d" % [k, int(by[k])])
	return ", ".join(out)


func _play(seed_text: String) -> Dictionary:
	var run = RunScript.new(seed_text)
	var end := "vivo"

	while int(run.state["wave"]) < max_waves:
		if run.phase == RunScript.Phase.BUILD:
			_build(run)
			run.start_wave()

		var elapsed := 0.0
		while run.phase == RunScript.Phase.COMBAT and elapsed < MAX_SECONDS:
			run.update(DT)
			elapsed += DT
		if run.phase == RunScript.Phase.COMBAT:
			end = "atasco"
			break
		if run.phase == RunScript.Phase.GAMEOVER:
			end = "derrota"
			break

		# El draft y la expansión se resuelven al momento: al bot no le hace
		# falta ver la animación.
		if run.phase == RunScript.Phase.DRAFT:
			run.choose_card(_pick_card(run))
		while run.phase == RunScript.Phase.EXPANDING:
			run.update(DT)

	return {
		"wave": int(run.state["wave"]), "gold": run.gold, "end": end,
		"towers": run.battle.towers.size(), "leaked_by": run.state["leaked_by"],
	}


## Estrategia del bot: gastar casi todo el oro cada ronda, alternando entre
## construir y mejorar. No juega bien —no lee la composición de la oleada— pero
## sí juega de forma consistente, que es lo que hace comparables dos ejecuciones.
func _build(run) -> void:
	var guard := 0
	while run.gold > 80 and guard < 40:
		guard += 1
		# Una de cada tres veces, mejorar la torre más rentable en vez de añadir
		# otra: sin esto el bot llena el mapa de torres de nivel 1 y muere a la
		# vez que cualquier jugador que hiciera lo mismo.
		if run.battle.towers.size() > 4 and guard % 3 == 0:
			if _upgrade_best(run):
				continue
		if not _place_one(run):
			break


func _place_one(run) -> bool:
	# La torre más cara que se pueda pagar: el bot no elige por tipo, así que al
	# menos que suba de gama conforme progresa.
	var best := {}
	for d in run.unlocked_defs:
		var cost: int = run.cost_of(d)
		if cost > run.gold:
			continue
		if best.is_empty() or cost > run.cost_of(best):
			best = d
	if best.is_empty():
		return false

	var cell = _best_cell(run, best)
	if cell == null:
		return false
	return run.place(best, cell)


## Casilla libre lo más pegada posible al camino, y en alto si se puede: es lo
## que haría un jugador que ya sabe que la elevación da daño y alcance.
func _best_cell(run, def: Dictionary):
	var best = null
	var best_score := -INF
	for c in run.grid.cells.values():
		if c.tower != null or c.path:
			continue
		if c.terrain == GridScript.T.WATER:
			if not def.get("amphibious", false):
				continue
		elif not GridScript.is_buildable(c.terrain):
			continue
		if c.path_dist > 3:
			continue
		var score: float = -float(c.path_dist) * 2.0 + float(maxi(0, c.height)) * 0.6
		if score > best_score:
			best_score = score
			best = c
	return best


func _upgrade_best(run) -> bool:
	for t in run.battle.towers:
		if not t.def.get("aura", {}).is_empty():
			continue
		for path in ["damage", "fire_rate", "range"]:
			var cost: int = t.upgrade_cost(path)
			if cost >= 0 and cost <= run.gold:
				return run.upgrade(t, path)
	return false


## El bot elige la carta más rara disponible. Sin criterio fino, pero estable.
func _pick_card(run) -> Dictionary:
	var order := {"epic": 3, "rare": 2, "curse": 1, "common": 0}
	var best: Dictionary = run.cards[0]
	for c in run.cards:
		if int(order.get(c["rarity"], 0)) > int(order.get(best["rarity"], 0)):
			best = c
	return best
