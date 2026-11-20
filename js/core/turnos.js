// Estructura de un combate (reglas 2024): posiciones → iniciativa → turnos en orden → rondas.
// En su turno, cada criatura tiene movimiento (su velocidad), una acción, una acción adicional y una reacción por ronda.
// También: alcance, cobertura y ventaja/desventaja según los estados, con el motivo escrito.
import { vexOn } from "./maestria.js";
import { store } from "./store.js";
import { publish, roll } from "./dados.js";
import { uid } from "./store.js";
import { currentUser } from "./session.js";
import { toast } from "./ui.js";
import { onTurnStart } from "./criaturas.js";
import { charOf, hpOf, order } from "./mesa.js";
import { TERRAIN, PROPS, isDoor, doorBlocksSight } from "../data/mapas.js";

const CELL_M = 1.5;
export const dist = (a, b) => Math.max(Math.abs(a.c - b.c), Math.abs(a.r - b.r));
export const metres = cells => (cells * CELL_M).toLocaleString("es-ES") + " m";

/* ---------- Fases ---------- */
export const phase = s => (s.board && s.board.combat) || null; // null | "init" | "live"
export const current = s => s.board && s.board.turn ? s.tokens.find(t => t.id === s.board.turn) : null;
const alive = (s, t) => { const h = hpOf(s, t); return t.kind === "pc" || !h || h.cur > 0; };
export const pending = s => s.tokens.filter(t => !t.hidden && (t.init == null || t.init === "") && alive(s, t));

/** 1. Iniciar combate: se borra la iniciativa y los enemigos tiran la suya (en secreto, la ve el máster). */
/** ¿Puede actuar esta figura ahora? En combate, solo en su turno (fuera de él, solo reacciones). */
export function canActNow(s, tokId, use = "act") {
  if (phase(s) !== "live" || use === "react") return true;
  return s.board.turn === tokId;
}
// Cierra lo que quedara a medias (ataques, daños, reacciones): un combate nuevo empieza siempre de cero
function closePending(st) { (st.rolls || []).forEach(r => { if (r.status === "pending" && (r.kind === "attack" || r.kind === "damage" || r.kind === "oa" || r.saves)) { r.status = "void"; r.note = "Quedó sin resolver al terminar el combate"; } }); }

export function beginCombat() {
  const s0 = store.get(), foes = s0.tokens.filter(t => t.kind !== "pc");
  store.commit("board", s => { s.tokens.forEach(t => { t.init = null; t.eco = null; t.conds = (t.conds || []).filter(c => !["esquivando", "destrabado"].includes(c.id)); }); s.board.combat = "init"; s.board.turn = null; s.board.round = 0; s.board.from = null; s.board.starts = {}; s.board.seq = (s.board.seq || 0) + 1; s.board.combatAt = Date.now(); });
  store.commit("roll", closePending);
  if (!foes.length) return;
  // Todas las criaturas tiran a la vez: una sola tirada (secreta) con un d20 por criatura
  const res = foes.map(t => { const b = +t.initBonus || 0, r = roll(`1d20${b >= 0 ? "+" : ""}${b}`); return { id: t.id, name: t.name, total: r.total, dice: r.dice }; });
  const me = currentUser(s0);
  store.commit("roll", st => { st.rolls = st.rolls || []; st.rolls.push({ id: uid("tir"), at: Date.now(), who: me ? me.id : null, whoName: me ? me.name : "", kind: "init",
    label: `Iniciativa de las criaturas (${foes.length})`, expr: `${foes.length}d20`, dice: res.flatMap(x => x.dice), total: null, nat: null, secret: true, status: "ok", inits: res.map(({ id, name, total }) => ({ id, name, total })), skin: "obsidiana" }); });
  store.commit("token", s => res.forEach(x => { const k = s.tokens.find(t => t.id === x.id); if (k) k.init = x.total; }));
}
/** Un personaje tira su iniciativa (d20 + Destreza). */
export function rollInit(tokenId) {
  const s = store.get(), t = s.tokens.find(x => x.id === tokenId), c = t && charOf(s, t);
  // Una sola iniciativa por combate: si ya la tiene, no se vuelve a tirar (el máster puede corregirla a mano)
  if (!t || (t.init != null && t.init !== "")) { if (t) toast(`${c ? c.name : t.name} ya tiene iniciativa (${t.init}).`); return; }
  const m = c ? Math.floor(((+c.abilities.des || 10) - 10) / 2) + (+c.initBonus || 0) : +t.initBonus || 0;
  const r = publish({ kind: "init", expr: `1d20${m >= 0 ? "+" : ""}${m}`, label: `Iniciativa de ${c ? c.name : t.name}`, by: t.id });
  store.commit("token", st => { const k = st.tokens.find(x => x.id === tokenId); if (k) k.init = r.total; });
}
/** 2. Con todas las iniciativas, empieza la ronda 1. */
export function startRounds() {
  store.commit("board", s => {
    const o = order(s).filter(t => alive(s, t)); if (!o.length) return;
    s.board.combat = "live"; s.board.round = 1; advanceTo(s, o[0]);
  });
}
function advanceTo(s, t) {
  s.board.turn = t.id; s.board.seq = (s.board.seq || 0) + 1;
  s.board.starts = { ...(s.board.starts || {}), [t.id]: s.board.seq };
  s.board.from = { c: t.c, r: t.r };
  // Se quitan los estados que caducan al empezar este turno (Esquivar, Debilitar, Ralentizar…) y Molestar ya pasado
  const st = s.board.starts;
  s.tokens.forEach(k => {
    if (k.conds) k.conds = k.conds.filter(c => !(c.seq != null && (st[c.until || k.id] || 0) > c.seq) && !(c.id === "molestar" && (st[k.id] || 0) > c.vseq && t.id !== k.id));
  });
  onTurnStart(s, t); // criaturas: recarga (d6) de lo gastado y acciones legendarias de nuevo
}
/** 3. Terminar el turno: pasa a la siguiente criatura en pie; al dar la vuelta, nueva ronda. */
export function endTurn() {
  store.commit("turn", s => {
    const o = order(s).filter(t => alive(s, t)); if (!o.length) return;
    const i = o.findIndex(t => t.id === s.board.turn);
    if (i < 0 || i === o.length - 1) { s.board.round = (s.board.round || 0) + 1; advanceTo(s, o[0]); }
    else advanceTo(s, o[i + 1]);
  });
}
export function stopCombat() {
  import("./experiencia.js").then(m => m.postCombatXP());
  store.commit("board", s => { s.tokens.forEach(t => { t.init = null; t.eco = null; t.conds = (t.conds || []).filter(c => !["esquivando", "destrabado"].includes(c.id)); }); s.board.combat = null; s.board.turn = null; s.board.round = 0; s.board.from = null; s.board.starts = {}; s.board.seq = (s.board.seq || 0) + 1; });
  store.commit("roll", closePending);
}

/* ---------- Economía de acciones del turno ---------- */
export function speedOf(s, t) { const c = charOf(s, t), v = +(c ? c.speed : t.speed) || 9; return has(t, "ralentizado") ? Math.max(0, v - 3) : v; }
/** Lo gastado en el turno actual (si el turno ha cambiado, empieza de cero). */
export function eco(s, t) {
  const b = s.board || {}, e = t.eco || {};
  const fresh = e.seq !== b.seq || b.turn !== t.id;
  const reactUsed = e.react != null && e.react >= ((b.starts || {})[t.id] || 0);
  return fresh ? { seq: b.seq, mov: 0, act: false, bonus: false, dash: false, react: reactUsed ? e.react : null }
    : { ...e, react: reactUsed ? e.react : null };
}
export const moveBudget = (s, t) => speedOf(s, t) * (eco(s, t).dash ? 2 : 1);
/** Marca algo gastado en el turno: "act" | "bonus" | "dash" | "react" | {mov: metros} */
export function spend(tokenId, what) {
  store.commit("token", s => {
    const t = s.tokens.find(x => x.id === tokenId); if (!t) return;
    const e = eco(s, t);
    if (what === "react") e.react = s.board.seq; else if (typeof what === "object") e.mov = Math.round((e.mov + what.mov) * 10) / 10; else e[what] = true;
    if (what === "dash") e.act = true;
    t.eco = e;
  });
}
export const toggle = (tokenId, key) => store.commit("token", s => { const t = s.tokens.find(x => x.id === tokenId); if (!t) return; const e = eco(s, t); e[key] = key === "react" ? (e.react ? null : s.board.seq) : !e[key]; t.eco = e; });

// Acciones del manual (2024) con su entrada del glosario
export const ACCIONES = [
  ["Atacar", "Ataca con un arma o sin armas."], ["Magia", "Lanza un conjuro o usa un objeto mágico."], ["Correr", "Ganas movimiento extra igual a tu velocidad."],
  ["Destrabarse", "Tu movimiento no provoca ataques de oportunidad este turno."], ["Esquivar", "Los ataques contra ti tienen desventaja hasta tu siguiente turno."],
  ["Ayudar", "Das ventaja a un aliado en su siguiente prueba o ataque."], ["Esconderse", "Prueba de Destreza (Sigilo) CD 15 para ocultarte."],
  ["Buscar", "Prueba de Sabiduría para encontrar algo."], ["Estudiar", "Prueba de Inteligencia para recordar o analizar."],
  ["Influir", "Prueba de Carisma o Sabiduría para cambiar la actitud de alguien."], ["Preparar una acción", "Preparas una acción para un desencadenante."], ["Utilizar", "Usas un objeto que requiere una acción."]
];

/* ---------- Alcance ---------- */
/** "24/96 m" → {n: 24, l: 96}; melé por defecto 1,5 m (alcance → 3 m). */
export function rangeOf(w) {
  const t = `${w.rng || ""} ${w.notes || ""} ${w.al || ""}`.toLowerCase().replace(/,/g, ".");
  const two = t.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*m/); if (two) return { n: +two[1], l: +two[2], ranged: true, melee: /(^|\s)(1\.5|3) m o/.test(t) };
  if (/toque/.test(t)) return { n: 1.5, l: 1.5 };
  if (/personal|uno mismo/.test(t)) return { n: 0, l: 0, self: true };
  const one = t.match(/(\d+(?:\.\d+)?)\s*m/); if (one) return { n: +one[1], l: +one[1], ranged: +one[1] > 3 };
  if (/alcance/.test(t)) return { n: 3, l: 3 };
  return { n: 1.5, l: 1.5 };
}
/** Estado del alcance: "ok" | "long" (desventaja) | "out" */
/** Casillas que sobresale una criatura desde su casilla central (Grande 2×2 ≈ 0,5; Enorme 3×3 = 1; Gargantuesca 4×4 = 1,5). */
const reachOut = t => Math.max(0, (Math.ceil(+t.size || 1) - 1) / 2);
/** Distancia en casillas entre los bordes de dos criaturas (las grandes alcanzan desde su borde, no desde su centro). */
export const gap = (a, b) => Math.max(0, dist(a, b) - Math.floor(reachOut(a) + reachOut(b)));
export function inRange(rng, a, b) {
  const d = gap(a, b) * CELL_M;
  return d <= rng.n + 0.01 ? "ok" : d <= rng.l + 0.01 ? "long" : "out";
}

/* ---------- Cobertura ---------- */
/** Líneas desde el centro del atacante a las 4 esquinas del objetivo: muros, puertas cerradas y criaturas tapan. */
export function cover(s, a, b) {
  const g = s.board, blocks = (c, r) => { const tt = (g.terrain || {})[c + "," + r]; return !!(TERRAIN[tt] && TERRAIN[tt].wall) || (g.props || []).some(p => isDoor(p) && !p.open && p.c === c && p.r === r); };
  // Mobiliario y escenografía: media cobertura (mesas, barriles, árboles…) o tres cuartos (columnas, estatuas, peñascos)
  const propCover = (c, r) => { let best = 0; for (const p of g.props || []) if (p.c === c && p.r === r && !isDoor(p)) { const v = (PROPS[p.k] || {}).cover; best = Math.max(best, v === "3q" ? 2 : v === "half" ? 1 : 0); } return best; };
  let furn = 0;
  const creature = (c, r) => s.tokens.some(t => t.c === c && t.r === r && t.id !== a.id && t.id !== b.id && !t.hidden && alive(s, t));
  let blocked = 0, soft = false;
  for (const [dx, dy] of [[0.05, 0.05], [0.95, 0.05], [0.05, 0.95], [0.95, 0.95]]) {
    const x0 = a.c + 0.5, y0 = a.r + 0.5, x1 = b.c + dx, y1 = b.r + dy, n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 6);
    let hit = false;
    for (let i = 1; i < n; i++) {
      const c = Math.floor(x0 + (x1 - x0) * i / n), r = Math.floor(y0 + (y1 - y0) * i / n);
      if ((c === a.c && r === a.r) || (c === b.c && r === b.r)) continue;
      if (blocks(c, r)) { hit = true; break; }
      if (creature(c, r)) soft = true;
      furn = Math.max(furn, propCover(c, r));
    }
    if (hit) blocked++;
  }
  if (blocked >= 4) return { level: "total", bonus: null, txt: "cobertura total: no se puede elegir como objetivo" };
  if (blocked === 3 || furn === 2) return { level: "3/4", bonus: 5, txt: blocked === 3 ? "cobertura de tres cuartos (+5 CA)" : "tres cuartos por la escenografía (+5 CA)" };
  if (!blocked && furn === 1) return { level: "1/2", bonus: 2, txt: "media cobertura por la escenografía (+2 CA)" };
  if (blocked >= 1 || soft) return { level: "1/2", bonus: 2, txt: blocked ? "cobertura media (+2 CA)" : "media cobertura por otra criatura (+2 CA)" };
  return { level: null, bonus: 0, txt: "" };
}

/* ---------- Ventaja y desventaja según las reglas ---------- */
const has = (t, id) => (t.conds || []).some(c => c.id === id && !expired(t, c));
// Un estado con «until» (efectos de maestría) dura hasta que empieza el turno de esa otra figura
const expired = (t, c) => c.seq != null && store.get().board && ((store.get().board.starts || {})[c.until || t.id] || 0) > c.seq;
export function modifiers(s, a, b, rng) {
  const adv = [], dis = [], d = dist(a, b), close = d <= 1;
  if (has(a, "invisible")) adv.push("eres invisible");
  if (has(a, "cegado")) dis.push("estás cegado");
  if (has(a, "envenenado")) dis.push("estás envenenado");
  if (has(a, "apresado")) dis.push("estás apresado");
  if (has(a, "derribado")) dis.push("estás derribado");
  if (has(a, "asustado")) dis.push("estás asustado");
  if (has(a, "debilitado")) dis.push("Debilitar (maestría): su próximo ataque");
  if (vexOn(s, a, b)) adv.push("Molestar (maestría)");
  for (const [id, why] of [["cegado", "el objetivo está cegado"], ["apresado", "el objetivo está apresado"], ["aturdido", "el objetivo está aturdido"], ["paralizado", "el objetivo está paralizado"], ["petrificado", "el objetivo está petrificado"], ["inconsciente", "el objetivo está inconsciente"]]) if (has(b, id)) adv.push(why);
  if (has(b, "derribado")) (close ? adv : dis).push(close ? "objetivo derribado a 1,5 m" : "objetivo derribado a distancia");
  if (has(b, "invisible")) dis.push("el objetivo es invisible");
  if (has(b, "esquivando")) dis.push("el objetivo está esquivando");
  if (rng && inRange(rng, a, b) === "long") dis.push("alcance largo");
  if (rng && rng.ranged && !(rng.melee && close) && s.tokens.some(t => t.id !== a.id && t.kind !== a.kind && alive(s, t) && !t.hidden && dist(a, t) <= 1)) dis.push("ataque a distancia con un enemigo a 1,5 m");
  const autoCrit = close && (has(b, "paralizado") || has(b, "inconsciente"));
  return { adv, dis, net: adv.length && !dis.length ? 1 : dis.length && !adv.length ? -1 : 0, autoCrit };
}
export { has as hasCond, alive };
