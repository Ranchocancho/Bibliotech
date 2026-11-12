#!/usr/bin/env python3
"""
Construye el índice de juegos de Ludoteca a partir de la base de datos pública
de LaunchBox (https://gamesdb.launchbox-app.com/Metadata.zip).

Solo usa la biblioteca estándar de Python. Genera un JSON por plataforma en
la carpeta de salida (por defecto ./site/data):

  games-ds.json, games-3ds.json, games-switch.json, games-switch2.json,
  games-ps4.json, games-ps5.json

Cada juego se guarda como una lista compacta:
  [id, "Nombre", año, "portada", "contraportada", "disco/cartucho", ["nombres alternativos"]]
Las imágenes son nombres de archivo de https://images.launchbox-app.com/

Uso:
  python3 tools/build_index.py                 # descarga Metadata.zip y genera
  python3 tools/build_index.py --zip M.zip     # usa un zip ya descargado
  python3 tools/build_index.py --xml M.xml     # usa un Metadata.xml suelto
"""
import argparse
import datetime as dt
import io
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gametdb  # noqa: E402

METADATA_URL = "https://gamesdb.launchbox-app.com/Metadata.zip"

# Nombre de plataforma en LaunchBox (normalizado) -> clave de Ludoteca
PLATFORMS = {
    "nintendo ds": "ds",
    "nintendo 3ds": "3ds",
    "nintendo switch": "switch",
    "nintendo switch 2": "switch2",
    "playstation 4": "ps4",
    "playstation 5": "ps5",
}

FRONT_TYPES = ["Box - Front", "Box - Front - Reconstructed"]
BACK_TYPES = ["Box - Back", "Box - Back - Reconstructed"]
MEDIA_TYPES = ["Disc", "Cart - Front"]

# Preferimos ediciones españolas y europeas (PAL)
REGION_RANK = {
    "spain": 0, "europe": 1, "united kingdom": 2, "world": 3, "": 4,
    "france": 5, "germany": 5, "italy": 5, "australia": 6,
    "north america": 7, "united states": 8, "canada": 8, "japan": 10,
}


def norm_platform(name):
    n = (name or "").strip().lower()
    n = re.sub(r"^sony\s+", "", n)
    return PLATFORMS.get(n)


def region_rank(region):
    return REGION_RANK.get((region or "").strip().lower(), 9)


def fields(elem):
    """Hijos de un elemento como dict con claves en minúscula."""
    return {child.tag.lower(): (child.text or "").strip() for child in elem}


def iter_top(xml_source, wanted):
    """Recorre los elementos de primer nivel sin cargar todo en memoria."""
    wanted = {w.lower() for w in wanted}
    depth = 0
    for event, elem in ET.iterparse(xml_source, events=("start", "end")):
        if event == "start":
            depth += 1
            continue
        depth -= 1
        if depth == 1:
            if elem.tag.lower() in wanted:
                yield elem.tag.lower(), fields(elem)
            elem.clear()


def open_xml(args):
    if args.xml:
        return lambda: open(args.xml, "rb")
    zpath = args.zip
    if not zpath:
        zpath = os.path.join(args.cache, "Metadata.zip")
        os.makedirs(args.cache, exist_ok=True)
        print(f"Descargando {METADATA_URL} …", file=sys.stderr)
        req = urllib.request.Request(METADATA_URL, headers={"User-Agent": "Ludoteca/1.0 (coleccion personal)"})
        with urllib.request.urlopen(req, timeout=600) as r, open(zpath, "wb") as f:
            while True:
                chunk = r.read(1 << 20)
                if not chunk:
                    break
                f.write(chunk)
    zf = zipfile.ZipFile(zpath)
    member = next((n for n in zf.namelist() if n.lower().endswith("metadata.xml")), None)
    if not member:
        sys.exit("No encuentro Metadata.xml dentro del zip")
    return lambda: zf.open(member)


def year_of(g):
    y = g.get("releaseyear") or ""
    if not y:
        d = g.get("releasedate") or ""
        y = d[:4]
    return int(y) if y.isdigit() else None


def pick(images, types, prefer_region=None):
    """Mejor imagen de entre los tipos dados. Si se indica una región (la de
    la portada elegida), se prefiere esa misma región para que portada,
    contraportada y cartucho/disco sean de la misma edición."""
    best = None
    for ti, t in enumerate(types):
        for img in images.get(t, []):
            same = 0 if (prefer_region is not None and (img[1] or "").lower() == prefer_region) else 1
            key = (same, region_rank(img[1]), ti)
            if best is None or key < best[0]:
                best = (key, img)
    return best[1] if best else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip")
    ap.add_argument("--xml")
    ap.add_argument("--out", default=os.path.join("site", "data"))
    ap.add_argument("--cache", default=".cache")
    ap.add_argument("--img-base", help="solo para pruebas: carpeta local de imágenes")
    ap.add_argument("--tdb-dir", help="solo para pruebas: carpeta con gametdb-<plat>.xml")
    ap.add_argument("--no-tdb", action="store_true", help="no usar GameTDB")
    args = ap.parse_args()

    opener = open_xml(args)

    # Pasada 1: juegos de nuestras plataformas
    games = {}
    with opener() as src:
        for tag, g in iter_top(src, ["Game"]):
            plat = norm_platform(g.get("platform"))
            gid = g.get("databaseid")
            if not plat or not gid or not gid.isdigit():
                continue
            games[int(gid)] = {"plat": plat, "name": g.get("name", ""), "year": year_of(g),
                               "images": {}, "alts": set()}
    print(f"Juegos encontrados: {len(games)}", file=sys.stderr)

    # Pasada 2: imágenes y nombres alternativos
    wanted_types = set(FRONT_TYPES + BACK_TYPES + MEDIA_TYPES)
    with opener() as src:
        for tag, f in iter_top(src, ["GameImage", "GameAlternateName"]):
            gid = f.get("databaseid", "")
            if not gid.isdigit() or int(gid) not in games:
                continue
            g = games[int(gid)]
            if tag == "gameimage":
                t = f.get("type", "")
                if t in wanted_types and f.get("filename"):
                    g["images"].setdefault(t, []).append((f["filename"], f.get("region", "")))
            else:
                alt = f.get("alternatename", "")
                if alt and alt != g["name"]:
                    g["alts"].add(alt)

    os.makedirs(args.out, exist_ok=True)
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")
    per_plat = {k: [] for k in set(PLATFORMS.values())}
    for gid, g in games.items():
        front = pick(g["images"], FRONT_TYPES)
        if not front:
            continue  # sin portada no nos sirve para la estantería
        region = (front[1] or "").lower()
        back = pick(g["images"], BACK_TYPES, region)
        media = pick(g["images"], MEDIA_TYPES, region)
        row = [gid, g["name"], g["year"], front[0],
               back[0] if back else None, media[0] if media else None]
        alts = sorted(g["alts"])[:6]
        if alts:
            row.append(alts)
        per_plat[g["plat"]].append(row)

    # DS, 3DS y Switch: GameTDB (títulos en español, edición española/europea).
    # Los juegos de LaunchBox que no estén en GameTDB se conservan.
    sources = {}
    for plat in ("ds", "3ds", "switch"):
        sources[plat] = "launchbox"
        if args.no_tdb:
            continue
        tdb_rows = gametdb.load(plat, cache=args.cache, local_dir=args.tdb_dir)
        if not tdb_rows:
            print(f"  {plat}: GameTDB no disponible, uso solo LaunchBox", file=sys.stderr)
            continue
        known = set()
        for r in tdb_rows:
            known.add(gametdb.norm(r[1]))
            for a in r[6]:
                known.add(gametdb.norm(a))
        extra = [r for r in per_plat[plat] if gametdb.norm(r[1]) not in known]
        per_plat[plat] = tdb_rows + extra
        sources[plat] = f"gametdb+launchbox ({len(tdb_rows)} + {len(extra)})"
        print(f"  {plat}: {len(tdb_rows)} de GameTDB + {len(extra)} solo en LaunchBox", file=sys.stderr)

    summary = {}
    for plat, rows in per_plat.items():
        rows.sort(key=lambda r: r[1].lower())
        path = os.path.join(args.out, f"games-{plat}.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump({"v": 1, "plat": plat, "updated": stamp, "games": rows},
                      fh, ensure_ascii=False, separators=(",", ":"))
        summary[plat] = len(rows)
        print(f"  {plat}: {len(rows)} juegos con portada -> {path}", file=sys.stderr)

    with open(os.path.join(args.out, "index.json"), "w", encoding="utf-8") as fh:
        meta = {"updated": stamp, "counts": summary, "sources": sources}
        if args.img_base:
            meta["imgBase"] = args.img_base
        json.dump(meta, fh)


if __name__ == "__main__":
    main()
