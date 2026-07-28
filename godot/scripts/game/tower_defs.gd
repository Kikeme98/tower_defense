class_name TowerDefs
extends RefCounted

## Catálogo de torres.
##
## `vs` es el multiplicador de daño contra cada capa del enemigo: h = salud,
## a = armadura, s = escudo. Ninguna torre es buena contra todo, y por eso la
## composición de la defensa importa más que el daño bruto.
##
## `cost` es el precio de la primera; `price_step` cuánto sube por cada torre de
## ese mismo tipo ya construida, para que llenar el mapa de la más rentable deje
## de ser la respuesta correcta a todo.
##
## `proj_speed` importa para el juego, no sólo para la vista: los proyectiles
## lentos disparan a la posición predicha del enemigo y pueden fallar.

const LIST := [
	{"id": "crossbow", "name": "Ballesta", "cost": 55, "price_step": 14, "unlock": false,
	 "range": 9.0, "damage": 15.0, "fire_rate": 1.5, "targets": "both", "proj_speed": 45.0,
	 "color": Color8(0x8a, 0x6b, 0x4a), "accent": Color8(0xd9, 0xc4, 0x8a),
	 "vs": {"h": 1.3, "a": 0.5, "s": 0.6}, "special": "pierce",
	 "desc": "Barata y fiable. Excelente contra salud, inútil contra blindados."},
	{"id": "cannon", "name": "Cañón", "cost": 110, "price_step": 32, "unlock": false,
	 "range": 8.5, "damage": 44.0, "fire_rate": 0.55, "targets": "ground", "splash": 2.6,
	 "proj_speed": 32.0, "color": Color8(0x4a, 0x4a, 0x52), "accent": Color8(0xff, 0x8a, 0x3a),
	 "vs": {"h": 0.9, "a": 1.7, "s": 0.4}, "special": "splash",
	 "desc": "Rompe armaduras en área. Lento y sin efecto sobre escudos."},
	{"id": "frost", "name": "Glaciar", "cost": 95, "price_step": 26, "unlock": false,
	 "range": 7.5, "damage": 8.0, "fire_rate": 1.1, "targets": "both", "splash": 3.2,
	 "proj_speed": 30.0, "color": Color8(0x3a, 0x7e, 0xa8), "accent": Color8(0x9f, 0xe8, 0xff),
	 "slow": 0.14, "vs": {"h": 0.8, "a": 0.8, "s": 1.1}, "special": "freeze",
	 "desc": "Poco daño, pero ralentiza en área."},
	{"id": "tesla", "name": "Bobina Tesla", "cost": 165, "price_step": 48, "unlock": true,
	 "range": 7.0, "damage": 24.0, "fire_rate": 1.0, "targets": "both",
	 "color": Color8(0x5b, 0x4a, 0x8a), "accent": Color8(0x9f, 0xd8, 0xff),
	 "chain": {"count": 3, "falloff": 0.72}, "vs": {"h": 0.5, "a": 0.4, "s": 2.0},
	 "special": "chain", "desc": "Rayo que salta entre enemigos. Demoledora contra escudos."},
	{"id": "venom", "name": "Escupidor", "cost": 130, "price_step": 36, "unlock": true,
	 "range": 8.0, "damage": 10.0, "fire_rate": 1.3, "targets": "ground", "proj_speed": 26.0,
	 "color": Color8(0x3f, 0x6b, 0x3a), "accent": Color8(0xb6, 0xff, 0x5a),
	 "dot": {"type": "poison", "factor": 2.6}, "vs": {"h": 0.7, "a": 0.5, "s": 1.0},
	 "special": "dot", "desc": "Veneno persistente que bloquea la regeneración de escudo."},
	{"id": "mortar", "name": "Mortero", "cost": 190, "price_step": 55, "unlock": true,
	 "range": 22.0, "min_range": 6.0, "damage": 66.0, "fire_rate": 0.3, "targets": "ground",
	 "splash": 3.6, "arc": true, "proj_speed": 20.0,
	 "color": Color8(0x6b, 0x5a, 0x3a), "accent": Color8(0xff, 0xd0, 0x6b),
	 "vs": {"h": 1.0, "a": 1.6, "s": 0.5}, "special": "salvo",
	 "desc": "Alcance enorme, pero incapaz de disparar de cerca."},
	{"id": "flak", "name": "Flak", "cost": 145, "price_step": 40, "unlock": true,
	 "range": 11.0, "damage": 32.0, "fire_rate": 1.8, "targets": "air", "splash": 2.0,
	 "proj_speed": 60.0, "color": Color8(0x7a, 0x3a, 0x3a), "accent": Color8(0xff, 0xb0, 0x3a),
	 "vs": {"h": 1.3, "a": 1.0, "s": 1.0}, "special": "flak",
	 "desc": "Sólo antiaérea, pero devastadora."},
	{"id": "beam", "name": "Prisma", "cost": 220, "price_step": 62, "unlock": true,
	 "range": 10.0, "damage": 26.0, "fire_rate": 8.0, "targets": "both", "beam": true,
	 "ramp_up": {"max": 3.0, "per_sec": 0.8}, "dot": {"type": "burn", "factor": 0.5},
	 "color": Color8(0x8a, 0x3a, 0x7a), "accent": Color8(0xff, 0x6b, 0xd8),
	 "vs": {"h": 0.6, "a": 1.7, "s": 0.8}, "special": "ramp",
	 "desc": "Rayo continuo que funde armaduras y quema."},
	{"id": "ballista", "name": "Balista", "cost": 260, "price_step": 75, "unlock": true,
	 "range": 15.0, "damage": 145.0, "fire_rate": 0.28, "targets": "both", "pierce": 3,
	 "proj_speed": 70.0, "color": Color8(0x5a, 0x4a, 0x3a), "accent": Color8(0xff, 0xe0, 0x8a),
	 "dot": {"type": "bleed", "factor": 0.6}, "vs": {"h": 1.6, "a": 0.9, "s": 0.5},
	 "special": "pierce", "desc": "Virote gigante que atraviesa filas y provoca hemorragia."},
	{"id": "pylon", "name": "Pilón", "cost": 175, "price_step": 90, "unlock": true,
	 "range": 7.0, "damage": 0.0, "fire_rate": 0.0, "targets": "none",
	 "color": Color8(0xb0, 0x8a, 0x3a), "accent": Color8(0xff, 0xe9, 0xa8),
	 "aura": {"damage": 1.22, "fire_rate": 1.15, "range": 1.10},
	 "vs": {"h": 1.0, "a": 1.0, "s": 1.0}, "special": "aura",
	 "desc": "No dispara: potencia a las torres de su radio."},
	{"id": "harpoon", "name": "Arpón", "cost": 120, "price_step": 34, "unlock": true,
	 "amphibious": true, "range": 10.0, "damage": 36.0, "fire_rate": 0.9, "proj_speed": 40.0,
	 "color": Color8(0x2c, 0x6e, 0x8a), "accent": Color8(0x8a, 0xe8, 0xff),
	 "targets": "ground", "slow": 0.10, "vs": {"h": 1.0, "a": 1.1, "s": 1.1},
	 "special": "reel", "desc": "La única torre que se construye sobre agua."},
]

## Líneas de mejora comunes. El coste crece de forma aritmética, no exponencial:
## subir mucho una torre debe seguir siendo viable en la oleada 40.
const PATHS := [
	{"id": "damage", "name": "Daño", "mult": 1.26, "cost_mult": 0.5, "max": 12},
	{"id": "range", "name": "Alcance", "mult": 1.12, "cost_mult": 0.4, "max": 8},
	{"id": "fire_rate", "name": "Cadencia", "mult": 1.18, "cost_mult": 0.55, "max": 12},
	{"id": "special", "name": "Especial", "mult": 1.0, "cost_mult": 1.0, "max": 5},
]


static func by_id(id: String) -> Dictionary:
	for d in LIST:
		if d["id"] == id:
			return d
	return {}
