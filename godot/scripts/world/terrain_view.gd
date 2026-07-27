class_name TerrainView
extends Node3D

## Vista del terreno.
##
## El mapa se reparte en regiones cuadradas, cada una con su propio MultiMesh.
## Godot descarta por frustum a nivel de nodo, así que partirlo permite dejar
## fuera de golpe las regiones que no se ven, igual que en la versión web. Con un
## único MultiMesh gigante se dibujaría el mapa entero mires donde mires.
##
## MultiMeshInstance3D es el equivalente nativo del lote instanciado que allí
## había que escribir a mano: aquí basta con rellenar transformadas y colores.

const CHUNK := 12  ## lado en casillas de cada región

var _chunks := {}
var _material: StandardMaterial3D
var _box: BoxMesh


func _ready() -> void:
	# Colores por instancia como albedo: un solo material para todo el terreno.
	_material = StandardMaterial3D.new()
	_material.vertex_color_use_as_albedo = true
	_material.roughness = 0.92
	_material.metallic = 0.0

	_box = BoxMesh.new()
	_box.size = Vector3.ONE


func _chunk_at(cx: int, cz: int) -> MultiMeshInstance3D:
	var key := ((cx + 512) << 10) | (cz + 512)
	var mmi: MultiMeshInstance3D = _chunks.get(key)
	if mmi == null:
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true
		mm.mesh = _box
		mm.instance_count = 0

		mmi = MultiMeshInstance3D.new()
		mmi.multimesh = mm
		mmi.material_override = _material
		# Sin esto Godot no sabe qué volumen ocupa y lo descarta mal.
		mmi.custom_aabb = AABB()
		add_child(mmi)
		_chunks[key] = mmi
	return mmi


## Reconstruye la malla a partir del estado de la rejilla.
func build(grid: Grid) -> void:
	# Se agrupan las casillas por región antes de tocar los MultiMesh: hay que
	# saber cuántas instancias tiene cada uno para dimensionarlo de una vez.
	var buckets := {}
	for c in grid.cells.values():
		var cx: int = floori(float(c.x) / float(CHUNK))
		var cz: int = floori(float(c.y) / float(CHUNK))
		var key := ((cx + 512) << 10) | (cz + 512)
		if not buckets.has(key):
			buckets[key] = {"cx": cx, "cz": cz, "cells": []}
		buckets[key]["cells"].append(c)

	# Las regiones que ya no tienen casillas se vacían, no se destruyen: al
	# expandir el mapa vuelven a poblarse enseguida.
	for key in _chunks:
		if not buckets.has(key):
			_chunks[key].multimesh.instance_count = 0

	var size := Grid.TILE * 0.985
	for key in buckets:
		var b = buckets[key]
		var mmi := _chunk_at(b["cx"], b["cz"])
		var mm := mmi.multimesh
		var cells: Array = b["cells"]
		mm.instance_count = cells.size()

		var lo := Vector3(1e9, 1e9, 1e9)
		var hi := Vector3(-1e9, -1e9, -1e9)

		for i in cells.size():
			var c = cells[i]
			var def: Dictionary = Grid.TERRAIN[c.terrain]
			var y: float = c.wy
			# Los bloques bajan hasta una base común: no se ve el vacío debajo.
			var depth: float = y + 6.0
			# El origen del cubo está en su centro, así que se coloca a media
			# altura y se escala hacia abajo desde la superficie.
			var basis := Basis().scaled(Vector3(size, depth, size))
			var pos := Vector3(c.wx, y - depth * 0.5, c.wz)
			mm.set_instance_transform(i, Transform3D(basis, pos))

			# Godot interpreta los colores de instancia en espacio lineal, y los
			# de la paleta están en sRGB: sin convertir salen lavados.
			var col: Color = (def["top"] as Color).srgb_to_linear()
			# Variación por casilla y ligera pérdida de color con la altura.
			var tint: float = c.tint * (1.0 - float(maxi(0, c.height)) * 0.012)
			col = Color(col.r * tint, col.g * tint, col.b * tint, 1.0)
			mm.set_instance_color(i, col)

			lo = lo.min(pos - Vector3(size, depth, size))
			hi = hi.max(pos + Vector3(size, depth, size))

		if cells.size() > 0:
			mmi.custom_aabb = AABB(lo, hi - lo)
