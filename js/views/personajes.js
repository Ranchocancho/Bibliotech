// Personajes: el estado del grupo de un vistazo y la ficha completa de D&D 2024.
// Todos pueden ver todas las fichas. Solo el máster las edita; el jugador sube de nivel (con el nivel concedido)
// y propone cambios que el máster aprueba (core/propuestas.js). Aquí no se tira ningún dado: eso es de la Partida.
import { store } from "../core/store.js";
import { currentUser, isDM, can } from "../core/session.js";
import { getImage, putImage, readImageFile } from "../core/images.js";
import { ABILITIES, AB_SHORT, SKILLS, CLASSES, classInfo, xpFor, canLevelUp, levelGranted, mod, sign, prof, skillBonus, saveBonus, passive, carried, capacity, levelNotes, newCharacter } from "../data/dnd.js";
import { $, $$, esc, toast, debounce, pickFile } from "../core/ui.js";
import { darkvisionOf } from "../core/vision.js";
import { openCreate } from "./crear.js";
import { srdNow, findSpell } from "../core/srd.js";
import { spellCard } from "./reglas.js";
import { treasuresHTML, bindTreasures, journalHTML, bindJournal } from "./tesorosui.js";
import { spellMech } from "../core/hechizos.js";
import { openShop, openGive, lootHTML, bindLoot } from "./tienda.js";
import { whispersHTML, bindSheetFree } from "./tiempolibre.js";
import { whispersFor } from "../core/tiempolibre.js";
import { diffChar, describe, propose, approve, reject, withdraw, stale, logTo, lootGone } from "../core/propuestas.js";
import { giveTreasure } from "../core/tesoros.js";

let spOpen = null;
let el = null, openId = null, tab = null, mode = "read", draft = null, snap = null, showLog = false;
// «atr» solo se ve en el móvil (en el ordenador es la columna de la izquierda)
const TABS = [["atr", "Atributos"], ["acc", "Acciones"], ["con", "Conjuros"], ["inv", "Inventario"], ["ras", "Rasgos"], ["his", "Historia"], ["cua", "📓 Cuaderno"], ["lqv", "⬆ Lo que viene"]];
const lastTab = () => { try { return localStorage.getItem("lamesa:pjtab") || "acc"; } catch (e) { return "acc"; } };
const setTab = t => { tab = t; try { localStorage.setItem("lamesa:pjtab", t); } catch (e) {} };
const uidl = p => p + "-" + Math.random().toString(36).slice(2, 8);

export function mount(root) {
  el = document.createElement("div");
  el.className = "page";
  root.appendChild(el);
  mode = "read"; draft = snap = null;
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
    <p class="lead">Todas las fichas están a la vista. El máster las edita; cada jugador sube de nivel la suya y propone los demás cambios, que el máster aprueba.</p>
    <div class="party-grid">${list.map(c => card(state, c)).join("") || `<p class="empty">Todavía no hay personajes.</p>`}</div>
    ${lootHTML(state)}
    ${canCreate ? `<div class="row" style="margin-top:18px"><button class="btn gold" id="newwizbtn">✨ Crear personaje paso a paso</button><button class="btn" id="newpj">+ Ficha en blanco</button></div>` : ""}
  </div>`;
  $$("[data-open]", el).forEach(b => b.onclick = () => { openId = b.dataset.open; tab = null; mode = "read"; draft = snap = null; draw(); window.scrollTo(0, 0); });
  bindLoot(el);
  const n = $("#newpj", el);
  const nw = $("#newwizbtn", el);
  if (nw) nw.onclick = () => openCreate({ owner: dm ? null : me.id, color: me.color || "#8a9a4a", done: c => { openId = c.id; tab = null; mode = "read"; draw(); window.scrollTo(0, 0); } });
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
      <span class="pjmeta">CA ${c.ac} · ${owner ? esc(owner.name) : "sin jugador"}${levelGranted(c) ? ` · <b class="lvlup">⬆ Nivel concedido</b>` : canLevelUp(c) ? ` · <small>PX para subir · lo decide el máster</small>` : ""}${(c.proposals || []).length ? ` · <b class="lvlup">📝 ${(c.proposals || []).length} por revisar</b>` : ""}</span></span>
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

/* ---------- La ficha ----------
   Arriba, una franja con lo de cada turno; a la izquierda, características, salvaciones, habilidades y sentidos;
   a la derecha, las pestañas. Tres modos: lectura (todos), «dm» (el máster edita en vivo, y al terminar queda en
   el registro) y «prop» (el jugador cambia una copia y la envía al máster). */
const isMob = () => matchMedia("(max-width: 760px)").matches;
function drawSheet(state, c0) {
  const dm = isDM(state), me = currentUser(state), mine = !!me && c0.owner === me.id;
  if (mode === "dm" && !dm) mode = "read";
  if (mode === "prop" && !draft) mode = "read";
  const c = mode === "prop" ? draft : c0, ed = mode !== "read";
  if (!tab || (tab === "atr" && !isMob())) tab = lastTab() === "atr" && !isMob() ? "acc" : lastTab();
  const owner = state.users.find(u => u.id === c0.owner);
  const pb = prof(c.level), pct = Math.max(0, Math.min(100, (c.hp.cur / Math.max(1, c.hp.max)) * 100));
  const props = c0.proposals || [], canLv = (mine || dm) && (levelGranted(c0) || (dm && c0.level < 20));
  const num = (path, v, o = {}) => ed ? `<input type="number" ${o.step ? `step="${o.step}"` : ""} data-n="${path}" value="${v ?? 0}" aria-label="${o.label || path}">` : `<b>${o.show ?? v}</b>`;
  el.innerHTML = `<div class="wrap sheet sheet2 m-${mode}">
    <div class="shbar"><button class="btn small" id="back">← El grupo</button>
      ${mode === "prop" ? `<span class="tag prop">✎ Proponiendo cambios: el máster los revisará</span>` : mode === "dm" ? `<span class="tag dmed">✎ Editando como máster</span>` : ""}
      <span class="grow"></span>
      ${(c0.log || []).length ? `<button class="btn small" id="logbtn" aria-pressed="${showLog}">📜 Registro <small>${c0.log.length}</small></button>` : ""}
      ${mode === "read" && dm ? `<button class="btn small gold" id="edit">✎ Editar</button>` : ""}
      ${mode === "read" && !dm && mine ? `<button class="btn small" id="propose">✎ Proponer un cambio</button>` : ""}
      ${mode === "dm" ? `<button class="btn small gold" id="done">✓ Hecho</button>` : ""}
      ${mode === "prop" ? `<input id="pnote" placeholder="Motivo (p. ej. «compro una lanza en el mercado»)" maxlength="300"><button class="btn small gold" id="psend">Enviar al máster</button><button class="btn small" id="pcancel">Cancelar</button>` : ""}
    </div>
    ${showLog ? logHTML(c0) : ""}
    ${props.length && mode !== "prop" ? propsHTML(c0, dm, mine) : ""}
    <header class="strip">
      <button class="sportrait" id="portrait" data-portrait="${c.portrait || ""}" style="background:radial-gradient(circle at 35% 30%, ${c.color || "#888"}, #2a1f15 130%)" ${ed ? "" : "disabled"} title="${ed ? "Cambiar ilustración" : esc(c.name)}">${c.portrait ? "" : esc(initials(c.name))}</button>
      <div class="sid">
        ${ed ? `<input class="bigname" data-p="name" value="${esc(c.name)}" aria-label="Nombre">` : `<h1>${esc(c.name)}</h1>`}
        <p>${esc([c.cls && `${c.cls} ${c.level}`, c.species, c.subclass, c.background].filter(Boolean).join(" · "))}${owner ? ` <small>· ${esc(owner.name)}</small>` : ""}</p>
        <div class="schips">${c.inspiration ? `<span class="inspchip on" title="Inspiración heroica: se gasta en la Partida">✨ Inspiración</span>` : ""}
          ${levelGranted(c0) ? `<button class="chipb gold" data-gotab="lqv">⬆ Nivel ${c0.level + 1} concedido</button>` : canLevelUp(c0) ? `<button class="chipb" data-gotab="lqv">PX para nivel ${c0.level + 1}</button>` : ""}
          ${c0.lvlDraft ? `<button class="chipb gold" data-gotab="lqv">⬆ Subida a medias</button>` : ""}</div>
      </div>
      <div class="snums">
        <div class="sn hp"><small>PG</small><div>${ed ? `<input type="number" data-n="hp.cur" value="${c.hp.cur}" aria-label="PG actuales"><span>/</span><input type="number" data-n="hp.max" value="${c.hp.max}" aria-label="PG máximos"><span class="tmp">+</span><input type="number" data-n="hp.temp" value="${c.hp.temp || 0}" aria-label="PG temporales">` : `<b>${c.hp.cur}</b><em>/${c.hp.max}${c.hp.temp ? ` +${c.hp.temp}` : ""}</em>`}</div>${ed ? "" : `<i class="hpbar ${pct <= 25 ? "low" : pct <= 50 ? "mid" : ""}"><i style="width:${pct}%"></i></i>`}</div>
        <div class="sn"><small>CA</small>${num("ac", c.ac, { label: "Clase de armadura" })}</div>
        <div class="sn"><small><span class="lgonly">Iniciativa</span><span class="smonly">Inic.</span></small><b>${sign(mod(c.abilities.des) + (+c.initBonus || 0))}</b></div>
        <div class="sn"><small><span class="lgonly">Velocidad</span><span class="smonly">Vel.</span></small>${num("speed", c.speed, { step: 1.5, label: "Velocidad", show: String(c.speed).replace(".", ",") + " m" })}</div>
        <div class="sn"><small>Competencia</small><b>${sign(pb)}</b></div>
        <div class="sn"><small><span class="lgonly">Dados de golpe</span><span class="smonly">D. golpe</span></small>${ed ? `<input type="number" data-n="hdUsed" value="${c.hdUsed || 0}" aria-label="Dados de golpe gastados"><em>gastados de ${c.level}d${classInfo(c.cls).hd}</em>` : `<b>${c.level - (c.hdUsed || 0)}</b><em>/${c.level}d${classInfo(c.cls).hd}</em>`}</div>
      </div>
    </header>
    ${ed ? identityHTML(c, dm) : ""}
    <div class="shgrid">
      <aside class="shcol">${colHTML(c, ed)}</aside>
      <section class="shmain">
        <nav class="tabs" role="tablist">${TABS.map(([k, t]) => `<button role="tab" class="tab ${k === "atr" ? "mobonly" : ""}" data-tab="${k}" aria-selected="${tab === k}">${t}${k === "lqv" && (levelGranted(c0) || c0.lvlDraft) ? " •" : ""}</button>`).join("")}</nav>
        <div class="tabbody">${({ atr: () => colHTML(c, ed), acc: () => tabAcc(c, ed), con: () => tabCon(c, ed), inv: () => tabInv(c, ed, dm), ras: () => tabRas(c, ed), his: () => tabHis(c, ed), cua: () => `<p class="note" style="margin:0 0 8px">Tus notas de la partida: nombres, pistas, promesas. Marca con ⭐ los descubrimientos y comparte con 📣 lo que quieras que quede en la crónica. Las notas son tuyas: no necesitan el visto bueno del máster.</p>${(mine || dm) && whispersFor(state, c0.id).length ? `<h4 class="whh">🤫 Lo que sabe solo ${esc(c0.name.split(" ")[0])} <small>se lo ha contado el máster; nadie más del grupo lo ve</small></h4>${whispersHTML(state, c0)}` : ""}${journalHTML(c0, { edit: mine || dm })}`, lqv: () => tabLqv(c0, dm, canLv) })[tab]()}</div>
      </section>
    </div>
  </div>`;
  bind(state, c0, ed);
  portraits();
}

/* ---------- Columna izquierda: características, salvaciones, habilidades, sentidos ---------- */
function colHTML(c, ed) {
  return `<div class="abgrid">${ABILITIES.map(([k, n]) => { const prof1 = (c.saves || []).includes(k); return `<div class="ab2"><small>${AB_SHORT[k]}</small><b>${sign(mod(c.abilities[k]))}</b>
      ${ed ? `<input type="number" data-n="abilities.${k}" value="${c.abilities[k]}" aria-label="${n}">` : `<span class="score">${c.abilities[k]}</span>`}
      <em class="sv ${prof1 ? "on" : ""}" title="Salvación de ${n}${prof1 ? " (competente)" : ""}">${ed ? `<input type="checkbox" data-save="${k}" ${prof1 ? "checked" : ""} aria-label="Competente en salvación de ${n}">` : prof1 ? "●" : "○"} salv. ${sign(saveBonus(c, k))}</em></div>`; }).join("")}</div>
    <h3 class="colh">Habilidades <small>● competente · ★ pericia</small></h3>
    <div class="sklist">${SKILLS.map(([k, n, ab]) => { const v = (c.skills || {})[k] || 0; return `<div class="sk ${v ? "p" + v : ""}">${ed ? `<select data-skill="${k}" aria-label="Competencia en ${n}"><option value="0">·</option><option value="1" ${v === 1 ? "selected" : ""}>●</option><option value="2" ${v === 2 ? "selected" : ""}>★</option></select>` : `<i>${["·", "●", "★"][v]}</i>`}<span>${n} <small>${AB_SHORT[ab]}</small></span><b>${sign(skillBonus(c, k, ab))}</b></div>`; }).join("")}</div>
    <h3 class="colh">Sentidos</h3>
    <div class="senses"><span>Percepción pasiva <b>${passive(c, "percepcion", "sab")}</b></span><span>Perspicacia pasiva <b>${passive(c, "perspicacia", "sab")}</b></span><span>Investigación pasiva <b>${passive(c, "investigacion", "int")}</b></span>
      <span>Visión en la oscuridad ${ed ? `<input type="number" step="9" data-n="darkvision" value="${darkvisionOf(c)}" aria-label="Visión en la oscuridad"> m` : `<b>${darkvisionOf(c) ? darkvisionOf(c) + " m" : "no"}</b>`}</span></div>
    <h3 class="colh">Idiomas</h3>${ed ? `<textarea data-p="languages" rows="2">${esc(c.languages || "")}</textarea>` : `<p class="ctext">${esc(c.languages || "—")}</p>`}
    <h3 class="colh">Competencias</h3>${ed ? `<textarea data-p="proficiencies" rows="2" placeholder="Armaduras, armas, herramientas">${esc(c.proficiencies || "")}</textarea>` : `<p class="ctext">${esc(c.proficiencies || "—")}</p>`}`;
}
/** Datos que casi nunca cambian: solo aparecen al editar (o al proponer). */
function identityHTML(c, dm) {
  return `<section class="identity"><div class="idgrid">
      <label class="field">Especie<input data-p="species" value="${esc(c.species)}"></label>
      <label class="field">Clase<input data-p="cls" list="classes" value="${esc(c.cls)}"></label>
      <label class="field">Subclase<input data-p="subclass" value="${esc(c.subclass)}"></label>
      <label class="field">Trasfondo<input data-p="background" value="${esc(c.background)}"></label>
      <label class="field">Alineamiento<input data-p="alignment" value="${esc(c.alignment || "")}"></label>
      <label class="field">Miniatura 3D<select data-mini>${[["", "Peana de cartón"], ["Knight", "Figura: caballero"], ["Barbarian", "Figura: bárbaro"], ["Mage", "Figura: mago"], ["Rogue", "Figura: pícaro"], ["Rogue_Hooded", "Figura: encapuchado"]].map(([k, n]) => `<option value="${k}" ${(c.mini || "") === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label class="field">Bonificador de iniciativa<input type="number" data-n="initBonus" value="${+c.initBonus || 0}"></label>
    </div><datalist id="classes">${Object.keys(CLASSES).map(k => `<option value="${k}">`).join("")}</datalist>
    ${dm ? `<div class="row" style="margin-top:8px"><span class="grow"></span><button class="btn small danger" id="delpj">Eliminar ficha</button></div>` : ""}</section>`;
}

/* ---------- Propuestas y registro ---------- */
const when = t => new Date(t).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
function propsHTML(c, dm, mine) {
  return `<section class="props">${(c.proposals || []).map(p => `<div class="pprop">
      <div class="ph"><b>📝 ${esc(p.by)} propone</b><small>${when(p.at)}</small>${p.note ? `<em>«${esc(p.note)}»</em>` : ""}</div>
      <ul>${p.changes.map(ch => `<li>${esc(describe(ch))}${stale(c, ch) ? ` <small class="warn" title="La ficha ha cambiado en esto desde que se envió: al aprobar se pone el valor propuesto">⚠ ha cambiado desde entonces</small>` : ""}</li>`).join("")}
        ${p.meta && p.meta.give ? `<li>🤝 Para <b>${esc((store.get().characters.find(x => x.id === p.meta.give.to) || {}).name || "?")}</b>: ${esc([...(p.meta.give.items || []).map(i => `${i.name}${i.qty > 1 ? " ×" + i.qty : ""}`), ...Object.entries(p.meta.give.coins || {}).map(([k, v]) => `${v} ${k}`)].join(", "))}</li>` : ""}
        ${lootGone(store.get(), p).length ? `<li><small class="warn">⚠ Ese objeto ya no está en el botín del grupo (otro se lo quedó)</small></li>` : p.meta && p.meta.lootTake ? `<li><small class="note">Sale del botín del grupo</small></li>` : ""}</ul>
      <div class="row">${dm ? `<input data-why="${p.id}" placeholder="Motivo si lo rechazas (opcional)"><button class="btn small danger" data-reject="${p.id}">Rechazar</button><button class="btn small gold" data-approve="${p.id}">✓ Aprobar</button>`
        : mine ? `<small class="note">Esperando al máster.</small><span class="grow"></span><button class="btn small" data-withdraw="${p.id}">Retirar</button>` : `<small class="note">Pendiente del máster.</small>`}</div></div>`).join("")}</section>`;
}
const LOGK = { aprobado: ["✓", "Aprobado"], rechazado: ["✕", "Rechazado"], maestro: ["✎", "Cambiado por el máster"], nivel: ["⬆", "Subida de nivel"] };
function logHTML(c) {
  return `<section class="shlog"><h3 class="colh">📜 Registro de la ficha <small>lo que entra y sale, con quién y cuándo</small></h3>${(c.log || []).map(l => `<div class="lg k-${l.kind}">
      <div><b>${(LOGK[l.kind] || ["•", l.kind])[0]} ${(LOGK[l.kind] || ["", l.kind])[1]}</b> <small>${when(l.at)} · ${esc(l.by)}${l.from && l.from !== l.by ? ` · propuesto por ${esc(l.from)}` : ""}</small></div>
      ${l.note ? `<em>«${esc(l.note)}»</em>` : ""}${l.why ? `<em>Motivo: ${esc(l.why)}</em>` : ""}
      <ul>${(l.lines || []).map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")}</section>`;
}

/* ---------- Pestañas ---------- */
const rows = (list, key, cols, addLabel) => `<div class="rows">${(list || []).map((x, i) => `<div class="rowi">${cols.map(([f, ph, type, w]) => type === "check"
    ? `<label class="mini" title="${ph}"><input type="checkbox" data-l="${key}.${i}.${f}" ${x[f] ? "checked" : ""}> ${ph}</label>`
    : `<input ${type === "num" ? 'type="number"' : ""} data-l="${key}.${i}.${f}" value="${esc(x[f] ?? "")}" placeholder="${ph}" style="flex:${w || 1}" aria-label="${ph}">`).join("")}
    <button class="btn small danger" data-del="${key}.${i}" aria-label="Quitar">✕</button></div>`).join("") || `<p class="empty">Nada todavía.</p>`}</div>
  <div class="row" style="margin-top:8px"><button class="btn small" data-add="${key}">${addLabel}</button></div>`;

// Rasgos que se usan como acción adicional o reacción (por su texto)
const featUse = f => { const t = ((f.name || "") + " " + (f.text || "")).toLowerCase(); return /reacci[oó]n/.test(t) ? "react" : /acci[oó]n adicional/.test(t) ? "bonus" : /una vez por turno|por descanso|\/día|usos?/.test(t) ? "limit" : null; };
function tabAcc(c, ed) {
  if (ed) return `<h2 class="sec">Armas y ataques</h2>${rows(c.weapons, "weapons", [["name", "Arma", "", 3], ["atk", "Ataque", "", 1], ["dmg", "Daño", "", 2], ["notes", "Propiedades", "", 3]], "+ Arma o ataque")}
    <p class="note">Los rasgos y los conjuros se editan en sus pestañas.</p>`;
  const F = c.features || [], g = k => F.filter(f => featUse(f) === k);
  const sp = c.spells || {}, slots = Object.entries(sp.slots || {}).filter(([, v]) => (+v.max || 0) > 0), ab = classInfo(c.cls).cast;
  const fl = list => list.map(f => `<details class="fcard"><summary><b>${esc(f.name || "Rasgo")}</b></summary><p>${esc(f.text || "")}</p></details>`).join("");
  return `<h2 class="sec">Ataques</h2>
    ${(c.weapons || []).length ? `<div class="atklist">${c.weapons.map(w => `<div class="atk"><b>${esc(w.name || "—")}</b><span class="atkb">${esc(w.atk || "")}</span><span>${esc(w.dmg || "")}</span><small>${esc(w.notes || "")}</small></div>`).join("")}</div>` : `<p class="empty">Sin armas ni ataques.</p>`}
    ${ab ? `<p class="note" style="margin:6px 0 0">Conjuros: CD ${8 + pb2(c) + mod(c.abilities[ab])} · ataque ${sign(pb2(c) + mod(c.abilities[ab]))} · preparados en la pestaña Conjuros.</p>` : ""}
    ${g("bonus").length ? `<h2 class="sec">Acción adicional</h2>${fl(g("bonus"))}` : ""}
    ${g("react").length ? `<h2 class="sec">Reacciones</h2>${fl(g("react"))}` : ""}
    ${g("limit").length ? `<h2 class="sec">Una vez por turno y usos limitados</h2>${fl(g("limit"))}` : ""}
    <h2 class="sec">Recursos</h2>
    <div class="res">${slots.map(([l, v]) => `<span title="Espacios de conjuro de nivel ${l}">Nivel ${l} ${Array.from({ length: +v.max }, (_, i) => `<i class="pip ${i < (v.used || 0) ? "used" : ""}"></i>`).join("")}</span>`).join("")}
      <span title="Dados de golpe">Dados de golpe <b>${c.level - (c.hdUsed || 0)}/${c.level}</b></span>
      <span title="Inspiración heroica">Inspiración <b>${c.inspiration ? "sí" : "no"}</b></span></div>
    <p class="note">Se gastan y se recuperan durante la Partida.</p>`;
}
const pb2 = c => prof(c.level);

function tabInv(c, ed, dm) {
  const w = carried(c), cap = capacity(c), coins = [["po", "Oro"], ["pp", "Plata"], ["pe", "Electro"], ["pc", "Cobre"]];
  const st = store.get(), me = currentUser(st), mine = me && c.owner === me.id;
  return `${!ed && (mine || dm) ? `<div class="row invacts"><button class="btn small gold" id="shop">🛒 Tienda</button>${mine && !dm ? `<button class="btn small" id="give">🤝 Dar a un compañero</button>` : ""}<small class="note">${dm ? "Como máster, la compra se aplica directamente." : "Lo que compres o des, lo aprueba el máster."}</small></div>` : ""}
    <h2 class="sec">Monedas</h2>
    ${ed ? `<div class="coins">${coins.map(([k, n]) => `<label class="field">${n}<input type="number" data-n="coins.${k}" value="${c.coins[k] || 0}"></label>`).join("")}</div>`
      : `<div class="coinrow">${coins.map(([k, n]) => `<span class="coin c-${k}"><b>${c.coins[k] || 0}</b> ${n.toLowerCase()}</span>`).join("")}</div>`}
    <h2 class="sec" style="margin-top:16px">Equipo <small class="weight ${w > cap ? "over" : ""}">${Math.round(w * 10) / 10} / ${cap} kg</small></h2>
    ${ed ? rows(c.inventory, "inventory", [["equipped", "Equipado", "check"], ["name", "Objeto", "", 3], ["qty", "Cant.", "num", .7], ["weight", "Peso (kg)", "num", .9], ["notes", "Notas", "", 3]], "+ Objeto")
      : (c.inventory || []).length ? `<div class="invlist">${c.inventory.map(i => `<div class="inv ${i.equipped ? "eq" : ""}"><b>${esc(i.name || "—")}</b>${(+i.qty || 1) > 1 ? `<span>×${i.qty}</span>` : "<span></span>"}<small>${i.weight ? String(i.weight).replace(".", ",") + " kg" : ""}</small><em>${i.equipped ? "equipado" : ""}${i.notes ? (i.equipped ? " · " : "") + esc(i.notes) : ""}</em></div>`).join("")}</div>` : `<p class="empty">Nada todavía.</p>`}
    <h2 class="sec" style="margin-top:16px">✨ Objetos especiales <small>${(c.treasures || []).length}</small></h2>
    ${treasuresHTML(c, { dm, edit: dm && mode === "dm" })}
    ${dm && mode === "dm" ? `<div class="row" style="margin:8px 0 0"><button class="btn small" id="tesadd">+ Objeto especial</button></div>` : ""}`;
}

// Conjuros: una fila por conjuro con lo que hace falta saber de un vistazo (cuándo se lanza, alcance, qué hace);
// al tocarla se despliega el texto completo del SRD justo debajo.
const TIME = { act: ["⚡", "Acción"], bonus: ["✦", "Acción adicional"], react: ["↺", "Reacción"] };
function spellLine(d) {
  const m = spellMech(d) || {}, t = d.t || "", time = /minuto|hora/i.test(t) ? ["⏳", t] : TIME[m.time] || ["⚡", t];
  const eff = [m.dmg ? `${m.dmg} ${m.dt || ""}`.trim() : "", m.heal ? `cura ${m.heal}${m.healMod ? " + mod." : ""}` : "", m.save ? `salvación de ${String(m.save).toUpperCase()}` : "", m.atk ? "tirada de ataque" : "", m.area ? `${m.area.shape} ${m.area.size} m` : ""].filter(Boolean);
  return { time, eff, conc: /concentraci/i.test(d.du || ""), rit: /ritual/i.test(t) };
}
function tabCon(c, ed) {
  const ab = classInfo(c.cls).cast;
  const sp = c.spells || { slots: {}, list: [] };
  const byLvl = {}; (sp.list || []).forEach((s, i) => (byLvl[s.level || 0] = byLvl[s.level || 0] || []).push([s, i]));
  const head = ab ? `<div class="spellstats"><span>Característica <b>${AB_SHORT[ab]}</b></span><span>CD de salvación <b>${8 + prof(c.level) + mod(c.abilities[ab])}</b></span><span>Ataque de conjuro <b>${sign(prof(c.level) + mod(c.abilities[ab]))}</b></span></div>`
    : `<p class="note" style="margin:0 0 12px">${esc(c.cls || "Esta clase")} no lanza conjuros de serie, pero se pueden anotar aquí los que obtenga por especie, dotes u objetos.</p>`;
  const lv = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(l => ed || +((sp.slots || {})[l] || {}).max > 0);
  const slotsHTML = `<div class="sslots">${lv.map(l => { const s = (sp.slots || {})[l] || { max: 0, used: 0 }, free = Math.max(0, s.max - (s.used || 0)); return `<div class="sslot"><span class="sl">Nivel ${l}</span>
      <span class="spips">${Array.from({ length: s.max }, (_, i) => ed ? `<button class="spip ${i < s.used ? "used" : ""}" data-pip="${l}.${i}" aria-label="Espacio ${i + 1} de nivel ${l}"></button>` : `<i class="spip ${i < s.max - (s.used || 0) ? "" : "used"}"></i>`).join("")}</span>
      ${ed ? `<input type="number" min="0" max="9" data-n="spells.slots.${l}.max" value="${s.max}" aria-label="Espacios de nivel ${l}">` : `<small>${free} de ${s.max} libres</small>`}</div>`; }).join("") || `<p class="empty">Sin espacios de conjuro.</p>`}</div>`;
  const list = ed ? Object.keys(byLvl).sort((a, b) => a - b).map(l => `<h3 class="lvlh">${+l === 0 ? "Trucos" : `Nivel ${l}`}</h3>
      <div class="rows">${byLvl[l].map(([s, i]) => `<div class="rowi"><label class="mini" title="Preparado"><input type="checkbox" data-l="spells.list.${i}.prepared" ${s.prepared ? "checked" : ""}> Prep.</label>
        <input data-l="spells.list.${i}.name" value="${esc(s.name)}" placeholder="Conjuro" style="flex:3" aria-label="Conjuro" list="spelllist">
        <input type="number" min="0" max="9" data-l="spells.list.${i}.level" value="${s.level || 0}" style="flex:.6" aria-label="Nivel">
        <input data-l="spells.list.${i}.notes" value="${esc(s.notes || "")}" placeholder="Notas" style="flex:3" aria-label="Notas">
        <button class="btn small danger" data-del="spells.list.${i}" aria-label="Quitar">✕</button></div>`).join("")}</div>`).join("") + `<div class="row" style="margin-top:8px"><button class="btn small" data-add="spells.list">+ Conjuro</button></div><datalist id="spelllist">${(srdNow.conjuros || []).map(x => `<option value="${esc(x.n)}">${x.lvl ? "Nv " + x.lvl : "Truco"}</option>`).join("")}</datalist>`
    : Object.keys(byLvl).sort((a, b) => a - b).map(l => `<h3 class="lvlh">${+l === 0 ? "Trucos <small>a voluntad, sin gastar espacios</small>" : `Nivel ${l} <small>gasta un espacio de nivel ${l} o superior</small>`}</h3>
      <div class="splist3">${byLvl[l].map(([s]) => { const d = findSpell(s.name), prep = s.prepared || !+l;
        if (!d) return `<div class="sprow3 ${prep ? "" : "unprep"}"><div class="sph3"><b>${esc(s.name || "—")}</b><small>No está en el SRD${s.notes ? " · " + esc(s.notes) : ""}</small></div></div>`;
        const L = spellLine(d), open = spOpen === s.name;
        return `<div class="sprow3 ${prep ? "" : "unprep"} ${open ? "open" : ""}"><button class="sph3" data-spinfo="${esc(s.name)}" aria-expanded="${open}">
          <span class="spt" title="${esc(L.time[1])}">${L.time[0]}</span><b>${esc(d.n)}</b>
          <span class="spm">${esc(L.time[1])} · ${esc(d.al || "")}${L.conc ? ` · <i title="Concentración">C</i>` : ""}${L.rit ? ` · <i title="Ritual">R</i>` : ""}</span>
          <span class="spe">${esc(L.eff.join(" · ") || (d.txt || "").slice(0, 70) + "…")}</span>
          <span class="spp">${prep ? "preparado" : "no preparado"}</span></button>
          ${open ? `<div class="spfull">${spellCard(d)}</div>` : ""}</div>`; }).join("")}</div>`).join("") || `<p class="empty">Sin conjuros.</p>`;
  return `${head}<h2 class="sec">Espacios de conjuro</h2><p class="note sleg">Se gastan al lanzar un conjuro de ese nivel o menor y vuelven con el descanso largo.</p>${slotsHTML}
    <h2 class="sec">Conjuros</h2>${ed ? "" : `<p class="note sleg">⚡ acción · ✦ acción adicional · ↺ reacción · C concentración · R ritual. Toca uno para leerlo entero.</p>`}${list}`;
}
function tabRas(c, ed) {
  if (ed) return `<h2 class="sec">Rasgos y dotes</h2>
    <div class="rows">${(c.features || []).map((f, i) => `<div class="feat"><div class="rowi"><input data-l="features.${i}.name" value="${esc(f.name)}" placeholder="Rasgo" style="flex:1;font-weight:700" aria-label="Rasgo"><button class="btn small danger" data-del="features.${i}" aria-label="Quitar">✕</button></div>
      <textarea data-l="features.${i}.text" rows="2" placeholder="Qué hace" aria-label="Descripción">${esc(f.text || "")}</textarea></div>`).join("") || `<p class="empty">Nada todavía.</p>`}</div>
    <div class="row" style="margin-top:8px"><button class="btn small" data-add="features">+ Rasgo o dote</button></div>`;
  return `<h2 class="sec">Rasgos y dotes <small>${(c.features || []).length}</small></h2>${(c.features || []).map(f => `<details class="fcard"><summary><b>${esc(f.name || "Rasgo")}</b>${featUse(f) === "bonus" ? `<em>acción adicional</em>` : featUse(f) === "react" ? `<em>reacción</em>` : ""}</summary><p>${esc(f.text || "")}</p></details>`).join("") || `<p class="empty">Nada todavía.</p>`}`;
}

/** Historia: la historia del personaje, hasta 5 recuerdos (foto con su texto) y notas. */
function tabHis(c, ed) {
  const g = c.gallery || [];
  return `<h2 class="sec">Su historia</h2>
    ${ed ? `<textarea data-p="story" rows="9" class="storybox" placeholder="De dónde viene, qué perdió, a quién busca, qué le mueve…">${esc(c.story || "")}</textarea>` : c.story ? `<div class="storytext">${esc(c.story).split(/\n+/).map(p => `<p>${p}</p>`).join("")}</div>` : `<p class="empty">Sin escribir todavía.</p>`}
    <h2 class="sec" style="margin-top:18px">Recuerdos <small class="note">${g.length} de 5</small></h2>
    <div class="memgrid">${g.map((m, i) => `<figure class="mem"><div class="memimg" data-portrait="${esc(m.img || "")}">${m.img ? "" : "Sin foto"}</div>
        <figcaption>${ed ? `<textarea data-l="gallery.${i}.text" rows="3" placeholder="Qué muestra este recuerdo">${esc(m.text || "")}</textarea>` : esc(m.text || "")}</figcaption>
        ${ed ? `<div class="row"><button class="btn small" data-memimg="${i}">${m.img ? "Cambiar foto" : "+ Foto"}</button><button class="btn small danger" data-memdel="${i}">Quitar</button></div>` : ""}</figure>`).join("")}
      ${ed && g.length < 5 ? `<button class="mem add" id="memadd">+ Añadir recuerdo</button>` : ""}${!ed && !g.length ? `<p class="empty">Ninguno todavía.</p>` : ""}</div>
    <h2 class="sec" style="margin-top:18px">Notas</h2>${ed ? `<textarea data-p="notes" rows="5">${esc(c.notes || "")}</textarea>` : c.notes ? `<p class="ctext">${esc(c.notes)}</p>` : `<p class="empty">Sin notas.</p>`}`;
}

/** Lo que viene: PX, subir de nivel (con lo guardado a medias), los próximos niveles y el historial. */
function tabLqv(c, dm, canLv) {
  const nextXP = c.level < 20 ? xpFor(c.level + 1) : null, curXP = xpFor(c.level);
  const xpPct = nextXP ? Math.max(0, Math.min(100, ((c.xp - curXP) / (nextXP - curXP)) * 100)) : 100, d = c.lvlDraft;
  return `<div class="lqv">
    <div class="xprow"><span class="lvl">Nivel <b>${c.level}</b></span><div class="xpbar" title="${c.xp} PX"><i style="width:${xpPct}%"></i></div><span class="xptext">${c.xp} ${nextXP ? `/ ${nextXP} PX` : "PX"}</span>
      ${dm ? `<span class="addxp"><input type="number" id="xpadd" placeholder="PX" aria-label="Experiencia a sumar"><button class="btn small" id="xpgo">Sumar</button></span>` : ""}</div>
    ${canLv ? `<div class="lvbox ${d ? "draft" : ""}">${d ? `<p><b>Tienes una subida a nivel ${d.L} a medias</b> (paso ${(d.step || 0) + 1}, guardada ${when(d.at)}).</p><div class="row"><button class="btn gold" id="lvlup">⬆ Continuar la subida</button><button class="btn small" id="lvdrop">Empezar de nuevo</button></div>`
        : `<p>${levelGranted(c) ? `El máster te ha concedido el <b>nivel ${c.level + 1}</b>.` : "Como máster puedes subirlo directamente."} El asistente te guía paso a paso y guarda lo que lleves: puedes dejarlo a medias y seguir otro día.</p><button class="btn gold" id="lvlup">⬆ Subir a nivel ${c.level + 1}</button>`}</div>`
      : canLevelUp(c) ? `<p class="note">Tiene los PX para nivel ${c.level + 1}: el máster decidirá cuándo subir (al acabar la escena o la sesión).</p>` : ""}
    <div class="hzhost" data-hz="${c.id}"></div>
    ${(c.levelLog || []).length ? `<h2 class="sec">Subidas anteriores</h2><div class="lvlog">${[...c.levelLog].reverse().map(l => `<span>Nivel ${l.lvl}: +${l.hp} PG${l.sub ? " · " + esc(l.sub) : ""}${l.feat ? " · " + esc(l.feat) : ""}${l.spells ? " · " + esc(l.spells.join(", ")) : ""}</span>`).join("")}</div>` : ""}
  </div>`;
}

/* ---------- Edición ---------- */
const getP = (o, path) => path.split(".").reduce((x, k) => x == null ? x : x[k], o);
function setP(o, path, v) {
  const ks = path.split("."); let x = o;
  ks.slice(0, -1).forEach((k, i) => { if (x[k] == null) x[k] = /^\d+$/.test(ks[i + 1]) && Array.isArray(x) ? [] : {}; x = x[k]; });
  x[ks[ks.length - 1]] = v;
}
const clone = o => JSON.parse(JSON.stringify(o));

function bind(state, c0, ed) {
  const id = c0.id;
  const C = s => s.characters.find(x => x.id === id);
  const on = (sel, fn) => { const b = $(sel, el); if (b) b.onclick = fn; };
  // Escribe en la ficha (máster) o en la copia (jugador proponiendo)
  const mut = (fn, redraw = true) => { if (mode === "prop") { fn(draft); if (redraw) draw(); } else store.commit("char", s => { const x = C(s); if (x) fn(x); }); };
  on("#back", () => { if (mode !== "read" && !leaveOk()) return; openId = null; mode = "read"; draft = snap = null; draw(); });
  $$("[data-tab]", el).forEach(b => b.onclick = () => { setTab(b.dataset.tab); draw(); });
  $$("[data-gotab]", el).forEach(b => b.onclick = () => { setTab(b.dataset.gotab); draw(); });
  on("#logbtn", () => { showLog = !showLog; draw(); });
  on("#edit", () => { mode = "dm"; snap = clone(c0); draw(); });
  on("#done", () => {
    const ch = snap ? diffChar(snap, store.get().characters.find(x => x.id === id) || {}) : [];
    if (ch.length) store.commit("char", s => { const x = C(s); if (x) logTo(x, s, "maestro", ch.map(describe)); });
    mode = "read"; snap = null; draw();
  });
  on("#propose", () => { mode = "prop"; draft = clone(c0); draw(); });
  on("#pcancel", () => { mode = "read"; draft = null; draw(); });
  on("#psend", () => { const ch = diffChar(c0, draft); if (propose(id, ch, ($("#pnote", el) || {}).value || "")) { mode = "read"; draft = null; draw(); } });
  $$("[data-approve]", el).forEach(b => b.onclick = () => approve(id, b.dataset.approve));
  $$("[data-reject]", el).forEach(b => b.onclick = () => reject(id, b.dataset.reject, ($(`[data-why="${b.dataset.reject}"]`, el) || {}).value || ""));
  $$("[data-withdraw]", el).forEach(b => b.onclick = () => withdraw(id, b.dataset.withdraw));
  $$("[data-spinfo]", el).forEach(b => b.onclick = () => { spOpen = spOpen === b.dataset.spinfo ? null : b.dataset.spinfo; draw(); });
  { const hz = $(".hzhost", el); if (hz) import("./subirnivel.js").then(m => { if (hz.isConnected) hz.innerHTML = m.horizonHTML(c0, 5); }); }
  on("#lvlup", () => import("./subirnivel.js").then(m => m.openLevelUp(id)));
  on("#lvdrop", () => store.commit("char", s => { const x = C(s); if (x) delete x.lvlDraft; }));
  on("#shop", () => openShop(id));
  on("#give", () => openGive(id));
  on("#xpgo", () => { const v = +$("#xpadd", el).value || 0; if (!v) return; store.commit("char", s => { const x = C(s); x.xp = Math.max(0, (x.xp || 0) + v); }); toast(`${v > 0 ? "+" : ""}${v} PX para ${c0.name}`); });
  { const tb = $(".tabbody", el); if (tb) { bindTreasures(tb, c0, draw); bindJournal(tb, c0, draw); bindSheetFree(tb, c0); } on("#tesadd", () => giveTreasure([id], { kind: "recuerdo", name: "Objeto especial" })); }
  if (!ed) return;
  const saveText = debounce((path, v) => mode === "prop" ? setP(draft, path, v) : store.commit("field", s => setP(C(s), path, v)), 350);
  $$("[data-p]", el).forEach(i => i.addEventListener("input", () => saveText(i.dataset.p, i.value)));
  $$("[data-n]", el).forEach(i => i.addEventListener("change", () => mut(x => setP(x, i.dataset.n, i.value === "" ? 0 : +i.value))));
  $$("[data-l]", el).forEach(i => {
    if (i.type === "checkbox") i.onchange = () => mut(x => setP(x, i.dataset.l, i.checked));
    else if (i.type === "number") i.addEventListener("change", () => mut(x => setP(x, i.dataset.l, +i.value || 0)));
    else i.addEventListener("input", () => saveText(i.dataset.l, i.value));
    if (/^spells\.list\.\d+\.name$/.test(i.dataset.l)) i.addEventListener("change", () => { const sp = findSpell(i.value); if (sp) mut(x => setP(x, i.dataset.l.replace(/name$/, "level"), sp.lvl)); });
  });
  $$("[data-mini]", el).forEach(i => i.onchange = () => mut(x => { x.mini = i.value || null; }));
  $$("[data-save]", el).forEach(i => i.onchange = () => mut(x => { x.saves = (x.saves || []).filter(k => k !== i.dataset.save); if (i.checked) x.saves.push(i.dataset.save); }));
  $$("[data-skill]", el).forEach(i => i.onchange = () => mut(x => { x.skills = x.skills || {}; x.skills[i.dataset.skill] = +i.value; }));
  const blank = { weapons: () => ({ id: uidl("w"), name: "", atk: "", dmg: "", notes: "" }), inventory: () => ({ id: uidl("i"), name: "", qty: 1, weight: 0, notes: "" }),
    "spells.list": () => ({ id: uidl("s"), name: "", level: 0, prepared: true, notes: "" }), features: () => ({ id: uidl("f"), name: "", text: "" }) };
  $$("[data-add]", el).forEach(b => b.onclick = () => mut(x => { const k = b.dataset.add; if (!getP(x, k)) setP(x, k, []); getP(x, k).push(blank[k]()); }));
  $$("[data-del]", el).forEach(b => b.onclick = () => mut(x => { const p = b.dataset.del.split("."), i = +p.pop(); getP(x, p.join(".")).splice(i, 1); }));
  $$("[data-pip]", el).forEach(b => b.onclick = () => mut(x => { const [l, i] = b.dataset.pip.split(".").map(Number), sl = x.spells.slots[l]; sl.used = i < sl.used ? i : i + 1; }));
  on("#memadd", () => mut(x => { x.gallery = x.gallery || []; if (x.gallery.length < 5) x.gallery.push({ img: null, text: "" }); }));
  $$("[data-memdel]", el).forEach(b => b.onclick = () => mut(x => { x.gallery.splice(+b.dataset.memdel, 1); }));
  $$("[data-memimg]", el).forEach(b => b.onclick = async () => {
    const f = await pickFile(); if (!f) return;
    try { const r = await readImageFile(f, 1400), key = uidl("recuerdo"); await putImage(key, r.dataURL); mut(x => { x.gallery[+b.dataset.memimg].img = key; }); }
    catch (e) { toast("No se pudo cargar la imagen. Prueba con un JPG o PNG."); }
  });
  on("#portrait", async () => {
    const f = await pickFile(); if (!f) return;
    try { toast("Cargando la ilustración…"); const r = await readImageFile(f, 1400), key = uidl("retrato"); await putImage(key, r.dataURL); mut(x => { x.portrait = key; }); }
    catch (e) { toast("No se pudo cargar la imagen. Prueba con un JPG o PNG."); }
  });
  const del = $("#delpj", el);
  if (del) del.onclick = () => {
    if (!del.dataset.sure) { del.dataset.sure = "1"; del.textContent = "Pulsa otra vez para eliminarla"; return; }
    openId = null; mode = "read"; snap = null; store.commit("char", s => { s.characters = s.characters.filter(x => x.id !== id); });
  };
}
// Salir de una propuesta sin enviarla: se pide confirmación con un segundo toque
let leaveArmed = 0;
function leaveOk() {
  if (mode !== "prop" || !draft) return true;
  const c0 = store.get().characters.find(x => x.id === openId);
  if (!c0 || !diffChar(c0, draft).length || Date.now() - leaveArmed < 4000) return true;
  leaveArmed = Date.now(); toast("Tienes cambios sin enviar al máster. Pulsa otra vez para salir sin enviarlos."); return false;
}
