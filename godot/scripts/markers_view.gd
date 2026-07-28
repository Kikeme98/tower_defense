class_name MarkersView
extends Node3D

## Núcleo y portales: los dos puntos del mapa que hay que localizar de un
## vistazo desde cualquier zoom.
##
## Son pocos nodos y se animan, así que aquí sí compensan mallas normales en vez
## de MultiMesh. El núcleo late y su cristal gira; los portales giran y se
## inclinan. El movimiento no es decorativo: es lo que hace que el ojo los
## encuentre en un mapa lleno de bloques quietos.

var _core: Node3D
var _crystal: MeshInstance3D
var _ring: MeshInstance3D
var _portals: Array = []
var _t := 0.0
var _hit := 0.0  ## destello al recibir daño, decae solo


func _ready() -> void:
	_core = Node3D.new()
	add_child(_core)

	# Basamento escalonado: tres cuerpos que estrechan hacia arriba. Un solo
	# bloque no se distingue del terreno, que también son bloques.
	var stone := StandardMaterial3D.new()
	stone.albedo_color = Color8(0x3d, 0x46, 0x6b)
	stone.roughness = 0.75
	var steps := [[2.6, 0.9, 0.0], [2.0, 1.1, 0.9], [1.4, 1.3, 2.0]]
	for s in steps:
		var box := BoxMesh.new()
		box.size = Vector3(s[0], s[1], s[0])
		var mi := MeshInstance3D.new()
		mi.mesh = box
		mi.material_override = stone
		mi.position.y = float(s[2]) + float(s[1]) * 0.5
		_core.add_child(mi)

	# El cristal: emisivo y sin sombra, para que se lea como fuente de luz.
	var glow := StandardMaterial3D.new()
	glow.albedo_color = Color8(0x8a, 0xd8, 0xff)
	glow.emission_enabled = true
	glow.emission = Color8(0x6a, 0xc8, 0xff)
	glow.emission_energy_multiplier = 2.6
	var oct := SphereMesh.new()
	oct.radius = 0.85
	oct.height = 2.6
	oct.radial_segments = 4
	oct.rings = 2
	_crystal = MeshInstance3D.new()
	_crystal.mesh = oct
	_crystal.material_override = glow
	_crystal.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_crystal.position.y = 4.4
	_core.add_child(_crystal)

	# Anillo horizontal alrededor del cristal: da sensación de máquina en marcha.
	var ring := TorusMesh.new()
	ring.inner_radius = 1.5
	ring.outer_radius = 1.75
	ring.rings = 16
	ring.ring_segments = 6
	_ring = MeshInstance3D.new()
	_ring.mesh = ring
	_ring.material_override = glow
	_ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_ring.position.y = 4.4
	_core.add_child(_ring)

	var light := OmniLight3D.new()
	light.light_color = Color8(0x8a, 0xd8, 0xff)
	light.light_energy = 2.2
	light.omni_range = 14.0
	light.position.y = 4.4
	_core.add_child(light)


## Recoloca el núcleo y crea un portal por ruta. Se vuelve a llamar cada vez que
## el mapa crece, porque los portales se desplazan hacia afuera.
func sync(map) -> void:
	_core.position = Vector3(map.core.wx, map.core.wy, map.core.wz)

	for p in _portals:
		p.queue_free()
	_portals.clear()

	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color8(0xff, 0x5a, 0x8a)
	mat.emission_enabled = true
	mat.emission = Color8(0xff, 0x3a, 0x7a)
	mat.emission_energy_multiplier = 2.4
	var torus := TorusMesh.new()
	torus.inner_radius = 1.0
	torus.outer_radius = 1.3
	torus.rings = 14
	torus.ring_segments = 6

	for r in map.routes:
		var mi := MeshInstance3D.new()
		mi.mesh = torus
		mi.material_override = mat
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		mi.position = Vector3(r.spawn.wx, r.spawn.wy + 1.6, r.spawn.wz)
		# De canto: un portal es una puerta, no un charco.
		mi.rotation.x = PI / 2
		# Una ruta sellada ya no escupe nada, y tiene que notarse: se apaga.
		if r.sealed:
			var dim := mat.duplicate()
			dim.albedo_color = Color8(0x6a, 0x4a, 0x58)
			dim.emission_energy_multiplier = 0.2
			mi.material_override = dim
		add_child(mi)
		_portals.append(mi)


## Destello del núcleo al colarse un enemigo.
func hit() -> void:
	_hit = 1.0


func _process(delta: float) -> void:
	_t += delta
	if _hit > 0.0:
		_hit = maxf(0.0, _hit - delta * 3.0)

	# Latido lento más el destello de daño: en calma respira, al recibir un
	# golpe pega un fogonazo.
	var pulse: float = 1.0 + sin(_t * 2.0) * 0.06 + _hit * 0.35
	_crystal.scale = Vector3(pulse, pulse, pulse)
	_crystal.rotation.y = _t * 0.8
	_ring.rotation.y = -_t * 1.4
	_ring.rotation.x = sin(_t * 0.6) * 0.25

	for i in _portals.size():
		_portals[i].rotation.z = _t * (1.2 + float(i) * 0.2)
