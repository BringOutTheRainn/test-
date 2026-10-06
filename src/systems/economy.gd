extends RefCounted
## Pricing rules shared by every system. All numbers come from the "skip"
## block in data/config/game.json.


## Gems needed to finish a timer now. The last few minutes are free; the first
## hour costs a fixed rate per minute, and later minutes get cheaper so a full
## day costs "gems_for_24_hours".
static func skip_cost(seconds_left: float, cfg: Dictionary) -> int:
	var free_seconds := float(cfg.get("free_seconds", 300))
	if seconds_left <= free_seconds:
		return 0
	var per_minute := float(cfg.get("gems_per_minute_first_hour", 1))
	var day_cost := float(cfg.get("gems_for_24_hours", 500))
	var minutes := ceilf(seconds_left / 60.0)
	if minutes <= 60.0:
		return int(ceilf(minutes * per_minute))
	var first_hour := 60.0 * per_minute
	var later_rate := maxf(day_cost - first_hour, 0.0) / (24.0 * 60.0 - 60.0)
	return int(ceilf(first_hour + (minutes - 60.0) * later_rate))
