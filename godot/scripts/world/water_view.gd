class_name WaterView
extends MeshInstance3D

## Lámina de agua sobre los lagos.
##
## No son los bloques de terreno pintados de azul: es una superficie propia,
## subdividida, con un shader que la ondula. Los bloques siguen ahí debajo,
## oscurecidos, haciendo de fondo del lago; lo que se ve moverse es esta lámina.
##
## Se genera una sola malla con todas las casillas de agua del mapa. Ondular los
## bloques del terreno uno a uno habría dejado costuras visibles entre casilla y
## casilla, porque cada cubo se deformaría por su cuenta.
##
## La ondulación se calcula en coordenadas de mundo, no de la malla: así las olas
## son continuas de una casilla a la siguiente y no se reinician en cada borde.

## Subdivisiones por casilla. Con una sola, los vértices caen cada dos unidades
## y las olas se ven como pliegues rectos.
const SUB := 2

const SHADER := """
shader_type spatial;
render_mode cull_disabled, depth_draw_opaque;

uniform vec3 shallow_color : source_color = vec3(0.25, 0.62, 0.72);
uniform vec3 deep_color : source_color = vec3(0.05, 0.19, 0.36);
uniform vec3 foam_color : source_color = vec3(0.82, 0.93, 0.98);
uniform float wave_height = 0.09;
uniform float wave_speed = 0.9;

varying float v_foam;
varying float v_crest;

// Tres ondas de direcciones y longitudes distintas. Con una sola queda un
// oleaje mecánico de libro de texto; con tres, la superficie deja de tener
// un patrón evidente.
float waves(vec2 p, float t) {
	float a = sin(p.x * 0.55 + t * 1.10) * 0.5;
	float b = sin(p.y * 0.41 - t * 0.83) * 0.35;
	float c = sin((p.x + p.y) * 0.28 + t * 0.62) * 0.28;
	return a + b + c;
}

void vertex() {
	// COLOR.r trae la cercanía a la orilla, calculada al generar la malla.
	v_foam = COLOR.r;
	vec3 world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	float t = TIME * wave_speed;
	float h = waves(world.xz, t);
	v_crest = h;
	VERTEX.y += h * wave_height;

	// Normal derivada de la propia onda: sin esto la lámina se mueve pero
	// refleja como si fuese plana, y el oleaje no se nota.
	float e = 0.35;
	float dx = waves(world.xz + vec2(e, 0.0), t) - waves(world.xz - vec2(e, 0.0), t);
	float dz = waves(world.xz + vec2(0.0, e), t) - waves(world.xz - vec2(0.0, e), t);
	NORMAL = normalize(vec3(-dx * wave_height, 2.0 * e, -dz * wave_height));
}

void fragment() {
	// Fresnel: de frente el agua es transparente y deja ver el fondo; de canto
	// refleja el cielo. Es lo que la distingue de una superficie azul pintada.
	float fresnel = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 3.0);

	vec3 base = mix(deep_color, shallow_color, clamp(v_foam * 1.4, 0.0, 1.0));
	// Las crestas aclaran un poco: da relieve sin necesitar reflejos reales.
	base += vec3(0.06) * clamp(v_crest, 0.0, 1.0);

	// Espuma en la orilla, con la propia ola marcando el borde: así la línea de
	// espuma sube y baja en vez de quedarse clavada en el contorno del lago.
	float shore = clamp(v_foam + v_crest * 0.18, 0.0, 1.0);
	float foam = smoothstep(0.62, 0.95, shore);

	ALBEDO = mix(base, foam_color, foam);
	ROUGHNESS = mix(0.08, 0.55, foam);
	METALLIC = 0.0;
	SPECULAR = 0.7;
	RIM = fresnel * 0.6;
	ALPHA = mix(0.82, 0.97, max(fresnel, foam));
}
"""


func _ready() -> void:
	var shader := Shader.new()
	shader.code = SHADER
	var mat := ShaderMaterial.new()
	mat.shader = shader
	# La transparencia deja ver el fondo del lago, que son los bloques del
	# terreno oscurecidos. Sin ella el agua sería una tapa opaca.
	mat.render_priority = 1
	material_override = mat
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


## Reconstruye la lámina a partir de la rejilla. Se llama cuando el mapa cambia.
func build(grid) -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var any := false

	for c in grid.cells.values():
		if c.terrain != Grid.T.WATER:
			continue
		any = true
		# Cercanía a la orilla por casilla: cuántos de sus cuatro vecinos no son
		# agua. Es lo que alimenta la espuma y el color de poca profundidad.
		var land := 0
		for n in grid.neighbors(c.x, c.y):
			if n.terrain != Grid.T.WATER:
				land += 1
		var shore: float = clampf(float(land) / 2.0, 0.0, 1.0)

		# La lámina va justo por encima de la cara superior del bloque.
		var y: float = c.wy + 0.34
		var x0: float = c.wx - Grid.TILE * 0.5
		var z0: float = c.wz - Grid.TILE * 0.5
		var step: float = Grid.TILE / float(SUB)

		for sx in SUB:
			for sz in SUB:
				var ax: float = x0 + float(sx) * step
				var az: float = z0 + float(sz) * step
				var quad := [
					Vector3(ax, y, az),
					Vector3(ax + step, y, az),
					Vector3(ax + step, y, az + step),
					Vector3(ax, y, az + step),
				]
				st.set_color(Color(shore, 0, 0))
				for i in [0, 1, 2, 0, 2, 3]:
					st.set_normal(Vector3.UP)
					st.add_vertex(quad[i])

	mesh = st.commit() if any else null
	visible = any
