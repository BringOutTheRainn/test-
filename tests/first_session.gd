extends SceneTree
## Plays the whole first session through the game's own API, following the
## quest chain from a new game to the last tutorial quest. Fails if any step
## can't be done with what the earlier steps give the player, so balance or
## data changes that break the tutorial are caught.
##   godot --headless --script res://tests/first_session.gd

const DungeonRun := preload("res://src/combat/dungeon_run.gd")

var game
var failures := 0


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	game = root.get_node("Game")
	game.save_path = "user://first_session_test_save.json"
	game.reset_game()
	var quests = game.quests
	var guard := 0
	while not quests.all_done() and guard < 40:
		guard += 1
		var q: Dictionary = quests.current()
		_do(q)
		_finish_builds()
		if not game.claim_quest():
			_fail("could not finish quest %s (%s)" % [q.id, str(quests.progress(q, game.quest_facts()))])
			break
		print("done: %s" % q.text)
	_check(quests.all_done(), "every tutorial quest can be finished")
	_check(game.roster.heroes.size() >= 3, "the party has three heroes")
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
				var cell := _free_cell()
				_check(not game.city.place(id, cell.x, cell.y).is_empty(), "place %s: %s" % [id, game.city.can_place(id, cell.x, cell.y)])
				_finish_builds()
				existing = game.city.buildings.values().filter(func(b): return b.id == id)
			while goal.type == "build" and not existing.is_empty() and int(existing[0].level) < lvl:
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
			for attempt in 3:
				if _play_dungeon(str(goal.dungeon)):
					return
			_fail("could not clear %s in 3 tries" % goal.dungeon)
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
