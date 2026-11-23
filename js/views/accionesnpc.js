// Acciones reales de una criatura del SRD en la ficha del máster (pestaña PNJ):
// ataque múltiple, acciones con salvación (alientos…), conjuros con sus usos, acción adicional, reacciones y legendarias.
// Se elige la acción, se tocan los objetivos en la mesa (o se marca el área) y se usa. Todo respeta el turno y los usos.
import { store } from "../core/store.js";
import { kitOf, multiOf, multiN, spellsOf, usesLeft, markUse, gate, spendKit, restKit } from "../core/criaturas.js";
import { attack } from "../core/combate.js";
import { cast, creatureSave, creatureNote, spellMech, inArea } from "../core/hechizos.js";
import { findSpell } from "../core/srd.js";
import { armedNow, arm, picked, togglePick, clearPicks } from "../core/apuntar.js";
import { eco } from "../core/turnos.js";
import { $$, esc, toast } from "../core/ui.js";
import { defensesOf, lrLeft } from "../core/defensas.js";

const AB = { fue: "Fue", des: "Des", con: "Con", int: "Int", sab: "Sab", car: "Car" };
const GROUPS = [["act", "Acciones"], ["bonus", "Acción adicional"], ["react", "Reacciones"], ["leg", "Legendarias"]];
const useOf = g => g === "bonus" ? "bonus" : g === "react" ? "react" : g === "leg" ? "leg" : "act";
const FX_SPELL = { "Bola de fuego": "bola", "Proyectil mágico": "proyectil", "Relámpago": "rayo", "Rayo de escarcha": "escarcha", "Llama sagrada": "llama", "Curar heridas": "curar", "Escudo": "escudo", "Ola atronadora": "trueno", "Onda atronadora": "trueno" };
const FX_TYPE = { fuego: "bola", "frío": "escarcha", "relámpago": "rayo", trueno: "trueno" };
const crLevel = t => { const v = String(t.vd || "1"); const n = v.includes("/") ? 1 : parseInt(v) || 1; return Math.max(1, n); };

/** Busca la acción armada en el kit. */
function resolve(kit, A) {
  if (!kit || !A) return null;
  if (A.sp) return { a: spellsOf(kit) || { n: "Lanzamiento de conjuros" }, sp: A.sp, per: A.per, lv: A.lv, g: A.g };
  const a = (kit[A.g] || [])[A.i]; return a ? { a, g: A.g, ref: refAtk(kit, a) } : null;
}
const nrm = x => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
/** «Abalanzarse: … realiza un ataque de desgarro»: el ataque al que se refiere la acción. */
const refAtk = (kit, a) => a.type === "text" && a.ref ? (kit.act || []).find(x => x.type === "atk" && nrm(a.ref).startsWith(nrm(x.n))) || null : null;
/** ¿Qué hace falta para usarla? objetivos y área. */
function needs(R) {
  if (R.sp || R.a.type === "cast1") { const d = findSpell(R.sp || R.a.sp), m = spellMech(d); return { m, self: !!(m && m.self), area: m && m.area, targets: !!(m && (m.save || m.atk || m.heal || m.dmg || m.buff)) && !(m && m.self) }; }
  if (R.a.type === "save") return { area: R.a.shape ? { shape: R.a.shape[0], size: R.a.shape[1] } : null, targets: true };
  if (R.a.type === "atk" || R.ref) return { targets: true, one: true };
  return { targets: false };
}

/** Para la mesa: si la acción elegida del PNJ usa un área, cuál y desde dónde (plantilla que sigue al cursor). */
export function npcArmedArea(s, A) {
  if (!A || A.kind !== "npcact") return null;
  const t = s.tokens.find(x => x.id === A.tok), R = t && resolve(kitOf(t), A); if (!R) return null;
  const nd = needs(R); if (!nd.area) return null;
  return { tok: t.id, area: nd.area, rng: nd.m ? (nd.m.touch ? { n: 1.5, l: 1.5 } : nd.m.rng) : null, label: R.sp || R.a.n };
}
/** Defensas del perfil, para tenerlas a la vista: se aplican solas al daño, a los estados y a las salvaciones. */
function defensesHTML(t) {
  const d = defensesOf(t); if (!d) return "";
  const parts = [d.res.length && `½ resiste ${d.res.join(", ")}`, d.vul.length && `×2 vulnerable a ${d.vul.join(", ")}`, d.inm.length && `0 inmune a ${d.inm.join(", ")}`,
    d.conds.length && `sin estados: ${d.conds.map(c => c === "agotamiento" ? "cansancio" : c).join(", ")}`,
    d.regen && `🔁 Regeneración ${d.regen.hp}${d.regen.stop.length ? ` (la corta ${d.regen.stop.join(" o ")})` : ""}${t.regenOff ? " · cortada el próximo turno" : ""}`,
    d.lr && `👑 Resistencia legendaria ${lrLeft(t)}/${d.lr} hoy`, d.mr && "🔰 Resistencia mágica"].filter(Boolean);
  return parts.length ? `<p class="kdefs" title="Se aplican solas: el daño con su defensa, los estados a los que es inmune no se ponen, la Regeneración al empezar su turno. La ventaja de Resistencia mágica y la Resistencia legendaria se ven en la tabla de tiradas del conjuro.">${parts.map(x => `<span>${esc(x)}</span>`).join("")}</p>` : "";
}
/** Botones de un grupo del perfil (act, bonus, react, leg), con los conjuros que usan ese tiempo. */
export function kitPart(s, t, turn, g) {
  const kit = kitOf(t); if (!kit) return "";
  const live = s.board && s.board.combat === "live", A = armedNow(), armedHere = A && A.kind === "npcact" && A.tok === t.id;
  const btn = (a, i) => {
    const u = usesLeft(t, a), why = live ? gate(s, t, useOf(g), { attack: a.type === "atk" }) : null, on = armedHere && !A.sp && A.g === g && A.i === i;
    const tag = a.type === "save" ? `${AB[a.sv]} CD ${a.dc}` : a.type === "atk" ? `${a.atk >= 0 ? "+" : ""}${a.atk}` : a.type === "cast1" ? "conjuro" : "";
    return `<button class="ka ${on ? "armed" : ""} k-${a.type}" data-ka="${t.id}|${g}|${i}" ${!u.ok || why ? "disabled" : ""} title="${esc((why ? why + " · " : "") + (a.txt || "").slice(0, 300))}"><b>${esc(a.n)}</b>${tag ? `<span>${esc(tag)}</span>` : ""}${u.txt ? `<em class="${u.ok ? "" : "off"}">${esc(u.txt)}</em>` : ""}</button>`;
  };
  let html = "";
  const list = (kit[g] || []).map((a, i) => [a, i]).filter(([a]) => a.type !== "multi" && a.type !== "spells" && !(g === "act" && a.type === "atk"));
  if (list.length) html += `<div class="kbtns">${list.map(([a, i]) => btn(a, i)).join("")}</div>`;
  const sp = spellsOf(kit);
  if (sp && g !== "leg") {
    const tm = x => { const d = x.srd && findSpell(x.n), m = d && spellMech(d); return m && m.time === "bonus" ? "bonus" : m && m.time === "react" ? "react" : "act"; };
    const lists = (sp.lists || []).map(L => ({ L, sp: L.sp.filter(x => tm(x) === g) })).filter(o => o.sp.length);
    if (lists.length) {
      const atk = sp.atk != null ? sp.atk : sp.dc != null ? sp.dc - 8 : null;
      html += `<div class="kspells"><small>Conjuros${sp.dc ? ` · CD ${sp.dc}` : ""}${atk != null ? ` · ${atk >= 0 ? "+" : ""}${atk} ataque` : ""}</small>${lists.map(({ L, sp: xs }) => `<div class="kfreq"><i>${L.u === "will" ? "A voluntad" : `${L.u}/día cada uno`}</i><div class="kbtns">${xs.map(x => {
        const u = usesLeft(t, sp, x.n, L.u), d = x.srd && findSpell(x.n), m = d && spellMech(d), why = live ? gate(s, t, g) : null;
        const on = armedHere && A.sp === x.n;
        return `<button class="ka k-spell ${on ? "armed" : ""}" data-ksp="${t.id}|${esc(x.n)}|${L.u}|${x.lv || ""}" ${!d || !u.ok || why ? "disabled" : ""} title="${esc(why || (d ? `${d.t} · ${d.al}${m && m.save ? " · salvación" : m && m.atk ? " · ataque de conjuro" : ""}` : "No está en el compendio: tíralo a mano"))}"><b>${esc(x.n)}</b>${x.lv ? `<span>nv ${x.lv}</span>` : ""}${L.u !== "will" ? `<em class="${u.ok ? "" : "off"}">${u.left}/${L.u}</em>` : ""}</button>`;
      }).join("")}</div></div>`).join("")}</div>`;
    }
  }
  return html;
}
/** ¿Tiene algo en ese grupo? */
export const kitHas = (s, t, g) => !!kitPart(s, t, false, g);
export const legLeft = t => { const kit = kitOf(t); return kit && (kit.leg || []).length ? Math.max(0, (kit.legN || 3) - (t.leg || 0)) : null; };
export const legMax = t => { const kit = kitOf(t); return kit ? kit.legN || 3 : 3; };
/** Ataque múltiple: cuántos ataques por acción y cuántos lleva. */
export function multiLine(s, t, turn) {
  const kit = kitOf(t), mu = kit && multiOf(kit); if (!mu) return "";
  const N = multiN(kit), e = s.board && s.board.combat === "live" && turn ? eco(s, t) : null;
  return `<p class="kmulti" title="${esc(mu.txt)}">⚔ <b>Ataque múltiple</b>: ${N} ataques por acción${e ? ` · lleva <b>${Math.min(e.n || 0, N)}/${N}</b>` : ""}</p>`;
}
/** Acción del perfil ya elegida: objetivos y botón de usar. */
export function kitArmed(s, t) {
  const kit = kitOf(t), A = armedNow(); if (!kit || !A || A.kind !== "npcact" || A.tok !== t.id) return "";
  const R = resolve(kit, A), nd = R && needs(R), tg = [...picked].map(id => s.tokens.find(x => x.id === id)).filter(Boolean);
  if (!R) return "";
  return `<div class="karmed"><b>${esc(R.sp || R.a.n)}</b>${nd.targets ? `<small>🎯 Toca ${nd.one ? "al objetivo" : "a los objetivos"} en la mesa${nd.area ? ` o marca el área (${esc(nd.area.shape)} de ${String(nd.area.size).replace(".", ",")} m)` : ""}</small>
      <div class="kpicks">${tg.map(x => `<button class="cchip" data-kunpick="${x.id}">${esc(x.name || "")} ✕</button>`).join("")}</div>` : ""}
      <div class="row">${nd.area ? `<button class="btn small" data-karea="${t.id}">◎ Marcar área</button>` : ""}<button class="btn gold small" data-kgo="${t.id}" ${nd.targets && !tg.length ? "disabled" : ""}>${R.a.type === "atk" || R.ref ? "Atacar" : R.sp || R.a.type === "cast1" ? "Lanzar" : "Usar"}</button><button class="btn small" data-kx>Cancelar</button></div></div>`;
}
export const kitDefs = t => kitOf(t) ? defensesHTML(t) : "";
export const kitRest = t => Object.keys(t.used || {}).length || Object.keys(t.spent || {}).length || t.lrUsed ? `<button class="btn small krest" data-krest="${t.id}" title="Recupera usos por día y recargas (tras un descanso largo)">↺ Recuperar usos</button>` : "";

/** Todo el perfil junto (fuera de combate). */
export function kitHTML(s, t, turn) {
  const kit = kitOf(t); if (!kit) return "";
  let html = defensesHTML(t) + multiLine(s, t, turn);
  for (const [g, gn] of GROUPS) { const part = kitPart(s, t, turn, g); if (part) html += `<div class="kgrp"><small>${gn}${g === "leg" ? ` · ${legLeft(t)}/${legMax(t)} esta ronda` : ""}</small>${part}</div>`; }
  html += kitArmed(s, t) + kitRest(t);
  return html ? `<div class="kit">${html}</div>` : "";
}

export function bindKit(host, redraw, getAdv) {
  const S = () => store.get();
  $$("[data-ka]", host).forEach(b => b.onclick = () => {
    const [tok, g, i] = b.dataset.ka.split("|"), t = S().tokens.find(x => x.id === tok), kit = kitOf(t), a = kit && (kit[g] || [])[+i]; if (!a) return;
    const A = armedNow();
    if (A && A.kind === "npcact" && A.tok === tok && !A.sp && A.g === g && A.i === +i) { arm(null); return redraw(); }
    const nd = needs({ a, g, ref: refAtk(kit, a) });
    if (!nd.targets && a.type !== "cast1") return run(tok, { a, g });          // sin objetivo: se usa ya
    arm({ kind: "npcact", tok, g, i: +i }); redraw();
  });
  $$("[data-ksp]", host).forEach(b => b.onclick = () => {
    const [tok, n, per, lv] = b.dataset.ksp.split("|"), A = armedNow();
    if (A && A.kind === "npcact" && A.tok === tok && A.sp === n) { arm(null); return redraw(); }
    const m = spellMech(findSpell(n));
    const R = { a: spellsOf(kitOf(S().tokens.find(x => x.id === tok))), sp: n, per: per === "will" ? "will" : +per, lv: +lv || null, g: m && m.time === "bonus" ? "bonus" : m && m.time === "react" ? "react" : "act" };
    if (m && m.self) return run(tok, R);
    arm({ kind: "npcact", tok, sp: n, per: R.per, lv: R.lv, g: R.g }); redraw();
  });
  $$("[data-kunpick]", host).forEach(b => b.onclick = () => togglePick(b.dataset.kunpick));
  $$("[data-kx]", host).forEach(b => b.onclick = () => { arm(null); redraw(); });
  $$("[data-krest]", host).forEach(b => b.onclick = () => restKit(b.dataset.krest));
  $$("[data-karea]", host).forEach(b => b.onclick = () => {
    const tok = b.dataset.karea, s = S(), t = s.tokens.find(x => x.id === tok), R = resolve(kitOf(t), armedNow()); if (!R) return;
    const nd = needs(R), m = { area: nd.area }, center = s.tokens.find(x => x.id === [...picked][0]);
    if (!center && !/cono|línea|emanación/.test(nd.area.shape)) return toast("Toca primero la criatura del centro del área.");
    // Cono o línea: desde la criatura hacia el objetivo marcado (o hacia todos si no hay ninguno)
    let ids = inArea(s, m, t, center);
    if (center && /cono|línea/.test(nd.area.shape)) { const dx = center.c - t.c, dy = center.r - t.r, L = Math.hypot(dx, dy) || 1;
      ids = ids.filter(id => { const o = s.tokens.find(x => x.id === id), ox = o.c - t.c, oy = o.r - t.r, l = Math.hypot(ox, oy) || 1, cosA = (ox * dx + oy * dy) / (l * L);
        return /línea/.test(nd.area.shape) ? Math.abs(ox * dy - oy * dx) / L <= 0.75 && cosA > 0 : cosA >= 0.85; }); }
    ids.filter(id => id !== tok).forEach(id => picked.add(id)); redraw();
  });
  $$("[data-kgo]", host).forEach(b => b.onclick = () => { const tok = b.dataset.kgo, A = armedNow(), R = resolve(kitOf(S().tokens.find(x => x.id === tok)), A); if (R) run(tok, R, getAdv && getAdv()); });

  function run(tok, R, adv = null) {
    const s = S(), t = s.tokens.find(x => x.id === tok); if (!t) return;
    const a = R.a, use = useOf(R.g), targets = [...picked];
    const A2 = R.ref || a, isAtk = !R.sp && (a.type === "atk" || !!R.ref), why = gate(s, t, use, { attack: isAtk && use === "act" });
    if (why) return toast(why);
    const u = R.sp ? usesLeft(t, a, R.sp, R.per) : usesLeft(t, a);
    if (!u.ok) return toast(`${R.sp || a.n}: no le quedan usos (${u.txt}).`);
    let r = null, fx = null;
    if (isAtk) {
      const w = { name: A2.n + (R.ref ? ` (${a.n})` : ""), atk: A2.atk, expr: (A2.dmg || []).map(d => d.e).join("+") || "0", type: [...new Set((A2.dmg || []).map(d => d.t))].join(" y "), rng: rangeFrom(A2), rider: A2.rider, cond: A2.cond, txt: A2.txt, ifAdv: A2.ifAdv || null, alt: A2.alt || null, ifs: A2.ifs || null };
      if (!targets.length) return toast("Toca al objetivo en la mesa.");
      r = attack(tok, targets[0], w, adv, null, { free: true });
    } else if (R.sp || a.type === "cast1") {
      const name = R.sp || a.sp, d = findSpell(name), m = spellMech(d), sp = spellsOf(kitOf(t)) || {};
      if (!d) return toast("Ese conjuro no está en el compendio: tíralo a mano.");
      const dc = sp.dc || 10 + crLevel(t), P = { name: t.name, dc, atk: sp.atk != null ? sp.atk : dc - 8, lvl: crLevel(t), mod: dc - 8 - Math.max(2, Math.ceil(crLevel(t) / 4) + 1) };
      const tg = m.self ? [tok] : targets;
      if (!tg.length && (m.save || m.atk || m.heal || m.dmg || m.buff)) return toast("Elige al menos un objetivo en la mesa.");
      r = cast(tok, name, R.lv || m.lvl || 0, tg, P);
      fx = FX_SPELL[name];
    } else if (a.type === "save") {
      if (!targets.length) return toast("Toca los objetivos en la mesa o marca el área.");
      r = creatureSave(tok, a, targets); fx = FX_TYPE[((a.dmg || [])[0] || {}).t];
    } else r = creatureNote(tok, a);
    if (r === null) return;
    spendKit(tok, use, { attack: isAtk && use === "act" });
    if (R.sp) markUse(tok, a, R.sp, R.per); else markUse(tok, a);
    if (fx && targets.length) { const to = s.tokens.find(x => x.id === targets[0]); if (to) store.commit("token", st => { const k = st.tokens.find(x => x.id === tok); if (k) k.fx = { id: "fx" + Date.now().toString(36), k: fx, to: { c: to.c, r: to.r }, at: Date.now() }; }); }
    clearPicks(); arm(null); redraw();
  }
}
const rangeFrom = a => ({ n: parseFloat(String(a.range || a.reach || "1,5").split("/")[0].replace(",", ".")), l: parseFloat(String(a.range || a.reach || "1,5").split("/").pop().replace(",", ".")), ranged: !a.melee, melee: !!a.melee });
