extends PanelContainer
## One combatant on the battle screen: name, health bar, energy and statuses.
## Tapping it reports the unit uid (used to pick targets).

signal tapped(uid: String)

const UI := preload("res://src/ui/ui_kit.gd")
const Sprites := preload("res://src/ui/sprites.gd")

var uid := ""
var _name: Label
var _hp_bar: ProgressBar
var _hp: Label
var _info: Label
var _style: StyleBoxFlat


func setup(u: Dictionary) -> void:
	uid = u.uid
	custom_minimum_size = Vector2(150, 150)
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	mouse_filter = Control.MOUSE_FILTER_STOP
	_style = UI.box(Color(u.color).darkened(0.55), 14, 10)
	_style.set_border_width_all(4)
	add_theme_stylebox_override("panel", _style)

	var column := VBoxContainer.new()
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_theme_constant_override("separation", 4)
	add_child(column)
	var top := HBoxContainer.new()
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(top)
	var type := "heroes" if u.team == "hero" else "enemies"
	var tex := Sprites.for_entry(type, Content.entry(type, u.id))
	if tex != null:
		var portrait := TextureRect.new()
		portrait.texture = tex
		portrait.custom_minimum_size = Vector2(64, 64)
		portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
		top.add_child(portrait)
	_name = UI.label(u.name + (" (boss)" if u.boss else ""), 24)
	_name.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_hp_bar = UI.progress_bar(UI.GOOD, 16)
	_hp = UI.label("", 20)
	_info = UI.label("", 18, UI.MUTED)
	_name.mouse_filter = Control.MOUSE_FILTER_IGNORE
	top.add_child(_name)
	for c in [_hp_bar, _hp, _info]:
		c.mouse_filter = Control.MOUSE_FILTER_IGNORE
		column.add_child(c)


func refresh(u: Dictionary, is_current: bool, is_target: bool) -> void:
	var hp := int(u.hp)
	_hp_bar.value = float(hp) / float(u.max_hp)
	_hp.text = "%d / %d HP" % [hp, int(u.max_hp)]
	var info: Array = ["Energy %d" % int(u.energy)] if u.team == "hero" else []
	for id in u.statuses:
		info.append("%s %d" % [id.capitalize(), int(u.statuses[id].turns)])
	_info.text = "  ".join(info)
	modulate = Color(1, 1, 1, 0.35) if hp <= 0 else Color.WHITE
	if is_target:
		_style.border_color = UI.BAD
	elif is_current:
		_style.border_color = UI.ACCENT
	else:
		_style.border_color = Color(0, 0, 0, 0)


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		tapped.emit(uid)
		accept_event()
