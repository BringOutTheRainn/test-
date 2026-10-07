extends Node
## Global signal hub. Systems emit here and UI listens, so neither needs a
## direct reference to the other. Add new signals here as systems grow.

signal resources_changed
signal building_changed(building: Dictionary)
signal timer_started(timer: Dictionary)
signal timer_finished(timer: Dictionary)
signal dungeon_finished(result: Dictionary)
signal heroes_changed(hero_id: String)
signal quests_changed
## A lifetime counter went up (Game.count), e.g. "fights_won".
signal counted(counter: String, amount: int)
## Login reward or daily quests changed (claimed, or a new day).
signal daily_changed
## Something was bought, or the monthly card was collected.
signal shop_changed
signal toast(message: String)
signal screen_requested(screen: String, args: Dictionary)
