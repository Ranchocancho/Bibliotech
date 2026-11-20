// Conjuros en la mesa: se leen las reglas de cada conjuro del SRD (salvación, área, daño, curación,
// concentración, mejora con espacio superior) y se resuelven con espacios de conjuro y la economía del turno.
import { store, uid } from "./store.js";
import { publish } from "./dados.js";
import { charOf } from "./mesa.js";
import { findSpell } from "./srd.js";
import { ESTADOS } from "../data/estados.js";
import { classInfo, prof, mod } from "../data/dnd.js";
import { AB_KEY, spellDC, spellMod, quickSave, heal, damage, dropConcentration, addCond } from "./salud.js";
import { currentUser } from "./session.js";
import { attack } from "./combate.js";
import { rangeOf, inRange, cover, spend, dist, canActNow } from "./turnos.js";
import { toast } from "./ui.js";

const clean = t => String(t || "").replace(/\s*\d+\s+Documento de referencia del sistema 5\.2\.1\s*/g, " ").replace(/([a-záéíóúñ])-\s+([a-záéíóúñ])/gi, "$1$2").replace(/\s+/g, " ");
const SHAPES = { esfera: "Esfera", cono: "Cono", cubo: "Cubo", "línea": "Línea", cilindro: "Cilindro", "emanación": "Emanación" };
const num = x => parseFloat(String(x).replace(",", "."));
const cache = new Map();

/** Lo que hace un conjuro, leído de su texto del SRD. */
export function spellMech(d) {
  if (!d) return null;
  if (cache.has(d.n)) return cache.get(d.n);
  const t = clean(d.txt);
  const sv = (t.match(/salvación de (Fuerza|Destreza|Constitución|Inteligencia|Sabiduría|Carisma)/i) || [])[1];
  const area = t.match(/(esfera|cono|cubo|línea|cilindro|emanación) de (\d+(?:,\d+)?) m/i);
  const healM = t.match(/recupera(?:n)? (?:una cantidad de )?puntos de golpe (?:igual a )?(\d+d\d+)(?: más tu modificador)?/i) || t.match(/recupera(?:n)? (\d+d\d+)/i);
  let dmg = d.dmg, dt = d.dt;
  if (!dmg) { const m = t.match(/(\d+d\d+(?:\s*\+\s*\d+)?) de daño (?:de )?([a-záéíóúñ]+)/i); if (m) { dmg = m[1].replace(/\s/g, ""); dt = m[2]; } }
  const up = (d.sup || "").match(/aumenta en (\d+d\d+)/i);
  const conds = [];
  for (const e of ESTADOS) { const stem = e.n.toLowerCase().slice(0, 5); if (new RegExp(`estado (?:de )?${stem}`, "i").test(t)) conds.push(e.id); }
  const m = {
    name: d.n, lvl: d.lvl, time: /adicional/i.test(d.t) ? "bonus" : /reacci/i.test(d.t) ? "react" : "act",
    atk: !!d.atk, save: sv ? AB_KEY[sv.toLowerCase()] : null, half: /mitad del daño|la mitad de ese daño/i.test(t),
    dmg: healM ? null : dmg || null, dt: dt || "", heal: healM ? healM[1] : null, healMod: !!healM && /más tu modificador/i.test(t),
    area: area ? { shape: area[1].toLowerCase(), size: num(area[2]) } : null, conc: /^concentraci/i.test(d.du || ""),
    up: up ? up[1] : null, cantripScale: d.lvl === 0 && /mejora de truco/i.test(d.sup || ""), darts: /dardo/i.test(t),
    conds: [...new Set(conds)].filter(x => x !== "concentracion"), rng: rangeOf({ al: d.al }), touch: /toque/i.test(d.al || ""), self: /^personal/i.test(d.al || "")
  };
  if (d.n === "Bendición") m.buff = "bendecido";
  if (d.n === "Perdición") { m.buff = "perdicion"; m.save = m.save || "car"; }
  cache.set(d.n, m);
  return m;
}

/** Los dados de daño o curación con el espacio elegido (o el nivel del personaje, en los trucos). */
export function scaled(m, base, slot, charLevel) {
  if (!base) return null;
  const [, n, die, plus] = base.match(/(\d+)d(\d+)(\+\d+)?/) || [];
  if (!n) return base;
  let count = +n;
  if (m.cantripScale) count *= charLevel >= 17 ? 4 : charLevel >= 11 ? 3 : charLevel >= 5 ? 2 : 1;
  if (m.up && slot > m.lvl) { const [, un, ud] = m.up.match(/(\d+)d(\d+)/); if (+ud === +die) count += +un * (slot - m.lvl); else return `${count}d${die}${plus || ""}+${+un * (slot - m.lvl)}d${ud}`; }
  return `${count}d${die}${plus || ""}`;
}

/** Espacios libres del personaje desde el nivel indicado hacia arriba. */
export function freeSlots(c, from) {
  const sl = (c.spells && c.spells.slots) || {};
  return Object.keys(sl).map(Number).filter(l => l >= Math.max(1, from) && sl[l].max - sl[l].used > 0).sort((a, b) => a - b);
}
export const useSlot = (charId, lvl, delta = 1) => store.commit("char", s => {
  const c = s.characters.find(x => x.id === charId), sl = c && c.spells && c.spells.slots && c.spells.slots[lvl];
  if (sl) sl.used = Math.max(0, Math.min(sl.max, sl.used + delta));
});

/** Criaturas dentro del área, contando desde el centro (esfera, cilindro…) o desde quien lanza (cono, línea, emanación). */
export function inArea(s, m, caster, center) {
  if (!m.area) return [];
  const cells = Math.max(1, Math.round(m.area.size / 1.5)), fromCaster = /cono|línea|emanación/.test(m.area.shape);
  const o = fromCaster ? caster : center; if (!o) return [];
  return s.tokens.filter(t => !t.hidden && t.id !== (m.area.shape === "emanación" ? caster.id : "") && dist(o, t) <= cells && (fromCaster ? t.id !== caster.id : true)).map(t => t.id);
}

/**
 * Lanzar un conjuro. Gasta el espacio y la acción que toque, gestiona la concentración y resuelve:
 * - salvación: una tirada de daño para todos y una salvación por objetivo (mitad si la supera, si el conjuro lo dice);
 * - curación: se aplica al momento;
 * - sin tirada (Proyectil mágico): daño directo, pendiente del máster;
 * - beneficio o estado: lo pone a los objetivos y queda ligado a la concentración.
 * Los conjuros con tirada de ataque usan el ataque normal (combate.js).
 */
export function cast(casterId, spellName, slot, targetIds, P = null) {
  // P: lanzador que no es un personaje (criatura del SRD): { name, dc, atk, lvl, use } — sin espacios: sus usos los lleva criaturas.js
  const s = store.get(), a = s.tokens.find(t => t.id === casterId), c = a && !P && charOf(s, a), d = findSpell(spellName), m = spellMech(d);
  if (!a || !(c || P) || !m) return null;
  const who = c ? c.name : P.name, cl = c ? c.level : P.lvl;
  if (!P && !canActNow(s, a.id, m.time === "react" ? "react" : "act")) { toast(`No es el turno de ${who}: fuera de su turno solo reacciones.`); return null; }
  const targets = targetIds.map(id => s.tokens.find(t => t.id === id)).filter(Boolean);
  if (m.lvl > 0 && !P) {
    if (!slot || !freeSlots(c, m.lvl).includes(slot)) { toast(`No te quedan espacios de nivel ${slot || m.lvl} o superior.`); return null; }
    useSlot(c.id, slot);
  }
  const far = targets.filter(t => !m.self && inRange(m.touch ? { n: 1.5, l: 1.5 } : m.rng, a, t) === "out" && !(m.area && /cono|línea|emanación/.test(m.area.shape)));
  if (far.length && !m.area) toast(`Fuera de alcance (${d.al}): ${far.map(t => (charOf(s, t) || t).name).join(", ")}`);
  if (!P) spend(a.id, m.time);
  // Concentración: el conjuro anterior termina
  if (m.conc) store.commit("token", st => { const k = st.tokens.find(x => x.id === a.id); dropConcentration(st, k); addCond(k, "concentracion", { note: d.n }); });
  const lbl = `${who} lanza ${d.n}${m.lvl > 0 ? ` (nivel ${slot})` : ""}`, dc = P ? P.dc : spellDC(c);
  // Conjuros con tirada de ataque: un ataque por objetivo, con el daño del espacio usado
  if (m.atk) {
    const ab = c && classInfo(c.cls).cast, bonus = P ? P.atk : ab ? prof(c.level) + mod(c.abilities[ab]) : 0;
    return targets.map(t => attack(a.id, t.id, { name: d.n, atk: bonus, expr: scaled(m, m.dmg, slot, cl), type: m.dt, rng: m.touch ? { n: 1.5, l: 1.5, melee: true } : m.rng, spell: true }, null, null, P ? { free: true } : {}))[0] || null;
  }
  // Beneficios y estados sin salvación (Bendición…)
  if (m.buff && !m.save) {
    store.commit("token", st => targets.forEach(t => { const k = st.tokens.find(x => x.id === t.id); if (k) addCond(k, m.buff, { src: a.id, note: d.n }); }));
    return logCast(lbl, a, targets, `${targets.map(t => (charOf(s, t) || t).name).join(", ")}: ${ESTADOS.find(e => e.id === m.buff).t}`);
  }
  if (m.heal) {
    const hm = P ? (P.mod || 0) : spellMod(c), expr = scaled(m, m.heal, slot, cl) + (m.healMod ? `${hm >= 0 ? "+" : ""}${hm}` : "");
    const out = [];
    for (const t of targets) { const r = publish({ kind: "heal", label: `${lbl} sobre ${(charOf(s, t) || t).name}`, expr, by: a.id, target: t.id }); heal(t.id, r.total); out.push(r); }
    out.forEach(r => store.commit("roll", st => { const x = st.rolls.find(y => y.id === r.id); if (x) { x.status = "ok"; x.note = `+${r.total} PG`; } }));
    return out[0] || null;
  }
  if (m.save) {
    const dmgExpr = m.dmg ? scaled(m, m.dmg, slot, cl) : null;
    const saves = targets.map(t => quickSave(s, t, m.save, dc, m.save === "des" ? (cover(s, a, t).bonus || 0) : 0));
    const base = { kind: "spell", label: `${lbl} · salvación de ${Object.entries(AB_KEY).find(([, k]) => k === m.save)[0].replace(/^./, x => x.toUpperCase())} CD ${dc}`, by: a.id };
    const r = dmgExpr ? publish({ ...base, expr: dmgExpr, dtype: m.dt }) : logCast(base.label, a, targets, null, true);
    store.commit("roll", st => {
      const x = st.rolls.find(y => y.id === r.id); if (!x) return;
      Object.assign(x, { saves, half: m.half, dc, sv: m.save, conds: m.conds.length ? m.conds : m.buff ? [m.buff] : [], dtype: m.dt || null, spell: d.n, src: m.conc ? a.id : null, status: "pending", targets: targets.map(t => t.id) });
    });
    return r;
  }
  if (m.dmg && !m.atk) {
    const n = m.darts ? 3 + Math.max(0, slot - 1) : 0;
    const expr = m.darts ? `${n}d4+${n}` : scaled(m, m.dmg, slot, cl);
    const r = publish({ kind: "spell", label: lbl, expr, dtype: m.dt, by: a.id });
    store.commit("roll", st => { const x = st.rolls.find(y => y.id === r.id); if (x) Object.assign(x, { saves: targets.map(t => ({ t: t.id, name: (charOf(s, t) || t).name, ok: false, auto: true })), half: false, dtype: m.dt, spell: d.n, status: "pending", targets: targets.map(t => t.id), note: m.darts ? `${n} dardos que impactan siempre (repártelos como quieras)` : null }); });
    return r;
  }
  return logCast(lbl, a, targets, d.du && d.du !== "Instantáneo" ? `Duración: ${d.du}` : null);
}

/**
 * Acción de una criatura con tirada de salvación (alientos, miradas, venenos…), tal como la escribe el SRD:
 * una tirada de daño para todos y una salvación por objetivo; el máster lo aplica desde Tiradas (mitad si la supera).
 */
export function creatureSave(casterId, a, targetIds) {
  const s = store.get(), c = s.tokens.find(t => t.id === casterId); if (!c) return null;
  const targets = targetIds.map(id => s.tokens.find(t => t.id === id)).filter(Boolean);
  const AB = { fue: "Fuerza", des: "Destreza", con: "Constitución", int: "Inteligencia", sab: "Sabiduría", car: "Carisma" };
  const saves = targets.map(t => quickSave(s, t, a.sv, a.dc, a.sv === "des" ? (cover(s, c, t).bonus || 0) : 0));
  const expr = (a.dmg || []).map(d => d.e).join("+"), dtype = [...new Set((a.dmg || []).map(d => d.t))].join(" y ");
  const label = `${c.name}: ${a.n} · salvación de ${AB[a.sv]} CD ${a.dc}`;
  const r = expr ? publish({ kind: "spell", label, expr, dtype, by: c.id }) : logCast(label, c, targets, null, true);
  const conds = (a.fail || "").match(/estados? de/) ? condsFrom(a.fail) : [];
  store.commit("roll", st => {
    const x = st.rolls.find(y => y.id === r.id); if (!x) return;
    Object.assign(x, { saves, half: !!a.half, dc: a.dc, sv: a.sv, conds, dtype: dtype || null, spell: a.n, status: "pending", targets: targets.map(t => t.id), note: a.fail ? "Si falla: " + a.fail.slice(0, 160) : null });
  });
  return r;
}
const CONDS = ["agarrado", "apresado", "asustado", "aturdido", "cegado", "derribado", "ensordecido", "envenenado", "hechizado", "incapacitado", "inconsciente", "paralizado", "petrificado"];
function condsFrom(txt) {
  const out = new Set();
  for (const m of String(txt).matchAll(/estados? de ([a-záéíóúñ]+)(?: y ([a-záéíóúñ]+))?/gi)) [m[1], m[2]].forEach(w => { if (!w) return; const id = w.toLowerCase().replace(/a$/, "o"); if (CONDS.includes(id)) out.add(id); });
  return [...out];
}
/** Una acción sin tirada (Cambio de forma, Teletransporte…): queda apuntada en la mesa con su texto del SRD. */
export function creatureNote(casterId, a) {
  const s = store.get(), c = s.tokens.find(t => t.id === casterId); if (!c) return null;
  return logCast(`${c.name}: ${a.n}`, c, [], (a.txt || "").slice(0, 220));
}

/** Apunta en la mesa que se lanzó un conjuro (sin dados). */
function logCast(label, a, targets, note, pending = false) {
  const u = currentUser(store.get()) || {};
  const e = { id: uid("tir"), at: Date.now(), who: u.id || null, whoName: u.name || "", label, expr: "", kind: "cast", dice: [], total: null, nat: null, tok: a.id,
    targets: targets.map(t => t.id), status: pending ? "pending" : "ok", note: note || null, secret: false };
  store.commit("roll", st => { st.rolls = st.rolls || []; st.rolls.push(e); });
  return e;
}

/**
 * El máster aplica un conjuro con salvación: daño completo a quien falla, mitad (si el conjuro lo dice) a quien
 * la supera, y los estados a quien falla. per: { [tokenId]: "full" | "half" | "none" | "double" } para cambiarlo a mano
 * (resistencias, vulnerabilidades o lo que se acuerde en la mesa).
 */
export function applySpell(rollId, per = {}) {
  const s = store.get(), r = (s.rolls || []).find(x => x.id === rollId); if (!r || r.applied != null) return;
  const plan = (r.saves || []).map(sv => {
    const how = per[sv.t] || (sv.ok ? (r.half ? "half" : "none") : "full");
    const amt = r.total == null ? 0 : how === "full" ? r.total : how === "half" ? Math.floor(r.total / 2) : how === "double" ? r.total * 2 : 0;
    return { t: sv.t, amt, how, fail: !sv.ok };
  });
  store.commit("roll", st => {
    const x = st.rolls.find(y => y.id === rollId); if (!x) return;
    x.applied = plan.reduce((a, p) => a + p.amt, 0); x.status = "ok"; x.plan = plan;
    if (x.conds && x.conds.length) plan.filter(p => p.fail).forEach(p => { const k = st.tokens.find(t => t.id === p.t); if (k) x.conds.forEach(id => addCond(k, id, { src: x.src || null, note: x.spell })); });
  });
  plan.forEach(p => { if (p.amt) damage(p.t, p.amt); });
}

/**
 * Una trampa se dispara sobre quien la pisa: se revela, se tira el daño y cada víctima hace su salvación
 * (mitad si la supera). El máster lo aplica desde la tabla de tiradas, como un conjuro.
 */
export function triggerTrap(propId, tokenIds) {
  const s = store.get(), p = ((s.board && s.board.props) || []).find(x => x.id === propId); if (!p) return null;
  const tr = p.trap || { dc: 13, save: "des", dmg: "2d10", type: "perforante" }, v = { trampa: "Trampa", trampaoculta: "Trampa oculta", pinchos: "Pinchos", foso: "Foso" }[p.k] || "Trampa";
  const victims = tokenIds.map(id => s.tokens.find(t => t.id === id)).filter(Boolean);
  store.commit("board", st => { const x = (st.board.props || []).find(y => y.id === propId); if (x) { x.hidden = false; x.sprung = true; } });
  const names = victims.map(t => (charOf(s, t) || t).name).join(", ");
  const r = publish({ kind: "spell", label: `¡${p.label || v}! ${names} · salvación de ${({ fue: "Fuerza", des: "Destreza", con: "Constitución", int: "Inteligencia", sab: "Sabiduría", car: "Carisma" })[tr.save] || "Destreza"} CD ${tr.dc}`, expr: tr.dmg || "1d6", dtype: tr.type || "", by: null });
  const saves = victims.map(t => quickSave(store.get(), t, tr.save || "des", +tr.dc || 13));
  store.commit("roll", st => { const x = st.rolls.find(y => y.id === r.id); if (x) Object.assign(x, { saves, half: tr.half !== false, dc: +tr.dc || 13, sv: tr.save, conds: tr.cond ? [tr.cond] : [], dtype: tr.type || null, spell: p.label || v, status: "pending", targets: victims.map(t => t.id), trap: true }); });
  return r;
}
/** Anuncia en la mesa lo que hay en un cofre, un sarcófago o un montón de oro. */
export function announceLoot(propId) {
  const s = store.get(), p = ((s.board && s.board.props) || []).find(x => x.id === propId); if (!p) return;
  const u = currentUser(s) || {}, n = p.label || ({ cofre: "Cofre", oro: "Montón de oro", sarcofago: "Sarcófago", pocion: "Poción", pergamino: "Pergamino", objeto: "Objeto mágico" })[p.k] || "Tesoro";
  store.commit("roll", st => {
    st.rolls = st.rolls || []; st.rolls.push({ id: uid("tir"), at: Date.now(), who: u.id || null, whoName: u.name || "", kind: "loot", label: `${n}: ${p.loot || "vacío"}`, expr: "", dice: [], total: null, nat: null, tok: null, status: "ok", secret: false, prop: p.id });
    const x = (st.board.props || []).find(y => y.id === propId); if (x) { x.hidden = false; x.opened = true; }
  });
}
