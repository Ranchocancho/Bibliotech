#!/usr/bin/env python3
"""Genera los iconos de la app (una balda de madera con cajas)."""
import os
import sys
from PIL import Image, ImageDraw

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join("site", "icons")


def icon(size, pad_ratio):
    s = 1024
    im = Image.new("RGB", (s, s), "#2a1c12")
    d = ImageDraw.Draw(im)
    # vetas de la pared
    for x in range(0, s, 46):
        d.rectangle([x, 0, x + 18, s], fill="#33221a")
    # foco cálido
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for r in range(420, 0, -12):
        a = int(70 * (1 - r / 420))
        gd.ellipse([s / 2 - r * 1.4, 120 - r * 0.7, s / 2 + r * 1.4, 120 + r * 1.2], fill=(255, 196, 120, a))
    im.paste(glow, (0, 0), glow)
    p = pad_ratio * s
    scale = (s - 2 * p) / s
    def R(x0, y0, x1, y1):
        return [p + x0 * scale, p + y0 * scale, p + x1 * scale, p + y1 * scale]
    base = 760
    # lomos y una caja de frente
    spines = [(170, 230, "#d4101b"), (240, 300, "#1a3f8f"), (310, 362, "#ececec")]
    for x0, x1, c in spines:
        d.rounded_rectangle(R(x0, base - 400, x1, base), radius=8, fill=c)
        d.rectangle(R(x0 + 8, base - 360, x1 - 8, base - 50), fill="#f2b84b" if c != "#ececec" else "#a3121c")
    d.rounded_rectangle(R(400, base - 470, 700, base), radius=18, fill="#d4101b")
    d.rectangle(R(414, base - 430, 686, base - 14), fill="#1b5e20")
    d.ellipse(R(470, base - 380, 660, base - 190), fill="#d4af37")
    d.rounded_rectangle(R(730, base - 330, 800, base), radius=8, fill="#141414")
    d.rotate = None
    # balda
    d.rectangle(R(110, base, 914, base + 56), fill="#9a6a3c")
    d.rectangle(R(110, base, 914, base + 10), fill="#c08a55")
    d.rectangle(R(140, base + 56, 884, base + 84), fill="#4a2f19")
    return im.resize((size, size), Image.LANCZOS)


os.makedirs(OUT, exist_ok=True)
icon(192, 0.0).save(os.path.join(OUT, "icon-192.png"))
icon(512, 0.0).save(os.path.join(OUT, "icon-512.png"))
icon(512, 0.12).save(os.path.join(OUT, "icon-maskable-512.png"))
print("Iconos generados en", OUT)
