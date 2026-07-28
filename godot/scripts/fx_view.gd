class_name FXView
extends Node3D

## Partículas y destellos.
##
## El campo de batalla no dibuja nada: va apuntando en una lista qué ha pasado
## —un impacto aquí, una explosión allá, un rayo entre estos dos puntos— y aquí
## se convierte en algo visible. Esa separación es la que permite simular
## partidas enteras en headless: si nadie lee la lista, no pasa nada.
##
## Las partículas se simulan a mano en vez de usar GPUParticles3D porque hacen
## falta a ráfagas, en posiciones que decide el juego, y con un sistema de
## partículas del motor habría que crear y destruir emisores constantemente.

const CAPACITY := 3000
const GRAVITY := 9.0

var _quads: MultiMeshInstance3D
var _beams: MultiMeshInstance3D
## Cada partícula: posición, velocidad, vida restante, vida total, tamaño y color.
var _live: Array = []
var _beam_list: Array = []


func _ready() -> void:
	_quads = _make(_quad_mesh(), CAPACITY)
	_beams = _make(BoxMesh.new(), 256)


func _make(mesh: Mesh, capacity: int) -> MultiMeshInstance3D:
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	# Mezcla aditiva: los destellos suman luz en vez de tapar lo que hay detrás,
	# que es lo que hace que un impacto parezca un fogonazo y no una pegatina.
	mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.vertex_color_is_srgb = false
	if mesh is QuadMesh:
		mat.billboard_mode = BaseMaterial3D.BILLBOARD_PARTICLES
		mat.particles_anim_h_frames = 1
		mat.particles_anim_v_frames = 1

	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.mesh = mesh
	mm.instance_count = capacity
	mm.visible_instance_count = 0

	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.material_override = mat
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mmi.custom_aabb = AABB(Vector3(-500, -50, -500), Vector3(1000, 100, 1000))
	add_child(mmi)
	return mmi


func _quad_mesh() -> QuadMesh:
	var q := QuadMesh.new()
	q.size = Vector2.ONE
	return q


# --- Emisión ----------------------------------------------------------------

## Consume la lista de sucesos del campo de batalla.
func consume(battle) -> void:
	for e in battle.fx:
		match e["kind"]:
			"spark":
				_burst(e["pos"], e["color"], 7, 5.0, 0.24, 0.30)
			"boom":
				var r: float = float(e["radius"])
				_burst(e["pos"], e["color"], int(10 + r * 5.0), 3.0 + r * 2.0,
					0.45, 0.22 + r * 0.10)
				# Núcleo brillante de la explosión: una sola partícula grande y
				# corta que da el golpe de luz.
				_add(e["pos"], Vector3.ZERO, 0.16, r * 0.9, Color(1, 1, 1))
			"death":
				var s: float = float(e["size"])
				_burst(e["pos"], e["color"], int(8 + s * 12.0), 4.0 + s * 4.0,
					0.42, 0.22 + s * 0.20)
			"beam":
				_beam_list.append({
					"from": e["from"], "to": e["to"], "color": e["color"],
					"width": float(e.get("width", 0.14)), "life": 0.08, "max": 0.08,
				})


func _burst(at: Vector3, color: Color, count: int, speed: float,
		life: float, size: float) -> void:
	for i in count:
		# Dirección uniforme sobre la esfera, sesgada hacia arriba: hacia abajo
		# las partículas se meten dentro del terreno y no se ven.
		var dir := Vector3(randf() - 0.5, randf() * 0.9, randf() - 0.5).normalized()
		_add(at, dir * speed * (0.5 + randf() * 0.8),
			life * (0.7 + randf() * 0.6), size, color)


func _add(at: Vector3, vel: Vector3, life: float, size: float, color: Color) -> void:
	if _live.size() >= CAPACITY:
		return
	_live.append({"pos": at, "vel": vel, "life": life, "max": life,
		"size": size, "color": color})


# --- Simulación y dibujo -----------------------------------------------------

func _process(delta: float) -> void:
	_step(delta)
	_draw()


func _step(delta: float) -> void:
	for i in range(_live.size() - 1, -1, -1):
		var p: Dictionary = _live[i]
		p["life"] = float(p["life"]) - delta
		if float(p["life"]) <= 0.0:
			_live.remove_at(i)
			continue
		var v: Vector3 = p["vel"]
		v.y -= GRAVITY * delta
		# Rozamiento: sin él las chispas salen disparadas en línea recta y
		# parecen confeti, no impactos.
		v *= 1.0 - minf(1.0, delta * 3.0)
		p["vel"] = v
		p["pos"] = (p["pos"] as Vector3) + v * delta

	for i in range(_beam_list.size() - 1, -1, -1):
		_beam_list[i]["life"] = float(_beam_list[i]["life"]) - delta
		if float(_beam_list[i]["life"]) <= 0.0:
			_beam_list.remove_at(i)


func _draw() -> void:
	var mm := _quads.multimesh
	mm.visible_instance_count = _live.size()
	for i in _live.size():
		var p: Dictionary = _live[i]
		var k: float = float(p["life"]) / maxf(0.001, float(p["max"]))
		# Encoge y se apaga a la vez: con sólo el desvanecido queda un cuadrado
		# gris flotando al final de la vida.
		var s: float = float(p["size"]) * (0.35 + k * 0.65)
		mm.set_instance_transform(i,
			Transform3D(Basis().scaled(Vector3(s, s, s)), p["pos"]))
		var c: Color = p["color"]
		mm.set_instance_color(i, Color(c.r, c.g, c.b, 1.0) * k)

	var bm := _beams.multimesh
	bm.visible_instance_count = _beam_list.size()
	for i in _beam_list.size():
		var b: Dictionary = _beam_list[i]
		var from: Vector3 = b["from"]
		var to: Vector3 = b["to"]
		var mid := (from + to) * 0.5
		var d := to - from
		var len := d.length()
		if len < 0.001:
			bm.set_instance_transform(i, Transform3D())
			continue
		var w: float = float(b["width"]) * (float(b["life"]) / float(b["max"]))
		var basis := Basis.looking_at(d).scaled(Vector3(w, w, len))
		bm.set_instance_transform(i, Transform3D(basis, mid))
		var c: Color = b["color"]
		bm.set_instance_color(i, Color(c.r, c.g, c.b, 1.0) * 2.0)


func clear() -> void:
	_live.clear()
	_beam_list.clear()
