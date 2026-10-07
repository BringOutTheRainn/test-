extends VBoxContainer
## Shop screen: offers from data/shop, grouped by config shop.sections.
## Real-money offers ask for confirmation first; while the store is in test
## mode (no billing yet) the screen says nothing is charged.

const UI := preload("res://src/ui/ui_kit.gd")
const Sprites := preload("res://src/ui/sprites.gd")

var _body: VBoxContainer


func setup(_args: Dictionary) -> void:
	pass


func _ready() -> void:
	size_flags_vertical = Control.SIZE_EXPAND_FILL
	add_theme_constant_override("separation", 10)
	add_child(UI.header("Shop"))
	_body = UI.scroll_body(self)
	EventBus.shop_changed.connect(_rebuild)
	EventBus.resources_changed.connect(_rebuild_soon)
	_rebuild()


var _pending := false


## Resources change often (production); rebuild at most once a frame.
func _rebuild_soon() -> void:
	if not _pending:
		_pending = true
		_rebuild.call_deferred()


func _rebuild() -> void:
	_pending = false
	if not is_inside_tree():
		return
	UI.clear(_body)
	if Game.store.test_mode():
		var note := UI.panel("parchment")
		var l := UI.label("Test build: purchases are free and nothing is charged.", UI.SMALL, Color("#3e2731"))
		l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0))
		note.add_child(l)
		_body.add_child(note)
	var th: int = Game.city.town_hall_level()
	for section in Content.setting("shop", {}).get("sections", []):
		var offers: Array = Game.shop.offers().filter(func(o): return str(o.get("section", "")) == str(section.id) and Game.shop.is_visible(o, th))
		if offers.is_empty():
			continue
		_body.add_child(UI.label(str(section.get("name", section.id)), UI.FONT_SIZE, UI.ACCENT))
		if section.id == "gems":
			_add_gem_grid(offers)
		else:
			for o in offers:
				_body.add_child(_offer_row(o))


## Gem packs as a 3-column grid of tiles, like most mobile shops.
func _add_gem_grid(offers: Array) -> void:
	var grid := GridContainer.new()
	grid.columns = 3
	grid.add_theme_constant_override("h_separation", 8)
	grid.add_theme_constant_override("v_separation", 8)
	_body.add_child(grid)
	for o in offers:
		var offer_id: String = o.id
		var tile := Button.new()
		tile.custom_minimum_size = Vector2(200, 230)
		tile.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		tile.pressed.connect(func(): _buy(offer_id))
		grid.add_child(tile)
		var column := VBoxContainer.new()
		column.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		column.offset_top = 10
		column.offset_bottom = -10
		column.alignment = BoxContainer.ALIGNMENT_CENTER
		column.mouse_filter = Control.MOUSE_FILTER_IGNORE
		tile.add_child(column)
		var tag := _centered(UI.label(str(o.get("tag", " ")), UI.SMALL, UI.GOOD))
		column.add_child(tag)
		var tex := _icon(o)
		if tex != null:
			var icon := UI.icon_rect(tex, 84)
			icon.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
			column.add_child(icon)
		var amount := UI.amounts_row(o.get("grant", {}), Content, UI.FONT_SIZE, UI.ENERGY)
		amount.alignment = BoxContainer.ALIGNMENT_CENTER
		column.add_child(amount)
		column.add_child(_centered(UI.label(_price(o), UI.FONT_SIZE, UI.ACCENT)))


## A wide card: icon, name, what it gives, and a price button.
func _offer_row(o: Dictionary) -> PanelContainer:
	var card := UI.panel("dark")
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 12)
	card.add_child(row)
	var tex := _icon(o)
	if tex != null:
		row.add_child(UI.icon_rect(tex, 80))
	var column := VBoxContainer.new()
	column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	column.add_theme_constant_override("separation", 2)
	row.add_child(column)
	var title := str(o.get("name", o.id))
	if o.has("tag"):
		title += "  -  " + str(o.tag)
	column.add_child(UI.label(title, UI.FONT_SIZE, UI.TEXT))
	if o.has("description"):
		column.add_child(UI.label(str(o.description), UI.SMALL, UI.MUTED))
	if not o.get("grant", {}).is_empty():
		column.add_child(UI.amounts_row(o.grant, Content, UI.SMALL, UI.ACCENT))
	if o.id == "monthly_card" and Game.shop.card_active(Game.daily.today()):
		column.add_child(UI.label("Active: %d days left" % Game.shop.card_days_left(Game.daily.today()), UI.SMALL, UI.GOOD))
	var offer_id: String = o.id
	var reason: String = Game.shop.can_buy(offer_id)
	var price := Button.new()
	price.custom_minimum_size = Vector2(150, 80)
	price.disabled = reason != ""
	price.pressed.connect(func(): _buy(offer_id))
	if Game.shop.is_real_money(o):
		price.text = _price(o)
		UI.style_button(price, "primary")
	else:
		var cost := UI.amounts_row(o.get("cost", {}), Content, UI.FONT_SIZE)
		cost.alignment = BoxContainer.ALIGNMENT_CENTER
		cost.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		price.add_child(cost)
	row.add_child(price)
	return card


func _buy(offer_id: String) -> void:
	var o: Dictionary = Game.shop.offer(offer_id)
	if not Game.shop.is_real_money(o):
		Game.buy_offer(offer_id)
		return
	var dialog := ConfirmationDialog.new()
	dialog.dialog_text = "Buy %s for %s?" % [o.get("name", offer_id), _price(o)]
	if Game.store.test_mode():
		dialog.dialog_text += "\n(Test build: nothing is charged.)"
	dialog.ok_button_text = "Buy"
	dialog.confirmed.connect(func(): Game.buy_offer(offer_id))
	add_child(dialog)
	dialog.popup_centered()


func _price(o: Dictionary) -> String:
	if Game.shop.is_real_money(o):
		return "$%.2f" % float(o.price_usd)
	return UI.format_amounts(o.get("cost", {}), Content)


## The offer's picture (art/shop/<id>.png or "sprite"), else the icon of
## the first resource it gives.
func _icon(o: Dictionary) -> Texture2D:
	var tex := Sprites.for_entry("shop", o)
	if tex == null:
		for res in o.get("grant", {}):
			return UI.resource_icon(res, Content)
	return tex


func _centered(l: Label) -> Label:
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.autowrap_mode = TextServer.AUTOWRAP_OFF
	return l
