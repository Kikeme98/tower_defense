class_name EnemyDefs
extends RefCounted

## Bestiario.
##
## `hp`, `armor` y `shield` son valores base que se escalan con la oleada, y las
## tres capas se vacían en orden escudo → armadura → salud. El reparto entre
## ellas es lo que define contra qué torre es duro cada enemigo: el Acorazado
## ignora a la ballesta y el Égida se ríe del cañón.
##
## `from` es la oleada en la que empieza a aparecer, `weight` su frecuencia
## relativa. `regen` va en fracción del máximo de esa capa por segundo, y los
## venenos la bloquean: cada uno anula la regeneración de la capa a la que es afín.

const LIST := [
	{"id": "grunt", "name": "Soldado", "shape": 0, "color": Color8(0xc0, 0x55, 0x4a),
	 "hp": 55, "armor": 0, "shield": 0, "speed": 2.6, "gold": 7, "size": 0.5,
	 "from": 1, "weight": 10},
	{"id": "runner", "name": "Corredor", "shape": 1, "color": Color8(0xe0, 0xa0, 0x3a),
	 "hp": 30, "armor": 0, "shield": 0, "speed": 5.4, "gold": 6, "size": 0.42,
	 "from": 3, "weight": 7},
	# `burst` hace que aparezcan en tanda apretada: el enjambre es una marea, no
	# una fila. Es lo que da sentido al daño en área.
	{"id": "swarm", "name": "Enjambre", "shape": 1, "color": Color8(0xb0, 0xd0, 0x4a),
	 "hp": 18, "armor": 0, "shield": 0, "speed": 4.6, "gold": 3, "size": 0.3,
	 "from": 4, "weight": 6, "burst": 5},
	{"id": "brute", "name": "Bruto", "shape": 2, "color": Color8(0x8a, 0x4a, 0xc0),
	 "hp": 260, "armor": 0, "shield": 0, "speed": 1.7, "gold": 20, "size": 0.78,
	 "from": 5, "weight": 5, "regen": {"health": 0.05}},
	{"id": "flyer", "name": "Aguijón", "shape": 3, "color": Color8(0x4a, 0xc0, 0xb0),
	 "flying": true, "hp": 70, "armor": 0, "shield": 70, "speed": 3.4, "gold": 12,
	 "size": 0.5, "from": 7, "weight": 5},
	{"id": "armored", "name": "Acorazado", "shape": 2, "color": Color8(0x6a, 0x7a, 0x8a),
	 "hp": 70, "armor": 185, "shield": 0, "speed": 2.1, "gold": 18, "size": 0.62,
	 "from": 8, "weight": 5, "regen": {"armor": 0.04}},
	{"id": "shielded", "name": "Égida", "shape": 2, "color": Color8(0x3a, 0x8a, 0xd0),
	 "hp": 90, "armor": 0, "shield": 230, "speed": 2.3, "gold": 26, "size": 0.6,
	 "from": 11, "weight": 5, "regen": {"shield": 0.08}},
	{"id": "healer", "name": "Sanador", "shape": 4, "color": Color8(0x4a, 0xd0, 0x7a),
	 "hp": 140, "armor": 60, "shield": 60, "speed": 2.2, "gold": 26, "size": 0.55,
	 "from": 13, "weight": 3, "heal": {"radius": 7.0, "hps": 0.04}},
	# `dodge` es la única fuente de azar del combate: obliga a no depender de un
	# solo disparo enorme contra los espectros.
	{"id": "wraith", "name": "Espectro", "shape": 3, "color": Color8(0x9a, 0x5a, 0xd0),
	 "flying": true, "hp": 130, "armor": 0, "shield": 190, "speed": 4.2, "gold": 30,
	 "size": 0.55, "from": 16, "weight": 4, "dodge": 0.18},
	{"id": "bulwark", "name": "Baluarte", "shape": 2, "color": Color8(0xd0, 0x8a, 0x3a),
	 "hp": 120, "armor": 290, "shield": 175, "speed": 1.6, "gold": 40, "size": 0.75,
	 "from": 20, "weight": 4, "regen": {"armor": 0.05, "shield": 0.05}, "core_damage": 2},
	{"id": "juggernaut", "name": "Coloso", "shape": 5, "color": Color8(0xd0, 0x4a, 0x4a),
	 "hp": 700, "armor": 500, "shield": 200, "speed": 1.35, "gold": 90, "size": 1.05,
	 "from": 24, "weight": 3, "regen": {"health": 0.04}, "core_damage": 3},
]

const BOSS := {
	"id": "boss", "name": "Titán", "shape": 5, "color": Color8(0xff, 0x3a, 0x5a),
	"hp": 1400, "armor": 900, "shield": 900, "speed": 1.25, "gold": 140, "size": 1.6,
	"boss": true, "regen": {"health": 0.03, "armor": 0.03, "shield": 0.03},
	"core_damage": 6,
}


static func by_id(id: String) -> Dictionary:
	for d in LIST:
		if d["id"] == id:
			return d
	return {}
