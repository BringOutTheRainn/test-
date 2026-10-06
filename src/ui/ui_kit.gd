extends RefCounted
## Shared look and small UI helpers. Placeholder art is flat colors; swapping
## in real art later only touches this file and the draw code in the views.

const BG := Color("#1e272e")
const PANEL := Color("#2f3640")
const PANEL_LIGHT := Color("#3d4652")
const ACCENT := Color("#f5a623")
const TEXT := Color("#ecf0f1")
const MUTED := Color("#95a5a6")
const GOOD := Color("#2ecc71")
const BAD := Color("#e74c3c")
const FONT_SIZE := 26


static func make_theme() -> Theme:
	var theme := Theme.new()
	theme.default_font_size = FONT_SIZE
	theme.set_color("font_color", "Label", TEXT)
	theme.set_stylebox("normal", "Button", box(PANEL_LIGHT, 12, 14))
	theme.set_stylebox("hover", "Button", box(PANEL_LIGHT.lightened(0.1), 12, 14))
	theme.set_stylebox("pressed", "Button", box(ACCENT.darkened(0.3), 12, 14))
	theme.set_stylebox("disabled", "Button", box(PANEL.darkened(0.2), 12, 14))
	theme.set_stylebox("focus", "Button", StyleBoxEmpty.new())
	theme.set_color("font_disabled_color", "Button", MUTED.darkened(0.2))
	theme.set_stylebox("panel", "PanelContainer", box(PANEL, 16, 16))
	theme.set_stylebox("background", "ProgressBar", box(BG, 6, 0))
	theme.set_stylebox("fill", "ProgressBar", box(ACCENT, 6, 0))
	return theme


static func box(color: Color, radius: int = 12, padding: int = 12) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.set_corner_radius_all(radius)
	style.set_content_margin_all(padding)
	return style


static func label(text: String, font_size: int = FONT_SIZE, color: Color = TEXT) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", font_size)
	l.add_theme_color_override("font_color", color)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return l


static func button(text: String, on_pressed: Callable, min_height: int = 72) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(0, min_height)
	b.pressed.connect(on_pressed)
	return b


static func progress_bar(color: Color = ACCENT, height: int = 14) -> ProgressBar:
	var bar := ProgressBar.new()
	bar.show_percentage = false
	bar.max_value = 1.0
	bar.step = 0.0
	bar.custom_minimum_size = Vector2(0, height)
	bar.add_theme_stylebox_override("fill", box(color, 6, 0))
	return bar


static func format_time(seconds: float) -> String:
	var s := ceili(seconds)
	if s >= 3600:
		return "%dh %02dm" % [s / 3600, (s % 3600) / 60]
	if s >= 60:
		return "%dm %02ds" % [s / 60, s % 60]
	return "%ds" % s


## "50 Wood, 20 Stone" using resource names from content.
static func format_amounts(amounts: Dictionary, content) -> String:
	var parts: Array = []
	for id in amounts:
		var res: Dictionary = content.entry("resources", id)
		parts.append("%d %s" % [int(amounts[id]), res.get("name", id)])
	return ", ".join(parts) if not parts.is_empty() else "Free"
