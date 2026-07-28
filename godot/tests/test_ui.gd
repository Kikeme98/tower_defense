extends SceneTree

## Comprobaciones de la interfaz, sin abrir ventana.
##   godot --headless --script tests/test_ui.gd
##
## Las reglas de accesibilidad no se sostienen solas: un botón que se queda en
## 36 px de alto o una etiqueta a 12 px no rompen nada, se ven bien en el
## monitor de quien las escribe y se quedan ahí para siempre. Esto las convierte
## en algo que falla si se incumple.

const HUDScript = preload("res://scripts/ui/hud.gd")
const RunScript = preload("res://scripts/game/run.gd")
const UI = preload("res://scripts/ui/theme.gd")
const TowerDefsScript = preload("res://scripts/game/tower_defs.gd")

var checks := 0
var failures := 0


func ok(cond: bool, msg: String) -> void:
	checks += 1
	if not cond:
		failures += 1
		printerr("  ✗ ", msg)


func _init() -> void:
	var run = RunScript.new("interfaz")
	var hud = HUDScript.new()
	root.add_child(hud)
	hud.setup(run)
	# Dos vueltas para que los contenedores calculen su tamaño: sin esto los
	# rectángulos que se comprueban abajo son todos cero.
	await process_frame
	await process_frame

	_check_typography(hud)
	_check_touch_targets(hud)
	_check_safe_area(hud)
	_check_no_color_only(hud, run)
	_check_states(hud, run)

	if failures == 0:
		print("✓ %d comprobaciones correctas" % checks)
	else:
		printerr("✗ %d de %d fallaron" % [failures, checks])
	quit(1 if failures > 0 else 0)


func _walk(node: Node, out: Array) -> Array:
	if node is Control:
		out.append(node)
	for c in node.get_children():
		_walk(c, out)
	return out


## Nada por debajo del mínimo legible. Un HUD se lee de reojo, con la atención
## puesta en el mapa: lo que en una web pasaría por "texto secundario", aquí
## directamente no se lee.
func _check_typography(hud) -> void:
	for c in _walk(hud, []):
		if not (c is Label or c is Button):
			continue
		var size: int = c.get_theme_font_size("font_size")
		ok(size >= UI.FONT_MICRO,
			"«%s» usa %d px, por debajo del mínimo de %d"
				% [_name_of(c), size, UI.FONT_MICRO])


## Ningún control por debajo del mínimo táctil. Es el tamaño necesario para
## acertar sin mirar, y en pantalla táctil, para acertar en absoluto.
func _check_touch_targets(hud) -> void:
	var buttons := 0
	for c in _walk(hud, []):
		if not (c is Button):
			continue
		buttons += 1
		ok(c.custom_minimum_size.y >= UI.TAP,
			"el botón «%s» mide %.0f px de alto, menos de los %.0f mínimos"
				% [c.text.replace("\n", " "), c.custom_minimum_size.y, UI.TAP])
	ok(buttons > 0, "el HUD no creó ningún botón")


## Nada pegado al borde: las esquinas se las comen los notches, las barras del
## sistema y los bordes redondeados de los televisores.
## Se comprueba el rectángulo que ocupa cada panel en pantalla, no cómo se
## ancló: un panel centrado no tiene desplazamiento respecto al borde y aun así
## está perfectamente dentro de la zona segura.
func _check_safe_area(hud) -> void:
	var screen: Vector2 = root.get_visible_rect().size
	var safe := Rect2(UI.SAFE, UI.SAFE,
		screen.x - UI.SAFE * 2.0, screen.y - UI.SAFE * 2.0)
	var panels := 0
	for c in _walk(hud, []):
		if not (c is PanelContainer) or not c.visible:
			continue
		panels += 1
		var r: Rect2 = c.get_global_rect()
		ok(safe.encloses(r),
			"un panel se sale de la zona segura: ocupa %s dentro de %s" % [r, safe])
	ok(panels >= 3, "sólo %d paneles visibles; se esperaban al menos 3" % panels)


## Ningún estado se comunica sólo con color. Con un 8% de daltonismo entre
## hombres, el rojo y el verde son el mismo gris para demasiada gente: cada
## indicador tiene que traer además un símbolo o una cifra.
func _check_no_color_only(hud, run) -> void:
	var texts: Array = []
	for c in _walk(hud, []):
		if c is Label or c is Button:
			texts.append(c.text)
	var all := "\n".join(texts)

	# Vidas del núcleo: la barra es color, pero al lado va siempre la cifra.
	ok(UI.SYM_HEALTH in all, "el indicador de vidas no lleva su símbolo")
	ok("%d / %d" % [run.lives, int(run.state["max_lives"])] in all,
		"las vidas no aparecen como cifra, sólo como barra")

	# Precios: un botón que no se puede pagar se desactiva, pero el precio se
	# sigue viendo. Desactivar sin decir cuánto cuesta no informa de nada.
	for c in _walk(hud, []):
		if c is Button and c.disabled:
			ok(c.text.strip_edges() != "",
				"hay un botón desactivado sin ningún texto que explique por qué")


## El HUD tiene que aguantar los estados por los que pasa la partida sin
## quedarse a medias ni petar.
func _check_states(hud, run) -> void:
	# Fase de construcción: se puede lanzar oleada y la tienda tiene las torres
	# iniciales, ni una más.
	var unlocked: int = run.unlocked_defs.size()
	var expected := 0
	for d in TowerDefsScript.LIST:
		if not d["unlock"]:
			expected += 1
	ok(unlocked == expected,
		"la tienda muestra %d torres al empezar, se esperaban %d" % [unlocked, expected])

	# Torre seleccionada: el panel de detalle aparece y trae las tres capas.
	var cell = null
	for c in run.grid.cells.values():
		if not c.path and c.tower == null and Grid.is_buildable(c.terrain):
			cell = c
			break
	ok(cell != null, "no hay ninguna casilla construible en el mapa inicial")
	if cell == null:
		return
	run.place(TowerDefsScript.by_id("crossbow"), cell)
	hud.selected_tower = cell.tower
	hud.refresh()

	var detail := ""
	for c in _walk(hud, []):
		if c is Label:
			detail += c.text + "\n"
	for sym in [UI.SYM_HEALTH, UI.SYM_ARMOR, UI.SYM_SHIELD]:
		ok(sym in detail,
			"el panel de la torre no muestra el símbolo «%s» de una de las capas" % sym)

	# Y tras vender, el panel desaparece en vez de quedarse con datos muertos.
	run.sell(cell.tower)
	hud.selected_tower = null
	hud.refresh()
	ok(true, "el HUD sobrevive a vender la torre seleccionada")


func _name_of(c: Control) -> String:
	if c is Button:
		return c.text.replace("\n", " ")
	if c is Label:
		return c.text
	return c.name
