#!/usr/bin/env python3
"""Build the game's pixel font (art/fonts/pixel.fnt + pixel.png).

Each glyph is drawn below as rows of '#' on a 5x9 grid: 7 rows above the
baseline and 2 for descenders (g, j, p, q, y). Narrow glyphs may use fewer
columns; the advance is the glyph width plus one pixel of spacing. To change
a letter, edit its rows and run:

  python3 tools/make_font.py

Godot reads the result as a BMFont; draw it at whole multiples of its size
(9, 18, 27, 36...) so pixels stay square.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "art" / "fonts"
HEIGHT = 9
BASE = 7

G = {}


def glyph(chars, *rows):
    rows = list(rows) + [""] * (HEIGHT - len(rows))
    for c in chars:
        G[c] = rows


glyph(" ", "", "", "", "", "", "", "")
glyph("!", "#", "#", "#", "#", "#", "", "#")
glyph('"', "# #", "# #")
glyph("#", "", " # # ", "#####", " # # ", "#####", " # # ")
glyph("$", "  #  ", " ####", "# #  ", " ### ", "  # #", "#### ", "  #  ")
glyph("%", "##  #", "## # ", "  #  ", " #   ", "# ## ", "   ##")
glyph("&", " ##  ", "#  # ", " ##  ", "# # #", "#  # ", " ## #")
glyph("'", "#", "#")
glyph("(", " #", "# ", "# ", "# ", "# ", "# ", " #")
glyph(")", "# ", " #", " #", " #", " #", " #", "# ")
glyph("*", "", "# #", " # ", "###", " # ", "# #")
glyph("+", "", "  #  ", "  #  ", "#####", "  #  ", "  #  ")
glyph(",", "", "", "", "", "", " #", " #", "# ")
glyph("-", "", "", "", "####")
glyph(".", "", "", "", "", "", "", "#")
glyph("/", "    #", "   # ", "   # ", "  #  ", " #   ", " #   ", "#    ")
glyph("0", " ### ", "#   #", "#  ##", "# # #", "##  #", "#   #", " ### ")
glyph("1", " # ", "## ", " # ", " # ", " # ", " # ", "###")
glyph("2", " ### ", "#   #", "    #", "  ## ", " #   ", "#    ", "#####")
glyph("3", "#### ", "    #", "    #", " ### ", "    #", "    #", "#### ")
glyph("4", "   # ", "  ## ", " # # ", "#  # ", "#####", "   # ", "   # ")
glyph("5", "#####", "#    ", "#### ", "    #", "    #", "#   #", " ### ")
glyph("6", " ### ", "#    ", "#    ", "#### ", "#   #", "#   #", " ### ")
glyph("7", "#####", "    #", "   # ", "  #  ", "  #  ", "  #  ", "  #  ")
glyph("8", " ### ", "#   #", "#   #", " ### ", "#   #", "#   #", " ### ")
glyph("9", " ### ", "#   #", "#   #", " ####", "    #", "    #", " ### ")
glyph(":", "", "", "#", "", "", "#")
glyph(";", "", "", " #", "", "", " #", " #", "# ")
glyph("<", "", "   #", "  # ", " #  ", "  # ", "   #")
glyph("=", "", "", "####", "", "####")
glyph(">", "", "#   ", " #  ", "  # ", " #  ", "#   ")
glyph("?", " ### ", "#   #", "    #", "  ## ", "  #  ", "     ", "  #  ")
glyph("@", " ### ", "#   #", "# ###", "# # #", "# ###", "#    ", " ### ")
glyph("A", " ### ", "#   #", "#   #", "#####", "#   #", "#   #", "#   #")
glyph("B", "#### ", "#   #", "#   #", "#### ", "#   #", "#   #", "#### ")
glyph("C", " ### ", "#   #", "#    ", "#    ", "#    ", "#   #", " ### ")
glyph("D", "#### ", "#   #", "#   #", "#   #", "#   #", "#   #", "#### ")
glyph("E", "#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#####")
glyph("F", "#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#    ")
glyph("G", " ### ", "#   #", "#    ", "# ###", "#   #", "#   #", " ####")
glyph("H", "#   #", "#   #", "#   #", "#####", "#   #", "#   #", "#   #")
glyph("I", "###", " # ", " # ", " # ", " # ", " # ", "###")
glyph("J", "  ###", "   # ", "   # ", "   # ", "   # ", "#  # ", " ##  ")
glyph("K", "#   #", "#  # ", "# #  ", "##   ", "# #  ", "#  # ", "#   #")
glyph("L", "#    ", "#    ", "#    ", "#    ", "#    ", "#    ", "#####")
glyph("M", "#   #", "## ##", "# # #", "# # #", "#   #", "#   #", "#   #")
glyph("N", "#   #", "##  #", "# # #", "#  ##", "#   #", "#   #", "#   #")
glyph("O", " ### ", "#   #", "#   #", "#   #", "#   #", "#   #", " ### ")
glyph("P", "#### ", "#   #", "#   #", "#### ", "#    ", "#    ", "#    ")
glyph("Q", " ### ", "#   #", "#   #", "#   #", "# # #", "#  # ", " ## #")
glyph("R", "#### ", "#   #", "#   #", "#### ", "# #  ", "#  # ", "#   #")
glyph("S", " ####", "#    ", "#    ", " ### ", "    #", "    #", "#### ")
glyph("T", "#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ")
glyph("U", "#   #", "#   #", "#   #", "#   #", "#   #", "#   #", " ### ")
glyph("V", "#   #", "#   #", "#   #", "#   #", "#   #", " # # ", "  #  ")
glyph("W", "#   #", "#   #", "#   #", "# # #", "# # #", "# # #", " # # ")
glyph("X", "#   #", "#   #", " # # ", "  #  ", " # # ", "#   #", "#   #")
glyph("Y", "#   #", "#   #", " # # ", "  #  ", "  #  ", "  #  ", "  #  ")
glyph("Z", "#####", "    #", "   # ", "  #  ", " #   ", "#    ", "#####")
glyph("[", "##", "# ", "# ", "# ", "# ", "# ", "##")
glyph("\\", "#    ", " #   ", " #   ", "  #  ", "   # ", "   # ", "    #")
glyph("]", "##", " #", " #", " #", " #", " #", "##")
glyph("^", " # ", "# #")
glyph("_", "", "", "", "", "", "", "#####")
glyph("`", "# ", " #")
glyph("a", "", "", " ### ", "    #", " ####", "#   #", " ####")
glyph("b", "#    ", "#    ", "#### ", "#   #", "#   #", "#   #", "#### ")
glyph("c", "", "", " ####", "#    ", "#    ", "#    ", " ####")
glyph("d", "    #", "    #", " ####", "#   #", "#   #", "#   #", " ####")
glyph("e", "", "", " ### ", "#   #", "#####", "#    ", " ####")
glyph("f", "  ##", " #  ", "####", " #  ", " #  ", " #  ", " #  ")
glyph("g", "", "", " ####", "#   #", "#   #", "#   #", " ####", "    #", " ### ")
glyph("h", "#    ", "#    ", "#### ", "#   #", "#   #", "#   #", "#   #")
glyph("i", "#", "", "#", "#", "#", "#", "#")
glyph("j", "   #", "    ", "  ##", "   #", "   #", "   #", "   #", "#  #", " ## ")
glyph("k", "#   ", "#   ", "#  #", "# # ", "##  ", "# # ", "#  #")
glyph("l", "##", " #", " #", " #", " #", " #", " #")
glyph("m", "", "", "## # ", "# # #", "# # #", "# # #", "# # #")
glyph("n", "", "", "#### ", "#   #", "#   #", "#   #", "#   #")
glyph("o", "", "", " ### ", "#   #", "#   #", "#   #", " ### ")
glyph("p", "", "", "#### ", "#   #", "#   #", "#   #", "#### ", "#    ", "#    ")
glyph("q", "", "", " ####", "#   #", "#   #", "#   #", " ####", "    #", "    #")
glyph("r", "", "", "# ##", "##  ", "#   ", "#   ", "#   ")
glyph("s", "", "", " ####", "#    ", " ### ", "    #", "#### ")
glyph("t", " #  ", " #  ", "####", " #  ", " #  ", " #  ", "  ##")
glyph("u", "", "", "#   #", "#   #", "#   #", "#   #", " ####")
glyph("v", "", "", "#   #", "#   #", "#   #", " # # ", "  #  ")
glyph("w", "", "", "#   #", "#   #", "# # #", "# # #", " # # ")
glyph("x", "", "", "#   #", " # # ", "  #  ", " # # ", "#   #")
glyph("y", "", "", "#   #", "#   #", "#   #", "#   #", " ####", "    #", " ### ")
glyph("z", "", "", "#####", "   # ", "  #  ", " #   ", "#####")
glyph("{", "  #", " # ", " # ", "#  ", " # ", " # ", "  #")
glyph("|", "#", "#", "#", "#", "#", "#", "#")
glyph("}", "#  ", " # ", " # ", "  #", " # ", " # ", "#  ")
glyph("~", "", "", " #  #", "# ## ")


def main():
    chars = sorted(G, key=ord)
    widths = {c: max([len(r.rstrip()) for r in G[c]] + [0]) for c in chars}
    widths[" "] = 3
    cols = 16
    cell_w, cell_h = 7, HEIGHT + 1
    rows = (len(chars) + cols - 1) // cols
    img = Image.new("RGBA", (cols * cell_w, rows * cell_h), (0, 0, 0, 0))
    px = img.load()
    lines = [
        'info face="Pixel" size=%d bold=0 italic=0 charset="" unicode=1 stretchH=100 smooth=0 aa=1 padding=0,0,0,0 spacing=1,1' % HEIGHT,
        "common lineHeight=%d base=%d scaleW=%d scaleH=%d pages=1 packed=0" % (HEIGHT + 2, BASE, img.width, img.height),
        'page id=0 file="pixel.png"',
        "chars count=%d" % len(chars),
    ]
    for i, c in enumerate(chars):
        x0, y0 = (i % cols) * cell_w, (i // cols) * cell_h
        for y, row in enumerate(G[c]):
            for x, ch in enumerate(row):
                if ch == "#":
                    px[x0 + x, y0 + y] = (255, 255, 255, 255)
        w = widths[c]
        lines.append("char id=%d x=%d y=%d width=%d height=%d xoffset=0 yoffset=0 xadvance=%d page=0 chnl=15"
                     % (ord(c), x0, y0, max(w, 1), HEIGHT, w + 1))
    OUT.mkdir(parents=True, exist_ok=True)
    img.save(OUT / "pixel.png")
    (OUT / "pixel.fnt").write_text("\n".join(lines) + "\n")
    print(f"{len(chars)} glyphs -> {OUT / 'pixel.fnt'}")


if __name__ == "__main__":
    main()
