extends PanelContainer
## Resource bar at the top of every screen. Shows every resource marked
## "hud": true in data/resources, so new resources appear automatically.

const UI := preload("res://src/ui/ui_kit.gd")

var _labels: Dictionary = {}
var _builders: Label
var _refresh_left := 0.0


func _ready() -> void:
	var flow := HFlowContainer.new()
	flow.add_theme_constant_override("h_separation", 22)
	flow.add_theme_constant_override("v_separation", 6)
	add_child(flow)
	for res in Content.list("resources"):
		if not res.get("hud", false):
			continue
		var l := UI.label("", 24, Color(str(res.get("color", "#ffffff"))))
		l.autowrap_mode = TextServer.AUTOWRAP_OFF
		flow.add_child(l)
		_labels[res.id] = l
	_builders = UI.label("", 24, UI.MUTED)
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
		var text := "%s %d" % [res.get("name", id), Game.inventory.whole(id)]
		var cap: float = Game.inventory.cap(id)
		if cap != INF:
			text += "/%d" % int(cap)
		_labels[id].text = text
	_builders.text = "Builders %d/%d" % [Game.city.builders_free(), Game.city.builders_total()]
