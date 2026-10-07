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
	print("waited for resources: %.1f hours; hero levels: %s" % [waited / 3600.0, str(game.party_levels())])
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
			for h in game.recruitable():
				if game.roster.heroes.size() >= int(goal.count):
					break
				if game.can_recruit(h.id) == "":
					game.recruit(h.id)
		"clear_dungeon":
			# Like a player: gear up and try; after a loss, replay the dungeons
			# already beaten for XP and loot, and come back an hour later.
			for attempt in 8:
				_equip_best()
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
	run.setup(root.get_node("Content"), id, game.party.slice(0, game.party_size()), game.party_stats(), game.party_levels())
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


## Puts each hero's best free item in each slot (by a simple stat score).
func _equip_best() -> void:
	for id in game.party:
		for slot in game.roster.slots():
			var best := ""
			var best_score := _score(str(game.roster.hero(id).gear.get(slot.id, "")))
			for item in game.roster.free_items(str(slot.id)):
				var score := _score(str(item.uid))
				if score > best_score:
					best = str(item.uid)
					best_score = score
			if best != "":
				game.roster.equip(id, best)


func _score(uid: String) -> float:
	if uid == "":
		return -1.0
	var stats: Dictionary = game.roster.item_def(uid).get("stats", {})
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
