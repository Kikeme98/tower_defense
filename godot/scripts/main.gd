extends Node3D

## Escena de juego. Por ahora monta el mundo generado y lo enseña.
##
## Todo se construye por código en vez de con escenas del editor: permite
## verificar el resultado ejecutando en headless y guardando una captura, sin
## depender de abrir el editor para cada cambio.

const MapGenScript = preload("res://scripts/world/mapgen.gd")
const TerrainViewScript = preload("res://scripts/world/terrain_view.gd")

var map
var terrain: Node3D
var cam: Camera3D


func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	var seed_text := "godot"
	var sectors := 4
	for a in args:
		if a.begins_with("--seed="):
			seed_text = a.substr(7)
		elif a.begins_with("--sectors="):
			sectors = int(a.substr(10))

	map = MapGenScript.new(seed_text).generate_initial()
	for i in sectors:
		map.expand()

	terrain = TerrainViewScript.new()
	add_child(terrain)
	terrain.build(map.grid)

	_setup_world()
	print("mapa: %d casillas · %d rutas · sector %d"
		% [map.grid.cells.size(), map.routes.size(), map.level])


func _setup_world() -> void:
	# Luz clave con sombras, más un relleno del cielo. Misma proporción que en la
	# versión web: la clave manda con holgura o las sombras se lavan.
	var sun := DirectionalLight3D.new()
	sun.light_energy = 1.05
	sun.light_color = Color8(0xff, 0xf2, 0xd8)
	sun.shadow_enabled = true
	sun.rotation_degrees = Vector3(-52, -38, 0)
	add_child(sun)

	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var mat := ProceduralSkyMaterial.new()
	mat.sky_top_color = Color8(0x2a, 0x4a, 0x8a)
	mat.sky_horizon_color = Color8(0x7f, 0xa8, 0xd8)
	mat.ground_bottom_color = Color8(0x2a, 0x33, 0x48)
	mat.ground_horizon_color = Color8(0x7f, 0xa8, 0xd8)
	sky.sky_material = mat
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_sky_contribution = 0.25
	env.ambient_light_energy = 0.5
	env.fog_enabled = true
	env.fog_density = 0.006
	env.fog_light_color = Color8(0x8f, 0xac, 0xcc)
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 0.85

	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)

	cam = Camera3D.new()
	cam.fov = 50.0
	add_child(cam)
	_frame_map()


## Encuadra el mapa entero desde una vista isométrica.
func _frame_map() -> void:
	var r: float = maxf(map.grid.radius, 20.0)
	var dist: float = r * 1.5
	var yaw := deg_to_rad(35.0)
	var pitch := deg_to_rad(48.0)
	cam.position = Vector3(
		sin(yaw) * cos(pitch) * dist,
		sin(pitch) * dist,
		cos(yaw) * cos(pitch) * dist)
	cam.look_at(Vector3.ZERO, Vector3.UP)


func _process(_delta: float) -> void:
	# Modo captura: renderiza unos frames, guarda una imagen y sale. Es lo que
	# permite ver el resultado sin abrir el editor ni una ventana.
	if not "--shot" in OS.get_cmdline_user_args():
		return
	_shot_frames += 1
	if _shot_frames < 6:
		return
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	img.save_png("res://shot.png")
	print("captura guardada")
	get_tree().quit()

var _shot_frames := 0
