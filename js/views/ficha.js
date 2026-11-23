// Ficha de bolsillo: la columna fija del jugador (a la derecha, el mismo ancho que el panel del máster).
// PG, CA, estados, salvaciones contra muerte, salvaciones y pruebas, ataques, conjuros con espacios y descansos.
import { requestOpen } from "../core/comercio.js";
import { lightMap, darkvisionOf, LIGHT_ITEMS } from "../core/vision.js";
import { sheetFreeHTML, whispersHTML, bindSheetFree } from "./tiempolibre.js";
import { whispersFor } from "../core/tiempolibre.js";
import { condImmune } from "../core/defensas.js";
import { store } from "../core/store.js";
import { currentUser, isDM } from "../core/session.js";
import { publish } from "../core/dados.js";
import { findSpell } from "../core/srd.js";
import { ABILITIES, AB_SHORT, SKILLS, mod, sign, saveBonus, skillBonus, classInfo, prof } from "../data/dnd.js";
import { ESTADOS } from "../data/estados.js";
import { spellMech, freeSlots, useSlot, cast, inArea } from "../core/hechizos.js";
import { savePlan, spellDC, deathSave, shortRest, longRest } from "../core/salud.js";
import { attacksOf } from "../core/combate.js";
import { inRange, dist, metres, phase, eco, moveBudget, speedOf, toggle, spend, endTurn, rollInit, ACCIONES, attacksPerAction } from "../core/turnos.js";
import { arm, armedNow, picked, togglePick, clearPicks } from "../core/apuntar.js";
import { treasuresHTML, bindTreasures, journalHTML, bindJournal } from "./tesorosui.js";
import { getImage } from "../core/images.js";
import { $, $$, esc, toast } from "../core/ui.js";

let tesOpen = false, cuaOpen = false, whOpen = false, phOpen = {}, phSeq = null;
let condOpen = false, charSel = null, openSpell = null, slotPick = {}, accOpen = false, restOpen = false, hdN = 1, testsOpen = false;

const myChars = s => { const u = currentUser(s); return s.characters.filter(c => c.owner === (u && u.id)); };

export function renderSheet(el) {
  const a = document.activeElement; if (a && el.contains(a) && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return;
  const s = store.get(), list = myChars(s);
  if (!list.length) { el.innerHTML = `<p class="empty">No tienes personaje en este mundo. <a href="#personajes">Crea tu ficha</a>.</p>`; return; }
  const c = list.find(x => x.id === charSel) || list[0]; charSel = c.id;
  const tok = (s.tokens || []).find(t => t.kind === "pc" && t.char === c.id);
  const hpPct = Math.max(0, Math.min(100, c.hp.cur / Math.max(1, c.hp.max) * 100));
  const conds = tok ? (tok.conds || []) : [];
  const d = c.death || { s: 0, f: 0 }, pip = (on, cls) => Array.from({ length: 3 }, (_, i) => `<i class="pip ${cls} ${i < on ? "on" : ""}"></i>`).join("");
  const ab = classInfo(c.cls).cast, live = phase(s) === "live", myTurn = tok && s.board && s.board.turn === tok.id;
  el.innerHTML = `
    ${list.length > 1 ? `<select id="fsel" class="fsel">${list.map(x => `<option value="${x.id}" ${x.id === c.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>` : ""}
    <header class="fhead"><div class="fport" data-portrait="${esc(c.portrait || "")}" style="--c:${esc(c.color || "#888")}">${c.portrait ? "" : esc(c.name.slice(0, 2).toUpperCase())}</div>
      <div><b>${esc(c.name)}</b><small>${esc(c.cls)} ${c.level}${c.species ? " · " + esc(c.species) : ""}</small></div>
      <a class="btn small" href="#personajes" title="Ficha completa">Ficha ↗</a></header>
    ${sheetFreeHTML(s, c)}
    ${(+c.lvlGrant || 0) > c.level ? `<a class="flvl" href="#personajes">⬆ El máster te concede subir a nivel ${c.lvlGrant} · abrir la ficha</a>` : ""}
    <div class="fstats">
      <div class="fhp ${c.hp.cur === 0 ? "zero" : hpPct < 34 ? "low" : ""}"><div class="bar" role="meter" aria-valuemin="0" aria-valuemax="${c.hp.max}" aria-valuenow="${c.hp.cur}" aria-label="Puntos de golpe"><i style="width:${hpPct}%"></i><span><b>${c.hp.cur}</b> / ${c.hp.max} PG${c.hp.temp ? ` <em>+${c.hp.temp} temp.</em>` : ""}</span></div></div>
      <span class="fst"><small>CA</small><b>${c.ac}</b></span><span class="fst"><small>Vel.</small><b>${(+c.speed).toLocaleString("es-ES")} m</b></span><span class="fst"><small>Inic.</small><b>${sign(mod(c.abilities.des))}</b></span>
    </div>
    ${tok && s.board ? lightLine(s, c, tok) : ""}
    ${tok ? `<div class="fconds">${conds.map(x => { const e = ESTADOS.find(y => y.id === x.id) || { n: x.id, c: "#888", t: "" }; return `<span class="cchip big" style="--c:${e.c}" title="${esc(e.t)}"><b>${esc(e.n)}${x.lvl > 1 ? " " + x.lvl : ""}</b>${x.note ? ` · ${esc(x.note)}` : ""}<button data-uncond="${x.id}" aria-label="Quitar ${esc(e.n)}">✕</button></span>`; }).join("")}<button class="cchip add" id="faddcond">${condOpen ? "Cerrar" : "+ Estado"}</button></div>
      ${condOpen ? `<div class="fcondpick">${ESTADOS.filter(e => !conds.some(c => c.id === e.id)).map(e => `<button class="cchip" style="--c:${e.c}" data-addc="${e.id}" title="${esc(e.t)}">${esc(e.n)}</button>`).join("")}</div>` : ""}
      ${conds.length ? `<details class="fcondtxt"><summary>Qué hace${conds.length > 1 ? "n" : ""}</summary>${conds.map(x => { const e = ESTADOS.find(y => y.id === x.id); return e ? `<p><b style="color:${e.c}">${esc(e.n)}:</b> ${esc(e.t)}</p>` : ""; }).join("")}</details>` : ""}` : ""}
    ${c.hp.cur === 0 ? `<div class="fdeath ${d.dead ? "dead" : d.stable ? "stable" : ""}"><b>${d.dead ? "Muerto" : d.stable ? "Estable a 0 PG" : "A 0 PG · inconsciente"}</b>
      ${d.dead ? "" : `<div class="dsv"><span>Éxitos ${pip(d.s, "ok")}</span><span>Fallos ${pip(d.f, "ko")}</span></div>${d.stable ? "" : `<button class="btn gold small" id="fdeath" ${live && !myTurn ? "disabled title='En tu turno'" : ""}>🎲 Salvación contra muerte</button>`}`}</div>` : ""}


    ${chestNear(s, tok)}
    ${tok && phase(s) ? turnBlock(s, c, tok) : `<section class="fsec2"><h4>⚔️ Ataques</h4>${attacksOf(s, tok || { kind: "pc", char: c.id }).map(w => `<div class="fatk"><b>${esc(w.name)}</b><span>${sign(w.atk)} · ${esc(w.expr)} ${esc(w.type || "")}</span><small>${w.rng.ranged ? `${w.rng.n}/${w.rng.l} m` : `${w.rng.l} m`}</small></div>`).join("") || `<p class="empty">Sin ataques.</p>`}</section>`}

    ${ab && !(tok && phase(s) === "live") ? spellsBlock(s, c, tok) : ab ? slotsLine(c) : ""}

    <details class="fsec" data-k="sv" ${testsOpen ? "open" : ""}><summary>Salvaciones y pruebas</summary>
      <div class="fsaves">${ABILITIES.map(([k]) => `<button class="btn small" data-save="${k}">${AB_SHORT[k]} ${sign(saveBonus(c, k))}</button>`).join("")}</div>
      <div class="fskills">${SKILLS.map(([k, n, a]) => `<button class="fsk" data-skill="${k}|${a}|${esc(n)}"><span>${esc(n)}</span><b>${sign(skillBonus(c, k, a))}</b></button>`).join("")}</div>
    </details>


    ${s.board && s.presentation && s.presentation.type === "tactical" ? "" : `<details class="fsec" data-k="tes" ${tesOpen ? "open" : ""}><summary>✨ Objetos especiales <small>${(c.treasures || []).length}</small></summary>${treasuresHTML(c, { compact: true })}</details>
    ${whispersFor(s, c.id).length ? `<details class="fsec" data-k="wh" ${whOpen ? "open" : ""}><summary>🤫 Lo que sabes tú <small>${whispersFor(s, c.id).length}</small></summary>${whispersHTML(s, c, { limit: 4 })}</details>` : ""}
    <details class="fsec" data-k="cua" ${cuaOpen ? "open" : ""}><summary>📓 Cuaderno <small>${(c.journal || []).length}</small></summary>${journalHTML(c, { limit: 4 })}</details>`}
    ${s.board && s.presentation && s.presentation.type === "tactical" ? "" : `<details class="fsec" data-k="rest" ${restOpen ? "open" : ""}><summary>Descansos</summary>
      <div class="frest"><div><b>Descanso corto</b> <small>1 hora · gasta dados de golpe (d${classInfo(c.cls).hd} + CON)</small>
        <div class="row"><input type="number" id="hdn" min="1" max="${c.level - (c.hdUsed || 0)}" value="${Math.min(hdN, Math.max(1, c.level - (c.hdUsed || 0)))}" aria-label="Dados de golpe"><span class="note">de ${c.level - (c.hdUsed || 0)} que te quedan</span><button class="btn small" id="srest" ${live ? "disabled title='No en combate'" : ""}>Descansar</button></div></div>
        <div><b>Descanso largo</b> <small>8 horas · todo: PG, dados de golpe, espacios; −1 cansancio</small><div class="row"><button class="btn small" id="lrest" ${live ? "disabled title='No en combate'" : ""}>Descansar</button></div></div></div>
    </details>`}`;
  bind(el, s, c, tok);
  const p = $(".fport", el); if (c.portrait) getImage(c.portrait).then(u => { if (u) { p.style.backgroundImage = `url('${u}')`; p.textContent = ""; } });
}

/* «Tu turno», por fases: Movimiento, Acción, Acción adicional y Reacción. Cada fase dice si la tienes o ya la has
   gastado, y muestra solo lo que puedes hacer con ella (ataques, conjuros y rasgos de tu personaje); lo que no puedes
   hacer aparece apagado con el motivo. Primero eliges QUÉ y luego tocas A QUIÉN en la mesa. */
const NOACT = ["incapacitado", "inconsciente", "aturdido", "paralizado", "petrificado", "muerto"];
const NOMOVE = { agarrado: "agarrado", apresado: "apresado" };
const fm = n => (Math.round(n * 10) / 10).toLocaleString("es-ES");
function mySpells(c) {
  const sp = c.spells || { list: [] };
  return (sp.list || []).filter(x => x.prepared !== false || (x.level || 0) === 0).map(x => { const d = findSpell(x.name); return { x, d, m: spellMech(d) }; }).filter(o => o.d && o.m)
    .sort((a, b) => (a.d.lvl || 0) - (b.d.lvl || 0));
}
function spellWhy(c, e, m, incap) {
  if (incap) return `Estás ${incap}`;
  if (e && (m.time === "bonus" ? e.bonus : m.time === "react" ? e.react : e.act)) return m.time === "bonus" ? "Ya usaste la acción adicional" : m.time === "react" ? "Ya usaste la reacción" : "Ya usaste la acción";
  if (m.lvl && !freeSlots(c, m.lvl).length) return `Sin espacios de nivel ${m.lvl} o más`;
  if (m.lvl && e && e.slotCast) return "Ya lanzaste un conjuro con espacio este turno: solo trucos";
  return "";
}
function spellRows(s, c, tok, list, e, incap) {
  return list.map(({ x, d, m }) => { const why = spellWhy(c, e, m, incap), lvl = d.lvl || 0;
    const tags = [m.conc ? "conc." : "", m.save ? "salvación" : "", m.atk ? "ataque" : "", m.area ? `${m.area.shape} ${m.area.size} m` : "", m.heal ? "cura" : ""].filter(Boolean);
    return `<div class="fspell ${openSpell === x.name && !why ? "open" : ""} ${why ? "off" : ""}"><button class="fsph" data-spell="${esc(x.name)}" ${why ? `disabled title="${esc(why)}"` : ""}><i>${lvl || "T"}</i><b>${esc(x.name)}</b><small>${why ? esc(why) : tags.map(esc).join(" · ")}</small></button>
      ${openSpell === x.name && !why ? castBox(s, c, tok, d, m) : ""}</div>`; }).join("");
}
/** Luz en tu casilla y la que llevas (SRD: luz brillante, tenue y oscuridad; visión en la oscuridad). */
function lightLine(s, c, tok) {
  const lv = lightMap(s.board, s.tokens).at(tok.c + "," + tok.r), dv = darkvisionOf(c);
  const txt = lv === 2 ? "☀️ Luz brillante" : lv === 1 ? "◐ Luz tenue: desventaja en Sabiduría (Percepción) para ver" : `● Oscuridad${dv ? `: ves como en luz tenue hasta ${dv} m (visión en la oscuridad, en grises)` : ": sin luz no ves nada (cegado para ver)"}`;
  return `<div class="flight ${lv === 2 ? "" : lv === 1 ? "dim" : "dark"}"><span>${txt}</span><label title="Lo que llevas encendido ilumina a tu alrededor para todo el grupo">🔦<select id="flightsel"><option value="">Sin luz</option>${Object.entries(LIGHT_ITEMS).map(([k, x]) => `<option value="${k}" ${tok.light === k ? "selected" : ""} title="${esc(x.src)}">${x.n}</option>`).join("")}</select></label></div>`;
}
/** Cofres sin abrir y visibles junto a tu figura (a 1 casilla): pides abrirlo y su contenido va al botín del grupo. */
function chestNear(s, tok) {
  if (!tok || !s.board) return "";
  const near = (s.board.props || []).filter(p => (p.loot != null || p.chest) && !p.opened && !p.hidden && dist(p, tok) <= 1);
  const asked = new Set((s.rolls || []).filter(r => r.kind === "open" && r.status === "pending").map(r => r.prop));
  return near.map(p => `<div class="chestnear">🧰 <b>${esc(p.label || "Cofre")}</b> a tu lado ${asked.has(p.id) ? `<small>· esperando al máster…</small>` : `<button class="btn small gold" data-openchest="${p.id}">Abrir el cofre</button>`}<small>Lo que haya irá al botín del grupo.${phase(s) === "live" ? " En combate, abrirlo es tu interacción gratuita con un objeto." : ""}</small></div>`).join("");
}
function turnBlock(s, c, tok) {
  const ph = phase(s), myTurn = ph === "live" && s.board.turn === tok.id, A = armedNow();
  if (ph === "init") return `<section class="fturn"><div class="ftt"><b>⚔️ ¡Combate!</b></div>${tok.init == null || tok.init === "" ? `<button class="btn gold" id="finit">🎲 Tirar iniciativa</button>` : `<p class="note">Tu iniciativa: <b>${tok.init}</b>. Esperad a que el máster empiece la ronda.</p>`}</section>`;
  const e = eco(s, tok), max = moveBudget(s, tok), left = Math.max(0, max - e.mov);
  const conds = (tok.conds || []).map(x => x.id), incapId = conds.find(x => NOACT.includes(x)), incap = incapId ? (ESTADOS.find(y => y.id === incapId) || { n: incapId }).n.toLowerCase() : "";
  const nAtk = attacksPerAction(s, tok), atkLeft = !e.act ? nAtk : (e.atkLeft || 0), atks = attacksOf(s, tok).filter(w => !w.spell);
  const SP = mySpells(c), byT = k => SP.filter(o => o.m.time === k);
  const F = c.features || [], fUse = k => F.filter(f => { const t = (f.name + " " + (f.text || "")).toLowerCase(); return k === "bonus" ? /acci[oó]n adicional/.test(t) : /reacci[oó]n/.test(t); });
  const cunning = F.some(f => /Acci[oó]n astuta/i.test(f.name));
  const light = atks.map((w, i) => ({ w, i })).filter(o => /ligera/i.test(o.w.notes || o.w.props || ""));
  const stateTag = (used, txt) => `<em class="phst ${used ? "used" : "ok"}">${used ? "✓ " : "● "}${txt}</em>`;
  const fix = k => myTurn || k === "react" ? `<button class="phfix" data-feco="${k}" title="Corregir: marcarla como ${k === "react" ? (e.react ? "disponible" : "gastada") : e[k] ? "disponible" : "gastada"}">↺</button>` : "";
  if (phSeq !== s.board.seq) { phSeq = s.board.seq; phOpen = {}; } // turno nuevo: se abren las fases que tienes disponibles
  const phaseBox = (k, icon, title, used, st, body, open) => `<details class="phbox ${used ? "used" : ""} ${open ? "now" : ""}" data-ph="${k}" ${(phOpen[k] ?? open) ? "open" : ""}><summary><span>${icon} ${title}</span>${st}${fix(k)}</summary><div class="phbody">${body}</div></details>`;
  const atkBtn = (w, i, use, why) => `<button class="fw ${A && A.kind === "atk" && A.i === i && (A.use || "act") === use ? "armed" : ""}" data-arm="${i}" data-use="${use}" ${why ? `disabled title="${esc(why)}"` : ""}><b>${esc(w.name)}</b><span>${sign(w.atk)} · ${esc(w.expr)}</span><small>${why ? esc(why) : w.rng.ranged ? `${w.rng.n}/${w.rng.l} m` : `${w.rng.l} m`}</small></button>`;
  // Fuera de tu turno: solo reacciones (y lo que podrás hacer cuando te toque)
  if (!myTurn) {
    if (A && A.kind === "atk") queueMicrotask(() => arm(null)); // un arma preparada no sigue apuntando fuera de tu turno
    const cur = s.tokens.find(t => t.id === s.board.turn), N = cur ? (cur.kind === "pc" ? (s.characters.find(x => x.id === cur.char) || cur).name : (cur.hidden ? "?" : cur.name)) : "—";
    const reactBody = incap ? `<p class="phno">Estás ${incap}: no puedes usar reacciones.</p>` : `<p class="phhint">Se usa durante el turno de otro, cuando ocurre su desencadenante.</p>
      <ul class="phlist"><li><b>Ataque de oportunidad</b>: si un enemigo sale de tu alcance, la mesa te lo ofrecerá.</li>${fUse("react").map(f => `<li><b>${esc(f.name)}</b>: ${esc(f.text || "")}</li>`).join("")}</ul>
      ${byT("react").length ? `<small class="phsub">Conjuros de reacción</small>${spellRows(s, c, tok, byT("react"), e, incap)}` : ""}`;
    // Solo se destaca si AHORA MISMO hay algo a lo que reaccionar (una oportunidad ofrecida por la mesa)
    const oaNow = (s.rolls || []).find(r => r.kind === "oa" && r.status === "pending" && r.tok === tok.id && (r.seq == null || r.seq === s.board.seq));
    const tgt = oaNow && s.tokens.find(t => t.id === oaNow.target);
    const oaBox = oaNow ? `<p class="phnow">⚔ <b>¡Oportunidad!</b> ${esc(tgt ? (tgt.hidden ? "?" : tgt.name) : "Un enemigo")} sale de tu alcance. Responde en el aviso de arriba o en Tiradas.</p>` : "";
    return `<section class="fturn"><div class="ftt"><b>⏳ Turno de ${esc(N)}</b><small>Ronda ${s.board.round || 1}</small></div>
      <p class="phwait">${oaNow ? "" : "No es tu turno. Nada que hacer ahora: si puedes reaccionar, la mesa te avisará."}</p>${oaBox}
      ${phaseBox("react", "↺", "Reacción", !!e.react, stateTag(!!e.react, e.react ? "gastada esta ronda" : "disponible"), reactBody, !!oaNow)}
      <details class="phpre"><summary>En tu turno podrás…</summary><p class="phhint">Moverte ${fm(moveBudget(s, tok))} m · una acción (${nAtk > 1 ? `Atacar ${nAtk} veces, ` : "Atacar, "}lanzar un conjuro, Correr, Esquivar…) · una acción adicional si tienes algo que la use${cunning ? " (Acción astuta)" : ""}.</p></details></section>`;
  }
  // ---- Tu turno ----
  const moveStop = conds.find(x => NOMOVE[x]) || (incap && ["paralizado", "petrificado", "inconsciente", "aturdido"].includes(incapId) ? incapId : null);
  const prone = conds.includes("derribado");
  const movBody = moveStop ? `<p class="phno">No puedes moverte: estás ${moveStop}.</p>`
    : `<div class="movebar thin ${e.mov > max ? "over" : ""}"><i style="width:${Math.min(100, e.mov / Math.max(1, max) * 100)}%"></i><em>🦶 ${fm(e.mov)} / ${fm(max)} m${e.dash ? " · corriendo" : ""}</em></div>
      <p class="phhint">Arrastra tu figura por la mesa. Puedes moverte antes y después de la acción, en varios trozos.${prone ? ` <b>Derribado:</b> levantarte cuesta ${fm(speedOf(s, tok) / 2)} m; arrastrarte, el doble.` : ""}</p>`;
  // Acción
  const actUsed = !!e.act && !(e.atkLeft > 0), aWhy = incap ? `Estás ${incap}` : actUsed ? "Ya usaste la acción" : "";
  const actBody = incap ? `<p class="phno">Estás ${incap}: no puedes hacer acciones.</p>` : `
    <small class="phsub">Atacar${nAtk > 1 ? ` · ${e.act && e.atkLeft > 0 ? `te quedan ${e.atkLeft} de ${nAtk} ataques` : `${nAtk} ataques con la misma acción`}` : ""} · elige el arma y toca al enemigo</small>
    <div class="fweap">${atks.map((w, i) => atkBtn(w, i, "act", aWhy)).join("") || `<p class="empty">Sin armas.</p>`}</div>
    ${A && A.kind === "atk" ? `<div class="farmed">🎯 Ahora toca al enemigo en la mesa <button class="btn small" data-disarm>Cancelar</button></div>` : ""}
    ${byT("act").length ? `<small class="phsub">Lanzar un conjuro (acción Magia)</small>${spellRows(s, c, tok, byT("act"), e.act && e.atkLeft > 0 ? { ...e, act: true } : e, incap)}` : ""}
    ${conds.includes("ardiendo") ? `<button class="btn small red" data-fdouse title="SRD «Fuego»: con una acción apagas el fuego rodando por el suelo y quedas derribado" ${e.act ? "disabled" : ""}>🔥 Apagarse</button>` : ""}
    <details class="faccs" ${accOpen ? "open" : ""}><summary>Otras acciones: Correr, Esquivar, Destrabarse, Ayudar…</summary><div class="accs">${ACCIONES.filter(([n]) => n !== "Atacar" && n !== "Magia").map(([n, d]) => `<button class="btn small" data-facc="${esc(n)}" title="${esc(d)}" ${e.act ? "disabled" : ""}>${n}</button>`).join("")}</div></details>`;
  const actState = incap ? stateTag(true, "no puedes") : e.act && e.atkLeft > 0 ? `<em class="phst ok">● ${e.atkLeft} ataque${e.atkLeft > 1 ? "s" : ""} más</em>` : stateTag(!!e.act, e.act ? "gastada" : "disponible");
  // Acción adicional
  const bUsed = !!e.bonus, bWhy = incap ? `Estás ${incap}` : bUsed ? "Ya usaste la acción adicional" : "";
  const bonusFeats = fUse("bonus").filter(f => !/Acci[oó]n astuta/i.test(f.name));
  const lightOk = light.length >= 2 && e.act;
  const bonusBody = incap ? `<p class="phno">Estás ${incap}.</p>` : `
    ${cunning ? `<small class="phsub">Acción astuta</small><div class="accs">${["Correr", "Destrabarse", "Esconderse"].map(n => `<button class="btn small" data-fbon="${n}" ${bWhy ? `disabled title="${esc(bWhy)}"` : ""}>${n}</button>`).join("")}</div>` : ""}
    ${light.length >= 2 ? `<small class="phsub">Ataque con la otra arma ligera${lightOk ? "" : " · primero ataca con un arma ligera"}</small><div class="fweap">${light.map(o => atkBtn(o.w, o.i, "bonus", bWhy || (lightOk ? "" : "Primero ataca con un arma ligera (acción Atacar)"))).join("")}</div><p class="phhint">Sin sumar el modificador de característica al daño, salvo que sea negativo (propiedad Ligera).</p>` : ""}
    ${byT("bonus").length ? `<small class="phsub">Conjuros de acción adicional</small>${spellRows(s, c, tok, byT("bonus"), e, incap)}` : ""}
    ${bonusFeats.length ? `<small class="phsub">Rasgos</small><ul class="phlist">${bonusFeats.map(f => `<li><button class="btn small" data-fbonf="${esc(f.name)}" ${bWhy ? "disabled" : ""}>Usar</button> <b>${esc(f.name)}</b>: ${esc(f.text || "")}</li>`).join("")}</ul>` : ""}
    ${!cunning && light.length < 2 && !byT("bonus").length && !bonusFeats.length ? `<p class="phno">No tienes nada que use la acción adicional ahora mismo.</p>` : ""}`;
  // Reacción (en tu turno casi nunca se usa, pero se ve si ya la gastaste)
  const reactBody = incap ? `<p class="phno">Estás ${incap}.</p>` : `<p class="phhint">Se usa en el turno de otro (por ejemplo, un ataque de oportunidad). Vuelve al empezar tu siguiente turno.</p>${byT("react").length ? spellRows(s, c, tok, byT("react"), e, incap) : ""}`;
  const hasBonus = cunning || byT("bonus").some(o => !spellWhy(c, e, o.m, incap)) || bonusFeats.length || lightOk;
  const order = [!moveStop && left > 0 && !e.mov ? "mov" : null, !e.act || e.atkLeft > 0 ? "act" : null, !bUsed && hasBonus ? "bonus" : null].filter(Boolean);
  const nowK = order[0] || null;
  return `<section class="fturn mine">
    <div class="ftt"><b>⚔️ Tu turno</b><small>Ronda ${s.board.round || 1}</small><button class="btn gold small" id="fend">Terminar turno ▶</button></div>
    ${incap ? `<p class="phno big">Estás ${incap}: no puedes moverte ni actuar. Termina el turno.</p>` : ""}
    ${phaseBox("mov", "🦶", "Movimiento", moveStop || left <= 0, stateTag(moveStop || left <= 0, moveStop ? "0 m" : `quedan ${fm(left)} m`), movBody, !incap && !moveStop && left > 0)}
    ${phaseBox("act", "⚡", "Acción", actUsed || !!incap, actState, actBody, !incap && !actUsed)}
    ${phaseBox("bonus", "✦", "Acción adicional", bUsed || !!incap, stateTag(bUsed || !!incap || !hasBonus, incap ? "no puedes" : bUsed ? "gastada" : hasBonus ? "disponible" : "nada que puedas usar"), bonusBody, !incap && !bUsed && !!hasBonus)}
    ${phaseBox("react", "↺", "Reacción", !!e.react || !!incap, stateTag(!!e.react || !!incap, e.react ? "gastada" : "disponible"), reactBody, false)}
    <p class="phfree">Gratis en tu turno: una interacción con un objeto (abrir una puerta, desenvainar) y hablar.${e.slotCast ? " · Ya lanzaste un conjuro con espacio: solo trucos." : ""}</p>
    ${!incap && !nowK ? `<p class="phdone">Lo has gastado todo. Termina tu turno.</p>` : ""}
  </section>`;
}

/** En combate los conjuros van dentro de cada fase; aquí solo los espacios que te quedan. */
function slotsLine(c) {
  const slots = Object.entries((c.spells || {}).slots || {}).filter(([, v]) => v.max > 0); if (!slots.length) return "";
  return `<section class="fsec2"><h4>✨ Espacios de conjuro <small>CD ${spellDC(c)}</small></h4><div class="fslots">${slots.map(([l, v]) => `<span class="slotrow"><small>Nv ${l}</small>${Array.from({ length: v.max }, (_, i) => `<i class="slot ${i < v.max - v.used ? "on" : ""}"></i>`).join("")}</span>`).join("")}</div></section>`;
}
function spellsBlock(s, c, tok) {
  const sp = c.spells || { slots: {}, list: [] }, ab = classInfo(c.cls).cast;
  const slots = Object.entries(sp.slots || {}).filter(([, v]) => v.max > 0);
  const known = (sp.list || []).filter(x => x.prepared !== false || (x.level || 0) === 0).map(x => ({ x, d: findSpell(x.name) })).sort((a, b) => ((a.d && a.d.lvl) || 0) - ((b.d && b.d.lvl) || 0));
  return `<section class="fsec2"><h4>✨ Conjuros <small>CD ${spellDC(c)} · ataque ${sign(prof(c.level) + mod(c.abilities[ab]))}</small></h4>
    ${slots.length ? `<div class="fslots">${slots.map(([l, v]) => `<span class="slotrow"><small>Nv ${l}</small>${Array.from({ length: v.max }, (_, i) => `<button class="slot ${i < v.max - v.used ? "on" : ""}" data-slot="${l}|${i < v.max - v.used ? 1 : -1}" title="${i < v.max - v.used ? "Libre (pulsa para gastarlo a mano)" : "Gastado (pulsa para recuperarlo)"}"></button>`).join("")}</span>`).join("")}</div>` : ""}
    <div class="fspells">${known.map(({ x, d }) => { const m = spellMech(d), lvl = d ? d.lvl : x.level || 0;
      const tags = m ? [m.time === "bonus" ? "adicional" : m.time === "react" ? "reacción" : "", m.conc ? "conc." : "", m.save ? "salv." : "", m.atk ? "ataque" : "", m.area ? `${m.area.shape} ${m.area.size} m` : "", m.heal ? "cura" : ""].filter(Boolean) : [];
      return `<div class="fspell ${openSpell === x.name ? "open" : ""}"><button class="fsph" data-spell="${esc(x.name)}"><i>${lvl ? lvl : "T"}</i><b>${esc(x.name)}</b><small>${tags.map(esc).join(" · ")}</small></button>
        ${openSpell === x.name ? castBox(s, c, tok, d, m) : ""}</div>`; }).join("") || `<p class="empty">Sin conjuros preparados.</p>`}</div></section>`;
}

function castBox(s, c, tok, d, m) {
  if (!d || !m) return `<div class="fcast"><p class="note">Este conjuro no está en el compendio: tíralo a mano.</p></div>`;
  const free = m.lvl ? freeSlots(c, m.lvl) : [0];
  if (slotPick[d.n] == null || !free.includes(slotPick[d.n])) slotPick[d.n] = free[0];
  const onBoard = tok && s.board;
  const cands = onBoard ? s.tokens.filter(t => !t.hidden || isDM(s)) : [];
  const nm = t => t.kind === "pc" ? (s.characters.find(x => x.id === t.char) || t).name : t.name;
  return `<div class="fcast"><p class="fdesc">${esc(d.t)} · ${esc(d.al)} · ${esc(d.du)}${m.save ? ` · salvación de ${({ fue: "Fuerza", des: "Destreza", con: "Constitución", int: "Inteligencia", sab: "Sabiduría", car: "Carisma" })[m.save]}${m.half ? " (mitad si la supera)" : ""}` : ""}</p>
    ${m.lvl ? (free.length ? `<label class="field">Espacio<select data-slotpick="${esc(d.n)}">${free.map(l => `<option value="${l}" ${slotPick[d.n] === l ? "selected" : ""}>Nivel ${l}${l > m.lvl && m.up ? ` (+${m.up} por nivel)` : ""}</option>`).join("")}</select></label>` : `<p class="note warn">No te quedan espacios de nivel ${m.lvl} o superior.</p>`) : ""}
    ${onBoard && !m.self ? `<div class="ftargets"><small>Objetivos · tócalos en la mesa</small><div class="fpicks">${[...picked].map(id => { const t = s.tokens.find(x => x.id === id); return t ? `<button class="cchip" style="--c:#d6aa4e" data-unpick="${id}" title="Quitar">${esc(nm(t))} ✕</button>` : ""; }).join("") || `<em>Ninguno todavía</em>`}</div>
      ${m.area ? `<button class="btn small" id="farea" title="Marca a todas las criaturas dentro del área (centrada en el primer objetivo, o en ti si es un cono, línea o emanación)">◎ Marcar los del área</button>` : ""}</div>` : !onBoard ? `<p class="note">Fuera de la mesa: se gasta el espacio y queda anotado.</p>` : ""}
    <button class="btn gold small" id="fcastgo" ${m.lvl && !free.length ? "disabled" : ""}>Lanzar ${esc(d.n)}</button></div>`;
}

function bind(el, s, c, tok) {
  const on = (id, fn) => { const x = $("#" + id, el); if (x) x.onclick = fn; };
  const fs = $("#fsel", el); if (fs) fs.onchange = () => { charSel = fs.value; renderSheet(el); };
  on("fdeath", () => tok && deathSave(tok.id));
  $$("details.fsec", el).forEach(dt => dt.ontoggle = () => { if (dt.dataset.k === "sv") testsOpen = dt.open; if (dt.dataset.k === "rest") restOpen = dt.open; if (dt.dataset.k === "tes") tesOpen = dt.open; if (dt.dataset.k === "cua") cuaOpen = dt.open; if (dt.dataset.k === "wh") whOpen = dt.open; });
  $$("[data-openchest]", el).forEach(b => b.onclick = () => { requestOpen(b.dataset.openchest, tok.id); toast("Pides abrir el cofre: el máster lo verá al momento"); });
    { const ls = $("#flightsel", el); if (ls && tok) ls.onchange = () => store.commit("token", st => { const t = st.tokens.find(x => x.id === tok.id); if (t) { if (ls.value) t.light = ls.value; else delete t.light; } }); }
  bindSheetFree(el, c); bindTreasures(el, c, () => renderSheet(el)); bindJournal(el, c, () => renderSheet(el));
  $$("[data-save]", el).forEach(b => b.onclick = () => {
    const k = b.dataset.save, p = tok ? savePlan(s, tok, k) : { bonus: saveBonus(c, k), adv: 0, extra: "", why: [] };
    publish({ kind: "save", label: `Salvación de ${ABILITIES.find(a => a[0] === k)[1]} de ${c.name}`, expr: `1d20${p.bonus >= 0 ? "+" : ""}${p.bonus}${p.extra}`, adv: p.adv, by: tok ? tok.id : null, why: p.why.length ? p.why : null });
  });
  $$("[data-skill]", el).forEach(b => b.onclick = () => {
    const [k, a, n] = b.dataset.skill.split("|"), bonus = skillBonus(c, k, a);
    publish({ kind: "check", label: `${n} de ${c.name}`, expr: `1d20${bonus >= 0 ? "+" : ""}${bonus}`, by: tok ? tok.id : null });
  });
  $$("[data-slot]", el).forEach(b => b.onclick = () => { const [l, dlt] = b.dataset.slot.split("|"); useSlot(c.id, +l, +dlt); });
  $$("[data-spell]", el).forEach(b => b.onclick = () => { openSpell = openSpell === b.dataset.spell ? null : b.dataset.spell; arm(openSpell ? { kind: "spell", name: openSpell, go: doCast } : null); renderSheet(el); });
  $$("[data-unpick]", el).forEach(b => b.onclick = () => togglePick(b.dataset.unpick));
  $$("[data-arm]", el).forEach(b => b.onclick = () => { const i = +b.dataset.arm, use = b.dataset.use || "act", A = armedNow(); openSpell = null; arm(A && A.kind === "atk" && A.i === i && (A.use || "act") === use ? null : { kind: "atk", tok: tok.id, i, use }); renderSheet(el); });
  $$("[data-fbon]", el).forEach(b => b.onclick = () => {
    const nm = b.dataset.fbon, tid = tok.id;
    spend(tid, "bonus");
    if (nm === "Correr") store.commit("token", st => { const t = st.tokens.find(x => x.id === tid); const e = eco(st, t); e.dash = true; t.eco = e; });
    if (nm === "Destrabarse") store.commit("token", st => { const t = st.tokens.find(x => x.id === tid); t.conds = (t.conds || []).filter(x => x.id !== "destrabado"); t.conds.push({ id: "destrabado", seq: st.board.seq }); });
    toast(`Acción astuta · ${nm}: ${(ACCIONES.find(x => x[0] === nm) || [, ""])[1]}`);
  });
  $$("[data-fbonf]", el).forEach(b => b.onclick = () => { spend(tok.id, "bonus"); toast(`${b.dataset.fbonf}: acción adicional gastada. El máster aplica el efecto.`); });
  $$("details.phbox", el).forEach(d => d.ontoggle = () => { phOpen[d.dataset.ph] = d.open; });
  $$("[data-disarm]", el).forEach(b => b.onclick = () => { arm(null); renderSheet(el); });
  on("finit", () => tok && rollInit(tok.id));
  on("fend", () => { arm(null); endTurn(); });
  $$("[data-feco]", el).forEach(b => b.onclick = () => tok && toggle(tok.id, b.dataset.feco));
  $$(".faccs", el).forEach(d => d.ontoggle = () => { accOpen = d.open; });
  { const fd = $("[data-fdouse]", el); if (fd) fd.onclick = () => import("../core/peligros.js").then(m => m.douse(tok.id)).then(() => renderSheet(el)); }
  $$("[data-facc]", el).forEach(b => b.onclick = () => {
    const nm = b.dataset.facc, tid = tok.id;
    if (nm === "Correr") spend(tid, "dash");
    else if (nm === "Esquivar" || nm === "Destrabarse") { spend(tid, "act"); store.commit("token", st => { const t = st.tokens.find(x => x.id === tid); const id = nm === "Esquivar" ? "esquivando" : "destrabado"; t.conds = (t.conds || []).filter(x => x.id !== id); t.conds.push({ id, seq: st.board.seq }); }); }
    else spend(tid, "act");
    toast(`${nm}: ${(ACCIONES.find(x => x[0] === nm) || [, ""])[1]}`);
  });
  $$("[data-slotpick]", el).forEach(x => x.onchange = () => { slotPick[x.dataset.slotpick] = +x.value; });
  on("farea", () => {
    const d = findSpell(openSpell), m = spellMech(d), center = s.tokens.find(t => t.id === [...picked][0]);
    if (!center && !/cono|línea|emanación/.test(m.area.shape)) return toast("Marca primero la criatura del centro del área.");
    inArea(s, m, tok, center).forEach(id => picked.add(id)); renderSheet(el);
  });
  on("fcastgo", () => doCast());
  // Lanzar: desde el botón o, como en BG3, al colocar el área o tocar al objetivo de un ataque de conjuro
  function doCast() {
    const s = store.get(); if (!openSpell) return;
    const d = findSpell(openSpell), m = spellMech(d);
    if (!tok || !s.board) {           // fuera de la mesa: solo se gasta el espacio
      if (m.lvl) { const free = freeSlots(c, m.lvl); if (!free.length) return; useSlot(c.id, slotPick[d.n] || free[0]); }
      publish({ kind: "free", label: `${c.name} lanza ${d.n}`, expr: m.heal ? m.heal : "1d20", by: null });
      openSpell = null; arm(null); return;
    }
    const targets = m.self ? [tok.id] : [...picked];
    if (!targets.length && (m.save || m.heal || m.atk || m.buff || m.dmg)) return toast("Elige al menos un objetivo.");
    const r = cast(tok.id, d.n, m.lvl ? slotPick[d.n] : 0, targets);
    if (r !== null) { openSpell = null; arm(null); }
  }
  on("faddcond", () => { condOpen = !condOpen; renderSheet(el); });
  $$("[data-addc]", el).forEach(b => b.onclick = () => { condOpen = false; store.commit("token", st => { const k = st.tokens.find(x => x.id === tok.id); k.conds = k.conds || []; if (condImmune(k, b.dataset.addc)) { toast(`${k.name} es inmune a ese estado (perfil del SRD).`); return; } if (!k.conds.some(c => c.id === b.dataset.addc)) k.conds.push({ id: b.dataset.addc }); }); });
  $$("[data-uncond]", el).forEach(b => b.onclick = () => store.commit("token", st => { const k = st.tokens.find(x => x.id === tok.id); k.conds = (k.conds || []).filter(c => c.id !== b.dataset.uncond); }));
  const hd = $("#hdn", el); if (hd) hd.oninput = () => { hdN = +hd.value || 1; };
  on("srest", () => shortRest(c.id, hdN));
  on("lrest", () => { const b = $("#lrest", el); if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "¿Seguro? Pulsa otra vez"; return; } longRest(c.id); });
}
