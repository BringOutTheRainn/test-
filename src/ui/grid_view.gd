extends Control
## Draws the city grid and reports taps on tiles. Placeholder art: each
## building is a colored block using the "color" and "short" fields from its
## data file.

signal tile_tapped(cell: Vector2i)

const UI := preload("res://src/ui/ui_kit.gd")
const GRASS_A := Color("#3e5f3a")
const GRASS_B := Color("#456b40")

var city
var selected := Vector2i(-1, -1)
var _press_pos := Vector2.ZERO


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	custom_minimum_size = Vector2(0, 400)


func _process(_delta: float) -> void:
	# Timers and production change every frame; the grid is cheap to redraw.
	queue_redraw()


func tile_size() -> float:
	return floorf(minf(size.x / city.width, size.y / city.height))


func origin() -> Vector2:
	var t := tile_size()
	return ((size - Vector2(city.width, city.height) * t) / 2.0).floor()


func cell_at(pos: Vector2) -> Vector2i:
	var local := (pos - origin()) / tile_size()
	var cell := Vector2i(floori(local.x), floori(local.y))
	if cell.x < 0 or cell.y < 0 or cell.x >= city.width or cell.y >= city.height:
		return Vector2i(-1, -1)
	return cell


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			_press_pos = event.position
		elif event.position.distance_to(_press_pos) < 24.0:
			var cell := cell_at(event.position)
			if cell.x >= 0:
				tile_tapped.emit(cell)
				accept_event()


func _draw() -> void:
	if city == null:
		return
	var t := tile_size()
	var o := origin()
	var font := ThemeDB.fallback_font
	for y in city.height:
		for x in city.width:
			var rect := Rect2(o + Vector2(x, y) * t, Vector2(t, t))
			draw_rect(rect, GRASS_A if (x + y) % 2 == 0 else GRASS_B)

	for b in city.buildings.values():
		var def: Dictionary = city.definition(b.id)
		var rect := Rect2(o + Vector2(int(b.x), int(b.y)) * t, Vector2(t, t)).grow(-4)
		var color := Color(str(def.get("color", "#888888")))
		var timer: Dictionary = city.timer_for(b.uid)
		if int(b.level) == 0:
			color = color.darkened(0.45)
		draw_rect(rect, color)
		draw_rect(rect, color.darkened(0.4), false, 3.0)
		var short := str(def.get("short", def.get("name", "?")))
		draw_string(font, rect.position + Vector2(6, 26), short, HORIZONTAL_ALIGNMENT_LEFT, rect.size.x - 8, 20, UI.TEXT)
		if int(b.level) > 0:
			draw_string(font, rect.position + Vector2(6, rect.size.y - 10), "Lv%d" % int(b.level), HORIZONTAL_ALIGNMENT_LEFT, rect.size.x - 8, 18, UI.TEXT)
		if not timer.is_empty():
			var bar := Rect2(rect.position + Vector2(4, rect.size.y * 0.5), Vector2(rect.size.x - 8, 10))
			draw_rect(bar, UI.BG)
			draw_rect(Rect2(bar.position, Vector2(bar.size.x * city.timers.progress(timer), bar.size.y)), UI.ACCENT)
			draw_string(font, bar.position + Vector2(0, 30), UI.format_time(city.timers.remaining(timer)), HORIZONTAL_ALIGNMENT_LEFT, bar.size.x, 16, UI.TEXT)

	if selected.x >= 0:
		var sel := Rect2(o + Vector2(selected) * t, Vector2(t, t)).grow(-2)
		draw_rect(sel, UI.ACCENT, false, 4.0)
