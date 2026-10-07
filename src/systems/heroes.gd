extends RefCounted
## The player's heroes and their gear, with no UI.
##
## Every hero starts as the same blank recruit (data/heroes, usually just
## "adventurer"). What a hero becomes is up to the player:
##   - stat points: each level gives some to put into any stat (data/stats
##     "per_point" says how much one point adds),
##   - skill points: each level gives some to learn skills from the paths in
##     data/paths (Guardian, Ranger, Priest...). A path's later tiers open
##     after enough points are spent in it, so a hero can mix paths or focus.
##   - gear: the weapon gives the basic attack ("attack" on the item) and some
##     skills only work with certain weapon types ("weapons" on the skill).
## A hero's stats are worked out, never stored:
##   base stats + growth per level + stat points + passive skills + gear.
## Points per level, tier sizes and respec rules are in config "hero_build".
##
## Heroes are identified by a uid ("h1", "h2"...) and have a name the player
## sees. Items are owned one by one (each has a uid), so two copies of a
## sword can be worn by two heroes.

signal changed(hero_id: String)
signal leveled_up(hero_id: String, level: int)
signal item_added(item: Dictionary)
signal learned(hero_id: String, skill_id: String)

const ROWS := ["front", "back"]

var content
## hero uid -> {"id", "name", "base", "level", "xp", "gear": {slot -> item uid},
##   "row", "points": {stat -> n}, "skills": {skill id -> rank}}
var heroes: Dictionary = {}
## item uid -> {"uid", "id"}
var items: Dictionary = {}
var _next_item := 1
var _next_hero := 1
## Old hero ids (from saves made before heroes were blank) -> new uids.
var renamed: Dictionary = {}


func setup(content_db) -> void:
	content = content_db


## A fresh roster: `names` heroes (one per name given) and the starting items.
func new_roster(names: Array, item_ids: Array) -> void:
	heroes = {}
	items = {}
	_next_item = 1
	_next_hero = 1
	for n in names:
		recruit(str(n))
	for id in item_ids:
		add_item(str(id))


# --- Heroes --------------------------------------------------------------------

## Adds a new blank hero. Returns it.
func recruit(hero_name: String = "", base: String = "") -> Dictionary:
	if base == "":
		base = default_base()
	if not content.has_entry("heroes", base):
		push_error("Unknown hero base: %s" % base)
		return {}
	var uid := "h%d" % _next_hero
	_next_hero += 1
	if hero_name == "":
		hero_name = next_name()
	heroes[uid] = {"id": uid, "name": hero_name, "base": base, "level": 1, "xp": 0, "gear": {}, "row": "front", "points": {}, "skills": {}}
	changed.emit(uid)
	return heroes[uid]


func default_base() -> String:
	var all: Array = content.list("heroes")
	return str(all[0].id) if not all.is_empty() else ""


## A name from config "hero_names" no current hero has.
func next_name() -> String:
	var used: Array = heroes.values().map(func(h): return str(h.name))
	for n in content.setting("hero_names", []):
		if not str(n) in used:
			return str(n)
	return "Hero %d" % (heroes.size() + 1)


func has_hero(id: String) -> bool:
	return heroes.has(id)


func hero(id: String) -> Dictionary:
	return heroes.get(id, {})


func hero_name(id: String) -> String:
	return str(hero(id).get("name", id))


func rename(id: String, new_name: String) -> void:
	new_name = new_name.strip_edges().left(16)
	if has_hero(id) and new_name != "":
		heroes[id].name = new_name
		changed.emit(id)


## The hero's data entry (base stats, growth, body art).
func base_def(id: String) -> Dictionary:
	return content.entry("heroes", str(hero(id).get("base", "")))


func level(id: String) -> int:
	return int(hero(id).get("level", 1))


func max_level() -> int:
	return int(_leveling().get("max_level", 30))


## XP needed to go from `lvl` to `lvl + 1`.
func xp_to_next(lvl: int) -> int:
	var cfg := _leveling()
	return roundi(float(cfg.get("xp_to_level_2", 60)) * pow(float(cfg.get("xp_growth", 1.35)), lvl - 1))


## Adds XP and levels the hero up as many times as it covers. Returns levels gained.
func add_xp(id: String, amount: int) -> int:
	var h := hero(id)
	if h.is_empty() or amount <= 0:
		return 0
	var gained := 0
	h.xp = int(h.xp) + amount
	while int(h.level) < max_level() and int(h.xp) >= xp_to_next(int(h.level)):
		h.xp = int(h.xp) - xp_to_next(int(h.level))
		h.level = int(h.level) + 1
		gained += 1
		leveled_up.emit(id, int(h.level))
	if int(h.level) >= max_level():
		h.xp = 0
	changed.emit(id)
	return gained


func row(id: String) -> String:
	return str(hero(id).get("row", "front"))


func set_row(id: String, new_row: String) -> void:
	if has_hero(id) and new_row in ROWS:
		heroes[id].row = new_row
		changed.emit(id)


# --- Stat points -----------------------------------------------------------------

func stat_points_total(id: String) -> int:
	var cfg := _build()
	return int(cfg.get("start_stat_points", 0)) + int(cfg.get("stat_points_per_level", 2)) * (level(id) - 1)


func stat_points_left(id: String) -> int:
	var spent := 0
	for stat in hero(id).get("points", {}):
		spent += int(hero(id).points[stat])
	return stat_points_total(id) - spent


func can_add_stat_point(id: String, stat: String) -> bool:
	return has_hero(id) and stat in stat_ids() and stat_points_left(id) > 0


func add_stat_point(id: String, stat: String) -> bool:
	if not can_add_stat_point(id, stat):
		return false
	heroes[id].points[stat] = int(heroes[id].points.get(stat, 0)) + 1
	changed.emit(id)
	return true


## How much one point adds to a stat (data/stats "per_point").
func per_point(stat: String) -> float:
	return float(content.entry("stats", stat).get("per_point", 1))


# --- Skills and paths ------------------------------------------------------------

func skill_points_total(id: String) -> int:
	var cfg := _build()
	return int(cfg.get("start_skill_points", 1)) + int(cfg.get("skill_points_per_level", 1)) * (level(id) - 1)


func skill_points_left(id: String) -> int:
	var spent := 0
	for s in hero(id).get("skills", {}):
		spent += int(hero(id).skills[s])
	return skill_points_total(id) - spent


func skill_rank(id: String, skill_id: String) -> int:
	return int(hero(id).get("skills", {}).get(skill_id, 0))


func paths() -> Array:
	return content.list("paths")


## The path entry and node ({"skill", "tier", "ranks"?}) a skill is learned from.
func find_node(skill_id: String) -> Array:
	for p in paths():
		for node in p.get("nodes", []):
			if str(node.skill) == skill_id:
				return [p, node]
	return [{}, {}]


func max_rank(skill_id: String) -> int:
	return int(find_node(skill_id)[1].get("ranks", 1))


## Skill points the hero has put into one path.
func path_points(id: String, path_id: String) -> int:
	var total := 0
	for node in content.entry("paths", path_id).get("nodes", []):
		total += skill_rank(id, str(node.skill))
	return total


## Points needed in a path before its tier `tier` opens.
func points_for_tier(tier: int) -> int:
	return (tier - 1) * int(_build().get("points_per_tier", 3))


## Why the hero can't learn (or rank up) a skill now, or "".
func can_learn(id: String, skill_id: String) -> String:
	var found := find_node(skill_id)
	var path: Dictionary = found[0]
	var node: Dictionary = found[1]
	if not has_hero(id) or node.is_empty():
		return "Unknown skill"
	if skill_rank(id, skill_id) >= max_rank(skill_id):
		return "Fully learned"
	var need := points_for_tier(int(node.get("tier", 1)))
	if path_points(id, str(path.id)) < need:
		return "Needs %d points in %s" % [need, path.get("name", path.id)]
	if skill_points_left(id) <= 0:
		return "No skill points left"
	return ""


func learn(id: String, skill_id: String) -> bool:
	if can_learn(id, skill_id) != "":
		return false
	heroes[id].skills[skill_id] = skill_rank(id, skill_id) + 1
	changed.emit(id)
	learned.emit(id, skill_id)
	return true


## Forgets every skill and stat point so they can be spent again.
func reset_points(id: String) -> void:
	if not has_hero(id):
		return
	heroes[id].skills = {}
	heroes[id].points = {}
	changed.emit(id)


func points_spent(id: String) -> int:
	return skill_points_total(id) - skill_points_left(id) + stat_points_total(id) - stat_points_left(id)


## What the hero has become: the path with the most points, as
## {"name": "Guardian", "role": "Tank", "color": ...}, or a plain recruit.
func role(id: String) -> Dictionary:
	var best: Dictionary = {}
	var best_points := 0
	for p in paths():
		var n := path_points(id, str(p.id))
		if n > best_points:
			best = p
			best_points = n
	if best.is_empty():
		return {"name": str(_build().get("recruit_title", "Recruit")), "role": "", "color": "#c0cbdc"}
	return {"name": str(best.get("name", best.id)), "role": str(best.get("role", "")), "color": str(best.get("color", "#c0cbdc"))}


## The equipped weapon's type ("sword", "bow"...), or "" with no weapon.
func weapon_type(id: String) -> String:
	for slot in hero(id).get("gear", {}):
		var item := item_def(hero(id).gear[slot])
		if item.has("weapon_type"):
			return str(item.weapon_type)
	return ""


## True when a skill's weapon needs ("weapons": ["bow"]) are met.
func weapon_allows(id: String, skill_id: String) -> bool:
	var needs: Array = content.entry("skills", skill_id).get("weapons", [])
	return needs.is_empty() or weapon_type(id) in needs


## The basic attack: the weapon's "attack" skill, else config "unarmed_attack".
func basic_attack(id: String) -> String:
	for slot in hero(id).get("gear", {}):
		var item := item_def(hero(id).gear[slot])
		if item.has("attack"):
			return str(item.attack)
	return str(_build().get("unarmed_attack", "punch"))


## Skills the hero can use in battle: basic attack, the base's skills (Defend)
## and every learned active skill the current weapon allows.
func battle_skills(id: String) -> Array:
	var out: Array = [basic_attack(id)]
	for s in base_def(id).get("skills", []):
		if not s in out:
			out.append(s)
	for s in hero(id).get("skills", {}):
		var def: Dictionary = content.entry("skills", s)
		if def.is_empty() or def.get("passive", false) or s in out:
			continue
		if weapon_allows(id, s):
			out.append(s)
	return out


# --- Stats ---------------------------------------------------------------------

## Stat ids in display order (from data/stats).
func stat_ids() -> Array:
	return content.list("stats").map(func(s): return str(s.id))


## Base stats plus growth for the hero's level.
func base_stats(id: String) -> Dictionary:
	var def := base_def(id)
	var base: Dictionary = def.get("stats", {})
	var growth: Dictionary = def.get("growth", {})
	var lvl := level(id)
	var out := {}
	for stat in stat_ids():
		out[stat] = int(base.get(stat, 0)) + floori(float(growth.get(stat, 0.0)) * (lvl - 1))
	return out


## What stat points add.
func point_stats(id: String) -> Dictionary:
	var out := {}
	for stat in stat_ids():
		out[stat] = floori(float(hero(id).get("points", {}).get(stat, 0)) * per_point(stat))
	return out


## What learned passive skills add ("stats" per rank on the skill).
func passive_stats(id: String) -> Dictionary:
	var out := {}
	for stat in stat_ids():
		out[stat] = 0
	for s in hero(id).get("skills", {}):
		var def: Dictionary = content.entry("skills", s)
		if not def.get("passive", false):
			continue
		for stat in def.get("stats", {}):
			out[stat] = int(out.get(stat, 0)) + int(def.stats[stat]) * int(hero(id).skills[s])
	return out


func gear_stats(id: String) -> Dictionary:
	var out := {}
	for stat in stat_ids():
		out[stat] = 0
	for slot in hero(id).get("gear", {}):
		var item := item_def(hero(id).gear[slot])
		for stat in item.get("stats", {}):
			out[stat] = int(out.get(stat, 0)) + int(item.stats[stat])
	return out


## Final stats used in battle. Nothing drops below 1 (0 for defense).
func stats(id: String) -> Dictionary:
	var base := base_stats(id)
	var parts := [point_stats(id), passive_stats(id), gear_stats(id)]
	var out := {}
	for stat in base:
		var total := int(base[stat])
		for part in parts:
			total += int(part.get(stat, 0))
		out[stat] = maxi(0 if stat == "def" else 1, total)
	return out


## Everything a battle needs to field this hero.
func battle_entry(id: String) -> Dictionary:
	var def := base_def(id)
	return {
		"id": id, "base": str(hero(id).get("base", "")), "name": hero_name(id), "row": row(id),
		"stats": stats(id), "level": level(id), "skills": battle_skills(id), "look": look(id),
		"color": str(role(id).color) if role(id).role != "" else str(def.get("color", "#888888")),
	}


# --- Looks ---------------------------------------------------------------------

## Image paths drawn on top of each other to show the hero: the body, then
## each worn item's "worn" layer in config "hero_build.layer_order".
func look(id: String) -> Array:
	var def := base_def(id)
	var body := str(def.get("sprite", "res://art/heroes/%s.png" % str(def.get("id", ""))))
	var out: Array = [body]
	var gear: Dictionary = hero(id).get("gear", {})
	for slot in _build().get("layer_order", _slot_ids()):
		if not gear.has(slot):
			continue
		var item := item_def(gear[slot])
		var path := str(item.get("worn", "res://art/gear/%s.png" % str(item.get("id", ""))))
		if ResourceLoader.exists(path) or FileAccess.file_exists(path):
			out.append(path)
	return out


# --- Items ---------------------------------------------------------------------

func add_item(id: String) -> Dictionary:
	if not content.has_entry("items", id):
		push_error("Unknown item: %s" % id)
		return {}
	var uid := "i%d" % _next_item
	_next_item += 1
	items[uid] = {"uid": uid, "id": id}
	item_added.emit(items[uid])
	return items[uid]


## The data entry for an owned item uid.
func item_def(uid: String) -> Dictionary:
	return content.entry("items", str(items.get(uid, {}).get("id", "")))


## Which hero wears this item, or "".
func owner_of(uid: String) -> String:
	for id in heroes:
		if uid in heroes[id].get("gear", {}).values():
			return id
	return ""


## Items nobody is wearing, optionally only those for one slot.
func free_items(slot: String = "") -> Array:
	var out: Array = []
	for uid in items:
		if owner_of(uid) != "":
			continue
		if slot != "" and str(item_def(uid).get("slot", "")) != slot:
			continue
		out.append(items[uid])
	out.sort_custom(func(a, b): return int(content.entry("items", a.id).get("order", 1000)) < int(content.entry("items", b.id).get("order", 1000)))
	return out


## Puts an item on a hero, in the item's slot. Takes it off whoever wore it
## and puts back whatever the hero had in that slot.
func equip(hero_id: String, item_uid: String) -> bool:
	var h := hero(hero_id)
	var slot := str(item_def(item_uid).get("slot", ""))
	if h.is_empty() or slot == "" or not _slot_ids().has(slot):
		return false
	var previous := owner_of(item_uid)
	if previous != "":
		unequip(previous, slot)
	h.gear[slot] = item_uid
	changed.emit(hero_id)
	return true


func unequip(hero_id: String, slot: String) -> void:
	var h := hero(hero_id)
	if h.is_empty() or not h.gear.has(slot):
		return
	h.gear.erase(slot)
	changed.emit(hero_id)


func slots() -> Array:
	return content.setting("equipment_slots", [])


func _slot_ids() -> Array:
	return slots().map(func(s): return str(s.id))


func _leveling() -> Dictionary:
	return content.setting("hero_leveling", {})


func _build() -> Dictionary:
	return content.setting("hero_build", {})


# --- Saving --------------------------------------------------------------------

func to_dict() -> Dictionary:
	return {"heroes": heroes.duplicate(true), "items": items.duplicate(true), "next_item": _next_item, "next_hero": _next_hero}


func from_dict(data: Dictionary) -> void:
	heroes = {}
	renamed = {}
	_next_hero = int(data.get("next_hero", 1))
	var old: Array = []
	for id in data.get("heroes", {}):
		var h: Dictionary = data.heroes[id]
		if not h.has("base"):
			# Saved before heroes were blank recruits: the id was a class.
			old.append([id, h])
			continue
		if not content.has_entry("heroes", str(h.base)):
			continue
		heroes[id] = {
			"id": id, "name": str(h.get("name", id)), "base": str(h.base),
			"level": int(h.get("level", 1)), "xp": int(h.get("xp", 0)), "gear": h.get("gear", {}).duplicate(),
			"row": str(h.get("row", "front")), "points": h.get("points", {}).duplicate(), "skills": h.get("skills", {}).duplicate(),
		}
		_next_hero = maxi(_next_hero, int(str(id).trim_prefix("h")) + 1)
	# Old class heroes become blank heroes at the same level, with every point
	# free to spend, keeping their gear.
	for pair in old:
		var h: Dictionary = pair[1]
		var made := recruit()
		if made.is_empty():
			continue
		made.level = int(h.get("level", 1))
		made.xp = int(h.get("xp", 0))
		made.gear = h.get("gear", {}).duplicate()
		made.row = "back" if str(pair[0]) in ["ranger", "cleric"] else "front"
		renamed[str(pair[0])] = made.id
	items = {}
	for uid in data.get("items", {}):
		if content.has_entry("items", str(data.items[uid].get("id", ""))):
			items[uid] = {"uid": uid, "id": str(data.items[uid].id)}
	_next_item = int(data.get("next_item", items.size() + 1))
	for id in heroes:
		# Drop gear pointing at items that no longer exist (removed from data),
		# and skills or stats that were removed.
		for slot in heroes[id].gear.keys():
			if not items.has(heroes[id].gear[slot]):
				heroes[id].gear.erase(slot)
		for s in heroes[id].skills.keys():
			if find_node(s)[1].is_empty():
				heroes[id].skills.erase(s)
		for stat in heroes[id].points.keys():
			if not stat in stat_ids():
				heroes[id].points.erase(stat)
