// Propiedades de maestría de las armas (SRD 5.2.1, p. 98) para quien tiene el rasgo «Maestría con armas».
// La ficha marca el arma con «Maestría: Derribar» (el asistente de creación lo pone solo).
// Automáticas: Debilitar (al acertar) y Molestar (al causar daño). A elección de quien ataca («puedes…»):
// Derribar, Empujar, Ralentizar, Hender y Rozar; Mellar se explica (es el ataque extra de «ligera»).
// Lo que cambia fichas ajenas lo aplica el máster: el jugador lo pide y el máster lo acepta.
import { store, uid } from "./store.js";
import { isDM, currentUser } from "./session.js";
import { charOf } from "./mesa.js";
import { weaponOf } from "../data/equipo.js";
import { prof } from "../data/dnd.js";
import { toast } from "./ui.js";
import { TERRAIN, PROPS, isDoor } from "../data/mapas.js";
import { gap, inRange, alive } from "./turnos.js";
import { attack, attacksOf } from "./combate.js";

export const MASTERY = {
  Debilitar: "Si aciertas a una criatura con esta arma, tendrá desventaja en su próxima tirada de ataque antes del principio de tu siguiente turno.",
  Derribar: "Si aciertas a una criatura con esta arma, puedes obligarla a hacer una tirada de salvación de Constitución (CD 8 más el modificador por característica usado en la tirada de ataque y tu bonificador por competencia). Si la falla, tendrá el estado de derribada.",
  Empujar: "Si aciertas a una criatura con esta arma, puedes empujarla hasta 3 m respecto a ti en línea recta si es Grande o más pequeña.",
  Hender: "Si aciertas a una criatura con una tirada de ataque cuerpo a cuerpo con esta arma, puedes hacer una tirada de ataque cuerpo a cuerpo con el arma contra una segunda criatura que se encuentre a 1,5 m o menos de la primera y que también esté a tu alcance. Si aciertas, la segunda criatura sufrirá el daño del arma, pero no sumarás tu modificador por característica a ese daño salvo que el modificador sea negativo. Solo puedes hacer este ataque extra una vez por turno.",
  Mellar: "Cuando hagas el ataque extra de la propiedad «ligera», puedes hacerlo como parte de la acción de atacar en vez de como acción adicional. Solo puedes hacer este ataque extra una vez por turno.",
  Molestar: "Si aciertas a una criatura con esta arma y le causas daño, tendrás ventaja en tu siguiente tirada de ataque contra esa criatura antes del final de tu siguiente turno.",
  Ralentizar: "Si aciertas a una criatura con esta arma y le causas daño, puedes reducir su velocidad en 3 m hasta el principio de tu siguiente turno. Si la criatura sufre más de un ataque con armas que tengan esta propiedad, la reducción de su velocidad no superará los 3 m.",
  Rozar: "Si tu tirada de ataque con esta arma no acierta a una criatura, puedes causarle una cantidad de daño igual al modificador por característica que hayas usado para hacer la tirada de ataque. Este daño es del mismo tipo que inflija el arma y solo se puede incrementar si aumentas el modificador por característica."
};
const m10 = v => Math.floor(((+v || 10) - 10) / 2);

/** Maestría de un arma de personaje: { n, m (modificador usado), dc } o null. */
export function masteryOf(c, w) {
  const n = (String(w.notes || "").match(/Maestr[ií]a:\s*([A-Za-zÁÉÍÓÚáéíóúñ]+)/) || [])[1];
  if (!n || !MASTERY[n] || !c) return null;
  const wp = weaponOf(w.name), A = c.abilities || {};
  let m;
  if (wp) { const pr = wp.p.toLowerCase(); m = pr.includes("sutil") ? Math.max(m10(A.fue), m10(A.des)) : wp.r === "dist" ? m10(A.des) : m10(A.fue); }
  else m = (+String(w.atk || "").replace(/[^\d-]/g, "") || 0) - prof(c.level || 1);
  return { n, m, dc: 8 + m + prof(c.level || 1) };
}

/** Molestar: ventaja del atacante contra ese objetivo hasta el final de su siguiente turno. */
export function vexOn(s, a, b) {
  const v = a && a.vex; if (!v || v.t !== b.id) return false;
  const st = (s.board && s.board.starts) || {};
  return !((st[a.id] || 0) > v.seq && s.board.turn !== a.id);
}

/* ---------- Lo automático (lo llama quien puede escribir: el máster) ---------- */
/** Al confirmarse un impacto con Debilitar. */
export function onHit(st, r) {
  if (!r || !r.mas || r.masAuto || (r.result !== "hit" && r.result !== "crit")) return;
  r.masAuto = true;
  if (r.mas.n !== "Debilitar") return;
  const t = st.tokens.find(x => x.id === r.target); if (!t) return;
  t.conds = (t.conds || []).filter(c => c.id !== "debilitado");
  t.conds.push({ id: "debilitado", seq: st.board ? st.board.seq || 0 : 0, until: r.tok, src: r.tok, note: "Debilitar" });
}
/** Al aplicarse daño de un ataque con Molestar. */
export function onDamage(st, attackRoll, amt) {
  if (!attackRoll || !attackRoll.mas || attackRoll.mas.n !== "Molestar" || !(amt > 0)) return;
  const a = st.tokens.find(x => x.id === attackRoll.tok); if (!a) return;
  a.vex = { t: attackRoll.target, seq: st.board ? st.board.seq || 0 : 0 };
}

/* ---------- A elección ---------- */
const dmgRowOf = (s, r) => (s.rolls || []).find(x => x.kind === "damage" && x.link === r.id && x.status !== "void");
/** Qué opción de maestría se puede usar ahora en esta tirada de ataque (para el botón). */
export function masteryChoice(s, r) {
  if (!r || r.kind !== "attack" || !r.mas || r.status === "void" || r.status === "pending" || r.masUsed || pending(s, r)) return null;
  const n = r.mas.n, hit = r.result === "hit" || r.result === "crit";
  if (n === "Rozar") return r.result === "miss" && !dmgRowOf(s, r) && r.mas.m > 0 ? { n, label: `Rozar: ${r.mas.m} de daño` } : null;
  if (!hit) return null;
  if (n === "Derribar") return { n, label: `Derribar (salvación de CON CD ${r.mas.dc})` };
  if (n === "Empujar") return { n, label: "Empujar 3 m" };
  if (n === "Ralentizar") { const d = dmgRowOf(s, r); return d && d.applied > 0 ? { n, label: "Ralentizar (−3 m)" } : null; }
  if (n === "Hender") return r.mas.melee && !r.cleaveOf && !cleavedThisTurn(s, r.tok) ? { n, label: "Hender: atacar a otra criatura" } : null;
  return null;
}
const cleavedThisTurn = (s, tok) => (s.rolls || []).some(x => x.tok === tok && x.cleaveOf && x.status !== "void" && s.board && x.seq === s.board.seq);
const pending = (s, r) => (s.rolls || []).some(x => x.kind === "mastery" && x.link === r.id && x.status === "pending");

/** Botón «usar maestría»: el máster lo aplica ya; un jugador lo pide (o, si es suyo del todo, lo hace). */
export async function useMastery(rollId, extra = {}) {
  const s = store.get(), r = (s.rolls || []).find(x => x.id === rollId), ch = masteryChoice(s, r);
  if (!ch) return;
  const me = currentUser(s);
  if (ch.n === "Hender") return cleave(r, extra.target);
  if (ch.n === "Rozar") {
    const { publish } = await import("./dados.js"), t = s.tokens.find(x => x.id === r.target);
    store.commit("roll", st => { const x = st.rolls.find(y => y.id === r.id); if (x) x.masUsed = true; });
    return publish({ kind: "damage", label: `Rozar a ${t ? (charOf(s, t) || t).name : ""}${r.dtype ? " · " + r.dtype : ""}`, expr: String(r.mas.m), by: r.tok, target: r.target, link: r.id, dtype: r.dtype });
  }
  if (isDM(s)) return applyMastery(rollId);
  if (pending(s, r)) { toast("Ya se lo has pedido al máster."); return; }
  const a = s.tokens.find(x => x.id === r.tok), t = s.tokens.find(x => x.id === r.target);
  store.commit("roll", st => { st.rolls.push({ id: uid("mas"), at: Date.now(), who: me ? me.id : null, whoName: me ? me.name : "", kind: "mastery", link: r.id, tok: r.tok, target: r.target,
    label: `${a ? (charOf(s, a) || a).name : ""} usa ${ch.n} contra ${t ? (charOf(s, t) || t).name : ""}`, expr: "", dice: [], total: null, status: "pending", secret: false, seq: s.board ? s.board.seq || 0 : null, mas: r.mas }); });
  toast(`Pedido al máster: ${ch.n}`);
}

/** El máster aplica la maestría de un ataque (o acepta la petición de un jugador). */
export async function applyMastery(rollId, reqId = null) {
  const s = store.get(); if (!isDM(s)) return;
  const r = (s.rolls || []).find(x => x.id === rollId); if (!r || !r.mas) return;
  const a = s.tokens.find(x => x.id === r.tok), t = s.tokens.find(x => x.id === r.target);
  const done = () => store.commit("roll", st => { const x = st.rolls.find(y => y.id === rollId); if (x) x.masUsed = true; st.rolls.forEach(q => { if (q.kind === "mastery" && q.link === rollId && q.status === "pending") q.status = "ok"; }); });
  if (!a || !t) { done(); return; }
  const nm = (charOf(s, t) || t).name;
  if (r.mas.n === "Derribar") {
    const { rollSave, addCond } = await import("./salud.js");
    const res = rollSave(t, "con", r.mas.dc, `Salvación de Constitución de ${nm} (CD ${r.mas.dc}) · Derribar`);
    if (!res.ok) store.commit("token", st => { const k = st.tokens.find(x => x.id === t.id); if (k) addCond(k, "derribado", { src: a.id, note: "Derribar" }); });
    toast(res.ok ? `${nm} supera la salvación y sigue en pie.` : `${nm} cae derribado.`);
  } else if (r.mas.n === "Empujar") {
    if ((+t.size || 1) > 2) toast(`${nm} es demasiado grande para empujarlo (solo Grande o más pequeña).`);
    else { const n = push(s, a, t, 2); toast(n ? `${nm} retrocede ${(n * 1.5).toLocaleString("es-ES")} m.` : `${nm} no tiene sitio para retroceder.`); }
  } else if (r.mas.n === "Ralentizar") {
    store.commit("token", st => { const k = st.tokens.find(x => x.id === t.id); if (!k) return; k.conds = (k.conds || []).filter(c => c.id !== "ralentizado"); k.conds.push({ id: "ralentizado", seq: st.board ? st.board.seq || 0 : 0, until: a.id, src: a.id, note: "Ralentizar" }); });
    toast(`${nm}: −3 m de velocidad hasta el principio del siguiente turno de ${(charOf(s, a) || a).name}.`);
  }
  done();
}

/** Empuja en línea recta, casilla a casilla, mientras no haya muro, objeto que bloquee, puerta cerrada ni otra ficha. */
function push(s, a, t, steps) {
  const dx = Math.sign(t.c - a.c), dy = Math.sign(t.r - a.r); if (!dx && !dy) return 0;
  const g = s.board, T = g.terrain || {}, sz = Math.max(1, Math.ceil(+t.size || 1)), szOf = o => Math.max(1, Math.ceil(+o.size || 1));
  const free = (cc, rr) => {
    for (let i = 0; i < sz; i++) for (let j = 0; j < sz; j++) {
      const x = cc + i, y = rr + j, k = x + "," + y;
      if (x < 0 || y < 0 || x >= g.cols || y >= g.rows) return false;
      if (TERRAIN[T[k]] && TERRAIN[T[k]].wall) return false;
      if ((g.props || []).some(p => p.c === x && p.r === y && ((PROPS[p.k] || {}).block || (isDoor(p) && !p.open)))) return false;
      if (s.tokens.some(o => o.id !== t.id && x >= o.c && x < o.c + szOf(o) && y >= o.r && y < o.r + szOf(o))) return false;
    }
    return true;
  };
  let c = t.c, r = t.r, n = 0;
  while (n < steps && free(c + dx, r + dy)) { c += dx; r += dy; n++; }
  if (n) store.commit("token", st => { const k = st.tokens.find(x => x.id === t.id); if (k) { k.c = c; k.r = r; } });
  return n;
}

/** Hender: ataque a una segunda criatura a 1,5 m de la primera y al alcance; daño sin el modificador si es positivo. */
function cleave(r, targetId) {
  const s = store.get(), a = s.tokens.find(x => x.id === r.tok); if (!a) return;
  const w = attacksOf(s, a).find(x => x.name === r.wname); if (!w) { toast("No encuentro el arma de ese ataque."); return; }
  if (!targetId) return;
  const m = r.mas.m, expr = m > 0 ? w.expr.replace(new RegExp(`\\+${m}$`), "") : w.expr;
  const out = attack(a.id, targetId, { ...w, expr, name: w.name + " (Hender)" }, null, null, { free: true, cleaveOf: r.id });
  if (out) store.commit("roll", st => { const x = st.rolls.find(y => y.id === r.id); if (x) x.masUsed = true; });
}
/** Criaturas válidas para Hender: a 1,5 m o menos de la primera y al alcance del atacante. */
export function cleaveTargets(s, r) {
  const a = s.tokens.find(x => x.id === r.tok), t = s.tokens.find(x => x.id === r.target); if (!a || !t) return [];
  const w = attacksOf(s, a).find(x => x.name === r.wname); if (!w) return [];
  return s.tokens.filter(o => o.id !== a.id && o.id !== t.id && !o.hidden && o.kind !== a.kind && alive(s, o) && gap(o, t) <= 1 && inRange(w.rng, a, o) !== "out");
}
