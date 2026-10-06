extends Node
## Owns the player's state and wires the independent systems together.
## Systems (inventory, timers, city) don't know about each other's UI or about
## saving; this node connects their signals to the EventBus and handles
## saving, loading and catching up on time spent away.

const Inventory := preload("res://src/systems/inventory.gd")
const TimerService := preload("res://src/systems/timer_service.gd")
const City := preload("res://src/systems/city.gd")
const Economy := preload("res://src/systems/economy.gd")
const Heroes := preload("res://src/systems/heroes.gd")
const SaveService := preload("res://src/core/save_service.gd")

const AUTOSAVE_SECONDS := 30.0

var inventory: Inventory
var timers: TimerService
var city: City
var roster: Heroes
## Hero ids that go into dungeons, in order (the first party_size() fight).
var party: Array = []
var save_path := SaveService.DEFAULT_PATH
var _autosave_left := AUTOSAVE_SECONDS
var _last_tick := 0.0


func _ready() -> void:
	inventory = Inventory.new()
	timers = TimerService.new()
	city = City.new()
	city.setup(Content, inventory, timers)
	roster = Heroes.new()
	roster.setup(Content)

	inventory.changed.connect(func(): EventBus.resources_changed.emit())
	city.building_changed.connect(func(b): EventBus.building_changed.emit(b))
	timers.started.connect(func(t): EventBus.timer_started.emit(t))
	timers.finished.connect(_on_timer_finished)
	roster.leveled_up.connect(func(id, lvl): EventBus.toast.emit("%s reached level %d!" % [Content.entry("heroes", id).get("name", id), lvl]))
	roster.changed.connect(func(id): EventBus.heroes_changed.emit(id))

	if not load_game():
		new_game()


func _process(delta: float) -> void:
	# Production is driven by the real clock, not frame time, so pausing the
	# app or closing it is handled the same way as a normal frame.
	catch_up(_last_tick)
	_autosave_left -= delta
	if _autosave_left <= 0.0:
		save_game()


func _notification(what: int) -> void:
	if what == NOTIFICATION_WM_CLOSE_REQUEST or what == NOTIFICATION_APPLICATION_PAUSED:
		save_game()


func new_game() -> void:
	inventory.from_dict({})
	timers.from_dict({})
	city.new_city()
	inventory.add_all(Content.setting("starting_resources", {}))
	party = Content.setting("starting_party", []).duplicate()
	roster.new_roster(party, Content.setting("starting_items", []))
	_last_tick = timers.now()
	save_game()


## Applies production and finished timers for time that passed while the game
## was closed or paused, in order, so an upgrade that finished halfway through
## only boosts production from that moment.
func catch_up(from_time: float) -> void:
	var to_time := timers.now()
	var max_offline := float(Content.setting("max_offline_hours", 12)) * 3600.0
	var t := maxf(from_time, to_time - max_offline)
	while t < to_time:
		var next_end := minf(timers.next_end(), to_time)
		if next_end > t:
			city.tick(next_end - t)
			t = next_end
		_last_tick = t
		var real_clock := timers.clock
		timers.clock = func(): return t
		timers.update()
		timers.clock = real_clock
		if next_end >= to_time:
			break
	timers.update()
	_last_tick = to_time


func skip_cost(timer: Dictionary) -> int:
	return Economy.skip_cost(timers.remaining(timer), Content.setting("skip", {}))


## Finishes a timer now, paying gems if needed. Returns false if unaffordable.
func skip_timer(timer_id: String) -> bool:
	var timer := timers.get_timer(timer_id)
	if timer.is_empty():
		return false
	var cost := skip_cost(timer)
	if cost > 0 and not inventory.spend({"gems": cost}):
		EventBus.toast.emit("Not enough gems")
		return false
	timers.finish_now(timer_id)
	return true


func party_size() -> int:
	return int(Content.setting("base_party_size", 3)) + int(city.provided_total("party_size"))


func grant(loot: Dictionary) -> Dictionary:
	return inventory.add_all(loot)


## Stats and levels for the fighting party, for DungeonRun.setup().
func party_stats() -> Dictionary:
	var out := {}
	for id in party:
		if roster.has_hero(id):
			out[id] = roster.stats(id)
	return out


func party_levels() -> Dictionary:
	var out := {}
	for id in party:
		out[id] = roster.level(id)
	return out


## Pays out a finished dungeon run: resources, items, and XP for each hero who
## went. Returns {"resources", "items", "xp", "level_ups": {hero id: new level}}.
func grant_run(result: Dictionary, heroes_in_run: Array) -> Dictionary:
	var added := grant(result.get("loot", {}))
	var gained := {}
	for id in added:
		if int(added[id]) > 0:
			gained[id] = int(added[id])
	for item_id in result.get("items", []):
		roster.add_item(str(item_id))
	var level_ups := {}
	for id in heroes_in_run:
		if roster.add_xp(id, int(result.get("xp", 0))) > 0:
			level_ups[id] = roster.level(id)
	save_game()
	return {"resources": gained, "items": result.get("items", []), "xp": int(result.get("xp", 0)), "level_ups": level_ups}


# --- Saving ------------------------------------------------------------------

func save_game() -> void:
	_autosave_left = AUTOSAVE_SECONDS
	SaveService.write({
		"saved_at": _last_tick,
		"inventory": inventory.to_dict(),
		"timers": timers.to_dict(),
		"city": city.to_dict(),
		"party": party,
		"roster": roster.to_dict(),
	}, save_path)


func load_game() -> bool:
	var data := SaveService.read(save_path)
	if data.is_empty():
		return false
	timers.from_dict(data.get("timers", {}))
	city.from_dict(data.get("city", {}))
	inventory.from_dict(data.get("inventory", {}))
	party = data.get("party", Content.setting("starting_party", []))
	if data.has("roster"):
		roster.from_dict(data.roster)
	else:
		roster.new_roster(party, Content.setting("starting_items", []))
	party = party.filter(func(id): return roster.has_hero(id))
	catch_up(float(data.get("saved_at", timers.now())))
	return true


func reset_game() -> void:
	SaveService.delete(save_path)
	new_game()
	EventBus.resources_changed.emit()


func _on_timer_finished(timer: Dictionary) -> void:
	EventBus.timer_finished.emit(timer)
	if timer.kind == City.BUILD_TIMER:
		var b := city.get_building(timer.ref)
		if not b.is_empty():
			EventBus.toast.emit("%s reached level %d" % [city.definition(b.id).get("name", b.id), int(b.level)])
	save_game()
