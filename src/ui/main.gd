extends Control
## Root of the app: resource bar on top, one screen below it. Screens are
## swapped through EventBus.screen_requested, so a new screen only needs an
## entry in SCREENS.

const UI := preload("res://src/ui/ui_kit.gd")
const Hud := preload("res://src/ui/hud.gd")

const SCREENS := {
	"city": preload("res://src/ui/city_screen.gd"),
	"battle": preload("res://src/ui/battle_screen.gd"),
	"heroes": preload("res://src/ui/heroes_screen.gd"),
	"daily": preload("res://src/ui/daily_screen.gd"),
	"settings": preload("res://src/ui/settings_screen.gd"),
}

var _holder: Control
var _toast: Label
var _toast_left := 0.0


func _ready() -> void:
	theme = UI.make_theme()

	var bg := ColorRect.new()
	bg.color = UI.BG
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(bg)

	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_FULL_RECT)
	var safe := _safe_margins()
	margin.add_theme_constant_override("margin_left", 16 + safe.x)
	margin.add_theme_constant_override("margin_right", 16 + safe.x)
	margin.add_theme_constant_override("margin_top", 12 + safe.y)
	margin.add_theme_constant_override("margin_bottom", 12 + safe.y)
	add_child(margin)

	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 12)
	margin.add_child(column)
	column.add_child(Hud.new())

	_holder = MarginContainer.new()
	_holder.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(_holder)

	_toast = UI.label("", UI.FONT_SIZE)
	_toast.autowrap_mode = TextServer.AUTOWRAP_OFF
	_toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_toast.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_toast.position.y = 150
	_toast.add_theme_stylebox_override("normal", UI.frame("dark"))
	_toast.visible = false
	add_child(_toast)

	EventBus.screen_requested.connect(show_screen)
	EventBus.toast.connect(show_toast)
	show_screen("city", {})
	if not Game.flags.get("intro_seen", false):
		_show_intro()


func _process(delta: float) -> void:
	if _toast_left > 0.0:
		_toast_left -= delta
		_toast.visible = _toast_left > 0.0


func show_screen(screen: String, args: Dictionary) -> void:
	if not SCREENS.has(screen):
		push_error("Unknown screen: %s" % screen)
		return
	for child in _holder.get_children():
		child.queue_free()
	var node: Control = SCREENS[screen].new()
	if node.has_method("setup"):
		node.setup(args)
	_holder.add_child(node)


## The short story shown once at the start (config "intro").
func _show_intro() -> void:
	var intro: Dictionary = Content.setting("intro", {})
	if intro.is_empty():
		return
	var overlay := ColorRect.new()
	overlay.color = Color(0.09, 0.08, 0.15, 0.85)
	overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(overlay)
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	overlay.add_child(center)
	var box := UI.panel("panel")
	box.custom_minimum_size = Vector2(600, 0)
	center.add_child(box)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 20)
	box.add_child(column)
	var title := UI.label(str(intro.get("title", "")), UI.HUGE, UI.ACCENT)
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	column.add_child(title)
	for line in intro.get("lines", []):
		column.add_child(UI.label(str(line), UI.FONT_SIZE))
	column.add_child(UI.button(str(intro.get("button", "Start")), func():
		overlay.queue_free()
		Game.set_flag("intro_seen", true), 88, "primary"))


func show_toast(message: String) -> void:
	_toast.text = message
	_toast.reset_size()
	_toast.position.x = (size.x - _toast.size.x) / 2.0
	_toast_left = 2.5
	_toast.visible = true


## Extra margins for notches and rounded corners, in viewport pixels.
func _safe_margins() -> Vector2i:
	var screen := DisplayServer.screen_get_size()
	var safe := DisplayServer.get_display_safe_area()
	if screen.x <= 0 or safe.size.x <= 0 or not OS.has_feature("mobile"):
		return Vector2i.ZERO
	var ratio := get_viewport_rect().size.x / float(screen.x)
	return Vector2i(int(safe.position.x * ratio), int(safe.position.y * ratio))
