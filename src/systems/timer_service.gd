extends RefCounted
## The one timer service. Every timed action (construction, healing, energy
## refills later) is a timer here, stored as real-world unix times so timers
## keep running while the app is closed.

signal started(timer: Dictionary)
signal finished(timer: Dictionary)

## Timer id -> {id, kind, ref, start, end, data}
var timers: Dictionary = {}
var _next_id := 1
## Returns the current unix time. Tests swap this for a fake clock.
var clock: Callable = Callable(Time, "get_unix_time_from_system")


func now() -> float:
	return clock.call()


## Starts a timer. `ref` ties it to whatever it belongs to (e.g. a building uid).
func start(kind: String, ref: String, seconds: float, data: Dictionary = {}) -> Dictionary:
	var t := now()
	var timer := {
		"id": str(_next_id),
		"kind": kind,
		"ref": ref,
		"start": t,
		"end": t + maxf(seconds, 0.0),
		"data": data,
	}
	_next_id += 1
	timers[timer.id] = timer
	started.emit(timer)
	return timer


func get_timer(id: String) -> Dictionary:
	return timers.get(id, {})


func for_ref(ref: String) -> Dictionary:
	for timer in timers.values():
		if timer.ref == ref:
			return timer
	return {}


func count(kind: String) -> int:
	var n := 0
	for timer in timers.values():
		if timer.kind == kind:
			n += 1
	return n


func remaining(timer: Dictionary) -> float:
	return maxf(float(timer.end) - now(), 0.0)


func progress(timer: Dictionary) -> float:
	var total := float(timer.end) - float(timer.start)
	if total <= 0.0:
		return 1.0
	return clampf(1.0 - remaining(timer) / total, 0.0, 1.0)


## Earliest end time among running timers, or INF.
func next_end() -> float:
	var best := INF
	for timer in timers.values():
		best = minf(best, float(timer.end))
	return best


## Finishes every timer whose end time has passed, oldest first.
func update() -> void:
	var t := now()
	var due: Array = timers.values().filter(func(timer): return float(timer.end) <= t)
	due.sort_custom(func(a, b): return float(a.end) < float(b.end))
	for timer in due:
		_finish(timer)


## Finishes a timer immediately (used by skips).
func finish_now(id: String) -> void:
	if timers.has(id):
		_finish(timers[id])


func cancel(id: String) -> void:
	timers.erase(id)


func _finish(timer: Dictionary) -> void:
	if not timers.has(timer.id):
		return
	timers.erase(timer.id)
	finished.emit(timer)


func to_dict() -> Dictionary:
	return {"next_id": _next_id, "timers": timers.duplicate(true)}


func from_dict(data: Dictionary) -> void:
	_next_id = int(data.get("next_id", 1))
	timers = data.get("timers", {}).duplicate(true)
