// Plantas (pisos) de un mapa táctico: subir una torre, bajar a los sótanos de una mazmorra…
// La planta activa vive en los campos de siempre (cols, rows, terrain, props y la lista de fichas);
// las demás se guardan dentro del propio mapa, en grid.floors[i] = { name, cols, rows, terrain, props, tokens }.
// Así todo lo demás (movimiento, visión, ataques, 3D) sigue funcionando igual sobre la planta que se ve.
import { isWallT } from "../data/mapas.js";

export const floorsOf = g => (g && Array.isArray(g.floors) && g.floors.length ? g.floors : [{ name: "Planta baja" }]);
export const floorIdx = g => Math.max(0, Math.min(floorsOf(g).length - 1, (g && g.floor) || 0));
export const floorName = g => (floorsOf(g)[floorIdx(g)] || {}).name || "Planta baja";
const nid = () => "t" + Math.random().toString(36).slice(2, 9);
const isWall = (g, c, r) => isWallT((g.terrain || {})[c + "," + r]);

// Casilla libre más cercana (para los que suben o bajan por la escalera)
function spot(g, busy, c0, r0) {
  c0 = Math.max(0, Math.min(g.cols - 1, c0)); r0 = Math.max(0, Math.min(g.rows - 1, r0));
  for (let d = 0; d < Math.max(g.cols, g.rows); d++)
    for (let r = r0 - d; r <= r0 + d; r++) for (let c = c0 - d; c <= c0 + d; c++) {
      if (c < 0 || r < 0 || c >= g.cols || r >= g.rows || Math.max(Math.abs(c - c0), Math.abs(r - r0)) !== d) continue;
      if (!isWall(g, c, r) && !busy.has(c + "," + r)) return { c, r };
    }
  return { c: c0, r: r0 };
}

/** Cambia la planta que hay sobre la mesa. carry: ids de las fichas que van con la vista. Devuelve la nueva lista de fichas. */
export function swapFloor(g, tokens, to, carry = new Set()) {
  const fl = floorsOf(g).map(f => ({ ...f })), cur = floorIdx(g);
  if (to === cur || !fl[to]) return tokens;
  const goes = tokens.filter(t => carry.has(t.id)), stays = tokens.filter(t => !carry.has(t.id));
  fl[cur] = { name: fl[cur].name || "Planta", cols: g.cols, rows: g.rows, terrain: g.terrain || {}, elev: g.elev || {}, props: g.props || [], tokens: stays };
  const T = fl[to];
  g.cols = T.cols || g.cols; g.rows = T.rows || g.rows; g.terrain = T.terrain || {}; g.elev = T.elev || {}; g.props = T.props || [];
  const arriving = (T.tokens || []).map(t => ({ ...t }));
  const busy = new Set(arriving.map(t => t.c + "," + t.r));
  const moved = goes.map(t => { const p = spot(g, busy, t.c, t.r); busy.add(p.c + "," + p.r); const m = { ...t, c: p.c, r: p.r }; delete m.eco; return m; });
  fl[to] = { name: T.name || "Planta" };
  g.floors = fl; g.floor = to;
  return [...arriving, ...moved];
}

/** Manda una ficha a otra planta sin cambiar lo que se ve. Devuelve la nueva lista de fichas. */
export function sendToFloor(g, tokens, id, to) {
  const fl = floorsOf(g).map(f => ({ ...f })), cur = floorIdx(g), t = tokens.find(x => x.id === id);
  if (!t || to === cur || !fl[to]) return tokens;
  const T = fl[to], tg = { cols: T.cols || g.cols, rows: T.rows || g.rows, terrain: T.terrain || {} };
  const busy = new Set((T.tokens || []).map(x => x.c + "," + x.r)), p = spot(tg, busy, t.c, t.r);
  const copy = { ...t, c: p.c, r: p.r }; delete copy.eco;
  fl[to] = { ...T, cols: tg.cols, rows: tg.rows, terrain: tg.terrain, props: T.props || [], tokens: [...(T.tokens || []), copy] };
  g.floors = fl;
  return tokens.filter(x => x.id !== id);
}

/** Añade una planta vacía del mismo tamaño: encima (al final) o debajo (un sótano, al principio). */
export function addFloor(g, below = false) {
  const fl = floorsOf(g).map(f => ({ ...f })), cur = floorIdx(g);
  const n = fl.length, name = below ? (fl.filter(f => /^Sótano/.test(f.name)).length ? `Sótano ${fl.filter(f => /^Sótano/.test(f.name)).length + 1}` : "Sótano") : (n === 1 ? "Primera planta" : `Planta ${n}`);
  const terrain = {}; for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) terrain[c + "," + r] = "piedra";
  const blank = { name, cols: g.cols, rows: g.rows, terrain, props: [], tokens: [] };
  if (below) { fl.unshift(blank); g.floor = cur + 1; } else { fl.push(blank); g.floor = cur; }
  g.floors = fl;
  return below ? 0 : fl.length - 1;
}
export function renameFloor(g, i, name) { const fl = floorsOf(g).map(f => ({ ...f })); if (fl[i] && name) { fl[i].name = name.slice(0, 40); g.floors = fl; g.floor = floorIdx(g); } }
/** Quita una planta que no está a la vista (con lo que hubiera en ella). */
export function removeFloor(g, i) {
  const fl = floorsOf(g).map(f => ({ ...f })), cur = floorIdx(g);
  if (i === cur || !fl[i] || fl.length < 2) return;
  fl.splice(i, 1); g.floors = fl; g.floor = i < cur ? cur - 1 : cur;
  if (fl.length === 1) { delete g.floors; g.floor = 0; }
}
/** Copia profunda de las plantas guardadas (para escenas ↔ mesa), con ids nuevos para las fichas. */
export function cloneFloors(g, { newIds = false, dropPCs = false } = {}) {
  if (!g || !Array.isArray(g.floors) || g.floors.length < 2) return null;
  return g.floors.map(f => {
    const o = { ...f };
    if (f.terrain) o.terrain = { ...f.terrain };
    if (f.props) o.props = f.props.map(p => ({ ...p }));
    if (f.tokens) o.tokens = f.tokens.filter(t => !(dropPCs && t.kind === "pc")).map(t => ({ ...t, ...(newIds ? { id: nid() } : {}), init: null }));
    return o;
  });
}
