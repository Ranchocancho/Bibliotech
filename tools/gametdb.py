"""
GameTDB (https://www.gametdb.com): base de datos colaborativa y descargable de
juegos de Nintendo, con títulos en español y cada edición regional por separado.

Este módulo descarga el listado de DS, 3DS y Switch y lo convierte en filas
para el índice de Ludoteca, quedándose con UNA edición por juego y prefiriendo
la española, luego la europea.

Las imágenes NO se listan aquí: el navegador las busca en art.gametdb.com
(portada, portada completa con contraportada y cartucho) al añadir el juego.
"""
import io
import os
import re
import sys
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

# plataforma de Ludoteca -> (carpeta en art.gametdb.com, nombres de archivo posibles)
SYSTEMS = {
    "ds": ("ds", ["dstdb.zip", "dstdb.xml"]),
    "3ds": ("3ds", ["3dstdb.zip", "3dstdb.xml"]),
    "switch": ("switch", ["switchtdb.zip", "switchtdb.xml"]),
}
BASES = ["https://www.gametdb.com/", "https://gametdb.com/"]
UA = {"User-Agent": "Ludoteca/1.0 (coleccion personal; +https://github.com)"}

# Último carácter del ID en DS/3DS: región de la edición
ID_REGION = {"S": "ES", "P": "EU", "X": "EU", "Y": "EU", "Z": "EU", "V": "EU", "W": "EU",
             "D": "DE", "F": "FR", "I": "IT", "H": "NL", "U": "AU", "E": "US", "J": "JP", "K": "KR"}
REGION_FIELD = {"ESP": "ES", "PAL": "EU", "EUR": "EU", "ALL": "WW", "DEU": "DE", "FRA": "FR",
                "AUS": "AU", "USA": "US", "NTSC-U": "US", "JPN": "JP", "NTSC-J": "JP", "KOR": "KR"}
RANK = {"ES": 0, "EU": 1, "WW": 2, "FR": 4, "DE": 4, "IT": 4, "NL": 4, "AU": 5, "US": 6, "KR": 8, "JP": 9}
SKIP_TYPES = re.compile(r"ware|eshop|dlc|update|demo|channel|virtual|vc|homebrew|custom", re.I)


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def fetch(plat, cache):
    """Descarga el XML (en un zip) de GameTDB. Devuelve bytes o None."""
    _sys, names = SYSTEMS[plat]
    for base in BASES:
        for name in names:
            for q in ("?LANG=ES", ""):
                url = base + name + q
                try:
                    req = urllib.request.Request(url, headers=UA)
                    with urllib.request.urlopen(req, timeout=180) as r:
                        data = r.read()
                    if len(data) < 2000:
                        continue
                    if data[:2] == b"PK":
                        zf = zipfile.ZipFile(io.BytesIO(data))
                        member = next((n for n in zf.namelist() if n.lower().endswith(".xml")), None)
                        if not member:
                            continue
                        data = zf.read(member)
                    if b"<game" not in data[:200000]:
                        continue
                    print(f"  GameTDB {plat}: {url} ({len(data) // 1024} KB)", file=sys.stderr)
                    if cache:
                        os.makedirs(cache, exist_ok=True)
                        with open(os.path.join(cache, f"gametdb-{plat}.xml"), "wb") as fh:
                            fh.write(data)
                    return data
                except Exception as e:  # probamos la siguiente dirección
                    print(f"  GameTDB {plat}: {url} falló ({e.__class__.__name__})", file=sys.stderr)
    return None


def genres_es(t):
    from build_index import genres_es as g  # misma tabla de géneros
    return g(t)


def text(el, tag):
    c = el.find(tag)
    return (c.text or "").strip() if c is not None and c.text else ""


def region_of(plat, gid, region_field):
    if plat in ("ds", "3ds") and len(gid) >= 4:
        r = ID_REGION.get(gid[3].upper())
        if r:
            return r
    return REGION_FIELD.get((region_field or "").upper(), "WW")


def parse(plat, data):
    root = ET.fromstring(data)
    best = {}
    editions = {}
    for g in root.iter("game"):
        gid = text(g, "id")
        if not gid or not re.fullmatch(r"[A-Z0-9]{4,6}", gid):
            continue
        gtype = text(g, "type")
        if gtype and SKIP_TYPES.search(gtype):
            continue
        titles = {}
        for loc in g.findall("locale"):
            t = text(loc, "title")
            if t:
                titles[(loc.get("lang") or "").upper()] = t
        name_attr = (g.get("name") or "").strip()
        en = titles.get("EN") or name_attr
        es = titles.get("ES")
        title = es or en
        if not title:
            continue
        year = None
        d = g.find("date")
        if d is not None and (d.get("year") or "").isdigit():
            year = int(d.get("year"))
        reg = region_of(plat, gid, text(g, "region"))
        genres = genres_es(text(g, "genre"))
        alts = sorted({t for t in [en, name_attr] + list(titles.values()) if t and t != title})[:6]
        # Agrupamos ediciones del mismo juego (mismo título en inglés)
        key = norm(en) or norm(title)
        cand = (RANK.get(reg, 7), gid, title, year, alts, reg, genres)
        editions.setdefault(key, []).append((RANK.get(reg, 7), gid, reg))
        if key not in best or cand[0] < best[key][0]:
            best[key] = cand
    rows = []
    for key, (_rank, gid, title, year, alts, reg, genres) in best.items():
        others = [[i, r] for _rk, i, r in sorted(editions.get(key, [])) if i != gid][:6]
        rows.append(["t:" + gid, title, year, None, None, None, alts, reg, genres, others])
    return rows


def load(plat, cache=None, local_dir=None):
    """Filas de GameTDB para una plataforma, o None si no se pudo descargar."""
    data = None
    if local_dir:
        p = os.path.join(local_dir, f"gametdb-{plat}.xml")
        if os.path.exists(p):
            with open(p, "rb") as fh:
                data = fh.read()
    if data is None and not local_dir:
        data = fetch(plat, cache)
    if not data:
        return None
    try:
        return parse(plat, data)
    except ET.ParseError as e:
        print(f"  GameTDB {plat}: XML no válido ({e})", file=sys.stderr)
        return None
