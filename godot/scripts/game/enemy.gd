class_name Enemy
extends RefCounted

## Modelo de daño en tres capas (idea tomada de Rogue Tower): cada enemigo tiene
## ESCUDO, ARMADURA y SALUD como depósitos separados que se vacían siempre en ese
## orden. Cada torre tiene un multiplicador distinto contra cada capa, así que
## "qué torre construyo" deja de ser "la que más daño hace" y pasa a ser "la que
## rompe lo que viene".
##
## Los tres venenos refuerzan lo mismo: cada uno hace daño completo a su capa
## afín y la mitad a las otras dos, y bloquea la regeneración de la suya.

## Afinidad de cada efecto persistente.
const DOT_AFFINITY := {
	"bleed": {"h": 1.0, "a": 0.5, "s": 0.5},   ## hemorragia: anula regen de salud
	"burn": {"h": 0.5, "a": 1.0, "s": 0.5},    ## fuego: anula regen de armadura
	"poison": {"h": 0.5, "a": 0.5, "s": 1.0},  ## veneno: anula regen de escudo
}
const DOT_BLOCKS := {"bleed": "health", "burn": "armor", "poison": "shield"}

var def: Dictionary
var route
var path: Array = []
var idx := 0
var t := 0.0
var lane := 0.0
var flying := false

var max_health := 0.0
var max_armor := 0.0
var max_shield := 0.0
var health := 0.0
var armor := 0.0
var shield := 0.0

var base_speed := 0.0
var gold := 0
var size := 1.0
var slow := 0.0
var dot := {"bleed": 0.0, "burn": 0.0, "poison": 0.0}
var hit_flash := 0.0
var gait := 0.0
var alive := false
var reached_core := false
var hit_by := {}

var x := 0.0
var y := 0.0
var z := 0.0
var heading := 0.0


func spawn(d: Dictionary, r, wave: int, sector: int, ln: float, mods := {}) -> Enemy:
	def = d
	route = r
	path = r.cells
	idx = 0
	t = 0.0
	lane = ln
	flying = d.get("flying", false)

	var s := Balance.hp_scale(wave, sector) * float(mods.get("hp", 1.0))
	var armor_boost := 1.0 + float(mods.get("armor_boost", 0.0))
	max_health = float(d["hp"]) * s
	max_armor = float(d.get("armor", 0)) * s * armor_boost
	max_shield = float(d.get("shield", 0)) * s * armor_boost
	health = max_health
	armor = max_armor
	shield = max_shield

	base_speed = float(d["speed"]) * (1.0 + float(wave) * Balance.SPEED_PER_WAVE) \
		* float(mods.get("speed", 1.0))
	gold = int(round(float(d["gold"]) * Balance.gold_scale(wave) \
		* (Balance.BOSS_GOLD_MULT if d.get("boss", false) else 1.0) \
		* float(mods.get("gold", 1.0))))
	size = float(d["size"])

	slow = 0.0
	dot = {"bleed": 0.0, "burn": 0.0, "poison": 0.0}
	hit_flash = 0.0
	# Desfase inicial distinto por unidad: si arrancan sincronizados, la oleada
	# entera bota a la vez y parece un solo objeto.
	gait = ln * 9.0
	alive = true
	reached_core = false
	hit_by = {}

	var c0 = path[0]
	x = c0.wx
	z = c0.wz
	y = c0.wy
	return self


var speed: float:
	get: return base_speed * (1.0 - slow)

var total_hp: float:
	get: return health + armor + shield

## Progreso hacia el núcleo en [0,1]: define el objetivo "más avanzado".
var progress: float:
	get: return float(idx) / maxf(1.0, float(path.size() - 1))


## Aplica daño respetando el orden escudo → armadura → salud. `mult` lleva un
## multiplicador por capa; el sobrante al romper una capa pasa a la siguiente
## reconvertido a daño base, de forma que ningún impacto se desperdicia.
func damage(amount: float, mult: Dictionary, tower_id := "") -> float:
	if not alive or amount <= 0.0:
		return 0.0
	if tower_id != "":
		hit_by[tower_id] = true
	var base := amount
	var dealt := 0.0

	for pair in [["shield", "s"], ["armor", "a"], ["health", "h"]]:
		if base <= 0.0:
			break
		var pool: String = pair[0]
		var k: String = pair[1]
		var cur: float = get(pool)
		if cur <= 0.0 and pool != "health":
			continue
		var m := float(mult.get(k, 1.0))
		var applied := base * m
		if applied < cur or pool == "health":
			set(pool, cur - applied)
			dealt += applied
			base = 0.0
		else:
			dealt += cur
			base -= cur / m  # lo que sobra, en unidades de daño base
			set(pool, 0.0)

	hit_flash = 0.12
	if health <= 0.0:
		health = 0.0
		alive = false
	return dealt


## Añade daño a un depósito de veneno; se drena poco a poco.
func apply_dot(kind: String, amount: float) -> void:
	if dot.has(kind):
		dot[kind] += amount


## La ralentización se acumula hasta un tope y decae con el tiempo.
func apply_slow(amount: float) -> void:
	slow = minf(Balance.SLOW_CAP, slow + amount)


func update(dt: float) -> void:
	if slow > 0.0:
		slow = maxf(0.0, slow - Balance.SLOW_DECAY * dt)
	if hit_flash > 0.0:
		hit_flash -= dt
	# Fase de zancada ligada a la velocidad real: los ralentizados también se
	# mueven a cámara lenta en vez de seguir agitándose igual.
	gait += speed * dt * 2.6

	# Venenos: drenan su depósito y bloquean la regeneración de su capa afín.
	for kind in dot.keys():
		var pool: float = dot[kind]
		if pool <= 0.0:
			continue
		var tick: float = minf(pool, maxf(1.0, pool * Balance.DOT_DRAIN) * dt)
		dot[kind] = pool - tick
		damage(tick, DOT_AFFINITY[kind])
		if not alive:
			return

	var regen: Dictionary = def.get("regen", {})
	for pool_name in regen:
		var blocked := false
		for dot_kind in DOT_BLOCKS:
			if DOT_BLOCKS[dot_kind] == pool_name and dot[dot_kind] > 0.0:
				blocked = true
				break
		if blocked:
			continue
		var mx: float = max_health if pool_name == "health" \
			else (max_armor if pool_name == "armor" else max_shield)
		var cur: float = get(pool_name)
		if cur < mx:
			set(pool_name, minf(mx, cur + mx * float(regen[pool_name]) * dt))

	# Marcha por waypoints.
	var step := speed * dt
	var remaining := step
	while remaining > 0.0 and idx < path.size() - 1:
		var a = path[idx]
		var b = path[idx + 1]
		var seg: float = sqrt(pow(b.wx - a.wx, 2.0) + pow(b.wz - a.wz, 2.0))
		if seg <= 0.0:
			seg = Grid.TILE
		var advance := remaining / seg
		if t + advance >= 1.0:
			remaining -= (1.0 - t) * seg
			t = 0.0
			idx += 1
		else:
			t += advance
			remaining = 0.0

	if idx >= path.size() - 1:
		reached_core = true
		alive = false
		return

	var a2 = path[idx]
	var b2 = path[idx + 1]
	var nx: float = b2.wx - a2.wx
	var nz: float = b2.wz - a2.wz
	var ln := sqrt(nx * nx + nz * nz)
	if ln <= 0.0:
		ln = 1.0
	# Desplazamiento lateral: evita que toda la oleada vaya en fila india.
	var px: float = -nz / ln
	var pz: float = nx / ln
	var off := lane * Grid.TILE * 0.3
	x = a2.wx + nx * t + px * off
	z = a2.wz + nz * t + pz * off
	y = a2.wy + (b2.wy - a2.wy) * t
	heading = atan2(nx, nz)
