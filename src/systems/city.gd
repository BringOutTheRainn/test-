extends RefCounted
## City model: the building grid, construction and upgrades, storage caps and
## production. It knows nothing about UI; it reads definitions from the content
## database and uses the shared inventory and timer service.
##
## A building definition's levels each have a "provides" block. The city sums
## those blocks across finished buildings, so new kinds of bonus (storage,
## production, builders, party size, ...) only need a new key in the data.

signal building_changed(building: Dictionary)

const BUILD_TIMER := "build"

var content
var inventory
var timers
var width := 8
var height := 9
## Building uid -> {uid, id, level, x, y}
var buildings: Dictionary = {}
var _next_uid := 1


func setup(content_db, inv, timer_service) -> void:
	content = content_db
	inventory = inv
	timers = timer_service
	var grid: Dictionary = content.setting("grid", {})
	width = int(grid.get("width", 8))
	height = int(grid.get("height", 9))
	timers.finished.connect(_on_timer_finished)


func new_city() -> void:
	buildings = {}
	_next_uid = 1
	for start in content.setting("starting_buildings", []):
		var b := _add_building(str(start.id), int(start.x), int(start.y))
		b.level = int(start.get("level", 1))
	recompute_caps()


# --- Queries -----------------------------------------------------------------

func definition(id: String) -> Dictionary:
	return content.entry("buildings", id)


func level_data(id: String, level: int) -> Dictionary:
	var levels: Array = definition(id).get("levels", [])
	if level < 1 or level > levels.size():
		return {}
	return levels[level - 1]


func max_level(id: String) -> int:
	return definition(id).get("levels", []).size()


func town_hall_level() -> int:
	var best := 0
	for b in buildings.values():
		if b.id == "town_hall":
			best = maxi(best, int(b.level))
	return best


func building_at(x: int, y: int) -> Dictionary:
	for b in buildings.values():
		if int(b.x) == x and int(b.y) == y:
			return b
	return {}


func get_building(uid: String) -> Dictionary:
	return buildings.get(uid, {})


func count_of(id: String) -> int:
	var n := 0
	for b in buildings.values():
		if b.id == id:
			n += 1
	return n


## How many of a building the current Town Hall level allows.
## "max_count" is a number, or a list indexed by Town Hall level.
func max_count(id: String) -> int:
	var value = definition(id).get("max_count", 1)
	if value is Array:
		if value.is_empty():
			return 0
		var index := clampi(town_hall_level() - 1, 0, value.size() - 1)
		return int(value[index])
	return int(value)


## The timer for a building under construction or upgrade, or {}.
func timer_for(uid: String) -> Dictionary:
	return timers.for_ref(uid)


func is_busy(uid: String) -> bool:
	return not timer_for(uid).is_empty()


func builders_total() -> int:
	return int(content.setting("starting_builders", 2)) + int(provided_total("builders"))


func builders_free() -> int:
	return builders_total() - timers.count(BUILD_TIMER)


## Sums one numeric "provides" key across finished buildings.
func provided_total(key: String) -> float:
	var total := 0.0
	for b in buildings.values():
		var value = level_data(b.id, int(b.level)).get("provides", {}).get(key, 0)
		if value is float or value is int:
			total += value
	return total


## Sums one per-resource "provides" key (e.g. "production", "storage").
func provided_map(key: String) -> Dictionary:
	var out := {}
	for b in buildings.values():
		var values: Dictionary = level_data(b.id, int(b.level)).get("provides", {}).get(key, {})
		for res in values:
			out[res] = out.get(res, 0.0) + float(values[res])
	return out


func production_per_hour() -> Dictionary:
	return provided_map("production")


# --- Actions -----------------------------------------------------------------

## Why a building cannot be placed here, or "" if it can.
func can_place(id: String, x: int, y: int) -> String:
	var def := definition(id)
	if def.is_empty():
		return "Unknown building"
	if x < 0 or y < 0 or x >= width or y >= height:
		return "Outside the city"
	if not building_at(x, y).is_empty():
		return "Tile is taken"
	if town_hall_level() < int(def.get("unlock_town_hall", 1)):
		return "Needs Town Hall %d" % int(def.get("unlock_town_hall", 1))
	if count_of(id) >= max_count(id):
		return "Limit reached for this Town Hall level"
	if builders_free() <= 0:
		return "All builders are busy"
	var cost: Dictionary = level_data(id, 1).get("cost", {})
	if not inventory.can_afford(cost):
		return "Not enough resources"
	return ""


func place(id: String, x: int, y: int) -> Dictionary:
	if can_place(id, x, y) != "":
		return {}
	var data := level_data(id, 1)
	inventory.spend(data.get("cost", {}))
	var b := _add_building(id, x, y)
	_start_build(b, 1, float(data.get("build_seconds", 0)))
	return b


## Why a building cannot be upgraded, or "" if it can.
func can_upgrade(uid: String) -> String:
	var b := get_building(uid)
	if b.is_empty():
		return "No building"
	if is_busy(uid):
		return "Already under construction"
	var next := int(b.level) + 1
	if next > max_level(b.id):
		return "Max level"
	if b.id != "town_hall" and next > town_hall_level():
		return "Needs Town Hall %d" % next
	if builders_free() <= 0:
		return "All builders are busy"
	if not inventory.can_afford(level_data(b.id, next).get("cost", {})):
		return "Not enough resources"
	return ""


func upgrade(uid: String) -> bool:
	if can_upgrade(uid) != "":
		return false
	var b := get_building(uid)
	var data := level_data(b.id, int(b.level) + 1)
	inventory.spend(data.get("cost", {}))
	_start_build(b, int(b.level) + 1, float(data.get("build_seconds", 0)))
	return true


## Adds production for a span of time. Production keeps running while a
## building upgrades; a building still at level 0 produces nothing.
func tick(seconds: float) -> void:
	if seconds <= 0.0:
		return
	var rates := production_per_hour()
	for res in rates:
		inventory.add(res, rates[res] * seconds / 3600.0)


func recompute_caps() -> void:
	var caps := {}
	for res in content.list("resources"):
		if res.has("base_cap"):
			caps[res.id] = float(res.base_cap)
	var extra := provided_map("storage")
	for res in extra:
		caps[res] = caps.get(res, 0.0) + extra[res]
	inventory.set_caps(caps)


# --- Internals ---------------------------------------------------------------

func _add_building(id: String, x: int, y: int) -> Dictionary:
	var b := {"uid": str(_next_uid), "id": id, "level": 0, "x": x, "y": y}
	_next_uid += 1
	buildings[b.uid] = b
	building_changed.emit(b)
	return b


func _start_build(b: Dictionary, target_level: int, seconds: float) -> void:
	timers.start(BUILD_TIMER, b.uid, seconds, {"target_level": target_level})
	building_changed.emit(b)


func _on_timer_finished(timer: Dictionary) -> void:
	if timer.kind != BUILD_TIMER or not buildings.has(timer.ref):
		return
	var b: Dictionary = buildings[timer.ref]
	b.level = int(timer.data.get("target_level", int(b.level) + 1))
	recompute_caps()
	building_changed.emit(b)


func to_dict() -> Dictionary:
	return {"next_uid": _next_uid, "buildings": buildings.duplicate(true)}


func from_dict(data: Dictionary) -> void:
	_next_uid = int(data.get("next_uid", 1))
	buildings = {}
	var saved: Dictionary = data.get("buildings", {})
	for uid in saved:
		var b: Dictionary = saved[uid]
		# Drop buildings whose definition was removed by an update.
		if definition(str(b.id)).is_empty():
			continue
		buildings[str(uid)] = {
			"uid": str(uid), "id": str(b.id), "level": int(b.level), "x": int(b.x), "y": int(b.y),
		}
	recompute_caps()
