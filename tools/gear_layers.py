#!/usr/bin/env python3
"""Cut paper-doll gear layers out of AI edits of one base hero sprite.

Every hero uses the same body (art/heroes/body.png) and each piece of gear is
a see-through layer of the same size drawn on top of it. To make a layer:
  1. generate the plain body on solid magenta (the base image),
  2. ask the image model to edit that image so the body wears or holds the
     item, keeping pose and framing,
  3. run this script: it crops both images with the same box, shrinks them
     the same way, and keeps only the pixels the edit changed.

Usage:
  python3 tools/gear_layers.py BASE.png --body art/heroes/body.png \
      EDIT.png:art/gear/iron_plate.png EDIT2.png:art/gear/iron_sword.png

Needs Pillow (python3 -m pip install pillow).
"""
import argparse
from collections import deque
from pathlib import Path

from PIL import Image

from pixelize import DEFAULT_PALETTE, despeckle, limit_colors, load_palette, nearest, remove_background

# Output canvas in pixels, and how tall the body is inside it. The extra room
# is for weapons, hats and capes that stick out past the body.
CANVAS = 80
BODY_HEIGHT = 60


def crop_box(base):
    """A square box around the base body, with the feet near the bottom."""
    left, top, right, bottom = base.getbbox()
    side = (bottom - top) * CANVAS / BODY_HEIGHT
    cx = (left + right) / 2
    bottom_pad = side * 0.04
    return (round(cx - side / 2), round(bottom + bottom_pad - side), round(cx + side / 2), round(bottom + bottom_pad))


def shrink(img, box, palette):
    """Crop to box (padding with transparency), shrink to CANVAS and snap to the palette."""
    img = img.crop(box)
    small = img.convert("RGBa").resize((CANVAS, CANVAS), Image.BOX).convert("RGBA")
    out = Image.new("RGBA", small.size)
    src, dst = small.load(), out.load()
    cache = {}
    for y in range(CANVAS):
        for x in range(CANVAS):
            r, g, b, a = src[x, y]
            if a < 128:
                continue
            if (r, g, b) not in cache:
                cache[(r, g, b)] = nearest((r, g, b), palette)
            dst[x, y] = cache[(r, g, b)] + (255,)
    return out


def distance(a, b):
    return sum((x - y) ** 2 for x, y in zip(a[:3], b[:3])) ** 0.5


def drop_small_parts(img, min_size):
    """Remove groups of fewer than min_size touching pixels (diff noise)."""
    px = img.load()
    w, h = img.size
    seen = set()
    for y in range(h):
        for x in range(w):
            if not px[x, y][3] or (x, y) in seen:
                continue
            group, queue = [], deque([(x, y)])
            seen.add((x, y))
            while queue:
                cx, cy = queue.popleft()
                group.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and px[nx, ny][3]:
                        seen.add((nx, ny))
                        queue.append((nx, ny))
            if len(group) < min_size:
                for p in group:
                    px[p] = (0, 0, 0, 0)
    return img


def layer(base_small, edit_small, threshold, min_size, max_colors):
    out = Image.new("RGBA", edit_small.size)
    b, e, o = base_small.load(), edit_small.load(), out.load()
    for y in range(CANVAS):
        for x in range(CANVAS):
            if not e[x, y][3]:
                continue
            if not b[x, y][3] or distance(b[x, y], e[x, y]) > threshold:
                o[x, y] = e[x, y]
    out = drop_small_parts(out, min_size)
    return limit_colors(out, max_colors) if max_colors else out


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("base")
    parser.add_argument("pairs", nargs="*", help="EDIT.png:OUTPUT.png")
    parser.add_argument("--body", help="where to write the plain body sprite")
    parser.add_argument("--palette", default=str(DEFAULT_PALETTE))
    parser.add_argument("--threshold", type=float, default=40, help="color change that counts as gear (default 40)")
    parser.add_argument("--min-size", type=int, default=4, help="smallest group of pixels kept (default 4)")
    parser.add_argument("--max-colors", type=int, default=12)
    parser.add_argument("--preview", help="write the body with every layer on top, 6x, for checking")
    args = parser.parse_args()

    palette = load_palette(args.palette)
    base = remove_background(Image.open(args.base), 60)
    box = crop_box(base)
    base_small = shrink(base, box, palette)
    body = despeckle(limit_colors(base_small.copy(), 20))
    if args.body:
        Path(args.body).parent.mkdir(parents=True, exist_ok=True)
        body.save(args.body)
        print(f"{args.body}: {CANVAS}x{CANVAS}")
    previews = []
    for pair in args.pairs:
        src, dst = pair.split(":")
        edit_small = shrink(remove_background(Image.open(src), 60), box, palette)
        out = layer(base_small, edit_small, args.threshold, args.min_size, args.max_colors)
        Path(dst).parent.mkdir(parents=True, exist_ok=True)
        out.save(dst)
        print(f"{dst}: {sum(1 for p in out.getdata() if p[3])} pixels")
        previews.append(out)
    if args.preview:
        sheet = Image.new("RGBA", (CANVAS * (len(previews) + 1), CANVAS), (40, 44, 60, 255))
        sheet.alpha_composite(body, (0, 0))
        for i, p in enumerate(previews):
            sheet.alpha_composite(body, (CANVAS * (i + 1), 0))
            sheet.alpha_composite(p, (CANVAS * (i + 1), 0))
        sheet.resize((sheet.width * 6, sheet.height * 6), Image.NEAREST).save(args.preview)


if __name__ == "__main__":
    main()
