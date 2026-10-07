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
	"shop": preload("res://src/ui/shop_screen.gd"),
}

var _holder: Control
var _toast: Label
var _toast_left := 0.0
var _screen := ""
var _intro: Control


func _ready() -> void:
	theme = UI.make_theme()

	var bg := ColorRect.new()
	bg.color = UI.BG
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(bg)

	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_FULL_RECT)
	var safe := _safe_margins()
	margin.add_theme_constant_override("margin_left", 16 + safe.position.x)
	margin.add_theme_constant_override("margin_right", 16 + safe.size.x)
	margin.add_theme_constant_override("margin_top", 12 + safe.position.y)
	margin.add_theme_constant_override("margin_bottom", 12 + safe.size.y)
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


## Android's back button / gesture: close what's open, go back to the town,
## and only then ask to leave.
func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_GO_BACK_REQUEST:
		go_back()


func go_back() -> void:
	# An open dialog closes first; the intro must be read.
	for dialog in get_tree().root.find_children("*", "AcceptDialog", true, false):
		if dialog.visible:
			dialog.hide()
			dialog.queue_free()
			return
	if is_instance_valid(_intro):
		return
	var current := _holder.get_child(0) if _holder.get_child_count() > 0 else null
	if current != null and current.has_method("go_back") and current.go_back():
		return
	if _screen != "city":
		show_screen("city", {})
		return
	_confirm_quit()


func _confirm_quit() -> void:
	var dialog := ConfirmationDialog.new()
	dialog.dialog_text = "Leave the game? Your town keeps working while you're away."
	dialog.ok_button_text = "Leave"
	dialog.cancel_button_text = "Stay"
	dialog.confirmed.connect(func():
		Game.save_game()
		get_tree().quit())
	add_child(dialog)
	dialog.popup_centered()


func show_screen(screen: String, args: Dictionary) -> void:
	if not SCREENS.has(screen):
		push_error("Unknown screen: %s" % screen)
		return
	for child in _holder.get_children():
		_holder.remove_child(child)
		child.queue_free()
	_screen = screen
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
	_intro = overlay
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
	# Above the bottom buttons, clear of headers and the battle's turn order.
	_toast.position.y = size.y * 0.62
	_toast_left = 2.5
	_toast.visible = true


## Extra margins for notches, rounded corners and the gesture bar, in
## viewport pixels: position = left/top, size = right/bottom.
func _safe_margins() -> Rect2i:
	var screen := DisplayServer.screen_get_size()
	var safe := DisplayServer.get_display_safe_area()
	if screen.x <= 0 or safe.size.x <= 0 or not OS.has_feature("mobile"):
		return Rect2i()
	var ratio := get_viewport_rect().size.x / float(screen.x)
	var left := int(safe.position.x * ratio)
	var top := int(safe.position.y * ratio)
	var right := int((screen.x - safe.end.x) * ratio)
	var bottom := int((screen.y - safe.end.y) * ratio)
	return Rect2i(left, top, right, bottom)
