// Visión según las reglas (SRD 5.2.1, «Visión y luz» y «Visión en la oscuridad»). El grupo comparte lo que ve:
// una casilla se ve si algún personaje en pie tiene línea de visión hasta ella (los muros y las puertas cerradas
// la tapan) y no está a oscuras para él.
//  - Luz brillante: se ve con normalidad.
//  - Luz tenue: zona ligeramente oscura (desventaja en Sabiduría (Percepción) para ver).
//  - Oscuridad: zona muy oscura (quien intenta ver algo ahí está cegado): no se ve.
//  - Visión en la oscuridad: dentro de su alcance, la luz tenue cuenta como brillante y la oscuridad como tenue.
import { TERRAIN, PROPS, doorBlocksSight } from "../data/mapas.js";
import { reliefBlocks } from "./alturas.js";

/** Fuentes de luz en casillas de 1,5 m: b = radio de luz brillante, d = radio total (brillante + tenue). */
export const LIGHT_ITEMS = {
  vela: { n: "Vela", b: 1, d: 2, src: "SRD: brillante 1,5 m y tenue 1,5 m más" },
  antorcha: { n: "Antorcha", b: 4, d: 8, src: "SRD: brillante 6 m y tenue 6 m más" },
  lampara: { n: "Lámpara", b: 3, d: 9, src: "SRD: brillante 4,5 m y tenue 9 m más" },
  linterna: { n: "Linterna sorda", b: 6, d: 12, src: "SRD: brillante 9 m y tenue 9 m más" },
  luz: { n: "Conjuro Luz", b: 4, d: 8, src: "SRD (conjuro Luz): brillante 6 m y tenue 6 m más" }
};
/** Objetos de escenografía que dan luz. Hoguera: como una antorcha (regla de campaña). */
const PROP_LIGHT = { antorcha: LIGHT_ITEMS.antorcha, velas: LIGHT_ITEMS.vela, hoguera: LIGHT_ITEMS.antorcha };
export const LEVELS = { bright: "☀️ Luz brillante", dim: "◐ Luz tenue", dark: "● Oscuridad" };
/** Luz de la escena: la que elija el máster; si no, de noche hay oscuridad y si no, luz brillante. */
export const ambientLevel = g => g && LEVELS[g.light] ? g.light : g && g.ambient === "noche" ? "dark" : "bright";
/** ¿Está activada la visión de los personajes? (activa salvo que el máster la apague) */
export const visionOn = g => !!g && g.fog !== false;

/** Visión en la oscuridad por defecto según la especie (en metros). */
export function darkvisionOf(ch) {
  if (!ch) return 0;
  if (ch.darkvision != null && ch.darkvision !== "") return +ch.darkvision || 0;
  const s = (ch.species || "").toLowerCase();
  if (/enan|orc|drow/.test(s)) return 36;
  if (/elf|gnom|tiefl|aasim|drac/.test(s)) return 18;
  return 0;
}

/** Línea de visión entre centros de casillas: la tapan muros y puertas cerradas (la casilla del muro sí se ve).
 *  Al cruzar en diagonal entre dos muros que se tocan por la esquina, tampoco se ve. */
export function sightLine(grid) {
  const doors = new Set((grid.props || []).filter(doorBlocksSight).map(p => p.c + "," + p.r));
  const wall = (c, r) => { const t = (grid.terrain || {})[c + "," + r]; return !!(TERRAIN[t] && TERRAIN[t].wall) || doors.has(c + "," + r); };
  return (a, b) => {
    const dx = b.c - a.c, dy = b.r - a.r, n = Math.max(Math.abs(dx), Math.abs(dy)) * 4;
    let pc = a.c, pr = a.r;
    for (let i = 1; i <= n; i++) {
      const c = Math.round(a.c + dx * i / n), r = Math.round(a.r + dy * i / n);
      if (c === pc && r === pr) continue;
      if (c !== pc && r !== pr && wall(c, pr) && wall(pc, r)) return false; // esquina entre dos muros
      if ((c !== b.c || r !== b.r) && wall(c, r)) return false;
      pc = c; pr = r;
    }
    return !grid.elev || !reliefBlocks(grid, a, b); // el relieve más alto que la mirada también tapa
  };
}

/** Nivel de luz de cada casilla: 2 brillante, 1 tenue, 0 oscuridad. */
export function lightMap(grid, tokens = []) {
  const amb = { bright: 2, dim: 1, dark: 0 }[ambientLevel(grid)];
  const L = new Map(), los = sightLine(grid);
  if (amb === 2) return { at: () => 2, amb };
  const inside = (c, r) => c >= 0 && r >= 0 && c < grid.cols && r < grid.rows;
  const src = [];
  for (const p of grid.props || []) { const x = PROP_LIGHT[p.k] || ((PROPS[p.k] || {}).light ? { b: Math.ceil(PROPS[p.k].light / 2), d: PROPS[p.k].light } : null); if (x) src.push({ c: p.c, r: p.r, ...x }); }
  for (const t of tokens) { const x = LIGHT_ITEMS[t.light]; if (x && !t.hidden) src.push({ c: t.c, r: t.r, ...x }); }
  for (const s of src) for (let r = s.r - s.d; r <= s.r + s.d; r++) for (let c = s.c - s.d; c <= s.c + s.d; c++) {
    if (!inside(c, r)) continue;
    const d = Math.max(Math.abs(c - s.c), Math.abs(r - s.r)); if (d > s.d) continue;
    const lv = d <= s.b ? 2 : 1, k = c + "," + r;
    if ((L.get(k) || 0) >= lv || !los(s, { c, r })) continue;
    L.set(k, lv);
  }
  return { at: k => Math.max(amb, L.get(k) || 0), amb };
}

/** Casillas que ve el grupo. Devuelve un Set; en .dim, las que se ven solo en penumbra (luz tenue o visión en la oscuridad). */
export function computeVision(grid, tokens, characters) {
  const los = sightLine(grid), light = lightMap(grid, tokens);
  const eyes = tokens.filter(t => t.kind === "pc").map(t => {
    const ch = characters.find(x => x.id === t.char);
    if (ch && ch.hp.cur <= 0) return null;
    if ((t.conds || []).some(c => ["cegado", "inconsciente"].includes(c.id))) return { c: t.c, r: t.r, blind: true };
    return { c: t.c, r: t.r, dv: Math.floor(darkvisionOf(ch) / 1.5) };
  }).filter(Boolean);
  const vis = new Set(), dim = new Set();
  for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) {
    const k = c + "," + r, base = light.at(k);
    let best = -1;
    for (const e of eyes) {
      const d = Math.max(Math.abs(c - e.c), Math.abs(r - e.r));
      if (d === 0) { best = Math.max(best, 2); continue; }
      if (e.blind) continue;
      const lv = Math.min(2, base + (d <= e.dv ? 1 : 0)); // visión en la oscuridad: un nivel más dentro de su alcance
      if (lv <= best || lv === 0) continue;
      if (los(e, { c, r })) best = lv;
      if (best === 2) break;
    }
    if (best > 0) { vis.add(k); if (best === 1) dim.add(k); }
  }
  vis.dim = dim;
  return vis;
}

/** ¿Ve el grupo a esta criatura? (una grande ocupa varias casillas: basta con ver una) */
export function tokenSeen(t, vis) {
  const R = (+t.size || 1) >= 1.5 ? 1 : 0; // las figuras grandes se dibujan centradas y asoman a las casillas de alrededor
  for (let r = t.r - R; r <= t.r + R; r++) for (let c = t.c - R; c <= t.c + R; c++) if (vis.has(c + "," + r)) return true;
  return false;
}

// Lo explorado se recuerda en este navegador, por escena
export function explored(boardKey, vis) {
  const K = "lamesa:explorado:" + boardKey;
  let set;
  try { set = new Set(JSON.parse(localStorage.getItem(K) || "[]")); } catch (e) { set = new Set(); }
  let changed = false;
  vis.forEach(k => { if (!set.has(k)) { set.add(k); changed = true; } });
  if (changed) try { localStorage.setItem(K, JSON.stringify([...set])); } catch (e) { /* sin almacenamiento */ }
  return set;
}

/** Para un jugador: ¿esta criatura no la ve el grupo? (oculta por el máster, o fuera de la vista según la luz y los muros).
 *  El máster lo ve todo. Se calcula una vez por estado. */
const unseenCache = new WeakMap();
export function unseenFn(s, dm) {
  if (dm || !s || !s.board) return t => !dm && !!(t && t.hidden);
  const hit = unseenCache.get(s); if (hit && hit.rev === s.rev) return hit.f; // el estado se cambia en el sitio: vale mientras no cambie rev
  const vis = visionOn(s.board) ? computeVision(s.board, s.tokens || [], s.characters || []) : null;
  const f = t => !!t && t.kind !== "pc" && (!!t.hidden || (!!vis && !tokenSeen(t, vis)));
  unseenCache.set(s, { rev: s.rev, f }); return f;
}
