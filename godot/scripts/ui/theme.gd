class_name UITheme
extends RefCounted

## Reglas visuales de la interfaz, en un solo sitio.
##
## Vienen de la revisión de accesibilidad que se hizo sobre la versión web, y se
## mantienen aquí porque son decisiones, no gustos:
##
## - Nada de texto por debajo de 14 px. Un HUD de juego se lee de reojo, con la
##   atención puesta en otra parte; lo que en una web pasa por "secundario" ahí
##   directamente no se lee.
## - Ningún control con menos de 44 px de alto. Es el mínimo para acertar sin
##   mirar, y en pantalla táctil, para acertar en absoluto.
## - Margen de seguridad en los bordes: las esquinas se comen los notches, las
##   barras del sistema y los bordes redondeados de los televisores.
## - Ningún estado se indica sólo con color. Siempre acompaña un símbolo o un
##   texto, porque con un 8% de daltonismo entre hombres, el rojo y el verde son
##   el mismo gris para demasiada gente.

## Escala tipográfica. Saltos amplios: con tamaños de 15, 16 y 17 la jerarquía
## no se ve, y el ojo tiene que leer para saber qué es importante.
const FONT_MICRO := 14   ## etiquetas y unidades
const FONT_BODY := 16    ## texto corriente
const FONT_STRONG := 22  ## cifras que se consultan de un vistazo
const FONT_TITLE := 32   ## títulos de panel

const TAP := 44.0   ## alto mínimo de cualquier control
const SAFE := 24.0  ## margen de seguridad contra los bordes de pantalla
const GAP := 12.0   ## separación estándar entre elementos

# Paleta. Fondos muy oscuros y translúcidos para que el mapa siga leyéndose
# debajo del HUD; el juego pasa ahí y la interfaz sólo lo acompaña.
const BG := Color(0.05, 0.06, 0.09, 0.88)
const BG_SOFT := Color(0.09, 0.10, 0.14, 0.94)
const LINE := Color(1, 1, 1, 0.12)
const TEXT := Color(0.93, 0.95, 0.98)
const TEXT_DIM := Color(0.68, 0.72, 0.80)
const GOLD := Color8(0xff, 0xd0, 0x6b)
const DANGER := Color8(0xff, 0x6b, 0x7a)
const OK := Color8(0x7a, 0xe0, 0x9a)
const FOCUS := Color8(0x8a, 0xd8, 0xff)

## Etiquetas de las tres capas de daño. Se usan en todas partes —panel de torre,
## cartas, avisos— para que cada capa se nombre siempre igual.
##
## Son texto y no iconos por un motivo concreto: la fuente que Godot incrusta
## (Open Sans) no trae ni un solo símbolo de los que pedían estos indicadores.
## En macOS se ven porque el motor recurre a las fuentes del sistema, pero en un
## ejecutable en Windows o Linux saldrían como cuadros vacíos, y justamente
## estos indicadores existen para no depender del color. Un símbolo que a veces
## no se dibuja es peor que una palabra que siempre se lee.
const SYM_HEALTH := "VIDA"
const SYM_ARMOR := "ARMA"
const SYM_SHIELD := "ESC"
const SYM_GOLD := "Oro"

## Caracteres seguros: los únicos adornos que Open Sans garantiza.
const BULLET := "•"
const TIMES := "×"


static func panel_style(bg := BG, radius := 10) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = bg
	s.set_corner_radius_all(radius)
	s.set_border_width_all(1)
	s.border_color = LINE
	s.content_margin_left = GAP
	s.content_margin_right = GAP
	s.content_margin_top = GAP * 0.75
	s.content_margin_bottom = GAP * 0.75
	return s


static func label(text: String, size := FONT_BODY, color := TEXT) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	return l


## Botón que cumple el mínimo táctil y muestra el foco de forma visible.
##
## El foco importa: sin él, quien navegue con teclado o mando no sabe dónde
## está, y un tower defense se juega perfectamente sin ratón.
static func button(text: String, accent := FOCUS) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size.y = TAP
	b.add_theme_font_size_override("font_size", FONT_BODY)
	b.add_theme_color_override("font_color", TEXT)
	b.add_theme_color_override("font_disabled_color", Color(TEXT_DIM, 0.5))

	var normal := panel_style(BG_SOFT, 8)
	normal.content_margin_left = GAP
	normal.content_margin_right = GAP
	b.add_theme_stylebox_override("normal", normal)

	var hover := panel_style(Color(BG_SOFT.lightened(0.12), 0.96), 8)
	b.add_theme_stylebox_override("hover", hover)

	var pressed := panel_style(Color(accent, 0.32), 8)
	b.add_theme_stylebox_override("pressed", pressed)

	var disabled := panel_style(Color(BG_SOFT, 0.5), 8)
	b.add_theme_stylebox_override("disabled", disabled)

	# Recuadro grueso y de color vivo: un borde de un píxel se pierde sobre el
	# mapa, y entonces el foco es como no tenerlo.
	var focus := StyleBoxFlat.new()
	focus.bg_color = Color(accent, 0.10)
	focus.set_corner_radius_all(8)
	focus.set_border_width_all(3)
	focus.border_color = accent
	b.add_theme_stylebox_override("focus", focus)
	return b


## Barra de progreso con etiqueta propia. Nunca sólo la barra: el color y la
## longitud dicen "poco", pero sólo el número dice cuánto.
static func bar(color: Color, height := 10.0) -> ProgressBar:
	var p := ProgressBar.new()
	p.custom_minimum_size.y = height
	p.show_percentage = false
	p.max_value = 1.0

	var bg := StyleBoxFlat.new()
	bg.bg_color = Color(0, 0, 0, 0.45)
	bg.set_corner_radius_all(int(height / 2.0))
	p.add_theme_stylebox_override("background", bg)

	var fill := StyleBoxFlat.new()
	fill.bg_color = color
	fill.set_corner_radius_all(int(height / 2.0))
	p.add_theme_stylebox_override("fill", fill)
	return p
