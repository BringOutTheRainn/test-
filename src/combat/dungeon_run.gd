extends RefCounted
## One trip through a dungeon: a sequence of rooms from data/dungeons, hero
## health carried between fights, and the loot gathered so far. Losing keeps
## a share of the loot (combat.lose_loot_fraction in the config).

const Battle := preload("res://src/combat/battle.gd")

var content
var dungeon: Dictionary = {}
var room_index := 0
## Hero id -> remaining hp (missing means full health).
var hero_hp: Dictionary = {}
var party: Array = []
var loot: Dictionary = {}
## XP earned from enemies beaten, shared by every hero in the party.
var xp := 0
## Item ids found (data/items), from a room's "items" list.
var items: Array = []
## Hero id -> stats to fight with (leveled and geared); missing uses the data file.
var hero_stats: Dictionary = {}
var hero_levels: Dictionary = {}
var finished := false
var won := false
var battle: Battle


func setup(content_db, dungeon_id: String, party_ids: Array, stats_by_hero: Dictionary = {}, levels_by_hero: Dictionary = {}) -> void:
	content = content_db
	dungeon = content.entry("dungeons", dungeon_id)
	party = party_ids.duplicate()
	hero_stats = stats_by_hero
	hero_levels = levels_by_hero
	room_index = 0
	loot = {}
	xp = 0
	items = []
	hero_hp = {}
	finished = dungeon.get("rooms", []).is_empty()


func rooms() -> Array:
	return dungeon.get("rooms", [])


func current_room() -> Dictionary:
	var all := rooms()
	return all[room_index] if room_index < all.size() else {}


## Builds the battle for the current room.
func start_battle(seed_value: int = -1) -> Battle:
	var heroes: Array = []
	for id in party:
		var h := {"id": id}
		if hero_stats.has(id):
			h["stats"] = hero_stats[id]
		if hero_levels.has(id):
			h["level"] = hero_levels[id]
		if hero_hp.has(id):
			h["hp"] = hero_hp[id]
		heroes.append(h)
	battle = Battle.new()
	battle.setup(content, heroes, current_room().get("enemies", []), seed_value)
	return battle


## Records the result of the current room's battle and moves on.
func finish_battle() -> void:
	for u in battle.units:
		if u.team == "hero":
			hero_hp[u.id] = int(u.hp)
	if battle.outcome == "won":
		var room_loot: Dictionary = current_room().get("loot", {})
		for res in room_loot:
			loot[res] = loot.get(res, 0) + int(room_loot[res])
		for u in battle.units:
			if u.team == "enemy":
				xp += int(u.get("xp", 0))
		items.append_array(current_room().get("items", []))
		room_index += 1
		if room_index >= rooms().size():
			finished = true
			won = true
	else:
		finished = true
		won = false
		var keep := float(content.setting("combat", {}).get("lose_loot_fraction", 0.5))
		for res in loot:
			loot[res] = int(floor(loot[res] * keep))
		var keep_xp := float(content.setting("hero_leveling", {}).get("xp_kept_on_loss", 0.5))
		xp = int(floor(xp * keep_xp))


## Gives up mid-fight; counts as a loss for loot.
func retreat() -> void:
	if battle != null and battle.outcome == "":
		battle.outcome = "lost"
	finish_battle()


func result() -> Dictionary:
	return {"dungeon": dungeon.get("id", ""), "won": won, "rooms_cleared": room_index, "loot": loot, "xp": xp, "items": items}
