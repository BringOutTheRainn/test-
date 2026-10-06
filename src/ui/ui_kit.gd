extends RefCounted
## Shared look and small UI helpers: the pixel font, framed pixel-art panels
## and buttons, colors and number formatting. Restyling the game mostly means
## editing this file. Colors come from the Endesga 32 palette (art/palette.hex)
## so the UI matches the sprites.

const Sprites := preload("res://src/ui/sprites.gd")

const BG := Color("#181425")
const PANEL := Color("#3e2731")
const PANEL_LIGHT := Color("#733e39")
const ACCENT := Color("#feae34")
const TEXT := Color("#ead4aa")
const MUTED := Color("#c28569")
const GOOD := Color("#63c74d")
const BAD := Color("#e43b44")
const ENERGY := Color("#2ce8f5")
const OUTLINE := Color("#181425")

## Text sizes. The font is 9 pixels tall and only drawn at whole multiples, so
## these are the sizes that look sharp.
const SMALL := 18
const FONT_SIZE := 27
const LARGE := 36
const HUGE := 45

## One frame pixel is this many screen pixels (the viewport is 720 wide).
const PIXEL := 3
const FONT_PATH := "res://art/fonts/pixel.fnt"

## name -> [fill, highlight, shade]. Frames are drawn with an OUTLINE edge,
## a highlight on the top-left and a shade on the bottom-right.
const FRAMES := {
	"panel": [Color("#3e2731"), Color("#733e39"), Color("#26162a")],
	"parchment": [Color("#e4a672"), Color("#ead4aa"), Color("#b86f50")],
	"button": [Color("#b86f50"), Color("#e4a672"), Color("#733e39")],
	"button_pressed": [Color("#733e39"), Color("#3e2731"), Color("#b86f50")],
	"primary": [Color("#3e8948"), Color("#63c74d"), Color("#265c42")],
	"primary_pressed": [Color("#265c42"), Color("#193c3e"), Color("#3e8948")],
	"danger": [Color("#a22633"), Color("#e43b44"), Color("#3e2731")],
	"disabled": [Color("#3a4466"), Color("#5a6988"), Color("#262b44")],
	"dark": [Color("#262b44"), Color("#3a4466"), Color("#181425")],
	"selected": [Color("#f77622"), Color("#feae34"), Color("#a22633")],
}

static var _font: Font
static var _frames: Dictionary = {}


static func font() -> Font:
	if _font != null:
		return _font
	if ResourceLoader.exists(FONT_PATH, "FontFile"):
		_font = ResourceLoader.load(FONT_PATH, "FontFile")
	else:
		var f := FontFile.new()
		if f.load_bitmap_font(FONT_PATH) == OK:
			_font = f
	if _font is FontFile:
		_font.fixed_size_scale_mode = TextServer.FIXED_SIZE_SCALE_INTEGER_ONLY
	if _font == null:
		_font = ThemeDB.fallback_font
	return _font


static func make_theme() -> Theme:
	var theme := Theme.new()
	theme.default_font = font()
	theme.default_font_size = FONT_SIZE
	theme.set_color("font_color", "Label", TEXT)
	theme.set_color("font_shadow_color", "Label", OUTLINE)
	theme.set_constant("shadow_offset_x", "Label", PIXEL)
	theme.set_constant("shadow_offset_y", "Label", PIXEL)
	for state in ["normal", "hover", "focus"]:
		theme.set_stylebox(state, "Button", frame("button"))
	theme.set_stylebox("focus", "Button", StyleBoxEmpty.new())
	theme.set_stylebox("pressed", "Button", frame("button_pressed"))
	theme.set_stylebox("disabled", "Button", frame("disabled"))
	for c in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		theme.set_color(c, "Button", TEXT)
	theme.set_color("font_disabled_color", "Button", Color("#8b9bb4"))
	theme.set_color("font_outline_color", "Button", OUTLINE)
	theme.set_stylebox("panel", "PanelContainer", frame("panel"))
	theme.set_stylebox("normal", "CheckButton", frame("dark"))
	theme.set_stylebox("hover", "CheckButton", frame("dark"))
	theme.set_stylebox("pressed", "CheckButton", frame("dark"))
	theme.set_stylebox("hover_pressed", "CheckButton", frame("dark"))
	theme.set_stylebox("focus", "CheckButton", StyleBoxEmpty.new())
	theme.set_stylebox("background", "ProgressBar", frame("dark", 1))
	theme.set_stylebox("fill", "ProgressBar", flat(ACCENT))
	theme.set_stylebox("panel", "AcceptDialog", frame("panel"))
	theme.set_stylebox("panel", "ConfirmationDialog", frame("panel"))
	return theme


## A 9-slice pixel frame: dark outline with rounded corners, a highlight on the
## top and left, a shade on the bottom and right. `border` is in frame pixels.
static func frame(kind: String, border: int = 2) -> StyleBoxTexture:
	var key := "%s/%d" % [kind, border]
	if _frames.has(key):
		return _frames[key]
	var colors: Array = FRAMES.get(kind, FRAMES.panel)
	var n := border * 2 + 4
	var img := Image.create(n, n, false, Image.FORMAT_RGBA8)
	for y in n:
		for x in n:
			var edge := mini(mini(x, y), mini(n - 1 - x, n - 1 - y))
			var corner := (x == 0 or x == n - 1) and (y == 0 or y == n - 1)
			var c: Color
			if corner:
				c = Color(0, 0, 0, 0)
			elif edge == 0:
				c = OUTLINE
			elif edge < border:
				c = colors[1] if x < n - 1 - edge and y < n - 1 - edge and (x == edge or y == edge) else colors[2]
			else:
				c = colors[0]
			img.set_pixel(x, y, c)
	img.resize(n * PIXEL, n * PIXEL, Image.INTERPOLATE_NEAREST)
	var style := StyleBoxTexture.new()
	style.texture = ImageTexture.create_from_image(img)
	style.set_texture_margin_all((border + 1) * PIXEL)
	style.set_content_margin_all((border + 3) * PIXEL)
	_frames[key] = style
	return style


static func flat(color: Color) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	return style


## Kept for older callers: a plain colored box.
static func box(color: Color, _radius: int = 0, padding: int = 12) -> StyleBoxFlat:
	var style := flat(color)
	style.set_content_margin_all(padding)
	return style


static func label(text: String, font_size: int = FONT_SIZE, color: Color = TEXT) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", font_size)
	l.add_theme_color_override("font_color", color)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return l


## kind: "button" (default brown), "primary" (green), "danger" (red).
static func button(text: String, on_pressed: Callable, min_height: int = 72, kind: String = "button") -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(0, min_height)
	b.pressed.connect(on_pressed)
	if kind != "button":
		style_button(b, kind)
	return b


static func style_button(b: Button, kind: String) -> void:
	for state in ["normal", "hover"]:
		b.add_theme_stylebox_override(state, frame(kind))
	b.add_theme_stylebox_override("pressed", frame(kind + "_pressed") if FRAMES.has(kind + "_pressed") else frame("button_pressed"))


static func panel(kind: String = "panel") -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", frame(kind))
	return p


static func progress_bar(color: Color = ACCENT, height: int = 14) -> ProgressBar:
	var bar := ProgressBar.new()
	bar.show_percentage = false
	bar.max_value = 1.0
	bar.step = 0.0
	bar.custom_minimum_size = Vector2(0, height)
	bar.add_theme_stylebox_override("fill", flat(color))
	return bar


## The icon for a resource (art/resources/<id>.png), or null.
static func resource_icon(id: String, content) -> Texture2D:
	return Sprites.for_entry("resources", content.entry("resources", id))


## A row of "icon amount" pairs for costs and loot; falls back to names.
static func amounts_row(amounts: Dictionary, content, font_size: int = FONT_SIZE, color: Color = TEXT) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if amounts.is_empty():
		row.add_child(label("Free", font_size, color))
	for id in amounts:
		var tex := resource_icon(id, content)
		var text := str(int(amounts[id]))
		if tex == null:
			text += " " + str(content.entry("resources", id).get("name", id))
		else:
			row.add_child(icon_rect(tex, font_size + 6))
		var l := label(text, font_size, color)
		l.autowrap_mode = TextServer.AUTOWRAP_OFF
		row.add_child(l)
	return row


static func icon_rect(tex: Texture2D, px: int) -> TextureRect:
	var r := TextureRect.new()
	r.texture = tex
	r.custom_minimum_size = Vector2(px, px)
	r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	r.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return r


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
