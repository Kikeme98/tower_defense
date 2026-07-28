class_name Battle
extends RefCounted

## Campo de batalla: enemigos, torres y proyectiles en un mismo sitio.
##
## Van juntos porque están acoplados de verdad — una torre necesita buscar
## objetivo, un proyectil necesita el radio de enemigos, una muerte necesita
## pagar oro. Separarlos obligaría a pasarse referencias cruzadas sin ganar nada.
##
## No es un Node: es lógica pura, así que se puede simular una partida entera en
## headless sin abrir ventana. La vista lee `enemies`, `towers` y `projectiles`
## y dibuja; los efectos visuales se acumulan en `fx` para que quien pinte los
## consuma, o se descarten sin más si nadie mira.

const TowerScript = preload("res://scripts/game/tower.gd")
const EnemyScript = preload("res://scripts/game/enemy.gd")

## Lado de la celda del índice espacial. Del orden del alcance típico de una
## torre: una consulta toca pocas celdas y cada una tiene pocos enemigos.
const CELL := 8.0

var rng
var grid
var enemies: Array = []
var towers: Array = []
var projectiles: Array = []
var counts := {}  ## torres construidas por tipo, para el precio creciente
var global_mods := {}  ## multiplicadores de las cartas
var target_mode := "first"
var dirty := true  ## hay que recalcular estadísticas (auras, mejoras, cartas)
var time := 0.0

## Efectos pendientes de dibujar. Cada uno es un diccionario con `kind`.
## Se vacía cada frame: si nadie lo lee, no pasa nada.
var fx: Array = []

var _index := {}
var _proj_pool: Array = []


func _init(r, g = null) -> void:
	rng = r
	grid = g


# --- Enemigos ---------------------------------------------------------------

func spawn_enemy(def: Dictionary, route, wave: int, sector: int, lane: float, mods := {}):
	var e = EnemyScript.new().spawn(def, route, wave, sector, lane, mods)
	enemies.append(e)
	return e


## Rejilla espacial de los enemigos vivos.
##
## Sin ella cada torre recorre la lista entera buscando objetivo: con 300 torres
## y 80 enemigos son 24.000 comprobaciones por frame, y es lo primero que ahoga a
## un equipo modesto en partidas largas. Se reconstruye una vez por frame porque
## todos se mueven a la vez.
func _rebuild_index() -> void:
	for bucket in _index.values():
		bucket.clear()
	for e in enemies:
		if not e.alive:
			continue
		var k := _cell_key(e.x, e.z)
		if not _index.has(k):
			_index[k] = []
		_index[k].append(e)


func _cell_key(wx: float, wz: float) -> int:
	return ((int(floor(wx / CELL)) + 512) << 10) | (int(floor(wz / CELL)) + 512)


## Enemigos de las celdas que solapan un círculo. Devuelve un array reutilizado
## por quien llama, no una copia.
func _near(wx: float, wz: float, radius: float) -> Array:
	var out: Array = []
	var x0 := int(floor((wx - radius) / CELL))
	var x1 := int(floor((wx + radius) / CELL))
	var z0 := int(floor((wz - radius) / CELL))
	var z1 := int(floor((wz + radius) / CELL))
	for cx in range(x0, x1 + 1):
		for cz in range(z0, z1 + 1):
			var bucket = _index.get(((cx + 512) << 10) | (cz + 512))
			if bucket != null:
				out.append_array(bucket)
	return out


## Mejor objetivo dentro del alcance según el modo elegido. Elegir bien importa:
## "el más avanzado" y "el más fuerte" dan defensas muy distintas.
func find_target(wx: float, wz: float, range_: float, min_range: float,
		targets: String, mode := "first"):
	var r2 := range_ * range_
	var min2 := min_range * min_range
	var best = null
	var best_score := -INF
	for e in _near(wx, wz, range_):
		if not e.alive:
			continue
		if targets == "ground" and e.flying:
			continue
		if targets == "air" and not e.flying:
			continue
		var dx: float = e.x - wx
		var dz: float = e.z - wz
		var d2 := dx * dx + dz * dz
		if d2 > r2 or d2 < min2:
			continue
		var score: float
		match mode:
			"strong": score = e.total_hp
			"weak": score = -e.total_hp
			"close": score = -d2
			"fast": score = e.speed
			_: score = e.progress
		if score > best_score:
			best_score = score
			best = e
	return best


func query_radius(wx: float, wz: float, radius: float) -> Array:
	var out: Array = []
	var r2 := radius * radius
	for e in _near(wx, wz, radius):
		if not e.alive:
			continue
		var dx: float = e.x - wx
		var dz: float = e.z - wz
		if dx * dx + dz * dz < r2:
			out.append(e)
	return out


# --- Torres -----------------------------------------------------------------

func count_of(id: String) -> int:
	return int(counts.get(id, 0))


## Precio actual: sube con cada torre del mismo tipo ya construida.
func price_of(def: Dictionary) -> int:
	return int(def["cost"]) + int(def.get("price_step", 0)) * count_of(def["id"])


func can_place(cell, def: Dictionary) -> bool:
	if cell == null or cell.tower != null:
		return false
	if cell.terrain == Grid.T.WATER:
		return def.get("amphibious", false)
	return Grid.is_buildable(cell.terrain)


func place(def: Dictionary, cell):
	var t = TowerScript.new(def, cell)
	t.born_at = time
	cell.tower = t
	towers.append(t)
	counts[def["id"]] = count_of(def["id"]) + 1
	dirty = true
	return t


func sell(tower) -> int:
	tower.cell.tower = null
	towers.erase(tower)
	counts[tower.def["id"]] = maxi(0, count_of(tower.def["id"]) - 1)
	dirty = true
	return int(round(float(tower.invested) * Balance.SELL_RATIO))


func upgrade(tower, path_id: String) -> void:
	tower.levels[path_id] += 1
	dirty = true


## Recalcula las estadísticas de todas las torres. Se hace sólo cuando algo
## cambia (construir, vender, mejorar, una carta nueva), no cada frame: las
## auras obligan a recorrer pares de torres y eso sí se nota con el mapa lleno.
func recompute_all() -> void:
	var pylons: Array = []
	for t in towers:
		if not t.def.get("aura", {}).is_empty():
			pylons.append(t)
			t.recompute(global_mods, {})

	var syn: Dictionary = global_mods.get("synergy", {})
	for t in towers:
		var aura := {}
		if t.def.get("aura", {}).is_empty():
			for p in pylons:
				var d2: float = pow(p.x - t.x, 2.0) + pow(p.z - t.z, 2.0)
				if d2 > p.stats["range"] * p.stats["range"]:
					continue
				for k in p.stats["aura"]:
					aura[k] = float(aura.get(k, 1.0)) * float(p.stats["aura"][k])

		if syn.get("forest", 0.0) and t.cell.terrain == Grid.T.FOREST:
			aura["damage"] = float(aura.get("damage", 1.0)) * (1.0 + float(syn["forest"]))
		if grid != null:
			var adj := 0
			var feature := 1.0
			for c in grid.neighbors(t.cell.x, t.cell.y):
				if c.tower != null:
					adj += 1
				if c.feature == "obelisk":
					feature *= 1.18
			var adjacency: float = float(syn.get("adjacency", 0.0))
			if adjacency > 0.0 and adj > 0:
				aura["fire_rate"] = float(aura.get("fire_rate", 1.0)) \
					* (1.0 + adjacency * float(adj))
			if feature != 1.0:
				aura["damage"] = float(aura.get("damage", 1.0)) * feature
		t.recompute(global_mods, aura)
	dirty = false


# --- Proyectiles ------------------------------------------------------------

## Los proyectiles son diccionarios reciclados: se crean y mueren a cientos por
## segundo, y reservar uno nuevo cada vez es basura gratuita para el recolector.
func spawn_projectile(opts: Dictionary) -> Dictionary:
	var p: Dictionary = _proj_pool.pop_back() if not _proj_pool.is_empty() else {}
	p.clear()
	p.merge({
		"type": "bullet", "splash": 0.0, "slow": 0.0, "dot": {}, "pierce": 0,
		"target": null, "size": 0.28, "life": 4.0, "t": 0.0, "hits": {},
		"vx": 0.0, "vy": 0.0, "vz": 0.0, "tower": null,
	}, true)
	p.merge(opts, true)
	projectiles.append(p)
	return p


func _update_projectiles(dt: float) -> void:
	for i in range(projectiles.size() - 1, -1, -1):
		var p: Dictionary = projectiles[i]
		p["life"] = float(p["life"]) - dt
		var done := false

		match p["type"]:
			"arc":
				p["t"] = float(p["t"]) + dt / float(p["duration"])
				var k: float = minf(1.0, float(p["t"]))
				p["x"] = float(p["x0"]) + (float(p["tx"]) - float(p["x0"])) * k
				p["z"] = float(p["z0"]) + (float(p["tz"]) - float(p["z0"])) * k
				p["y"] = float(p["y0"]) + (float(p["ty"]) - float(p["y0"])) * k \
					+ sin(k * PI) * float(p["height"])
				if float(p["t"]) >= 1.0:
					_impact(p, float(p["tx"]), float(p["ty"]), float(p["tz"]), null)
					done = true
			"pierce":
				p["x"] = float(p["x"]) + float(p["vx"]) * dt
				p["y"] = float(p["y"]) + float(p["vy"]) * dt
				p["z"] = float(p["z"]) + float(p["vz"]) * dt
				var hits: Dictionary = p["hits"]
				for e in query_radius(float(p["x"]), float(p["z"]), 2.0):
					if hits.has(e):
						continue
					if p["targets"] == "ground" and e.flying:
						continue
					if p["targets"] == "air" and not e.flying:
						continue
					var dx: float = e.x - float(p["x"])
					var dy: float = e.y + 0.6 - float(p["y"])
					var dz: float = e.z - float(p["z"])
					var rr: float = e.size + 0.4
					if dx * dx + dy * dy + dz * dz < rr * rr:
						hits[e] = true
						_hit(p, e)
						fx.append({"kind": "spark", "pos": Vector3(e.x, e.y + 0.6, e.z),
							"color": p["color"]})
						if hits.size() >= int(p["pierce"]):
							done = true
							break
			_:
				# Guiado suave: si el objetivo muere, el disparo sigue hasta su
				# última posición conocida en vez de desvanecerse en el aire.
				var tgt = p["target"]
				if tgt != null and tgt.alive:
					p["tx"] = tgt.x
					p["ty"] = tgt.y + 0.6
					p["tz"] = tgt.z
				var d := Vector3(float(p["tx"]) - float(p["x"]),
					float(p["ty"]) - float(p["y"]), float(p["tz"]) - float(p["z"]))
				var dist := d.length()
				var step: float = float(p["speed"]) * dt
				if dist <= step + 0.2:
					_impact(p, float(p["tx"]), float(p["ty"]), float(p["tz"]),
						tgt if (tgt != null and tgt.alive) else null)
					done = true
				else:
					var n := d / dist
					p["x"] = float(p["x"]) + n.x * step
					p["y"] = float(p["y"]) + n.y * step
					p["z"] = float(p["z"]) + n.z * step
					p["vx"] = n.x
					p["vy"] = n.y
					p["vz"] = n.z

		if done or float(p["life"]) <= 0.0:
			projectiles.remove_at(i)
			_proj_pool.append(p)


func _hit(p: Dictionary, e, scale := 1.0) -> void:
	# La evasión del espectro usa aleatoriedad aparte: no altera la simulación
	# determinista del generador de la partida.
	var dodge: float = float(e.def.get("dodge", 0.0))
	if dodge > 0.0 and randf() < dodge:
		return
	var dmg: float = float(p["damage"]) * scale
	var dealt: float = e.damage(dmg, p["vs"], p["tower_id"])
	if p["tower"] != null:
		p["tower"].damage_dealt += dealt
		if not e.alive:
			p["tower"].kills += 1
	var dot: Dictionary = p["dot"]
	if not dot.is_empty():
		e.apply_dot(dot["type"], dmg * float(dot["factor"]))
	if float(p["slow"]) > 0.0:
		e.apply_slow(float(p["slow"]))


func _impact(p: Dictionary, wx: float, wy: float, wz: float, direct) -> void:
	var splash: float = float(p["splash"])
	if splash > 0.0:
		for e in query_radius(wx, wz, splash):
			if p["targets"] == "ground" and e.flying:
				continue
			if p["targets"] == "air" and not e.flying:
				continue
			var d := sqrt(pow(e.x - wx, 2.0) + pow(e.z - wz, 2.0))
			_hit(p, e, 1.0 - 0.45 * (d / splash))  # el centro duele más
		fx.append({"kind": "boom", "pos": Vector3(wx, wy, wz), "radius": splash,
			"color": p["color"]})
	elif direct != null:
		_hit(p, direct)
		fx.append({"kind": "spark", "pos": Vector3(wx, wy, wz), "color": p["color"]})


# --- Efectos ----------------------------------------------------------------

func beam(tower, target, ramp: float) -> void:
	fx.append({"kind": "beam", "from": Vector3(tower.x, tower.y + 1.1, tower.z),
		"to": Vector3(target.x, target.y + 0.6, target.z),
		"color": tower.def["accent"], "width": 0.1 + ramp * 0.05})


func arc_fx(from: Vector3, to: Vector3, color: Color) -> void:
	fx.append({"kind": "beam", "from": from, "to": to, "color": color, "width": 0.16})


# --- Paso de simulación -----------------------------------------------------

## Avanza un frame. Devuelve el resumen de lo ocurrido: es lo que la partida
## necesita para pagar oro y restar vidas, sin tener que inspeccionar las listas.
func update(dt: float) -> Dictionary:
	time += dt
	fx.clear()
	if dirty:
		recompute_all()
	_rebuild_index()

	for t in towers:
		t.update(dt, self)
	_update_projectiles(dt)

	var gold := 0
	var killed := 0
	var leaked := 0
	var core_damage := 0
	var leaked_defs: Array = []
	var gold_per_type: int = int(global_mods.get("gold_per_tower_type", 0))

	# Sanadores: curan a los suyos en un radio. Va antes de la actualización para
	# que un enemigo que iba a morir este frame pueda salvarse.
	for e in enemies:
		var heal: Dictionary = e.def.get("heal", {})
		if not e.alive or heal.is_empty():
			continue
		var r2: float = float(heal["radius"]) * float(heal["radius"])
		for o in enemies:
			if o == e or not o.alive or o.health >= o.max_health:
				continue
			if pow(o.x - e.x, 2.0) + pow(o.z - e.z, 2.0) < r2:
				o.health = minf(o.max_health,
					o.health + o.max_health * float(heal["hps"]) * dt)

	for i in range(enemies.size() - 1, -1, -1):
		var e = enemies[i]
		e.update(dt)
		if e.alive:
			continue
		if e.reached_core:
			leaked += 1
			core_damage += int(e.def.get("core_damage", 1))
			leaked_defs.append(e.def)
		else:
			# El oro por tipos de torre que participaron premia combinar
			# defensas en vez de amontonar una sola torre buena.
			gold += e.gold + e.hit_by.size() * gold_per_type
			killed += 1
			fx.append({"kind": "death", "pos": Vector3(e.x, e.y + 0.5, e.z),
				"size": e.size, "color": e.def["color"]})
		enemies.remove_at(i)

	return {"gold": gold, "killed": killed, "leaked": leaked,
		"core_damage": core_damage, "leaked_defs": leaked_defs}


func clear() -> void:
	for t in towers:
		t.cell.tower = null
	towers.clear()
	enemies.clear()
	projectiles.clear()
	counts.clear()
	fx.clear()
	dirty = true
