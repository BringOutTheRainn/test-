extends RefCounted
## The player's heroes and their gear, with no UI.
##
## Each hero has a level, XP and one item per equipment slot. A hero's stats
## are worked out from data, never stored:
##   base stats (data/heroes "stats")
##   + growth per level above 1 (data/heroes "growth")
##   + the "stats" of every equipped item (data/items)
## Stat ids come from data/stats, slots from config "equipment_slots" and the
## XP curve from config "hero_leveling", so new stats, slots or items are data.
##
## Items are owned one by one (each has a uid), so two copies of a sword can
## be worn by two heroes.

signal changed(hero_id: String)
signal leveled_up(hero_id: String, level: int)
signal item_added(item: Dictionary)

var content
## hero id -> {"id", "level", "xp", "gear": {slot id -> item uid}}
var heroes: Dictionary = {}
## item uid -> {"uid", "id"}
var items: Dictionary = {}
var _next_item := 1


func setup(content_db) -> void:
	content = content_db


func new_roster(hero_ids: Array, item_ids: Array) -> void:
	heroes = {}
	items = {}
	_next_item = 1
	for id in hero_ids:
		recruit(str(id))
	for id in item_ids:
		add_item(str(id))


# --- Heroes --------------------------------------------------------------------

func recruit(id: String) -> Dictionary:
	if heroes.has(id):
		return heroes[id]
	if not content.has_entry("heroes", id):
		push_error("Unknown hero: %s" % id)
		return {}
	heroes[id] = {"id": id, "level": 1, "xp": 0, "gear": {}}
	changed.emit(id)
	return heroes[id]


func has_hero(id: String) -> bool:
	return heroes.has(id)


func hero(id: String) -> Dictionary:
	return heroes.get(id, {})


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


# --- Stats ---------------------------------------------------------------------

## Stat ids in display order (from data/stats).
func stat_ids() -> Array:
	return content.list("stats").map(func(s): return str(s.id))


func base_stats(id: String) -> Dictionary:
	var def: Dictionary = content.entry("heroes", id)
	var base: Dictionary = def.get("stats", {})
	var growth: Dictionary = def.get("growth", {})
	var lvl := level(id)
	var out := {}
	for stat in stat_ids():
		out[stat] = int(base.get(stat, 0)) + floori(float(growth.get(stat, 0.0)) * (lvl - 1))
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
	var gear := gear_stats(id)
	var out := {}
	for stat in base:
		out[stat] = maxi(0 if stat == "def" else 1, int(base[stat]) + int(gear.get(stat, 0)))
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


# --- Saving --------------------------------------------------------------------

func to_dict() -> Dictionary:
	return {"heroes": heroes.duplicate(true), "items": items.duplicate(true), "next_item": _next_item}


func from_dict(data: Dictionary) -> void:
	heroes = {}
	for id in data.get("heroes", {}):
		if not content.has_entry("heroes", id):
			continue
		var h: Dictionary = data.heroes[id]
		heroes[id] = {"id": id, "level": int(h.get("level", 1)), "xp": int(h.get("xp", 0)), "gear": h.get("gear", {}).duplicate()}
	items = {}
	for uid in data.get("items", {}):
		if content.has_entry("items", str(data.items[uid].get("id", ""))):
			items[uid] = {"uid": uid, "id": str(data.items[uid].id)}
	_next_item = int(data.get("next_item", items.size() + 1))
	# Drop gear pointing at items that no longer exist (removed from data).
	for id in heroes:
		for slot in heroes[id].gear.keys():
			if not items.has(heroes[id].gear[slot]):
				heroes[id].gear.erase(slot)
