extends VBoxContainer
## Heroes screen: pick a hero, see their stat sheet (level, XP, stats with
## the part that comes from gear), and change their equipment. Everything
## shown comes from Game.roster, so new stats, slots and items appear
## without code changes.

const UI := preload("res://src/ui/ui_kit.gd")
const Sprites := preload("res://src/ui/sprites.gd")

var _selected := ""
## Slot whose item list is open, or "".
var _picking := ""
var _tabs: HBoxContainer
var _sheet: VBoxContainer


func setup(args: Dictionary) -> void:
	_selected = str(args.get("hero", ""))


func _ready() -> void:
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_theme_constant_override("separation", 10)

	var header := HBoxContainer.new()
	add_child(header)
	var title := _l("Heroes", UI.LARGE, UI.ACCENT)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(title)
	var back := UI.button("Back", func(): EventBus.screen_requested.emit("city", {}), 64)
	back.custom_minimum_size.x = 140
	header.add_child(back)

	_tabs = HBoxContainer.new()
	_tabs.add_theme_constant_override("separation", 8)
	add_child(_tabs)

	var panel := UI.panel()
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(panel)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	panel.add_child(scroll)
	_sheet = VBoxContainer.new()
	_sheet.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_sheet.add_theme_constant_override("separation", 12)
	scroll.add_child(_sheet)

	if not Game.roster.has_hero(_selected):
		_selected = Game.party[0] if not Game.party.is_empty() else str(Game.roster.heroes.keys().front())
	EventBus.heroes_changed.connect(func(_id): _rebuild())
	_rebuild()


func _rebuild() -> void:
	if not is_inside_tree():
		return
	_rebuild_tabs()
	for child in _sheet.get_children():
		child.queue_free()
	if _selected == "":
		return
	_show_sheet(_selected)


func _rebuild_tabs() -> void:
	for child in _tabs.get_children():
		child.queue_free()
	for id in Game.roster.heroes:
		var hero_id: String = id
		var b := Button.new()
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.custom_minimum_size = Vector2(0, 112)
		if hero_id == _selected:
			UI.style_button(b, "selected")
		b.pressed.connect(func():
			_selected = hero_id
			_picking = ""
			_rebuild())
		var column := VBoxContainer.new()
		column.alignment = BoxContainer.ALIGNMENT_CENTER
		column.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		column.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.add_child(column)
		var tex := Sprites.for_entry("heroes", Content.entry("heroes", hero_id))
		if tex != null:
			var icon := UI.icon_rect(tex, 64)
			icon.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
			column.add_child(icon)
		var l := _l("%s L%d" % [Content.entry("heroes", hero_id).get("name", hero_id), Game.roster.level(hero_id)], UI.SMALL)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		l.mouse_filter = Control.MOUSE_FILTER_IGNORE
		column.add_child(l)
		_tabs.add_child(b)


func _show_sheet(id: String) -> void:
	var roster = Game.roster
	var def: Dictionary = Content.entry("heroes", id)
	var h: Dictionary = roster.hero(id)

	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 16)
	_sheet.add_child(top)
	var frame := UI.panel("dark")
	top.add_child(frame)
	var tex := Sprites.for_entry("heroes", def)
	if tex != null:
		frame.add_child(UI.icon_rect(tex, 160))
	var info := VBoxContainer.new()
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info.add_theme_constant_override("separation", 6)
	top.add_child(info)
	info.add_child(_l(str(def.get("name", id)), UI.LARGE, UI.ACCENT))
	var rarity: Dictionary = Content.setting("rarities", {}).get(str(def.get("rarity", "common")), {})
	info.add_child(_l("%s  %s" % [rarity.get("name", ""), def.get("role", "")], UI.SMALL, Color(str(rarity.get("color", "#c0cbdc")))))
	info.add_child(_l("Level %d" % int(h.level), UI.FONT_SIZE))
	var bar := UI.progress_bar(UI.ENERGY, 18)
	var need: int = roster.xp_to_next(int(h.level))
	var maxed: bool = int(h.level) >= roster.max_level()
	bar.value = 1.0 if maxed else float(h.xp) / float(need)
	info.add_child(bar)
	info.add_child(_l("Max level" if maxed else "XP %d / %d" % [int(h.xp), need], UI.SMALL, UI.MUTED))

	_sheet.add_child(_l("Stats", UI.FONT_SIZE, UI.ACCENT))
	var total: Dictionary = roster.stats(id)
	var gear: Dictionary = roster.gear_stats(id)
	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 24)
	grid.add_theme_constant_override("v_separation", 4)
	_sheet.add_child(grid)
	for stat in Content.list("stats"):
		var name_label := _l(str(stat.name), UI.FONT_SIZE, Color(str(stat.get("color", "#ead4aa"))))
		name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		grid.add_child(name_label)
		grid.add_child(_l(str(int(total.get(stat.id, 0))), UI.FONT_SIZE))
		var bonus := int(gear.get(stat.id, 0))
		grid.add_child(_l("" if bonus == 0 else "%+d gear" % bonus, UI.SMALL, UI.GOOD if bonus > 0 else UI.BAD))

	_sheet.add_child(_l("Equipment", UI.FONT_SIZE, UI.ACCENT))
	for slot in roster.slots():
		var slot_id := str(slot.id)
		var uid := str(h.gear.get(slot_id, ""))
		_sheet.add_child(_slot_row(slot, uid))
		if _picking == slot_id:
			_show_picker(id, slot_id, uid)

	var bag: Array = roster.free_items()
	_sheet.add_child(_l("Bag (%d)" % bag.size(), UI.FONT_SIZE, UI.ACCENT))
	if bag.is_empty():
		_sheet.add_child(_l("No spare items. Bosses drop new gear.", UI.SMALL, UI.MUTED))
	for item in bag:
		_sheet.add_child(_item_line(item.id, ""))


func _slot_row(slot: Dictionary, uid: String) -> Button:
	var b := Button.new()
	b.custom_minimum_size = Vector2(0, 88)
	var slot_id := str(slot.id)
	if _picking == slot_id:
		UI.style_button(b, "selected")
	b.pressed.connect(func():
		_picking = "" if _picking == slot_id else slot_id
		_rebuild())
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	row.offset_left = 14
	row.offset_right = -14
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(row)
	var slot_label := _l(str(slot.get("name", slot_id)), UI.SMALL, UI.MUTED)
	slot_label.custom_minimum_size.x = 130
	slot_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	slot_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(slot_label)
	if uid == "":
		var empty := _l("Empty - tap to equip", UI.SMALL, Color("#8b9bb4"))
		empty.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		empty.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.add_child(empty)
	else:
		row.add_child(_item_line(Game.roster.items[uid].id, "", true))
	return b


func _show_picker(hero_id: String, slot_id: String, worn_uid: String) -> void:
	var box := UI.panel("dark")
	_sheet.add_child(box)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 6)
	box.add_child(column)
	var options: Array = Game.roster.free_items(slot_id)
	if options.is_empty():
		column.add_child(_l("No spare items for this slot.", UI.SMALL, UI.MUTED))
	for item in options:
		var item_uid: String = item.uid
		var b := Button.new()
		b.custom_minimum_size = Vector2(0, 76)
		b.pressed.connect(func():
			Game.roster.equip(hero_id, item_uid)
			_picking = ""
			Game.save_game())
		var line := _item_line(item.id, "Equip")
		line.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		line.offset_left = 12
		line.offset_right = -12
		b.add_child(line)
		column.add_child(b)
	if worn_uid != "":
		column.add_child(UI.button("Take off", func():
			Game.roster.unequip(hero_id, slot_id)
			_picking = ""
			Game.save_game(), 64, "danger"))


## Icon, name in its rarity color, and what it adds ("+4 ATK +1 SPD").
func _item_line(item_id: String, action: String, compact: bool = false) -> HBoxContainer:
	var def: Dictionary = Content.entry("items", item_id)
	var rarity: Dictionary = Content.setting("rarities", {}).get(str(def.get("rarity", "common")), {})
	var color := Color(str(rarity.get("color", "#c0cbdc")))
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var tex := Sprites.for_entry("items", def)
	if tex != null:
		row.add_child(UI.icon_rect(tex, 44))
	else:
		var swatch := PanelContainer.new()
		swatch.custom_minimum_size = Vector2(44, 44)
		swatch.add_theme_stylebox_override("panel", UI.flat(color.darkened(0.4)))
		swatch.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var letter := _l(str(def.get("name", "?")).left(1), UI.FONT_SIZE, color)
		letter.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		letter.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		swatch.add_child(letter)
		row.add_child(swatch)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(column)
	var name_label := _l(str(def.get("name", item_id)), UI.SMALL, color)
	name_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(name_label)
	var bonus := _l(stat_summary(def.get("stats", {})), UI.SMALL, UI.TEXT)
	bonus.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(bonus)
	if action != "" and not compact:
		var act := _l(action, UI.SMALL, UI.ACCENT)
		act.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		act.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.add_child(act)
	return row


## A one-line label (these sit in rows and grids, where wrapping squeezes them).
static func _l(text: String, font_size: int = UI.FONT_SIZE, color: Color = UI.TEXT) -> Label:
	var l := UI.label(text, font_size, color)
	l.autowrap_mode = TextServer.AUTOWRAP_OFF
	return l


static func stat_summary(stats: Dictionary) -> String:
	var parts: Array = []
	for stat in Content.list("stats"):
		if stats.has(stat.id):
			parts.append("%+d %s" % [int(stats[stat.id]), str(stat.get("short", stat.id))])
	return " ".join(parts)
