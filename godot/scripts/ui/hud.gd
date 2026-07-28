class_name HUD
extends CanvasLayer

## Interfaz de la partida.
##
## Se construye por código, como el resto del proyecto: así el HUD entero se
## puede levantar en una prueba y comprobar que los tamaños y los objetivos
## táctiles cumplen, sin abrir el editor.
##
## Cuatro zonas fijas, siempre en el mismo sitio: recursos arriba a la izquierda,
## estado de la oleada arriba a la derecha, tienda abajo y detalle de la torre
## seleccionada a la derecha. Que no se muevan es la mitad del trabajo: el
## jugador aprende dónde mirar una vez.

const UI = preload("res://scripts/ui/theme.gd")
const TowerDefsScript = preload("res://scripts/game/tower_defs.gd")

signal build_requested(def: Dictionary)
signal wave_requested
signal card_chosen(card: Dictionary)
signal sell_requested
signal upgrade_requested(path_id: String)
signal target_mode_changed(mode: String)

var run

var _gold: Label
var _lives: Label
var _lives_bar: ProgressBar
var _wave: Label
var _sector: Label
var _enemies: Label
var _wave_button: Button
var _shop: HBoxContainer
var _shop_buttons := {}
var _detail: PanelContainer
var _detail_body: VBoxContainer
var _draft: PanelContainer
var _draft_row: HBoxContainer
var _toast: Label
var _toast_time := 0.0
var _last_gold := -1

var selected_def: Dictionary = {}
var selected_tower = null


func setup(r) -> void:
	run = r
	run.changed.connect(_on_changed)
	_build()
	refresh()


# --- Construcción de la interfaz ---------------------------------------------

func _build() -> void:
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)

	_build_resources(root)
	_build_wave_panel(root)
	_build_shop(root)
	_build_detail(root)
	_build_draft(root)
	_build_toast(root)


## Ancla un panel a un punto de la pantalla y lo deja crecer hacia dentro.
##
## Los presets de Godot no valen aquí: `PRESET_CENTER_BOTTOM` deja el borde
## superior por debajo del inferior en cuanto se aplica el margen de seguridad,
## y el panel sale con altura negativa. Fijando los cuatro anclajes y los cuatro
## desplazamientos a mano, el rectángulo empieza con tamaño cero en el punto de
## anclaje y son `grow_*` los que deciden hacia dónde se expande con su
## contenido. Es lo que hace que el HUD aguante cualquier resolución.
func _anchor(c: Control, ax: float, ay: float,
		gx: int = Control.GROW_DIRECTION_END,
		gy: int = Control.GROW_DIRECTION_END) -> void:
	c.anchor_left = ax
	c.anchor_right = ax
	c.anchor_top = ay
	c.anchor_bottom = ay
	# Desplazamiento hacia dentro desde el borde al que se ancla.
	var dx: float = UI.SAFE * (1.0 if ax < 0.5 else (-1.0 if ax > 0.5 else 0.0))
	var dy: float = UI.SAFE * (1.0 if ay < 0.5 else (-1.0 if ay > 0.5 else 0.0))
	c.offset_left = dx
	c.offset_right = dx
	c.offset_top = dy
	c.offset_bottom = dy
	c.grow_horizontal = gx
	c.grow_vertical = gy


func _panel(parent: Control, ax: float, ay: float,
		gx: int = Control.GROW_DIRECTION_END,
		gy: int = Control.GROW_DIRECTION_END) -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", UI.panel_style())
	parent.add_child(p)
	_anchor(p, ax, ay, gx, gy)
	return p


func _build_resources(root: Control) -> void:
	var p := _panel(root, 0.0, 0.0)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", int(UI.GAP * 0.5))
	p.add_child(box)

	# El símbolo va siempre delante de la cifra: identifica el recurso sin
	# depender del color ni de recordar el orden.
	_gold = UI.label("⬢ 0", UI.FONT_STRONG, UI.GOLD)
	box.add_child(_gold)

	var lives_row := HBoxContainer.new()
	lives_row.add_theme_constant_override("separation", int(UI.GAP * 0.5))
	box.add_child(lives_row)
	_lives = UI.label("%s 20 / 20" % UI.SYM_HEALTH, UI.FONT_BODY, UI.TEXT)
	lives_row.add_child(_lives)

	_lives_bar = UI.bar(UI.OK)
	_lives_bar.custom_minimum_size.x = 180
	box.add_child(_lives_bar)


func _build_wave_panel(root: Control) -> void:
	var p := _panel(root, 1.0, 0.0, Control.GROW_DIRECTION_BEGIN)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", int(UI.GAP * 0.5))
	box.alignment = BoxContainer.ALIGNMENT_END
	p.add_child(box)

	_wave = UI.label("Oleada 0", UI.FONT_STRONG)
	_wave.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	box.add_child(_wave)

	_sector = UI.label("Sector 1", UI.FONT_MICRO, UI.TEXT_DIM)
	_sector.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	box.add_child(_sector)

	_enemies = UI.label("", UI.FONT_MICRO, UI.TEXT_DIM)
	_enemies.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	box.add_child(_enemies)

	_wave_button = UI.button("▶  Lanzar oleada", UI.OK)
	_wave_button.pressed.connect(func(): wave_requested.emit())
	box.add_child(_wave_button)


func _build_shop(root: Control) -> void:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", UI.panel_style())
	root.add_child(p)
	# La tienda se ancla estirada de lado a lado, no centrada: dentro va un
	# contenedor con desplazamiento, y un contenedor así no tiene ancho propio.
	# Anclado al centro salía con ancho cero y sólo se veía la barra.
	p.anchor_left = 0.0
	p.anchor_right = 1.0
	p.anchor_top = 1.0
	p.anchor_bottom = 1.0
	p.offset_left = UI.SAFE
	p.offset_right = -UI.SAFE
	p.offset_top = -UI.SAFE
	p.offset_bottom = -UI.SAFE
	p.grow_vertical = Control.GROW_DIRECTION_BEGIN

	# La fila va dentro de un contenedor con desplazamiento: con once torres
	# desbloqueadas no cabe en una pantalla estrecha, y lo alternativo sería
	# encoger los botones por debajo del mínimo táctil. Antes que eso, que se
	# desplacen.
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.custom_minimum_size.y = UI.TAP + 26
	p.add_child(scroll)

	_shop = HBoxContainer.new()
	_shop.add_theme_constant_override("separation", int(UI.GAP * 0.5))
	# Centrada mientras quepa; al desbordar, el contenedor la desplaza.
	_shop.alignment = BoxContainer.ALIGNMENT_CENTER
	_shop.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_shop)


func _shop_button(def: Dictionary) -> Button:
	# Dos líneas: nombre arriba, precio abajo. Con el precio en la misma línea
	# los botones quedan larguísimos y la fila no cabe en pantalla estrecha.
	var b := UI.button("", def["accent"])
	b.custom_minimum_size = Vector2(126, UI.TAP + 22)
	b.tooltip_text = "%s\n%s" % [def["name"], def["desc"]]
	b.pressed.connect(func(): build_requested.emit(def))
	return b


func _build_detail(root: Control) -> void:
	_detail = PanelContainer.new()
	_detail.add_theme_stylebox_override("panel", UI.panel_style())
	root.add_child(_detail)
	_anchor(_detail, 1.0, 0.5,
		Control.GROW_DIRECTION_BEGIN, Control.GROW_DIRECTION_BOTH)
	_detail.custom_minimum_size.x = 260
	_detail.visible = false

	_detail_body = VBoxContainer.new()
	_detail_body.add_theme_constant_override("separation", int(UI.GAP * 0.5))
	_detail.add_child(_detail_body)


func _build_draft(root: Control) -> void:
	_draft = PanelContainer.new()
	var style := UI.panel_style(UI.BG_SOFT, 14)
	style.content_margin_left = UI.GAP * 2
	style.content_margin_right = UI.GAP * 2
	style.content_margin_top = UI.GAP * 1.5
	style.content_margin_bottom = UI.GAP * 1.5
	_draft.add_theme_stylebox_override("panel", style)
	root.add_child(_draft)
	_anchor(_draft, 0.5, 0.5,
		Control.GROW_DIRECTION_BOTH, Control.GROW_DIRECTION_BOTH)
	_draft.visible = false

	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", int(UI.GAP))
	_draft.add_child(box)

	var title := UI.label("Elige una mejora", UI.FONT_TITLE)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	box.add_child(title)

	_draft_row = HBoxContainer.new()
	_draft_row.add_theme_constant_override("separation", int(UI.GAP))
	box.add_child(_draft_row)


## Avisos breves: "no hay oro", "sector nuevo". Se leen y desaparecen.
func _build_toast(root: Control) -> void:
	_toast = UI.label("", UI.FONT_BODY, UI.TEXT)
	_toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	root.add_child(_toast)
	_anchor(_toast, 0.5, 0.0, Control.GROW_DIRECTION_BOTH)
	# Por debajo de los paneles de arriba, para no taparlos.
	_toast.offset_top = UI.SAFE * 5
	_toast.offset_bottom = UI.SAFE * 5
	_toast.modulate.a = 0.0


func toast(text: String, color := UI.TEXT) -> void:
	_toast.text = text
	_toast.add_theme_color_override("font_color", color)
	_toast.modulate.a = 1.0
	_toast_time = 2.2


func _process(delta: float) -> void:
	if _toast_time > 0.0:
		_toast_time -= delta
		# Se desvanece sólo al final: si se atenúa desde el principio, la mitad
		# del tiempo que está en pantalla ya no se lee bien.
		_toast.modulate.a = clampf(_toast_time / 0.5, 0.0, 1.0)
	# Durante el combate el oro y las vidas cambian sin que la partida emita
	# nada —matar un enemigo no es un evento de interfaz—, así que las cifras se
	# releen aquí. El resto del HUD no: reconstruir el panel de la torre cada
	# frame sería tirar y recrear una docena de nodos sesenta veces por segundo.
	if run == null:
		return
	_refresh_readouts()
	if run.phase == run.Phase.COMBAT:
		_refresh_wave_line()
	if run.gold != _last_gold:
		_last_gold = run.gold
		_refresh_shop()
		# Los botones de mejora también se activan y desactivan con el oro.
		if selected_tower != null:
			_refresh_detail()


# --- Actualización -----------------------------------------------------------

func _on_changed(what: String) -> void:
	match what:
		"nogold":
			toast("Oro insuficiente", UI.DANGER)
		"damage":
			toast("¡El núcleo ha sido alcanzado!", UI.DANGER)
		"expand":
			var e: Dictionary = run.last_expand
			var msg := "Sector %d · el mapa crece" % (int(e.get("level", 0)) + 1)
			if int(e.get("sealed", 0)) > 0:
				msg += " · %d portal(es) sellado(s)" % int(e["sealed"])
			toast(msg, UI.FOCUS)
		"gameover":
			toast("Partida terminada", UI.DANGER)
	refresh()


## Las cifras que cambian solas: oro y vidas.
func _refresh_readouts() -> void:
	_gold.text = "⬢ %d" % run.gold
	var max_lives: int = int(run.state["max_lives"])
	_lives.text = "%s %d / %d" % [UI.SYM_HEALTH, run.lives, max_lives]
	var frac: float = float(run.lives) / maxf(1.0, float(max_lives))
	_lives_bar.value = frac
	# El color acompaña, pero la cifra ya está escrita al lado: quien no
	# distinga el rojo del verde sigue sabiendo exactamente cómo va.
	var fill := _lives_bar.get_theme_stylebox("fill") as StyleBoxFlat
	fill.bg_color = UI.OK if frac > 0.5 else (UI.GOLD if frac > 0.25 else UI.DANGER)


func refresh() -> void:
	if run == null:
		return
	_refresh_readouts()
	_last_gold = run.gold
	_wave.text = "Oleada %d" % int(run.state["wave"])
	_sector.text = "Sector %d · %d rutas" % [int(run.state["sector"]), run.map.routes.size()]
	_refresh_wave_line()
	_refresh_shop()
	_refresh_detail()
	_refresh_draft()


func _refresh_wave_line() -> void:
	var in_combat: bool = run.phase == run.Phase.COMBAT
	_wave_button.disabled = run.phase != run.Phase.BUILD
	if in_combat:
		var left: int = run.battle.enemies.size() + run.director.remaining
		_enemies.text = "%d enemigos en el mapa" % left
		_wave_button.text = "⏳  En combate"
	else:
		_enemies.text = ""
		_wave_button.text = "▶  Lanzar oleada %d" % (int(run.state["wave"]) + 1)


func _refresh_shop() -> void:
	for def in run.unlocked_defs:
		var id: String = def["id"]
		if not _shop_buttons.has(id):
			var b := _shop_button(def)
			_shop.add_child(b)
			_shop_buttons[id] = b
		var b2: Button = _shop_buttons[id]
		var cost: int = run.cost_of(def)
		var affordable: bool = run.gold >= cost
		# El precio se muestra siempre; si no llega, además se desactiva. Dos
		# señales para el mismo hecho, y ninguna depende sólo del color.
		b2.text = "%s\n⬢ %d" % [def["name"], cost]
		b2.disabled = not affordable
		var picked: bool = not selected_def.is_empty() and selected_def["id"] == id
		b2.add_theme_color_override("font_color",
			UI.FOCUS if picked else (UI.TEXT if affordable else UI.TEXT_DIM))


func _refresh_detail() -> void:
	for c in _detail_body.get_children():
		c.queue_free()
	if selected_tower == null or selected_tower.cell == null:
		_detail.visible = false
		return
	_detail.visible = true

	var t = selected_tower
	var s: Dictionary = t.stats
	_detail_body.add_child(UI.label(t.def["name"], UI.FONT_STRONG, t.def["accent"]))
	_detail_body.add_child(UI.label(
		"Nivel %d · %s" % [t.total_level, Grid.TERRAIN[t.cell.terrain]["name"]],
		UI.FONT_MICRO, UI.TEXT_DIM))

	# Daño contra cada capa, con su símbolo. Es el dato que decide si esta torre
	# sirve contra lo que viene, y no se deduce del daño bruto.
	var vs: Dictionary = s["vs"]
	_detail_body.add_child(UI.label(
		"%s ×%.2f   %s ×%.2f   %s ×%.2f" % [
			UI.SYM_HEALTH, float(vs["h"]),
			UI.SYM_ARMOR, float(vs["a"]),
			UI.SYM_SHIELD, float(vs["s"])],
		UI.FONT_BODY))
	_detail_body.add_child(UI.label(
		"Daño %.0f · alcance %.1f · %.2f/s" % [s["damage"], s["range"], s["fire_rate"]],
		UI.FONT_MICRO, UI.TEXT_DIM))
	_detail_body.add_child(UI.label(
		"%.0f de daño causado · %d bajas" % [t.damage_dealt, t.kills],
		UI.FONT_MICRO, UI.TEXT_DIM))

	for path in TowerDefsScript.PATHS:
		var pid: String = path["id"]
		var cost: int = t.upgrade_cost(pid)
		var b := UI.button("", UI.FOCUS)
		if cost < 0:
			b.text = "%s · al máximo" % path["name"]
			b.disabled = true
		else:
			b.text = "%s %d  ⬢ %d" % [path["name"], t.levels[pid], cost]
			b.disabled = run.gold < cost
			b.pressed.connect(func(): upgrade_requested.emit(pid))
		_detail_body.add_child(b)

	var sell := UI.button("Vender  ⬢ %d" % int(round(float(t.invested) * Balance.SELL_RATIO)),
		UI.DANGER)
	sell.pressed.connect(func(): sell_requested.emit())
	_detail_body.add_child(sell)


func _refresh_draft() -> void:
	var showing: bool = run.phase == run.Phase.DRAFT and not run.cards.is_empty()
	_draft.visible = showing
	if not showing:
		return
	if _draft_row.get_child_count() == run.cards.size():
		return  # ya están puestas; no hace falta reconstruirlas cada refresco

	for c in _draft_row.get_children():
		c.queue_free()
	for card in run.cards:
		_draft_row.add_child(_card_button(card))


func _card_button(card: Dictionary) -> Button:
	var rarity: String = card["rarity"]
	var accent: Color = {
		"common": UI.TEXT, "rare": UI.FOCUS,
		"epic": Color8(0xd8, 0x9a, 0xff), "curse": UI.DANGER,
	}.get(rarity, UI.TEXT)

	var b := UI.button("", accent)
	b.custom_minimum_size = Vector2(230, 160)
	b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	# La rareza va escrita, no sólo en el color del borde: es lo que distingue
	# un pacto (que empeora algo) de una mejora limpia.
	b.text = "%s  %s\n%s\n\n%s" % [
		card["icon"], card["name"],
		Cards.RARITY[rarity]["name"].to_upper(),
		card["desc"]]
	b.pressed.connect(func(): card_chosen.emit(card))
	return b
