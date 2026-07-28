class_name Tower
extends RefCounted

## Una torre construida. Las estadísticas efectivas salen de combinar:
## base × terreno × mejoras × modificadores globales (cartas) × auras de pilones.

var def: Dictionary

## La celda se guarda como referencia débil a propósito. La celda apunta a su
## torre y la torre a su celda: con dos referencias fuertes eso es un ciclo, y
## el contador de referencias de Godot no recoge ciclos. Sin esto, reiniciar la
## partida dejaría el mapa entero y todas sus torres en memoria para siempre.
## La cadena fuerte va en el sentido correcto: la rejilla es dueña de la celda,
## y la celda de su torre.
var _cell_ref: WeakRef
var cell:
	get: return _cell_ref.get_ref() if _cell_ref != null else null
	set(v): _cell_ref = weakref(v) if v != null else null

var levels := {"damage": 0, "range": 0, "fire_rate": 0, "special": 0}
var cooldown := 0.0
var angle := 0.0
var target = null
var kills := 0
var damage_dealt := 0.0
var invested := 0
var stats := {}

var x := 0.0
var y := 0.0
var z := 0.0
var recoil := 0.0  ## 1 justo tras disparar, decae: la vista lo usa para el culatazo
var beam_time := 0.0  ## segundos que el prisma lleva sobre el mismo objetivo
var born_at := -1.0  ## instante de construcción, para la animación de aparición


func _init(d: Dictionary, c) -> void:
	def = d
	cell = c
	invested = int(d["cost"])
	if c != null:
		x = c.wx
		y = c.wy
		z = c.wz
	# Se calculan ya con valores base: consultar la torre en el mismo instante en
	# que se construye leería un diccionario vacío.
	recompute({}, {})


var total_level: int:
	get: return levels["damage"] + levels["range"] + levels["fire_rate"] + levels["special"]


## Coste aritmético: 1×, 2×, 3×… Mejorar sigue siendo viable en oleadas altas.
## Devuelve -1 si la línea ya está al máximo.
func upgrade_cost(path_id: String) -> int:
	for p in TowerDefs.PATHS:
		if p["id"] == path_id:
			var lvl: int = levels[path_id]
			if lvl >= int(p["max"]):
				return -1
			return int(round(float(def["cost"]) * float(p["cost_mult"]) * float(lvl + 1)))
	return -1


func recompute(global: Dictionary, aura: Dictionary) -> void:
	var terrain: Dictionary = {}
	if cell != null:
		terrain = Grid.TERRAIN[cell.terrain]["mods"]
	var sp: int = levels["special"]
	var height: int = maxi(0, cell.height) if cell != null else 0

	var paths := {}
	for p in TowerDefs.PATHS:
		paths[p["id"]] = p

	var m := func(stat: String) -> float:
		var p: Dictionary = paths.get(stat, {})
		var up := 1.0
		if not p.is_empty() and float(p["mult"]) != 1.0:
			up = pow(float(p["mult"]), float(levels[stat]))
		return up * float(terrain.get(stat, 1.0)) \
			* float(global.get(stat, 1.0)) * float(aura.get(stat, 1.0))

	stats["damage"] = float(def["damage"]) * m.call("damage")
	# La elevación da daño y alcance: el terreno alto es territorio disputado.
	stats["damage"] *= 1.0 + float(height) * 0.05
	stats["range"] = float(def["range"]) * m.call("range") * (1.0 + float(height) * 0.045)
	stats["fire_rate"] = float(def["fire_rate"]) * m.call("fire_rate")
	stats["min_range"] = float(def.get("min_range", 0.0))
	stats["splash"] = float(def.get("splash", 0.0)) * float(global.get("splash", 1.0))
	stats["pierce"] = int(def.get("pierce", 0))
	stats["slow"] = float(def.get("slow", 0.0))
	stats["dot"] = def.get("dot", {}).duplicate() if def.has("dot") else {}
	stats["aura"] = def.get("aura", {}).duplicate() if def.has("aura") else {}
	stats["chain"] = def.get("chain", {}).duplicate() if def.has("chain") else {}
	stats["salvo"] = 1
	stats["ramp_max"] = float(def.get("ramp_up", {}).get("max", 1.0))
	stats["crit_chance"] = float(global.get("crit_chance", 0.0))
	stats["crit_bonus"] = float(global.get("crit_bonus", 0.0))
	stats["vs"] = {
		"h": float(def["vs"]["h"]) * float(global.get("vs_health", 1.0)),
		"a": float(def["vs"]["a"]) * float(global.get("vs_armor", 1.0)),
		"s": float(def["vs"]["s"]) * float(global.get("vs_shield", 1.0)),
	}

	match def.get("special", ""):
		"pierce":
			stats["pierce"] = int(def.get("pierce", 0)) + sp * (2 if def["id"] == "ballista" else 1)
			if def["id"] == "ballista":
				stats["damage"] *= pow(1.25, float(sp))
		"splash":
			stats["splash"] *= 1.0 + 0.35 * float(sp)
			stats["damage"] *= 1.0 + 0.15 * float(sp)
		"freeze":
			stats["slow"] *= 1.0 + 0.40 * float(sp)
		"chain":
			if not stats["chain"].is_empty():
				stats["chain"]["count"] = int(stats["chain"]["count"]) + sp
				stats["chain"]["falloff"] = minf(0.95,
					float(stats["chain"]["falloff"]) + 0.05 * float(sp))
		"dot":
			if not stats["dot"].is_empty():
				stats["dot"]["factor"] = float(stats["dot"]["factor"]) * (1.0 + 0.50 * float(sp))
		"salvo":
			stats["salvo"] = 1 + sp / 2
		"ramp":
			stats["ramp_max"] = float(stats["ramp_max"]) + 0.5 * float(sp)
		"flak":
			stats["damage"] *= 1.0 + 0.30 * float(sp)
			stats["splash"] *= 1.0 + 0.30 * float(sp)
		"reel":
			stats["slow"] *= 1.0 + 0.50 * float(sp)
			stats["damage"] *= 1.0 + 0.20 * float(sp)
		"aura":
			for k in stats["aura"]:
				stats["aura"][k] = 1.0 + (float(stats["aura"][k]) - 1.0) * (1.0 + 0.08 * float(sp))

	if not stats["dot"].is_empty():
		stats["dot"]["factor"] = float(stats["dot"]["factor"]) * float(global.get("dot_mult", 1.0))

	# DPS orientativo: daño medio contra las tres capas.
	var avg: float = (stats["vs"]["h"] + stats["vs"]["a"] + stats["vs"]["s"]) / 3.0
	var crit_avg: float = 1.0 + minf(0.5, stats["crit_chance"]) * (1.0 + stats["crit_bonus"])
	stats["dps"] = stats["damage"] * stats["fire_rate"] * avg * crit_avg


## Crítico escalonado: la probabilidad se reparte en tramos de 50%, y cada tramo
## desbloquea un multiplicador mayor. Se tira del más alto al más bajo, así
## acumular probabilidad nunca es un desperdicio.
static func roll_crit(chance: float, bonus: float, rng) -> float:
	if chance <= 0.0:
		return 1.0
	var p4 := clampf(chance - 1.0, 0.0, 0.5)
	var p3 := clampf(chance - 0.5, 0.0, 0.5)
	var p2 := clampf(chance, 0.0, 0.5)
	if p4 > 0.0 and rng.next() < p4:
		return 4.0 + bonus
	if p3 > 0.0 and rng.next() < p3:
		return 3.0 + bonus
	if p2 > 0.0 and rng.next() < p2:
		return 2.0 + bonus
	return 1.0


## Posición estimada del enemigo dentro de `t` segundos: sin esto los
## proyectiles lentos siempre disparan por detrás de un objetivo en marcha.
static func _predict(e, t: float) -> Vector2:
	return Vector2(e.x + sin(e.heading) * e.speed * t, e.z + cos(e.heading) * e.speed * t)


func _out_of_range(e) -> bool:
	var dx: float = e.x - x
	var dz: float = e.z - z
	var d2 := dx * dx + dz * dz
	return d2 > stats["range"] * stats["range"] \
		or d2 < stats["min_range"] * stats["min_range"]


## Un paso de la torre. `field` es el campo de batalla: da objetivos, proyectiles
## y el generador. Devolver pronto es lo normal — la mayoría de torres no tienen
## nada que hacer en un frame dado.
func update(dt: float, field) -> void:
	if not def.get("aura", {}).is_empty():
		return  # los pilones no disparan
	if stats["fire_rate"] <= 0.0:
		return

	if target != null and (not target.alive or _out_of_range(target)):
		target = null
	if target == null:
		target = field.find_target(x, z, stats["range"], stats["min_range"],
			def["targets"], field.target_mode)
		beam_time = 0.0
	if target == null:
		recoil *= maxf(0.0, 1.0 - dt * 8.0)
		return

	# Giro suave hacia el objetivo. atan2(dx, dz) orienta el +Z de la torre.
	var want := atan2(target.x - x, target.z - z)
	var diff := wrapf(want - angle, -PI, PI)
	angle += diff * minf(1.0, dt * 12.0)

	if def.get("beam", false):
		_beam(dt, field)
		return

	recoil *= maxf(0.0, 1.0 - dt * 8.0)
	cooldown -= dt
	if cooldown > 0.0:
		return
	cooldown = 1.0 / stats["fire_rate"]
	_shoot(field)


## Rayo continuo: no dispara proyectiles, aplica daño por segundo y sube de
## intensidad mientras no cambie de objetivo.
func _beam(dt: float, field) -> void:
	beam_time += dt
	var per_sec: float = float(def.get("ramp_up", {}).get("per_sec", 0.8))
	var ramp: float = minf(stats["ramp_max"], 1.0 + beam_time * per_sec)
	var raw: float = stats["damage"] * stats["fire_rate"] * dt * ramp
	damage_dealt += target.damage(raw, stats["vs"], def["id"])
	if not stats["dot"].is_empty():
		target.apply_dot(stats["dot"]["type"], raw * float(stats["dot"]["factor"]))
	if stats["slow"] > 0.0:
		target.apply_slow(stats["slow"] * dt)
	field.beam(self, target, ramp)
	if not target.alive:
		kills += 1
		target = null


func _shoot(field) -> void:
	var my := y + 1.0
	recoil = 1.0
	var dmg: float = stats["damage"] * roll_crit(stats["crit_chance"], stats["crit_bonus"], field.rng)
	var payload := {
		"damage": dmg, "vs": stats["vs"], "slow": stats["slow"], "dot": stats["dot"],
		"tower_id": def["id"], "targets": def["targets"], "color": def["accent"],
		# El proyectil recuerda quién lo disparó para atribuirle el daño al
		# impactar: sin esto el panel de la torre sólo contaría rayos y cadenas.
		"tower": self,
	}

	if not stats["chain"].is_empty():
		_chain(field, dmg)
		return

	var speed: float = float(def.get("proj_speed", 40.0))
	var dist := sqrt(pow(target.x - x, 2.0) + pow(target.z - z, 2.0))
	var flight: float = dist / speed

	if def.get("arc", false):
		# Andanada: el primer proyectil va al punto predicho y el resto se
		# reparten alrededor, para que el mortero cubra área en vez de repetir
		# el mismo impacto.
		for i in stats["salvo"]:
			var p := _predict(target, flight)
			var spread := Vector2.ZERO if i == 0 else Vector2(
				field.rng.randf_range_(-1.8, 1.8), field.rng.randf_range_(-1.8, 1.8))
			var o := payload.duplicate()
			o.merge({
				"type": "arc", "x": x, "y": my, "z": z, "x0": x, "y0": my, "z0": z,
				"tx": p.x + spread.x, "ty": target.y, "tz": p.y + spread.y,
				"duration": maxf(0.35, flight), "height": 6.0 + flight * 3.0,
				"splash": stats["splash"],
			}, true)
			field.spawn_projectile(o)
		return

	if stats["pierce"] > 0:
		var p2 := _predict(target, flight)
		var d := Vector3(p2.x - x, target.y + 0.6 - my, p2.y - z)
		var ln := maxf(0.001, d.length())
		var o2 := payload.duplicate()
		o2.merge({
			"type": "pierce", "x": x, "y": my, "z": z,
			"vx": d.x / ln * speed, "vy": d.y / ln * speed, "vz": d.z / ln * speed,
			"pierce": stats["pierce"] + 1, "life": stats["range"] / speed + 0.3,
		}, true)
		field.spawn_projectile(o2)
		return

	var o3 := payload.duplicate()
	o3.merge({
		"x": x, "y": my, "z": z, "target": target,
		"tx": target.x, "ty": target.y + 0.6, "tz": target.z,
		"speed": speed, "splash": stats["splash"],
	}, true)
	field.spawn_projectile(o3)


## Rayo que salta de enemigo en enemigo perdiendo fuerza. Se resuelve al
## instante: no hay proyectil que viajar.
func _chain(field, dmg: float) -> void:
	var cur = target
	var from := Vector3(x, y + 1.0, z)
	var power := dmg
	var hit := {}
	for i in int(stats["chain"]["count"]):
		if cur == null:
			break
		hit[cur] = true
		damage_dealt += cur.damage(power, stats["vs"], def["id"])
		if not stats["dot"].is_empty():
			cur.apply_dot(stats["dot"]["type"], power * float(stats["dot"]["factor"]))
		if stats["slow"] > 0.0:
			cur.apply_slow(stats["slow"])
		field.arc_fx(from, Vector3(cur.x, cur.y + 0.6, cur.z), def["accent"])
		from = Vector3(cur.x, cur.y + 0.6, cur.z)
		power *= float(stats["chain"]["falloff"])
		# Salto al vivo más cercano que no se haya alcanzado ya.
		var next = null
		var best := 36.0
		for e in field.enemies:
			if not e.alive or hit.has(e):
				continue
			if def["targets"] == "ground" and e.flying:
				continue
			var dd: float = pow(e.x - from.x, 2.0) + pow(e.z - from.z, 2.0)
			if dd < best:
				best = dd
				next = e
		cur = next
