class_name EnemyView
extends MultiMeshInstance3D

## Dibuja a todos los enemigos vivos en una sola llamada. El color de instancia
## identifica la especie y marca los estados (impacto, ralentizado, envenenado).

const CAPACITY := 512


func _ready() -> void:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	var caps := CapsuleMesh.new()
	caps.radius = 0.34
	caps.height = 1.1
	mm.mesh = caps
	mm.instance_count = CAPACITY
	mm.visible_instance_count = 0
	multimesh = mm

	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.roughness = 0.68
	material_override = mat
	custom_aabb = AABB(Vector3(-500, -50, -500), Vector3(1000, 100, 1000))


func draw_enemies(list: Array) -> void:
	var n: int = mini(list.size(), CAPACITY)
	multimesh.visible_instance_count = n
	for i in n:
		var e = list[i]
		# Bamboleo de marcha ligado a la velocidad real: los ralentizados también
		# se mueven a cámara lenta en vez de seguir agitándose igual.
		var bounce: float = absf(sin(e.gait))
		var s: float = e.size * 1.45
		var basis := Basis(Vector3.UP, e.heading).scaled(
			Vector3(s * (1.0 - bounce * 0.05), s * (1.0 + bounce * 0.10), s * (1.0 - bounce * 0.05)))
		multimesh.set_instance_transform(i,
			Transform3D(basis, Vector3(e.x, e.y + 0.55 * s + bounce * 0.09 * s, e.z)))

		var col: Color = (e.def.get("color", Color.WHITE) as Color).srgb_to_linear()
		if e.hit_flash > 0.0:
			col = Color(2.0, 2.0, 2.0)
		elif e.slow > 0.05:
			col = Color(col.r * 0.6, col.g * 0.9, col.b * 1.7)
		elif float(e.dot["poison"]) > 0.0:
			col = Color(col.r * 0.7, col.g * 1.5, col.b * 0.6)
		multimesh.set_instance_color(i, col)
