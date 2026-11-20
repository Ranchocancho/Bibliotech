// Salud y salvaciones según las reglas 2024: daño con PG temporales, caer a 0 PG, salvaciones contra muerte,
// muerte instantánea, concentración al recibir daño, tiradas de salvación con sus modificadores y descansos.
import { store, uid } from "./store.js";
import { publish } from "./dados.js";
import { charOf } from "./mesa.js";
import { findMonster } from "./srd.js";
import { mod, saveBonus, classInfo, prof } from "../data/dnd.js";
import { toast } from "./ui.js";
import { kitOf } from "./criaturas.js";

export const AB_NAME = { fue: "Fuerza", des: "Destreza", con: "Constitución", int: "Inteligencia", sab: "Sabiduría", car: "Carisma" };
export const AB_KEY = Object.fromEntries(Object.entries(AB_NAME).map(([k, n]) => [n.toLowerCase(), k]));

const hasC = (t, id) => (t.conds || []).some(c => c.id === id);
const condLvl = (t, id) => { const c = (t.conds || []).find(x => x.id === id); return c ? +(c.lvl || 1) : 0; };
const addCond = (t, id, extra = {}) => { t.conds = t.conds || []; if (!t.conds.some(c => c.id === id)) t.conds.push({ id, ...extra }); };
const delCond = (t, id) => { t.conds = (t.conds || []).filter(c => c.id !== id); };

/** Puntuaciones de característica de cualquier ficha (personaje o monstruo del compendio). */
export function abilitiesOf(s, t) {
  const c = charOf(s, t); if (c) return c.abilities;
  const m = t.srd && findMonster(t.srd); return (m && m.ab) || t.ab || { fue: 10, des: 10, con: 10, int: 10, sab: 10, car: 10 };
}
/** CD de salvación de los conjuros de un personaje: 8 + competencia + característica de lanzamiento. */
export function spellDC(c) { const ab = classInfo(c.cls).cast; return ab ? 8 + prof(c.level) + mod(c.abilities[ab]) : 10; }
export function spellMod(c) { const ab = classInfo(c.cls).cast; return ab ? mod(c.abilities[ab]) : 0; }

/**
 * Prepara una tirada de salvación: bonificador, ventaja/desventaja, fallo automático y dados extra (Bendición…),
 * cada cosa con su motivo escrito. coverBonus: +2 / +5 a Destreza por cobertura.
 */
export function savePlan(s, t, ab, coverBonus = 0) {
  const c = charOf(s, t), why = [];
  const kit = !c && kitOf(t);
  let bonus = c ? saveBonus(c, ab) : kit && kit.sv && kit.sv[ab] != null ? kit.sv[ab] : mod(abilitiesOf(s, t)[ab]), adv = 0, extra = "", autoFail = false;
  if ((ab === "fue" || ab === "des") && ["paralizado", "aturdido", "inconsciente", "petrificado"].some(x => hasC(t, x))) { autoFail = true; why.push("falla automáticamente (" + ["paralizado", "aturdido", "inconsciente", "petrificado"].find(x => hasC(t, x)) + ")"); }
  if (ab === "des" && hasC(t, "apresado")) { adv--; why.push("desventaja: apresado"); }
  if (ab === "des" && hasC(t, "esquivando")) { adv++; why.push("ventaja: esquivando"); }
  if (ab === "des" && coverBonus) { bonus += coverBonus; why.push(`+${coverBonus} por cobertura`); }
  const ex = condLvl(t, "agotamiento"); if (ex) { bonus -= 2 * ex; why.push(`−${2 * ex} por agotamiento`); }
  if (hasC(t, "bendecido")) { extra += "+1d4"; why.push("+1d4 Bendición"); }
  if (hasC(t, "perdicion")) { extra += "-1d4"; why.push("−1d4 Perdición"); }
  return { bonus, adv: Math.max(-1, Math.min(1, adv)), extra, autoFail, why };
}
/** Tira una salvación ya (publicada en la mesa) y dice si la supera. */
export function rollSave(t, ab, dc, label, opts = {}) {
  const s = store.get(), p = savePlan(s, t, ab, opts.cover || 0);
  const name = (charOf(s, t) || t).name;
  const r = publish({ kind: "save", label: label || `Salvación de ${AB_NAME[ab]} de ${name} (CD ${dc})`, expr: `1d20${p.bonus >= 0 ? "+" : ""}${p.bonus}${p.extra}`, adv: p.adv, by: t.id, why: p.why.length ? p.why : null, secret: !!opts.secret });
  const ok = !p.autoFail && r.total >= dc;
  store.commit("roll", st => { const x = (st.rolls || []).find(y => y.id === r.id); if (x) { x.result = ok ? "save" : "fail"; x.dc = dc; } });
  return { ok, total: r.total, roll: r };
}
/** Salvación sin publicarla (para resolver muchas a la vez en una sola entrada, p. ej. Bola de fuego). */
export function quickSave(s, t, ab, dc, coverBonus = 0) {
  const p = savePlan(s, t, ab, coverBonus);
  const d20 = () => 1 + Math.floor(Math.random() * 20);
  let a = d20(), b = d20(), v = p.adv > 0 ? Math.max(a, b) : p.adv < 0 ? Math.min(a, b) : a;
  let extra = 0; if (p.extra) for (const m of p.extra.matchAll(/([+-])1d4/g)) extra += (m[1] === "-" ? -1 : 1) * (1 + Math.floor(Math.random() * 4));
  const total = v + p.bonus + extra;
  return { t: t.id, name: (charOf(s, t) || t).name, d20: v, other: p.adv ? (v === a ? b : a) : null, total, dc, ok: !p.autoFail && total >= dc, why: p.why };
}

/**
 * Daño a una ficha: PG temporales primero; a 0 PG un personaje cae inconsciente (o muere si el daño sobrante
 * iguala sus PG máximos); si ya estaba a 0, cada golpe es un fallo de salvación contra muerte (dos si es crítico).
 * Si se estaba concentrando, tira la salvación de Constitución (CD 10 o la mitad del daño, máx. 30).
 */
export function damage(tokenId, amt, { crit = false } = {}) {
  if (!(amt > 0)) return;
  let conc = null, msg = null;
  store.commit("char", s => {
    const t = s.tokens.find(x => x.id === tokenId); if (!t) return;
    const c = charOf(s, t);
    if (c) {
      const tmp = Math.min(c.hp.temp || 0, amt), rest = amt - tmp; c.hp.temp = (c.hp.temp || 0) - tmp;
      if (c.hp.cur === 0 && rest > 0) {
        c.death = c.death || { s: 0, f: 0 }; c.death.stable = false;
        c.death.f = Math.min(3, c.death.f + (crit ? 2 : 1));
        if (rest >= c.hp.max) c.death.f = 3;
        msg = c.death.f >= 3 ? `${c.name} ha muerto.` : `${c.name} recibe daño a 0 PG: ${crit ? "dos fallos" : "un fallo"} de salvación contra muerte (${c.death.f}/3).`;
        if (c.death.f >= 3) { c.death.dead = true; addCond(t, "muerto"); }
      } else if (rest > 0) {
        const over = rest - c.hp.cur; c.hp.cur = Math.max(0, c.hp.cur - rest);
        if (c.hp.cur === 0) {
          if (over >= c.hp.max) { c.death = { s: 0, f: 3, dead: true }; addCond(t, "muerto"); msg = `${c.name} muere en el acto: el daño sobrante iguala sus PG máximos.`; }
          else { c.death = { s: 0, f: 0 }; addCond(t, "inconsciente"); addCond(t, "derribado"); }
          dropConcentration(s, t);
        }
      }
    } else {
      t.hp = Math.max(0, (+t.hp || 0) - amt);
      if (t.hp === 0) dropConcentration(s, t); // el «¡Cae!» ya flota sobre la figura
    }
    if ((charOf(s, t) ? charOf(s, t).hp.cur > 0 : t.hp > 0) && hasC(t, "concentracion")) conc = { dc: Math.min(30, Math.max(10, Math.floor(amt / 2))), t };
  });
  if (msg) toast(msg);
  if (conc) {
    const t = store.get().tokens.find(x => x.id === tokenId), spell = ((t.conds || []).find(c => c.id === "concentracion") || {}).note || "su conjuro";
    const r = rollSave(t, "con", conc.dc, `Concentración de ${(charOf(store.get(), t) || t).name} en ${spell} (CD ${conc.dc})`);
    if (!r.ok) { store.commit("token", s => { const k = s.tokens.find(x => x.id === tokenId); if (k) dropConcentration(s, k); }); toast(`Pierde la concentración: ${spell} termina.`); }
  }
}
/** Curación: a 0 PG, cualquier curación devuelve la consciencia. */
export function heal(tokenId, amt) {
  if (!(amt > 0)) return;
  store.commit("char", s => {
    const t = s.tokens.find(x => x.id === tokenId); if (!t) return;
    const c = charOf(s, t);
    if (c) { if (c.death && c.death.dead) return; const was0 = c.hp.cur === 0; c.hp.cur = Math.min(c.hp.max, c.hp.cur + amt); if (was0) { c.death = null; delCond(t, "inconsciente"); } }
    else t.hp = Math.min(t.maxhp, (+t.hp || 0) + amt);
  });
}
/** Cambio de PG con signo (lo que usaban los botones de la mesa). */
export const changeHP = (tokenId, delta, opts) => delta < 0 ? damage(tokenId, -delta, opts) : heal(tokenId, delta);

/** Quita la concentración y todo lo que mantenía (estados puestos por ese conjuro). */
export function dropConcentration(s, t) {
  if (!hasC(t, "concentracion")) return;
  const src = t.id; delCond(t, "concentracion");
  s.tokens.forEach(k => { k.conds = (k.conds || []).filter(c => c.src !== src); });
}

/* ---------- Salvaciones contra muerte ---------- */
export function deathSave(tokenId) {
  const s = store.get(), t = s.tokens.find(x => x.id === tokenId), c = t && charOf(s, t);
  if (!c || c.hp.cur > 0 || (c.death && (c.death.dead || c.death.stable))) return;
  const r = publish({ kind: "death", label: `Salvación contra muerte de ${c.name}`, expr: "1d20", by: t.id });
  let msg;
  store.commit("char", st => {
    const k = st.tokens.find(x => x.id === tokenId), ch = charOf(st, k); const d = ch.death = ch.death || { s: 0, f: 0 };
    if (r.nat === 20) { ch.hp.cur = 1; ch.death = null; delCond(k, "inconsciente"); msg = `¡20 natural! ${ch.name} recupera 1 PG y se levanta.`; }
    else if (r.nat === 1) { d.f = Math.min(3, d.f + 2); msg = `1 natural: dos fallos (${d.f}/3).`; }
    else if (r.total >= 10) { d.s++; msg = `Éxito (${d.s}/3).`; }
    else { d.f++; msg = `Fallo (${d.f}/3).`; }
    if (ch.death && ch.death.s >= 3) { ch.death.stable = true; msg = `${ch.name} se estabiliza (sigue inconsciente con 0 PG).`; }
    if (ch.death && ch.death.f >= 3) { ch.death.dead = true; addCond(k, "muerto"); msg = `${ch.name} ha muerto.`; }
    const x = (st.rolls || []).find(y => y.id === r.id); if (x) { x.result = r.nat === 20 || r.total >= 10 ? "save" : "fail"; x.note = msg; }
  });
  toast(msg);
}
/** Estabilizar a alguien a 0 PG (Medicina CD 10 o un kit de curandero). */
export const stabilize = tokenId => store.commit("char", s => { const t = s.tokens.find(x => x.id === tokenId), c = t && charOf(s, t); if (c && c.hp.cur === 0 && c.death && !c.death.dead) c.death.stable = true; });

/* ---------- Descansos ---------- */
/** Descanso corto: gasta dados de golpe (d del tipo de la clase + mod. de Constitución cada uno). */
export function shortRest(charId, dice) {
  const s = store.get(), c = s.characters.find(x => x.id === charId); if (!c) return;
  const hd = classInfo(c.cls).hd, left = c.level - (c.hdUsed || 0), n = Math.max(0, Math.min(dice, left));
  if (!n) { toast("No te quedan dados de golpe: recupéralos con un descanso largo."); return; }
  const m = mod(c.abilities.con), tok = s.tokens.find(t => t.kind === "pc" && t.char === c.id);
  const r = publish({ kind: "heal", label: `Descanso corto de ${c.name}: ${n} dado${n > 1 ? "s" : ""} de golpe`, expr: `${n}d${hd}${m ? (m > 0 ? "+" : "") + m * n : ""}`, by: tok ? tok.id : null });
  const amt = Math.max(n, r.total);
  store.commit("char", st => {
    const ch = st.characters.find(x => x.id === charId); ch.hdUsed = (ch.hdUsed || 0) + n;
    if (ch.hp.cur > 0) ch.hp.cur = Math.min(ch.hp.max, ch.hp.cur + amt);
    if (/brujo/i.test(ch.cls) && ch.spells && ch.spells.slots) Object.values(ch.spells.slots).forEach(sl => { sl.used = 0; });
    const x = (st.rolls || []).find(y => y.id === r.id); if (x) { x.note = `+${amt} PG`; x.status = "ok"; }
  });
}
/** Descanso largo: todos los PG, todos los dados de golpe y espacios de conjuro; −1 agotamiento. */
export function longRest(charId) {
  store.commit("char", s => {
    const c = s.characters.find(x => x.id === charId); if (!c) return;
    if (c.death && c.death.dead) return;
    c.hp.cur = c.hp.max; c.hp.temp = 0; c.hdUsed = 0; c.death = null;
    if (/^Humano/i.test(c.species || "")) c.inspiration = true; // Ingenioso
    if (c.spells && c.spells.slots) Object.values(c.spells.slots).forEach(sl => { sl.used = 0; });
    const t = s.tokens.find(x => x.kind === "pc" && x.char === c.id);
    if (t) {
      delCond(t, "inconsciente"); dropConcentration(s, t);
      const ex = (t.conds || []).find(x => x.id === "agotamiento"); if (ex) { ex.lvl = (+ex.lvl || 1) - 1; if (ex.lvl <= 0) delCond(t, "agotamiento"); }
    }
  });
  const c0 = store.get().characters.find(x => x.id === charId);
  toast("Descanso largo: PG, dados de golpe y espacios de conjuro recuperados." + (c0 && /^Humano/i.test(c0.species || "") ? " ✨ Ingenioso: inspiración heroica." : ""));
}
export { hasC as hasCondition, addCond, delCond };
