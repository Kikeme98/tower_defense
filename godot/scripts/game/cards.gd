class_name Cards
extends RefCounted

## Draft roguelike: al terminar cada oleada se ofrecen tres cartas y se elige una.
## Las cartas son la progresión real de la partida —el oro sólo compra torres— y
## algunas son pactos: suben la dificultad a cambio de más recompensa.

const RARITY := {
	"common": {"name": "Común", "weight": 100.0},
	"rare": {"name": "Rara", "weight": 42.0},
	"epic": {"name": "Épica", "weight": 15.0},
	"curse": {"name": "Pacto", "weight": 26.0},
}


## Multiplica un modificador global. Devuelto como Callable para el catálogo.
static func _mul(stat: String, amount: float) -> Callable:
	return func(st: Dictionary) -> void:
		st["global"][stat] = float(st["global"].get(stat, 1.0)) * amount


static func build_catalog() -> Array:
	var list: Array = [
		{"id": "dmg1", "name": "Filo afilado", "rarity": "common", "icon": "⚔",
		 "desc": "+15% daño de todas las torres", "apply": _mul("damage", 1.15)},
		{"id": "dmg2", "name": "Forja de guerra", "rarity": "rare", "icon": "⚔",
		 "desc": "+30% daño de todas las torres", "apply": _mul("damage", 1.30)},
		{"id": "rate1", "name": "Mecanismo ágil", "rarity": "common", "icon": "⟳",
		 "desc": "+15% cadencia", "apply": _mul("fire_rate", 1.15)},
		{"id": "rate2", "name": "Frenesí", "rarity": "rare", "icon": "⟳",
		 "desc": "+28% cadencia", "apply": _mul("fire_rate", 1.28)},
		{"id": "range1", "name": "Lente de vigía", "rarity": "common", "icon": "◎",
		 "desc": "+12% alcance", "apply": _mul("range", 1.12)},
		{"id": "range2", "name": "Ojo del halcón", "rarity": "rare", "icon": "◎",
		 "desc": "+25% alcance", "apply": _mul("range", 1.25)},
		{"id": "splash1", "name": "Pólvora inestable", "rarity": "common", "icon": "✸",
		 "desc": "+30% radio de área", "apply": _mul("splash", 1.30)},
		# Especialización contra capas: el corazón de la decisión táctica.
		{"id": "vs_h", "name": "Corta-carne", "rarity": "common", "icon": "♥",
		 "desc": "+35% de daño contra SALUD", "apply": _mul("vs_health", 1.35)},
		{"id": "vs_a", "name": "Rompe-placas", "rarity": "common", "icon": "▣",
		 "desc": "+35% de daño contra ARMADURA", "apply": _mul("vs_armor", 1.35)},
		{"id": "vs_s", "name": "Disruptor", "rarity": "common", "icon": "◈",
		 "desc": "+35% de daño contra ESCUDO", "apply": _mul("vs_shield", 1.35)},
		{"id": "dot1", "name": "Corrosión", "rarity": "rare", "icon": "☣",
		 "desc": "+60% de hemorragia, fuego y veneno", "apply": _mul("dot_mult", 1.60)},
		{"id": "gold1", "name": "Botín de guerra", "rarity": "common", "icon": "⬢",
		 "desc": "+20% oro por enemigo", "apply": _mul("gold_mult", 1.20)},
		{"id": "gold2", "name": "Saqueo", "rarity": "rare", "icon": "⬢",
		 "desc": "+40% oro por enemigo", "apply": _mul("gold_mult", 1.40)},
		{"id": "discount", "name": "Gremio de ingenieros", "rarity": "rare", "icon": "⬢",
		 "desc": "Las torres cuestan un 15% menos", "apply": _mul("cost_mult", 0.85)},
		{"id": "breaker", "name": "Ariete", "rarity": "epic", "unique": true, "icon": "➤",
		 "desc": "+30% de daño contra armadura Y escudo",
		 "apply": func(st): _mul("vs_armor", 1.30).call(st); _mul("vs_shield", 1.30).call(st)},
		{"id": "cash", "name": "Arcón olvidado", "rarity": "common", "icon": "⬢",
		 "desc": "Recibes 220 de oro al instante",
		 "apply": func(st): st["gold"] = int(st["gold"]) + 220},
		{"id": "lives1", "name": "Muralla reforzada", "rarity": "common", "icon": "♥",
		 "desc": "+5 vidas del núcleo",
		 "apply": func(st): st["lives"] += 5; st["max_lives"] += 5},
		{"id": "repair", "name": "Reparaciones", "rarity": "common", "icon": "♥",
		 "desc": "Restaura 4 vidas",
		 "requires": func(st): return int(st["lives"]) < int(st["max_lives"]),
		 "apply": func(st): st["lives"] = mini(int(st["max_lives"]), int(st["lives"]) + 4)},
		# Pactos: más dificultad a cambio de más potencia.
		{"id": "curse_hp", "name": "Pacto de la carne", "rarity": "curse", "icon": "☠",
		 "desc": "+30% de vida enemiga, pero +55% de oro",
		 "apply": func(st):
			st["curse"]["hp"] = float(st["curse"].get("hp", 1.0)) * 1.30
			_mul("gold_mult", 1.55).call(st)},
		{"id": "curse_count", "name": "Pacto de la horda", "rarity": "curse", "icon": "☠",
		 "desc": "+35% de enemigos, pero +35% de cadencia",
		 "apply": func(st):
			st["curse"]["count"] = float(st["curse"].get("count", 1.0)) * 1.35
			_mul("fire_rate", 1.35).call(st)},
		{"id": "curse_glass", "name": "Pacto de cristal", "rarity": "curse", "unique": true,
		 "icon": "☠", "desc": "Pierdes la mitad de tus vidas, pero +65% de daño",
		 "requires": func(st): return int(st["lives"]) > 6,
		 "apply": func(st):
			st["lives"] = int(ceil(float(st["lives"]) / 2.0))
			_mul("damage", 1.65).call(st)},
	]

	# Una carta de desbloqueo por cada torre bloqueada, generada del catálogo.
	for d in TowerDefs.LIST:
		if not d.get("unlock", false):
			continue
		var tid: String = d["id"]
		list.append({
			"id": "unlock_%s" % tid,
			"name": "Plano: %s" % d["name"],
			"rarity": "epic" if int(d["cost"]) > 200 else "rare",
			"desc": d["desc"], "icon": "✚", "unique": true, "tower": tid,
			# Desbloquear torres debe salir a menudo: es lo que da variedad.
			"weight_bonus": 2.2,
			"requires": func(st): return not st["unlocked"].has(tid),
			"apply": func(st): st["unlocked"][tid] = true,
		})
	return list


## Estado inicial de una partida, con todos los acumuladores que tocan las cartas.
static func new_state() -> Dictionary:
	return {
		"gold": Balance.START_GOLD,
		"lives": Balance.START_LIVES,
		"max_lives": Balance.START_LIVES,
		"global": {},
		"curse": {},
		"taken": {},
		"unlocked": {},
	}


## Genera las opciones de un draft. En oleada de jefe se garantiza al menos una
## carta rara o mejor. Con pocas torres desbloqueadas se reserva el primer hueco
## a un plano: sin arsenal no hay respuesta posible para medio bestiario.
static func draw(rng: Rng, catalog: Array, state: Dictionary, count := 3,
		guarantee_rare := false) -> Array:
	var pool: Array = []
	for c in catalog:
		if c.get("unique", false) and state["taken"].has(c["id"]):
			continue
		if c.has("requires") and not (c["requires"] as Callable).call(state):
			continue
		pool.append(c)

	var force_unlock := int(state["unlocked"].size()) < 5
	if force_unlock:
		var any := false
		for c in pool:
			if c.has("tower"):
				any = true
				break
		force_unlock = any

	var picked: Array = []
	var used := {}
	for i in count:
		if pool.is_empty():
			break
		var want_unlock := force_unlock and i == 0
		var want_rare := guarantee_rare and i == 0 and not want_unlock
		var weights: Array = []
		for c in pool:
			if used.has(c["id"]):
				weights.append(0.0)
				continue
			if want_unlock:
				weights.append(1.0 if c.has("tower") else 0.0)
				continue
			var w: float = float(RARITY[c["rarity"]]["weight"]) * float(c.get("weight_bonus", 1.0))
			# Épicas y pactos ganan peso a medida que avanza la partida.
			var sector := int(state.get("sector", 1))
			if c["rarity"] == "epic":
				w *= 0.4 + float(sector) * 0.18
			if c["rarity"] == "curse":
				w *= 0.5 + float(sector) * 0.12
			if want_rare and c["rarity"] == "common":
				w = 0.0
			weights.append(w)

		var total := 0.0
		for w in weights:
			total += w
		if total <= 0.0:
			break
		var chosen: Dictionary = pool[rng.weighted(weights)]
		used[chosen["id"]] = true
		picked.append(chosen)
	return picked


## Aplica una carta al estado y la marca si es única.
static func apply(card: Dictionary, state: Dictionary) -> void:
	(card["apply"] as Callable).call(state)
	if card.get("unique", false):
		state["taken"][card["id"]] = true
