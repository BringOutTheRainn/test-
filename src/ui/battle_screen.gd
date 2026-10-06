extends VBoxContainer
## Battle screen for a dungeon run, laid out like a classic turn-based RPG:
## the party stands on the left facing the enemies on the right, over the
## dungeon's backdrop (art/backgrounds/<dungeon id>.png). Front rows stand
## nearer the middle. The turn order runs along the top, skills along the
## bottom.
##
## One-hand play: tap a skill, then tap a target. The basic attack is selected
## at the start of each hero turn, so tapping an enemy attacks it.
##
## The battle model resolves an action instantly; this screen collects the
## model's events and plays them back (lunge, hit flash, numbers, falls)
## before the next turn starts.

const UI := preload("res://src/ui/ui_kit.gd")
const Sprites := preload("res://src/ui/sprites.gd")
const UnitView := preload("res://src/ui/unit_view.gd")
const DungeonRun := preload("res://src/combat/dungeon_run.gd")

const TURN_DELAY := 0.45
## Skill targets that mean the user walks up to hit (others shoot or cast).
const MELEE := ["enemy_melee", "enemy_front_row"]

var run: DungeonRun
var battle
var _dungeon_id := ""
var _views: Dictionary = {}
var _pending_skill := ""
var _pending_targets: Array = []
var _auto := false
var _fast := false
var _events: Array = []
var _playing := false

var _title: Label
var _turns: HBoxContainer
var _field: Control
var _backdrop: TextureRect
var _units_layer: Control
var _fx_layer: Control
var _log: Label
var _hint: Label
var _skills: HBoxContainer
var _ai_timer: Timer
var _overlay: Control


func setup(args: Dictionary) -> void:
	_dungeon_id = str(args.get("dungeon", ""))


func _ready() -> void:
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_theme_constant_override("separation", 8)

	var header := HBoxContainer.new()
	header.add_theme_constant_override("separation", 8)
	add_child(header)
	_title = UI.label("", UI.FONT_SIZE, UI.ACCENT)
	_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_title.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	header.add_child(_title)
	header.add_child(_toggle("Auto", func(on):
		_auto = on
		if not _playing:
			_on_turn()))
	header.add_child(_toggle("2x", func(on):
		_fast = on
		for v in _views.values():
			v.speed = _speed()))

	_turns = HBoxContainer.new()
	_turns.add_theme_constant_override("separation", 4)
	_turns.custom_minimum_size = Vector2(0, 52)
	add_child(_turns)

	var frame := UI.panel("dark")
	frame.size_flags_vertical = Control.SIZE_EXPAND_FILL
	frame.add_theme_stylebox_override("panel", _tight(UI.frame("dark")))
	add_child(frame)
	_field = Control.new()
	_field.clip_contents = true
	_field.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_field.resized.connect(_layout_units)
	frame.add_child(_field)
	_backdrop = TextureRect.new()
	_backdrop.set_anchors_preset(Control.PRESET_FULL_RECT)
	_backdrop.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_backdrop.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	_backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_field.add_child(_backdrop)
	var shade := ColorRect.new()
	shade.color = Color(0.09, 0.08, 0.15, 0.25)
	shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_field.add_child(shade)
	_units_layer = Control.new()
	_units_layer.set_anchors_preset(Control.PRESET_FULL_RECT)
	_units_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_field.add_child(_units_layer)
	_fx_layer = Control.new()
	_fx_layer.set_anchors_preset(Control.PRESET_FULL_RECT)
	_fx_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_field.add_child(_fx_layer)
	_log = UI.label("", UI.SMALL, UI.TEXT)
	_log.add_theme_stylebox_override("normal", UI.frame("dark", 1))
	_log.set_anchors_preset(Control.PRESET_TOP_WIDE)
	_log.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_log.offset_left = 12
	_log.offset_right = -12
	_log.offset_top = 10
	_log.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_field.add_child(_log)

	var controls := UI.panel()
	add_child(controls)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 10)
	controls.add_child(column)
	_hint = UI.label("", UI.FONT_SIZE)
	_hint.custom_minimum_size = Vector2(0, 30)
	column.add_child(_hint)
	_skills = HBoxContainer.new()
	_skills.add_theme_constant_override("separation", 8)
	_skills.custom_minimum_size = Vector2(0, 96)
	column.add_child(_skills)
	var retreat := UI.button("Retreat", _retreat, 56, "danger")
	retreat.add_theme_font_size_override("font_size", UI.SMALL)
	column.add_child(retreat)

	_ai_timer = Timer.new()
	_ai_timer.one_shot = true
	_ai_timer.timeout.connect(_ai_act)
	add_child(_ai_timer)

	_backdrop.texture = Sprites.load_texture(Sprites.ART_ROOT.path_join("backgrounds").path_join(_dungeon_id + ".png"))
	run = DungeonRun.new()
	var party: Array = Game.party.slice(0, Game.party_size())
	run.setup(Content, _dungeon_id, party, Game.party_stats(), Game.party_levels())
	if run.finished:
		EventBus.toast.emit("This dungeon has no rooms")
		EventBus.screen_requested.emit.call_deferred("city", {})
		return
	_start_room()


func _toggle(text: String, on_toggled: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.toggle_mode = true
	b.custom_minimum_size = Vector2(96, 56)
	b.add_theme_font_size_override("font_size", UI.SMALL)
	b.add_theme_stylebox_override("normal", UI.frame("dark"))
	b.add_theme_stylebox_override("hover", UI.frame("dark"))
	b.add_theme_stylebox_override("pressed", UI.frame("selected"))
	b.toggled.connect(on_toggled)
	return b


func _tight(style: StyleBoxTexture) -> StyleBoxTexture:
	var s := style.duplicate()
	s.set_content_margin_all(UI.PIXEL * 2)
	return s


func _speed() -> float:
	return 2.0 if _fast else 1.0


func _start_room() -> void:
	battle = run.start_battle()
	battle.event.connect(func(e): _events.append(e))
	var room: Dictionary = run.current_room()
	_title.text = "%s %d/%d" % [room.get("name", ""), run.room_index + 1, run.rooms().size()]
	_views = {}
	for child in _units_layer.get_children():
		child.queue_free()
	var max_energy := int(Content.setting("combat", {}).get("max_energy", 3))
	for u in battle.units:
		var v := UnitView.new()
		v.setup(u, max_energy)
		v.speed = _speed()
		v.tapped.connect(_on_unit_tapped)
		_units_layer.add_child(v)
		_views[u.uid] = v
	_layout_units()
	_log.text = "Enemies ahead!"
	_on_turn()


## Heroes on the left half, enemies on the right; front rows nearer the
## middle. Units in one row spread down the floor, back to front.
func _layout_units() -> void:
	if battle == null or _field.size.x <= 0.0:
		return
	var w := _field.size.x
	var h := _field.size.y
	var columns := {"hero/front": 0.37, "hero/back": 0.15, "enemy/front": 0.63, "enemy/back": 0.85}
	for key in columns:
		var parts: PackedStringArray = key.split("/")
		var units: Array = battle.units.filter(func(u): return u.team == parts[0] and u.row == parts[1])
		for i in units.size():
			var t := (i + 0.5) / units.size()
			# Back rows stand a little higher (farther away) than front rows.
			var top := 0.5 if parts[1] == "back" else 0.56
			var y := lerpf(h * top, h * 0.95, t) if units.size() > 1 else h * (top + 0.95) / 2.0 + 20
			var x: float = w * columns[key] + (12.0 if i % 2 == 1 else 0.0) * (1.0 if parts[0] == "hero" else -1.0)
			_views[units[i].uid].stand_at(Vector2(x, y))
	# Nearer units (lower on screen) draw over farther ones.
	var order: Array = _views.values()
	order.sort_custom(func(a, b): return a.position.y + a.size.y < b.position.y + b.size.y)
	for i in order.size():
		_units_layer.move_child(order[i], i)


## Called whenever the turn changes or state needs redrawing.
func _on_turn() -> void:
	if battle == null or _overlay != null or _playing:
		return
	_pending_skill = ""
	_pending_targets = []
	_clear_skills()
	if battle.outcome != "":
		_refresh_views()
		_room_finished()
		return
	var u: Dictionary = battle.current
	if u.team == "enemy" or _auto:
		_hint.text = "%s's turn" % u.name
		_hint.add_theme_color_override("font_color", UI.BAD if u.team == "enemy" else UI.TEXT)
		_refresh_views()
		_ai_timer.start(TURN_DELAY / _speed())
		return
	_hint.text = "%s's turn" % u.name
	_hint.add_theme_color_override("font_color", UI.ACCENT)
	for id in u.skills:
		var skill_id: String = id
		var b := _skill_button(skill_id, u)
		_skills.add_child(b)
	_select_skill(u.skills[0])


func _skill_button(skill_id: String, u: Dictionary) -> Button:
	var s: Dictionary = battle.skill(skill_id)
	var cost := int(s.get("cost", 0))
	var b := Button.new()
	b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	b.custom_minimum_size = Vector2(0, 96)
	b.disabled = not battle.is_usable(u, skill_id)
	b.set_meta("skill", skill_id)
	b.pressed.connect(func(): _select_skill(skill_id))
	var column := VBoxContainer.new()
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	b.add_child(column)
	var skill_name := UI.label(str(s.get("name", skill_id)), UI.SMALL)
	skill_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	skill_name.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(skill_name)
	var cost_label := UI.label("Free" if cost == 0 else "%d energy" % cost, UI.SMALL, UI.ENERGY if cost > 0 else UI.MUTED)
	cost_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	cost_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(cost_label)
	return b


func _select_skill(skill_id: String) -> void:
	var u: Dictionary = battle.current
	if _playing or not battle.is_usable(u, skill_id):
		return
	var mode: String = battle.target_mode(skill_id)
	if mode == "self":
		_act(skill_id, u.uid)
		return
	_pending_skill = skill_id
	_pending_targets = battle.valid_targets(u, skill_id)
	var s: Dictionary = battle.skill(skill_id)
	var how := "tap a target" if mode == "single" else "tap to hit all marked"
	_hint.text = "%s: %s" % [s.get("name", skill_id), how]
	for b in _skills.get_children():
		var on: bool = b.get_meta("skill", "") == skill_id
		b.add_theme_stylebox_override("normal", UI.frame("selected") if on else UI.frame("button"))
		b.add_theme_stylebox_override("hover", UI.frame("selected") if on else UI.frame("button"))
	_refresh_views()


func _on_unit_tapped(uid: String) -> void:
	if _playing or _pending_skill == "" or not uid in _pending_targets:
		return
	_act(_pending_skill, uid)


func _act(skill_id: String, target_uid: String) -> void:
	if _playing:
		return
	_events = []
	if not battle.act(skill_id, target_uid):
		return
	_clear_skills()
	_pending_targets = []
	_playing = true
	await _play_events(_events)
	_playing = false
	if is_inside_tree():
		_on_turn()


func _ai_act() -> void:
	if battle == null or _playing or battle.outcome != "" or battle.current.is_empty():
		return
	var u: Dictionary = battle.current
	if u.team == "hero" and not _auto:
		_on_turn()
		return
	var action: Dictionary = battle.choose_action(u)
	_act(action.skill, action.target)


## Plays the model's events: the actor moves, then each effect lands.
func _play_events(events: Array) -> void:
	var source: Node = null
	var melee := false
	for e in events:
		if not is_inside_tree():
			return
		match e.type:
			"action":
				source = _views.get(e.source)
				var s: Dictionary = battle.skill(e.skill)
				_log.text = "%s: %s" % [battle.unit(e.source).name, s.get("name", e.skill)]
				_refresh_views([e.source])
				melee = str(s.get("target", "")) in MELEE
				var target_view: Node = _views.get(e.targets[0]) if not e.targets.is_empty() else null
				if source != null:
					if melee and target_view != null:
						source.lunge(target_view.feet())
						await _wait(0.18)
					else:
						source.hop()
						await _wait(0.12)
						if target_view != null and target_view != source and _is_foe(e.source, e.targets[0]):
							await _shoot(source, target_view)
			"damage":
				var v: Node = _views.get(e.target)
				if v != null:
					var heavy: bool = int(e.amount) >= 30
					v.hit(heavy)
					_float_text(v, str(int(e.amount)), UI.BAD if v.team == "hero" else Color("#ffffff"), heavy)
					if heavy:
						_shake()
					_refresh_views([e.target])
			"heal":
				var hv: Node = _views.get(e.target)
				if hv != null:
					hv.glow(UI.GOOD)
					_float_text(hv, "+%d" % int(e.amount), UI.GOOD, false)
					_refresh_views([e.target])
			"status":
				var sv: Node = _views.get(e.target)
				if sv != null:
					_float_text(sv, str(e.status).capitalize(), UI.ACCENT, false)
					_refresh_views([e.target])
		if e.type != "action":
			await _wait(0.12)
	await _wait(0.35)
	_refresh_views()
	await _wait(0.1)


func _is_foe(a: String, b: String) -> bool:
	return battle.unit(a).get("team", "") != battle.unit(b).get("team", "")


func _wait(seconds: float) -> void:
	await get_tree().create_timer(seconds / _speed()).timeout


## A small square bolt flying from the source to the target.
func _shoot(from: Node, to: Node) -> void:
	var bolt := ColorRect.new()
	bolt.size = Vector2(UI.PIXEL * 4, UI.PIXEL * 2)
	bolt.color = Color("#fee761")
	bolt.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fx_layer.add_child(bolt)
	var start: Vector2 = from.position + Vector2(from.size.x / 2.0, from.size.y * 0.35)
	var end: Vector2 = to.position + Vector2(to.size.x / 2.0, to.size.y * 0.35)
	bolt.position = start
	var t := create_tween()
	t.tween_property(bolt, "position", end, 0.18 / _speed())
	await t.finished
	bolt.queue_free()


func _float_text(v: Node, text: String, color: Color, big: bool) -> void:
	var l := UI.label(text, UI.LARGE if big else UI.FONT_SIZE, color)
	l.autowrap_mode = TextServer.AUTOWRAP_OFF
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fx_layer.add_child(l)
	l.reset_size()
	var start: Vector2 = v.head() - Vector2(l.size.x / 2.0, 0) + Vector2(randf_range(-10, 10), 0)
	l.position = start
	var t := create_tween()
	t.tween_property(l, "position:y", start.y - 70.0, 0.8 / _speed()).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	t.parallel().tween_property(l, "modulate:a", 0.0, 0.35 / _speed()).set_delay(0.5 / _speed())
	t.tween_callback(l.queue_free)


func _shake() -> void:
	var t := create_tween()
	for i in 4:
		t.tween_property(_units_layer, "position", Vector2(randf_range(-6, 6), randf_range(-4, 4)).floor(), 0.03)
	t.tween_property(_units_layer, "position", Vector2.ZERO, 0.03)


## Redraws the units listed (or all), the target marks and the turn order.
func _refresh_views(only: Array = []) -> void:
	var current_uid: String = battle.current.get("uid", "") if not _playing else ""
	for u in battle.units:
		if _views.has(u.uid) and (only.is_empty() or u.uid in only):
			_views[u.uid].refresh(u, u.uid == current_uid, u.uid in _pending_targets)
	if only.is_empty():
		_refresh_turn_order()


func _refresh_turn_order() -> void:
	for child in _turns.get_children():
		child.queue_free()
	var order: Array = battle.turn_order().slice(0, 8)
	for i in order.size():
		var u: Dictionary = order[i]
		var slot := PanelContainer.new()
		slot.custom_minimum_size = Vector2(52, 52)
		slot.add_theme_stylebox_override("panel", _tight(UI.frame("selected" if i == 0 else ("dark" if u.team == "hero" else "danger"), 1)))
		_turns.add_child(slot)
		var type := "heroes" if u.team == "hero" else "enemies"
		var tex := Sprites.for_entry(type, Content.entry(type, u.id))
		if tex != null:
			slot.add_child(UI.icon_rect(tex, 40))
		else:
			var c := ColorRect.new()
			c.color = Color(u.color)
			c.custom_minimum_size = Vector2(36, 36)
			slot.add_child(c)


func _clear_skills() -> void:
	for child in _skills.get_children():
		child.queue_free()


func _room_finished() -> void:
	var won_room: bool = battle.outcome == "won"
	run.finish_battle()
	if won_room and not run.finished:
		_show_overlay("Room cleared!", run.loot, "Loot so far", "Next room", func():
			_close_overlay()
			_start_room())
		return
	_finish_run()


func _finish_run() -> void:
	var result := run.result()
	var paid: Dictionary = Game.grant_run(result, run.party)
	EventBus.dungeon_finished.emit(result)
	var title := "Victory!" if run.won else "Defeated"
	var note := "You brought back" if run.won else "Losing keeps half the loot. You brought back"
	var extra: Array = []
	if int(paid.xp) > 0:
		extra.append(["+%d XP for each hero" % int(paid.xp), UI.ENERGY])
	for id in paid.level_ups:
		extra.append(["%s reached level %d!" % [Content.entry("heroes", id).get("name", id), int(paid.level_ups[id])], UI.ACCENT])
	for item_id in paid.items:
		extra.append(["Found: %s" % Content.entry("items", item_id).get("name", item_id), UI.GOOD])
	_show_overlay(title, paid.resources, note, "Back to town", func(): EventBus.screen_requested.emit("city", {}), extra)


func _retreat() -> void:
	if _overlay != null or run.finished:
		return
	_ai_timer.stop()
	run.retreat()
	_finish_run()


## extra: lines shown under the loot, as [text, color].
func _show_overlay(title: String, loot: Dictionary, note: String, button_text: String, on_pressed: Callable, extra: Array = []) -> void:
	_clear_skills()
	_hint.text = ""
	_overlay = Control.new()
	_overlay.top_level = true
	_overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	_overlay.size = get_viewport_rect().size
	var dim := ColorRect.new()
	dim.color = Color(0.09, 0.08, 0.15, 0.7)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	_overlay.add_child(dim)
	var box := UI.panel("panel")
	box.custom_minimum_size = Vector2(560, 0)
	_overlay.add_child(box)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 18)
	box.add_child(column)
	var heading := UI.label(title, UI.HUGE, UI.ACCENT if title != "Defeated" else UI.BAD)
	heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(heading)
	column.add_child(UI.label(note, UI.SMALL, UI.MUTED))
	var loot_box := UI.panel("dark")
	column.add_child(loot_box)
	loot_box.add_child(UI.amounts_row(loot, Content, UI.FONT_SIZE) if not loot.is_empty() else UI.label("Nothing", UI.FONT_SIZE, UI.MUTED))
	for line in extra:
		column.add_child(UI.label(line[0], UI.FONT_SIZE, line[1]))
	column.add_child(UI.button(button_text, on_pressed, 88, "primary"))
	add_child(_overlay)
	await get_tree().process_frame
	if is_instance_valid(_overlay):
		_overlay.size = get_viewport_rect().size
		box.position = ((_overlay.size - box.size) / 2.0).floor()
		box.pivot_offset = box.size / 2.0
		box.scale = Vector2(0.6, 0.6)
		create_tween().tween_property(box, "scale", Vector2.ONE, 0.18).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)


func _close_overlay() -> void:
	if _overlay != null:
		_overlay.queue_free()
		_overlay = null
