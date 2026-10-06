extends Node
## Loads every piece of game content from JSON files.
##
## Each content type is a folder (data/buildings, data/heroes, ...) and each
## file in it is one entry with a unique "id". Adding a building or hero means
## adding a file, not writing code.
##
## Content packs live in res://packs/<name>/ or user://packs/<name>/ and use the
## same layout. They load after the base data, in name order, and an entry with
## an existing id replaces the earlier one, so a pack can add or rebalance content.

const TYPES := ["resources", "buildings", "heroes", "skills", "enemies", "dungeons", "stats", "items", "quests"]
const BASE_ROOT := "res://data"
const PACK_ROOTS := ["res://packs", "user://packs"]

var config: Dictionary = {}
var _db: Dictionary = {}


func _init() -> void:
	reload()


## Reloads all content. Pass explicit roots to load a custom set (used by tests).
func reload(roots: Array = []) -> void:
	config = {}
	_db = {}
	for type in TYPES:
		_db[type] = {}
	if roots.is_empty():
		roots = content_roots()
	for root in roots:
		_load_root(root)


static func content_roots() -> Array:
	var roots := [BASE_ROOT]
	for pack_root in PACK_ROOTS:
		if not DirAccess.dir_exists_absolute(pack_root):
			continue
		var packs := Array(DirAccess.get_directories_at(pack_root))
		packs.sort()
		for pack in packs:
			roots.append(pack_root.path_join(pack))
	return roots


## Returns one entry, or an empty Dictionary if it does not exist.
func entry(type: String, id: String) -> Dictionary:
	return _db.get(type, {}).get(id, {})


func has_entry(type: String, id: String) -> bool:
	return _db.get(type, {}).has(id)


## Returns every entry of a type, sorted by "order" then id.
func list(type: String) -> Array:
	var items: Array = _db.get(type, {}).values()
	items.sort_custom(func(a, b):
		var oa = a.get("order", 1000)
		var ob = b.get("order", 1000)
		if oa == ob:
			return str(a.id) < str(b.id)
		return oa < ob)
	return items


func setting(key: String, default = null):
	return config.get(key, default)


func _load_root(root: String) -> void:
	var cfg = _read_json(root.path_join("config/game.json"))
	if cfg is Dictionary:
		config.merge(cfg, true)
	for type in TYPES:
		var folder := root.path_join(type)
		if not DirAccess.dir_exists_absolute(folder):
			continue
		var files := Array(DirAccess.get_files_at(folder))
		files.sort()
		for file in files:
			if not str(file).ends_with(".json"):
				continue
			var path := folder.path_join(file)
			var data = _read_json(path)
			if data is Dictionary and data.has("id"):
				_db[type][str(data.id)] = data
			else:
				push_error("Content file has no id: %s" % path)


static func _read_json(path: String):
	if not FileAccess.file_exists(path):
		return null
	var text := FileAccess.get_file_as_string(path)
	var json := JSON.new()
	if json.parse(text) != OK:
		push_error("Invalid JSON in %s line %d: %s" % [path, json.get_error_line(), json.get_error_message()])
		return null
	return json.data
