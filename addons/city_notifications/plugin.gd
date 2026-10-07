@tool
extends EditorPlugin
## Adds the notifications AAR to Android exports. The AAR is built from
## plugins/android-notifications by the Android workflow and copied to
## bin/city-notifications.aar; without it, exports simply leave it out.

var _export: AndroidExport


func _enter_tree() -> void:
	_export = AndroidExport.new()
	add_export_plugin(_export)


func _exit_tree() -> void:
	remove_export_plugin(_export)
	_export = null


class AndroidExport extends EditorExportPlugin:
	const AAR := "city_notifications/bin/city-notifications.aar"

	func _get_name() -> String:
		return "CityNotifications"

	func _supports_platform(platform: EditorExportPlatform) -> bool:
		return platform is EditorExportPlatformAndroid

	func _get_android_libraries(_platform: EditorExportPlatform, _debug: bool) -> PackedStringArray:
		if FileAccess.file_exists("res://addons/" + AAR):
			return PackedStringArray([AAR])
		return PackedStringArray()
