// Movimiento por turnos con las reglas 2024: se mide siempre desde la casilla donde empezaste el turno,
// cada casilla cuesta 1,5 m (diagonales incluidas), el terreno difícil cuesta el doble, arrastrarse derribado
// también; no se atraviesan muros, objetos macizos, puertas cerradas ni enemigos (sí a los aliados, sin acabar
// encima). Más allá de tu velocidad solo llegas Corriendo, que gasta tu acción.
import { TERRAIN, PROPS, isDoor } from "../data/mapas.js";
import { eco, speedOf, hasCond } from "./turnos.js";
import { climbExtra, elevAt, altOf } from "./alturas.js";

const key = (c, r) => c + "," + r;
const STOP = ["agarrado", "apresado", "paralizado", "aturdido", "inconsciente", "petrificado", "muerto"];

/**
 * Casillas alcanzables por una ficha en su turno.
 * → { from, speed, walk, max, prone, stopped, cells: Map("c,r" → { cost (m), dash, dif, occ, prev }) }
 */
export function reachMap(s, t, { dm = false } = {}) {
  const g = s.board; if (!g) return null;
  const e = eco(s, t), from = e.from || { c: t.c, r: t.r };
  const stopped = STOP.find(c => hasCond(t, c));
  const speed = stopped ? 0 : speedOf(s, t), prone = hasCond(t, "derribado");
  const walk = speed * (e.dash && !e.dashAuto ? 2 : 1);                 // lo que puedes andar sin gastar nada más
  const canDash = !e.act || e.dashAuto || (e.dash && !e.dashAuto);
  const max = e.dash && !e.dashAuto ? walk : walk + (canDash ? speed : 0);
  const T = g.terrain || {}, pc = t.kind === "pc";
  const wall = (c, r) => c < 0 || r < 0 || c >= g.cols || r >= g.rows || !!(TERRAIN[T[key(c, r)]] && TERRAIN[T[key(c, r)]].wall);
  const blocked = (c, r) => wall(c, r) || (g.props || []).some(p => p.c === c && p.r === r && ((PROPS[p.k] || {}).block || (isDoor(p) && !p.open && !dm)));
  const foeAt = (c, r) => s.tokens.some(k => k.id !== t.id && k.c === c && k.r === r && !k.hidden && (k.kind === "pc") !== pc && !(k.conds || []).some(x => ["muerto", "inconsciente"].includes(x.id)));
  // Trepa sin coste extra quien tiene velocidad trepando o vuela (SRD «Trepar» y «Volar»)
  const spd = String(t.speed || "") + " " + String(((s.characters.find(x => x.id === t.char) || {}).speeds) || "");
  const climber = /trep|vol|climb|fly/i.test(spd) || altOf(t) > 0;
  const anyAt = (c, r) => s.tokens.some(k => k.id !== t.id && k.c === c && k.r === r);
  const cells = new Map([[key(from.c, from.r), { cost: 0, dash: false, dif: false, occ: false, prev: null }]]);
  const open = [[0, from.c, from.r]];
  while (open.length) {
    open.sort((a, b) => a[0] - b[0]);
    const [cost, c, r] = open.shift();
    if (cost > (cells.get(key(c, r)) || { cost: 1e9 }).cost) continue;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dc && !dr) continue;
      const nc = c + dc, nr = r + dr;
      if (blocked(nc, nr) || foeAt(nc, nr)) continue;
      if (dc && dr && (blocked(c + dc, r) && blocked(c, r + dr))) continue; // no se cuelan esquinas entre muros
      const dif = !!(TERRAIN[T[key(nc, nr)]] && TERRAIN[T[key(nc, nr)]].dif);
      const up = climbExtra(g, { c, r }, { c: nc, r: nr }, { dif, climber });
      const step = 1.5 * (dif ? 2 : 1) * (prone ? 2 : 1) + up, nCost = Math.round((cost + step) * 10) / 10;
      if (nCost > max + 0.01) continue;
      const prev = cells.get(key(nc, nr));
      if (prev && prev.cost <= nCost) continue;
      const pv = cells.get(key(c, r)) || {};
      cells.set(key(nc, nr), { cost: nCost, dash: nCost > walk + 0.01, dif, occ: anyAt(nc, nr), prev: key(c, r), climb: Math.round(((pv.climb || 0) + up) * 10) / 10 });
      open.push([nCost, nc, nr]);
    }
  }
  return { from, speed, walk, max, prone, stopped, cells, g };
}
/** Camino de casillas desde el origen del turno hasta una casilla (vacío si no se llega). */
export function pathTo(R, c, r) {
  const out = []; let k = key(c, r), guard = 0;
  if (!R || !R.cells.has(k)) return out;
  while (k && guard++ < 500) { const [x, y] = k.split(",").map(Number); out.unshift({ c: x, r: y }); k = R.cells.get(k).prev; }
  return out;
}
/** Texto breve para la punta del cursor. */
export function moveHint(R, c, r) {
  if (!R) return "";
  if (R.deploy) { const y = R.cells.get(key(c, r)); return !y ? "Fuera de la zona de inicio" : y.occ ? "Casilla ocupada" : "Zona de inicio"; }
  const x = R.cells.get(key(c, r)), m = n => n.toLocaleString("es-ES", { maximumFractionDigits: 1 });
  if (R.stopped) return `No puedes moverte (${R.stopped})`;
  if (!x) return "No llegas";
  if (x.occ) return "Casilla ocupada";
  const z = R.g ? elevAt(R.g, c, r) : 0;
  return `${m(x.cost)} de ${m(R.walk)} m${x.dash ? " · Correr: gastas tu acción" : ""}${x.dif ? " · terreno difícil" : ""}${x.climb ? ` · trepando (+${m(x.climb)} m)` : ""}${z ? ` · altura ${z > 0 ? "+" : "−"}${m(Math.abs(z))} m` : ""}${R.prone ? " · arrastrándote" : ""}`;
}
