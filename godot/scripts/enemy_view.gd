class_name EnemyView
extends Node3D

## Dibuja a los enemigos: un lote por especie para el cuerpo y otro para las
## extremidades, que van aparte para poder animarlas.
##
## El color de instancia no reemplaza al del modelo, lo tiñe. Así el Soldado
## sigue teniendo su cuero, su metal y su piel, y a la vez se distingue de un
## Bruto a simple vista. Los estados —impacto, ralentizado, envenenado, ardiendo—
## se marcan sobre ese mismo tinte.

const EnemyModelsScript = preload("res://scripts/enemy_models.gd")
const CAPACITY := 400  ## por especie; las extremidades van al doble

var _bodies: Array = []
var _limbs: Array = []
var _models: Array = []


func _ready() -> void:
	_models = EnemyModelsScript.build_all()
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.roughness = 0.68
	mat.metallic = 0.18

	for m in _models:
		_bodies.append(_batch(m["body"], mat, CAPACITY))
		_limbs.append(_batch(m["limb"], mat, CAPACITY * 2))


func _batch(mesh: Mesh, mat: Material, capacity: int) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.mesh = mesh
	mm.instance_count = capacity
	mm.visible_instance_count = 0

	var mmi := MultiMeshInstance3D.new()
	mmi.multimesh = mm
	mmi.material_override = mat
	# Recuadro fijo y generoso: los enemigos recorren todo el mapa y recalcular
	# el volumen cada frame costaría más que dibujarlos.
	mmi.custom_aabb = AABB(Vector3(-500, -50, -500), Vector3(1000, 100, 1000))
	add_child(mmi)
	return mmi


func draw_enemies(list: Array) -> void:
	var counts := []
	var limb_counts := []
	for i in _models.size():
		counts.append(0)
		limb_counts.append(0)

	for e in list:
		if not e.alive:
			continue
		var shape: int = clampi(int(e.def.get("shape", 0)), 0, _models.size() - 1)
		var bi: int = counts[shape]
		if bi >= CAPACITY:
			continue
		var model: Dictionary = _models[shape]

		# Los enemigos van algo sobreescalados respecto a la casilla: a tamaño
		# "realista" son puntitos indistinguibles con la cámara alejada.
		var s: float = e.size * 1.45
		var gait: float = e.gait
		var swing: float = sin(gait)
		var bounce: float = absf(swing)
		var col := _tint(e)

		# El cuerpo se aplasta y estira al ritmo de la zancada: basta para que la
		# horda no parezca un montón de piezas deslizándose por el suelo.
		var body_basis := Basis(Vector3.UP, e.heading).scaled(Vector3(
			s * (1.0 - bounce * 0.05), s * (1.0 + bounce * 0.10), s * (1.0 - bounce * 0.05)))
		var at := Vector3(e.x, e.y + bounce * 0.09 * s, e.z)
		_bodies[shape].multimesh.set_instance_transform(bi, Transform3D(body_basis, at))
		_bodies[shape].multimesh.set_instance_color(bi, col)
		counts[shape] = bi + 1

		# Dos extremidades por criatura, en contrafase. Las piernas rotan sobre
		# el eje X —zancada— y las alas sobre el Z —aleteo—, que es lo que
		# distingue a un bípedo de algo que vuela.
		var li: int = limb_counts[shape]
		if li + 2 > CAPACITY * 2:
			continue
		var offset: Vector3 = model["limb_at"]
		var is_wing: bool = model["kind"] == "wing"
		for side in [-1.0, 1.0]:
			var phase: float = swing * side
			var local := Vector3(offset.x * side, offset.y, offset.z) * s
			var rot: Basis
			if is_wing:
				# El aleteo es simétrico: las dos alas suben y bajan a la vez.
				rot = Basis(Vector3.FORWARD, absf(swing) * 0.9 * side) \
					.scaled(Vector3(side * s, s, s))
			else:
				rot = Basis(Vector3.RIGHT, phase * 0.7).scaled(Vector3(s, s, s))
			var world := Basis(Vector3.UP, e.heading)
			var pos := at + world * local
			_limbs[shape].multimesh.set_instance_transform(li,
				Transform3D(world * rot, pos))
			_limbs[shape].multimesh.set_instance_color(li, col)
			li += 1
		limb_counts[shape] = li

	for i in _models.size():
		_bodies[i].multimesh.visible_instance_count = counts[i]
		_limbs[i].multimesh.visible_instance_count = limb_counts[i]


## Tinte de especie y estado. El color del enemigo no sustituye al del modelo:
## se mezcla con blanco para no borrar el metal, el cuero y la piel horneados
## en la geometría.
func _tint(e) -> Color:
	var c: Color = (e.def.get("color", Color.WHITE) as Color).srgb_to_linear()
	var r: float = 0.58 + c.r * 0.82
	var g: float = 0.58 + c.g * 0.82
	var b: float = 0.58 + c.b * 0.82
	if e.hit_flash > 0.0:
		return Color(2.4, 2.4, 2.4)
	if e.slow > 0.05:
		return Color(r * 0.6, g * 0.9, b * 1.7)
	if float(e.dot["poison"]) > 0.0:
		return Color(r * 0.7, g * 1.5, b * 0.6)
	if float(e.dot["burn"]) > 0.0:
		return Color(r * 1.7, g * 0.85, b * 0.4)
	return Color(r, g, b)
