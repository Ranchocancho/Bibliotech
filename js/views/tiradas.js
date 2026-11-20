// Tabla de tiradas compartida y bandeja de dados. Todos ven las tiradas; el máster confirma, cambia o anula.
import { store } from "../core/store.js";
import { isDM, currentUser } from "../core/session.js";
import { publish, RESULT, mySkin, setMySkin, diceAnim, setDiceAnim } from "../core/dados.js";
import { decide, damageFor, nameOf, attack, attacksOf, oaOpen, answerOA } from "../core/combate.js";
import { canInspire, useInspiration } from "../core/inspiracion.js";
import { masteryChoice, useMastery, applyMastery, cleaveTargets, MASTERY } from "../core/maestria.js";
import { applySpell } from "../core/hechizos.js";
import { spend } from "../core/turnos.js";
import { $, $$, esc } from "../core/ui.js";
import { srd, srdNow, findMonster } from "../core/srd.js";
import { estado, etiqueta } from "../data/estados.js";
let GLOS = null; srd("glosario").then(g => (GLOS = g));
const openInfo = new Set();

/** Resistencias, inmunidades y vulnerabilidades del objetivo frente a un tipo de daño (del perfil del manual). */
export function damageTraits(t, dtype) {
  const m = t && t.srd && findMonster(t.srd); if (!m || !dtype) return null;
  const flat = m.txt.replace(/\s+/g, " "), get = k => (flat.match(new RegExp(k + ": ([^.;]*?)(?=;| [A-Z][a-záéíóú]+:|$)")) || [, ""])[1].toLowerCase();
  const ty = dtype.toLowerCase().split(" ")[0];
  if (get("Inmunidades").includes(ty)) return { k: "inmune", txt: `${m.n} es inmune al daño ${ty}: no recibe daño.`, glos: "Inmunidad" };
  if (get("Resistencias").includes(ty)) return { k: "resiste", txt: `${m.n} tiene resistencia al daño ${ty}: recibe la mitad.`, glos: "Resistencia" };
  if (get("Vulnerabilidades").includes(ty)) return { k: "vulnerable", txt: `${m.n} es vulnerable al daño ${ty}: recibe el doble.`, glos: "Vulnerabilidad" };
  return null;
}
function rollInfo(s, r) {
  const t = s.tokens.find(x => x.id === r.target), parts = [];
  if (r.why) parts.push(`<p>${r.why.map(w => `<span class="${w.startsWith("ventaja") ? "adv" : w.startsWith("desventaja") ? "dis" : ""}">${esc(w)}</span>`).join(" · ")}</p>`);
  if (r.cov) parts.push(`<p>🛡️ ${esc(r.cov)} (ya sumado a la CA)</p>`);
  if (r.auto) parts.push(`<p>💥 ${esc(r.auto)}</p>`);
  for (const cd of (t && t.conds) || []) { const e = estado(cd.id); if (e) parts.push(`<p><b style="color:${e.c}">${esc(etiqueta(cd.id, cd.lvl))}</b> (objetivo): ${esc(e.t)}</p>`); }
  const tr = r.kind === "damage" && damageTraits(t, r.dtype);
  if (tr) parts.push(`<p class="trait">⚠️ ${esc(tr.txt)}</p>`);
  const g = GLOS || {}, keys = r.kind === "attack" ? [/✨/.test(r.label) ? "Ataque de conjuro" : "Ataque con arma", ...(r.result === "crit" ? ["Crítico"] : []), ...(r.cov ? ["Cobertura"] : [])]
    : r.kind === "damage" ? ["Daño", ...(r.crit ? ["Crítico"] : []), ...(tr ? [tr.glos] : [])] : r.kind === "save" ? ["Tirada de salvación"] : r.kind === "init" ? ["Iniciativa"] : ["Prueba de característica"];
  for (const k of keys) if (g[k]) parts.push(`<details><summary>📖 ${esc(k)}</summary>${g[k].txt.split("\n").map(p => `<p>${esc(p)}</p>`).join("")}</details>`);
  return parts.join("") || `<p class="empty">Sin reglas especiales.</p>`;
}

let adv = 0, secret = false, editing = null, pool = {}, cleavePick = null;
const SKIN_NAMES = { rubi: "Rubí", zafiro: "Zafiro", esmeralda: "Esmeralda", amatista: "Amatista", obsidiana: "Obsidiana", oro: "Oro", hueso: "Hueso", madera: "Madera" };
const poolExpr = mod => { const p = Object.entries(pool).filter(([, n]) => n).map(([d, n]) => `${n}d${d}`).join("+"); return (p || "") + (mod ? (mod > 0 ? "+" : "") + mod : ""); };
const KIND = { attack: "Ataque", damage: "Daño", check: "Prueba", save: "Salvación", init: "Iniciativa", free: "Tirada", spell: "Conjuro", cast: "Conjuro", heal: "Curación", death: "Contra muerte", oa: "Reacción", loot: "Tesoro", xp: "Experiencia", mastery: "Maestría" };
const HOW = { full: "Completo", half: "Mitad", none: "Nada", double: "Doble" };
let spellPer = {};

/** Lista de tiradas visibles para este usuario (las secretas, solo el máster y quien tira). */
export const visibleRolls = s => (s.rolls || []).filter(r => !r.secret || isDM(s) || r.who === (currentUser(s) || {}).id);

/** o: { tray: false → sin bandeja, log: false → sin registro, by: () => id de la figura que tira } (se recuerda por contenedor) */
export function renderRolls(el, o) {
  if (o) el._ro = o; o = el._ro || {};
  if (el.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName)) return; // no pisar lo que se escribe
  const s = store.get(), dm = isDM(s), me = currentUser(s);
  const list = visibleRolls(s).slice(-30).reverse();
  const hasDamage = id => (s.rolls || []).some(x => x.link === id && x.status !== "void");
  const pe = poolExpr(0);
  el.innerHTML = `${o.tray === false ? "" : `<div class="tray">
      <div class="trayd">${[4, 6, 8, 10, 12, 20, 100].map(d => `<button class="die d${d} ${pool[d] ? "inpool" : ""}" data-d="${d}" title="Añadir un d${d} a la mano">d${d}${pool[d] ? `<i>${pool[d]}</i>` : ""}</button>`).join("")}</div>
      <div class="trayh"><input id="trexpr" value="${esc(pe)}" placeholder="1d20 · o escribe 2d6+3" aria-label="Dados a tirar" title="Toca los dados de arriba (clic derecho quita) o escribe la tirada">${pe ? `<button class="btn small" id="trclear" title="Vaciar la mano">✕</button>` : ""}<button class="btn small gold" id="trgo">🎲 Tirar</button></div>
      <div class="trayo"><select id="trskin" aria-label="Tus dados" title="Tus dados">${Object.entries(SKIN_NAMES).map(([k, n]) => `<option value="${k}" ${mySkin() === k ? "selected" : ""}>🎲 ${n}</option>`).join("")}</select>
        <input type="number" id="trmod" placeholder="+0" aria-label="Modificador" title="Modificador">
        <button class="btn small" id="tradv" aria-pressed="${adv === 1}" title="Ventaja (d20)">Vent.</button><button class="btn small" id="trdis" aria-pressed="${adv === -1}" title="Desventaja (d20)">Desv.</button>
        <select id="tranim" title="Animación de dados (solo en tu pantalla)" aria-label="Animación de dados">${[["full", "🎬 Animados"], ["fast", "⚡ Rápidos"], ["off", "🚫 Sin animación"]].map(([k, n]) => `<option value="${k}" ${diceAnim() === k ? "selected" : ""}>${n}</option>`).join("")}</select>
        ${dm ? `<button class="btn small" id="trsec" aria-pressed="${secret}" title="Solo la ves tú">Secreta</button>` : ""}
</div>
    </div>`}
    ${o.log === false ? "" : `<div class="rolls">${list.filter(r => r.kind !== "oapass" && !(r.link && list.some(x => x.id === r.link && (r.kind === "damage" || x.kind === "req")))).map(r => rowHTML(s, r, dm, me, hasDamage, list.find(x => x.kind === "damage" && x.link === r.id))).join("") || `<p class="empty">Aún no se ha tirado nada. ¡Que rueden los dados!</p>`}</div>`}`;

  if (o.tray !== false) {
  const mod = () => +($("#trmod", el).value || 0);
  $$("[data-d]", el).forEach(b => {
    b.onclick = () => { const d = +b.dataset.d; pool[d] = Math.min(10, (pool[d] || 0) + 1); renderRolls(el); };
    b.oncontextmenu = e => { e.preventDefault(); const d = +b.dataset.d; pool[d] = Math.max(0, (pool[d] || 0) - 1); renderRolls(el); };
  });
  const throwNow = th => {
    const typed = $("#trexpr", el).value.trim().replace(/\s+/g, ""), m = mod();
    const expr = (typed && typed !== poolExpr(0).replace(/\s+/g, "") ? typed : "") || poolExpr(m) || `1d20${m ? (m > 0 ? "+" : "") + m : ""}`;
    publish({ expr, label: expr, adv: /^1d20([+-]\d+)?$/.test(expr) ? adv : 0, secret, kind: "free", throw: th, by: o.by ? o.by() : null });
    adv = 0; pool = {}; $("#trexpr", el).value = ""; renderRolls(el);
  };
  $("#trgo", el).onclick = () => throwNow(null);
  $("#trskin", el).onchange = e => setMySkin(e.target.value);
  $("#tranim", el).onchange = e => { setDiceAnim(e.target.value); toast(e.target.value === "off" ? "Dados sin animación: verás los resultados en el registro" : "Animación de dados cambiada"); };
  const cl = $("#trclear", el); if (cl) cl.onclick = () => { pool = {}; renderRolls(el); };
  $("#trexpr", el).onkeydown = e => { if (e.key === "Enter") $("#trgo", el).click(); };
  $("#tradv", el).onclick = () => { adv = adv === 1 ? 0 : 1; renderRolls(el); };
  $("#trdis", el).onclick = () => { adv = adv === -1 ? 0 : -1; renderRolls(el); };
  const sc = $("#trsec", el); if (sc) sc.onclick = () => { secret = !secret; renderRolls(el); };
  }
  $$("[data-dec]", el).forEach(b => b.onclick = () => { const [id, a] = b.dataset.dec.split("|"); decide(id, a); });
  $$("[data-dmg]", el).forEach(b => b.onclick = () => damageFor(b.dataset.dmg));
  $$("[data-rqmiss]", el).forEach(b => b.onclick = () => import("./peticiones.js").then(m => { const r = (store.get().rolls || []).find(x => x.id === b.dataset.rqmiss); if (r) m.answerMissing(r); }));
  $$("[data-per]", el).forEach(x => x.onchange = () => { const [id, t] = x.dataset.per.split("|"); spellPer[id] = { ...(spellPer[id] || {}), [t]: x.value }; });
  $$("[data-apply]", el).forEach(b => b.onclick = () => {
    const id = b.dataset.apply, per = {};
    $$(`[data-per^="${id}|"]`, el).forEach(x => { per[x.dataset.per.split("|")[1]] = x.value; });
    applySpell(id, per); delete spellPer[id];
  });
  $$("[data-oa]", el).forEach(b => b.onclick = () => answerOA(b.dataset.oa, true));
  $$("[data-insp]", el).forEach(b => b.onclick = () => useInspiration(b.dataset.insp));
  $$("[data-mas]", el).forEach(b => b.onclick = () => { const id = b.dataset.mas, r = (store.get().rolls || []).find(x => x.id === id); if (r && r.mas && r.mas.n === "Hender") { cleavePick = cleavePick === id ? null : id; renderRolls(el); } else useMastery(id); });
  $$("[data-cleave]", el).forEach(b => b.onclick = () => { const [id, tid] = b.dataset.cleave.split("|"); cleavePick = null; if (tid) useMastery(id, { target: tid }); else renderRolls(el); });
  $$("[data-masok]", el).forEach(b => b.onclick = () => { const [req, atk] = b.dataset.masok.split("|"); applyMastery(atk, req); });
  $$("[data-xpok]", el).forEach(b => b.onclick = () => { const v = $(`[data-xpv="${b.dataset.xpok}"]`, el); import("../core/experiencia.js").then(m => m.grantXP(b.dataset.xpok, v ? Math.max(0, +v.value || 0) : null)); });
  $$("[data-oano]", el).forEach(b => b.onclick = () => answerOA(b.dataset.oano, false));
  $$("[data-row]", el).forEach(b => b.querySelector(".r1").onclick = e => { if (e.target.closest("button,input,select")) return; const id = b.dataset.row; openInfo.has(id) ? openInfo.delete(id) : openInfo.add(id); renderRolls(el); });
  $$("[data-edit]", el).forEach(b => b.onclick = () => { editing = b.dataset.edit; renderRolls(el); const i = $("#rtot", el); if (i) i.focus(); });
  const ok = $("#rtotok", el); if (ok) ok.onclick = () => { const v = +$("#rtot", el).value, id = editing; editing = null; decide(id, { total: v }); };
}

/** Conjuro con salvación: una línea por objetivo (salvación, ✓/✗ y cuánto daño le toca); el máster lo aplica. */
function spellTable(s, r, dm) {
  const pend = r.status === "pending" && r.applied == null;
  return `<div class="spt">${r.saves.map(sv => {
    const t = s.tokens.find(x => x.id === sv.t), tr = r.dtype && t ? damageTraits(t, r.dtype) : null;
    const def = (spellPer[r.id] || {})[sv.t] || (sv.auto ? "full" : sv.ok ? (r.half ? "half" : "none") : "full");
    const sugg = tr && tr.k === "resiste" ? "half" : tr && tr.k === "vulnerable" ? "double" : tr && tr.k === "inmune" ? "none" : null;
    const done = (r.plan || []).find(p => p.t === sv.t);
    return `<div class="spl ${sv.auto ? "" : sv.ok ? "ok" : "ko"}"><b>${esc(sv.name)}</b>
      ${sv.auto ? `<small>sin salvación</small>` : `<span class="svd" title="d20: ${sv.d20}${sv.other != null ? " (y " + sv.other + ")" : ""}${(sv.why || []).length ? " · " + esc(sv.why.join(" · ")) : ""}">${sv.total}</span><span>${sv.ok ? "✓" : "✗"}</span>`}
      ${done ? `<em>${done.amt ? "−" + done.amt + " PG" : "sin daño"}${done.fail && r.conds && r.conds.length ? " · " + r.conds.join(", ") : ""}</em>`
        : dm && pend ? `<select data-per="${r.id}|${sv.t}" aria-label="Daño a ${esc(sv.name)}">${Object.entries(HOW).map(([k, n]) => `<option value="${k}" ${(sugg && !(spellPer[r.id] || {})[sv.t] ? sugg : def) === k ? "selected" : ""}>${n}${r.total != null ? ` (${k === "full" ? r.total : k === "half" ? Math.floor(r.total / 2) : k === "double" ? r.total * 2 : 0})` : ""}</option>`).join("")}</select>${tr ? `<small class="trait">${esc(tr.k)}</small>` : ""}` : ""}</div>`;
  }).join("")}
  ${r.conds && r.conds.length && !r.applied ? `<small class="note">Quien falle: ${esc(r.conds.join(", "))}.</small>` : ""}
  ${dm && pend ? `<button class="btn small gold" data-apply="${r.id}">✓ Aplicar a todos</button>` : !r.applied && pend ? `<small class="st pend">Pendiente del máster</small>` : ""}</div>`;
}

/* ---------- Una línea por acción (estilo registro de combate): quién → a quién · qué · resultado ---------- */
const ICON = { xp: "⭐", loot: "💰", attack: "⚔", damage: "🩸", save: "🛡", check: "🎯", init: "⏱", spell: "✨", cast: "✨", heal: "✚", death: "💀", oa: "⚠", free: "🎲", mastery: "⚔" };
const first = n => String(n || "").split(" ")[0];
function who(s, id) { const t = s.tokens.find(x => x.id === id); return t ? first(nameOf(s, t)) : ""; }
// Quién tira (la figura, o la persona si es una tirada libre) y su color
function actor(s, r) {
  const t = r.tok && s.tokens.find(x => x.id === r.tok), c = t && t.kind === "pc" ? s.characters.find(x => x.id === t.char) : null;
  const u = s.users.find(x => x.id === r.who);
  const name = t ? first(nameOf(s, t)) : u && u.role !== "player" ? "Máster" : r.whoName ? first(r.whoName) : (u ? first(u.name) : "Alguien");
  const color = (c && c.color) || (t && t.kind !== "pc" ? (t.kind === "npc" ? "#7d8fe0" : "#c4513f") : (u && u.role !== "player" ? "#9a7be0" : (u && u.color) || "#d6aa4e"));
  return { name: name || "Máster", color, foe: !!t && t.kind !== "pc" };
}
// Para qué era la tirada, en pocas palabras
function what(s, r) {
  const t = who(s, r.target), w = (r.label.split(" · ")[1] || "").trim(), oa = /^Ataque de oportunidad/.test(r.label);
  switch (r.kind) {
    case "attack": return `${oa ? "ataque de oportunidad" : "ataca"} a <b>${esc(t)}</b>${w ? ` <em>${esc(w)}</em>` : ""}`;
    case "damage": return `daño a <b>${esc(t)}</b>${r.dtype ? ` <em>${esc(r.dtype)}</em>` : ""}`;
    case "spell": case "cast": { const m = r.label.match(/lanza (.+?)(?: \(nivel (\d)\))?(?: ·|$)/); return `lanza <em>${esc(m ? m[1] : r.label)}${m && m[2] ? ` · nv ${m[2]}` : ""}</em>`; }
    case "heal": return `cura${t ? ` a <b>${esc(t)}</b>` : ""} <em>${esc((r.label.match(/lanza (.+?) sobre/) || [, ""])[1])}</em>`;
    case "init": return r.inits ? `iniciativa de ${r.inits.length} criaturas` : "iniciativa";
    case "death": return "salvación contra muerte";
    case "oa": return `puede atacar de oportunidad a <b>${esc(t)}</b>`;
    case "mastery": return `pide <em>${esc((r.mas || {}).n || "maestría")}</em> contra <b>${esc(t)}</b>${r.status === "ok" ? " ✓" : ""}`;
    case "save": case "check": return esc(r.label.replace(/ de [A-ZÁÉÍÓÚ][\wáéíóúñ-]+( [A-ZÁÉÍÓÚ][\wáéíóúñ-]+)*$/, "").replace(/^Salvación de /, "salvación de ").replace(/^Prueba de /, "prueba de "));
    case "loot": case "xp": return `<b>${esc(r.label)}</b>`;
    default: return `tirada libre <em>${esc(r.expr || r.label)}</em>`;
  }
}
function title(s, r) {
  const a = who(s, r.tok), t = who(s, r.target), what = (r.label.split(" · ")[1] || "").trim();
  if (r.kind === "attack") return `<b>${esc(a)}</b> → ${esc(t)}${what ? ` <em>${esc(what)}</em>` : ""}`;
  if (r.kind === "damage") return `<b>Daño</b> → ${esc(t)}${r.dtype ? ` <em>${esc(r.dtype)}</em>` : ""}`;
  if (r.kind === "spell" || r.kind === "cast") { const m = r.label.match(/lanza (.+?)(?: \(nivel (\d)\))?(?: ·|$)/); return `<b>${esc(a || first(r.whoName))}</b> <em>${esc(m ? m[1] : r.label)}${m && m[2] ? ` · nv ${m[2]}` : ""}</em>`; }
  if (r.kind === "heal") return `<b>${esc(a || first(r.whoName))}</b>${t && t !== a ? ` → ${esc(t)}` : ""} <em>${esc((r.label.match(/lanza (.+?) sobre/) || [, "curación"])[1])}</em>`;
  if (r.kind === "loot") return `<b>${esc(r.label)}</b>`;
  if (r.kind === "xp") return `<b>${esc(r.label)}</b>`;
  if (r.kind === "oa") return `<b>${esc(a)}</b> puede atacar a ${esc(t)} <em>oportunidad</em>`;
  if (r.kind === "death") return `<b>${esc(a)}</b> <em>contra muerte</em>`;
  return esc(r.label.replace(/ de ([A-ZÁÉÍÓÚ][\wáéíóúñ]+)( [A-ZÁÉÍÓÚ][\wáéíóúñ-]+)*/, (m0, n) => " · " + n));
}
function pill(r, dm, pend) {
  if (r.kind === "attack" && r.result && (dm || !pend)) return `<span class="pill ${r.result}">${RESULT[r.result]}</span>`;
  if ((r.kind === "save" || r.kind === "death") && r.result) return `<span class="pill ${r.result === "save" ? "hit" : "miss"}">${r.result === "save" ? "✓" : "✗"}${r.dc ? ` CD ${r.dc}` : ""}</span>`;
  if (r.kind === "heal") return `<span class="pill heal">+${r.total}</span>`;
  return "";
}
function reqRow(s, r, dm) {
  const q = r.req || {}, ans = (s.rolls || []).filter(x => x.link === r.id && x.status !== "void");
  const name = id => { const c = s.characters.find(x => x.id === id); return c ? c.name.split(" ")[0] : "?"; };
  const missing = (q.chars || []).filter(id => !ans.some(a => a.char === id));
  return `<div class="roll k-req ok" data-row="${r.id}" style="--who:#9a7be0"><div class="r1"><i class="ki">📣</i><span class="rt"><b class="rwho">Máster</b> pide <b>${esc(r.label)}</b>${q.dc && (dm || !q.hideDC) ? ` <em>CD ${q.dc}${q.hideDC ? " (oculta)" : ""}</em>` : ""}${q.adv ? `<sup class="${q.adv > 0 ? "adv" : "dis"}">${q.adv > 0 ? "▲" : "▼"}</sup>` : ""}</span></div>
    <div class="rqlist">${(q.chars || []).map(id => { const a = ans.find(x => x.char === id); if (!a) return `<span class="rqans wait">${esc(name(id))} …</span>`;
      const ok = a.result ? a.result === "save" : null; return `<span class="rqans ${ok === null ? "" : ok ? "ok" : "ko"}">${esc(name(id))} <b>${a.total}</b>${ok === null ? "" : ok ? " ✓" : " ✗"}</span>`; }).join("")}
      ${dm && missing.length ? `<button class="ib gold" data-rqmiss="${r.id}" title="Tira por quien falte">🎲 Tirar por ${missing.length === 1 ? esc(name(missing[0])) : "los que faltan"}</button>` : ""}</div></div>`;
}
function rowHTML(s, r, dm, me, hasDamage, dmgRow) {
  if (r.kind === "req") return reqRow(s, r, dm);
  const pend = r.status === "pending", showRes = dm || !pend || r.kind !== "attack", open = openInfo.has(r.id);
  const d20 = (r.dice || []).find(x => x.d === 20 && !x.drop), nat = d20 && (d20.v === 20 || d20.v === 1) ? d20.v : 0;
  const A = actor(s, r), sys = r.kind === "loot" || r.kind === "xp";
  const val = r.total == null || r.kind === "heal" || sys ? "" : `<span class="rv ${nat === 20 ? "n20" : nat === 1 ? "n1" : ""}" title="${esc(r.expr || "")}">${showRes ? r.total : "?"}</span>`;
  const canDmg = r.kind === "attack" && !pend && r.status !== "void" && r.result !== "miss" && r.dmg && !hasDamage(r.id) && (dm || r.who === me.id);
  // Fuera de turno: tiradas libres de un jugador en pleno combate cuando no le toca
  const cur = s.board && s.board.combat === "live" && s.board.turn ? s.tokens.find(t => t.id === s.board.turn) : null;
  const offTurn = r.kind === "free" && cur && r.who && r.seq === s.board.seq && !(cur.owner && cur.owner === r.who) && (s.users.find(u => u.id === r.who) || {}).role === "player";
  // Segunda línea: el desenlace (impacto, daño hecho, salvación…) y lo que falta por hacer
  const out = [];
  if (r.kind === "attack") {
    if (!showRes) out.push(`<span class="wait">⏳ el máster lo confirma</span>`);
    else if (r.result) out.push(`<span class="pill ${r.result}">${RESULT[r.result]}</span>${r.ac != null && dm ? `<small>CA ${r.ac}</small>` : ""}`);
    if (dmgRow) out.push(`<span class="dmgd ${dmgRow.status}">🩸 <b>${dmgRow.applied != null ? "−" + dmgRow.applied : dmgRow.total}</b> ${esc(dmgRow.dtype || "")}${dmgRow.crit ? " · crít." : ""}${dmgRow.applied == null && dmgRow.status === "pending" ? (dm ? "" : ` <span class="wait">⏳ se aplica</span>`) : ""}${dmgRow.note ? ` <small>${esc(dmgRow.note)}</small>` : ""}</span>`);
    else if (r.result && r.result !== "miss" && !pend && r.status !== "void") out.push(`<span class="wait">falta el daño</span>`);
  }
  if (r.kind === "damage" && !dmgRow) out.push(r.applied != null ? `<span class="dmgd ok">🩸 <b>−${r.applied}</b> PG a ${esc(who(s, r.target))}</span>` : `<span class="wait">⏳ ${dm ? "aplica el daño" : "el máster lo aplica"}</span>`);
  if ((r.kind === "save" || r.kind === "death") && r.result) out.push(`<span class="pill ${r.result === "save" ? "hit" : "miss"}">${r.result === "save" ? "✓ Salva" : "✗ Falla"}${r.dc ? ` · CD ${r.dc}` : ""}</span>`);
  if (r.kind === "heal") out.push(`<span class="pill heal">✚ +${r.total} PG</span>`);
  if (r.inits) out.push(r.inits.map(x => `<span class="rqans">${esc(x.name.split(" ")[0])} <b>${x.total}</b></span>`).join(" "));
  if (r.kind === "death" && r.note) out.push(`<small>${esc(r.note)}</small>`);
  if (r.status === "void") out.push(`<span class="pill void">Anulada</span>`); else if (r.status === "mod") out.push(`<span class="pill mod" title="${esc(r.note || "")}">✎ cambiada</span>`);
  if (r.mas && r.kind === "attack") out.push(`<span class="pill mas" title="${esc(MASTERY[r.mas.n] || "")}">⚔ ${esc(r.mas.n)}${r.masUsed ? " ✓" : ""}</span>`);
  if (r.cleaveOf) out.push(`<span class="pill mas" title="${esc(MASTERY.Hender)}">⚔ Hender</span>`);
  if (r.insp) out.push(`<span class="pill insp" title="Inspiración heroica">✨ ${r.insp.from} → ${r.insp.to}</span>`);
  if (offTurn) out.push(`<span class="pill off" title="Tirada libre durante el turno de otro">fuera de turno</span>`);
  const dmgActs = dm && dmgRow && dmgRow.status === "pending" ? (() => { const tr = damageTraits(s.tokens.find(x => x.id === dmgRow.target), dmgRow.dtype); return `<button class="ib gold" data-dec="${dmgRow.id}|${tr && tr.k === "resiste" ? "half" : tr && tr.k === "vulnerable" ? "double" : "ok"}" title="Aplicar el daño${tr ? " (" + tr.k + ")" : ""}">✓ Aplicar${tr ? " " + (tr.k === "resiste" ? "½" : tr.k === "vulnerable" ? "×2" : "0") : ""}</button><button class="ib" data-dec="${dmgRow.id}|half" title="Mitad">½</button><button class="ib" data-edit="${dmgRow.id}" title="Cambiar">✎</button><button class="ib danger" data-dec="${dmgRow.id}|void" title="Anular">✕</button>`; })() : "";
  const acts = [
    dm && pend && r.kind === "attack" ? `<button class="ib gold" data-dec="${r.id}|ok" title="Confirmar">✓ Vale</button><button class="ib" data-dec="${r.id}|flip" title="${r.result === "miss" ? "Que impacte" : "Que falle"}">⇄</button>` : "",
    dm && pend && r.kind === "damage" ? `<button class="ib gold" data-dec="${r.id}|ok" title="Aplicar">✓ Aplicar</button><button class="ib" data-dec="${r.id}|half" title="Mitad">½</button>` : "",
    canDmg ? `<button class="ib red" data-dmg="${r.id}" title="Tirar daño">🩸 Tirar daño${r.result === "crit" ? " ×2" : ""}</button>` : "",
    dmgActs,
    canInspire(s, r) ? `<button class="ib insp" data-insp="${r.id}" title="Gastar tu inspiración heroica: vuelve a tirar ${r.kind === "damage" ? "el dado más bajo" : "el d20"} y usa el nuevo resultado">✨ Repetir</button>` : "",
    (() => { const mc = masteryChoice(s, r); return mc && (dm || r.who === me.id) ? `<button class="ib gold" data-mas="${r.id}" title="${esc(MASTERY[mc.n])}">⚔ ${esc(mc.label)}</button>` : ""; })(),
    r.kind === "mastery" && dm && r.status === "pending" ? `<button class="ib gold" data-masok="${r.id}|${r.link}" title="${esc(MASTERY[(r.mas || {}).n] || "")}">✓ Aplicar</button><button class="ib danger" data-dec="${r.id}|void" title="Rechazar">✕</button>` : ""
  ].join("");
  const cleaveRow = cleavePick === r.id ? (() => { const L = cleaveTargets(s, r); return `<div class="r2"><small>Hender: elige la segunda criatura (a 1,5 m de ${esc(who(s, r.target))} y a tu alcance)</small><span class="ra2">${L.map(t => `<button class="ib" data-cleave="${r.id}|${t.id}">${esc(who(s, t.id))}</button>`).join("") || `<small>No hay ninguna.</small>`}<button class="ib" data-cleave="${r.id}|">✕</button></span></div>`; })() : "";
  return `<div class="roll ${r.status} k-${r.kind} ${open ? "open" : ""}${pend && dm && (r.kind === "attack" || r.kind === "damage") || (dmgRow && dmgRow.status === "pending" && dm) || canDmg ? " todo" : ""}" data-row="${r.id}" style="--who:${esc(A.color)}">
    <div class="r1"><i class="ki" title="${KIND[r.kind] || ""}">${ICON[r.kind] || "🎲"}</i><span class="rt">${sys ? "" : `<b class="rwho">${esc(A.name)}</b> `}${what(s, r)}${r.adv ? `<sup class="${r.adv > 0 ? "adv" : "dis"}" title="${r.adv > 0 ? "Ventaja" : "Desventaja"}">${r.adv > 0 ? "▲" : "▼"}</sup>` : ""}${r.secret ? `<sup title="Secreta">🔒</sup>` : ""}</span>
      ${editing === r.id ? `<input type="number" id="rtot" value="${r.total}" aria-label="Nuevo total"><button class="ib gold" id="rtotok">OK</button>` : val}</div>
    ${out.length || acts ? `<div class="r2">${out.join(" ")}${acts ? `<span class="ra2">${acts}</span>` : ""}</div>` : ""}
    ${cleaveRow}
    ${r.kind === "xp" ? `<div class="r2">${esc(r.note || "")}${dm && r.status === "pending" ? ` <input type="number" class="xpin" data-xpv="${r.id}" value="${r.xp.share}" aria-label="PX por personaje"><button class="ib gold" data-xpok="${r.id}">⭐ Repartir</button>` : ""}</div>` : ""}
    ${r.saves ? spellTable(s, r, dm) : ""}
    ${r.kind === "oa" ? (() => { const open = oaOpen(s, r), ans = (s.rolls || []).find(x => x.link === r.id && x.status !== "void"), mineOA = dm || ((s.tokens.find(t => t.id === r.tok) || {}).owner === me.id);
      return open ? (mineOA ? `<div class="r2"><span class="wait">⏸ decide ${esc(who(s, r.tok))}</span><span class="ra2"><button class="ib gold" data-oa="${r.id}">⚔ Atacar</button><button class="ib" data-oano="${r.id}">Dejar pasar</button></span></div>` : `<div class="r2"><span class="wait">⏸ ${esc(who(s, r.tok))} decide si ataca</span></div>`)
        : `<div class="r2"><small>${ans ? (ans.kind === "oapass" ? "Lo dejó pasar" : "Atacó") : "No la usó (el turno siguió)"}</small></div>`; })() : ""}
    ${open ? `<div class="rdet"><div class="dice">${(r.dice || []).map(x => `<span class="dv d${x.d} ${x.drop ? "drop" : ""} ${x.d === 20 && x.v === 20 && !x.drop ? "nat20" : ""} ${x.d === 20 && x.v === 1 && !x.drop ? "nat1" : ""}">${x.v}</span>`).join("")}${r.expr && r.expr.match(/[+-]\d+$/) ? `<span class="dmod">${r.expr.match(/[+-]\d+$/)[0]}</span>` : ""}</div>
      <div class="rl">${esc(r.label)}</div>${r.why ? `<small class="${r.adv > 0 ? "adv" : r.adv < 0 ? "dis" : ""}">${esc(r.why.join(" · "))}</small>` : ""}${r.note && r.kind !== "death" ? `<small>${esc(r.note)}</small>` : ""}
      <div class="rinfo">${rollInfo(s, r)}</div>
      ${dm && r.status !== "void" && !r.applied && r.total != null ? `<div class="r2"><button class="ib" data-edit="${r.id}">✎ Cambiar total</button><button class="ib danger" data-dec="${r.id}|void">✕ Anular</button></div>` : ""}</div>` : ""}
  </div>`;
}
