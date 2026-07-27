extends SceneTree

## Comprobaciones del modelo de daño en tres capas, sin abrir ventana.
##   godot --headless --script tests/test_combat.gd

const EnemyScript = preload("res://scripts/game/enemy.gd")
const BalanceScript = preload("res://scripts/game/balance.gd")

var checks := 0
var failures := 0


func ok(cond: bool, msg: String) -> void:
	checks += 1
	if not cond:
		failures += 1
		printerr("  ✗ ", msg)


class FakeCell extends RefCounted:
	var wx := 0.0
	var wz := 0.0
	var wy := 0.0
	func _init(a := 0.0, b := 0.0) -> void:
		wx = a
		wz = b


class FakeRoute extends RefCounted:
	var cells: Array = []


## Depósitos normalizados a 100 para razonar con números redondos, sin depender
## de la curva de escalado por oleada.
func make_enemy() -> Enemy:
	var r := FakeRoute.new()
	r.cells = [FakeCell.new(0, 0), FakeCell.new(2, 0)]
	var d := {"hp": 100, "armor": 100, "shield": 100, "speed": 1.0, "gold": 1, "size": 1.0}
	var e: Enemy = EnemyScript.new().spawn(d, r, 1, 1, 0.0)
	e.health = 100.0
	e.max_health = 100.0
	e.armor = 100.0
	e.max_armor = 100.0
	e.shield = 100.0
	e.max_shield = 100.0
	return e


func _init() -> void:
	var one := {"h": 1.0, "a": 1.0, "s": 1.0}

	# El daño entra por el escudo y no toca las capas inferiores.
	var e := make_enemy()
	e.damage(50.0, one)
	ok(is_equal_approx(e.shield, 50.0) and is_equal_approx(e.armor, 100.0) \
		and is_equal_approx(e.health, 100.0), "el daño no respetó el orden de capas")

	# Un multiplicador alto contra escudo lo rompe antes; el sobrante pasa a
	# armadura reconvertido a daño base, sin desperdiciarse ni duplicarse.
	e = make_enemy()
	e.damage(100.0, {"h": 1.0, "a": 1.0, "s": 2.0})
	ok(is_equal_approx(e.shield, 0.0), "el escudo debería haberse roto")
	ok(absf(e.armor - 50.0) < 0.001, "sobrante mal convertido: armadura %f" % e.armor)

	# Un golpe enorme atraviesa las tres capas y mata.
	e = make_enemy()
	e.damage(1000.0, one)
	ok(not e.alive and e.health <= 0.0, "un golpe letal no mató al enemigo")

	# El multiplicador de una capa no afecta a las demás.
	e = make_enemy()
	e.damage(100.0, one)
	e.damage(10.0, {"h": 1.0, "a": 0.5, "s": 1.0})
	ok(absf(e.armor - 95.0) < 0.001, "multiplicador de armadura mal aplicado: %f" % e.armor)

	# La ralentización se acumula hasta el tope y decae con el tiempo.
	e = make_enemy()
	for i in 20:
		e.apply_slow(0.1)
	ok(e.slow <= BalanceScript.SLOW_CAP + 0.0001, "la ralentización superó el tope: %f" % e.slow)
	var before := e.slow
	e.update(1.0)
	ok(e.slow < before, "la ralentización no decae")

	# El veneno drena su depósito y termina matando.
	e = make_enemy()
	e.apply_dot("poison", 500.0)
	var guard := 0
	while e.alive and guard < 600:
		e.update(1.0 / 60.0)
		guard += 1
	ok(not e.alive, "el veneno no llegó a matar")

	# La hemorragia bloquea la regeneración de salud, no la de armadura.
	ok(EnemyScript.DOT_BLOCKS["bleed"] == "health", "la hemorragia no bloquea la salud")
	ok(EnemyScript.DOT_AFFINITY["poison"]["s"] == 1.0, "el veneno no es afín al escudo")
	ok(EnemyScript.DOT_AFFINITY["poison"]["h"] == 0.5, "el veneno debería hacer media a la salud")

	# Escalado: la dificultad tiene que crecer de forma monótona.
	var prev := 0.0
	var grows := true
	for w in range(1, 60):
		var s: float = BalanceScript.hp_scale(w, BalanceScript.sector_of(w))
		if s < prev:
			grows = false
		prev = s
	ok(grows, "la curva de vida no crece de forma monótona")
	ok(BalanceScript.hp_scale(40, 8) > BalanceScript.hp_scale(20, 4) * 3.0,
		"la curva se aplana demasiado en oleadas altas")
	ok(BalanceScript.is_boss_wave(10) and not BalanceScript.is_boss_wave(11),
		"las oleadas de jefe no caen donde deben")
	ok(BalanceScript.sector_of(1) == 1 and BalanceScript.sector_of(6) == 2,
		"el sector no se calcula bien")

	if failures == 0:
		print("✓ %d comprobaciones correctas" % checks)
	else:
		printerr("✗ %d de %d fallaron" % [failures, checks])
	quit(1 if failures > 0 else 0)
