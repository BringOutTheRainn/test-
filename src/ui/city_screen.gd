extends VBoxContainer
## City screen: the grid on top, a context panel below it (build menu for an
## empty tile, details and upgrade for a building), and the dungeon button.

const UI := preload("res://src/ui/ui_kit.gd")
const GridView := preload("res://src/ui/grid_view.gd")

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
	var dungeon := UI.button("Enter dungeon", _enter_dungeon, 88)
	dungeon.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bar.add_child(dungeon)
	var reset := UI.button("New game", _confirm_reset, 88)
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
	_panel_body.add_child(UI.label("Your town", 32, UI.ACCENT))
	_panel_body.add_child(UI.label("Tap an empty tile to build, or tap a building to upgrade it.", 24, UI.MUTED))
	var rates: Dictionary = Game.city.production_per_hour()
	var per_hour := {}
	for id in rates:
		per_hour[id] = roundi(rates[id])
	_panel_body.add_child(UI.label("Production per hour: " + UI.format_amounts(per_hour, Content), 24))
	_panel_body.add_child(UI.label("Town Hall level %d" % Game.city.town_hall_level(), 24))


func _show_build_menu() -> void:
	_panel_body.add_child(UI.label("Build here", 32, UI.ACCENT))
	for def in Content.list("buildings"):
		if Game.city.max_count(def.id) <= 0 and Game.city.town_hall_level() >= int(def.get("unlock_town_hall", 1)):
			continue
		if def.id == "town_hall":
			continue
		var data: Dictionary = Game.city.level_data(def.id, 1)
		var reason: String = Game.city.can_place(def.id, _selected.x, _selected.y)
		var text := "%s  (%s, %s)" % [def.name, UI.format_amounts(data.get("cost", {}), Content), UI.format_time(float(data.get("build_seconds", 0)))]
		if reason != "":
			text += "\n" + reason
		var id: String = def.id
		var b := UI.button(text, func(): _place(id), 84)
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		b.disabled = reason != ""
		_panel_body.add_child(b)


func _show_building(b: Dictionary) -> void:
	var city = Game.city
	var def: Dictionary = city.definition(b.id)
	var title := str(def.get("name", b.id))
	title += " (building)" if int(b.level) == 0 else " level %d" % int(b.level)
	_panel_body.add_child(UI.label(title, 32, UI.ACCENT))
	_panel_body.add_child(UI.label(str(def.get("description", "")), 24, UI.MUTED))
	var provides: Dictionary = city.level_data(b.id, int(b.level)).get("provides", {})
	if provides.has("production"):
		_panel_body.add_child(UI.label("Makes per hour: " + UI.format_amounts(provides.production, Content), 24))
	if provides.has("storage"):
		_panel_body.add_child(UI.label("Adds storage: " + UI.format_amounts(provides.storage, Content), 24))

	var timer: Dictionary = city.timer_for(b.uid)
	if not timer.is_empty():
		_timer_label = UI.label("", 24)
		_panel_body.add_child(_timer_label)
		_timer_bar = UI.progress_bar()
		_panel_body.add_child(_timer_bar)
		var timer_id: String = timer.id
		_skip_button = UI.button("", func(): Game.skip_timer(timer_id))
		_panel_body.add_child(_skip_button)
		_update_live_widgets()
		return

	var next := int(b.level) + 1
	if next > city.max_level(b.id):
		_panel_body.add_child(UI.label("Max level reached", 24, UI.GOOD))
		return
	var data: Dictionary = city.level_data(b.id, next)
	var reason: String = city.can_upgrade(b.uid)
	var text := "Upgrade to level %d  (%s, %s)" % [next, UI.format_amounts(data.get("cost", {}), Content), UI.format_time(float(data.get("build_seconds", 0)))]
	if reason != "":
		text += "\n" + reason
	var uid: String = b.uid
	var button := UI.button(text, func(): Game.city.upgrade(uid), 84)
	button.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	button.disabled = reason != ""
	_panel_body.add_child(button)


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
