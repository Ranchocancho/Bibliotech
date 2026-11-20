// La Partida: el escenario común y, para el máster, el panel con el que decide qué tenéis delante.
import { store } from "../core/store.js";
import { isDM, currentUser } from "../core/session.js";
import { liveSession, visibleLive, lastClosed, sessionName, startSession, closeSession, show, presentationFor, addEntry } from "../core/sesiones.js";
import { loadScene, blankBoard, clearBoard, saveBoardAsScene, addPC, removePC } from "../core/mesa.js";
import { presence } from "../core/presence.js";
import { loreOf, entry, related, refName, showEntry, clockOf, clockText, advanceClock, setBackdrop } from "../core/lore.js";
import { renderStage } from "./presentacion.js";
import { mountTactical } from "./mesa.js";
import { renderRolls } from "./tiradas.js";
import { renderSheet } from "./ficha.js";
import { onAim } from "../core/apuntar.js";
import { canLevelUp, levelGranted } from "../data/dnd.js";
import { floorsHTML, bindFloors } from "./plantasui.js";
import { AMBIENTES } from "../core/sonido.js";
const LUCES = { dia: "☀️ Día", interior: "🕯 Interior", noche: "🌙 Noche" };
import { floorName, floorsOf } from "../core/plantas.js";
import { $, $$, esc, toast } from "../core/ui.js";
import { difficulty, partyOf, HINT } from "../core/encuentro.js";
import { hereOf, setHere, contextOf, sessionCast, markChange, changesOf, changeText, fieldsOf, badges, VITAL, STANCE, touch } from "../core/contexto.js";
import { placePath, placeOf, LORE, timeline, tellTimeline } from "../core/lore.js";
const openCard = id => import("./fichalore.js").then(m => m.openLoreCard(id));
const openSearch = () => import("./fichalore.js").then(m => m.openLoreSearch());

let el, closing = false, tac = null, tacEdit = false, panelHidden = false, lastKey = null;
// Panel del máster: dos modos (Táctica de combate | Roleplay); pestañas Iniciativa | Tiradas en táctica y en la columna del jugador
let floorsOpen = false, offAim = null;
let dmMode = "rol", dmTab = "ini", plTab = "pj", wasTac = null, rollsSeen = 0;

export function mount(root) {
  el = document.createElement("div");
  el.className = "partida";
  el.innerHTML = `<section class="stagebox"><div id="stage" class="stage-area"></div><div class="stagebar" id="sbar"></div></section>
    <aside class="dmpanel" id="dmp" aria-label="Panel del máster"><div class="dmmode" role="tablist"><button role="tab" data-mode="tac">⚔️ Táctica de combate</button><button role="tab" data-mode="rol">🎭 Roleplay</button></div>
      <div class="dm-tac" id="dm-tac"><div class="dmtools" id="dmtools"></div><div class="sidetabs" role="tablist"><button role="tab" data-dtab="ini">Iniciativa</button><button role="tab" data-dtab="tir">🎲 Tiradas</button><button role="tab" data-dtab="npc">👹 PNJ</button></div>
        <section class="dm-ini" id="dm-ini"></section><section class="dm-dice" id="dm-dice" hidden></section><section class="dm-npc" id="dm-npc" hidden><div class="dm-npcact" id="dm-npcact"></div><div class="dm-npctray" id="dm-npctray"></div></section></div>
      <div class="dm-rol" id="dm-rol"></div></aside>
    <aside class="plpanel" id="plp" aria-label="Tu columna: personaje e iniciativa" hidden>
      <div class="sidetabs pltabs" role="tablist"><button role="tab" data-ptab="pj">🧙 Personaje</button><button role="tab" data-ptab="ini">⚔️ Iniciativa</button><button role="tab" data-ptab="tir">🎲 Tiradas</button></div>
      <section class="pl-pj" id="pl-pj"><div class="pl-act" id="pl-act" hidden></div><div class="pl-sheet" id="pl-sheet"></div><div class="pl-dice" id="pl-dice"></div></section>
      <section class="pl-ini" id="pl-ini" hidden></section><section class="pl-log" id="pl-log" hidden></section></aside>`;
  if (offAim) offAim(); offAim = onAim(() => { if (el && !isDM(store.get())) renderSheet($("#pl-sheet", el)); });
  $$("[data-mode]", el).forEach(b => b.onclick = () => { dmMode = b.dataset.mode; tabs(); });
  $$("[data-dtab]", el).forEach(b => b.onclick = () => { dmTab = b.dataset.dtab; tabs(); });
  $$("[data-ptab]", el).forEach(b => b.onclick = () => { plTab = b.dataset.ptab; tabs(); });
  rollsSeen = (store.get().rolls || []).length;
  root.appendChild(el);
  closing = false; tac = null; lastKey = null;
  { const s0 = store.get(); if (isDM(s0) && !tacEdit && s0.board && s0.board.editing) store.commit("board", st => { if (st.board) st.board.editing = null; }); }
  draw();
  document.addEventListener("keydown", slashKey);
  return {
    update(state, label, remote) { if (label === "field" && !remote) return drawStage(); draw(); },
    unmount() { el = null; tac = null; if (offAim) { offAim(); offAim = null; } document.removeEventListener("keydown", slashKey); import("./fichalore.js").then(m => m.closeLore()); }
  };
}

// «/» abre el buscador del lore (sin robar la tecla si estás escribiendo)
function slashKey(ev) {
  if (ev.key !== "/" || ev.ctrlKey || ev.metaKey || ev.altKey) return;
  const t = ev.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  ev.preventDefault(); openSearch();
}

const tactical = s => { const p = presentationFor(s); return p && p.type === "tactical" && s.board; };

function wantRolls() { if (isDM(store.get())) { dmMode = "tac"; dmTab = "tir"; } else plTab = "pj"; tabs(); }

// Muestra la pestaña elegida de cada columna (y avisa con un destello si llegan tiradas a la pestaña oculta)
function tabs() {
  if (!el) return;
  const s = store.get(), dm = isDM(s), tacOn = !!tactical(s);
  const sel = (q, v, attr) => $$(q, el).forEach(b => b.setAttribute("aria-selected", b.dataset[attr] === v));
  sel("[data-mode]", dmMode, "mode"); sel("[data-dtab]", dmTab, "dtab");
  $("#dm-tac", el).hidden = dmMode !== "tac"; $("#dm-rol", el).hidden = dmMode !== "rol";
  $("#dm-ini", el).hidden = dmTab !== "ini"; $("#dm-dice", el).hidden = dmTab !== "tir"; $("#dm-npc", el).hidden = dmTab !== "npc";
  if (!tacOn && plTab === "ini") plTab = "pj";
  sel("[data-ptab]", plTab, "ptab");
  $('[data-ptab="ini"]', el).hidden = !tacOn;
  $("#pl-pj", el).hidden = plTab !== "pj"; $("#pl-ini", el).hidden = plTab !== "ini"; $("#pl-log", el).hidden = plTab !== "tir";
  if (!dm && plTab === "tir") renderRolls($("#pl-log", el), { tray: false });
  const n = (s.rolls || []).length;
  if (n > rollsSeen) { const b = dm ? (dmMode !== "tac" || dmTab !== "tir" ? $('[data-dtab="tir"]', el) : null) : (plTab !== "tir" ? $('[data-ptab="tir"]', el) : null); if (b) { b.classList.remove("ping"); void b.offsetWidth; b.classList.add("ping"); } }
  rollsSeen = n;
  if (dm && dmMode === "tac" && dmTab === "tir") renderRolls($("#dm-dice", el), { tray: false });
  // Los dados del máster van en la pestaña PNJ: lo que tire sale a nombre de la criatura elegida
  if (dm && dmMode === "tac" && dmTab === "npc") renderRolls($("#dm-npctray", el), { log: false, by: () => (tac && tac.npc ? tac.npc() : null) });
  if (dm && dmMode === "tac" && dmTab === "ini" && !tacOn) $("#dm-ini", el).innerHTML = `<div class="dmnotac"><p>No hay ninguna mesa táctica a la vista.</p><button class="btn small gold" data-gorol>🎭 Ir a Roleplay → Escena táctica</button></div>`;
  const g = $("[data-gorol]", el); if (g) g.onclick = () => { dmMode = "rol"; tabs(); };
}

function drawStage(force) {
  const st = $("#stage", el); if (!st) return;
  const s = store.get(), dm = isDM(s);
  if (tactical(s)) {
    st.classList.add("tac");
    const k = "tac" + tacEdit + dm;
    const side = dm ? $("#dm-ini", el) : $("#pl-ini", el);
    if (!tac || lastKey !== k) { lastKey = k; tac = mountTactical(st, { edit: tacEdit, sideHost: side, actHost: dm ? $("#dm-npcact", el) : $("#pl-act", el), onWantRolls: wantRolls, onSelect: id => {
      const s2 = store.get(), t = s2.tokens.find(x => x.id === id);
      if (isDM(s2)) { if (t && t.kind !== "pc") { dmMode = "tac"; dmTab = "npc"; tabs(); } if (floorsOpen) { $("#dmtools", el).innerHTML = toolsBlock(s2); bind(s2); } } } }); }
    else tac.update();
    return;
  }
  tac = null; st.classList.remove("tac");
  const pi = $("#pl-ini", el); if (pi) pi.innerHTML = "";
  const pa = $("#pl-act", el); if (pa) pa.innerHTML = ""; const dn = $("#dm-npcact", el); if (dn) dn.innerHTML = `<p class="empty" style="padding:6px 2px">Cuando haya mesa táctica, aquí verás lo que puede hacer el PNJ o enemigo que elijas.</p>`;
  const key = JSON.stringify(presentationFor(s)) + JSON.stringify(s.world.places.map(p => [p.map, p.summary, p.items.length]));
  if (!force && key === lastKey && st.childElementCount) return;
  lastKey = key; renderStage(st);
}

function draw() {
  if (!el) return;
  const state = store.get();
  const dm = isDM(state);
  const live = visibleLive(state);
  el.classList.toggle("withpanel", (dm && !panelHidden) || !dm);
  // Jugadores: columna fija con su ficha y su tapete de dados (la iniciativa entra cuando hay mesa táctica)
  const plp = $("#plp", el); plp.hidden = dm;
  if (!dm) { renderSheet($("#pl-sheet", el)); renderRolls($("#pl-dice", el), { log: false, by: () => { const st = store.get(), u = currentUser(st); const t = u && (st.tokens || []).find(x => x.kind === "pc" && x.owner === u.id); return t ? t.id : null; } }); }
  const typing = box => box && box.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if (!typing($("#sbar", el))) $("#sbar", el).innerHTML = `${live ? `<b>${esc(sessionName(live))}</b> en curso${live.test ? ` · <span class="tag secret">SOLO MÁSTERES</span>` : ""}` : "No hay ninguna partida en curso"}
    ${live ? `<span class="quicknote"><input id="qnote" placeholder="📜 Anotar en la crónica…" aria-label="Nota para la crónica"><button class="btn small" id="qnotego">Anotar</button></span>` : ""}
    <span class="grow"></span>${dm ? `<button class="btn small" id="togglepanel">${panelHidden ? "Mostrar panel" : "Ocultar panel"}</button>` : ""}<a class="btn small" href="#mundo">Mapa del mundo</a>`;
  const qn = $("#qnote", el), qg = $("#qnotego", el);
  if (qg) { const go = () => { if (qn.value.trim()) { addEntry(live.id, qn.value); qn.value = ""; toast("Anotado en la crónica"); } }; qg.onclick = go; qn.onkeydown = e => { if (e.key === "Enter") go(); }; }
  const tp = $("#togglepanel", el);
  if (tp) tp.onclick = () => { panelHidden = !panelHidden; draw(); if (tac) setTimeout(() => tac.update(), 50); };
  const panel = $("#dmp", el), rol = $("#dm-rol", el);
  panel.hidden = !dm || panelHidden;
  // Al aparecer la mesa táctica, el panel pasa solo a «Táctica»; al retirarla, vuelve a «Roleplay»
  const tacOn = !!tactical(state);
  if (wasTac !== null && tacOn !== wasTac && dm) dmMode = tacOn ? "tac" : "rol";
  if (wasTac === null && dm) dmMode = tacOn ? "tac" : "rol";
  wasTac = tacOn;
  if (dm && !panelHidden && !typing(rol)) {
    const open = [...$$("details[open]", rol)].map(d => d.dataset.k);
    rol.innerHTML = sessionBlock(state) + hereBlock(state) + levelBlock(state) + directionBlock(state) + tacticalBlock(state) + showBlock(state);
    open.forEach(k => { const d = $(`details[data-k="${k}"]`, rol); if (d) d.open = true; });
    if (!typing($("#dmtools", el))) $("#dmtools", el).innerHTML = toolsBlock(state);
    bind(state);
  }
  drawStage();
  tabs();
}

// Barra rápida del modo Táctica: lo que el máster necesita a mano en mitad del combate
// Barra del modo Táctica: una sola franja de botones cuadrados con icono (el texto, en la ayuda al pasar el ratón)
function toolsBlock(state) {
  const b = state.board;
  if (!b) return `<div class="dmquick"><span class="dmq-s">Sin mesa táctica · cárgala en 🎭 Roleplay</span><button class="qb" data-askroll title="Pedir una tirada a los jugadores">🎲</button><button class="qb" data-lsearch title="Buscar en el lore (tecla /)">🔎</button></div>`;
  const q = (id, ic, tip, on, extra = "") => `<button class="qb" ${id.startsWith("data-") ? id : `id="${id}"`} title="${tip}" ${on != null ? `aria-pressed="${!!on}"` : ""} ${extra}>${ic}</button>`;
  const dd = difficulty(state, [...state.tokens, ...((b.floors || []).flatMap(f => f.tokens || []))], partyOf(state));
  return `<div class="dmquick">
    <span class="diffchip k-${dd.k}" title="${esc(`${HINT[dd.k]} Baja ${dd.low} · Moderada ${dd.mod} · Alta ${dd.high} PX (${dd.n} personajes)`)}">⚖️ ${dd.label}<small>${dd.xp.toLocaleString("es-ES")} PX</small></span>
    ${tactical(state) ? "" : `<button class="btn small gold" data-show='{"type":"tactical"}'>Mostrar la mesa</button>`}
    ${q("qtedit", "✏️", tacEdit ? "Terminar de editar la mesa" : "Editar la mesa (los jugadores siguen viéndola)", tacEdit)}
    ${q("qtmon", "👹", "Añadir criaturas")}
    ${q("data-askroll", "🎲", "Pedir una tirada (habilidad, característica o salvación)")}
    ${q("data-lsearch", "🔎", "Buscar en el lore (tecla /)")}
    ${q("qtfog", "🌫", b.fog ? "Niebla de guerra: activada" : "Niebla de guerra: desactivada", !!b.fog)}
    <select class="qsel" id="qtluz" title="Luz de la mesa" aria-label="Luz">${Object.entries(LUCES).map(([k, n]) => `<option value="${k}" ${(b.ambient || "interior") === k ? "selected" : ""}>${n}</option>`).join("")}</select>
    <select class="qsel" id="qtsnd" title="Música y sonido ambiente" aria-label="Sonido ambiente">${Object.entries(AMBIENTES).map(([k, n]) => `<option value="${k}" ${(b.sound || "") === k ? "selected" : ""}>🎵 ${n}</option>`).join("")}</select>
    <button class="qb wide" id="qtfloor" aria-pressed="${floorsOpen}" title="Plantas del mapa: torres, sótanos…">🏰 ${esc(floorName(b))}${floorsOf(b).length > 1 ? ` <small>${floorsOf(b).length}</small>` : ""}</button></div>
    ${floorsOpen ? `<div class="dmfloors">${floorsHTML(state, tac && tac.selected ? tac.selected() : null)}</div>` : ""}`;
}

// Aquí: dónde está el grupo y lo que hay alrededor (PNJ, facciones, eventos y escenas del lugar), a un toque
function hereBlock(state) {
  const live = liveSession(state); if (!live) return "";
  const here = hereOf(state), path = id => placePath(state, id).map(x => x.name).join(" › ");
  const sel = `<select id="herepl" aria-label="Dónde está el grupo"><option value="">— Elige dónde estáis —</option>${state.world.places.map(p => `<option value="${p.id}" ${here && here.id === p.id ? "selected" : ""}>${esc(path(p.id))}</option>`).join("")}</select>`;
  if (!here) return `<div class="panel herepanel"><h2 class="sec">📍 Aquí</h2>${sel}<button class="btn small" data-lsearch>🔎 Buscar en el lore</button>
    <p class="note" style="margin:6px 0 0">Se marca solo al mostrar un lugar o cargar una escena suya. Verás quién hay y qué puede pasar.</p></div>`;
  const c = contextOf(state, here.id);
  const chip = e => `<button class="hchip${c.near(e) ? " far" : ""}${e.vital === "muerto" ? " dead" : ""}" data-lcard="${e.id}" title="${c.near(e) ? "De los alrededores" : "De este lugar"}">${LORE[e.kind].icon} ${esc(e.name)}${badges(e)}</button>`;
  const grp = (t, l) => l.length ? `<div class="hgrp"><small>${t}</small><div class="hchips">${l.slice(0, 10).map(chip).join("")}${l.length > 10 ? `<button class="hchip" data-lsearch>+${l.length - 10}</button>` : ""}</div></div>` : "";
  return `<div class="panel herepanel"><h2 class="sec">📍 Aquí <button class="lnk" data-lcard="${here.id}">${esc(here.name)}</button><button class="qb sm" data-lsearch title="Buscar en el lore (tecla /)">🔎</button></h2>${sel}
    ${grp("Quién hay", c.npc)}${grp("Facciones", c.faction)}${grp("Puede pasar", c.event)}${grp("Dioses y batallas", c.other)}
    ${c.scenes.length ? `<div class="hgrp"><small>Escenas tácticas</small><div class="hchips">${c.scenes.map(x => `<button class="hchip" data-load="${x.id}" title="Cargar en la mesa">⚔️ ${esc(x.name)}</button>`).join("")}</div></div>` : ""}
    ${!c.npc.length && !c.faction.length && !c.event.length ? `<p class="note" style="margin:6px 0 0">No hay nada del lore asociado a este lugar. Asigna el lugar a PNJ o facciones en el Lore.</p>` : ""}</div>`;
}

// ¿Qué ha cambiado? Al cerrar la sesión se repasa a quién habéis visto: vivo, muerto, hostil… y queda apuntado
function changesBlock(state) {
  const live = liveSession(state), cast = sessionCast(state), ch = changesOf(live);
  if (!cast.length && !ch.length) return "";
  const pick = (e, f) => `<select data-chg="${e.id}:${f}" aria-label="${f === "vital" ? "Estado" : "Actitud"} de ${esc(e.name)}">${Object.entries(f === "vital" ? VITAL : STANCE).map(([k, [i, n]]) => `<option value="${k}" ${(e[f] || (f === "vital" ? "vivo" : "neutral")) === k ? "selected" : ""}>${i} ${n}</option>`).join("")}</select>`;
  return `<h2 class="sec" style="margin-top:14px">¿Qué ha cambiado en el mundo?</h2>
    <div class="chglist">${cast.map(e => `<div class="chgrow"><button class="lnk" data-lcard="${e.id}">${LORE[e.kind].icon} ${esc(e.name)}</button>${fieldsOf(e.kind).map(f => pick(e, f)).join("")}</div>`).join("")}</div>
    ${ch.length ? `<p class="note" style="margin:6px 0 0">Cambios de hoy: ${ch.map(c => esc(changeText(c))).join(" · ")} <button class="btn small" id="chg2recap">Añadir al resumen</button></p>` : `<p class="note" style="margin:6px 0 0">Los PNJ y facciones que han salido hoy. Cambia lo que haga falta: se guarda al momento.</p>`}`;
}

// Subidas de nivel: las concede el máster cuando conviene (al acabar una escena o la sesión), con PX o por hitos
function levelBlock(state) {
  const pcs = state.characters.filter(c => c.owner || (state.tokens || []).some(t => t.char === c.id)); if (!pcs.length) return "";
  const ready = pcs.filter(c => canLevelUp(c) && !levelGranted(c));
  return `<div class="panel lvlpanel"><h2 class="sec">⬆ Subidas de nivel</h2>
    <div class="lvlchips">${pcs.map(c => `<button class="lvlc ${levelGranted(c) ? "on" : canLevelUp(c) ? "ready" : ""}" data-lvlg="${c.id}" title="${levelGranted(c) ? "Concedido: pulsa para retirarlo" : canLevelUp(c) ? "Tiene los PX: pulsa para concederlo" : "Por hitos: pulsa para concederlo"}">${esc(c.name.split(" ")[0])} <small>${c.level}→${c.level + 1}</small>${levelGranted(c) ? " ✓" : canLevelUp(c) ? " ★" : ""}</button>`).join("")}</div>
    ${ready.length > 1 ? `<button class="btn small gold" data-lvlall>Conceder a todos los que tienen PX (${ready.length})</button>` : ""}
    <p class="note" style="margin:6px 0 0">★ tiene los PX · ✓ concedido. El jugador sube desde su ficha cuando tú lo concedes.</p></div>`;
}

function sessionBlock(state) {
  const live = liveSession(state);
  if (!live) return `<div class="panel"><h2 class="sec">Sesión</h2>
    <p class="empty" style="margin-bottom:12px">No hay ninguna sesión abierta.</p>
    <div class="row"><button class="btn gold" id="start">Empezar sesión</button><button class="btn" id="starttest">Sesión de pruebas</button></div>
    <p class="note" style="margin:12px 0 0">La sesión de pruebas solo la ven el administrador y los másteres. Úsala para preparar y ensayar sin que el grupo vea nada.</p></div>`;
  if (closing) return `<div class="panel"><h2 class="sec">Cerrar ${esc(sessionName(live))}</h2>
    ${live.test ? `<p class="empty" style="margin-bottom:12px">La sesión de pruebas se descarta al cerrarla.</p>` : `
    <label class="field">Título<input id="ctitle" placeholder="La cripta bajo el campanario" value="${esc(live.title)}"></label>
    <label class="field" style="margin-top:10px">Qué pasó (será el «Anteriormente…» de la próxima)<textarea id="crecap" rows="6">${esc(live.recap || notesOf(state, live.id))}</textarea></label>
    ${notesOf(state, live.id) && !live.recap ? `<p class="note" style="margin:6px 0 0">Lo he rellenado con las notas de la crónica. Retócalo a tu gusto.</p>` : ""}
    ${changesBlock(state)}
    <h2 class="sec" style="margin-top:14px">Experiencia</h2>
    <div class="xpgrid xpall"><input type="number" id="xpall" min="0" placeholder="PX" aria-label="PX para todos"><input id="xpwhy" placeholder="Motivo (p. ej. derrotar a los esqueletos)" aria-label="Motivo"><button class="btn small" id="xpfill">A todos</button></div>
    <div class="xplist">${state.characters.map(c => `<div class="xpgrid"><span>${esc(c.name)}</span><input type="number" min="0" data-xpc="${c.id}" placeholder="0" aria-label="PX para ${esc(c.name)}"><input data-xpr="${c.id}" placeholder="Motivo" aria-label="Motivo para ${esc(c.name)}"></div>`).join("")}</div>`}
    <div class="row" style="margin-top:12px"><button class="btn gold" id="doclose">${live.test ? "Terminar la prueba" : "Guardar y cerrar"}</button><button class="btn" id="cancelclose">Seguir jugando</button></div></div>`;
  return `<div class="panel"><h2 class="sec">${esc(sessionName(live))} en curso</h2>
    ${live.test ? `<p class="note" style="margin:0 0 12px">Los jugadores no ven esta sesión ni lo que muestres en ella.</p>` : ""}
    <div class="row"><button class="btn gold" data-askroll title="Pide a todos o a alguien una tirada de habilidad, característica o salvación">🎲 Pedir tirada</button><button class="btn" data-give title="Sellos, regalos, reliquias…">🎁 Dar objeto</button><button class="btn" id="close">Cerrar sesión</button></div></div>`;
}

// Dirección: reloj de campaña y la carpeta de escenas preparadas para esta sesión, a un clic
function directionBlock(state) {
  const live = liveSession(state); if (!live) return "";
  const chaps = loreOf(state).filter(e => e.kind === "chapter" && (e.session === live.id || !e.session)).sort((a, b) => (a.session ? 0 : 1) - (b.session ? 0 : 1) || (a.order || 0) - (b.order || 0));
  return `<div class="panel"><h2 class="sec">Dirección</h2>
    <div class="lclock inline"><span>🕯 ${esc(clockText(clockOf(state)))}</span><div class="row">${[[10, "+10 min"], [60, "+1 h"], [480, "+8 h"]].map(([m, l]) => `<button class="btn small" data-clock="${m}">${l}</button>`).join("")}</div></div>
    ${chaps.length ? `<div class="showplaces"><details data-k="prep" open><summary><span>📂 Escenas preparadas</span><small>${chaps.length}</small></summary><ol class="prepmini">${chaps.map(c => `<li><a href="#lore/${c.id}">${esc(c.name)}</a><span>${related(state, c.id).map(r => { const n = refName(state, r), e = entry(state, r);
        return e && e.kind !== "note" && e.kind !== "chapter" ? `<button class="btn small" data-showlore="${r}" title="Mostrar a todos">${n.icon} ${esc(n.name)}</button>` : n.kind === "scene" ? `<button class="btn small" data-load="${r}" title="Cargar en la mesa">⚔️ ${esc(n.name)}</button>` : `<a class="btn small" href="#lore/${r}">${n.icon} ${esc(n.name)}</a>`; }).join("")}</span></li>`).join("")}</ol></details></div>` : `<p class="empty">Sin escenas preparadas. <a href="#lore/s:chapter">Prepáralas en el Lore</a>.</p>`}
    <div class="row" style="margin-top:8px"><a class="btn small" href="#lore">📖 Abrir el Lore</a>${state.backdrop ? `<button class="btn small" id="nobackdrop">Quitar fondo</button>` : ""}</div></div>`;
}

function tacticalBlock(state) {
  const b = state.board, p = state.presentation || {};
  const groups = [];
  state.world.places.forEach(pl => { const sc = state.scenes.filter(x => x.place === pl.id); if (sc.length) groups.push([pl.id, pl.name, sc]); });
  const lib = state.scenes.filter(x => !x.place || !state.world.places.some(pl => pl.id === x.place));
  if (lib.length) groups.push(["lib", "Biblioteca (para improvisar)", lib]);
  return `<div class="panel"><h2 class="sec">Escena táctica</h2>
    ${b ? `<p style="margin:0 0 8px">En la mesa: <b>${esc(b.name)}</b></p>
      <div class="showlist">
        <button class="btn small" data-show='{"type":"tactical"}' ${p.type === "tactical" ? 'aria-pressed="true"' : ""}>Mostrar la mesa</button>
        <button class="btn small" id="tedit" aria-pressed="${tacEdit}">${tacEdit ? "Terminar de editar" : "Editar la mesa"}</button>
        <button class="btn small gold" id="tmon">👹 Añadir criaturas…</button>
        <button class="btn small" id="tsave">Guardar como escena</button>
        <button class="btn small danger" id="tclear">Retirar la mesa</button>
      </div>
      <h3 class="sub" style="margin:14px 0 6px">Personajes en la mesa</h3>
      <div class="pclist">${state.characters.map(c => { const on = state.tokens.some(t => t.kind === "pc" && t.char === c.id), live = c.owner && presence.online(c.owner);
        return `<label class="pcrow${on ? " on" : ""}"><input type="checkbox" data-pc="${c.id}" ${on ? "checked" : ""}><span class="dot${live ? " live" : ""}" title="${live ? "Conectado" : "Desconectado"}"></span><span>${esc(c.name)}</span><small>${live ? "conectado" : "fuera"}</small><button class="insp ${c.inspiration ? "on" : ""}" data-insp="${c.id}" title="${c.inspiration ? "Tiene inspiración heroica (toca para quitarla)" : "Dar inspiración heroica"}" aria-label="Inspiración heroica de ${esc(c.name)}">✨</button></label>`; }).join("") || `<p class="empty">No hay personajes.</p>`}</div>` : `<p class="empty" style="margin:0 0 8px">No hay ninguna escena en la mesa.</p>`}
    <div class="showplaces" style="margin-top:10px">${groups.map(([k, n, sc]) => `<details data-k="${k}"><summary><span>${esc(n)}</span><small>${sc.length}</small></summary>
      <div class="scenelist">${sc.map(x => `<div class="scenerow"><span>${esc(x.name)}</span><small>${x.tokens.length} fichas</small><button class="btn small gold" data-load="${x.id}">Cargar</button></div>`).join("")}</div></details>`).join("")}</div>
    <div class="row" style="margin-top:10px"><button class="btn small" id="tblank">Mesa vacía</button><a class="btn small" href="#escenas">Preparar escenas</a></div>
    <p class="note" style="margin:10px 0 0">Al cargar una escena solo aparecen los personajes de quien está conectado. Marca o desmarca arriba para meter o sacar a alguien.</p></div>`;
}

function showBlock(state) {
  const p = state.presentation || {};
  const on = (t, extra = {}) => p.type === t && Object.entries(extra).every(([k, v]) => p[k] === v) ? ' aria-pressed="true"' : "";
  const places = state.world.places;
  return `<div class="panel"><h2 class="sec">Mostrar al grupo</h2>
    <div class="showlist">
      <button class="btn" data-show='{"type":"recap"}'${on("recap")} ${lastClosed(state) ? "" : "disabled"}>Anteriormente…</button>
      <button class="btn" data-show='{"type":"world"}'${on("world")}>Mapa del mundo</button>
      ${timeline(state, true).length ? `<button class="btn" data-tlstart${on("timeline")}>⏳ Cronología</button>` : ""}
    </div>
    ${(state.world.regions || []).length ? `<h2 class="sec" style="margin-top:16px">Regiones</h2><div class="showlist">${state.world.regions.map(r => `<button class="btn small" data-showreg="${r.id}"${on("region", { region: r.id })}><i class="regdot" style="background:${esc(r.color)}"></i> ${esc(r.name)}${r.visible ? "" : " · oculta"}</button>`).join("")}</div>` : ""}
    <h2 class="sec" style="margin-top:16px">Lugares</h2>
    <div class="showplaces">${places.map(pl => `<details data-k="pl-${pl.id}"><summary><span>${esc(pl.name)}</span>${pl.visible ? "" : `<small>oculto</small>`}</summary>
        <div class="showlist">
          <button class="btn small" data-show='${JSON.stringify({ type: "place", place: pl.id })}'${on("place", { place: pl.id })}>${pl.map ? "Mapa del lugar" : "El lugar"}</button>
          ${pl.items.map(it => `<button class="btn small" data-show='${esc(JSON.stringify({ type: "item", place: pl.id, item: it.id }))}'${on("item", { item: it.id })}>${it.type === "image" ? "🖼 " : ""}${esc(it.title)}${it.revealed ? "" : " · oculto"}</button>`).join("")}
        </div></details>`).join("") || `<p class="empty">Aún no hay lugares. Créalos en el mapa del mundo.</p>`}</div>
    <p class="note" style="margin:12px 0 0">Mostrar un lugar o un contenido oculto lo revela a los jugadores.</p>
    <div class="row" style="margin-top:12px"><button class="btn small" id="clear" ${state.presentation ? "" : "disabled"}>Quitar de la mesa</button></div></div>`;
}

function bind(state) {
  const on = (id, fn) => { const b = $("#" + id, el); if (b) b.onclick = fn; };
  on("start", () => startSession(false));
  on("starttest", () => startSession(true));
  on("close", () => { closing = true; draw(); });
  on("cancelclose", () => { closing = false; draw(); });
  on("doclose", () => {
    const t = $("#ctitle", el), r = $("#crecap", el);
    if (r && !r.value.trim()) { toast("Escribe un pequeño resumen: será el «Anteriormente…» de la próxima sesión"); r.focus(); return; }
    const xp = $$("[data-xpc]", el).map(i => ({ char: i.dataset.xpc, amount: +i.value || 0, reason: ($(`[data-xpr="${i.dataset.xpc}"]`, el) || {}).value || "" }));
    closing = false; closeSession(t ? t.value.trim() : "", r ? r.value.trim() : "", xp);
    const total = xp.reduce((a, x) => a + x.amount, 0);
    toast(total ? `Sesión cerrada · ${total} PX repartidos` : "Sesión cerrada");
  });
  on("clear", () => show(null));
  on("xpfill", () => { const v = $("#xpall", el).value, why = $("#xpwhy", el).value; $$("[data-xpc]", el).forEach(i => (i.value = v)); $$("[data-xpr]", el).forEach(i => { if (!i.value) i.value = why; }); });
  on("tblank", () => { tacEdit = true; blankBoard(); store.commit("board", st => { if (st.board) st.board.editing = true; }); });
  // Mientras el máster retoca la mesa, los jugadores la siguen viendo (con un aviso discreto)
  const toggleEdit = () => { tacEdit = !tacEdit; store.commit("board", st => { if (st.board) st.board.editing = tacEdit || null; }); draw(); };
  on("tedit", toggleEdit);
  on("qtedit", toggleEdit);
  { const L = $("#qtluz", el); if (L) L.onchange = () => store.commit("board", st => { if (st.board) st.board.ambient = L.value; });
    const S2 = $("#qtsnd", el); if (S2) S2.onchange = () => store.commit("board", st => { if (st.board) st.board.sound = S2.value; }); }
  on("qtfog", () => store.commit("board", st => { if (st.board) st.board.fog = !st.board.fog; }));
  $$("[data-lvlg]", el).forEach(b => b.onclick = () => { const c = store.get().characters.find(x => x.id === b.dataset.lvlg); import("../core/experiencia.js").then(m => m.grantLevel(c.id, !levelGranted(c))); });
  $$("[data-lvlall]", el).forEach(b => b.onclick = () => import("../core/experiencia.js").then(m => store.get().characters.filter(c => canLevelUp(c) && !levelGranted(c)).forEach(c => m.grantLevel(c.id))));
  $$("[data-give]", el).forEach(b => b.onclick = () => import("./tesorosui.js").then(m => m.openGiveDialog()));
  $$("[data-askroll]", el).forEach(b => b.onclick = () => import("./peticiones.js").then(m => m.openAskDialog()));
  on("qtfloor", () => { floorsOpen = !floorsOpen; draw(); });
  { const fbox = $(".dmfloors", el); if (fbox) bindFloors(fbox, tac && tac.selected ? tac.selected() : null, () => { $("#dmtools", el).innerHTML = toolsBlock(store.get()); bind(store.get()); }); }
  on("qtmon", () => import("./reglas.js").then(m => m.openCreaturePicker({ title: "Añadir criaturas a la mesa", onAdd: (x, n) => m.addToBoard(x, n) })));
  $$("[data-clock]", el).forEach(b => b.onclick = () => advanceClock(+b.dataset.clock));
  $$("[data-showlore]", el).forEach(b => b.onclick = () => { touch(b.dataset.showlore); showEntry(b.dataset.showlore); });
  $$("[data-lsearch]", el).forEach(b => b.onclick = openSearch);
  $$("[data-tlstart]", el).forEach(b => b.onclick = () => { const st = store.get(), t = timeline(st, true); if (!(st.presentation && st.presentation.type === "timeline") && t.length) tellTimeline((t.find(e => e.revealed) || t[0]).id); });
  $$("[data-lcard]", el).forEach(b => b.onclick = () => openCard(b.dataset.lcard));
  { const h = $("#herepl", el); if (h) h.onchange = () => setHere(h.value); }
  $$("[data-chg]", el).forEach(b => b.onchange = () => { const [id, f] = b.dataset.chg.split(":"); markChange(id, f, b.value); });
  on("chg2recap", () => { const r = $("#crecap", el); if (!r) return; const t = changesOf(liveSession(store.get())).map(changeText).join("\n"); if (!r.value.includes(t)) r.value = (r.value.trim() + "\n\nCambios en el mundo:\n" + t).trim(); });
  on("nobackdrop", () => setBackdrop(null));
  $$("[data-pc]", el).forEach(b => b.onchange = () => b.checked ? addPC(b.dataset.pc) : removePC(b.dataset.pc));
  $$(".pcrow [data-insp]", el).forEach(b => b.onclick = e => { e.preventDefault(); e.stopPropagation(); const c = store.get().characters.find(x => x.id === b.dataset.insp); if (c) import("../core/inspiracion.js").then(m => m.setInspiration(c.id, !c.inspiration)); });
  on("tmon", () => import("./reglas.js").then(m => m.openCreaturePicker({ title: "Añadir criaturas a la mesa", onAdd: (x, n) => m.addToBoard(x, n) })));
  on("tclear", () => { const b = $("#tclear", el); if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "Pulsa otra vez"; return; } tacEdit = false; clearBoard(); });
  on("tsave", () => {
    const b = $("#tsave", el);
    if (!b.dataset.sure) { b.dataset.sure = 1; b.outerHTML = `<span class="savescene"><input id="tsname" placeholder="Nombre de la escena" value="${esc(state.board.name)}"><button class="btn small gold" id="tsok">Guardar</button></span>`; $("#tsok", el).onclick = () => { saveBoardAsScene($("#tsname", el).value.trim() || state.board.name, null); toast("Guardada en la biblioteca de escenas"); }; }
  });
  $$("[data-load]", el).forEach(b => b.onclick = () => { tacEdit = false; const sc = store.get().scenes.find(x => x.id === b.dataset.load); loadScene(b.dataset.load); if (sc && sc.place && placeOf(store.get(), sc.place)) setHere(sc.place); });
  $$("[data-show]", el).forEach(b => b.onclick = () => { const p = JSON.parse(b.dataset.show); show(p); if (p.place) setHere(p.place); });
  $$("[data-showreg]", el).forEach(b => b.onclick = () => store.commit("present", s => { const r = (s.world.regions || []).find(x => x.id === b.dataset.showreg); if (r) { r.visible = true; s.presentation = { type: "region", region: r.id }; } }));
}

const notesOf = (s, sid) => (s.chronicle || []).filter(e => e.session === sid).map(e => e.text).join("\n");
