extends VBoxContainer
## City screen: the grid on top, a context panel below it (build menu for an
## empty tile, details and upgrade for a building), and the dungeon button.

const UI := preload("res://src/ui/ui_kit.gd")
const GridView := preload("res://src/ui/grid_view.gd")
const Sprites := preload("res://src/ui/sprites.gd")

var _grid: GridView
var _panel_body: VBoxContainer
var _selected := Vector2i(-1, -1)
## "" shows the tile panel; "dungeons" shows the dungeon list.
var _mode := ""
var _quest_box: PanelContainer
var _quest_signature := ""
var _signature := ""
var _check_left := 0.0
## Live widgets updated every frame without rebuilding the panel.
var _timer_label: Label
var _timer_bar: ProgressBar
var _skip_button: Button
var _craft_label: Label
var _craft_bar: ProgressBar
var _craft_skip: Button
var _daily_button: Button


func setup(_args: Dictionary) -> void:
	pass


func _ready() -> void:
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_theme_constant_override("separation", 12)

	_quest_box = PanelContainer.new()
	add_child(_quest_box)

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
	var dungeon := UI.button("Dungeon", _enter_dungeon, 88, "primary")
	dungeon.add_theme_font_size_override("font_size", UI.LARGE)
	dungeon.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bar.add_child(dungeon)
	var shop := _bar_button("Shop", "shop", 88)
	shop.custom_minimum_size.x = 200
	shop.size_flags_horizontal = Control.SIZE_FILL
	shop.add_theme_font_size_override("font_size", UI.LARGE)
	UI.style_button(shop, "selected")
	bar.add_child(shop)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	add_child(row)
	_daily_button = _bar_button("Daily", "daily")
	row.add_child(_bar_button("Heroes", "heroes"))
	row.add_child(_daily_button)
	row.add_child(_bar_button("Menu", "settings"))

	EventBus.building_changed.connect(func(_b): _rebuild_panel())
	EventBus.timer_finished.connect(func(_t): _rebuild_panel())
	EventBus.timer_started.connect(func(_t): _rebuild_panel())
	EventBus.quests_changed.connect(func():
		_rebuild_quest()
		_rebuild_panel())
	_rebuild_quest()
	_rebuild_panel()


func _process(delta: float) -> void:
	_update_live_widgets()
	_check_left -= delta
	if _check_left <= 0.0:
		_check_left = 0.5
		# Rebuild only when something visible changed (affordability, builders).
		if _panel_signature() != _signature:
			_rebuild_panel()
		if _quest_sig() != _quest_signature:
			_rebuild_quest()
		_update_daily_badge()


func _bar_button(text: String, screen: String, height: int = 72) -> Button:
	var b := UI.button(text, func(): EventBus.screen_requested.emit(screen, {}), height)
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return b


## The Daily button turns gold when there are rewards to collect.
func _update_daily_badge() -> void:
	var ready: bool = Game.daily.ready_count(Game.counters) > 0 or Game.shop.can_claim_card(Game.daily.today())
	_daily_button.text = "Daily !" if ready else "Daily"
	UI.style_button(_daily_button, "primary" if ready else "button")


func _on_tile_tapped(cell: Vector2i) -> void:
	_mode = ""
	_selected = Vector2i(-1, -1) if cell == _selected else cell
	_grid.selected = _selected
	_rebuild_panel()


func _selected_building() -> Dictionary:
	if _selected.x < 0:
		return {}
	return Game.city.building_at(_selected.x, _selected.y)


func _panel_signature() -> String:
	var parts := [str(_selected), _mode, str(Game.quests.is_complete(Game.quests.current(), Game.quest_facts()))]
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
		if b.id == "blacksmith":
			parts.append(str(Game.crafting.is_busy()))
			for r in Game.crafting.recipes():
				parts.append(Game.crafting.can_craft(r.id))
	return "|".join(parts)


func _rebuild_panel() -> void:
	_signature = _panel_signature()
	_timer_label = null
	_timer_bar = null
	_skip_button = null
	_craft_label = null
	_craft_bar = null
	_craft_skip = null
	for child in _panel_body.get_children():
		child.queue_free()
	var b := _selected_building()
	if _mode == "dungeons":
		_show_dungeons()
	elif _selected.x < 0:
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

	if b.id == "tavern" and int(b.level) >= 1:
		_show_recruits()
	if int(provides.get("crafting", 0)) > 0:
		_show_crafting()

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
	_add_buy_missing(data.get("cost", {}), reason)


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
	if data.has("build_seconds"):
		var time := UI.label(UI.format_time(float(data.build_seconds)), UI.SMALL, UI.MUTED)
		time.autowrap_mode = TextServer.AUTOWRAP_OFF
		time.mouse_filter = Control.MOUSE_FILTER_IGNORE
		name_row.add_child(time)
	column.add_child(UI.amounts_row(data.get("cost", {}), Content, UI.SMALL))
	if reason != "":
		var why := UI.label(reason, UI.SMALL, UI.BAD)
		why.mouse_filter = Control.MOUSE_FILTER_IGNORE
		column.add_child(why)
	return b


## "Buy missing for N gems" under a card that's short of resources.
func _add_buy_missing(cost: Dictionary, reason: String) -> void:
	if reason != "Not enough resources":
		return
	var gems: int = Game.shop.missing_gems(cost)
	if gems <= 0:
		return
	var b := UI.button("Buy what's missing for %d gems" % gems, func():
		if not Game.buy_missing(cost):
			EventBus.toast.emit("Not enough gems")
		_rebuild_panel(), 64, "primary")
	b.add_theme_font_size_override("font_size", UI.SMALL)
	b.disabled = Game.inventory.whole("gems") < gems
	_panel_body.add_child(b)


func _labeled_amounts(text: String, amounts: Dictionary) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	var l := UI.label(text, UI.FONT_SIZE)
	l.autowrap_mode = TextServer.AUTOWRAP_OFF
	row.add_child(l)
	row.add_child(UI.amounts_row(amounts, Content, UI.FONT_SIZE, UI.ACCENT))
	return row


func _update_live_widgets() -> void:
	if _craft_label != null:
		var craft: Dictionary = Game.crafting.current()
		if not craft.is_empty():
			var item_name := str(Content.entry("items", str(craft.data.get("item", ""))).get("name", "?"))
			_craft_label.text = "%s: %s left" % [item_name, UI.format_time(Game.timers.remaining(craft))]
			_craft_bar.value = Game.timers.progress(craft)
			var c := Game.skip_cost(craft)
			_craft_skip.text = "Finish now (free)" if c == 0 else "Finish now (%d gems)" % c
			_craft_skip.disabled = Game.inventory.whole("gems") < c
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


## Blacksmith recipes, or the item being crafted with its timer.
func _show_crafting() -> void:
	_panel_body.add_child(UI.label("Craft gear", UI.FONT_SIZE, UI.ACCENT))
	var timer: Dictionary = Game.crafting.current()
	if not timer.is_empty():
		var item: Dictionary = Content.entry("items", str(timer.data.get("item", "")))
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 12)
		_panel_body.add_child(row)
		var tex := Sprites.for_entry("items", item)
		if tex != null:
			row.add_child(UI.icon_rect(tex, 64))
		var column := VBoxContainer.new()
		column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(column)
		_craft_label = UI.label("", UI.FONT_SIZE)
		column.add_child(_craft_label)
		_craft_bar = UI.progress_bar()
		column.add_child(_craft_bar)
		var timer_id: String = timer.id
		_craft_skip = UI.button("", func(): Game.skip_timer(timer_id), 72, "primary")
		_panel_body.add_child(_craft_skip)
		_update_live_widgets()
	for r in Game.crafting.recipes():
		var item: Dictionary = Content.entry("items", str(r.item))
		var recipe_id: String = r.id
		var reason: String = Game.crafting.can_craft(recipe_id)
		var card := _build_card({"name": "%s  %s" % [item.get("name", r.item), _stat_text(item)]}, {"cost": r.get("cost", {}), "build_seconds": r.get("seconds", 0)}, reason, func(): Game.crafting.start(recipe_id))
		var tex := Sprites.for_entry("items", item)
		if tex != null:
			var row: HBoxContainer = card.get_child(0)
			var icon := UI.icon_rect(tex, 64)
			if reason != "":
				icon.modulate = Color(0.5, 0.5, 0.5)
			row.add_child(icon)
			row.move_child(icon, 0)
		_panel_body.add_child(card)


## "+7 ATK +2 SPD" from an item's stats, using stat short names from data.
func _stat_text(item: Dictionary) -> String:
	var parts: Array = []
	var stats: Dictionary = item.get("stats", {})
	for id in stats:
		var short := str(Content.entry("stats", id).get("short", id)).to_upper()
		parts.append("%s%d %s" % ["+" if int(stats[id]) >= 0 else "", int(stats[id]), short])
	return " ".join(parts)


func _place(id: String) -> void:
	if Game.city.place(id, _selected.x, _selected.y).is_empty():
		EventBus.toast.emit("Can't build that here")
	_rebuild_panel()


func _enter_dungeon() -> void:
	_mode = "" if _mode == "dungeons" else "dungeons"
	_selected = Vector2i(-1, -1)
	_grid.selected = _selected
	_rebuild_panel()


func _show_dungeons() -> void:
	_panel_body.add_child(UI.label("Dungeons", UI.LARGE, UI.ACCENT))
	for d in Content.list("dungeons"):
		var need := int(d.get("unlock_town_hall", 1))
		var locked := Game.city.town_hall_level() < need
		var b := Button.new()
		b.custom_minimum_size = Vector2(0, 112)
		b.disabled = locked
		var dungeon_id: String = d.id
		b.pressed.connect(func(): EventBus.screen_requested.emit("battle", {"dungeon": dungeon_id}))
		var column := VBoxContainer.new()
		column.alignment = BoxContainer.ALIGNMENT_CENTER
		column.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		column.offset_left = 14
		column.offset_right = -14
		column.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.add_child(column)
		var status := "Needs Town Hall %d" % need if locked else ("Cleared" if d.id in Game.cleared else "%d rooms" % d.get("rooms", []).size())
		var head := UI.label("%s  -  %s" % [d.get("name", d.id), status], UI.FONT_SIZE, Color("#8b9bb4") if locked else UI.TEXT)
		head.mouse_filter = Control.MOUSE_FILTER_IGNORE
		column.add_child(head)
		var about := UI.label(str(d.get("description", "")), UI.SMALL, UI.MUTED)
		about.mouse_filter = Control.MOUSE_FILTER_IGNORE
		column.add_child(about)
		_panel_body.add_child(b)
	var party: Array = Game.party.slice(0, Game.party_size()).map(func(id): return Content.entry("heroes", id).get("name", id))
	_panel_body.add_child(UI.label("Party: " + ", ".join(party), UI.SMALL, UI.MUTED))


func _show_recruits() -> void:
	var offers: Array = Game.recruitable()
	_panel_body.add_child(UI.label("Recruit heroes", UI.FONT_SIZE, UI.ACCENT))
	if offers.is_empty():
		_panel_body.add_child(UI.label("Everyone here has joined you.", UI.SMALL, UI.MUTED))
	for h in offers:
		var hero_id: String = h.id
		var reason: String = Game.can_recruit(hero_id)
		var card := _build_card({"name": "%s  (%s)" % [h.name, h.get("role", "")]}, {"cost": h.recruit.get("cost", {})}, reason, func(): Game.recruit(hero_id))
		var tex := Sprites.for_entry("heroes", h)
		if tex != null:
			var row: HBoxContainer = card.get_child(0)
			var icon := UI.icon_rect(tex, 80)
			row.add_child(icon)
			row.move_child(icon, 0)
		_panel_body.add_child(card)


## The current goal above the town, with its progress or a Claim button.
func _quest_sig() -> String:
	var q: Dictionary = Game.quests.current()
	return "%d/%s" % [Game.quests.index, str(Game.quests.progress(q, Game.quest_facts())) if not q.is_empty() else ""]


func _rebuild_quest() -> void:
	_quest_signature = _quest_sig()
	for child in _quest_box.get_children():
		child.queue_free()
	var q: Dictionary = Game.quests.current()
	_quest_box.visible = not q.is_empty()
	if q.is_empty():
		return
	var facts := Game.quest_facts()
	var done: bool = Game.quests.is_complete(q, facts)
	_quest_box.add_theme_stylebox_override("panel", UI.frame("parchment" if not done else "primary"))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	_quest_box.add_child(row)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 0)
	row.add_child(column)
	var p: Array = Game.quests.progress(q, facts)
	var title := str(q.text) + ("" if int(p[1]) <= 1 else "  %d/%d" % [mini(int(p[0]), int(p[1])), int(p[1])])
	var dark := Color("#3e2731")
	column.add_child(_shadowless(UI.label(title, UI.FONT_SIZE, dark if not done else UI.TEXT)))
	column.add_child(_shadowless(UI.label("Done! Claim your reward." if done else str(q.get("hint", "")), UI.SMALL, Color("#733e39") if not done else UI.TEXT)))
	var goal: Dictionary = q.get("goal", {})
	if done:
		var claim := UI.button("Claim", func(): Game.claim_quest(), 72, "selected")
		claim.custom_minimum_size.x = 150
		row.add_child(claim)
	elif goal.get("action", "") == "notifications":
		var on := UI.button("Turn on", _ask_notifications, 72, "primary")
		on.custom_minimum_size.x = 150
		row.add_child(on)


func _shadowless(l: Label) -> Label:
	l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0))
	return l


## Asks whether to notify; "Yes" also shows the phone's permission prompt.
func _ask_notifications() -> void:
	var dialog := ConfirmationDialog.new()
	dialog.dialog_text = "Get a notification when a build finishes?"
	dialog.ok_button_text = "Yes"
	dialog.cancel_button_text = "Not now"
	dialog.confirmed.connect(func(): Game.enable_notifications(true))
	dialog.canceled.connect(func(): Game.set_flag("notifications_asked", true))
	add_child(dialog)
	dialog.popup_centered()
