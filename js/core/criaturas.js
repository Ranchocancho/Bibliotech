// Criaturas del SRD con sus acciones reales (data/acciones.js, generado del texto de cada perfil):
// ataques con todos sus daños, acciones con salvación (alientos, miradas…), recargas, usos por día,
// ataque múltiple, lanzamiento de conjuros, acciones adicionales, reacciones y acciones legendarias.
// Aquí se decide qué puede hacer una criatura ahora (economía del turno y usos) y se apunta lo gastado.
import { store, uid } from "./store.js";

let ACC = null, loading = null;
export const kitsReady = () => !!ACC;
export function loadKits() {
  if (ACC) return Promise.resolve(ACC);
  return loading || (loading = import("../data/acciones.js").then(m => (ACC = m.ACCIONES)));
}
const baseName = n => String(n || "").replace(/\s+\d+$/, "").trim();
/** Las acciones del SRD de una ficha de criatura (por su nombre del compendio). */
export const kitOf = t => !ACC || !t || t.kind === "pc" ? null : ACC[t.srd] || ACC[baseName(t.name)] || null;

const WORDS = { dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6 };
/** Ataques que permite su Ataque múltiple (1 si no tiene). */
export function multiN(kit) {
  const m = kit && (kit.act || []).find(a => a.type === "multi"); if (!m) return 1;
  const w = (m.txt.match(/realiza (dos|tres|cuatro|cinco|seis) ataques/i) || [])[1];
  return w ? WORDS[w.toLowerCase()] : 2;
}
export const multiOf = kit => kit && (kit.act || []).find(a => a.type === "multi");
export const spellsOf = kit => kit && [...(kit.act || []), ...(kit.bonus || [])].find(a => a.type === "spells");
/** Ataques de arma o de conjuro de la criatura, en el formato de combate.js. */
export function kitAttacks(kit) {
  return (kit.act || []).filter(a => a.type === "atk").map(a => ({
    name: a.n, atk: a.atk, expr: (a.dmg || []).map(d => d.e).join("+") || "0",
    type: [...new Set((a.dmg || []).map(d => d.t))].join(" y "),
    rng: a.range ? `${a.range} m` : `${a.reach || "1,5"} m`, note: a.note || null, rider: a.rider || null, cond: a.cond || null, txt: a.txt, srd: true,
    ifAdv: a.ifAdv || null, alt: a.alt || null, ifs: a.ifs || null
  }));
}

/* ---------- Usos: N/día y recargas ---------- */
const ukey = (a, sp) => sp ? "sp:" + sp : a.n;
/** ¿Le quedan usos? { ok, left, txt } */
export function usesLeft(t, a, sp = null, per = null) {
  const k = ukey(a, sp), used = (t.used || {})[k] || 0;
  if (per && per !== "will") return { ok: used < per, left: per - used, txt: `${per - used}/${per} hoy` };
  if (a.day) return { ok: used < a.day, left: a.day - used, txt: `${a.day - used}/${a.day} hoy` };
  if (a.rec) { const off = (t.spent || {})[a.n]; return { ok: !off, left: off ? 0 : 1, txt: off ? `sin recargar (${a.rec}–6)` : `lista · recarga ${a.rec}–6` }; }
  return { ok: true, left: Infinity, txt: "" };
}
export function markUse(tokId, a, sp = null, per = null) {
  store.commit("token", s => {
    const t = s.tokens.find(x => x.id === tokId); if (!t) return;
    if ((per && per !== "will") || a.day) { t.used = { ...(t.used || {}) }; const k = ukey(a, sp); t.used[k] = (t.used[k] || 0) + 1; }
    if (a.rec) t.spent = { ...(t.spent || {}), [a.n]: true };
  });
}
/** Descanso de la criatura: recupera usos por día y recargas (lo decide el máster). */
export const restKit = tokId => store.commit("token", s => { const t = s.tokens.find(x => x.id === tokId); if (t) { t.used = {}; t.spent = {}; t.leg = 0; } });

/**
 * Al empezar el turno de una criatura: tira la recarga de lo gastado (d6) y recupera sus acciones legendarias.
 * Se llama dentro del commit del turno (st es el estado que se está modificando).
 */
export function onTurnStart(st, t) {
  const kit = kitOf(t); if (!kit) return;
  t.leg = 0;
  const all = [...(kit.act || []), ...(kit.bonus || []), ...(kit.react || [])];
  for (const a of all) {
    if (!a.rec || !(t.spent || {})[a.n]) continue;
    const d = 1 + Math.floor(Math.random() * 6), ok = d >= a.rec;
    if (ok) { t.spent = { ...t.spent }; delete t.spent[a.n]; }
    st.rolls = st.rolls || [];
    st.rolls.push({ id: uid("tir"), at: Date.now(), who: null, whoName: "Recarga", kind: "free", label: `Recarga de ${a.n} (${t.name}): ${a.rec}–6`, expr: "1d6",
      dice: [{ d: 6, v: d }], total: d, nat: null, secret: true, status: "ok", note: ok ? "Recargada: puede volver a usarla" : "Aún no se ha recargado", tok: t.id });
  }
}

/* ---------- Economía del turno de una criatura ---------- */
// Igual que turnos.eco(): lo gastado vale para el turno en curso; la reacción, hasta el inicio de su siguiente turno
function ecoNow(b, t) {
  const e = t.eco || {}, fresh = e.seq !== b.seq || b.turn !== t.id, reactUsed = e.react != null && e.react >= ((b.starts || {})[t.id] || 0);
  return fresh ? { seq: b.seq, mov: 0, act: false, bonus: false, dash: false, react: reactUsed ? e.react : null, n: 0 } : { ...e, react: reactUsed ? e.react : null };
}
/**
 * ¿Puede usar ahora esta acción? Devuelve null si sí, o el motivo si no.
 * use: "act" | "bonus" | "react" | "leg"; attack: es un ataque (cuenta para el Ataque múltiple).
 */
export function gate(s, t, use, { attack = false } = {}) {
  const b = s.board; if (!b || b.combat !== "live") return null;
  const kit = kitOf(t), e = ecoNow(b, t);
  if (use === "leg") {
    if (b.turn === t.id) return "Las acciones legendarias se usan justo después del turno de otra criatura, no en el suyo.";
    const n = (kit && kit.legN) || 3; if ((t.leg || 0) >= n) return `Ya ha gastado sus ${n} acciones legendarias de esta ronda.`;
    return null;
  }
  if (use === "react") return e && e.react ? "Ya ha usado su reacción en esta ronda." : null;
  if (b.turn !== t.id) return `No es el turno de ${t.name}: fuera de su turno solo reacciones.`;
  if (use === "bonus") return e && e.bonus ? "Ya ha usado su acción adicional en este turno." : null;
  if (!e || !e.act) return null;
  if (attack) { const n = multiN(kit); if (n > 1 && (e.n || 0) < n && e.multi) return null; return n > 1 && e.multi ? `Ya ha hecho sus ${n} ataques del Ataque múltiple.` : "Ya ha usado su acción en este turno."; }
  return "Ya ha usado su acción en este turno.";
}
/** Apunta lo gastado: la acción (y cuántos ataques lleva), la adicional, la reacción o una legendaria. */
export function spendKit(tokId, use, { attack = false } = {}) {
  store.commit("token", s => {
    const t = s.tokens.find(x => x.id === tokId), b = s.board; if (!t || !b) return;
    if (use === "leg") { t.leg = (t.leg || 0) + 1; return; }
    const e = { ...ecoNow(b, t) };
    if (use === "react") e.react = b.seq; else if (use === "bonus") e.bonus = true;
    else { e.act = true; if (attack) { e.n = (e.n || 0) + 1; e.multi = multiN(kitOf(t)) > 1; } }
    t.eco = e;
  });
}

/* ---------- Efectos al acertar y de las salvaciones ---------- */
const COND = ["agarrado", "apresado", "asustado", "aturdido", "cegado", "derribado", "ensordecido", "envenenado", "hechizado", "incapacitado", "inconsciente", "paralizado", "petrificado"];
/** Estados que impone un texto del SRD («tendrá el estado de paralizado»…). */
export function condsIn(txt) {
  const out = new Set();
  for (const m of String(txt || "").matchAll(/estados? de ([a-záéíóúñ]+)(?: y ([a-záéíóúñ]+))?/gi)) [m[1], m[2]].forEach(w => { if (!w) return; const id = w.toLowerCase().replace(/a$/, "o").replace(/as$/, "os"); if (COND.includes(id)) out.add(id); });
  return [...out];
}
const SIZE = { "Diminuta": 0.5, "Pequeña": 0.7, "Mediana": 1, "Grande": 1.6, "Enorme": 2.4 };
/** «Si el objetivo es una criatura Grande o más pequeña…»: ¿cumple el objetivo el tamaño? */
export function sizeOk(txt, target) {
  const m = String(txt || "").match(/criatura (Diminuta|Pequeña|Mediana|Grande|Enorme) o más pequeña/);
  return !m || (+target.size || 1) <= SIZE[m[1]] + 0.01;
}
