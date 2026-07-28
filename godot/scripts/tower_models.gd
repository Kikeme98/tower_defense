class_name TowerModels
extends RefCounted

## Modelos de las torres: un pedestal y una cabeza por tipo.
##
## Van separados porque la cabeza gira hacia el objetivo y retrocede al disparar,
## y el pedestal no se mueve. Cada uno es una malla suelta que se instancia por
## lote, así que da igual que haya trescientas torres en el mapa.
##
## Las cabezas se modelan con el cañón hacia −Z, que es lo natural al escribir
## las piezas mirando la escena de frente, y se les da media vuelta al
## construirlas. El apuntado usa `atan2(dx, dz)`, que orienta el +Z del modelo
## hacia el objetivo: sin esa media vuelta todas las torres disparan de espaldas.
## Es exactamente el fallo que se reportó en la versión web.

const K = preload("res://scripts/meshkit.gd")

const FLIP := Transform3D(Basis(Vector3.UP, PI), Vector3.ZERO)


## Pedestal común: losa cuadrada y fuste troncocónico.
static func _pedestal(color: Color) -> ArrayMesh:
	return K.build([
		K.box(1.5, 0.28, 1.5, color, Vector3(0, 0.14, 0)),
		K.cyl(0.45, 0.60, 0.55, color, Vector3(0, 0.5, 0), Vector3.ZERO, 8),
	])


static func _head(pieces: Array) -> ArrayMesh:
	return K.build(pieces, FLIP)


static func build_all() -> Dictionary:
	var out := {}
	var c := func(id: String, base: Color, head: Array) -> void:
		out[id] = {"base": _pedestal(base), "head": _head(head)}

	# Ballesta: cureña con el arco cruzado y el virote montado.
	c.call("crossbow", Color8(0x6b, 0x55, 0x40), [
		K.box(0.50, 0.42, 0.70, Color8(0x8a, 0x6b, 0x4a), Vector3(0, 0.2, 0)),
		K.box(1.30, 0.10, 0.10, Color8(0xd9, 0xc4, 0x8a), Vector3(0, 0.3, 0.15)),
		K.box(0.12, 0.12, 0.90, Color8(0xe8, 0xdc, 0xc0), Vector3(0, 0.3, -0.15)),
	])

	# Cañón: cilindro corto y boca ancha.
	c.call("cannon", Color8(0x3d, 0x3d, 0x45), [
		K.cyl(0.42, 0.48, 0.40, Color8(0x5a, 0x5a, 0x64), Vector3(0, 0.24, 0), Vector3.ZERO, 8),
		K.cyl(0.20, 0.26, 1.25, Color8(0x33, 0x33, 0x3a), Vector3(0, 0.34, -0.5),
			Vector3(PI / 2, 0, 0), 10),
		K.cyl(0.29, 0.29, 0.16, Color8(0xff, 0x8a, 0x3a), Vector3(0, 0.34, -1.05),
			Vector3(PI / 2, 0, 0), 10),
	])

	# Glaciar: cristal grande sobre base hexagonal, con dos esquirlas orbitando.
	c.call("frost", Color8(0x2c, 0x5a, 0x78), [
		K.cyl(0.34, 0.42, 0.45, Color8(0x3a, 0x7e, 0xa8), Vector3(0, 0.25, 0), Vector3.ZERO, 6),
		K.gem(0.34, Color8(0x9f, 0xe8, 0xff), Vector3(0, 0.75, 0)),
		K.gem(0.16, Color8(0xcd, 0xf4, 0xff), Vector3(0.32, 0.5, 0.2)),
		K.gem(0.16, Color8(0xcd, 0xf4, 0xff), Vector3(-0.32, 0.5, -0.2)),
	])

	# Bobina Tesla: mástil, anillo y esfera coronando.
	c.call("tesla", Color8(0x45, 0x3a, 0x68), [
		K.cyl(0.14, 0.20, 1.10, Color8(0x6b, 0x5a, 0x9a), Vector3(0, 0.55, 0), Vector3.ZERO, 6),
		K.torus(0.27, 0.41, Color8(0x9f, 0xd8, 0xff), Vector3(0, 0.75, 0), Vector3(PI / 2, 0, 0)),
		K.sphere(0.24, Color8(0xcf, 0xe8, 0xff), Vector3(0, 1.2, 0), Vector3.ONE, 10),
	])

	# Escupidor: bulbo con boquilla y gota de veneno en la punta.
	c.call("venom", Color8(0x2e, 0x4f, 0x2c), [
		K.sphere(0.42, Color8(0x3f, 0x6b, 0x3a), Vector3(0, 0.34, 0)),
		K.cyl(0.10, 0.18, 0.80, Color8(0x2a, 0x4a, 0x28), Vector3(0, 0.42, -0.4),
			Vector3(PI / 2, 0, 0), 6),
		K.sphere(0.16, Color8(0xb6, 0xff, 0x5a), Vector3(0, 0.42, -0.78)),
	])

	# Mortero: tubo empinado sobre plataforma cuadrada.
	c.call("mortar", Color8(0x55, 0x48, 0x32), [
		K.box(0.80, 0.30, 0.80, Color8(0x6b, 0x5a, 0x3a), Vector3(0, 0.2, 0)),
		K.cyl(0.26, 0.30, 1.10, Color8(0x4a, 0x40, 0x30), Vector3(0, 0.6, -0.2),
			Vector3(-0.75, 0, 0), 8),
		K.cyl(0.30, 0.30, 0.12, Color8(0xff, 0xd0, 0x6b), Vector3(0, 0.95, -0.5),
			Vector3(-0.75, 0, 0), 8),
	])

	# Flak: dos tubos gemelos apuntando alto y un cargador detrás.
	c.call("flak", Color8(0x5f, 0x2f, 0x2f), [
		K.cyl(0.40, 0.46, 0.36, Color8(0x7a, 0x3a, 0x3a), Vector3(0, 0.22, 0), Vector3.ZERO, 8),
		K.cyl(0.11, 0.13, 1.00, Color8(0x33, 0x33, 0x3a), Vector3(-0.16, 0.55, -0.3),
			Vector3(-0.6, 0, 0), 6),
		K.cyl(0.11, 0.13, 1.00, Color8(0x33, 0x33, 0x3a), Vector3(0.16, 0.55, -0.3),
			Vector3(-0.6, 0, 0), 6),
		K.box(0.50, 0.18, 0.30, Color8(0xff, 0xb0, 0x3a), Vector3(0, 0.42, 0.28)),
	])

	# Prisma: cristal facetado con emisor y anillo.
	c.call("beam", Color8(0x6b, 0x2d, 0x5f), [
		K.gem(0.40, Color8(0x8a, 0x3a, 0x7a), Vector3(0, 0.5, 0)),
		K.cyl(0.16, 0.16, 0.70, Color8(0xff, 0x6b, 0xd8), Vector3(0, 0.5, -0.45),
			Vector3(PI / 2, 0, 0), 6),
		K.torus(0.45, 0.55, Color8(0xff, 0x9f, 0xe8), Vector3(0, 0.5, 0),
			Vector3(PI / 2, 0, 0), 14),
	])

	# Balista: cureña larga con el arco atrás y el virote sobresaliendo.
	c.call("ballista", Color8(0x46, 0x3a, 0x2c), [
		K.box(0.60, 0.30, 1.20, Color8(0x5a, 0x4a, 0x3a), Vector3(0, 0.3, 0)),
		K.box(1.80, 0.12, 0.12, Color8(0x3a, 0x30, 0x28), Vector3(0, 0.5, 0.3)),
		K.box(0.14, 0.14, 1.90, Color8(0xff, 0xe0, 0x8a), Vector3(0, 0.5, -0.4)),
	])

	# Pilón: aguja alta rematada en cristal. No dispara, así que no tiene boca.
	c.call("pylon", Color8(0x8a, 0x6b, 0x2c), [
		K.cyl(0.06, 0.28, 1.60, Color8(0xb0, 0x8a, 0x3a), Vector3(0, 0.8, 0), Vector3.ZERO, 4),
		K.gem(0.30, Color8(0xff, 0xe9, 0xa8), Vector3(0, 1.75, 0)),
	])

	# Arpón: cabrestante con el asta y la punta montadas.
	c.call("harpoon", Color8(0x1f, 0x52, 0x66), [
		K.box(0.70, 0.36, 0.70, Color8(0x2c, 0x6e, 0x8a), Vector3(0, 0.24, 0)),
		K.cyl(0.09, 0.09, 1.30, Color8(0x8a, 0xe8, 0xff), Vector3(0, 0.4, -0.5),
			Vector3(PI / 2, 0, 0), 6),
		K.cone(0.18, 0.35, Color8(0xcd, 0xf4, 0xff), Vector3(0, 0.4, -1.15),
			Vector3(-PI / 2, 0, 0), 5),
	])

	return out
