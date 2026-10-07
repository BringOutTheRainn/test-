extends VBoxContainer
## Settings: notifications (all on/off and one switch per kind from config
## "notifications"), and starting a new game.

const UI := preload("res://src/ui/ui_kit.gd")

var _body: VBoxContainer


func setup(_args: Dictionary) -> void:
	pass


func _ready() -> void:
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_theme_constant_override("separation", 10)
	add_child(UI.header("Settings"))
	_body = UI.scroll_body(self)
	_rebuild()


func _rebuild() -> void:
	UI.clear(_body)
	_body.add_child(UI.label("Notifications", UI.FONT_SIZE, UI.ACCENT))
	var on: bool = Game.flags.get("notifications", false)
	_body.add_child(_switch("Notify me while I'm away", on, func(value): Game.enable_notifications(value)))
	if on:
		var kinds: Dictionary = Game.notification_kinds()
		for kind in kinds:
			var k: String = kind
			_body.add_child(_switch("  " + str(kinds[k].get("name", k)), Game.flags.get("notify_" + k, true), func(value): Game.set_flag("notify_" + k, value)))
		if not Game.notifications.available():
			_body.add_child(UI.label("Notifications only appear in the phone app.", UI.SMALL, UI.MUTED))
	_body.add_child(HSeparator.new())
	_body.add_child(UI.label("Game", UI.FONT_SIZE, UI.ACCENT))
	_body.add_child(UI.button("Start a new game", _confirm_reset, 80, "danger"))
	var version := UI.label("Version %s" % ProjectSettings.get_setting("application/config/version", "dev"), UI.SMALL, UI.MUTED)
	_body.add_child(version)


func _switch(text: String, value: bool, on_toggled: Callable) -> CheckButton:
	var c := CheckButton.new()
	c.text = text
	c.button_pressed = value
	c.custom_minimum_size = Vector2(0, 72)
	c.toggled.connect(func(v):
		on_toggled.call(v)
		_rebuild.call_deferred())
	return c


func _confirm_reset() -> void:
	var dialog := ConfirmationDialog.new()
	dialog.dialog_text = "Start a new game? Your current town will be lost."
	dialog.confirmed.connect(func():
		Game.reset_game()
		EventBus.screen_requested.emit("city", {}))
	add_child(dialog)
	dialog.popup_centered()
