extends SceneTree
## Plays the first session and the early game through the game's own API,
## following the quest chain from a new game to the last quest. Fails if any
## step can't be done with what the earlier steps give the player, so balance
## or data changes that break progression are caught. When the player has to
## wait for resources, a fake clock moves forward an hour at a time (like
## coming back later), and the total wait is printed as a pacing check.
##   godot --headless --script res://tests/first_session.gd

const DungeonRun := preload("res://src/combat/dungeon_run.gd")

var game
var failures := 0
## Fake time added by waiting, in seconds.
var waited := 0.0
var _fake_now := 0.0


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	game = root.get_node("Game")
	game.save_path = "user://first_session_test_save.json"
	_fake_now = game.timers.now()
	game.timers.clock = func(): return _fake_now
	game.reset_game()
	var quests = game.quests
	var guard := 0
	while not quests.all_done() and guard < 60:
		guard += 1
		var q: Dictionary = quests.current()
		_do(q)
		_finish_builds()
		if not game.claim_quest():
			_fail("could not finish quest %s (%s)" % [q.id, str(quests.progress(q, game.quest_facts()))])
			break
		print("done: %s  (waited %.1f h so far)" % [q.text, waited / 3600.0])
	_check(quests.all_done(), "every quest can be finished")
	_check(game.roster.heroes.size() >= 3, "the party has three heroes")
	# Notifications planned for when the player leaves: a running build and
	# tomorrow's login reward.
	game.enable_notifications(true)
	game.claim_login_reward()
	var mill: Dictionary = game.city.buildings.values().filter(func(b): return b.id == "lumber_mill")[0]
	_wait_for(game.city.level_data("lumber_mill", int(mill.level) + 1).get("cost", {}))
	game.city.upgrade(mill.uid)
	var kinds: Array = game.planned_notifications().map(func(n): return n.kind)
	_check("build_done" in kinds and "daily_ready" in kinds, "notifications are planned for builds and the daily reward (%s)" % str(kinds))
	game.set_flag("notify_build_done", false)
	_check(not "build_done" in game.planned_notifications().map(func(n): return n.kind), "a switched-off kind is not planned")
	print("waited for resources: %.1f hours; hero levels: %s" % [waited / 3600.0, str(game.party_levels())])
	print("party: %s" % str(game.party.map(func(id): return "%s L%d %s" % [game.roster.hero_name(id), game.roster.level(id), game.roster.role(id).name])))
	game.SaveService.delete(game.save_path)
	print("first session: %s" % ("OK" if failures == 0 else "%d failed" % failures))
	quit(1 if failures > 0 else 0)


func _do(q: Dictionary) -> void:
	var goal: Dictionary = q.goal
	match str(goal.type):
		"build", "place":
			var id := str(goal.building)
			var lvl := int(goal.get("level", 1))
			var existing: Array = game.city.buildings.values().filter(func(b): return b.id == id)
			if existing.is_empty():
				_wait_for(game.city.level_data(id, 1).get("cost", {}))
				var cell := _free_cell()
				_check(not game.city.place(id, cell.x, cell.y).is_empty(), "place %s: %s" % [id, game.city.can_place(id, cell.x, cell.y)])
				_finish_builds()
				existing = game.city.buildings.values().filter(func(b): return b.id == id)
			while goal.type == "build" and not existing.is_empty() and int(existing[0].level) < lvl:
				_wait_for(game.city.level_data(id, int(existing[0].level) + 1).get("cost", {}))
				var reason: String = game.city.can_upgrade(existing[0].uid)
				if not game.city.upgrade(existing[0].uid):
					_fail("upgrade %s: %s" % [id, reason])
					return
				_finish_builds()
		"heroes":
			while game.roster.heroes.size() < int(goal.count) and game.can_recruit() == "":
				game.recruit()
		"clear_dungeon":
			# Like a player: gear up and try; after a loss, replay the dungeons
			# already beaten for XP and loot, and come back an hour later.
			for attempt in 8:
				_build_party()
				if _play_dungeon(str(goal.dungeon)):
					print("  cleared %s on try %d" % [goal.dungeon, attempt + 1])
					return
				for d in game.cleared:
					_play_dungeon(str(d))
				_pass_time(3600.0)
			_fail("could not clear %s in 8 tries" % goal.dungeon)
		"count":
			if str(goal.counter) == "items_crafted":
				for r in game.crafting.recipes():
					_wait_for(r.get("cost", {}), 6)
					if game.crafting.start(r.id):
						_finish_builds()
						break
		"flag":
			game.set_flag(str(goal.flag), true)


## Auto-battles a dungeon with the current party. Returns true on a win.
func _play_dungeon(id: String) -> bool:
	var run = DungeonRun.new()
	run.setup(root.get_node("Content"), id, game.party_entries())
	while not run.finished:
		var battle = run.start_battle()
		var turns := 0
		while battle.outcome == "" and turns < 500:
			var action: Dictionary = battle.choose_action(battle.current)
			battle.act(action.skill, action.target)
			turns += 1
		run.finish_battle()
	game.grant_run(run.result(), run.party)
	return run.won


## Moves the fake clock forward an hour at a time until the cost is affordable
## (up to max_hours), the way a player comes back later.
func _wait_for(cost: Dictionary, max_hours: int = 48) -> void:
	var hours := 0
	while not game.inventory.can_afford(cost) and hours < max_hours:
		_pass_time(3600.0)
		hours += 1


func _pass_time(seconds: float) -> void:
	var before := _fake_now
	_fake_now += seconds
	waited += seconds
	game.catch_up(before)


## What a player might build: the first hero a Guardian with a sword up
## front, the second a Ranger with a bow, the third a Priest with a staff.
const PLANS := [
	{"path": "guardian", "weapons": ["sword", "mace"], "row": "front", "stats": ["hp", "def"]},
	{"path": "ranger", "weapons": ["bow"], "row": "back", "stats": ["atk", "spd"]},
	{"path": "priest", "weapons": ["staff", "mace"], "row": "back", "stats": ["atk", "hp"]},
]


## Gears up each party hero for their plan and spends their points.
func _build_party() -> void:
	var ids: Array = game.party.slice(0, game.party_size())
	for i in ids.size():
		var id: String = ids[i]
		var plan: Dictionary = PLANS[i % PLANS.size()]
		game.roster.set_row(id, plan.row)
		for slot in game.roster.slots():
			var best := ""
			var best_score := _score(str(game.roster.hero(id).gear.get(slot.id, "")), plan)
			for item in game.roster.free_items(str(slot.id)):
				var score := _score(str(item.uid), plan)
				if score > best_score:
					best = str(item.uid)
					best_score = score
			if best != "":
				game.roster.equip(id, best)
		var n := 0
		while game.roster.stat_points_left(id) > 0:
			game.roster.add_stat_point(id, plan.stats[n % plan.stats.size()])
			n += 1
		var learned := true
		while learned and game.roster.skill_points_left(id) > 0:
			learned = false
			for node in Content().entry("paths", plan.path).nodes:
				if game.roster.learn(id, str(node.skill)):
					learned = true
					break


func Content():
	return root.get_node("Content")


func _score(uid: String, plan: Dictionary) -> float:
	if uid == "":
		return -1.0
	var def: Dictionary = game.roster.item_def(uid)
	if def.has("weapon_type") and not def.weapon_type in plan.weapons:
		return -2.0
	var stats: Dictionary = def.get("stats", {})
	return float(stats.get("atk", 0)) * 2.0 + float(stats.get("def", 0)) * 2.0 + float(stats.get("hp", 0)) * 0.2 + float(stats.get("spd", 0))


## Finishes every running build the way a player would: free skips, or gems.
func _finish_builds() -> void:
	for t in game.timers.timers.values().duplicate():
		game.skip_timer(t.id)


func _free_cell() -> Vector2i:
	for y in game.city.height:
		for x in game.city.width:
			if game.city.building_at(x, y).is_empty():
				return Vector2i(x, y)
	return Vector2i(-1, -1)


func _check(ok: bool, label: String) -> void:
	if not ok:
		_fail(label)


func _fail(label: String) -> void:
	failures += 1
	printerr("FAIL: " + label)
