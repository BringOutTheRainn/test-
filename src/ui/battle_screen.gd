extends VBoxContainer
## Battle screen for a dungeon run. Enemies on top (back row above front row),
## heroes below (front row above back row), skills at the bottom.
## One-hand play: tap a skill, then tap a target. The basic attack is selected
## at the start of each hero turn, so tapping an enemy attacks it.

const UI := preload("res://src/ui/ui_kit.gd")
const UnitCard := preload("res://src/ui/unit_card.gd")
const DungeonRun := preload("res://src/combat/dungeon_run.gd")

const TURN_DELAY := 0.7

var run: DungeonRun
var battle
var _dungeon_id := ""
var _cards: Dictionary = {}
var _pending_skill := ""
var _pending_targets: Array = []
var _auto := false
var _fast := false

var _title: Label
var _timeline: Label
var _enemy_rows: VBoxContainer
var _hero_rows: VBoxContainer
var _log: Label
var _hint: Label
var _skills: HBoxContainer
var _ai_timer: Timer
var _overlay: PanelContainer


func setup(args: Dictionary) -> void:
	_dungeon_id = str(args.get("dungeon", ""))


func _ready() -> void:
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_theme_constant_override("separation", 10)

	var header := HBoxContainer.new()
	add_child(header)
	_title = UI.label("", 26, UI.ACCENT)
	_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	header.add_child(_title)
	var auto := CheckButton.new()
	auto.text = "Auto"
	auto.toggled.connect(func(on):
		_auto = on
		_on_turn())
	header.add_child(auto)
	var fast := CheckButton.new()
	fast.text = "2x"
	fast.toggled.connect(func(on): _fast = on)
	header.add_child(fast)

	_timeline = UI.label("", 20, UI.MUTED)
	add_child(_timeline)

	_enemy_rows = VBoxContainer.new()
	_enemy_rows.add_theme_constant_override("separation", 8)
	add_child(_enemy_rows)

	_log = UI.label("", 20, UI.MUTED)
	_log.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_log.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	add_child(_log)

	_hero_rows = VBoxContainer.new()
	_hero_rows.add_theme_constant_override("separation", 8)
	add_child(_hero_rows)

	_hint = UI.label("", 22)
	add_child(_hint)
	_skills = HBoxContainer.new()
	_skills.add_theme_constant_override("separation", 8)
	add_child(_skills)
	add_child(UI.button("Retreat", _retreat, 64))

	_ai_timer = Timer.new()
	_ai_timer.one_shot = true
	_ai_timer.timeout.connect(_ai_act)
	add_child(_ai_timer)

	run = DungeonRun.new()
	var party: Array = Game.party.slice(0, Game.party_size())
	run.setup(Content, _dungeon_id, party)
	if run.finished:
		EventBus.toast.emit("This dungeon has no rooms")
		EventBus.screen_requested.emit.call_deferred("city", {})
		return
	_start_room()


func _start_room() -> void:
	battle = run.start_battle()
	battle.logged.connect(func(_t): _refresh_log())
	var room: Dictionary = run.current_room()
	_title.text = "%s  %d/%d: %s" % [run.dungeon.get("name", ""), run.room_index + 1, run.rooms().size(), room.get("name", "")]
	_cards = {}
	for container in [_enemy_rows, _hero_rows]:
		for child in container.get_children():
			child.queue_free()
	_add_row(_enemy_rows, "enemy", "back")
	_add_row(_enemy_rows, "enemy", "front")
	_add_row(_hero_rows, "hero", "front")
	_add_row(_hero_rows, "hero", "back")
	_refresh_log()
	_on_turn()


func _add_row(container: VBoxContainer, team: String, row: String) -> void:
	var units: Array = battle.units.filter(func(u): return u.team == team and u.row == row)
	if units.is_empty():
		return
	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", 8)
	container.add_child(line)
	for u in units:
		var card := UnitCard.new()
		card.setup(u)
		card.tapped.connect(_on_card_tapped)
		line.add_child(card)
		_cards[u.uid] = card


## Called whenever the turn changes or state needs redrawing.
func _on_turn() -> void:
	if battle == null or _overlay != null:
		return
	_pending_skill = ""
	_pending_targets = []
	_clear_skills()
	if battle.outcome != "":
		_refresh_cards()
		_room_finished()
		return
	var u: Dictionary = battle.current
	if u.team == "enemy" or _auto:
		_hint.text = "%s is acting..." % u.name
		_refresh_cards()
		_ai_timer.start(TURN_DELAY / (2.0 if _fast else 1.0))
		return
	_hint.text = "%s's turn: pick a skill, then a target" % u.name
	for id in u.skills:
		var s: Dictionary = battle.skill(id)
		var cost := int(s.get("cost", 0))
		var text := str(s.get("name", id)) + ("" if cost == 0 else " (%d)" % cost)
		var skill_id: String = id
		var b := UI.button(text, func(): _select_skill(skill_id), 80)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.disabled = not battle.is_usable(u, id)
		b.set_meta("skill", skill_id)
		_skills.add_child(b)
	_select_skill(u.skills[0])


func _select_skill(skill_id: String) -> void:
	var u: Dictionary = battle.current
	if not battle.is_usable(u, skill_id):
		return
	var mode: String = battle.target_mode(skill_id)
	if mode == "self":
		_act(skill_id, u.uid)
		return
	_pending_skill = skill_id
	_pending_targets = battle.valid_targets(u, skill_id)
	var s: Dictionary = battle.skill(skill_id)
	var how := "tap a target" if mode == "single" else "tap any highlighted unit to hit them all"
	_hint.text = "%s: %s" % [s.get("name", skill_id), how]
	for b in _skills.get_children():
		b.modulate = UI.ACCENT.lightened(0.4) if b.get_meta("skill", "") == skill_id else Color.WHITE
	_refresh_cards()


func _on_card_tapped(uid: String) -> void:
	if _pending_skill == "" or not uid in _pending_targets:
		return
	_act(_pending_skill, uid)


func _act(skill_id: String, target_uid: String) -> void:
	if battle.act(skill_id, target_uid):
		_on_turn()


func _ai_act() -> void:
	if battle == null or battle.outcome != "" or battle.current.is_empty():
		return
	var u: Dictionary = battle.current
	if u.team == "hero" and not _auto:
		_on_turn()
		return
	var action: Dictionary = battle.choose_action(u)
	_act(action.skill, action.target)


func _refresh_cards() -> void:
	var current_uid: String = battle.current.get("uid", "")
	for u in battle.units:
		if _cards.has(u.uid):
			_cards[u.uid].refresh(u, u.uid == current_uid, u.uid in _pending_targets)
	var names: Array = battle.turn_order().map(func(u): return u.name)
	_timeline.text = "Turn order: " + " > ".join(names)


func _refresh_log() -> void:
	var lines: Array = battle.log_lines.slice(-4)
	_log.text = "\n".join(lines)


func _clear_skills() -> void:
	for child in _skills.get_children():
		child.queue_free()


func _room_finished() -> void:
	var won_room: bool = battle.outcome == "won"
	run.finish_battle()
	if won_room and not run.finished:
		_show_overlay("Room cleared!", "Loot so far: " + UI.format_amounts(run.loot, Content), "Next room", func():
			_close_overlay()
			_start_room())
		return
	_finish_run()


func _finish_run() -> void:
	var added: Dictionary = Game.grant(run.loot)
	var gained := {}
	for id in added:
		if int(added[id]) > 0:
			gained[id] = int(added[id])
	var result := run.result()
	EventBus.dungeon_finished.emit(result)
	Game.save_game()
	var title := "Victory!" if run.won else "Defeated"
	var body := "You brought back: " + (UI.format_amounts(gained, Content) if not gained.is_empty() else "nothing")
	if not run.won:
		body += "\nLosing keeps half the loot you found."
	_show_overlay(title, body, "Back to town", func(): EventBus.screen_requested.emit("city", {}))


func _retreat() -> void:
	if _overlay != null or run.finished:
		return
	_ai_timer.stop()
	run.retreat()
	_finish_run()


func _show_overlay(title: String, body: String, button_text: String, on_pressed: Callable) -> void:
	_clear_skills()
	_hint.text = ""
	_overlay = PanelContainer.new()
	_overlay.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	_overlay.top_level = true
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 16)
	column.custom_minimum_size = Vector2(560, 0)
	_overlay.add_child(column)
	column.add_child(UI.label(title, 40, UI.ACCENT))
	column.add_child(UI.label(body, 26))
	column.add_child(UI.button(button_text, on_pressed, 88))
	add_child(_overlay)
	await get_tree().process_frame
	if is_instance_valid(_overlay):
		_overlay.position = (get_viewport_rect().size - _overlay.size) / 2.0


func _close_overlay() -> void:
	if _overlay != null:
		_overlay.queue_free()
		_overlay = null
