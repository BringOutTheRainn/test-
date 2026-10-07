extends VBoxContainer
## Heroes screen: pick a hero, then shape them. Every hero starts as the same
## blank recruit; this is where the player spends stat points, learns skills
## from the paths in data/paths, changes gear (which also changes how the hero
## looks) and picks their row and whether they fight. Everything shown comes
## from Game.roster and data, so new stats, slots, items, paths and skills
## appear without code changes.

const UI := preload("res://src/ui/ui_kit.gd")
const Sprites := preload("res://src/ui/sprites.gd")

var _selected := ""
## "build" (stats and gear) or "skills".
var _tab := "build"
## Slot whose item list is open, or "".
var _picking := ""
var _tabs: HBoxContainer
var _scroll: ScrollContainer
var _sheet: VBoxContainer


func setup(args: Dictionary) -> void:
	_selected = str(args.get("hero", ""))
	_tab = str(args.get("tab", "build"))


func _ready() -> void:
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_theme_constant_override("separation", 10)
	add_child(UI.header("Heroes"))

	var tab_scroll := ScrollContainer.new()
	tab_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	tab_scroll.scroll_deadzone = 12
	tab_scroll.custom_minimum_size.y = 132
	add_child(tab_scroll)
	_tabs = HBoxContainer.new()
	_tabs.add_theme_constant_override("separation", 8)
	_tabs.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	tab_scroll.add_child(_tabs)

	var panel := UI.panel()
	panel.size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_child(panel)
	_scroll = UI.scroller()
	panel.add_child(_scroll)
	_sheet = VBoxContainer.new()
	_sheet.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_sheet.add_theme_constant_override("separation", 12)
	_scroll.add_child(_sheet)

	if not Game.roster.has_hero(_selected):
		_selected = Game.party[0] if not Game.party.is_empty() else str(Game.roster.heroes.keys().front())
	EventBus.heroes_changed.connect(func(_id): _rebuild())
	EventBus.resources_changed.connect(_rebuild_soon)
	_rebuild()


var _pending := false


func _rebuild_soon() -> void:
	if not _pending:
		_pending = true
		_rebuild.call_deferred()


func _rebuild() -> void:
	_pending = false
	if not is_inside_tree():
		return
	# Keep the scroll position: spending a point should not jump to the top.
	var keep := _scroll.scroll_vertical
	_rebuild_tabs()
	UI.clear(_sheet)
	if _selected != "":
		_show_sheet(_selected)
	_restore_scroll.call_deferred(keep)


func _restore_scroll(value: int) -> void:
	await get_tree().process_frame
	if is_instance_valid(_scroll):
		_scroll.scroll_vertical = value


func _rebuild_tabs() -> void:
	UI.clear(_tabs)
	for id in Game.roster.heroes:
		var hero_id: String = id
		var b := Button.new()
		b.custom_minimum_size = Vector2(150, 124)
		if hero_id == _selected:
			UI.style_button(b, "selected")
		b.pressed.connect(func():
			_selected = hero_id
			_picking = ""
			_scroll.scroll_vertical = 0
			_rebuild())
		var column := VBoxContainer.new()
		column.alignment = BoxContainer.ALIGNMENT_CENTER
		column.add_theme_constant_override("separation", 0)
		column.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		column.mouse_filter = Control.MOUSE_FILTER_IGNORE
		b.add_child(column)
		var tex := Sprites.layered(Game.roster.look(hero_id))
		if tex != null:
			var icon := UI.icon_rect(tex, 72)
			icon.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
			if not Game.in_party(hero_id):
				icon.modulate = Color(0.6, 0.6, 0.6)
			column.add_child(icon)
		var l := _l("%s L%d" % [Game.roster.hero_name(hero_id), Game.roster.level(hero_id)], UI.SMALL)
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		l.mouse_filter = Control.MOUSE_FILTER_IGNORE
		column.add_child(l)
		var unspent: int = Game.roster.stat_points_left(hero_id) + Game.roster.skill_points_left(hero_id)
		if unspent > 0:
			var dot := _l(_points(unspent), UI.SMALL, UI.GOOD)
			dot.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			dot.mouse_filter = Control.MOUSE_FILTER_IGNORE
			column.add_child(dot)
		_tabs.add_child(b)


func _show_sheet(id: String) -> void:
	var roster = Game.roster
	var h: Dictionary = roster.hero(id)
	var role: Dictionary = roster.role(id)

	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 16)
	_sheet.add_child(top)
	var frame := UI.panel("dark")
	top.add_child(frame)
	var tex := Sprites.layered(roster.look(id))
	if tex != null:
		frame.add_child(UI.icon_rect(tex, 176))
	var info := VBoxContainer.new()
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	info.add_theme_constant_override("separation", 6)
	top.add_child(info)
	var name_row := HBoxContainer.new()
	info.add_child(name_row)
	var name_label := _l(roster.hero_name(id), UI.LARGE, UI.ACCENT)
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_row.add_child(name_label)
	var rename := UI.button("Rename", func(): _ask_name(id), 48)
	rename.add_theme_font_size_override("font_size", UI.SMALL)
	name_row.add_child(rename)
	var title := str(role.name) if str(role.role) == "" else "%s  -  %s" % [role.name, role.role]
	info.add_child(_l(title, UI.FONT_SIZE, Color(str(role.color))))
	info.add_child(_l("Level %d" % int(h.level), UI.FONT_SIZE))
	var bar := UI.progress_bar(UI.ENERGY, 18)
	var need: int = roster.xp_to_next(int(h.level))
	var maxed: bool = int(h.level) >= roster.max_level()
	bar.value = 1.0 if maxed else float(h.xp) / float(need)
	info.add_child(bar)
	info.add_child(_l("Max level" if maxed else "XP %d / %d" % [int(h.xp), need], UI.SMALL, UI.MUTED))

	# Where they stand and whether they fight.
	var toggles := HBoxContainer.new()
	toggles.add_theme_constant_override("separation", 8)
	_sheet.add_child(toggles)
	var front: bool = roster.row(id) == "front"
	var row_button := UI.button("Front row" if front else "Back row", func():
		roster.set_row(id, "back" if front else "front")
		Game.save_game(), 64)
	row_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	toggles.add_child(row_button)
	var fighting: bool = Game.in_party(id)
	var party_button := UI.button("In the party" if fighting else "On the bench", func(): Game.toggle_party(id), 64, "primary" if fighting else "button")
	party_button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	party_button.disabled = fighting and Game.party.size() <= 1
	toggles.add_child(party_button)

	var switch := HBoxContainer.new()
	switch.add_theme_constant_override("separation", 8)
	_sheet.add_child(switch)
	for tab in [["build", "Stats & Gear", roster.stat_points_left(id)], ["skills", "Skills", roster.skill_points_left(id)]]:
		var tab_id: String = tab[0]
		var text: String = tab[1] if int(tab[2]) <= 0 else "%s (%d)" % [tab[1], int(tab[2])]
		var b := UI.button(text, func():
			_tab = tab_id
			_picking = ""
			_rebuild(), 64, "selected" if _tab == tab_id else "button")
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		switch.add_child(b)

	if _tab == "skills":
		_show_skills(id)
	else:
		_show_build(id)


# --- Stats and gear ---------------------------------------------------------------

func _show_build(id: String) -> void:
	var roster = Game.roster
	var h: Dictionary = roster.hero(id)
	var left: int = roster.stat_points_left(id)
	var head := HBoxContainer.new()
	_sheet.add_child(head)
	var stats_label := _l("Stats", UI.FONT_SIZE, UI.ACCENT)
	stats_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(stats_label)
	head.add_child(_l(_points(left) + " to spend" if left > 0 else "No points to spend", UI.SMALL, UI.GOOD if left > 0 else UI.MUTED))

	var total: Dictionary = roster.stats(id)
	var gear: Dictionary = roster.gear_stats(id)
	var points: Dictionary = h.get("points", {})
	for stat in Content.list("stats"):
		var stat_id := str(stat.id)
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 12)
		_sheet.add_child(row)
		var name_label := _l(str(stat.name), UI.FONT_SIZE, Color(str(stat.get("color", "#ead4aa"))))
		name_label.custom_minimum_size.x = 180
		row.add_child(name_label)
		var value := _l(str(int(total.get(stat_id, 0))), UI.FONT_SIZE)
		value.custom_minimum_size.x = 80
		row.add_child(value)
		var parts: Array = []
		if int(points.get(stat_id, 0)) > 0:
			parts.append(_points(int(points[stat_id]), "pt"))
		if int(gear.get(stat_id, 0)) != 0:
			parts.append("%+d gear" % int(gear[stat_id]))
		var detail := _l("  ".join(parts), UI.SMALL, UI.MUTED)
		detail.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(detail)
		var plus := UI.button("+%s" % _num(roster.per_point(stat_id)), func():
			roster.add_stat_point(id, stat_id)
			Game.save_game(), 56, "primary")
		plus.custom_minimum_size.x = 96
		plus.add_theme_font_size_override("font_size", UI.SMALL)
		plus.disabled = left <= 0
		row.add_child(plus)

	_sheet.add_child(_l("Equipment", UI.FONT_SIZE, UI.ACCENT))
	var weapon: String = roster.weapon_type(id)
	var attack: Dictionary = Content.entry("skills", roster.basic_attack(id))
	_sheet.add_child(UI.label("Attack: %s%s" % [attack.get("name", "?"), "" if weapon != "" else " (no weapon)"], UI.SMALL, UI.MUTED))
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


## Icon, name in its rarity color, and what it adds ("+4 ATK +1 SPD", plus
## the weapon type, which some skills need).
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
		row.add_child(swatch)
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(column)
	var title := str(def.get("name", item_id))
	if def.has("weapon_type"):
		title += "  (%s)" % str(def.weapon_type).capitalize()
	var name_label := _l(title, UI.SMALL, color)
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


# --- Skills -------------------------------------------------------------------------

func _show_skills(id: String) -> void:
	var roster = Game.roster
	var left: int = roster.skill_points_left(id)
	_sheet.add_child(UI.label("%s to spend. You get 1 each level." % _points(left, "skill point") if left > 0 else "No skill points to spend. You get 1 each level.", UI.SMALL, UI.GOOD if left > 0 else UI.MUTED))
	for p in roster.paths():
		_show_path(id, p)

	var cost: Dictionary = Game.respec_cost(id)
	var reason: String = Game.can_respec(id)
	var reset_box := UI.panel("dark")
	_sheet.add_child(reset_box)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 6)
	reset_box.add_child(column)
	column.add_child(UI.label("Reset points", UI.FONT_SIZE, UI.ACCENT))
	column.add_child(UI.label("Get back every skill and stat point to spend again.", UI.SMALL, UI.MUTED))
	var reset := UI.button("Reset for %s" % UI.format_amounts(cost, Content), func(): Game.respec(id), 64, "danger")
	reset.disabled = reason != ""
	column.add_child(reset)
	if reason != "" and reason != "Nothing to reset":
		column.add_child(UI.label(reason, UI.SMALL, UI.BAD))


func _show_path(id: String, p: Dictionary) -> void:
	var roster = Game.roster
	var color := Color(str(p.get("color", "#ead4aa")))
	var box := UI.panel("dark")
	_sheet.add_child(box)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	box.add_child(column)
	var head := HBoxContainer.new()
	column.add_child(head)
	var title := _l("%s  -  %s" % [p.get("name", p.id), p.get("role", "")], UI.FONT_SIZE, color)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(title)
	head.add_child(_l(_points(roster.path_points(id, str(p.id)), "pt"), UI.SMALL, UI.TEXT))
	column.add_child(UI.label(str(p.get("description", "")), UI.SMALL, UI.MUTED))
	var tier := 0
	for node in p.get("nodes", []):
		if int(node.get("tier", 1)) != tier:
			tier = int(node.get("tier", 1))
			var need: int = roster.points_for_tier(tier)
			var open: bool = roster.path_points(id, str(p.id)) >= need
			column.add_child(_l("Tier %d%s" % [tier, "" if need == 0 else "  (needs %d pts here)" % need], UI.SMALL, UI.TEXT if open else Color("#8b9bb4")))
		column.add_child(_skill_button(id, str(node.skill), color))


func _skill_button(hero_id: String, skill_id: String, color: Color) -> Button:
	var roster = Game.roster
	var def: Dictionary = Content.entry("skills", skill_id)
	var rank: int = roster.skill_rank(hero_id, skill_id)
	var top: int = roster.max_rank(skill_id)
	var reason: String = roster.can_learn(hero_id, skill_id)
	var b := Button.new()
	b.custom_minimum_size = Vector2(0, 96)
	if rank > 0:
		UI.style_button(b, "primary" if rank >= top else "button")
	b.disabled = reason != "" and rank == 0
	b.pressed.connect(func():
		if roster.learn(hero_id, skill_id):
			Game.save_game())
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 0)
	column.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	column.offset_left = 14
	column.offset_right = -14
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(column)
	var line := HBoxContainer.new()
	line.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(line)
	var name_label := _l(str(def.get("name", skill_id)), UI.SMALL, color if reason == "" or rank > 0 else Color("#8b9bb4"))
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	line.add_child(name_label)
	var tags: Array = []
	if def.get("passive", false):
		tags.append("Passive")
	elif int(def.get("cost", 0)) > 0:
		tags.append("%d energy" % int(def.cost))
	tags.append("%d/%d" % [rank, top] if top > 1 else ("Learned" if rank > 0 else "Learn"))
	var tag := _l("  ".join(tags), UI.SMALL, UI.ENERGY if reason == "" else UI.MUTED)
	tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
	line.add_child(tag)
	var about := UI.label(str(def.get("description", "")), UI.SMALL, UI.TEXT)
	about.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(about)
	var warn := ""
	if rank > 0 and not def.get("passive", false) and not roster.weapon_allows(hero_id, skill_id):
		warn = "Can't use it with this weapon"
	elif rank == 0 and reason != "" and reason != "No skill points left":
		warn = reason
	if warn != "":
		var w := _l(warn, UI.SMALL, UI.BAD)
		w.mouse_filter = Control.MOUSE_FILTER_IGNORE
		column.add_child(w)
	return b


# --- Rename -------------------------------------------------------------------------

func _ask_name(id: String) -> void:
	var dialog := ConfirmationDialog.new()
	dialog.title = "Rename"
	var edit := LineEdit.new()
	edit.text = Game.roster.hero_name(id)
	edit.max_length = 16
	edit.custom_minimum_size = Vector2(360, 64)
	dialog.add_child(edit)
	dialog.ok_button_text = "Save"
	dialog.confirmed.connect(func():
		Game.roster.rename(id, edit.text)
		Game.save_game())
	add_child(dialog)
	dialog.popup_centered()
	edit.grab_focus()


## A one-line label (these sit in rows and grids, where wrapping squeezes them).
static func _l(text: String, font_size: int = UI.FONT_SIZE, color: Color = UI.TEXT) -> Label:
	var l := UI.label(text, font_size, color)
	l.autowrap_mode = TextServer.AUTOWRAP_OFF
	return l


static func _points(n: int, word: String = "point") -> String:
	return "%d %s%s" % [n, word, "" if n == 1 else "s"]


static func _num(value: float) -> String:
	return str(int(value)) if is_equal_approx(value, roundf(value)) else "%.1f" % value


static func stat_summary(stats: Dictionary) -> String:
	var parts: Array = []
	for stat in Content.list("stats"):
		if stats.has(stat.id):
			parts.append("%+d %s" % [int(stats[stat.id]), str(stat.get("short", stat.id))])
	return " ".join(parts)
