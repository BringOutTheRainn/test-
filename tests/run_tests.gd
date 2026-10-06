extends SceneTree
## Headless logic tests. Run from the project folder:
##   godot --headless --script res://tests/run_tests.gd
## Exits with code 1 if any check fails.

const ContentDB := preload("res://src/core/content_db.gd")
const Inventory := preload("res://src/systems/inventory.gd")
const TimerService := preload("res://src/systems/timer_service.gd")
const City := preload("res://src/systems/city.gd")
const Economy := preload("res://src/systems/economy.gd")
const SaveService := preload("res://src/core/save_service.gd")
const Battle := preload("res://src/combat/battle.gd")
const DungeonRun := preload("res://src/combat/dungeon_run.gd")
const Heroes := preload("res://src/systems/heroes.gd")

var failures = 0
var checks = 0
var content
var clock = {"t": 1000000.0}


func _initialize() -> void:
	content = ContentDB.new()
	content.reload([ContentDB.BASE_ROOT])
	for test in [
		"test_content_loads",
		"test_content_references",
		"test_sprite_paths",
		"test_inventory_caps",
		"test_place_and_build",
		"test_builders_limit",
		"test_upgrade_and_town_hall_gate",
		"test_production_and_caps",
		"test_skip_cost",
		"test_save_roundtrip",
		"test_hero_levels_and_gear",
		"test_battle_rules",
		"test_battle_auto_resolves",
		"test_dungeon_run",
	]:
		call(test)
	content.free()
	print("\n%d checks, %d failed" % [checks, failures])
	quit(1 if failures > 0 else 0)


func check(condition: bool, label: String) -> void:
	checks += 1
	if not condition:
		failures += 1
		printerr("FAIL: " + label)


func make_city() -> City:
	var inv = Inventory.new()
	var timers = TimerService.new()
	timers.clock = func(): return clock.t
	var city = City.new()
	city.setup(content, inv, timers)
	city.new_city()
	inv.add_all(content.setting("starting_resources", {}))
	return city


func advance(city: City, seconds: float) -> void:
	city.tick(seconds)
	clock.t += seconds
	city.timers.update()


# --- Content ------------------------------------------------------------------

func test_content_loads() -> void:
	for type in ContentDB.TYPES:
		check(not content.list(type).is_empty(), "content type %s has entries" % type)
	check(content.has_entry("buildings", "town_hall"), "town hall exists")
	check(content.list("resources")[0].id == "gold", "resources sorted by order")


## Every id a data file mentions must exist, so a typo in data fails here.
func test_content_references() -> void:
	var resources = content.list("resources").map(func(r): return r.id)
	for b in content.list("buildings"):
		for level in b.levels:
			for res in level.get("cost", {}):
				check(res in resources, "%s cost uses known resource %s" % [b.id, res])
			for key in ["production", "storage"]:
				for res in level.get("provides", {}).get(key, {}):
					check(res in resources, "%s %s uses known resource %s" % [b.id, key, res])
	for type in ["heroes", "enemies"]:
		for u in content.list(type):
			for s in u.skills:
				check(content.has_entry("skills", s), "%s %s has skill %s" % [type, u.id, s])
	for d in content.list("dungeons"):
		for room in d.rooms:
			for e in room.enemies:
				check(content.has_entry("enemies", e.id), "dungeon %s enemy %s exists" % [d.id, e.id])
			for res in room.get("loot", {}):
				check(res in resources, "dungeon %s loot %s is a resource" % [d.id, res])
	for id in content.setting("starting_party", []):
		check(content.has_entry("heroes", id), "starting hero %s exists" % id)
	var stats = content.list("stats").map(func(s): return s.id)
	var slots = content.setting("equipment_slots", []).map(func(s): return s.id)
	for item in content.list("items"):
		check(item.get("slot", "") in slots, "item %s uses a known slot" % item.id)
		check(content.setting("rarities", {}).has(item.get("rarity", "")), "item %s has a known rarity" % item.id)
		for stat in item.get("stats", {}):
			check(stat in stats, "item %s changes known stat %s" % [item.id, stat])
	for type in ["heroes", "enemies"]:
		for u in content.list(type):
			for stat in u.get("stats", {}):
				check(stat in stats, "%s %s has known stat %s" % [type, u.id, stat])
	for id in content.setting("starting_items", []):
		check(content.has_entry("items", id), "starting item %s exists" % id)
	for d in content.list("dungeons"):
		for room in d.rooms:
			for id in room.get("items", []):
				check(content.has_entry("items", id), "dungeon %s drops known item %s" % [d.id, id])


## A "sprite" named in data must point at a real file.
func test_sprite_paths() -> void:
	for type in ContentDB.TYPES:
		for e in content.list(type):
			if e.has("sprite"):
				check(FileAccess.file_exists(str(e.sprite)), "%s %s sprite %s exists" % [type, e.id, e.sprite])


# --- City ---------------------------------------------------------------------

func test_inventory_caps() -> void:
	var inv = Inventory.new()
	inv.set_caps({"wood": 100.0})
	check(is_equal_approx(inv.add("wood", 150), 100.0), "add clamps to cap")
	check(inv.whole("wood") == 100, "wood capped at 100")
	check(not inv.spend({"wood": 101}), "cannot overspend")
	check(inv.spend({"wood": 40}) and inv.whole("wood") == 60, "spend subtracts")
	check(inv.missing({"wood": 100, "stone": 5}) == {"wood": 40, "stone": 5}, "missing lists the gap")
	inv.add("gems", 99999)
	check(inv.whole("gems") == 99999, "uncapped resource")


func test_place_and_build() -> void:
	var city = make_city()
	check(city.town_hall_level() == 1, "starts with Town Hall 1")
	var wood_before = city.inventory.whole("wood")
	var b = city.place("lumber_mill", 0, 0)
	check(not b.is_empty(), "can place a lumber mill")
	check(city.inventory.whole("wood") == wood_before - 50, "placing spends the level 1 cost")
	check(int(b.level) == 0 and city.is_busy(b.uid), "new building is under construction")
	check(city.can_place("quarry", 0, 0) == "Tile is taken", "cannot stack buildings")
	check(city.can_place("warehouse", 1, 0).begins_with("Needs Town Hall"), "warehouse gated by Town Hall")
	advance(city, 9)
	check(int(b.level) == 0, "not done before the timer")
	advance(city, 2)
	check(int(b.level) == 1 and not city.is_busy(b.uid), "finishes when the timer ends")


func test_builders_limit() -> void:
	var city = make_city()
	city.place("lumber_mill", 0, 0)
	city.place("quarry", 1, 0)
	check(city.builders_free() == 0, "two builders are both busy")
	check(city.can_place("farm", 2, 0) == "All builders are busy", "third build blocked")
	advance(city, 11)
	check(city.builders_free() == 2, "builders free again")


func test_upgrade_and_town_hall_gate() -> void:
	var city = make_city()
	city.inventory.add_all({"wood": 1000, "stone": 1000})
	var mill = city.place("lumber_mill", 0, 0)
	advance(city, 11)
	check(city.can_upgrade(mill.uid) == "Needs Town Hall 2", "level 2 needs Town Hall 2")
	var th = city.building_at(3, 4)
	check(city.upgrade(th.uid), "can upgrade the Town Hall")
	advance(city, 61)
	check(city.town_hall_level() == 2, "Town Hall reached level 2")
	check(city.upgrade(mill.uid), "now the mill can upgrade")
	check(int(mill.level) == 1, "level stays until the timer ends")
	advance(city, 61)
	check(int(mill.level) == 2, "mill reached level 2")
	check(city.max_count("lumber_mill") == 3, "Town Hall 2 allows a third mill")


func test_production_and_caps() -> void:
	var city = make_city()
	city.place("lumber_mill", 0, 0)
	advance(city, 10)
	var before = city.inventory.amount("wood")
	city.tick(3600)
	check(is_equal_approx(city.inventory.amount("wood") - before, 360.0), "level 1 mill makes 360 wood an hour")
	city.tick(3600 * 100)
	check(city.inventory.whole("wood") == 1000, "production stops at the storage cap")
	check(is_equal_approx(city.inventory.cap("food"), 500.0), "base food cap from data")


func test_skip_cost() -> void:
	var cfg: Dictionary = content.setting("skip", {})
	check(Economy.skip_cost(299, cfg) == 0, "last 5 minutes are free")
	check(Economy.skip_cost(600, cfg) == 10, "10 minutes costs 10 gems")
	check(Economy.skip_cost(3600, cfg) == 60, "1 hour costs 60 gems")
	check(Economy.skip_cost(86400, cfg) == 500, "24 hours costs 500 gems")


func test_save_roundtrip() -> void:
	var city = make_city()
	city.place("farm", 2, 2)
	var path = "user://test_save.json"
	SaveService.write({"city": city.to_dict(), "inventory": city.inventory.to_dict(), "timers": city.timers.to_dict()}, path)
	var data = SaveService.read(path)
	check(int(data.version) == SaveService.CURRENT_VERSION, "save carries its version")
	var copy = make_city()
	copy.timers.from_dict(data.timers)
	copy.from_dict(data.city)
	copy.inventory.from_dict(data.inventory)
	check(copy.building_at(2, 2).get("id", "") == "farm", "buildings survive a save")
	check(copy.is_busy(copy.building_at(2, 2).uid), "timers survive a save")
	check(copy.inventory.whole("wood") == city.inventory.whole("wood"), "inventory survives a save")
	check(int(SaveService.migrate({"city": {}}).version) == SaveService.CURRENT_VERSION, "old saves migrate")
	SaveService.delete(path)


# --- Heroes -------------------------------------------------------------------

func test_hero_levels_and_gear() -> void:
	var roster = Heroes.new()
	roster.setup(content)
	roster.new_roster(["knight", "ranger"], ["rusty_sword", "rusty_sword", "padded_vest"])
	var base: Dictionary = content.entry("heroes", "knight").stats
	check(roster.stats("knight").atk == int(base.atk), "level 1 hero has its data stats")
	var need: int = roster.xp_to_next(1)
	check(roster.add_xp("knight", need + 5) == 1 and roster.level("knight") == 2, "enough XP levels up")
	check(int(roster.hero("knight").xp) == 5, "extra XP carries over")
	check(roster.stats("knight").hp > int(base.hp), "levels raise stats")
	check(roster.xp_to_next(2) > need, "each level needs more XP")
	var swords: Array = roster.free_items("weapon")
	check(swords.size() == 2, "both swords are spare")
	var atk_before: int = roster.stats("knight").atk
	check(roster.equip("knight", swords[0].uid), "can equip a weapon")
	check(roster.stats("knight").atk == atk_before + 4, "weapon adds its attack")
	check(roster.free_items("weapon").size() == 1, "worn item leaves the bag")
	roster.equip("ranger", swords[0].uid)
	check(roster.owner_of(swords[0].uid) == "ranger" and roster.hero("knight").gear.is_empty(), "equipping moves an item between heroes")
	check(not roster.equip("knight", roster.free_items("armor")[0].uid) or roster.hero("knight").gear.has("armor"), "armor goes in the armor slot")
	var copy = Heroes.new()
	copy.setup(content)
	copy.from_dict(JSON.parse_string(JSON.stringify(roster.to_dict())))
	check(copy.level("knight") == 2 and copy.stats("ranger") == roster.stats("ranger"), "roster survives a save")
	check(copy.add_item("lucky_charm").uid not in roster.items, "new items get fresh ids after loading")
	var run = DungeonRun.new()
	run.setup(content, "goblin_warren", ["knight"], {"knight": {"hp": 999, "atk": 1, "def": 0, "spd": 1}})
	var battle = run.start_battle(1)
	check(battle.units.filter(func(u): return u.team == "hero")[0].max_hp == 999, "battles use the roster's stats")
	for u in battle.alive("enemy"):
		u.hp = 0
	battle._check_outcome()
	run.finish_battle()
	check(run.xp > 0, "beating enemies earns XP")


# --- Combat -------------------------------------------------------------------

func test_battle_rules() -> void:
	var battle = Battle.new()
	battle.setup(content, [{"id": "knight"}, {"id": "ranger"}, {"id": "cleric"}],
		[{"id": "goblin", "row": "front"}, {"id": "goblin_archer", "row": "back"}], 7)
	check(battle.current.name == "Ranger", "fastest unit acts first")
	var archer = battle.alive("enemy").filter(func(u): return u.row == "back")[0]
	var knight = battle.alive("hero").filter(func(u): return u.id == "knight")[0]
	check(not archer.uid in battle.valid_targets(knight, "strike"), "melee cannot reach the back row")
	check(archer.uid in battle.valid_targets(battle.current, "shoot"), "ranged reaches the back row")
	check(not battle.is_usable(battle.current, "volley"), "skills need energy")
	var events: Array = []
	battle.event.connect(func(e): events.append(e))
	check(battle.act("shoot", archer.uid), "player can act")
	check(not events.is_empty() and events[0].type == "action" and events[0].targets == [archer.uid], "acting reports an action event")
	check(events.any(func(e): return e.type == "damage" and e.target == archer.uid and int(e.amount) > 0), "damage is reported for animation")
	knight.statuses["taunt"] = {"turns": 2}
	var goblin = battle.alive("enemy").filter(func(u): return u.row == "front")[0]
	check(battle.valid_targets(goblin, "stab") == [knight.uid], "taunt forces enemies onto the Knight")


func test_battle_auto_resolves() -> void:
	var wins = 0
	for seed_value in range(20):
		var battle = Battle.new()
		battle.setup(content, [{"id": "knight"}, {"id": "ranger"}, {"id": "cleric"}],
			content.entry("dungeons", "goblin_warren").rooms[0].enemies, seed_value)
		var turns = 0
		while battle.outcome == "" and turns < 500:
			var action = battle.choose_action(battle.current)
			check(battle.act(action.skill, action.target), "AI picks a legal action")
			turns += 1
		check(battle.outcome != "", "battle ends")
		if battle.outcome == "won":
			wins += 1
	check(wins >= 15, "auto party usually wins the first room (%d/20)" % wins)


func test_dungeon_run() -> void:
	var run = DungeonRun.new()
	run.setup(content, "goblin_warren", ["knight", "ranger", "cleric"])
	var battle = run.start_battle(3)
	for u in battle.alive("enemy"):
		u.hp = 0
	battle._check_outcome()
	run.finish_battle()
	check(run.room_index == 1 and not run.finished, "winning a room moves to the next")
	check(int(run.loot.get("wood", 0)) == 120, "room loot is collected")
	battle = run.start_battle(4)
	for u in battle.alive("hero"):
		u.hp = 0
	battle._check_outcome()
	run.finish_battle()
	check(run.finished and not run.won, "losing ends the run")
	check(int(run.loot.get("wood", 0)) == 60, "losing keeps half the loot")
