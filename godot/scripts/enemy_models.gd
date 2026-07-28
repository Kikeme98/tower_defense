class_name EnemyModels
extends RefCounted

## Modelos de los enemigos.
##
## Cada criatura son dos mallas: un cuerpo con todo el detalle horneado —torso,
## cabeza, brazos, armas— y una extremidad que se instancia dos veces y se anima
## aparte, piernas que alternan al andar o alas que baten. Separarlas es lo que
## permite moverlas: dentro de una sola malla instanciada no hay forma de animar
## una parte sin arrastrar el conjunto.
##
## El color va por vértice, así que la horda entera se dibuja de una vez y aun
## así cada pieza tiene su tono: piel, metal, cuero, tela.

const K = preload("res://scripts/meshkit.gd")


## Soldado: bípedo con casco, hombreras y un hacha corta.
static func _grunt() -> Dictionary:
	var body := K.build([
		K.box(0.62, 0.62, 0.44, K.LEATHER, Vector3(0, 0.86, 0)),
		K.box(0.86, 0.16, 0.50, K.METAL_DARK, Vector3(0, 1.12, 0)),
		K.sphere(0.25, K.SKIN, Vector3(0, 1.34, 0.02)),
		K.cyl(0.27, 0.29, 0.20, K.METAL, Vector3(0, 1.46, 0), Vector3.ZERO, 7),
		K.box(0.07, 0.07, 0.07, K.EYE, Vector3(-0.09, 1.32, 0.22)),
		K.box(0.07, 0.07, 0.07, K.EYE, Vector3(0.09, 1.32, 0.22)),
		K.cyl(0.09, 0.09, 0.50, K.SKIN_DARK, Vector3(-0.38, 0.92, 0.06), Vector3(0.4, 0, 0), 5),
		K.cyl(0.09, 0.09, 0.50, K.SKIN_DARK, Vector3(0.38, 0.92, 0.06), Vector3(0.4, 0, 0), 5),
		K.cyl(0.05, 0.05, 0.62, K.LEATHER, Vector3(0.42, 1.0, 0.3), Vector3(1.2, 0, 0), 5),
		K.box(0.10, 0.26, 0.30, K.METAL, Vector3(0.42, 1.02, 0.62)),
	])
	var limb := K.build([
		K.cyl(0.11, 0.13, 0.52, K.SKIN_DARK, Vector3(0, -0.26, 0), Vector3.ZERO, 5),
		K.box(0.20, 0.12, 0.30, K.LEATHER, Vector3(0, -0.50, 0.05)),
	])
	return {"body": body, "limb": limb, "limb_at": Vector3(0.17, 0.56, 0), "kind": "leg"}


## Corredor: inclinado hacia delante, zancada larga, cabeza afilada.
static func _runner() -> Dictionary:
	var eye := Color8(0xff, 0x5a, 0x4a)
	var body := K.build([
		K.box(0.42, 0.50, 0.62, K.SKIN, Vector3(0, 0.82, 0.06), Vector3(0.35, 0, 0)),
		K.cone(0.22, 0.50, K.SKIN_DARK, Vector3(0, 1.02, 0.34), Vector3(1.25, 0, 0), 6),
		K.box(0.06, 0.06, 0.06, eye, Vector3(-0.08, 1.06, 0.48)),
		K.box(0.06, 0.06, 0.06, eye, Vector3(0.08, 1.06, 0.48)),
		K.cyl(0.06, 0.06, 0.42, K.SKIN_DARK, Vector3(-0.26, 0.86, 0.16), Vector3(0.9, 0, 0), 5),
		K.cyl(0.06, 0.06, 0.42, K.SKIN_DARK, Vector3(0.26, 0.86, 0.16), Vector3(0.9, 0, 0), 5),
		K.cone(0.10, 0.42, K.BONE, Vector3(0, 0.9, -0.34), Vector3(-1.4, 0, 0), 5),
	])
	var limb := K.build([
		K.cyl(0.08, 0.10, 0.60, K.SKIN, Vector3(0, -0.30, 0), Vector3.ZERO, 5),
		K.box(0.16, 0.10, 0.30, K.SKIN_DARK, Vector3(0, -0.58, 0.08)),
	])
	return {"body": body, "limb": limb, "limb_at": Vector3(0.14, 0.62, 0), "kind": "leg"}


## Blindado: torso ancho de placas, yelmo con visera y escudo.
static func _armored() -> Dictionary:
	var body := K.build([
		K.box(0.80, 0.70, 0.56, K.METAL, Vector3(0, 0.90, 0)),
		K.box(0.88, 0.14, 0.62, K.METAL_DARK, Vector3(0, 1.20, 0)),
		K.box(0.90, 0.10, 0.60, K.METAL_DARK, Vector3(0, 0.62, 0)),
		K.cyl(0.26, 0.30, 0.34, K.METAL, Vector3(0, 1.42, 0), Vector3.ZERO, 7),
		K.box(0.34, 0.08, 0.10, Color8(0x1a, 0x1a, 0x20), Vector3(0, 1.42, 0.24)),
		K.box(0.16, 0.50, 0.44, K.METAL_DARK, Vector3(-0.50, 0.94, 0.08)),
		K.box(0.12, 0.12, 0.50, K.LEATHER, Vector3(0.48, 0.98, 0.14)),
	])
	var limb := K.build([
		K.cyl(0.14, 0.16, 0.50, K.METAL_DARK, Vector3(0, -0.25, 0), Vector3.ZERO, 5),
		K.box(0.26, 0.14, 0.34, K.METAL, Vector3(0, -0.48, 0.04)),
	])
	return {"body": body, "limb": limb, "limb_at": Vector3(0.22, 0.60, 0), "kind": "leg"}


## Volador: cuerpo fusiforme con alas membranosas.
static func _flyer() -> Dictionary:
	var glow := Color8(0x9f, 0xe8, 0xff)
	var body := K.build([
		K.sphere(0.30, K.CLOTH, Vector3(0, 0.90, 0), Vector3(1, 0.85, 1.5)),
		K.cone(0.20, 0.42, K.CLOTH, Vector3(0, 0.90, 0.42), Vector3(1.4, 0, 0), 6),
		K.sphere(0.10, glow, Vector3(-0.10, 0.98, 0.26)),
		K.sphere(0.10, glow, Vector3(0.10, 0.98, 0.26)),
		K.cone(0.12, 0.50, K.METAL_DARK, Vector3(0, 0.88, -0.50), Vector3(-1.5, 0, 0), 5),
	])
	# El ala nace en el origen para que rotar la instancia la haga batir.
	var limb := K.build([
		K.box(0.62, 0.05, 0.42, K.CLOTH, Vector3(0.34, 0, 0)),
		K.box(0.06, 0.06, 0.46, K.METAL_DARK, Vector3(0.06, 0.02, 0)),
	])
	return {"body": body, "limb": limb, "limb_at": Vector3(0.16, 0.92, 0), "kind": "wing"}


## Sanador: figura encapuchada con orbe flotante.
static func _healer() -> Dictionary:
	var body := K.build([
		K.cone(0.40, 0.90, K.CLOTH, Vector3(0, 0.45, 0), Vector3.ZERO, 7),
		K.sphere(0.22, K.CLOTH, Vector3(0, 1.02, 0)),
		K.cone(0.24, 0.30, K.CLOTH, Vector3(0, 1.16, -0.02), Vector3.ZERO, 7),
		K.box(0.16, 0.06, 0.06, Color8(0x4a, 0xd0, 0x7a), Vector3(0, 1.0, 0.18)),
		K.cyl(0.04, 0.04, 0.90, K.LEATHER, Vector3(0.30, 0.78, 0.06), Vector3.ZERO, 5),
		K.sphere(0.16, Color8(0x7d, 0xff, 0xb0), Vector3(0.30, 1.30, 0.06)),
	])
	# "Extremidad" decorativa: los bajos de la túnica, que ondean al avanzar.
	var limb := K.build([K.cone(0.16, 0.34, K.CLOTH, Vector3(0, -0.17, 0), Vector3.ZERO, 5)])
	return {"body": body, "limb": limb, "limb_at": Vector3(0.20, 0.24, 0), "kind": "leg"}


## Coloso: mole bípeda de piedra y metal.
static func _colossus() -> Dictionary:
	var stone := Color8(0x6b, 0x5a, 0x52)
	var body := K.build([
		K.box(1.00, 0.86, 0.72, stone, Vector3(0, 1.10, 0)),
		K.box(1.30, 0.24, 0.80, K.METAL_DARK, Vector3(0, 1.46, 0)),
		K.sphere(0.26, Color8(0x4a, 0x3f, 0x38), Vector3(0, 1.62, 0.04)),
		K.box(0.40, 0.10, 0.10, Color8(0xff, 0x5a, 0x4a), Vector3(0, 1.62, 0.24)),
		K.cyl(0.18, 0.16, 0.80, stone, Vector3(-0.66, 1.0, 0), Vector3(0.15, 0, 0)),
		K.cyl(0.18, 0.16, 0.80, stone, Vector3(0.66, 1.0, 0), Vector3(0.15, 0, 0)),
		K.box(0.34, 0.34, 0.34, K.METAL, Vector3(-0.68, 0.58, 0.04)),
		K.box(0.34, 0.34, 0.34, K.METAL, Vector3(0.68, 0.58, 0.04)),
		K.box(0.20, 0.30, 0.20, Color8(0x8a, 0x7a, 0x6a), Vector3(0, 1.90, -0.10)),
	])
	var limb := K.build([
		K.cyl(0.20, 0.24, 0.62, Color8(0x5a, 0x4a, 0x42), Vector3(0, -0.31, 0)),
		K.box(0.38, 0.18, 0.50, K.METAL_DARK, Vector3(0, -0.60, 0.06)),
	])
	return {"body": body, "limb": limb, "limb_at": Vector3(0.30, 0.68, 0), "kind": "leg"}


## Índice por `shape`: coincide con el campo de los enemigos.
static func build_all() -> Array:
	return [_grunt(), _runner(), _armored(), _flyer(), _healer(), _colossus()]
