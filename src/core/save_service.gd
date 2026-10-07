extends RefCounted
## Versioned save files. Every save carries a version number, and loading runs
## each migration step in order, so an update never wipes a player's progress.
## When the save format changes: bump CURRENT_VERSION and add a step to _migrate_step.

const CURRENT_VERSION := 2
const DEFAULT_PATH := "user://save.json"


static func write(data: Dictionary, path: String = DEFAULT_PATH) -> bool:
	data["version"] = CURRENT_VERSION
	var tmp := path + ".tmp"
	var file := FileAccess.open(tmp, FileAccess.WRITE)
	if file == null:
		push_error("Could not write save: %s" % error_string(FileAccess.get_open_error()))
		return false
	file.store_string(JSON.stringify(data, "\t"))
	file.close()
	# Write to a temp file first so a crash mid-save cannot corrupt the old save.
	return DirAccess.rename_absolute(tmp, path) == OK


## Returns the migrated save, or {} when there is none or it cannot be read.
static func read(path: String = DEFAULT_PATH) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not parsed is Dictionary:
		push_error("Save file is corrupt: %s" % path)
		return {}
	return migrate(parsed)


static func migrate(data: Dictionary) -> Dictionary:
	var version := int(data.get("version", 0))
	if version > CURRENT_VERSION:
		push_warning("Save is from a newer version (%d); loading what we can." % version)
		return data
	while version < CURRENT_VERSION:
		data = _migrate_step(version, data)
		version += 1
		data["version"] = version
	return data


static func delete(path: String = DEFAULT_PATH) -> void:
	if FileAccess.file_exists(path):
		DirAccess.remove_absolute(path)


static func _migrate_step(from_version: int, data: Dictionary) -> Dictionary:
	match from_version:
		0:
			# Unversioned saves from before the format existed share v1's layout.
			pass
		1:
			# v2 adds "roster" (hero levels, XP, gear and items). Without it the
			# game builds a fresh roster from the party, so nothing to change here.
			pass
	return data
