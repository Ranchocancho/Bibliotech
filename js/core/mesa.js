// La mesa táctica en directo: cargar escenas, iniciativa y turnos.
import { store } from "./store.js";
import { sceneToBoard, blankScene } from "../data/escenas.js";
import { presence } from "./presence.js";
import { cloneFloors } from "./plantas.js";

export const hpOf = (s, t) => {
  if (t.kind === "pc") { const c = s.characters.find(x => x.id === t.char); return c ? { cur: c.hp.cur, max: c.hp.max, temp: c.hp.temp } : null; }
  return t.maxhp ? { cur: t.hp, max: t.maxhp } : null;
};
export const charOf = (s, t) => t.kind === "pc" ? s.characters.find(x => x.id === t.char) : null;
export const order = s => (s.tokens || []).filter(t => t.init != null && t.init !== "").sort((a, b) => b.init - a.init || (a.kind === "pc" ? -1 : 1));

/** Por defecto solo bajan a la mesa los personajes de quien está conectado (y los que ya estaban en ella). */
export const onlineChars = s => s.characters.filter(c => (c.owner && presence.online(c.owner)) || (s.tokens || []).some(t => t.kind === "pc" && t.char === c.id));
function place(s, scene) {
  const { board, tokens } = sceneToBoard(scene, onlineChars(s), s.tokens);
  s.board = board; s.tokens = tokens; s.presentation = { type: "tactical" };
}
export const loadScene = sceneId => store.commit("board", s => { const sc = s.scenes.find(x => x.id === sceneId); if (sc) place(s, sc); });
export const blankBoard = () => store.commit("board", s => place(s, blankScene("Mesa improvisada", null, 16, 11, "piedra")));
export const clearBoard = () => store.commit("board", s => { s.board = null; s.tokens = []; if (s.presentation && s.presentation.type === "tactical") s.presentation = null; });
/** El máster añade o retira personajes de la situación táctica. */
export const addPC = charId => store.commit("board", s => {
  const ch = s.characters.find(c => c.id === charId); if (!s.board || !ch || s.tokens.some(t => t.kind === "pc" && t.char === charId)) return;
  const b = s.board, busy = (c, r) => b.terrain[c + "," + r] === "muro" || s.tokens.some(t => t.c === c && t.r === r) || (b.props || []).some(p => p.c === c && p.r === r && p.block);
  const near = s.tokens.find(t => t.kind === "pc") || { c: 1, r: 1 };
  let at = null;
  for (let d = 0; d < Math.max(b.cols, b.rows) && !at; d++) for (let r = near.r - d; r <= near.r + d && !at; r++) for (let c = near.c - d; c <= near.c + d && !at; c++)
    if (c >= 0 && r >= 0 && c < b.cols && r < b.rows && !busy(c, r)) at = { c, r };
  at = at || { c: 0, r: 0 };
  s.tokens.push({ id: "t" + Math.random().toString(36).slice(2, 9), kind: "pc", char: ch.id, owner: ch.owner || null, name: ch.name, c: at.c, r: at.r, size: 1, init: null, conds: [] });
});
export const removePC = charId => store.commit("board", s => {
  const t = s.tokens.find(x => x.kind === "pc" && x.char === charId); if (!t) return;
  s.tokens = s.tokens.filter(x => x !== t);
  if (s.board && s.board.turn === t.id) s.board.turn = null;
});
/** Guarda la mesa actual (con sus enemigos) como escena para reutilizarla. */
export const saveBoardAsScene = (name, placeId) => store.commit("board", s => {
  const b = s.board; if (!b) return;
  s.scenes.push({ id: "esc-" + Math.random().toString(36).slice(2, 8), name, place: placeId || null, cols: b.cols, rows: b.rows, terrain: { ...b.terrain }, ...(b.elev ? { elev: { ...b.elev } } : {}), props: b.props.map(p => ({ ...p })),
    ambient: b.ambient || "interior", sound: b.sound || "", region: b.region || "", lavaDmg: b.lavaDmg || "", fallH: b.fallH || 3, ...(b.light ? { light: b.light } : {}), ...(b.fog === false ? { fog: false } : {}), deployRad: (b.deploy || {}).rad || 2, tokens: s.tokens.filter(t => t.kind !== "pc").map(t => ({ ...t, init: null })), start: (s.tokens.find(t => t.kind === "pc") || { c: 1, r: 1 }),
    ...(cloneFloors(b, { dropPCs: true }) ? { floors: cloneFloors(b, { dropPCs: true }), floor: b.floor || 0 } : {}) });
});

const d20 = () => 1 + Math.floor(Math.random() * 20);
export const rollFoes = () => store.commit("board", s => s.tokens.forEach(t => { if (t.kind !== "pc") t.init = d20() + (+t.initBonus || 0); }));
export const startCombat = () => store.commit("board", s => { const o = order(s); s.board.turn = o.length ? o[0].id : null; s.board.round = 1; });
export const nextTurn = () => store.commit("board", s => {
  const o = order(s).filter(t => { const h = hpOf(s, t); return !h || h.cur > 0 || t.kind === "pc"; });
  if (!o.length) return;
  const i = o.findIndex(t => t.id === s.board.turn);
  if (i < 0 || i === o.length - 1) { s.board.turn = o[0].id; s.board.round = (s.board.round || 0) + 1; } else s.board.turn = o[i + 1].id;
});
export const endCombat = () => store.commit("board", s => { s.tokens.forEach(t => (t.init = null)); s.board.turn = null; s.board.round = 0; });

/** Daño o curación a una ficha: en los personajes va a su hoja; en los enemigos, a la ficha. */
export const applyHP = (tokenId, delta) => store.commit("char", s => {
  const t = s.tokens.find(x => x.id === tokenId); if (!t) return;
  if (t.kind === "pc") {
    const c = s.characters.find(x => x.id === t.char); if (!c) return;
    if (delta < 0) { const d = -delta, tmp = Math.min(c.hp.temp || 0, d); c.hp.temp = (c.hp.temp || 0) - tmp; c.hp.cur = Math.max(0, c.hp.cur - (d - tmp)); }
    else c.hp.cur = Math.min(c.hp.max, c.hp.cur + delta);
  } else t.hp = Math.max(0, Math.min(t.maxhp, t.hp + delta));
});
