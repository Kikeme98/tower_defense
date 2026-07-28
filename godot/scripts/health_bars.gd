class_name HealthBars
extends MultiMeshInstance3D

## Barras de vida sobre los enemigos, una por cada capa que tengan.
##
## Son imprescindibles, no decorativas. Con tres depósitos —escudo, armadura y
## salud— que se vacían en orden y que cada torre daña de forma distinta, sin
## verlos el jugador no tiene forma de saber por qué su cañón no le hace nada al
## Égida. Las barras son la explicación.
##
## El orden vertical es siempre el mismo (escudo arriba, armadura en medio,
## salud abajo) y nunca cambia: la posición identifica la capa, así que quien no
## distinga el azul del gris sigue sabiendo cuál se está vaciando.

const CAPACITY := 2048  ## cuatro barras por enemigo, con margen

const W := 1.05    ## ancho de la barra en unidades de mundo
const H := 0.11    ## alto de cada barra
const STEP := 0.15 ## separación vertical entre capas

const COL_SHIELD := Color(0.42, 0.72, 1.0)
const COL_ARMOR := Color(0.78, 0.80, 0.84)
const COL_HEALTH := Color(0.42, 0.85, 0.45)
const COL_BACK := Color(0.03, 0.03, 0.05)


func _ready() -> void:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	var quad := QuadMesh.new()
	quad.size = Vector2.ONE
	mm.mesh = quad
	mm.instance_count = CAPACITY
	mm.visible_instance_count = 0
	multimesh = mm

	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	# Sin sombreado: una barra de vida es información, no un objeto del mundo, y
	# no debe oscurecerse porque el enemigo pase por una zona en sombra.
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	# Siempre de cara a la cámara y siempre visible por encima del terreno.
	mat.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	mat.billboard_keep_scale = true
	mat.no_depth_test = true
	material_override = mat
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# El recuadro se fija de una vez: las barras siguen a los enemigos por todo
	# el mapa y recalcularlo cada frame no compensa.
	custom_aabb = AABB(Vector3(-500, -50, -500), Vector3(1000, 100, 1000))


func draw(list: Array) -> void:
	var i := 0
	for e in list:
		if not e.alive:
			continue
		# Los que están intactos no llevan barra: con la oleada entera marcada,
		# el mapa se convierte en una pared de rectángulos y deja de informar.
		if e.health >= e.max_health and e.armor >= e.max_armor and e.shield >= e.max_shield:
			continue

		var top: float = e.y + e.size * 1.9 + 0.5
		var layers := [
			[e.shield, e.max_shield, COL_SHIELD],
			[e.armor, e.max_armor, COL_ARMOR],
			[e.health, e.max_health, COL_HEALTH],
		]
		for layer in layers:
			var mx: float = layer[1]
			if mx <= 0.0:
				continue
			if i + 2 > CAPACITY:
				return
			var frac: float = clampf(float(layer[0]) / mx, 0.0, 1.0)
			var at := Vector3(e.x, top, e.z)
			# Fondo primero, relleno encima y un pelo más cerca de la cámara:
			# así se ve cuánto falta, no sólo cuánto queda.
			_put(i, at, W, H, COL_BACK)
			i += 1
			# El relleno se ancla a la izquierda escalando y desplazando medio
			# ancho: un quad escalado desde el centro encogería por los dos lados.
			_put(i, at + Vector3(-W * (1.0 - frac) * 0.5, 0, 0.01), W * frac, H * 0.78,
				layer[2])
			i += 1
			top -= STEP

	multimesh.visible_instance_count = i


func _put(i: int, at: Vector3, w: float, h: float, color: Color) -> void:
	multimesh.set_instance_transform(i,
		Transform3D(Basis().scaled(Vector3(w, h, 1.0)), at))
	multimesh.set_instance_color(i, color)
