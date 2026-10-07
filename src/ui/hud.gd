extends PanelContainer
## Resource bar at the top of every screen. Shows every resource marked
## "hud": true in data/resources, so new resources appear automatically. A
## resource with art/resources/<id>.png shows its icon, otherwise its name.

const UI := preload("res://src/ui/ui_kit.gd")

var _labels: Dictionary = {}
## Resource id -> chip; a resource with "hud_town_hall" stays hidden until then.
var _chips: Dictionary = {}
var _builders: Label
var _refresh_left := 0.0


func _ready() -> void:
	add_theme_stylebox_override("panel", UI.frame("dark"))
	var flow := HFlowContainer.new()
	flow.add_theme_constant_override("h_separation", 18)
	flow.add_theme_constant_override("v_separation", 6)
	add_child(flow)
	for res in Content.list("resources"):
		if not res.get("hud", false):
			continue
		var chip := HBoxContainer.new()
		chip.add_theme_constant_override("separation", 6)
		flow.add_child(chip)
		var tex := UI.resource_icon(res.id, Content)
		if tex != null:
			chip.add_child(UI.icon_rect(tex, 30))
		var l := UI.label("", UI.SMALL, Color(str(res.get("color", "#ffffff"))))
		l.autowrap_mode = TextServer.AUTOWRAP_OFF
		chip.add_child(l)
		_labels[res.id] = l
		_chips[res.id] = chip
	_builders = UI.label("", UI.SMALL, UI.TEXT)
	_builders.autowrap_mode = TextServer.AUTOWRAP_OFF
	flow.add_child(_builders)
	_refresh()


func _process(delta: float) -> void:
	_refresh_left -= delta
	if _refresh_left <= 0.0:
		_refresh()


func _refresh() -> void:
	_refresh_left = 0.25
	for id in _labels:
		var res: Dictionary = Content.entry("resources", id)
		_chips[id].visible = Game.city.town_hall_level() >= int(res.get("hud_town_hall", 0))
		var text := str(Game.inventory.whole(id))
		if UI.resource_icon(id, Content) == null:
			text = "%s %s" % [res.get("name", id), text]
		var cap: float = Game.inventory.cap(id)
		if cap != INF:
			text += "/%d" % int(cap)
		_labels[id].text = text
	_builders.text = "Builders %d/%d" % [Game.city.builders_free(), Game.city.builders_total()]
