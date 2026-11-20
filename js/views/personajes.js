// Personajes: el estado del grupo de un vistazo y la ficha completa de D&D 2024.
// Todos pueden ver todas las fichas; solo el dueño, el administrador y los másteres las editan.
import { store } from "../core/store.js";
import { currentUser, isDM, can } from "../core/session.js";
import { getImage, putImage, readImageFile } from "../core/images.js";
import { ABILITIES, AB_SHORT, SKILLS, CLASSES, classInfo, xpFor, canLevelUp, levelGranted, mod, sign, prof, skillBonus, saveBonus, passive, carried, capacity, levelNotes, newCharacter } from "../data/dnd.js";
import { $, $$, esc, toast, debounce, pickFile } from "../core/ui.js";
import { darkvisionOf } from "../core/vision.js";
import { openCreate } from "./crear.js";
import { publish } from "../core/dados.js";
import { srdNow, findSpell } from "../core/srd.js";
import { spellCard } from "./reglas.js";
import { treasuresHTML, bindTreasures, journalHTML, bindJournal } from "./tesorosui.js";
import { giveTreasure } from "../core/tesoros.js";

let el = null, openId = null, tab = "car", leveling = null;
const TABS = [["car", "Características"], ["com", "Combate"], ["inv", "Inventario"], ["con", "Conjuros"], ["ras", "Rasgos y notas"], ["cua", "📓 Cuaderno"], ["tras", "Trasfondo"]];
const uidl = p => p + "-" + Math.random().toString(36).slice(2, 8);

export function mount(root) {
  el = document.createElement("div");
  el.className = "page";
  root.appendChild(el);
  leveling = null;
  draw();
  return { update: (s, label, remote) => { if (!(label === "field" && !remote)) draw(); }, unmount() { el = null; } };
}

function draw() {
  if (!el) return;
  const state = store.get();
  const ch = state.characters.find(c => c.id === openId);
  if (!ch) { openId = null; return drawGroup(state); }
  drawSheet(state, ch);
}

/* ---------- El grupo ---------- */
function drawGroup(state) {
  const me = currentUser(state), dm = isDM(state);
  const mine = state.characters.filter(c => c.owner === me.id);
  const list = [...mine, ...state.characters.filter(c => c.owner !== me.id)];
  const canCreate = dm || !mine.length;
  el.innerHTML = `<div class="wrap">
    <h1 class="title">El grupo</h1>
    <p class="lead">Todas las fichas están a la vista. Cada jugador edita la suya; el máster puede editarlas todas.</p>
    <div class="party-grid">${list.map(c => card(state, c)).join("") || `<p class="empty">Todavía no hay personajes.</p>`}</div>
    ${canCreate ? `<div class="row" style="margin-top:18px"><button class="btn gold" id="newwizbtn">✨ Crear personaje paso a paso</button><button class="btn" id="newpj">+ Ficha en blanco</button></div>` : ""}
  </div>`;
  $$("[data-open]", el).forEach(b => b.onclick = () => { openId = b.dataset.open; tab = "car"; leveling = null; draw(); window.scrollTo(0, 0); });
  const n = $("#newpj", el);
  const nw = $("#newwizbtn", el);
  if (nw) nw.onclick = () => openCreate({ owner: dm ? null : me.id, color: me.color || "#8a9a4a", done: c => { openId = c.id; tab = "car"; draw(); window.scrollTo(0, 0); } });
  if (n) n.onclick = () => {
    const c = newCharacter({ owner: dm ? null : me.id, name: dm ? "Nuevo personaje" : `Personaje de ${me.name.split(" ")[0]}`, color: me.color || "#8a9a4a" });
    store.commit("char", s => s.characters.push(c));
    openId = c.id; draw();
  };
  portraits();
}

function card(state, c) {
  const owner = state.users.find(u => u.id === c.owner);
  const pct = Math.max(0, Math.min(100, (c.hp.cur / Math.max(1, c.hp.max)) * 100));
  return `<button class="pjcard" data-open="${c.id}">
    <span class="pjimg" data-portrait="${c.portrait || ""}" style="background:radial-gradient(circle at 35% 30%, ${c.color || "#888"}, #2a1f15 130%)">${c.portrait ? "" : esc(c.initials || initials(c.name))}</span>
    <span class="pjbody"><b>${esc(c.name)}</b><span>${esc([c.species, c.cls].filter(Boolean).join(" · "))} ${c.level}</span>
      <span class="hpbar ${pct <= 25 ? "low" : pct <= 50 ? "mid" : ""}"><i style="width:${pct}%"></i><em>${c.hp.cur}/${c.hp.max} PG${c.hp.temp ? ` +${c.hp.temp}` : ""}</em></span>
      <span class="pjmeta">CA ${c.ac} · ${owner ? esc(owner.name) : "sin jugador"}${levelGranted(c) ? ` · <b class="lvlup">⬆ Nivel concedido</b>` : canLevelUp(c) ? ` · <small>PX para subir · lo decide el máster</small>` : ""}</span></span>
  </button>`;
}
const initials = n => (n || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");

async function portraits() {
  for (const box of $$("[data-portrait]", el)) {
    const k = box.dataset.portrait; if (!k) continue;
    const u = await getImage(k);
    if (u && box.isConnected) { box.style.background = `#2a1f15 url('${u}') center/cover`; box.textContent = ""; }
  }
}

/* ---------- La ficha ---------- */
function drawSheet(state, c) {
  const ed = can.editCharacter(state, c), dm = isDM(state);
  const owner = state.users.find(u => u.id === c.owner);
  const nextXP = c.level < 20 ? xpFor(c.level + 1) : null, curXP = xpFor(c.level);
  const xpPct = nextXP ? Math.max(0, Math.min(100, ((c.xp - curXP) / (nextXP - curXP)) * 100)) : 100;
  const pb = prof(c.level);
  el.innerHTML = `<div class="wrap sheet ${ed ? "" : "readonly"}">
    <div class="row" style="margin-bottom:14px"><button class="btn small" id="back">← El grupo</button>${ed ? "" : `<span class="tag">SOLO LECTURA</span>`}<span class="grow"></span>
      ${ed ? `<button class="btn small danger" id="delpj">Eliminar ficha</button>` : ""}</div>
    <header class="sheethead">
      <button class="portrait" id="portrait" data-portrait="${c.portrait || ""}" style="background:radial-gradient(circle at 35% 30%, ${c.color || "#888"}, #2a1f15 130%)" ${ed ? "" : "disabled"} title="${ed ? "Cambiar ilustración" : ""}">${c.portrait ? "" : `<span>${ed ? "Añadir ilustración" : esc(initials(c.name))}</span>`}</button>
      <div class="sheetid">
        <input class="bigname" data-p="name" value="${esc(c.name)}" aria-label="Nombre">
        <div class="idgrid">
          <label class="field">Especie<input data-p="species" value="${esc(c.species)}"></label>
          <label class="field">Clase<input data-p="cls" list="classes" value="${esc(c.cls)}"></label>
          <label class="field">Subclase<input data-p="subclass" value="${esc(c.subclass)}"></label>
          <label class="field">Trasfondo<input data-p="background" value="${esc(c.background)}"></label>
          <label class="field">Miniatura 3D<select data-mini>${[["", "Peana de cartón"], ["Knight", "Figura: caballero"], ["Barbarian", "Figura: bárbaro"], ["Mage", "Figura: mago"], ["Rogue", "Figura: pícaro"], ["Rogue_Hooded", "Figura: encapuchado"]].map(([k, n]) => `<option value="${k}" ${(c.mini || "") === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        </div>
        <datalist id="classes">${Object.keys(CLASSES).map(k => `<option value="${k}">`).join("")}</datalist>
        <div class="xprow">
          <span class="lvl">Nivel <b>${c.level}</b></span>
          ${dm ? `<button class="inspchip ${c.inspiration ? "on" : ""}" id="insptog" title="Inspiración heroica: gástala para volver a tirar un dado justo después de lanzarlo (el máster la concede; los humanos la obtienen con cada descanso largo)">✨ Inspiración${c.inspiration ? "" : ": no"}</button>`
            : `<span class="inspchip ${c.inspiration ? "on" : ""}" title="Inspiración heroica: gástala desde el registro de tiradas con «✨ Repetir» justo después de tirar">✨ Inspiración${c.inspiration ? "" : ": no"}</span>`}
          <div class="xpbar" title="${c.xp} PX"><i style="width:${xpPct}%"></i></div>
          <span class="xptext">${c.xp} ${nextXP ? `/ ${nextXP} PX` : "PX"}</span>
          ${dm ? `<span class="addxp"><input type="number" id="xpadd" placeholder="PX" aria-label="Experiencia a sumar"><button class="btn small" id="xpgo">Sumar</button></span>` : ""}
          ${ed && (levelGranted(c) || (dm && c.level < 20)) ? `<button class="btn ${levelGranted(c) ? "gold" : ""} small" id="lvlup" title="${levelGranted(c) ? "El máster te ha concedido el nivel" : "Como máster puedes subirlo directamente"}">⬆ Subir a nivel ${c.level + 1}</button>` : canLevelUp(c) ? `<span class="note" style="margin:0;border:0;padding:0">Tiene los PX para nivel ${c.level + 1}: el máster decidirá cuándo subir (al acabar la escena o la sesión).</span>` : ""}
        </div>
        <div class="pjmeta">${owner ? `Jugador: ${esc(owner.name)}` : "Sin jugador asignado"}</div>
      </div>
    </header>
    ${leveling ? levelPanel(c) : ""}
    <div class="hzhost" data-hz="${c.id}"></div>
    <section class="combat">
      ${stat("CA", `<input type="number" data-n="ac" value="${c.ac}">`)}
      <div class="stat hpbox"><small>Puntos de golpe</small>
        <div class="hpline"><input type="number" data-n="hp.cur" value="${c.hp.cur}" aria-label="PG actuales"><span>/</span><input type="number" data-n="hp.max" value="${c.hp.max}" aria-label="PG máximos"><span class="tmp">temp</span><input type="number" data-n="hp.temp" value="${c.hp.temp}" aria-label="PG temporales"></div>
        ${ed ? `<div class="hpquick"><input type="number" id="hpd" min="0" placeholder="0" aria-label="Cantidad"><button class="btn small danger" id="dmg">Daño</button><button class="btn small" id="heal">Curar</button></div>` : ""}</div>
      ${stat("Velocidad", `<input type="number" step="1.5" data-n="speed" value="${c.speed}"><em>m</em>`)}
      ${stat("Visión oscuridad", `<input type="number" step="9" data-n="darkvision" value="${darkvisionOf(c)}"><em>m</em>`)}
      ${stat("Iniciativa", `<b>${sign(mod(c.abilities.des) + (+c.initBonus || 0))}</b>${c.initBonus ? `<em title="Alerta">+comp.</em>` : ""}`)}
      ${stat("Competencia", `<b>${sign(pb)}</b>`)}
      ${stat("Percepción pasiva", `<b>${passive(c, "percepcion", "sab")}</b>`)}
      ${stat("Dados de golpe", `<b>${c.level - (c.hdUsed || 0)}</b><em>/ ${c.level}d${classInfo(c.cls).hd}</em>`)}
    </section>
    <nav class="tabs" role="tablist">${TABS.map(([k, t]) => `<button role="tab" class="tab" data-tab="${k}" aria-selected="${tab === k}">${t}</button>`).join("")}</nav>
    <section class="tabbody">${({ car: tabCar, com: tabCom, inv: c2 => tabInv(c2, ed, dm), con: tabCon, ras: tabRas, cua: c2 => `<h2 class="sec">📓 Cuaderno</h2><p class="note" style="margin:0 0 8px">Tus notas de la partida: nombres, pistas, promesas. Marca con ⭐ los descubrimientos y comparte con 📣 lo que quieras que quede en la crónica.</p>${journalHTML(c2, { edit: ed })}`, tras: tabTras })[tab](c)}</section>
  </div>`;
  bind(state, c, ed);
  { const it = $("#insptog", el); if (it) it.onclick = () => import("../core/inspiracion.js").then(m => m.setInspiration(c.id, !c.inspiration)); }
  { const hz = $(".hzhost", el); if (hz) import("./subirnivel.js").then(m => { if (hz.isConnected) hz.innerHTML = m.horizonHTML(c, 3); }); }
  { const tb = $(".tabbody", el); if (tb) { bindTreasures(tb, c, draw); bindJournal(tb, c, draw); } const ta = $("#tesadd", el); if (ta) ta.onclick = () => giveTreasure([c.id], { kind: "recuerdo", name: "Objeto especial" }); }
  portraits();
}
const stat = (label, inner) => `<div class="stat"><small>${label}</small><div class="statv">${inner}</div></div>`;

function levelPanel(c) {
  const hd = classInfo(c.cls).hd, con = mod(c.abilities.con), avg = Math.floor(hd / 2) + 1;
  const gain = Math.max(1, (leveling.roll || avg) + con);
  return `<section class="panel levelup"><h2 class="sec">Subir a nivel ${c.level + 1}</h2>
    <p style="margin:0 0 10px">Puntos de golpe: d${hd} ${sign(con)} (Constitución). Elige la media o tira el dado.</p>
    <div class="row"><button class="btn small" id="lvavg" aria-pressed="${!leveling.roll}">Media: ${avg}</button><button class="btn small" id="lvroll" aria-pressed="${!!leveling.roll}">${leveling.roll ? `Tirada: ${leveling.roll}` : `Tirar d${hd}`}</button>
      <span>Ganas <b>${gain} PG</b> (máximo ${c.hp.max} → ${c.hp.max + gain})</span></div>
    <ul>${levelNotes(c.cls, c.level + 1).map(n => `<li>${esc(n)}</li>`).join("")}</ul>
    <div class="row"><button class="btn gold" id="lvok">Confirmar nivel ${c.level + 1}</button><button class="btn" id="lvno">Cancelar</button></div></section>`;
}

function tabCar(c) {
  return `<div class="abilities">${ABILITIES.map(([k, n]) => `<div class="ab"><small>${n}</small><b class="rollable" data-roll="check|${n}|${mod(c.abilities[k])}" title="Tirar prueba de ${n}">${sign(mod(c.abilities[k]))}</b><input type="number" data-n="abilities.${k}" value="${c.abilities[k]}" aria-label="${n}"></div>`).join("")}</div>
    <div class="cols2">
      <div><h2 class="sec">Tiradas de salvación</h2><div class="checks">${ABILITIES.map(([k, n]) => `<label class="chk"><input type="checkbox" data-save="${k}" ${(c.saves || []).includes(k) ? "checked" : ""}><span>${n}</span><b class="rollable" data-roll="save|Salvación de ${n}|${saveBonus(c, k)}" title="Tirar salvación">${sign(saveBonus(c, k))}</b></label>`).join("")}</div></div>
      <div><h2 class="sec">Habilidades</h2><div class="checks">${SKILLS.map(([k, n, ab]) => { const v = (c.skills || {})[k] || 0; return `<label class="chk"><select data-skill="${k}" aria-label="Competencia en ${n}"><option value="0">·</option><option value="1" ${v === 1 ? "selected" : ""}>●</option><option value="2" ${v === 2 ? "selected" : ""}>★</option></select><span>${n} <small>${AB_SHORT[ab]}</small></span><b class="rollable" data-roll="check|${n}|${skillBonus(c, k, ab)}" title="Tirar ${n}">${sign(skillBonus(c, k, ab))}</b></label>`; }).join("")}</div>
        <p class="note" style="margin:8px 0 0">● competente · ★ pericia</p></div>
    </div>`;
}

const rows = (list, key, cols, addLabel) => `<div class="rows">${(list || []).map((x, i) => `<div class="rowi">${cols.map(([f, ph, type, w]) => type === "check"
    ? `<label class="mini" title="${ph}"><input type="checkbox" data-l="${key}.${i}.${f}" ${x[f] ? "checked" : ""}> ${ph}</label>`
    : `<input ${type === "num" ? 'type="number"' : ""} data-l="${key}.${i}.${f}" value="${esc(x[f] ?? "")}" placeholder="${ph}" style="flex:${w || 1}" aria-label="${ph}">`).join("")}
    <button class="btn small danger edonly" data-del="${key}.${i}" aria-label="Quitar">✕</button></div>`).join("") || `<p class="empty">Nada todavía.</p>`}</div>
  <div class="row edonly" style="margin-top:8px"><button class="btn small" data-add="${key}">${addLabel}</button></div>`;

function tabCom(c) {
  return `<h2 class="sec">Armas y ataques</h2>
    ${rows(c.weapons, "weapons", [["name", "Arma", "", 3], ["atk", "Ataque", "", 1], ["dmg", "Daño", "", 2], ["notes", "Propiedades", "", 3]], "+ Arma o ataque")}`;
}

function tabInv(c, ed, dm) {
  const w = carried(c), cap = capacity(c);
  return `<h2 class="sec">✨ Objetos especiales <small>${(c.treasures || []).length}</small></h2>
    <p class="note" style="margin:0 0 8px">Sellos, ofrendas, cartas, reliquias, regalos… Lo que cuenta una historia, no el equipo.</p>
    ${treasuresHTML(c, { dm, edit: ed })}
    ${ed ? `<div class="row" style="margin:8px 0 16px"><button class="btn small" id="tesadd">+ Objeto especial</button></div>` : ""}
    <h2 class="sec">Monedas</h2>
    <div class="coins">${[["po", "Oro"], ["pp", "Plata"], ["pe", "Electro"], ["pc", "Cobre"]].map(([k, n]) => `<label class="field">${n}<input type="number" data-n="coins.${k}" value="${c.coins[k] || 0}"></label>`).join("")}</div>
    <h2 class="sec" style="margin-top:16px">Equipo <small class="weight ${w > cap ? "over" : ""}">${Math.round(w * 10) / 10} / ${cap} kg</small></h2>
    ${rows(c.inventory, "inventory", [["equipped", "Equipado", "check"], ["name", "Objeto", "", 3], ["qty", "Cant.", "num", .7], ["weight", "Peso (kg)", "num", .9], ["notes", "Notas", "", 3]], "+ Objeto")}`;
}

function tabCon(c) {
  const ab = classInfo(c.cls).cast;
  const sp = c.spells || { slots: {}, list: [] };
  const byLvl = {}; (sp.list || []).forEach((s, i) => (byLvl[s.level || 0] = byLvl[s.level || 0] || []).push([s, i]));
  const head = ab ? `<div class="spellstats"><span>Característica <b>${AB_SHORT[ab]}</b></span><span>CD de salvación <b>${8 + prof(c.level) + mod(c.abilities[ab])}</b></span><span>Ataque de conjuro <b>${sign(prof(c.level) + mod(c.abilities[ab]))}</b></span></div>`
    : `<p class="note" style="margin:0 0 12px">${esc(c.cls || "Esta clase")} no lanza conjuros de serie, pero puedes anotar aquí los que obtengas por especie, dotes u objetos.</p>`;
  return `${head}
    <h2 class="sec">Espacios de conjuro</h2>
    <div class="slots">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(l => { const s = (sp.slots || {})[l] || { max: 0, used: 0 }; return `<div class="slot"><small>Nv ${l}</small>
      <div class="pips">${Array.from({ length: s.max }, (_, i) => `<button class="pip ${i < s.used ? "used" : ""}" data-pip="${l}.${i}" aria-label="Espacio ${i + 1} de nivel ${l}"></button>`).join("")}</div>
      <input type="number" min="0" max="9" data-n="spells.slots.${l}.max" value="${s.max}" aria-label="Espacios de nivel ${l}" class="edonly"></div>`; }).join("")}</div>
    <div class="row edonly" style="margin:8px 0 16px"><button class="btn small" id="rest">Descanso largo (recuperar espacios y PG)</button></div>
    <h2 class="sec">Conjuros</h2>
    ${Object.keys(byLvl).sort((a, b) => a - b).map(l => `<h3 class="lvlh">${+l === 0 ? "Trucos" : `Nivel ${l}`}</h3>
      <div class="rows">${byLvl[l].map(([s, i]) => `<div class="rowi"><label class="mini" title="Preparado"><input type="checkbox" data-l="spells.list.${i}.prepared" ${s.prepared ? "checked" : ""}> Prep.</label>
        <input data-l="spells.list.${i}.name" value="${esc(s.name)}" placeholder="Conjuro" style="flex:3" aria-label="Conjuro" list="spelllist">${findSpell(s.name) ? `<button class="btn small" data-spinfo="${esc(s.name)}" title="Ver el conjuro">📖</button>` : ""}
        <input type="number" min="0" max="9" data-l="spells.list.${i}.level" value="${s.level || 0}" style="flex:.6" aria-label="Nivel">
        <input data-l="spells.list.${i}.notes" value="${esc(s.notes || "")}" placeholder="Notas (alcance, componentes…)" style="flex:3" aria-label="Notas">
        <button class="btn small danger edonly" data-del="spells.list.${i}" aria-label="Quitar">✕</button></div>`).join("")}</div>`).join("") || `<p class="empty">Sin conjuros.</p>`}
    <div class="row edonly" style="margin-top:8px"><button class="btn small" data-add="spells.list">+ Conjuro</button></div>
    <datalist id="spelllist">${(srdNow.conjuros || []).map(x => `<option value="${esc(x.n)}">${x.lvl ? "Nv " + x.lvl : "Truco"}</option>`).join("")}</datalist>
    <div id="spinfo"></div>`;
}

/** Trasfondo: la historia del personaje y hasta 5 recuerdos (foto con su texto). */
function tabTras(c) {
  const g = c.gallery || [];
  return `<h2 class="sec">Tu historia</h2>
    <textarea data-p="story" rows="9" class="storybox" placeholder="De dónde vienes, qué perdiste, a quién buscas, qué te mueve…">${esc(c.story || "")}</textarea>
    <h2 class="sec" style="margin-top:18px">Recuerdos <small class="note">${g.length} de 5</small></h2>
    <div class="memgrid">${g.map((m, i) => `<figure class="mem"><div class="memimg" data-portrait="${esc(m.img || "")}">${m.img ? "" : "Sin foto"}</div>
        <figcaption><textarea data-l="gallery.${i}.text" rows="3" placeholder="Qué muestra este recuerdo">${esc(m.text || "")}</textarea></figcaption>
        <div class="row edonly"><button class="btn small" data-memimg="${i}">${m.img ? "Cambiar foto" : "+ Foto"}</button><button class="btn small danger" data-memdel="${i}">Quitar</button></div></figure>`).join("")}
      ${g.length < 5 ? `<button class="mem add edonly" id="memadd">+ Añadir recuerdo</button>` : ""}</div>`;
}
function tabRas(c) {
  return `<h2 class="sec">Rasgos y dotes</h2>
    <div class="rows">${(c.features || []).map((f, i) => `<div class="feat"><div class="rowi"><input data-l="features.${i}.name" value="${esc(f.name)}" placeholder="Rasgo" style="flex:1;font-weight:700" aria-label="Rasgo"><button class="btn small danger edonly" data-del="features.${i}" aria-label="Quitar">✕</button></div>
      <textarea data-l="features.${i}.text" rows="2" placeholder="Qué hace" aria-label="Descripción">${esc(f.text || "")}</textarea></div>`).join("") || `<p class="empty">Nada todavía.</p>`}</div>
    <div class="row edonly" style="margin-top:8px"><button class="btn small" data-add="features">+ Rasgo o dote</button></div>
    <div class="cols2" style="margin-top:16px">
      <label class="field">Idiomas<textarea data-p="languages" rows="2">${esc(c.languages || "")}</textarea></label>
      <label class="field">Otras competencias (armaduras, armas, herramientas)<textarea data-p="proficiencies" rows="2">${esc(c.proficiencies || "")}</textarea></label>
    </div>
    <label class="field" style="margin-top:12px">Historia y notas<textarea data-p="notes" rows="6">${esc(c.notes || "")}</textarea></label>`;
}

/* ---------- Edición ---------- */
const getP = (o, path) => path.split(".").reduce((x, k) => x == null ? x : x[k], o);
function setP(o, path, v) {
  const ks = path.split("."); let x = o;
  ks.slice(0, -1).forEach((k, i) => { if (x[k] == null) x[k] = /^\d+$/.test(ks[i + 1]) && Array.isArray(x) ? [] : {}; x = x[k]; });
  x[ks[ks.length - 1]] = v;
}

function bind(state, c, ed) {
  const id = c.id;
  const C = s => s.characters.find(x => x.id === id);
  const on = (sel, fn) => { const b = $(sel, el); if (b) b.onclick = fn; };
  on("#back", () => { openId = null; leveling = null; draw(); });
  $$("[data-tab]", el).forEach(b => b.onclick = () => { tab = b.dataset.tab; draw(); });
  on("#memadd", () => store.commit("char", s => { const x = C(s); x.gallery = x.gallery || []; if (x.gallery.length < 5) x.gallery.push({ img: null, text: "" }); }));
  $$("[data-memdel]", el).forEach(b => b.onclick = () => store.commit("char", s => { const x = C(s); x.gallery.splice(+b.dataset.memdel, 1); }));
  $$("[data-memimg]", el).forEach(b => b.onclick = async () => {
    const f = await pickFile(); if (!f) return;
    try { const r = await readImageFile(f, 1400), key = uidl("recuerdo"); await putImage(key, r.dataURL); store.commit("char", s => { C(s).gallery[+b.dataset.memimg].img = key; }); }
    catch (e) { toast("No se pudo cargar la imagen. Prueba con un JPG o PNG."); }
  });
  $$("[data-roll]", el).forEach(b => b.onclick = e => {
    e.preventDefault(); const [kind, label, m] = b.dataset.roll.split("|");
    const tok = (state.tokens || []).find(t => t.char === c.id);
    const r = publish({ kind, expr: `1d20${+m >= 0 ? "+" : ""}${m}`, label: `${c.name} · ${label}`, by: tok ? tok.id : null });
    toast(`🎲 ${label}: ${r.dice.filter(d => !d.drop).map(d => d.v).join("+")} ${+m >= 0 ? "+" : "−"} ${Math.abs(+m)} = ${r.total}`);
  });
  if (!ed) {
    $$("input,select,textarea", $(".sheet", el)).forEach(i => (i.disabled = true));
    return;
  }
  const saveText = debounce((path, v) => store.commit("field", s => setP(C(s), path, v)), 350);
  $$("[data-p]", el).forEach(i => i.addEventListener("input", () => saveText(i.dataset.p, i.value)));
  $$("[data-n]", el).forEach(i => i.addEventListener("change", () => store.commit("char", s => setP(C(s), i.dataset.n, i.value === "" ? 0 : +i.value))));
  $$("[data-l]", el).forEach(i => {
    if (i.type === "checkbox") i.onchange = () => store.commit("char", s => setP(C(s), i.dataset.l, i.checked));
    else if (i.type === "number") i.addEventListener("change", () => store.commit("char", s => setP(C(s), i.dataset.l, +i.value || 0)));
    else i.addEventListener("input", () => saveText(i.dataset.l, i.value));
    if (/^spells\.list\.\d+\.name$/.test(i.dataset.l)) i.addEventListener("change", () => { const sp = findSpell(i.value); if (sp) store.commit("char", s => { setP(C(s), i.dataset.l.replace(/name$/, "level"), sp.lvl); }); });
  });
  $$("[data-spinfo]", el).forEach(b => b.onclick = () => { const box = $("#spinfo", el), sp = findSpell(b.dataset.spinfo); box.innerHTML = box.dataset.cur === sp.n ? "" : spellCard(sp); box.dataset.cur = box.innerHTML ? sp.n : ""; });
  $$("[data-mini]", el).forEach(i => i.onchange = () => store.commit("char", s => { C(s).mini = i.value || null; }));
  $$("[data-save]", el).forEach(i => i.onchange = () => store.commit("char", s => { const x = C(s); x.saves = (x.saves || []).filter(k => k !== i.dataset.save); if (i.checked) x.saves.push(i.dataset.save); }));
  $$("[data-skill]", el).forEach(i => i.onchange = () => store.commit("char", s => { const x = C(s); x.skills = x.skills || {}; x.skills[i.dataset.skill] = +i.value; }));
  const blank = { weapons: () => ({ id: uidl("w"), name: "", atk: "", dmg: "", notes: "" }), inventory: () => ({ id: uidl("i"), name: "", qty: 1, weight: 0, notes: "" }),
    "spells.list": () => ({ id: uidl("s"), name: "", level: 0, prepared: true, notes: "" }), features: () => ({ id: uidl("f"), name: "", text: "" }) };
  $$("[data-add]", el).forEach(b => b.onclick = () => store.commit("char", s => { const x = C(s), k = b.dataset.add; if (!getP(x, k)) setP(x, k, []); getP(x, k).push(blank[k]()); }));
  $$("[data-del]", el).forEach(b => b.onclick = () => store.commit("char", s => { const p = b.dataset.del.split("."), i = +p.pop(); getP(C(s), p.join(".")).splice(i, 1); }));
  $$("[data-pip]", el).forEach(b => b.onclick = () => store.commit("char", s => {
    const [l, i] = b.dataset.pip.split(".").map(Number), sl = C(s).spells.slots[l];
    sl.used = i < sl.used ? i : i + 1;
  }));
  on("#rest", () => store.commit("char", s => { const x = C(s); Object.values(x.spells.slots || {}).forEach(v => (v.used = 0)); x.hp.cur = x.hp.max; x.hp.temp = 0; x.hdUsed = Math.max(0, (x.hdUsed || 0) - Math.max(1, Math.floor(x.level / 2))); toast("Descanso largo: espacios y PG recuperados"); }));
  const delta = () => Math.max(0, +($("#hpd", el) || {}).value || 0);
  on("#dmg", () => { const d = delta(); if (!d) return; store.commit("char", s => { const h = C(s).hp, t = Math.min(h.temp || 0, d); h.temp = (h.temp || 0) - t; h.cur = Math.max(0, h.cur - (d - t)); }); });
  on("#heal", () => { const d = delta(); if (!d) return; store.commit("char", s => { const h = C(s).hp; h.cur = Math.min(h.max, h.cur + d); }); });
  on("#xpgo", () => { const v = +$("#xpadd", el).value || 0; if (!v) return; store.commit("char", s => { C(s).xp = Math.max(0, (C(s).xp || 0) + v); }); toast(`${v > 0 ? "+" : ""}${v} PX para ${c.name}`); });
  on("#lvlup", () => import("./subirnivel.js").then(m => m.openLevelUp(c.id)));
  on("#lvavg", () => { leveling.roll = 0; draw(); });
  on("#lvroll", () => { leveling.roll = 1 + Math.floor(Math.random() * classInfo(c.cls).hd); draw(); });
  on("#lvno", () => { leveling = null; draw(); });
  on("#lvok", () => {
    const hd = classInfo(c.cls).hd, gain = Math.max(1, (leveling.roll || Math.floor(hd / 2) + 1) + mod(c.abilities.con));
    const msg = `${c.name} sube a nivel ${c.level + 1}`;
    leveling = null;
    store.commit("char", s => { const x = C(s); x.level += 1; x.hp.max += gain; x.hp.cur += gain; if ((+x.lvlGrant || 0) <= x.level) delete x.lvlGrant; });
    toast(msg);
  });
  on("#portrait", async () => {
    const f = await pickFile(); if (!f) return;
    try {
      toast("Cargando la ilustración…");
      const r = await readImageFile(f, 1400);
      const key = uidl("retrato"); await putImage(key, r.dataURL);
      store.commit("char", s => { C(s).portrait = key; });
    } catch (e) { toast("No se pudo cargar la imagen. Prueba con un JPG o PNG."); }
  });
  const del = $("#delpj", el);
  if (del) del.onclick = () => {
    if (!del.dataset.sure) { del.dataset.sure = "1"; del.textContent = "Pulsa otra vez para eliminarla"; return; }
    openId = null; store.commit("char", s => { s.characters = s.characters.filter(x => x.id !== id); });
  };
}
