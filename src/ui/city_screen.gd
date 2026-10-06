extends VBoxContainer
## City screen: the grid on top, a context panel below it (build menu for an
## empty tile, details and upgrade for a building), and the dungeon button.

const UI := preload("res://src/ui/ui_kit.gd")
const GridView := preload("res://src/ui/grid_view.gd")
const Sprites := preload("res://src/ui/sprites.gd")

var _grid: GridView
var _panel_body: VBoxContainer
var _selected := Vector2i(-1, -1)
var _signature := ""
var _check_left := 0.0
## Live widgets updated every frame without rebuilding the panel.
var _timer_label: Label
var _timer_bar: ProgressBar
var _skip_button: Button


func setup(_args: Dictionary) -> void:
	pass


func _ready() -> void:
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_theme_constant_override("separation", 12)

	_grid = GridView.new()
	_grid.city = Game.city
	_grid.tile_tapped.connect(_on_tile_tapped)
	add_child(_grid)

	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(0, 380)
	add_child(panel)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	panel.add_child(scroll)
	_panel_body = VBoxContainer.new()
	_panel_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_panel_body.add_theme_constant_override("separation", 10)
	scroll.add_child(_panel_body)

	var bar := HBoxContainer.new()
	bar.add_theme_constant_override("separation", 12)
	add_child(bar)
	var dungeon := UI.button("Dungeon", _enter_dungeon, 96, "primary")
	dungeon.add_theme_font_size_override("font_size", UI.LARGE)
	dungeon.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bar.add_child(dungeon)
	var heroes := UI.button("Heroes", func(): EventBus.screen_requested.emit("heroes", {}), 96)
	heroes.custom_minimum_size.x = 170
	bar.add_child(heroes)
	var reset := UI.button("New", _confirm_reset, 96, "danger")
	reset.add_theme_font_size_override("font_size", UI.SMALL)
	reset.custom_minimum_size.x = 110
	bar.add_child(reset)

	EventBus.building_changed.connect(func(_b): _rebuild_panel())
	EventBus.timer_finished.connect(func(_t): _rebuild_panel())
	_rebuild_panel()


func _process(delta: float) -> void:
	_update_live_widgets()
	_check_left -= delta
	if _check_left <= 0.0:
		_check_left = 0.5
		# Rebuild only when something visible changed (affordability, builders).
		if _panel_signature() != _signature:
			_rebuild_panel()


func _on_tile_tapped(cell: Vector2i) -> void:
	_selected = Vector2i(-1, -1) if cell == _selected else cell
	_grid.selected = _selected
	_rebuild_panel()


func _selected_building() -> Dictionary:
	if _selected.x < 0:
		return {}
	return Game.city.building_at(_selected.x, _selected.y)


func _panel_signature() -> String:
	var parts := [str(_selected)]
	var b := _selected_building()
	if _selected.x < 0:
		pass
	elif b.is_empty():
		for def in Content.list("buildings"):
			parts.append(Game.city.can_place(def.id, _selected.x, _selected.y))
	else:
		parts.append(str(b.level))
		parts.append(Game.city.can_upgrade(b.uid))
		parts.append(str(Game.city.is_busy(b.uid)))
	return "|".join(parts)


func _rebuild_panel() -> void:
	_signature = _panel_signature()
	_timer_label = null
	_timer_bar = null
	_skip_button = null
	for child in _panel_body.get_children():
		child.queue_free()
	var b := _selected_building()
	if _selected.x < 0:
		_show_overview()
	elif b.is_empty():
		_show_build_menu()
	else:
		_show_building(b)


func _show_overview() -> void:
	_panel_body.add_child(UI.label("Your town  -  Town Hall L%d" % Game.city.town_hall_level(), UI.LARGE, UI.ACCENT))
	_panel_body.add_child(UI.label("Tap an empty tile to build, or tap a building to upgrade it.", UI.SMALL, UI.MUTED))
	var rates: Dictionary = Game.city.production_per_hour()
	var per_hour := {}
	for id in rates:
		per_hour[id] = roundi(rates[id])
	_panel_body.add_child(_labeled_amounts("Makes per hour", per_hour))


func _show_build_menu() -> void:
	_panel_body.add_child(UI.label("Build here", UI.LARGE, UI.ACCENT))
	for def in Content.list("buildings"):
		if Game.city.max_count(def.id) <= 0 and Game.city.town_hall_level() >= int(def.get("unlock_town_hall", 1)):
			continue
		if def.id == "town_hall":
			continue
		var data: Dictionary = Game.city.level_data(def.id, 1)
		var reason: String = Game.city.can_place(def.id, _selected.x, _selected.y)
		var id: String = def.id
		_panel_body.add_child(_build_card(def, data, reason, func(): _place(id)))


func _show_building(b: Dictionary) -> void:
	var city = Game.city
	var def: Dictionary = city.definition(b.id)
	var title := str(def.get("name", b.id))
	title += " (building)" if int(b.level) == 0 else " level %d" % int(b.level)
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 12)
	_panel_body.add_child(head)
	var tex := Sprites.for_entry("buildings", def)
	if tex != null:
		head.add_child(UI.icon_rect(tex, 96))
	var info := VBoxContainer.new()
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(info)
	info.add_child(UI.label(title, UI.LARGE, UI.ACCENT))
	info.add_child(UI.label(str(def.get("description", "")), UI.SMALL, UI.MUTED))
	var provides: Dictionary = city.level_data(b.id, int(b.level)).get("provides", {})
	if provides.has("production"):
		_panel_body.add_child(_labeled_amounts("Makes per hour", provides.production))
	if provides.has("storage"):
		_panel_body.add_child(_labeled_amounts("Adds storage", provides.storage))

	var timer: Dictionary = city.timer_for(b.uid)
	if not timer.is_empty():
		_timer_label = UI.label("", UI.FONT_SIZE)
		_panel_body.add_child(_timer_label)
		_timer_bar = UI.progress_bar()
		_panel_body.add_child(_timer_bar)
		var timer_id: String = timer.id
		_skip_button = UI.button("", func(): Game.skip_timer(timer_id), 72, "primary")
		_panel_body.add_child(_skip_button)
		_update_live_widgets()
		return

	var next := int(b.level) + 1
	if next > city.max_level(b.id):
		_panel_body.add_child(UI.label("Max level reached", UI.FONT_SIZE, UI.GOOD))
		return
	var data: Dictionary = city.level_data(b.id, next)
	var reason: String = city.can_upgrade(b.uid)
	var uid: String = b.uid
	var card := _build_card({"name": "Upgrade to level %d" % next}, data, reason, func(): Game.city.upgrade(uid))
	_panel_body.add_child(card)


## A tappable card: sprite, name, cost icons and build time, or why it can't be built.
func _build_card(def: Dictionary, data: Dictionary, reason: String, on_pressed: Callable) -> Button:
	var b := Button.new()
	b.custom_minimum_size = Vector2(0, 104)
	b.disabled = reason != ""
	b.pressed.connect(on_pressed)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	row.offset_left = 14
	row.offset_right = -14
	b.add_child(row)
	var tex := Sprites.for_entry("buildings", def) if def.has("id") else null
	if tex != null:
		var icon := UI.icon_rect(tex, 80)
		if reason != "":
			icon.modulate = Color(0.5, 0.5, 0.5)
		row.add_child(icon)
	var column := VBoxContainer.new()
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_theme_constant_override("separation", 2)
	row.add_child(column)
	var name_row := HBoxContainer.new()
	name_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(name_row)
	var title := UI.label(str(def.get("name", "?")), UI.FONT_SIZE, UI.TEXT if reason == "" else Color("#8b9bb4"))
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	name_row.add_child(title)
	var time := UI.label(UI.format_time(float(data.get("build_seconds", 0))), UI.SMALL, UI.MUTED)
	time.autowrap_mode = TextServer.AUTOWRAP_OFF
	time.mouse_filter = Control.MOUSE_FILTER_IGNORE
	name_row.add_child(time)
	column.add_child(UI.amounts_row(data.get("cost", {}), Content, UI.SMALL))
	if reason != "":
		var why := UI.label(reason, UI.SMALL, UI.BAD)
		why.mouse_filter = Control.MOUSE_FILTER_IGNORE
		column.add_child(why)
	return b


func _labeled_amounts(text: String, amounts: Dictionary) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	var l := UI.label(text, UI.FONT_SIZE)
	l.autowrap_mode = TextServer.AUTOWRAP_OFF
	row.add_child(l)
	row.add_child(UI.amounts_row(amounts, Content, UI.FONT_SIZE, UI.ACCENT))
	return row


func _update_live_widgets() -> void:
	if _timer_label == null:
		return
	var b := _selected_building()
	var timer: Dictionary = Game.city.timer_for(b.get("uid", ""))
	if timer.is_empty():
		return
	var target := int(timer.data.get("target_level", 1))
	_timer_label.text = "Building level %d: %s left" % [target, UI.format_time(Game.timers.remaining(timer))]
	_timer_bar.value = Game.timers.progress(timer)
	var cost := Game.skip_cost(timer)
	_skip_button.text = "Finish now (free)" if cost == 0 else "Finish now (%d gems)" % cost
	_skip_button.disabled = Game.inventory.whole("gems") < cost


func _place(id: String) -> void:
	if Game.city.place(id, _selected.x, _selected.y).is_empty():
		EventBus.toast.emit("Can't build that here")
	_rebuild_panel()


func _enter_dungeon() -> void:
	var dungeons: Array = Content.list("dungeons").filter(
		func(d): return Game.city.town_hall_level() >= int(d.get("unlock_town_hall", 1)))
	if dungeons.is_empty():
		EventBus.toast.emit("No dungeon unlocked yet")
		return
	EventBus.screen_requested.emit("battle", {"dungeon": dungeons[0].id})


func _confirm_reset() -> void:
	var dialog := ConfirmationDialog.new()
	dialog.dialog_text = "Start a new game? Your current town will be lost."
	dialog.confirmed.connect(func():
		Game.reset_game()
		_selected = Vector2i(-1, -1)
		_grid.selected = _selected
		_rebuild_panel())
	add_child(dialog)
	dialog.popup_centered()
