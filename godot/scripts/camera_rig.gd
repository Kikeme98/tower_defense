class_name CameraRig
extends Node3D

## Cámara isométrica fija: se puede acercar, alejar y desplazar, pero no girar.
##
## Sin rotación el juego gana en dos frentes. El jugador siempre ve el mapa
## desde el mismo ángulo, así que reconoce una posición de un vistazo en vez de
## reorientarse cada vez; y la escena puede permitirse geometría que sólo se ve
## bien desde arriba, porque nadie va a mirarla desde abajo.
##
## En la versión web el control libre de cámara costó tres rondas de arreglos
## —el arrastre, la rueda, el WASD— y ninguna aportaba nada al juego.

const YAW := deg_to_rad(35.0)
const PITCH := deg_to_rad(50.0)

const MIN_DIST := 18.0
const MAX_DIST := 220.0
const ZOOM_STEP := 1.12
## Suavizado: la cámara persigue su objetivo en vez de saltar a él. Sin esto el
## zoom de rueda da tirones y el arrastre se siente resbaladizo.
const SMOOTH := 12.0

var target := Vector3.ZERO  ## punto del suelo que la cámara mira
var dist := 60.0
var bounds := 100.0  ## radio máximo al que se puede alejar el objetivo

var _target_want := Vector3.ZERO
var _dist_want := 60.0
var _dragging := false
var cam: Camera3D


func _ready() -> void:
	cam = Camera3D.new()
	cam.fov = 50.0
	# El plano lejano se ajusta al zoom máximo: dejarlo en 4000 desperdicia
	# precisión del buffer de profundidad y provoca parpadeo entre bloques.
	cam.far = MAX_DIST * 3.0
	add_child(cam)


## Encaja el mapa entero en pantalla. Se llama al empezar y cada vez que crece.
func frame(grid) -> void:
	var cx := float(grid.min_x + grid.max_x) * 0.5 * Grid.TILE
	var cz := float(grid.min_y + grid.max_y) * 0.5 * Grid.TILE
	var w := float(grid.max_x - grid.min_x) * Grid.TILE
	var h := float(grid.max_y - grid.min_y) * Grid.TILE
	target = Vector3(cx, 0, cz)
	_target_want = target
	# El 0,9 es el factor que hace que el mapa llene la pantalla en vez de
	# quedar flotando en medio con márgenes enormes.
	dist = clampf(maxf(w, h) * 0.9, MIN_DIST, MAX_DIST)
	_dist_want = dist
	bounds = maxf(w, h) * 0.75
	_apply()


## Salta a un punto concreto, sin suavizado. Para capturas de comprobación y
## para centrar el núcleo cuando lo alcanzan.
func focus(at: Vector3, distance: float) -> void:
	target = at
	_target_want = at
	dist = distance
	_dist_want = distance
	_apply()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		match event.button_index:
			MOUSE_BUTTON_WHEEL_UP:
				_dist_want = maxf(MIN_DIST, _dist_want / ZOOM_STEP)
			MOUSE_BUTTON_WHEEL_DOWN:
				_dist_want = minf(MAX_DIST, _dist_want * ZOOM_STEP)
			MOUSE_BUTTON_MIDDLE, MOUSE_BUTTON_RIGHT:
				_dragging = event.pressed
	elif event is InputEventMouseMotion and _dragging:
		# El desplazamiento se escala con la distancia: de cerca el arrastre es
		# fino y de lejos recorre el mapa, que es lo que uno espera.
		var k: float = dist * 0.0022
		var right := Vector3(cos(YAW), 0, -sin(YAW))
		var fwd := Vector3(-sin(YAW), 0, -cos(YAW))
		_target_want -= right * event.relative.x * k
		_target_want -= fwd * event.relative.y * k / cos(PITCH)
		var flat := Vector2(_target_want.x, _target_want.z).limit_length(bounds)
		_target_want = Vector3(flat.x, 0, flat.y)


func _process(delta: float) -> void:
	var k: float = minf(1.0, delta * SMOOTH)
	target = target.lerp(_target_want, k)
	dist = lerpf(dist, _dist_want, k)
	_apply()


func _apply() -> void:
	cam.position = target + Vector3(
		sin(YAW) * cos(PITCH) * dist,
		sin(PITCH) * dist,
		cos(YAW) * cos(PITCH) * dist)
	cam.look_at(target, Vector3.UP)


## Punto del suelo bajo el cursor, a una altura dada. Es lo que convierte un
## clic en una casilla del mapa.
func pick_ground(screen: Vector2, y := 0.0):
	var from := cam.project_ray_origin(screen)
	var dir := cam.project_ray_normal(screen)
	if absf(dir.y) < 0.0001:
		return null
	var t := (y - from.y) / dir.y
	if t < 0.0:
		return null
	return from + dir * t
