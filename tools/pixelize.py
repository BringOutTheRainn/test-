#!/usr/bin/env python3
"""Turn an AI-generated "pixel art" image into a clean game sprite.

AI images only look like pixel art: their pixels are blurry, uneven and use
thousands of colors. This script:
  1. removes the flat background (generate on solid magenta #FF00FF),
  2. crops to the subject,
  3. shrinks it to a real pixel grid (--size pixels on the longest side),
  4. snaps every pixel to the game palette (art/palette.hex) with no blending,
  5. makes alpha fully on or off.

Usage:
  python3 tools/pixelize.py INPUT.png OUTPUT.png --size 64
  python3 tools/pixelize.py INPUT.png OUTPUT.png --size 48 --preview preview.png

Needs Pillow (python3 -m pip install pillow).
"""
import argparse
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_PALETTE = ROOT / "art" / "palette.hex"


def load_palette(path):
    colors = []
    for line in Path(path).read_text().split():
        line = line.strip().lstrip("#")
        if line:
            colors.append(tuple(int(line[i:i + 2], 16) for i in (0, 2, 4)))
    return colors


def is_key(rgb, key, tolerance):
    r, g, b = rgb
    if sum((a - c) ** 2 for a, c in zip(rgb, key)) <= tolerance ** 2:
        return True
    # Magenta-ish pixels are never part of the art.
    return key == (255, 0, 255) and r > 170 and b > 170 and g < 110


def remove_background(img, tolerance):
    """Flood fill from the border, clearing anything close to the corner color."""
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    corners = [px[0, 0][:3], px[w - 1, 0][:3], px[0, h - 1][:3], px[w - 1, h - 1][:3]]
    key = tuple(sorted(c[i] for c in corners)[1] for i in range(3))
    if sum(abs(a - b) for a, b in zip(key, (255, 0, 255))) < 120:
        key = (255, 0, 255)
    seen = bytearray(w * h)
    queue = deque()
    for x in range(w):
        queue.extend([(x, 0), (x, h - 1)])
    for y in range(h):
        queue.extend([(0, y), (w - 1, y)])
    while queue:
        x, y = queue.popleft()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        if not is_key(px[x, y][:3], key, tolerance):
            continue
        px[x, y] = (0, 0, 0, 0)
        if x > 0: queue.append((x - 1, y))
        if x < w - 1: queue.append((x + 1, y))
        if y > 0: queue.append((x, y - 1))
        if y < h - 1: queue.append((x, y + 1))
    # Enclosed pockets of background (between legs, under arms).
    for y in range(h):
        for x in range(w):
            if px[x, y][3] and is_key(px[x, y][:3], key, tolerance):
                px[x, y] = (0, 0, 0, 0)
    return img


def nearest(rgb, palette):
    return min(palette, key=lambda p: (p[0] - rgb[0]) ** 2 + (p[1] - rgb[1]) ** 2 + (p[2] - rgb[2]) ** 2)


def pixelize(img, size, palette, tolerance=60):
    img = remove_background(img, tolerance)
    bbox = img.getbbox()
    if bbox is None:
        raise SystemExit("Image is empty after removing the background")
    img = img.crop(bbox)
    scale = size / max(img.size)
    small = (max(1, round(img.width * scale)), max(1, round(img.height * scale)))
    # BOX averages each block; fully transparent pixels must not darken edges,
    # so premultiply before shrinking.
    small_img = img.convert("RGBa").resize(small, Image.BOX).convert("RGBA")
    out = Image.new("RGBA", small)
    src, dst = small_img.load(), out.load()
    cache = {}
    for y in range(small[1]):
        for x in range(small[0]):
            r, g, b, a = src[x, y]
            if a < 128:
                continue
            rgb = (r, g, b)
            if rgb not in cache:
                cache[rgb] = nearest(rgb, palette)
            dst[x, y] = cache[rgb] + (255,)
    return out


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("input")
    parser.add_argument("output")
    parser.add_argument("--size", type=int, default=64, help="pixels on the longest side (default 64)")
    parser.add_argument("--palette", default=str(DEFAULT_PALETTE))
    parser.add_argument("--tolerance", type=int, default=60, help="background color tolerance (default 60)")
    parser.add_argument("--preview", help="also write an 8x enlarged copy for checking by eye")
    args = parser.parse_args()

    out = pixelize(Image.open(args.input), args.size, load_palette(args.palette), args.tolerance)
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    out.save(args.output)
    if args.preview:
        out.resize((out.width * 8, out.height * 8), Image.NEAREST).save(args.preview)
    print(f"{args.output}: {out.width}x{out.height}, {len({c for c in out.get_flattened_data() if c[3]} if hasattr(out, "get_flattened_data") else {c for c in out.getdata() if c[3]})} colors")


if __name__ == "__main__":
    main()
