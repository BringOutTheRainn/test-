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
const Quests := preload("res://src/systems/quests.gd")
const Crafting := preload("res://src/systems/crafting.gd")
const Daily := preload("res://src/systems/daily.gd")
const Shop := preload("res://src/systems/shop.gd")

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
		"test_hero_build",
		"test_blueprints",
		"test_quests",
		"test_crafting",
		"test_daily",
		"test_shop",
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
			for s in u.get("skills", []):
				check(content.has_entry("skills", s), "%s %s has skill %s" % [type, u.id, s])
	for d in content.list("dungeons"):
		for room in d.rooms:
			for e in room.enemies:
				check(content.has_entry("enemies", e.id), "dungeon %s enemy %s exists" % [d.id, e.id])
			for res in room.get("loot", {}):
				check(res in resources, "dungeon %s loot %s is a resource" % [d.id, res])
	check(not content.list("heroes").is_empty(), "there is a hero base to recruit")
	for p in content.list("paths"):
		for node in p.get("nodes", []):
			check(content.has_entry("skills", str(node.skill)), "path %s has skill %s" % [p.id, node.skill])
			check(int(node.get("tier", 1)) >= 1, "path %s node %s has a tier" % [p.id, node.skill])
	var weapon_types: Array = []
	for item in content.list("items"):
		if item.has("attack"):
			check(content.has_entry("skills", str(item.attack)), "item %s attack %s exists" % [item.id, item.attack])
		if item.has("weapon_type"):
			weapon_types.append(str(item.weapon_type))
	for sk in content.list("skills"):
		for t in sk.get("weapons", []):
			check(t in weapon_types, "skill %s needs weapon type %s that some item has" % [sk.id, t])
		for stat in sk.get("stats", {}):
			check(content.has_entry("stats", stat), "passive %s changes known stat %s" % [sk.id, stat])
	check(content.has_entry("skills", str(content.setting("hero_build", {}).get("unarmed_attack", "punch"))), "the unarmed attack exists")
	for id in content.setting("starting_equipped", []):
		check(id in content.setting("starting_items", []), "starting gear %s is in the starting items" % id)
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
			for id in room.get("items", []) + room.get("first_clear_items", []):
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
	roster.new_roster(["Aldo", "Mira"], ["rusty_sword", "rusty_sword", "padded_vest", "oak_bow"])
	var a: String = roster.heroes.keys()[0]
	var b: String = roster.heroes.keys()[1]
	check(roster.hero_name(a) == "Aldo" and a != b, "heroes get their own ids and names")
	var base: Dictionary = roster.base_def(a).stats
	check(roster.stats(a) == roster.stats(b), "every recruit starts the same")
	check(roster.stats(a).atk == int(base.atk), "level 1 hero has the base stats")
	check(roster.role(a).role == "", "a new hero has no role yet")
	var need: int = roster.xp_to_next(1)
	check(roster.add_xp(a, need + 5) == 1 and roster.level(a) == 2, "enough XP levels up")
	check(int(roster.hero(a).xp) == 5, "extra XP carries over")
	check(roster.stats(a).hp > int(base.hp), "levels raise stats")
	check(roster.xp_to_next(2) > need, "each level needs more XP")
	var swords: Array = roster.free_items("weapon").filter(func(i): return i.id == "rusty_sword")
	check(swords.size() == 2, "both swords are spare")
	var atk_before: int = roster.stats(a).atk
	check(roster.basic_attack(a) == "punch", "no weapon means punching")
	check(roster.equip(a, swords[0].uid), "can equip a weapon")
	check(roster.stats(a).atk == atk_before + 4, "weapon adds its attack")
	check(roster.basic_attack(a) == "strike" and roster.weapon_type(a) == "sword", "the weapon gives the basic attack")
	check(roster.look(a).size() == 2, "worn gear is drawn on the hero")
	check(roster.free_items("weapon").size() == 2, "worn item leaves the bag")
	roster.equip(b, swords[0].uid)
	check(roster.owner_of(swords[0].uid) == b and roster.hero(a).gear.is_empty(), "equipping moves an item between heroes")
	check(roster.equip(a, roster.free_items("armor")[0].uid) and roster.hero(a).gear.has("armor"), "armor goes in the armor slot")
	var copy = Heroes.new()
	copy.setup(content)
	copy.from_dict(JSON.parse_string(JSON.stringify(roster.to_dict())))
	check(copy.level(a) == 2 and copy.stats(b) == roster.stats(b), "roster survives a save")
	check(copy.add_item("lucky_charm").uid not in roster.items, "new items get fresh ids after loading")
	check(copy.recruit().id not in roster.heroes, "new heroes get fresh ids after loading")
	var run = DungeonRun.new()
	var entry: Dictionary = roster.battle_entry(a)
	entry.stats = {"hp": 999, "atk": 1, "def": 0, "spd": 1}
	run.setup(content, "goblin_warren", [entry])
	var battle = run.start_battle(1)
	var unit: Dictionary = battle.units.filter(func(u): return u.team == "hero")[0]
	check(unit.max_hp == 999 and unit.name == "Aldo", "battles use the roster's stats and names")
	check(unit.look == roster.look(a) and unit.look.size() == 2, "battles show the hero's gear")
	for u in battle.alive("enemy"):
		u.hp = 0
	battle._check_outcome()
	run.finish_battle()
	check(run.xp > 0, "beating enemies earns XP")


func test_hero_build() -> void:
	var roster = Heroes.new()
	roster.setup(content)
	roster.new_roster(["Aldo"], ["oak_bow", "wooden_staff"])
	var h: String = roster.heroes.keys()[0]
	var cfg: Dictionary = content.setting("hero_build", {})
	check(roster.skill_points_left(h) == int(cfg.start_skill_points), "a recruit starts with skill points")
	check(roster.stat_points_left(h) == int(cfg.start_stat_points), "a recruit starts with stat points")
	var hp: int = roster.stats(h).hp
	check(roster.add_stat_point(h, "hp") and roster.stats(h).hp == hp + int(roster.per_point("hp")), "a stat point raises the stat")
	while roster.stat_points_left(h) > 0:
		roster.add_stat_point(h, "atk")
	check(not roster.add_stat_point(h, "atk"), "can't spend points you don't have")
	check(roster.can_learn(h, "volley").begins_with("Needs"), "later tiers need points in the path first")
	check(roster.learn(h, "aimed_shot"), "a hero learns a first-tier skill")
	check(roster.role(h).name == "Ranger", "points in a path give the hero that role")
	check(not "aimed_shot" in roster.battle_skills(h), "bow skills need a bow")
	roster.equip(h, roster.free_items("weapon").filter(func(i): return i.id == "oak_bow")[0].uid)
	check("aimed_shot" in roster.battle_skills(h) and roster.battle_skills(h)[0] == "shoot", "with a bow the hero shoots and can use bow skills")
	check(roster.can_learn(h, "quick_feet") == "No skill points left", "learning costs skill points")
	roster.add_xp(h, 100000)
	for i in 3:
		roster.learn(h, "quick_feet")
	check(roster.skill_rank(h, "quick_feet") == 3 and not roster.learn(h, "quick_feet"), "passives have a top rank")
	check(roster.passive_stats(h).spd == 3, "passive skills add stats")
	check(roster.learn(h, "volley"), "enough points in a path opens the next tier")
	roster.learn(h, "mend")
	roster.equip(h, roster.free_items("weapon")[0].uid)
	check("mend" in roster.battle_skills(h) and not "aimed_shot" in roster.battle_skills(h), "changing weapon changes which skills work")
	var copy = Heroes.new()
	copy.setup(content)
	copy.from_dict(JSON.parse_string(JSON.stringify(roster.to_dict())))
	check(copy.stats(h) == roster.stats(h) and copy.battle_skills(h) == roster.battle_skills(h), "builds survive a save")
	roster.reset_points(h)
	check(roster.skill_points_left(h) == roster.skill_points_total(h) and roster.stat_points_left(h) == roster.stat_points_total(h), "a reset gives every point back")
	# A save from before blank heroes: class ids become blank heroes.
	var old = Heroes.new()
	old.setup(content)
	old.from_dict({"heroes": {"knight": {"id": "knight", "level": 4, "xp": 7, "gear": {"weapon": "i1"}}, "ranger": {"id": "ranger", "level": 2, "xp": 0, "gear": {}}},
		"items": {"i1": {"uid": "i1", "id": "rusty_sword"}}, "next_item": 2})
	var k: String = old.renamed.get("knight", "")
	check(old.heroes.size() == 2 and k != "" and old.level(k) == 4 and old.weapon_type(k) == "sword", "old class heroes keep their level and gear")
	check(old.skill_points_left(k) == old.skill_points_total(k), "old heroes get all their points to spend")
	check(old.row(old.renamed.ranger) == "back", "old rangers stay in the back row")


func classic_party() -> Array:
	var roster = Heroes.new()
	roster.setup(content)
	roster.new_roster(["Tank", "Ranger", "Priest"], ["rusty_sword", "oak_bow", "wooden_staff", "padded_vest"])
	var ids: Array = roster.heroes.keys()
	var gear := ["rusty_sword", "oak_bow", "wooden_staff"]
	var skills := ["taunt", "aimed_shot", "mend"]
	var points := ["hp", "spd", "atk"]
	for i in 3:
		roster.equip(ids[i], roster.free_items("weapon").filter(func(it): return it.id == gear[i])[0].uid)
		roster.learn(ids[i], skills[i])
		while roster.stat_points_left(ids[i]) > 0:
			roster.add_stat_point(ids[i], points[i])
	roster.equip(ids[0], roster.free_items("armor")[0].uid)
	roster.set_row(ids[1], "back")
	roster.set_row(ids[2], "back")
	return ids.map(func(id):
		var e: Dictionary = roster.battle_entry(id)
		e.id = str(e.name).to_lower()
		return e)


func test_blueprints() -> void:
	var city = make_city()
	city.inventory.add_all({"wood": 5000, "stone": 5000, "gold": 5000})
	var th: Dictionary = city.building_at(3, 4)
	th.level = 2
	check(city.can_place("warehouse", 0, 0).begins_with("Needs a blueprint"), "warehouse needs its blueprint")
	check(city.can_place("farm", 0, 0) == "", "normal buildings need no blueprint")
	check(city.unlock_blueprint("warehouse"), "a blueprint unlocks a building")
	check(city.can_place("warehouse", 0, 0) == "", "unlocked building can be placed")
	var copy = make_city()
	copy.from_dict(city.to_dict())
	check(copy.has_blueprint("warehouse"), "blueprints survive a save")
	var run = DungeonRun.new()
	run.setup(content, "old_cellar", ["knight"])
	for i in run.rooms().size():
		var battle = run.start_battle(i)
		for u in battle.alive("enemy"):
			u.hp = 0
		battle._check_outcome()
		run.finish_battle()
	check(run.won and "warehouse" in run.result().blueprints, "the tutorial boss drops the Warehouse blueprint")


func test_quests() -> void:
	var q = Quests.new()
	q.setup(content)
	var facts := {"building_levels": {}, "building_counts": {}, "heroes": 1, "cleared": [], "flags": {}}
	check(q.current().id == "build_lumber_mill", "the first quest is the Lumber Mill")
	check(q.claim(facts).is_empty() and q.index == 0, "an unfinished quest can't be claimed")
	facts.building_levels["lumber_mill"] = [1]
	check(not q.claim(facts).is_empty() and q.current().id == "build_quarry", "a finished quest pays and moves on")
	check(q.progress({"goal": {"type": "build", "building": "town_hall", "level": 2}}, {"building_levels": {"town_hall": [1]}}) == [0, 1], "level goals count only high enough buildings")
	check(q.is_complete({"goal": {"type": "flag", "flag": "x"}}, {"flags": {"x": true}}), "flag goals")
	var copy = Quests.new()
	copy.setup(content)
	copy.from_dict(q.to_dict())
	check(copy.index == 1, "quest progress survives a save")
	for quest in content.list("quests"):
		var goal: Dictionary = quest.goal
		if goal.has("building"):
			check(content.has_entry("buildings", goal.building), "quest %s names a known building" % quest.id)
		if goal.has("dungeon"):
			check(content.has_entry("dungeons", goal.dungeon), "quest %s names a known dungeon" % quest.id)
		for res in quest.get("reward", {}):
			check(content.has_entry("resources", res), "quest %s rewards a known resource" % quest.id)


func test_crafting() -> void:
	var city = make_city()
	var crafting = Crafting.new()
	crafting.setup(content, city.inventory, city.timers, city)
	var made: Array = []
	crafting.crafted.connect(func(id): made.append(id))
	city.inventory.add_all({"wood": 5000, "stone": 5000, "gold": 5000, "food": 1000})
	check(crafting.can_craft("longbow") == "Build a Blacksmith first", "crafting needs a Blacksmith")
	var smith: Dictionary = city._add_building("blacksmith", 0, 0)
	smith.level = 1
	check(crafting.level() == 1, "the Blacksmith sets the crafting level")
	check(crafting.can_craft("iron_plate").begins_with("Needs Blacksmith level"), "recipes are gated by Blacksmith level")
	check(crafting.can_craft("iron_sword") == "Not enough resources", "iron recipes need iron")
	check(crafting.start("longbow"), "a known recipe starts")
	check(crafting.can_craft("leather_armor") == "The Blacksmith is busy", "one craft at a time")
	check(city.builders_free() == city.builders_total(), "crafting does not use a builder")
	advance(city, float(content.entry("recipes", "longbow").seconds))
	check(made == ["longbow"], "the item arrives when the timer ends")
	for r in content.list("recipes"):
		check(content.has_entry("items", str(r.item)), "recipe %s makes a known item" % r.id)
		for res in r.get("cost", {}):
			check(content.has_entry("resources", res), "recipe %s costs a known resource" % r.id)


func test_daily() -> void:
	var now := {"t": 86400.0 * 100 + 3600.0}
	var daily = Daily.new()
	daily.setup(content, func(): return now.t)
	daily.utc_offset = 0
	var rewards: Array = daily.login_rewards()
	check(rewards.size() == 7, "a 7-day login track")
	check(daily.can_claim_login(), "the first login reward is ready")
	check(daily.claim_login() == rewards[0], "day 1 pays the first reward")
	check(not daily.can_claim_login() and daily.claim_login().is_empty(), "one login reward a day")
	now.t += 86400.0 * 3
	check(daily.claim_login() == rewards[1], "a missed day doesn't reset the track")
	var counters := {"fights_won": 10, "builds_finished": 4, "dungeons_cleared": 1, "logins": 2}
	daily.refresh(counters, 1)
	var quests: Array = daily.quests()
	check(quests.size() == 3, "three daily quests")
	var used := {}
	for q in quests:
		check(int(q.get("unlock_town_hall", 1)) <= 1, "daily quests respect the Town Hall level")
		check(not used.has(q.counter), "no two daily quests count the same thing")
		used[q.counter] = true
		check(daily.progress(q, counters)[0] == 0, "progress counts from the start of the day")
	var first: Dictionary = quests[0]
	check(daily.claim(first.id, counters).is_empty(), "an unfinished daily quest can't be claimed")
	var done := counters.duplicate()
	for q in quests:
		done[q.counter] = int(done[q.counter]) + int(q.count)
	for q in quests:
		check(not daily.claim(q.id, done).is_empty(), "a finished daily quest pays")
	check(daily.can_claim_bonus() and not daily.claim_bonus().is_empty(), "finishing all three pays the bonus")
	var ids: Array = daily.quest_ids.duplicate()
	var copy = Daily.new()
	copy.setup(content, func(): return now.t)
	copy.utc_offset = 0
	copy.from_dict(daily.to_dict())
	copy.refresh(done, 1)
	check(copy.quest_ids == ids and copy.bonus_claimed, "daily state survives a save on the same day")
	now.t += 86400.0
	copy.refresh(done, 1)
	check(copy.quest_claimed.is_empty() and not copy.bonus_claimed, "a new day brings new quests")
	for q in content.list("daily_quests"):
		for res in q.get("reward", {}):
			check(content.has_entry("resources", res), "daily quest %s rewards a known resource" % q.id)


func test_shop() -> void:
	var inv = Inventory.new()
	var shop = Shop.new()
	shop.setup(content, inv)
	inv.add_all({"gems": 600})
	check(shop.can_buy("builder_5") == "Not available yet", "the 5th builder needs the 4th first")
	check(not shop.is_visible(shop.offer("builder_5"), 5), "the 5th builder is hidden until the 4th is hired")
	check(not shop.pay("builder_4").is_empty() and inv.whole("gems") == 100, "a gem offer spends gems")
	check(shop.can_buy("builder_4") == "Already bought", "one-time offers can't be bought twice")
	check(shop.is_visible(shop.offer("builder_5"), 5), "the 5th builder shows once the 4th is hired")
	check(shop.can_buy("builder_5") == "Not enough gems", "gem offers need the gems")
	check(not shop.pay("gems_pouch").is_empty(), "real-money offers are paid by the store, not gems")
	shop.start_card(100, 30)
	check(shop.card_days_left(100) == 30 and shop.can_claim_card(100), "the monthly card starts today")
	check(not shop.claim_card(100).is_empty() and shop.claim_card(100).is_empty(), "the card pays once a day")
	check(shop.can_claim_card(129) and not shop.card_active(130), "the card lasts 30 days")
	inv.caps = {"wood": 1000}
	check(shop.missing_gems({"wood": 1100}) > 0, "missing resources have a gem price")
	check(shop.missing_gems({"wood": 0}) == 0, "nothing missing costs nothing")
	check(inv.add("wood", 5000, true) == 5000.0 and inv.whole("wood") == 5000, "bought resources can go over the cap")
	var copy = Shop.new()
	copy.setup(content, inv)
	copy.from_dict(shop.to_dict())
	check(copy.times_bought("builder_4") == 1 and copy.card_until == shop.card_until, "shop state survives a save")
	for o in content.list("shop"):
		check(o.has("price_usd") != o.has("cost"), "offer %s has exactly one price" % o.id)
		for res in o.get("grant", {}).keys() + o.get("cost", {}).keys():
			check(content.has_entry("resources", res), "offer %s uses a known resource" % o.id)
		for id in o.get("items", []):
			check(content.has_entry("items", id), "offer %s gives a known item" % o.id)


# --- Combat -------------------------------------------------------------------

func test_battle_rules() -> void:
	var battle = Battle.new()
	battle.setup(content, classic_party(),
		[{"id": "goblin", "row": "front"}, {"id": "goblin_archer", "row": "back"}], 7)
	check(battle.current.name == "Ranger", "fastest unit acts first")
	var archer = battle.alive("enemy").filter(func(u): return u.row == "back")[0]
	var knight = battle.alive("hero").filter(func(u): return u.id == "tank")[0]
	check(not archer.uid in battle.valid_targets(knight, "strike"), "melee cannot reach the back row")
	check(archer.uid in battle.valid_targets(battle.current, "shoot"), "ranged reaches the back row")
	check(not battle.is_usable(battle.current, "aimed_shot"), "skills need energy")
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
		battle.setup(content, classic_party(),
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
	run.setup(content, "goblin_warren", classic_party())
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
