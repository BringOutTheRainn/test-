extends RefCounted
## Combat effects as reusable components. A skill in data/skills is a target
## rule plus a list of effects, e.g. [{"type": "damage", "power": 0.8},
## {"type": "status", "status": "burn", "turns": 2}]. New skills are new data
## files; a genuinely new kind of effect is one register() call.

## Status ids that cleanse removes.
const DEBUFFS := ["burn", "poison", "stun"]
## Statuses that deal damage at the start of the owner's turn.
const DAMAGE_OVER_TIME := ["burn", "poison"]

## Effect type -> Callable(battle, effect: Dictionary, source: Dictionary, target: Dictionary)
var handlers: Dictionary = {}


func _init() -> void:
	register("damage", _damage)
	register("heal", _heal)
	register("status", _status)
	register("cleanse", _cleanse)


func register(type: String, handler: Callable) -> void:
	handlers[type] = handler


func apply(battle, effect: Dictionary, source: Dictionary, target: Dictionary) -> void:
	var type := str(effect.get("type", ""))
	if not handlers.has(type):
		push_error("Unknown effect type: %s" % type)
		return
	if effect.has("chance") and battle.rng.randf() > float(effect.chance):
		return
	handlers[type].call(battle, effect, source, target)


static func damage_amount(attack: float, power: float, defense: float, roll: float) -> int:
	var raw := attack * power * (50.0 / (50.0 + maxf(defense, 0.0)))
	return maxi(1, roundi(raw * roll))


func _damage(battle, effect: Dictionary, source: Dictionary, target: Dictionary) -> void:
	if int(target.hp) <= 0:
		return
	var power := float(effect.get("power", 1.0))
	var bonus: Dictionary = effect.get("bonus_below_hp", {})
	if not bonus.is_empty() and float(target.hp) / float(target.max_hp) < float(bonus.get("threshold", 0.5)):
		power *= float(bonus.get("multiplier", 2.0))
	power *= battle.damage_scale
	var amount := damage_amount(float(source.atk), power, float(target.def), battle.rng.randf_range(0.9, 1.1))
	if target.statuses.has("shield"):
		amount = maxi(1, amount / 2)
	battle.deal_damage(target, amount, "%s hits %s for %d" % [source.name, target.name, amount])


func _heal(battle, effect: Dictionary, source: Dictionary, target: Dictionary) -> void:
	if int(target.hp) <= 0:
		return
	var amount := roundi(float(source.atk) * float(effect.get("power", 1.0)))
	var healed := mini(amount, int(target.max_hp) - int(target.hp))
	target.hp = int(target.hp) + healed
	battle.add_log("%s heals %s for %d" % [source.name, target.name, healed])


func _status(battle, effect: Dictionary, source: Dictionary, target: Dictionary) -> void:
	if int(target.hp) <= 0:
		return
	var id := str(effect.get("status", ""))
	var status := {"turns": int(effect.get("turns", 1))}
	if id in DAMAGE_OVER_TIME:
		status["damage"] = maxi(1, roundi(float(source.atk) * float(effect.get("power", 0.3))))
	target.statuses[id] = status
	battle.add_log("%s is affected by %s" % [target.name, id])


func _cleanse(battle, _effect: Dictionary, _source: Dictionary, target: Dictionary) -> void:
	for id in DEBUFFS:
		target.statuses.erase(id)
