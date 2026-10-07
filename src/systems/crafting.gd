extends RefCounted
## Crafting at the Blacksmith, with no UI.
##
## Recipes are data (data/recipes): {"item": item id, "cost": {...},
## "seconds": n, "blacksmith_level": n}. The highest finished building that
## provides "crafting" sets which recipes are known. One item is crafted at a
## time; it is a timer in the shared timer service, so it keeps going while the
## game is closed and can be finished early with gems like a build.

signal crafted(item_id: String)

const CRAFT_TIMER := "craft"
const TIMER_REF := "crafting"

var content
var inventory
var timers
var city


func setup(content_db, inv, timer_service, city_model) -> void:
	content = content_db
	inventory = inv
	timers = timer_service
	city = city_model
	timers.finished.connect(_on_timer_finished)


## The crafting level the city has (0 means no Blacksmith yet).
func level() -> int:
	var best := 0
	for b in city.buildings.values():
		best = maxi(best, int(city.level_data(b.id, int(b.level)).get("provides", {}).get("crafting", 0)))
	return best


func recipes() -> Array:
	return content.list("recipes")


func recipe(id: String) -> Dictionary:
	return content.entry("recipes", id)


## The running craft timer, or {}.
func current() -> Dictionary:
	return timers.for_ref(TIMER_REF)


func is_busy() -> bool:
	return not current().is_empty()


## Why a recipe can't be started now, or "".
func can_craft(id: String) -> String:
	var r := recipe(id)
	if r.is_empty():
		return "Unknown recipe"
	if level() <= 0:
		return "Build a Blacksmith first"
	if level() < int(r.get("blacksmith_level", 1)):
		return "Needs Blacksmith level %d" % int(r.get("blacksmith_level", 1))
	if is_busy():
		return "The Blacksmith is busy"
	if not inventory.can_afford(r.get("cost", {})):
		return "Not enough resources"
	return ""


func start(id: String) -> bool:
	if can_craft(id) != "":
		return false
	var r := recipe(id)
	inventory.spend(r.get("cost", {}))
	timers.start(CRAFT_TIMER, TIMER_REF, float(r.get("seconds", 0)), {"item": str(r.item)})
	return true


func _on_timer_finished(timer: Dictionary) -> void:
	if timer.kind == CRAFT_TIMER:
		crafted.emit(str(timer.data.get("item", "")))
