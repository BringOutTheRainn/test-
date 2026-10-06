extends Control
## Draws the town and reports taps on tiles. Ground is pixel grass; each
## building stands on its tile and is drawn taller than the tile (like Pixel
## Tribe), back rows first so nearer buildings overlap farther ones. A
## building without art is a colored block using the "color" and "short"
## fields from its data file.

signal tile_tapped(cell: Vector2i)

const UI := preload("res://src/ui/ui_kit.gd")
const Sprites := preload("res://src/ui/sprites.gd")
const GRASS := [Color("#3e8948"), Color("#3a8244")]
const TUFT := Color("#63c74d")
const DIRT := Color("#733e39")
const DIRT_EDGE := Color("#3e2731")
## How much bigger than its tile a building sprite is drawn.
const BUILDING_SCALE := 1.35
## Tiles never get smaller than this; a bigger town scrolls (drag to pan).
const MIN_TILE := 120.0

var city
var selected := Vector2i(-1, -1)
var _press_pos := Vector2.ZERO
var _pan := Vector2.ZERO
var _dragging := false
var _centered := false


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	custom_minimum_size = Vector2(0, 400)
	clip_contents = true


func _process(_delta: float) -> void:
	# Timers and production change every frame; the grid is cheap to redraw.
	queue_redraw()


func tile_size() -> float:
	return floorf(maxf(MIN_TILE, minf(size.x / city.width, size.y / city.height)))


## Top-left of the board on screen. A board smaller than the view is
## centered; a bigger one is offset by the pan, clamped to its edges.
func origin() -> Vector2:
	var board := Vector2(city.width, city.height) * tile_size()
	var o := Vector2.ZERO
	for axis in 2:
		if board[axis] <= size[axis]:
			o[axis] = (size[axis] - board[axis]) / 2.0
		else:
			_pan[axis] = clampf(_pan[axis], size[axis] - board[axis], 0.0)
			o[axis] = _pan[axis]
	return o.floor()


## Scrolls so a cell is in the middle of the view.
func center_on(cell: Vector2i) -> void:
	var t := tile_size()
	_pan = size / 2.0 - (Vector2(cell) + Vector2(0.5, 0.5)) * t


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
			_dragging = false
		elif not _dragging:
			var cell := cell_at(event.position)
			if cell.x >= 0:
				tile_tapped.emit(cell)
				accept_event()
	elif event is InputEventMouseMotion and event.button_mask & MOUSE_BUTTON_MASK_LEFT:
		if _dragging or event.position.distance_to(_press_pos) > 24.0:
			_dragging = true
			_pan += event.relative
			accept_event()


func _draw() -> void:
	if city == null:
		return
	if not _centered and size.x > 0.0:
		_centered = true
		var th: Array = city.buildings.values().filter(func(b): return b.id == "town_hall")
		center_on(Vector2i(int(th[0].x), int(th[0].y)) if not th.is_empty() else Vector2i(city.width / 2, city.height / 2))
	var t := tile_size()
	var o := origin()
	var p := float(UI.PIXEL)
	var board := Rect2(o, Vector2(city.width, city.height) * t)
	draw_rect(Rect2(Vector2.ZERO, size), Color("#265c42"))
	draw_rect(board.grow(p * 2), UI.OUTLINE)
	for y in city.height:
		for x in city.width:
			var rect := Rect2(o + Vector2(x, y) * t, Vector2(t, t))
			draw_rect(rect, GRASS[(x + y) % 2])
			# A few fixed tufts per tile so the grass is not flat.
			var h := absi(hash(Vector2i(x, y)))
			for i in 3:
				var tuft := Vector2((h >> (i * 7)) % int(t - p * 3), (h >> (i * 7 + 3)) % int(t - p * 3)).floor()
				draw_rect(Rect2(rect.position + tuft, Vector2(p, p * 2)), TUFT)
				draw_rect(Rect2(rect.position + tuft + Vector2(p * 2, p), Vector2(p, p)), TUFT)

	var font := UI.font()
	var buildings: Array = city.buildings.values()
	buildings.sort_custom(func(a, b): return int(a.y) < int(b.y) or (int(a.y) == int(b.y) and int(a.x) < int(b.x)))
	# Dirt plots first so no plot covers a building in front of it.
	for b in buildings:
		var plot := Rect2(o + Vector2(int(b.x), int(b.y)) * t, Vector2(t, t)).grow(-p * 2)
		draw_rect(plot, DIRT_EDGE)
		draw_rect(plot.grow(-p), DIRT)
	for b in buildings:
		var def: Dictionary = city.definition(b.id)
		var tile := Rect2(o + Vector2(int(b.x), int(b.y)) * t, Vector2(t, t))
		var timer: Dictionary = city.timer_for(b.uid)
		var tex := Sprites.for_entry("buildings", def)
		if tex != null:
			var area_size := Vector2(t, t) * BUILDING_SCALE
			var area := Rect2(Vector2(tile.get_center().x - area_size.x / 2.0, tile.end.y - area_size.y - p), area_size)
			# Unfinished buildings are drawn dimmed until their first build completes.
			var tint := Color(0.45, 0.45, 0.45) if int(b.level) == 0 else Color.WHITE
			draw_texture_rect(tex, Sprites.fit_bottom(tex, area), false, tint)
		else:
			var rect := tile.grow(-p * 3)
			var color := Color(str(def.get("color", "#888888")))
			if int(b.level) == 0:
				color = color.darkened(0.45)
			draw_rect(rect, UI.OUTLINE)
			draw_rect(rect.grow(-p), color)
			var short := str(def.get("short", def.get("name", "?")))
			draw_string(font, rect.position + Vector2(p * 2, 22), short, HORIZONTAL_ALIGNMENT_LEFT, rect.size.x, UI.SMALL, UI.TEXT)
		if int(b.level) > 0:
			_draw_level(tile, int(b.level), font)
		if not timer.is_empty():
			_draw_timer(tile, timer, font)

	if selected.x >= 0:
		var sel := Rect2(o + Vector2(selected) * t, Vector2(t, t))
		_draw_corners(sel, UI.ACCENT)


func _draw_level(tile: Rect2, level: int, font: Font) -> void:
	var p := float(UI.PIXEL)
	var badge := Rect2(tile.position + Vector2(0, tile.size.y - 24), Vector2(36, 24))
	draw_rect(badge, UI.OUTLINE)
	draw_rect(badge.grow(-p), UI.PANEL)
	draw_string(font, badge.position + Vector2(p * 2, 20), "L%d" % level, HORIZONTAL_ALIGNMENT_LEFT, badge.size.x, UI.SMALL, UI.ACCENT)


func _draw_timer(tile: Rect2, timer: Dictionary, font: Font) -> void:
	var p := float(UI.PIXEL)
	var bar := Rect2(tile.position + Vector2(p, tile.size.y * 0.42), Vector2(tile.size.x - p * 2, p * 4))
	draw_rect(bar.grow(p), UI.OUTLINE)
	draw_rect(bar, Color("#262b44"))
	draw_rect(Rect2(bar.position, Vector2(bar.size.x * city.timers.progress(timer), bar.size.y)), UI.ACCENT)
	var text := UI.format_time(city.timers.remaining(timer))
	var back := Rect2(bar.position + Vector2(0, bar.size.y + p * 2), Vector2(bar.size.x, 22))
	draw_rect(back, Color(0.09, 0.08, 0.15, 0.8))
	draw_string(font, back.position + Vector2(p, 19), text, HORIZONTAL_ALIGNMENT_CENTER, back.size.x - p * 2, UI.SMALL, UI.TEXT)


## Selection marker: pixel corner brackets around the tile.
func _draw_corners(r: Rect2, color: Color) -> void:
	var p := float(UI.PIXEL)
	var arm := r.size.x * 0.3
	for corner in [r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y)]:
		var sx := 1.0 if corner.x == r.position.x else -1.0
		var sy := 1.0 if corner.y == r.position.y else -1.0
		for pass_i in 2:
			var c := UI.OUTLINE if pass_i == 0 else color
			var w: float = p * (3.0 if pass_i == 0 else 1.5) * 2.0
			var off := Vector2(0, 0)
			draw_line(corner + off, corner + Vector2(arm * sx, 0), c, w)
			draw_line(corner + off, corner + Vector2(0, arm * sy), c, w)
