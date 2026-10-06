extends RefCounted
## One turn-based battle, as a pure model with no UI.
##
## Rules (from the design doc): two rows per side, the front row protects the
## back row from melee; turn order each round is by Speed; each turn a unit
## gains energy and uses one skill (attack, skill, defend). Status effects tick
## at the start of the owner's turn.
##
## Usage: setup(), then loop: read `current`, pick a skill and target (the
## player via UI, or choose_action() for enemies / auto-battle), call act().
## `outcome` becomes "won" or "lost" when one side falls.

signal logged(text: String)
signal turn_started(unit: Dictionary)
signal ended(outcome: String)
## What happened, for animation: {"type": "action", "source", "skill", "targets"},
## {"type": "damage", "target", "amount", "fell"}, {"type": "heal", "target",
## "amount"} or {"type": "status", "target", "status"}. Uids, not unit dicts.
signal event(data: Dictionary)

const Effects := preload("res://src/combat/effects.gd")

const SINGLE_ENEMY := ["enemy_melee", "enemy_any"]

var content
var effects := Effects.new()
var rng := RandomNumberGenerator.new()
var units: Array = []
var current: Dictionary = {}
var round_number := 0
var outcome := ""
var log_lines: Array = []
var max_energy := 3
var energy_per_turn := 1
var damage_scale := 1.0
var _queue: Array = []


## heroes: Array of {id, row?, hp?} (hp carries over between rooms).
## enemies: Array of {id, row}.
func setup(content_db, heroes: Array, enemies: Array, seed_value: int = -1) -> void:
	content = content_db
	if seed_value >= 0:
		rng.seed = seed_value
	else:
		rng.randomize()
	var combat_cfg: Dictionary = content.setting("combat", {})
	max_energy = int(combat_cfg.get("max_energy", 3))
	energy_per_turn = int(combat_cfg.get("energy_per_turn", 1))
	damage_scale = float(combat_cfg.get("damage_scale", 1.0))
	units = []
	for h in heroes:
		var hero := make_unit(content.entry("heroes", str(h.id)), "hero", str(h.get("row", "")))
		if h.has("hp"):
			hero.hp = clampi(int(h.hp), 0, int(hero.max_hp))
		if int(hero.hp) > 0:
			units.append(hero)
	for e in enemies:
		units.append(make_unit(content.entry("enemies", str(e.id)), "enemy", str(e.get("row", ""))))
	_start_round()
	_next_turn()


func make_unit(def: Dictionary, team: String, row: String) -> Dictionary:
	var stats: Dictionary = def.get("stats", {})
	return {
		"uid": "%s%d" % [team[0], units.size() + 1],
		"id": str(def.get("id", "")),
		"name": str(def.get("name", "?")),
		"team": team,
		"row": row if row != "" else str(def.get("row", "front")),
		"color": str(def.get("color", "#888888")),
		"boss": bool(def.get("boss", false)),
		"max_hp": int(stats.get("hp", 10)),
		"hp": int(stats.get("hp", 10)),
		"atk": int(stats.get("atk", 1)),
		"def": int(stats.get("def", 0)),
		"spd": int(stats.get("spd", 1)),
		"energy": 0,
		"skills": def.get("skills", []).duplicate(),
		"statuses": {},
	}


# --- Queries -----------------------------------------------------------------

func skill(id: String) -> Dictionary:
	return content.entry("skills", id)


func unit(uid: String) -> Dictionary:
	for u in units:
		if u.uid == uid:
			return u
	return {}


func alive(team: String) -> Array:
	return units.filter(func(u): return u.team == team and int(u.hp) > 0)


func opponents_of(u: Dictionary) -> String:
	return "enemy" if u.team == "hero" else "hero"


func is_usable(u: Dictionary, skill_id: String) -> bool:
	var s := skill(skill_id)
	return not s.is_empty() and int(u.energy) >= int(s.get("cost", 0)) and not valid_targets(u, skill_id).is_empty()


## "single" (tap one target), "group" (one tap hits all listed), or "self".
func target_mode(skill_id: String) -> String:
	var target := str(skill(skill_id).get("target", "enemy_melee"))
	if target == "self":
		return "self"
	if target in SINGLE_ENEMY or target == "ally":
		return "single"
	return "group"


## Unit uids this skill may target (or will hit, for group skills).
func valid_targets(u: Dictionary, skill_id: String) -> Array:
	var target := str(skill(skill_id).get("target", "enemy_melee"))
	var foes := alive(opponents_of(u))
	var result: Array = []
	match target:
		"self":
			result = [u]
		"ally":
			result = alive(u.team)
		"enemy_melee", "enemy_any":
			var taunting := foes.filter(func(f): return f.statuses.has("taunt"))
			if not taunting.is_empty():
				result = taunting
			elif target == "enemy_melee":
				var front := foes.filter(func(f): return f.row == "front")
				result = front if not front.is_empty() else foes
			else:
				result = foes
		"enemy_back_row":
			var back := foes.filter(func(f): return f.row == "back")
			result = back if not back.is_empty() else foes
		"enemy_front_row":
			var front_row := foes.filter(func(f): return f.row == "front")
			result = front_row if not front_row.is_empty() else foes
		"all_enemies":
			result = foes
		"all_allies":
			result = alive(u.team)
		_:
			push_error("Unknown skill target: %s" % target)
	return result.map(func(x): return x.uid)


## Who acts next: the current unit, then the rest of this round.
func turn_order() -> Array:
	var order: Array = []
	if not current.is_empty():
		order.append(current)
	for uid in _queue:
		var u := unit(uid)
		if int(u.get("hp", 0)) > 0:
			order.append(u)
	return order


# --- Actions -----------------------------------------------------------------

## The current unit uses a skill on a target uid (ignored for self/group skills).
func act(skill_id: String, target_uid: String = "") -> bool:
	if outcome != "" or current.is_empty():
		return false
	var u := current
	if not is_usable(u, skill_id):
		return false
	var s := skill(skill_id)
	var targets := valid_targets(u, skill_id)
	if target_mode(skill_id) == "single":
		if not target_uid in targets:
			return false
		targets = [target_uid]
	u.energy = int(u.energy) - int(s.get("cost", 0))
	add_log("%s uses %s" % [u.name, s.get("name", skill_id)])
	event.emit({"type": "action", "source": u.uid, "skill": skill_id, "targets": targets.duplicate()})
	for uid in targets:
		var t := unit(uid)
		for effect in s.get("effects", []):
			effects.apply(self, effect, u, t)
	_check_outcome()
	if outcome == "":
		_next_turn()
	return true


## A simple AI used by enemies and by auto-battle.
func choose_action(u: Dictionary) -> Dictionary:
	var allies := alive(u.team)
	var hurt := allies.filter(func(a): return float(a.hp) / float(a.max_hp) < 0.5)
	hurt.sort_custom(func(a, b): return float(a.hp) / float(a.max_hp) < float(b.hp) / float(b.max_hp))
	var options: Array = u.skills.filter(func(id): return is_usable(u, id))
	options.sort_custom(func(a, b): return int(skill(a).get("cost", 0)) > int(skill(b).get("cost", 0)))
	for id in options:
		var s := skill(id)
		var heals: bool = s.get("effects", []).any(func(e): return e.type == "heal")
		if heals:
			if hurt.is_empty():
				continue
			return {"skill": id, "target": hurt[0].uid}
		if id == "defend":
			continue
		if target_mode(id) == "self" and _already_has_statuses(u, s):
			continue
		var targets := valid_targets(u, id)
		var pick: String = targets[0]
		if target_mode(id) == "single":
			var foes: Array = targets.map(func(uid): return unit(uid))
			foes.sort_custom(func(a, b): return int(a.hp) < int(b.hp))
			# Enemies spread their attacks a little; heroes focus the weakest.
			pick = foes[0].uid if u.team == "hero" or rng.randf() < 0.5 else targets[rng.randi() % targets.size()]
		return {"skill": id, "target": pick}
	return {"skill": "defend", "target": u.uid}


# --- Used by effects -----------------------------------------------------------

func deal_damage(target: Dictionary, amount: int, text: String) -> void:
	target.hp = maxi(0, int(target.hp) - amount)
	add_log(text)
	event.emit({"type": "damage", "target": target.uid, "amount": amount, "fell": int(target.hp) == 0})
	if int(target.hp) == 0:
		target.statuses = {}
		add_log("%s falls" % target.name)


func add_log(text: String) -> void:
	log_lines.append(text)
	logged.emit(text)


# --- Turn flow -----------------------------------------------------------------

func _start_round() -> void:
	round_number += 1
	var order := units.filter(func(u): return int(u.hp) > 0)
	order.sort_custom(func(a, b):
		if int(a.spd) == int(b.spd):
			return a.uid < b.uid
		return int(a.spd) > int(b.spd))
	_queue = order.map(func(u): return u.uid)


## Advances to the next unit that can act, resolving start-of-turn effects.
func _next_turn() -> void:
	current = {}
	while outcome == "":
		if _queue.is_empty():
			_start_round()
		var u := unit(_queue.pop_front())
		if int(u.get("hp", 0)) <= 0:
			continue
		u.energy = mini(int(u.energy) + energy_per_turn, max_energy)
		for id in Effects.DAMAGE_OVER_TIME:
			if u.statuses.has(id):
				deal_damage(u, int(u.statuses[id].get("damage", 1)), "%s takes %d %s damage" % [u.name, int(u.statuses[id].get("damage", 1)), id])
		var stunned: bool = u.statuses.has("stun")
		_tick_statuses(u)
		_check_outcome()
		if outcome != "" or int(u.hp) <= 0:
			continue
		if stunned:
			add_log("%s is stunned" % u.name)
			continue
		current = u
		turn_started.emit(u)
		return


func _tick_statuses(u: Dictionary) -> void:
	for id in u.statuses.keys():
		u.statuses[id].turns = int(u.statuses[id].turns) - 1
		if int(u.statuses[id].turns) <= 0:
			u.statuses.erase(id)


func _already_has_statuses(u: Dictionary, s: Dictionary) -> bool:
	for effect in s.get("effects", []):
		if effect.type == "status" and not u.statuses.has(effect.status):
			return false
	return true


func _check_outcome() -> void:
	if outcome != "":
		return
	if alive("enemy").is_empty():
		outcome = "won"
	elif alive("hero").is_empty():
		outcome = "lost"
	if outcome != "":
		current = {}
		add_log("Victory!" if outcome == "won" else "Defeat...")
		ended.emit(outcome)
