extends VBoxContainer
## Daily screen: the 7-day login reward track, today's three quests and the
## bonus for finishing all of them. Rewards and quests come from config
## "daily_login", data/daily_quests and config "daily_quests".

const UI := preload("res://src/ui/ui_kit.gd")

var _body: VBoxContainer


func setup(_args: Dictionary) -> void:
	pass


func _ready() -> void:
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_theme_constant_override("separation", 10)
	add_child(UI.header("Daily"))
	_body = UI.scroll_body(self)
	EventBus.daily_changed.connect(_rebuild)
	EventBus.quests_changed.connect(_rebuild)
	EventBus.shop_changed.connect(_rebuild)
	Game.daily.refresh(Game.counters, Game.city.town_hall_level())
	_rebuild()


func _rebuild() -> void:
	if not is_inside_tree():
		return
	UI.clear(_body)
	_show_login()
	_show_card()
	_show_quests()


func _show_login() -> void:
	var daily = Game.daily
	_body.add_child(UI.label("Login reward", UI.FONT_SIZE, UI.ACCENT))
	var grid := GridContainer.new()
	grid.columns = 4
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	_body.add_child(grid)
	var rewards: Array = daily.login_rewards()
	var next: int = daily.login_index()
	var ready: bool = daily.can_claim_login()
	# Days before `next` in this cycle are collected; `next` is today's (or tomorrow's).
	for i in rewards.size():
		var kind := "dark"
		if i < next:
			kind = "disabled"
		elif i == next:
			kind = "selected" if ready else "panel"
		var cell := UI.panel(kind)
		cell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		cell.custom_minimum_size = Vector2(150, 150)
		grid.add_child(cell)
		var column := VBoxContainer.new()
		column.alignment = BoxContainer.ALIGNMENT_CENTER
		cell.add_child(column)
		var day := UI.label("Day %d" % (i + 1), UI.SMALL, UI.MUTED if i != next else UI.TEXT)
		day.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		column.add_child(day)
		if i < next:
			var got := UI.label("Got it", UI.SMALL, UI.GOOD)
			got.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
			column.add_child(got)
		else:
			# One amount per line so every day's cell is the same width.
			for res in rewards[i]:
				var row := UI.amounts_row({res: rewards[i][res]}, Content, UI.SMALL, UI.TEXT if kind == "selected" else UI.ACCENT)
				row.alignment = BoxContainer.ALIGNMENT_CENTER
				column.add_child(row)
	var claim := UI.button("Collect today's reward" if ready else "Come back tomorrow", func():
		var reward: Dictionary = Game.claim_login_reward()
		if not reward.is_empty():
			EventBus.toast.emit("Collected: " + UI.format_amounts(reward, Content)), 80, "primary" if ready else "button")
	claim.disabled = not ready
	_body.add_child(claim)


## The monthly card's daily gems, while it's active.
func _show_card() -> void:
	var today: int = Game.daily.today()
	if not Game.shop.card_active(today):
		return
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	_body.add_child(row)
	var l := UI.label("Monthly card: %d days left" % Game.shop.card_days_left(today), UI.FONT_SIZE, UI.ENERGY)
	l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(l)
	if Game.shop.can_claim_card(today):
		var b := UI.button("Collect", func():
			Game.claim_card()
			_rebuild(), 72, "selected")
		b.custom_minimum_size.x = 150
		row.add_child(b)
	else:
		row.add_child(UI.label("Collected", UI.SMALL, UI.GOOD))


func _show_quests() -> void:
	var daily = Game.daily
	var counters: Dictionary = Game.counters
	_body.add_child(UI.label("Today's quests", UI.FONT_SIZE, UI.ACCENT))
	for q in daily.quests():
		var p: Array = daily.progress(q, counters)
		var claimed: bool = q.id in daily.quest_claimed
		var done: bool = daily.is_done(q, counters)
		var card := UI.panel("primary" if done and not claimed else "dark")
		_body.add_child(card)
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)
		card.add_child(row)
		var column := VBoxContainer.new()
		column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(column)
		column.add_child(UI.label("%s  %d/%d" % [q.text, int(p[0]), int(p[1])], UI.FONT_SIZE))
		column.add_child(UI.amounts_row(q.get("reward", {}), Content, UI.SMALL, UI.ACCENT))
		if claimed:
			var got := UI.label("Done", UI.FONT_SIZE, UI.GOOD)
			got.autowrap_mode = TextServer.AUTOWRAP_OFF
			row.add_child(got)
		elif done:
			var quest_id: String = q.id
			var b := UI.button("Claim", func(): Game.claim_daily_quest(quest_id), 72, "selected")
			b.custom_minimum_size.x = 140
			row.add_child(b)
	var bonus: Dictionary = daily.bonus()
	if not bonus.is_empty():
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 10)
		_body.add_child(row)
		var l := UI.label("Finish all three for a bonus:", UI.SMALL, UI.MUTED)
		l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(l)
		row.add_child(UI.amounts_row(bonus, Content, UI.SMALL, UI.ACCENT))
		if daily.can_claim_bonus():
			_body.add_child(UI.button("Claim the bonus", func(): Game.claim_daily_bonus(), 72, "selected"))
		elif daily.bonus_claimed:
			_body.add_child(UI.label("Bonus collected. New quests tomorrow!", UI.SMALL, UI.GOOD))
