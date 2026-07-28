class_name MeshKit
extends RefCounted

## Ensambla varias primitivas en una sola malla con color por vértice.
##
## Es lo que permite que un enemigo tenga torso, cabeza, brazos y arma y aun así
## se dibuje instanciado junto a los otros ochenta de su especie: el detalle se
## hornea en la geometría y el color viaja en los vértices, así que una malla
## basta para toda la horda.
##
## Las piezas se describen como diccionarios porque así el modelo se lee casi
## como una lista de materiales:
##
##     MeshKit.build([
##         MeshKit.box(0.62, 0.62, 0.44, CUERO, Vector3(0, 0.86, 0)),
##         MeshKit.sphere(0.25, PIEL, Vector3(0, 1.34, 0.02)),
##     ])

## Paleta común: da coherencia de material entre criaturas distintas.
const SKIN := Color8(0x9d, 0x6b, 0x4f)
const SKIN_DARK := Color8(0x7a, 0x50, 0x39)
const METAL := Color8(0x8e, 0x97, 0xa4)
const METAL_DARK := Color8(0x5c, 0x64, 0x6f)
const LEATHER := Color8(0x6b, 0x4a, 0x32)
const CLOTH := Color8(0x46, 0x50, 0x6b)
const BONE := Color8(0xd8, 0xcf, 0xc0)
const EYE := Color8(0xff, 0xe9, 0x8a)


static func _piece(mesh: Mesh, color: Color, at: Vector3, rot: Vector3,
		scale: Vector3) -> Dictionary:
	var basis := Basis.from_euler(rot).scaled(scale)
	return {"mesh": mesh, "color": color, "xform": Transform3D(basis, at)}


static func box(w: float, h: float, d: float, color: Color, at := Vector3.ZERO,
		rot := Vector3.ZERO) -> Dictionary:
	var m := BoxMesh.new()
	m.size = Vector3(w, h, d)
	return _piece(m, color, at, rot, Vector3.ONE)


static func sphere(r: float, color: Color, at := Vector3.ZERO,
		scale := Vector3.ONE, segments := 8) -> Dictionary:
	var m := SphereMesh.new()
	m.radius = r
	m.height = r * 2.0
	m.radial_segments = segments
	m.rings = maxi(3, segments / 2)
	return _piece(m, color, at, Vector3.ZERO, scale)


static func cyl(rt: float, rb: float, h: float, color: Color, at := Vector3.ZERO,
		rot := Vector3.ZERO, segments := 6) -> Dictionary:
	var m := CylinderMesh.new()
	m.top_radius = rt
	m.bottom_radius = rb
	m.height = h
	m.radial_segments = segments
	m.rings = 0
	return _piece(m, color, at, rot, Vector3.ONE)


static func cone(r: float, h: float, color: Color, at := Vector3.ZERO,
		rot := Vector3.ZERO, segments := 6) -> Dictionary:
	return cyl(0.0, r, h, color, at, rot, segments)


## Godot no trae octaedro. Una esfera de cuatro lados y dos anillos da la misma
## silueta de cristal facetado, que es para lo que se usa.
static func gem(r: float, color: Color, at := Vector3.ZERO,
		rot := Vector3.ZERO) -> Dictionary:
	var m := SphereMesh.new()
	m.radius = r
	m.height = r * 2.0
	m.radial_segments = 4
	m.rings = 2
	return _piece(m, color, at, rot, Vector3.ONE)


static func torus(inner: float, outer_r: float, color: Color, at := Vector3.ZERO,
		rot := Vector3.ZERO, segments := 12) -> Dictionary:
	var m := TorusMesh.new()
	m.inner_radius = inner
	m.outer_radius = outer_r
	m.rings = segments
	m.ring_segments = 6
	return _piece(m, color, at, rot, Vector3.ONE)


## Une las piezas en un único ArrayMesh.
##
## Se leen los vértices de cada primitiva y se transforman a mano en vez de usar
## CSG o nodos hijos: el resultado es una malla suelta que se puede meter en un
## MultiMesh, que es todo el objetivo.
static func build(pieces: Array, outer := Transform3D.IDENTITY) -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	for p in pieces:
		var mesh: Mesh = p["mesh"]
		var xform: Transform3D = outer * (p["xform"] as Transform3D)
		# Las normales se transforman con la inversa traspuesta: con un escalado
		# no uniforme, aplicarles la matriz sin más las deja torcidas y la
		# iluminación sale mal.
		var nbasis := xform.basis.inverse().transposed()
		var color: Color = p["color"]

		var arrays := mesh.surface_get_arrays(0)
		var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		var norms: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
		var idx: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]

		st.set_color(color)
		# Sin índices, cada triángulo va suelto: se recorren en el mismo orden
		# para no perder el sentido de las caras.
		if idx.is_empty():
			for i in verts.size():
				st.set_normal((nbasis * norms[i]).normalized())
				st.add_vertex(xform * verts[i])
		else:
			for i in idx.size():
				var v: int = idx[i]
				st.set_normal((nbasis * norms[v]).normalized())
				st.add_vertex(xform * verts[v])

	return st.commit()
