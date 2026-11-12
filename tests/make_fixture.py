#!/usr/bin/env python3
"""Crea un Metadata.zip de prueba con el mismo formato que LaunchBox y
portadas de mentira, para probar la app sin conexión."""
import os
import sys
import zipfile
from PIL import Image, ImageDraw

out = sys.argv[1]
img_dir = os.path.join(out, "test-img")
os.makedirs(img_dir, exist_ok=True)

GAMES = [
    # id, nombre, plataforma LaunchBox, año, color, alternativo
    (1001, "Mario Kart 7", "Nintendo 3DS", 2011, "#c62828", None),
    (1002, "Pokémon HeartGold Version", "Nintendo DS", 2009, "#8a6408", "Pokémon Edición Oro HeartGold"),
    (1003, "Professor Layton and the Curious Village", "Nintendo DS", 2007, "#5b3a29", "El profesor Layton y la villa misteriosa"),
    (1004, "Animal Crossing: New Leaf", "Nintendo 3DS", 2012, "#2e7d32", None),
    (1005, "The Legend of Zelda: A Link Between Worlds", "Nintendo 3DS", 2013, "#283593", None),
    (2001, "The Legend of Zelda: Tears of the Kingdom", "Nintendo Switch", 2023, "#1b5e20", None),
    (2002, "Super Mario Odyssey", "Nintendo Switch", 2017, "#b71c1c", None),
    (2003, "Metroid Dread", "Nintendo Switch", 2021, "#263238", None),
    (2004, "Animal Crossing: New Horizons", "Nintendo Switch", 2020, "#00796b", None),
    (2005, "Splatoon 3", "Nintendo Switch", 2022, "#2a2a7a", None),
    (2006, "Hollow Knight", "Nintendo Switch", 2018, "#1e2a3a", None),
    (2007, "Mario Kart 8 Deluxe", "Nintendo Switch", 2017, "#0d47a1", None),
    (2101, "Mario Kart World", "Nintendo Switch 2", 2025, "#0d47a1", None),
    (2102, "Donkey Kong Bananza", "Nintendo Switch 2", 2025, "#bf4600", None),
    (3001, "God of War Ragnarök", "Sony Playstation 5", 2022, "#0d2a4a", None),
    (3002, "Astro Bot", "Sony Playstation 5", 2024, "#1565c0", None),
    (3003, "The Last of Us Part II", "Sony Playstation 4", 2020, "#1b2b1f", "The Last of Us Parte II"),
    (3004, "Ghost of Tsushima", "Sony Playstation 4", 2020, "#7f0000", None),
    (3005, "Bloodborne", "Sony Playstation 4", 2015, "#1d1a17", None),
    (9001, "Super Mario 64", "Nintendo 64", 1996, "#b71c1c", None),  # no debe salir
]


def card(path, text, color, size, kind):
    im = Image.new("RGB", size, color)
    d = ImageDraw.Draw(im)
    w, h = size
    if kind == "front":
        d.ellipse([w * .25, h * .1, w * 1.05, h * .7], fill="#f2c14e")
        d.rectangle([0, h * .78, w, h], fill="#00000088")
    elif kind == "back":
        d.rectangle([w * .08, h * .1, w * .45, h * .3], fill="#ffffff55")
        d.rectangle([w * .55, h * .1, w * .92, h * .3], fill="#ffffff33")
        for i in range(6):
            d.rectangle([w * .08, h * (.4 + i * .05), w * (.92 - (i % 3) * .1), h * (.42 + i * .05)], fill="#ffffff66")
    d.text((10, h - 40 if kind != "media" else h / 2), text[:28], fill="white")
    im.save(path)


xml = ['<?xml version="1.0" standalone="yes"?>', "<LaunchBox>"]
for gid, name, plat, year, color, alt in GAMES:
    xml.append(f"  <Game><Name>{name}</Name><ReleaseYear>{year}</ReleaseYear><Overview>Prueba</Overview>"
               f"<DatabaseID>{gid}</DatabaseID><Platform>{plat}</Platform></Game>")
for gid, name, plat, year, color, alt in GAMES:
    if alt:
        xml.append(f"  <GameAlternateName><AlternateName>{alt}</AlternateName><DatabaseID>{gid}</DatabaseID><Region>Spain</Region></GameAlternateName>")
    f_us, f_eu, back, media = f"{gid}-us.png", f"{gid}-eu.png", f"{gid}-back.png", f"{gid}-media.png"
    card(os.path.join(img_dir, f_us), name + " (US)", "#555555", (300, 400), "front")
    card(os.path.join(img_dir, f_eu), name, color, (300, 400), "front")
    xml.append(f"  <GameImage><DatabaseID>{gid}</DatabaseID><FileName>{f_us}</FileName><Type>Box - Front</Type><Region>North America</Region></GameImage>")
    xml.append(f"  <GameImage><DatabaseID>{gid}</DatabaseID><FileName>{f_eu}</FileName><Type>Box - Front</Type><Region>Europe</Region></GameImage>")
    if gid % 2:  # solo algunos tienen contraportada y disco
        card(os.path.join(img_dir, back), name, color, (300, 400), "back")
        xml.append(f"  <GameImage><DatabaseID>{gid}</DatabaseID><FileName>{back}</FileName><Type>Box - Back</Type><Region>Europe</Region></GameImage>")
        im = Image.new("RGBA", (300, 300), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.ellipse([4, 4, 296, 296], fill=color)
        d.ellipse([120, 120, 180, 180], fill=(0, 0, 0, 0))
        d.text((90, 80), name[:16], fill="white")
        im.save(os.path.join(img_dir, media))
        xml.append(f"  <GameImage><DatabaseID>{gid}</DatabaseID><FileName>{media}</FileName><Type>{'Disc' if 'Playstation' in plat else 'Cart - Front'}</Type><Region>Europe</Region></GameImage>")
    xml.append(f"  <GameImage><DatabaseID>{gid}</DatabaseID><FileName>{gid}-logo.png</FileName><Type>Clear Logo</Type><Region>World</Region></GameImage>")
xml.append("</LaunchBox>")

zpath = os.path.join(out, "Metadata.zip")
with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("Metadata.xml", "\n".join(xml))
    z.writestr("Platforms.xml", "<LaunchBox/>")
print("Fixture en", zpath)
