class_name BattleView
extends Node3D

## Dibuja torres y proyectiles.
##
## Todo va en tres MultiMesh —bases, cabezas y proyectiles— en vez de un nodo
## por torre. Con el mapa lleno hay cientos de torres, y cada una como escena
## propia son cientos de nodos que Godot recorre y ordena cada frame. Aquí son
## tres llamadas de dibujo pase lo que pase.
##
## Las formas todavía son primitivas: el tipo de torre se distingue por color.
## Las piezas modeladas vienen después; esto ya permite jugar y ver qué dispara.

var _bases: MultiMeshInstance3D
var _heads: MultiMeshInstance3D
var _shots: MultiMeshInstance3D


func _ready() -> void:
	_bases = _make(_cylinder(0.62, 0.75), false)
	_heads = _make(_head_mesh(), false)
	# Los proyectiles no proyectan sombra ni la reciben: son destellos, y
	# calcularles sombra a cientos por segundo no aporta nada visible.
	_shots = _make(SphereMesh.new(), true)


func _make(mesh: Mesh, unshaded: bool) -> MultiMeshInstance3D:
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	if unshaded:
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	else:
		mat.roughness = 0.55
		mat.metallic = 0.25

	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.mesh = mesh
	mm.instance_count = 0

	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.material_override = mat
	if unshaded:
		mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mmi)
	return mmi


func _cylinder(radius: float, height: float) -> CylinderMesh:
	var c := CylinderMesh.new()
	c.top_radius = radius
	c.bottom_radius = radius * 1.15
	c.height = height
	c.radial_segments = 8
	c.rings = 1
	return c


## Cabeza con el cañón hacia +Z. La torre apunta con atan2(dx, dz), que orienta
## el +Z del modelo hacia el objetivo: modelarla al revés hace que todas las
## torres disparen de espaldas, que es exactamente lo que pasó en la versión web.
func _head_mesh() -> BoxMesh:
	var b := BoxMesh.new()
	b.size = Vector3(0.5, 0.42, 1.25)
	return b


func draw(battle) -> void:
	_draw_towers(battle)
	_draw_shots(battle)


func _draw_towers(battle) -> void:
	var towers: Array = battle.towers
	var bm := _bases.multimesh
	var hm := _heads.multimesh
	bm.instance_count = towers.size()
	hm.instance_count = towers.size()
	if towers.is_empty():
		return

	var lo := Vector3(INF, INF, INF)
	var hi := Vector3(-INF, -INF, -INF)
	for i in towers.size():
		var t = towers[i]
		var lvl: int = mini(t.total_level, 24)
		# Las torres mejoradas crecen y aclaran: se lee su nivel de un vistazo,
		# sin tener que seleccionarlas.
		var grow: float = 1.0 + float(lvl) * 0.016
		var pos := Vector3(t.x, t.y, t.z)

		bm.set_instance_transform(i, Transform3D(
			Basis().scaled(Vector3(grow, grow, grow)), pos + Vector3(0, 0.37, 0)))
		bm.set_instance_color(i, (t.def["color"] as Color).srgb_to_linear())

		# Retroceso: la cabeza se echa atrás y se achata al disparar.
		var back: float = t.recoil * 0.22
		var squash: float = 1.0 - t.recoil * 0.13
		var basis := Basis(Vector3.UP, t.angle).scaled(
			Vector3(grow * (2.0 - squash), grow * squash, grow * (2.0 - squash)))
		hm.set_instance_transform(i, Transform3D(basis, pos + Vector3(
			-sin(t.angle) * back, 0.9, -cos(t.angle) * back)))
		var accent: Color = (t.def["accent"] as Color).srgb_to_linear()
		var tint: float = 1.0 + float(lvl) * 0.018 + t.recoil * 0.5
		hm.set_instance_color(i, Color(accent.r * tint, accent.g * tint, accent.b * tint))

		lo = lo.min(pos - Vector3(2, 2, 2))
		hi = hi.max(pos + Vector3(2, 3, 2))

	_bases.custom_aabb = AABB(lo, hi - lo)
	_heads.custom_aabb = AABB(lo, hi - lo)


func _draw_shots(battle) -> void:
	var list: Array = battle.projectiles
	var mm := _shots.multimesh
	mm.instance_count = list.size()
	if list.is_empty():
		return

	var lo := Vector3(INF, INF, INF)
	var hi := Vector3(-INF, -INF, -INF)
	for i in list.size():
		var p: Dictionary = list[i]
		var pos := Vector3(float(p["x"]), float(p["y"]), float(p["z"]))
		# Los que atraviesan filas se dibujan alargados en su dirección: se ve
		# la línea de tiro, no un punto que aparece y desaparece.
		var s: float = float(p["size"])
		var basis := Basis().scaled(Vector3(s, s, s * (3.0 if p["type"] == "pierce" else 1.0)))
		if p["type"] == "pierce":
			var dir := Vector3(float(p["vx"]), float(p["vy"]), float(p["vz"]))
			if dir.length_squared() > 0.0001:
				basis = Basis.looking_at(dir).scaled(Vector3(s, s, s * 3.0))
		mm.set_instance_transform(i, Transform3D(basis, pos))
		mm.set_instance_color(i, (p["color"] as Color).srgb_to_linear() * 2.2)
		lo = lo.min(pos - Vector3.ONE)
		hi = hi.max(pos + Vector3.ONE)

	_shots.custom_aabb = AABB(lo, hi - lo)
