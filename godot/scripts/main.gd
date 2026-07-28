extends Node3D

## Escena de juego: monta la partida y la dibuja.
##
## Todo se construye por código en vez de con escenas del editor. Así el juego
## entero se puede arrancar en headless y guardar una captura, sin depender de
## abrir el editor para comprobar cada cambio.

const RunScript = preload("res://scripts/game/run.gd")
const TerrainViewScript = preload("res://scripts/world/terrain_view.gd")
const EnemyViewScript = preload("res://scripts/enemy_view.gd")
const BattleViewScript = preload("res://scripts/battle_view.gd")
const TowerDefsScript = preload("res://scripts/game/tower_defs.gd")
const GridScript = preload("res://scripts/world/grid.gd")
const CameraRigScript = preload("res://scripts/camera_rig.gd")
const MarkersViewScript = preload("res://scripts/markers_view.gd")

var run
var terrain: Node3D
var enemy_view
var battle_view
var markers
var rig
var _map_version := -1


func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	var seed_text := "godot"
	var sectors := 0
	for a in args:
		if a.begins_with("--seed="):
			seed_text = a.substr(7)
		elif a.begins_with("--sectors="):
			sectors = int(a.substr(10))

	run = RunScript.new(seed_text)
	for i in sectors:
		run.map.expand()

	terrain = TerrainViewScript.new()
	add_child(terrain)
	enemy_view = EnemyViewScript.new()
	add_child(enemy_view)
	battle_view = BattleViewScript.new()
	add_child(battle_view)
	markers = MarkersViewScript.new()
	add_child(markers)

	_setup_world()
	# El destello del núcleo al recibir un golpe se dispara desde la partida:
	# la vista no tiene por qué saber por qué ha pasado.
	run.changed.connect(func(what: String):
		if what == "damage":
			markers.hit())

	# En modo captura se planta una defensa y se lanza una oleada: una foto del
	# mapa vacío no dice si el juego funciona.
	if "--shot" in args:
		_seed_defense()
		run.start_wave()

	print("mapa: %d casillas · %d rutas · sector %d · %d torres"
		% [run.grid.cells.size(), run.map.routes.size(), run.map.level,
			run.battle.towers.size()])


## Planta unas cuantas torres variadas junto al camino, sin cobrar. Sólo para
## las capturas de comprobación; el jugador construye con el ratón.
func _seed_defense() -> void:
	var ids := ["crossbow", "cannon", "frost", "tesla", "ballista", "mortar"]
	var built := 0
	# Repartidas a lo largo de las rutas, no amontonadas donde caiga: si están
	# todas en un rincón la captura no enseña ni un disparo.
	for r in run.map.routes:
		var i := 3
		while i < r.cells.size() - 3:
			var here = r.cells[i]
			for n in run.grid.neighbors(here.x, here.y):
				if n.path or n.tower != null or not GridScript.is_buildable(n.terrain):
					continue
				run.battle.place(TowerDefsScript.by_id(ids[built % ids.size()]), n)
				built += 1
				break
			i += 5


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
	# Niebla muy suave y sólo a partir de cierta distancia: con niebla por
	# densidad el mapa entero se lavaba de gris, porque la cámara está lejos
	# incluso mirando el centro.
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_DEPTH
	env.fog_depth_begin = 120.0
	env.fog_depth_end = 400.0
	env.fog_density = 0.55
	env.fog_light_color = Color8(0x9f, 0xb8, 0xd4)
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 0.9

	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)

	rig = CameraRigScript.new()
	add_child(rig)
	rig.frame(run.grid)


func _physics_process(delta: float) -> void:
	run.update(delta)


func _process(_delta: float) -> void:
	# La malla del terreno sólo se rehace cuando el mapa cambia de verdad:
	# reconstruirla cada frame costaría más que dibujarla.
	if run.grid.version != _map_version:
		_map_version = run.grid.version
		terrain.build(run.grid)
		markers.sync(run.map)
		rig.frame(run.grid)

	enemy_view.draw_enemies(run.battle.enemies)
	battle_view.draw(run.battle)
	_maybe_shot()


func _maybe_shot() -> void:
	if _shot_done or not "--shot" in OS.get_cmdline_user_args():
		return
	_shot_frames += 1
	# Se deja avanzar la oleada para que los enemigos salgan de los portales y
	# entren en el alcance de las torres: una foto del primer frame no diría nada.
	if _shot_frames < 260:
		return
	# El await deja pasar un frame más, y sin la bandera la captura se guardaba
	# dos veces antes de que llegase el quit.
	_shot_done = true
	print("oleada %d · %d enemigos · %d disparos · %d de oro · %d vidas"
		% [run.state["wave"], run.battle.enemies.size(), run.battle.projectiles.size(),
			run.gold, run.lives])
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("res://shot.png")
	print("captura guardada")
	get_tree().quit()

var _shot_frames := 0
var _shot_done := false
