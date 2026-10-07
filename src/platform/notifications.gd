extends RefCounted
## Local notifications on the phone, behind one small interface so the game
## never talks to a platform API directly.
##
## On Android this calls the CityNotifications plugin (android/plugin, built
## by the Android workflow). Anywhere the plugin is missing (desktop, tests,
## iOS until it has its own plugin) every call quietly does nothing, so the
## rest of the game doesn't need to care.

const SINGLETON := "CityNotifications"

var _plugin: Object


func _init() -> void:
	if Engine.has_singleton(SINGLETON):
		_plugin = Engine.get_singleton(SINGLETON)


func available() -> bool:
	return _plugin != null


## Shows the system "allow notifications?" prompt (Android 13 and newer).
func request_permission() -> void:
	if _plugin != null:
		_plugin.requestPermission()


func has_permission() -> bool:
	return _plugin != null and bool(_plugin.hasPermission())


## Schedules one notification `seconds` from now. Reusing an id replaces it.
func schedule(id: int, title: String, text: String, seconds: float) -> void:
	if _plugin != null:
		_plugin.schedule(id, title, text, maxi(1, roundi(seconds)))


func cancel_all() -> void:
	if _plugin != null:
		_plugin.cancelAll()
