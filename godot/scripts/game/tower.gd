class_name Tower
extends RefCounted

## Una torre construida. Las estadísticas efectivas salen de combinar:
## base × terreno × mejoras × modificadores globales (cartas) × auras de pilones.

var def: Dictionary
var cell
var levels := {"damage": 0, "range": 0, "fire_rate": 0, "special": 0}
var cooldown := 0.0
var angle := 0.0
var target = null
var kills := 0
var damage_dealt := 0.0
var invested := 0
var stats := {}


func _init(d: Dictionary, c) -> void:
	def = d
	cell = c
	invested = int(d["cost"])
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
			pass
		"dot":
			if not stats["dot"].is_empty():
				stats["dot"]["factor"] = float(stats["dot"]["factor"]) * (1.0 + 0.50 * float(sp))
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
	stats["dps"] = stats["damage"] * stats["fire_rate"] * avg
