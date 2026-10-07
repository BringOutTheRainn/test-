extends RefCounted
## The shop, with no UI. Offers are data (data/shop), each paid one of two
## ways:
##   "price_usd": 4.99         real money, through the store (src/platform/store.gd)
##   "cost": {"gems": 500}     resources the player already has
## and giving any mix of:
##   "grant": {"gems": 500, "wood": 1000}   resources
##   "builders": 1                          a permanent extra builder
##   "items": ["iron_sword"]                items (data/items)
##   "card_days": 30                        the monthly card: config shop.card_daily gems a day
## Pictures are art/shop/<id>.png (or a "sprite" path).
## "limit": n caps how many times an offer can be bought (1 = one time only),
## "requires": offer id hides an offer until that one is bought, and
## "unlock_town_hall" hides it until the Town Hall level.
## It also prices "fill missing resources" in gems (config shop.gem_value).

signal changed

var content
var inventory
## Offer id -> times bought.
var bought: Dictionary = {}
## Monthly card: last day it pays (day numbers from Daily.today()), and the
## last day it was collected.
var card_until := -1
var card_claimed := -1


func setup(content_db, inv) -> void:
	content = content_db
	inventory = inv


func offers() -> Array:
	return content.list("shop")


func offer(id: String) -> Dictionary:
	return content.entry("shop", id)


func times_bought(id: String) -> int:
	return int(bought.get(id, 0))


func is_real_money(o: Dictionary) -> bool:
	return o.has("price_usd")


## Whether the offer is listed right now.
func is_visible(o: Dictionary, town_hall: int) -> bool:
	if town_hall < int(o.get("unlock_town_hall", 1)):
		return false
	if o.has("requires") and times_bought(str(o.requires)) <= 0:
		return false
	return not (o.has("limit") and times_bought(o.id) >= int(o.limit))


## Why the offer can't be bought now, or "".
func can_buy(id: String) -> String:
	var o := offer(id)
	if o.is_empty():
		return "Unknown offer"
	if o.has("limit") and times_bought(id) >= int(o.limit):
		return "Already bought"
	if o.has("requires") and times_bought(str(o.requires)) <= 0:
		return "Not available yet"
	if not is_real_money(o) and not inventory.can_afford(o.get("cost", {})):
		return "Not enough gems" if o.get("cost", {}).has("gems") else "Not enough resources"
	return ""


## Pays an in-game cost (real-money offers are paid by the store first) and
## records the purchase. Returns the offer, whose grants the game applies.
func pay(id: String) -> Dictionary:
	if can_buy(id) != "":
		return {}
	var o := offer(id)
	if not is_real_money(o):
		inventory.spend(o.get("cost", {}))
	bought[id] = times_bought(id) + 1
	changed.emit()
	return o


# --- Monthly card ----------------------------------------------------------------

func start_card(today: int, days: int) -> void:
	card_until = maxi(card_until, today - 1) + days
	changed.emit()


func card_active(today: int) -> bool:
	return today <= card_until


func card_days_left(today: int) -> int:
	return maxi(0, card_until - today + 1)


func can_claim_card(today: int) -> bool:
	return card_active(today) and card_claimed < today


func claim_card(today: int) -> Dictionary:
	if not can_claim_card(today):
		return {}
	card_claimed = today
	changed.emit()
	return {"gems": int(content.setting("shop", {}).get("card_daily", 100))}


# --- Filling missing resources ---------------------------------------------------

## Gems to buy what's missing for a cost. Priced a little worse than waiting,
## per the design doc, by config shop.gem_value (gems per 100 of a resource).
func missing_gems(cost: Dictionary) -> int:
	var values: Dictionary = content.setting("shop", {}).get("gem_value", {})
	var missing: Dictionary = inventory.missing(cost)
	if missing.has("gems") or missing.is_empty():
		return 0
	var total := 0.0
	for res in missing:
		if not values.has(res):
			return 0
		total += float(missing[res]) * float(values[res]) / 100.0
	return maxi(1, ceili(total))


# --- Saving ----------------------------------------------------------------------

func to_dict() -> Dictionary:
	return {"bought": bought.duplicate(), "card_until": card_until, "card_claimed": card_claimed}


func from_dict(data: Dictionary) -> void:
	bought = data.get("bought", {}).duplicate()
	card_until = int(data.get("card_until", -1))
	card_claimed = int(data.get("card_claimed", -1))
