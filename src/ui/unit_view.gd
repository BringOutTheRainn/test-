extends Control
## One combatant standing on the battlefield: sprite, shadow, health bar,
## energy pips and status tags, plus the small animations the battle screen
## plays (idle bob, lunge, hop, hit flash, floating numbers, falling).
## The node's position is the unit's feet; everything is drawn around it.
## Tapping it reports the unit uid (used to pick targets).

signal tapped(uid: String)

const UI := preload("res://src/ui/ui_kit.gd")
const Sprites := preload("res://src/ui/sprites.gd")

const SPRITE_SIZE := 128.0
const BOSS_SIZE := 176.0
const BAR_W := 120.0

var uid := ""
var team := ""
var speed := 1.0
var _sprite: TextureRect
var _block: ColorRect
var _body: Control
var _status: Label
var _name: Label
var _hp := 1.0
var _hp_shown := 1.0
var _ghost := 1.0
var _energy := 0
var _max_energy := 3
var _is_current := false
var _is_target := false
var _dead := false
var _phase := 0.0
var _time := 0.0
var _busy := 0
var _sprite_h := SPRITE_SIZE


func setup(u: Dictionary, max_energy: int) -> void:
	uid = u.uid
	team = u.team
	_max_energy = max_energy
	_phase = randf() * TAU
	_sprite_h = BOSS_SIZE if u.boss else SPRITE_SIZE
	size = Vector2(BAR_W + 20, _sprite_h + 70)
	pivot_offset = Vector2(size.x / 2.0, _sprite_h)
	mouse_filter = Control.MOUSE_FILTER_STOP

	# _body holds the picture and is what moves during animations.
	_body = Control.new()
	_body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_body.size = Vector2(_sprite_h, _sprite_h)
	_body.pivot_offset = Vector2(_sprite_h / 2.0, _sprite_h)
	add_child(_body)
	var type := "heroes" if team == "hero" else "enemies"
	var def: Dictionary = Content.entry(type, str(u.get("base", u.id)) if team == "hero" else u.id)
	var tex := Sprites.for_unit(u, Content)
	if tex != null:
		_sprite = UI.icon_rect(tex, int(_sprite_h))
		_sprite.size = Vector2(_sprite_h, _sprite_h)
		_sprite.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		# Heroes face right and enemies face left; "faces" says which way the art looks.
		var faces := str(def.get("faces", "right" if team == "hero" else "left"))
		_sprite.flip_h = (team == "hero") != (faces == "right")
		_body.add_child(_sprite)
	else:
		_block = ColorRect.new()
		_block.color = Color(u.color)
		_block.size = Vector2(_sprite_h * 0.55, _sprite_h * 0.7)
		_block.position = Vector2(_sprite_h * 0.225, _sprite_h * 0.3)
		_block.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_body.add_child(_block)
	_layout_body(0.0)

	_status = UI.label("", UI.SMALL, UI.ACCENT)
	_status.autowrap_mode = TextServer.AUTOWRAP_OFF
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_status.size = Vector2(size.x + 60, 22)
	_status.position = Vector2(-30, -4)
	_status.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_status)
	_name = UI.label(u.name, UI.SMALL)
	_name.autowrap_mode = TextServer.AUTOWRAP_OFF
	_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_name.size = Vector2(size.x + 60, 22)
	_name.position = Vector2(-30, _sprite_h + 34)
	_name.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_name)


## Place so the feet are at `feet` (in the parent's coordinates).
func stand_at(feet: Vector2) -> void:
	position = (feet - Vector2(size.x / 2.0, _sprite_h)).floor()


func feet() -> Vector2:
	return position + Vector2(size.x / 2.0, _sprite_h)


func head() -> Vector2:
	return position + Vector2(size.x / 2.0, _sprite_h * 0.25)


func refresh(u: Dictionary, is_current: bool, is_target: bool) -> void:
	_hp = float(u.hp) / float(u.max_hp)
	_energy = int(u.energy)
	_is_current = is_current
	_is_target = is_target
	var tags: Array = []
	for id in u.statuses:
		tags.append("%s %d" % [str(id).capitalize(), int(u.statuses[id].turns)])
	_status.text = " ".join(tags)
	if int(u.hp) <= 0 and not _dead:
		_dead = true
		_play_fall()
	queue_redraw()


func is_animating() -> bool:
	return _busy > 0


func _process(delta: float) -> void:
	_time += delta
	# Health bar drains smoothly; the pale "ghost" part lags behind.
	_hp_shown = move_toward(_hp_shown, _hp, delta * 2.0)
	_ghost = maxf(_hp_shown, move_toward(_ghost, _hp_shown, delta * 0.6))
	if _busy == 0 and not _dead:
		_layout_body(roundf(sin(_time * 2.5 + _phase) * 1.5) * UI.PIXEL)
	queue_redraw()


func _layout_body(bob: float) -> void:
	_body.position = Vector2((size.x - _sprite_h) / 2.0, bob)


func _draw() -> void:
	var p := float(UI.PIXEL)
	var foot := Vector2(size.x / 2.0, _sprite_h)
	# Pixel shadow under the feet.
	var w := _sprite_h * 0.5
	draw_rect(Rect2(foot + Vector2(-w / 2.0, -p * 2), Vector2(w, p * 3)), Color(0, 0, 0, 0.35))
	draw_rect(Rect2(foot + Vector2(-w / 2.0 + p * 2, -p * 3), Vector2(w - p * 4, p * 5)), Color(0, 0, 0, 0.25))
	if _is_target:
		_draw_reticle()
	if _is_current and not _dead:
		var y := -6.0 + roundf(sin(_time * 6.0)) * p * 2
		var tip := Vector2(size.x / 2.0, y + 24)
		draw_colored_polygon(PackedVector2Array([tip + Vector2(-18, -18), tip + Vector2(18, -18), tip]), UI.OUTLINE)
		draw_colored_polygon(PackedVector2Array([tip + Vector2(-12, -15), tip + Vector2(12, -15), tip + Vector2(0, -3)]), UI.ACCENT)
	if _dead:
		return
	# Health bar.
	var bar := Rect2(Vector2((size.x - BAR_W) / 2.0, _sprite_h + 10), Vector2(BAR_W, p * 4))
	draw_rect(bar.grow(p), UI.OUTLINE)
	draw_rect(bar, Color("#3a4466"))
	draw_rect(Rect2(bar.position, Vector2(bar.size.x * _ghost, bar.size.y)), Color("#ead4aa"))
	var fill := UI.GOOD if team == "hero" else UI.BAD
	if team == "hero" and _hp_shown < 0.35:
		fill = Color("#feae34")
	draw_rect(Rect2(bar.position, Vector2(bar.size.x * _hp_shown, bar.size.y)), fill)
	draw_rect(Rect2(bar.position, Vector2(bar.size.x * _hp_shown, p)), fill.lightened(0.35))
	# Energy pips for heroes.
	if team == "hero":
		for i in _max_energy:
			var pip := Rect2(bar.position + Vector2(i * p * 5, bar.size.y + p * 2), Vector2(p * 4, p * 3))
			draw_rect(pip.grow(p * 0.5), UI.OUTLINE)
			draw_rect(pip, UI.ENERGY if i < _energy else Color("#262b44"))


func _draw_reticle() -> void:
	var p := float(UI.PIXEL)
	var r := Rect2(Vector2((size.x - _sprite_h) / 2.0, 6), Vector2(_sprite_h, _sprite_h - 6)).grow(-p * 2)
	var arm := 20.0
	var pulse := 1.0 if int(_time * 4.0) % 2 == 0 else 0.6
	var c := UI.BAD * Color(1, 1, 1, pulse)
	for corner in [r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y)]:
		var sx := 1.0 if corner.x == r.position.x else -1.0
		var sy := 1.0 if corner.y == r.position.y else -1.0
		draw_rect(Rect2(corner + Vector2(minf(0, arm * sx), minf(0, p * 2 * sy)), Vector2(arm, p * 2)), c)
		draw_rect(Rect2(corner + Vector2(minf(0, p * 2 * sx), minf(0, arm * sy)), Vector2(p * 2, arm)), c)


# --- Animations ----------------------------------------------------------------

## Step toward a point (melee): out, pause, back. Returns when it lands.
func lunge(to: Vector2) -> void:
	_busy += 1
	var dx := (to.x - feet().x) * 0.7
	var t := create_tween()
	t.tween_property(_body, "position:x", _body.position.x + dx, 0.18 / speed).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	await t.finished
	_back_after(0.12, 0.2)


## A small jump in place (spells, shots, buffs).
func hop() -> void:
	_busy += 1
	var t := create_tween()
	t.tween_property(_body, "position:y", -18.0, 0.12 / speed).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	await t.finished
	_back_after(0.0, 0.12)


func _back_after(wait: float, duration: float) -> void:
	var t := create_tween()
	if wait > 0.0:
		t.tween_interval(wait / speed)
	t.tween_property(_body, "position", Vector2((size.x - _sprite_h) / 2.0, 0.0), duration / speed).set_trans(Tween.TRANS_QUAD)
	await t.finished
	_busy -= 1


## Flash white and shake sideways.
func hit(heavy: bool = false) -> void:
	_busy += 1
	var away := 1.0 if team == "enemy" else -1.0
	var base := Vector2((size.x - _sprite_h) / 2.0, 0.0)
	_body.modulate = Color(6, 6, 6)
	var t := create_tween()
	var kick := 14.0 if heavy else 8.0
	t.tween_property(_body, "position:x", base.x + kick * away, 0.05 / speed)
	t.tween_property(_body, "modulate", Color(1, 0.55, 0.55), 0.06 / speed)
	t.tween_property(_body, "position:x", base.x - kick * 0.5 * away, 0.06 / speed)
	t.tween_property(_body, "position:x", base.x, 0.08 / speed)
	t.parallel().tween_property(_body, "modulate", Color.WHITE, 0.12 / speed)
	await t.finished
	_busy -= 1


## Green glow for heals and buffs.
func glow(color: Color) -> void:
	_busy += 1
	var t := create_tween()
	t.tween_property(_body, "modulate", color * Color(1.8, 1.8, 1.8), 0.1 / speed)
	t.tween_property(_body, "modulate", Color.WHITE, 0.25 / speed)
	await t.finished
	_busy -= 1


func _play_fall() -> void:
	_busy += 1
	var dir := -1.0 if team == "hero" else 1.0
	var t := create_tween()
	t.tween_interval(0.15 / speed)
	t.tween_property(_body, "rotation", deg_to_rad(80.0) * dir, 0.3 / speed).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_IN)
	t.parallel().tween_property(_body, "modulate", Color(0.6, 0.6, 0.6, 0.45), 0.3 / speed)
	await t.finished
	_busy -= 1


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT and not event.pressed:
		tapped.emit(uid)
		accept_event()
