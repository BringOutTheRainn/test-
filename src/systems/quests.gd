extends RefCounted
## A simple goal chain that guides the first session (and later, any
## sequence of goals). Quests come from data/quests in "order"; one is active
## at a time. A quest's "goal" is checked against a facts dictionary the game
## provides, so this system knows nothing about the city or heroes.
##
## Goal types:
##   {"type": "build", "building": id, "level": 1, "count": 1}  finished buildings
##   {"type": "place", "building": id}                           placed, even if still building
##   {"type": "heroes", "count": n}                              heroes recruited
##   {"type": "clear_dungeon", "dungeon": id}                   dungeon won once
##   {"type": "flag", "flag": name}                             a game flag is set
##   {"type": "count", "counter": name, "count": n}             a lifetime counter (Game.count) reached n
## When the goal is met the player claims the quest's "reward" (resources).

signal advanced(quest: Dictionary)

var content
## Index of the active quest in list(); past the end means all done.
var index := 0


func setup(content_db) -> void:
	content = content_db


func list() -> Array:
	return content.list("quests")


func current() -> Dictionary:
	var all := list()
	return all[index] if index < all.size() else {}


func all_done() -> bool:
	return index >= list().size()


## [have, need] for a quest given the game's facts.
func progress(quest: Dictionary, facts: Dictionary) -> Array:
	var goal: Dictionary = quest.get("goal", {})
	match str(goal.get("type", "")):
		"build":
			var lvl := int(goal.get("level", 1))
			var levels: Array = facts.get("building_levels", {}).get(str(goal.building), [])
			return [levels.filter(func(l): return int(l) >= lvl).size(), int(goal.get("count", 1))]
		"place":
			return [mini(int(facts.get("building_counts", {}).get(str(goal.building), 0)), 1), 1]
		"heroes":
			return [int(facts.get("heroes", 0)), int(goal.get("count", 1))]
		"clear_dungeon":
			return [1 if str(goal.dungeon) in facts.get("cleared", []) else 0, 1]
		"flag":
			return [1 if facts.get("flags", {}).get(str(goal.flag), false) else 0, 1]
		"count":
			return [int(facts.get("counters", {}).get(str(goal.counter), 0)), int(goal.get("count", 1))]
	push_error("Unknown quest goal: %s" % goal)
	return [0, 1]


func is_complete(quest: Dictionary, facts: Dictionary) -> bool:
	if quest.is_empty():
		return false
	var p := progress(quest, facts)
	return int(p[0]) >= int(p[1])


## Finishes the active quest if its goal is met. Returns its reward ({} if not done).
func claim(facts: Dictionary) -> Dictionary:
	var q := current()
	if not is_complete(q, facts):
		return {}
	index += 1
	advanced.emit(current())
	return q.get("reward", {})


func to_dict() -> Dictionary:
	return {"done": list().slice(0, index).map(func(q): return q.id)}


## Restores by quest id, so quests added or reordered by an update still line
## up: the active quest is the first one not yet done.
func from_dict(data: Dictionary) -> void:
	var done: Array = data.get("done", [])
	index = 0
	for q in list():
		if not q.id in done:
			break
		index += 1
