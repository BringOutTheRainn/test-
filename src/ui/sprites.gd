extends RefCounted
## Finds the picture for a piece of content. A data entry can name its image
## with a "sprite" path; without one the game looks for art/<type>/<id>.png.
## Content with no image keeps its placeholder (a colored block), so art can
## be added one file at a time.
##
## Imported textures are used when the project has been imported (the editor,
## CI and exported builds). From a fresh clone the PNG is read directly, so the
## game still shows art without opening the editor.

const ART_ROOT := "res://art"

static var _cache: Dictionary = {}


## The texture for a content entry, or null if it has none.
static func for_entry(type: String, def: Dictionary) -> Texture2D:
	var path := str(def.get("sprite", ""))
	if path == "":
		path = ART_ROOT.path_join(type).path_join(str(def.get("id", "")) + ".png")
	return load_texture(path)


static func load_texture(path: String) -> Texture2D:
	if _cache.has(path):
		return _cache[path]
	var tex: Texture2D = null
	if ResourceLoader.exists(path, "Texture2D"):
		tex = ResourceLoader.load(path, "Texture2D")
	elif FileAccess.file_exists(path):
		var image := Image.load_from_file(path)
		if image != null and not image.is_empty():
			tex = ImageTexture.create_from_image(image)
	_cache[path] = tex
	return tex


## Largest rect with the texture's aspect ratio that fits inside "area",
## anchored to the bottom so buildings and characters stand on their tile.
static func fit_bottom(tex: Texture2D, area: Rect2) -> Rect2:
	var tex_size := tex.get_size()
	var scale := minf(area.size.x / tex_size.x, area.size.y / tex_size.y)
	var size := (tex_size * scale).floor()
	var pos := Vector2(area.position.x + (area.size.x - size.x) / 2.0, area.end.y - size.y)
	return Rect2(pos.floor(), size)
