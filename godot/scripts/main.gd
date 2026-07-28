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
const HUDScript = preload("res://scripts/ui/hud.gd")
const HealthBarsScript = preload("res://scripts/health_bars.gd")
const FXViewScript = preload("res://scripts/fx_view.gd")

var run
var terrain: Node3D
var enemy_view
var health_bars
var fx_view
var battle_view
var markers
var rig
var hud
var hover_cell = null
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
		elif a.begins_with("--shot-at="):
			_shot_at = int(a.substr(10))

	run = RunScript.new(seed_text)
	for i in sectors:
		run.map.expand()

	terrain = TerrainViewScript.new()
	add_child(terrain)
	enemy_view = EnemyViewScript.new()
	add_child(enemy_view)
	health_bars = HealthBarsScript.new()
	add_child(health_bars)
	fx_view = FXViewScript.new()
	add_child(fx_view)
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

	hud = HUDScript.new()
	add_child(hud)
	hud.setup(run)
	hud.build_requested.connect(_on_build_requested)
	hud.wave_requested.connect(func(): run.start_wave())
	hud.card_chosen.connect(func(card): run.choose_card(card))
	hud.upgrade_requested.connect(func(path): run.upgrade(hud.selected_tower, path))
	hud.sell_requested.connect(func():
		run.sell(hud.selected_tower)
		hud.selected_tower = null
		hud.refresh())

	# En modo captura se planta una defensa y se lanza una oleada: una foto del
	# mapa vacío no dice si el juego funciona.
	if "--shot" in args:
		_seed_defense()
		# `--wave=N` salta a una oleada concreta: las primeras traen cuatro
		# enemigos y se acaban antes de que dé tiempo a fotografiar nada.
		for a in args:
			if a.begins_with("--wave="):
				run.state["wave"] = int(a.substr(7)) - 1
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


## Selección de torre en la tienda. Volver a pulsar la misma la deselecciona:
## sin eso, una vez elegida no hay forma de salir del modo construcción.
func _on_build_requested(def: Dictionary) -> void:
	if not hud.selected_def.is_empty() and hud.selected_def["id"] == def["id"]:
		hud.selected_def = {}
	else:
		hud.selected_def = def
		hud.selected_tower = null
	hud.refresh()


func _unhandled_input(event: InputEvent) -> void:
	if not (event is InputEventMouseButton) or not event.pressed:
		return
	if event.button_index == MOUSE_BUTTON_RIGHT:
		# Botón derecho: cancelar. Es lo que espera todo el mundo, y evita
		# quedarse atrapado con una torre pegada al cursor.
		hud.selected_def = {}
		hud.selected_tower = null
		hud.refresh()
		return
	if event.button_index != MOUSE_BUTTON_LEFT or hover_cell == null:
		return

	if not hud.selected_def.is_empty():
		if run.place(hud.selected_def, hover_cell):
			# Con Mayús pulsada la torre sigue seleccionada, para construir en
			# serie sin volver a la tienda entre casilla y casilla.
			if not Input.is_key_pressed(KEY_SHIFT):
				hud.selected_def = {}
		hud.refresh()
		return

	hud.selected_tower = hover_cell.tower
	hud.refresh()


## Casilla bajo el cursor, corrigiendo el desvío que provoca la altura.
##
## Un solo trazado contra el plano y = 0 falla varias casillas sobre una
## montaña, porque la cámara mira en diagonal. Se traza primero contra el suelo,
## se mira qué altura tiene ahí, y se vuelve a trazar a esa altura.
func _update_hover() -> void:
	if run.phase == run.Phase.DRAFT or run.phase == run.Phase.GAMEOVER:
		hover_cell = null
		return
	var screen := get_viewport().get_mouse_position()
	var p = rig.pick_ground(screen, 0.0)
	if p == null:
		hover_cell = null
		return
	var cell = run.grid.at_world(p.x, p.z)
	if cell != null:
		var p2 = rig.pick_ground(screen, cell.wy)
		if p2 != null:
			var better = run.grid.at_world(p2.x, p2.z)
			if better != null:
				cell = better
	hover_cell = cell


func _physics_process(delta: float) -> void:
	run.update(delta)
	# Los efectos se recogen aquí y no al dibujar: el campo de batalla vacía su
	# lista en cada paso de simulación, y si la física corre dos veces entre dos
	# frames, los impactos del primer paso se perderían.
	fx_view.consume(run.battle)


func _process(_delta: float) -> void:
	# La malla del terreno sólo se rehace cuando el mapa cambia de verdad:
	# reconstruirla cada frame costaría más que dibujarla.
	if run.grid.version != _map_version:
		_map_version = run.grid.version
		terrain.build(run.grid)
		markers.sync(run.map)
		rig.frame(run.grid)

	_update_hover()
	enemy_view.draw_enemies(run.battle.enemies)
	health_bars.draw(run.battle.enemies)
	battle_view.draw(run.battle, hover_cell, hud.selected_def, hud.selected_tower, run)
	_maybe_shot()


func _maybe_shot() -> void:
	if _shot_done or not "--shot" in OS.get_cmdline_user_args():
		return
	_shot_frames += 1
	# Se deja avanzar la oleada para que los enemigos recorran el camino y
	# entren en el alcance de las torres: una foto del primer frame no diría
	# nada de si el combate funciona.
	if _shot_frames < _shot_at:
		return
	_shot_done = true
	print("oleada %d · %d enemigos · %d disparos · %d de oro · %d vidas"
		% [run.state["wave"], run.battle.enemies.size(), run.battle.projectiles.size(),
			run.gold, run.lives])
	# Con `--close` la cámara baja hasta el enemigo más avanzado. A la distancia
	# de juego un enemigo ocupa diez píxeles, y en una captura así es imposible
	# saber si el modelo está bien o si le falta media pieza.
	if "--close" in OS.get_cmdline_user_args() and not run.battle.enemies.is_empty():
		var best = run.battle.enemies[0]
		for e in run.battle.enemies:
			if e.progress > best.progress:
				best = e
		rig.focus(Vector3(best.x, best.y, best.z), 14.0)
	# Una señal de un solo disparo en vez de `await`: la corrutina se quedaba
	# suspendida sin reanudarse en algunas ejecuciones, y la captura no salía.
	RenderingServer.frame_post_draw.connect(_save_shot, CONNECT_ONE_SHOT)


func _save_shot() -> void:
	get_viewport().get_texture().get_image().save_png("res://shot.png")
	print("captura guardada")
	get_tree().quit()

var _shot_frames := 0
var _shot_at := 900
var _shot_done := false
