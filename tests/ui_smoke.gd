extends SceneTree
## Drives the real UI for a few seconds: builds something, opens the dungeon
## and lets auto-battle play. Fails on script errors; with a display it also
## saves screenshots to the folder given after "--" (e.g. -- /tmp/shots).
##   godot --headless --script res://tests/ui_smoke.gd

var shots_dir := ""


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if not args.is_empty():
		shots_dir = args[0]
	_run.call_deferred()


func _run() -> void:
	var game := root.get_node_or_null("Game")
	if game == null:
		printerr("FAIL: autoloads missing")
		quit(1)
		return
	# Use a throwaway save so running this never touches a real one.
	game.save_path = "user://smoke_test_save.json"
	game.reset_game()
	# An hour away from the game should pay out an hour of Town Hall gold.
	var gold: float = game.inventory.amount("gold")
	game.catch_up(game.timers.now() - 3600.0)
	var earned: float = game.inventory.amount("gold") - gold
	if absf(earned - 60.0) > 0.5:
		printerr("FAIL: offline catch-up paid %.1f gold, expected 60" % earned)
		quit(1)
		return
	var main: Control = load("res://src/main.tscn").instantiate()
	root.add_child(main)
	await _frames(10)
	_shot("00_intro")
	# Start over past the intro, with the heroes the tutorial recruits.
	main.queue_free()
	game.flags["intro_seen"] = true
	for id in ["knight", "cleric"]:
		game.roster.recruit(id)
		game.party.append(id)
	main = load("res://src/main.tscn").instantiate()
	root.add_child(main)
	await _frames(10)
	_shot("01_city")

	var city_screen = main.find_children("*", "VBoxContainer", true, false).filter(func(n): return n.has_method("_on_tile_tapped"))[0]
	city_screen._on_tile_tapped(Vector2i(0, 0))
	await _frames(5)
	_shot("02_build_menu")
	city_screen._place("lumber_mill")
	await _frames(5)
	_shot("03_building")
	city_screen._on_tile_tapped(Vector2i(3, 4))
	await _frames(5)
	_shot("04_town_hall")

	# Early game: a Town Hall 3 town with a Blacksmith, crafting gear.
	game.city.buildings[game.city.building_at(3, 4).uid].level = 3
	var smith: Dictionary = game.city._add_building("blacksmith", 1, 0)
	smith.level = 1
	game.inventory.add_all({"wood": 900, "gold": 900, "food": 400, "iron": 100})
	city_screen._on_tile_tapped(Vector2i(1, 0))
	await _frames(5)
	_shot("04c_blacksmith")
	game.crafting.start("longbow")
	await _frames(5)
	city_screen._rebuild_panel()
	await _frames(5)
	_shot("04d_crafting")

	root.get_node("EventBus").screen_requested.emit("heroes", {"hero": "knight"})
	await _frames(5)
	var heroes_screen = main.find_children("*", "VBoxContainer", true, false).filter(func(n): return n.has_method("_show_sheet"))[0]
	heroes_screen._picking = "weapon"
	heroes_screen._rebuild()
	await _frames(5)
	_shot("04b_heroes")

	root.get_node("EventBus").screen_requested.emit("daily", {})
	await _frames(5)
	_shot("04e_daily")
	game.claim_login_reward()
	game.count("fights_won", 3)
	await _frames(5)
	_shot("04f_daily_claimed")
	root.get_node("EventBus").screen_requested.emit("shop", {})
	await _frames(5)
	_shot("04h_shop")
	game.buy_offer("monthly_card")
	game.buy_offer("builder_4")
	await _frames(5)
	_shot("04i_shop_bought")
	game.flags["notifications"] = true
	root.get_node("EventBus").screen_requested.emit("settings", {})
	await _frames(5)
	_shot("04g_settings")

	root.get_node("EventBus").screen_requested.emit("battle", {"dungeon": "goblin_warren"})
	await _frames(10)
	_shot("05_battle")
	var battle_screen = main.find_children("*", "VBoxContainer", true, false).filter(func(n): return n.has_method("_ai_act"))[0]
	battle_screen._auto = true
	battle_screen._fast = true
	battle_screen._on_turn()
	await create_timer(4.0).timeout
	_shot("06_battle_auto")
	var guard := 0
	while battle_screen._overlay == null and guard < 600:
		await create_timer(0.2).timeout
		guard += 1
	_shot("07_room_result")
	game.SaveService.delete(game.save_path)
	print("UI smoke OK (room result shown: %s)" % str(battle_screen._overlay != null))
	quit(0 if battle_screen._overlay != null else 1)


func _frames(n: int) -> void:
	for i in n:
		await process_frame


func _shot(name: String) -> void:
	if shots_dir == "" or DisplayServer.get_name() == "headless":
		return
	root.get_texture().get_image().save_png(shots_dir.path_join(name + ".png"))
