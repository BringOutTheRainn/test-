extends RefCounted
## The one shared resource inventory. Every system that earns or spends
## resources goes through this, so new resources plug in automatically.

signal changed

## Resource id -> amount. Stored as floats so hourly production can accrue smoothly.
var amounts: Dictionary = {}
## Resource id -> cap. A resource with no entry has no cap.
var caps: Dictionary = {}


func amount(id: String) -> float:
	return amounts.get(id, 0.0)


func whole(id: String) -> int:
	return int(floor(amount(id)))


func cap(id: String) -> float:
	return caps.get(id, INF)


func is_full(id: String) -> bool:
	return amount(id) >= cap(id)


## Adds up to the cap and returns how much was actually added.
## Negative amounts remove resources (never below zero).
func add(id: String, value: float) -> float:
	var before := amount(id)
	var after := clampf(before + value, 0.0, maxf(cap(id), before))
	amounts[id] = after
	if not is_equal_approx(after, before):
		changed.emit()
	return after - before


func add_all(values: Dictionary) -> Dictionary:
	var added := {}
	for id in values:
		added[id] = add(id, float(values[id]))
	return added


func can_afford(cost: Dictionary) -> bool:
	for id in cost:
		if amount(id) < float(cost[id]):
			return false
	return true


## Resources still needed to afford a cost (empty when affordable).
func missing(cost: Dictionary) -> Dictionary:
	var out := {}
	for id in cost:
		var need := float(cost[id]) - amount(id)
		if need > 0.0:
			out[id] = ceili(need)
	return out


func spend(cost: Dictionary) -> bool:
	if not can_afford(cost):
		return false
	for id in cost:
		amounts[id] = amount(id) - float(cost[id])
	changed.emit()
	return true


func set_caps(new_caps: Dictionary) -> void:
	caps = new_caps
	changed.emit()


func to_dict() -> Dictionary:
	return amounts.duplicate()


func from_dict(data: Dictionary) -> void:
	amounts = {}
	for id in data:
		amounts[id] = float(data[id])
	changed.emit()
