extends RefCounted
## Real-money purchases, behind one small interface.
##
## There is no Google Play or App Store billing yet, so this runs in test
## mode: every purchase succeeds at once and nothing is charged. The shop
## screen says so. Adding real billing later means a backend here (a Play
## Billing plugin on Android, StoreKit on iOS) that calls `done` when the
## platform confirms the payment; the rest of the game stays the same.

## Emitted for every finished purchase: (offer id, success).
signal purchased(offer_id: String, success: bool)


func test_mode() -> bool:
	return true


## Starts buying an offer. Calls `done.call(success: bool)` when finished.
func purchase(offer_id: String, done: Callable) -> void:
	purchased.emit(offer_id, true)
	done.call(true)
