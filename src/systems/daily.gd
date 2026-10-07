extends RefCounted
## Things that reset every day, with no UI: the login reward and the daily
## quests.
##
## Days are the player's local calendar days. Login rewards follow a cycle
## from config "daily_login" ({"rewards": [day 1, day 2, ...]}); a missed day
## does not reset the cycle, the next claim just gives the next reward.
## Daily quests are picked each day from data/daily_quests: each counts how
## much a lifetime counter (see Game.count) went up since the day began, e.g.
## {"counter": "fights_won", "count": 3}. Which quests a day gets is decided by
## the day number, so it is the same after a restart.

signal changed

var content
## Returns the current unix time; Game passes the timer service's clock.
var clock: Callable = Callable(Time, "get_unix_time_from_system")
## Seconds to add to UTC for local days. Tests set this to 0.
var utc_offset := 0

## Day number of the last login reward claimed (-1: never).
var login_day := -1
## How many login rewards were claimed, so the next is rewards[claimed % size].
var login_claimed := 0
## Day number the daily quests were picked for.
var quest_day := -1
var quest_ids: Array = []
## Counter values when the day began.
var quest_base: Dictionary = {}
var quest_claimed: Array = []
var bonus_claimed := false


func setup(content_db, clock_fn: Callable = Callable()) -> void:
	content = content_db
	if clock_fn.is_valid():
		clock = clock_fn
	utc_offset = int(Time.get_time_zone_from_system().get("bias", 0)) * 60


func today() -> int:
	return floori((float(clock.call()) + utc_offset) / 86400.0)


## Seconds until the next local midnight.
func seconds_to_tomorrow() -> float:
	return (today() + 1) * 86400.0 - utc_offset - float(clock.call())


# --- Login reward --------------------------------------------------------------

func login_rewards() -> Array:
	return content.setting("daily_login", {}).get("rewards", [])


func can_claim_login() -> bool:
	return not login_rewards().is_empty() and today() > login_day


## Index into login_rewards() of the reward that's next.
func login_index() -> int:
	var n := login_rewards().size()
	return login_claimed % n if n > 0 else 0


## Claims today's login reward. Returns it ({} if already claimed).
func claim_login() -> Dictionary:
	if not can_claim_login():
		return {}
	var reward: Dictionary = login_rewards()[login_index()]
	login_claimed += 1
	login_day = today()
	changed.emit()
	return reward


# --- Daily quests --------------------------------------------------------------

## Picks today's quests if the day changed. `counters` are the game's lifetime
## counters; `town_hall` filters quests by "unlock_town_hall".
func refresh(counters: Dictionary, town_hall: int) -> void:
	if quest_day == today():
		return
	quest_day = today()
	quest_base = counters.duplicate()
	quest_claimed = []
	bonus_claimed = false
	var pool: Array = content.list("daily_quests").filter(func(q): return town_hall >= int(q.get("unlock_town_hall", 1)))
	var rng := RandomNumberGenerator.new()
	rng.seed = hash(quest_day)
	quest_ids = []
	var count := int(content.setting("daily_quests", {}).get("per_day", 3))
	while not pool.is_empty() and quest_ids.size() < count:
		var q: Dictionary = pool.pop_at(rng.randi_range(0, pool.size() - 1))
		# One quest per counter, so a day doesn't ask for the same thing twice.
		if quest_ids.any(func(id): return content.entry("daily_quests", id).get("counter") == q.counter):
			continue
		quest_ids.append(q.id)
	changed.emit()


func quests() -> Array:
	return quest_ids.map(func(id): return content.entry("daily_quests", id)).filter(func(q): return not q.is_empty())


## [have, need] for a daily quest.
func progress(q: Dictionary, counters: Dictionary) -> Array:
	var have := int(counters.get(str(q.counter), 0)) - int(quest_base.get(str(q.counter), 0))
	return [mini(have, int(q.get("count", 1))), int(q.get("count", 1))]


func is_done(q: Dictionary, counters: Dictionary) -> bool:
	var p := progress(q, counters)
	return int(p[0]) >= int(p[1])


func can_claim(q: Dictionary, counters: Dictionary) -> bool:
	return q.id in quest_ids and not q.id in quest_claimed and is_done(q, counters)


func claim(id: String, counters: Dictionary) -> Dictionary:
	var q: Dictionary = content.entry("daily_quests", id)
	if q.is_empty() or not can_claim(q, counters):
		return {}
	quest_claimed.append(id)
	changed.emit()
	return q.get("reward", {})


## The extra reward for finishing every daily quest (config daily_quests.bonus).
func bonus() -> Dictionary:
	return content.setting("daily_quests", {}).get("bonus", {})


func can_claim_bonus() -> bool:
	return not bonus_claimed and not quest_ids.is_empty() and quest_claimed.size() >= quest_ids.size()


func claim_bonus() -> Dictionary:
	if not can_claim_bonus():
		return {}
	bonus_claimed = true
	changed.emit()
	return bonus()


## Things the player can collect right now (for a badge on the button).
func ready_count(counters: Dictionary) -> int:
	var n := 1 if can_claim_login() else 0
	for q in quests():
		if can_claim(q, counters):
			n += 1
	return n + (1 if can_claim_bonus() else 0)


# --- Saving --------------------------------------------------------------------

func to_dict() -> Dictionary:
	return {
		"login_day": login_day, "login_claimed": login_claimed,
		"quest_day": quest_day, "quest_ids": quest_ids.duplicate(), "quest_base": quest_base.duplicate(),
		"quest_claimed": quest_claimed.duplicate(), "bonus_claimed": bonus_claimed,
	}


func from_dict(data: Dictionary) -> void:
	login_day = int(data.get("login_day", -1))
	login_claimed = int(data.get("login_claimed", 0))
	quest_day = int(data.get("quest_day", -1))
	quest_ids = Array(data.get("quest_ids", [])).filter(func(id): return content.has_entry("daily_quests", str(id)))
	quest_base = data.get("quest_base", {})
	quest_claimed = data.get("quest_claimed", [])
	bonus_claimed = bool(data.get("bonus_claimed", false))
