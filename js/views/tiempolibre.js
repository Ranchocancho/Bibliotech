// Tiempo libre: el máster prepara los sitios de una ciudad; cada jugador elige a dónde va su personaje y qué hace;
// el máster le cuenta lo que pasa (en privado si quiere) y todo queda en un registro.
import { store, uid } from "../core/store.js";
import { isDM, currentUser } from "../core/session.js";
import { placeOf, placePath } from "../core/lore.js";
import { hereOf } from "../core/contexto.js";
import { liveSession, addEntry } from "../core/sesiones.js";
import { addNote } from "../core/tesoros.js";
import { SPOTS, freeOf, spotOf, partyChars, pickOf, whispersFor, suggestSpots, openFree, editFree, choose, whisper, dropWhisper, closeFree } from "../core/tiempolibre.js";
import { $, $$, esc, toast } from "../core/ui.js";

const overlay = (id, html) => { document.getElementById(id)?.remove(); const ov = document.createElement("div"); ov.className = "reqdlg"; ov.id = id; ov.innerHTML = html; document.body.appendChild(ov); ov.addEventListener("click", e => { if (e.target === ov) ov.remove(); }); return ov; };
const first = n => String(n || "").split(" ")[0];
const ago = t => new Date(t).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const mine = (s, c) => !!c.owner && c.owner === (currentUser(s) || {}).id;

/* ---------- Máster: bloque del panel (Roleplay) ---------- */
export function freeDMBlock(s) {
  if (!isDM(s)) return "";
  const ft = freeOf(s), log = s.freeLog || [];
  if (!ft) return `<div class="panel ftpanel"><h2 class="sec">🕰 Tiempo libre</h2>
    <p class="note" style="margin:0 0 6px">Dejad que cada uno decida qué hace en la ciudad: elige los sitios (taberna, mercado, biblioteca…) y cada jugador manda a dónde va y qué quiere hacer.</p>
    <div class="row"><button class="btn gold" data-ftnew>🕰 Dar tiempo libre${hereOf(s) ? ` en ${esc(hereOf(s).name)}` : ""}</button>${log.length ? `<button class="btn small" data-ftlog>📜 Registro <small>${log.length}</small></button>` : ""}</div></div>`;
  return `<div class="panel ftpanel on"><h2 class="sec">🕰 ${esc(ft.title)}</h2>${overview(s, ft, true, true)}
    <div class="row">${s.presentation && s.presentation.type === "freetime" ? "" : `<button class="btn small gold" data-ftshow>Mostrar en la mesa</button>`}<button class="btn small" data-ftedit>✎ Sitios</button>${log.length ? `<button class="btn small" data-ftlog>📜 Registro</button>` : ""}<span class="grow"></span><button class="btn small danger" data-ftclose>Cerrar el tiempo libre</button></div></div>`;
}

/** Quién va a cada sitio y qué quiere hacer (el máster ve los planes y lo que ha contado a cada uno). */
function overview(s, ft, dm, compact = false) {
  const chars = partyChars(s), W = whispersFor(s).filter(w => w.ft === ft.id);
  const row = c => { const p = pickOf(ft, c), n = W.filter(w => w.char === c.id).length;
    return `<div class="ftwho"><div><b>${esc(c.name)}</b>${p && p.plan && (dm || mine(s, c)) ? `<p class="ftplan">«${esc(p.plan)}»</p>` : ""}</div>
      ${dm ? `<span class="ftacts"><button class="btn small gold" data-ftwh="${c.id}" title="Contarle lo que pasa: solo lo leerá su jugador">🤫 Contarle${n ? ` <small>${n}</small>` : ""}</button><button class="btn small" data-ftroll="${c.id}" title="Pedirle una tirada">🎲</button></span>` : ""}</div>`; };
  const cols = ft.spots.map(sp => { const here = chars.filter(c => (pickOf(ft, c) || {}).spot === sp.id);
    if (compact && !here.length) return "";
    return `<div class="ftcol"><h4>${esc(sp.icon || "📍")} ${esc(sp.name)} <small>${here.length || ""}</small></h4>${dm && sp.secret ? `<p class="ftsec" title="Solo lo ves tú">🔒 ${esc(sp.secret)}</p>` : ""}${here.map(row).join("") || `<p class="empty">Nadie</p>`}</div>`; }).join("");
  const none = chars.filter(c => !pickOf(ft, c));
  return `<div class="ftboard">${cols}</div>${none.length ? `<p class="note ftnone">Aún sin decidir: ${none.map(c => esc(first(c.name))).join(", ")}</p>` : `<p class="note ftnone">✓ Todos han decidido.</p>`}`;
}

export function bindFreeDM(root) {
  $$("[data-ftnew]", root).forEach(b => b.onclick = () => openEditor(null));
  $$("[data-ftedit]", root).forEach(b => b.onclick = () => openEditor(freeOf(store.get())));
  $$("[data-ftshow]", root).forEach(b => b.onclick = () => store.commit("present", s => { s.presentation = { type: "freetime" }; }));
  $$("[data-ftclose]", root).forEach(b => b.onclick = () => { if (confirmClose()) closeFree(); });
  $$("[data-ftlog]", root).forEach(b => b.onclick = openLog);
  $$("[data-ftwh]", root).forEach(b => b.onclick = () => openWhisper(b.dataset.ftwh));
  $$("[data-ftroll]", root).forEach(b => b.onclick = () => import("./peticiones.js").then(m => m.openAskDialog([b.dataset.ftroll])));
}
function confirmClose() {
  const s = store.get(), ft = freeOf(s), none = ft ? partyChars(s).filter(c => !pickOf(ft, c)).length : 0;
  return !none || window.confirm(`${none} personaje(s) aún no han decidido. ¿Cerrar igualmente?`);
}

/* ---------- Máster: preparar los sitios ---------- */
let draft = null;
function openEditor(ft) {
  const s = store.get(), here = hereOf(s);
  draft = ft ? { place: ft.place, title: ft.title, note: ft.note, spots: ft.spots.map(x => ({ ...x })), edit: true }
    : { place: here ? here.id : "", title: "", note: "", spots: here ? suggestSpots(s, here.id) : SPOTS.slice(0, 2).map(([icon, name, text]) => ({ id: uid("sp"), icon, name, text, secret: "" })), edit: false };
  const ov = overlay("ftdlg", ""); drawEditor(ov);
}
function drawEditor(ov) {
  const s = store.get(), d = draft, P = placeOf(s, d.place);
  const has = n => d.spots.some(x => x.name.toLowerCase() === n.toLowerCase());
  ov.innerHTML = `<div class="modalbox ftbox"><header><h3>🕰 ${d.edit ? "Sitios del tiempo libre" : "Dar tiempo libre"}</h3><button class="x" data-close aria-label="Cerrar">✕</button></header>
    <div class="row"><label class="field grow">Dónde<select id="ftpl"><option value="">— Ningún lugar —</option>${s.world.places.map(p => `<option value="${p.id}" ${p.id === d.place ? "selected" : ""}>${esc(placePath(s, p.id).map(x => x.name).join(" › "))}</option>`).join("")}</select></label>
      <label class="field grow">Título<input id="fttitle" value="${esc(d.title)}" placeholder="Tiempo libre${P ? " en " + esc(P.name) : ""}"></label></div>
    <label class="field">Lo que leen los jugadores al empezar <textarea id="ftnote" rows="2" placeholder="Tenéis la tarde libre antes de partir al amanecer. ¿Qué hacéis?">${esc(d.note)}</textarea></label>
    <h4>Sitios <small>a dónde puede ir cada uno</small></h4>
    <div class="ftspots">${d.spots.map((x, i) => `<div class="ftspot"><input class="fticon" data-si="${i}" data-k="icon" value="${esc(x.icon || "📍")}" aria-label="Icono" maxlength="4">
      <div class="grow"><input data-si="${i}" data-k="name" value="${esc(x.name)}" placeholder="Nombre del sitio"><input data-si="${i}" data-k="text" value="${esc(x.text || "")}" placeholder="Lo que ven los jugadores (opcional)">
        <input data-si="${i}" data-k="secret" value="${esc(x.secret || "")}" placeholder="🔒 Tus notas: qué pueden encontrar aquí (solo tú)"></div>
      <button class="btn small danger" data-sdel="${i}" aria-label="Quitar">✕</button></div>`).join("") || `<p class="empty">Añade al menos un sitio.</p>`}</div>
    <div class="ftadd"><small>Añadir:</small>${SPOTS.filter(([, n]) => !has(n)).map(([i, n]) => `<button class="btn small" data-sadd="${esc(n)}">${i} ${n}</button>`).join("")}
      ${s.world.places.filter(p => p.parent === d.place && !has(p.name)).map(p => `<button class="btn small" data-splace="${p.id}">📍 ${esc(p.name)}</button>`).join("")}<button class="btn small" data-snew>+ Otro</button></div>
    <footer><span class="note">Cada jugador elige un sitio y escribe qué quiere hacer. Tú le cuentas lo que pasa, a solas si quieres.</span><span class="grow"></span>
      <button class="btn gold" id="ftgo" ${d.spots.some(x => x.name.trim()) ? "" : "disabled"}>${d.edit ? "Guardar" : "Abrir y mostrar en la mesa"}</button></footer></div>`;
  const redraw = () => drawEditor(ov);
  $("[data-close]", ov).onclick = () => ov.remove();
  $("#ftpl", ov).onchange = e => { d.place = e.target.value; if (!d.edit && !d.touched) d.spots = d.place ? suggestSpots(s, d.place) : d.spots; redraw(); };
  $("#fttitle", ov).oninput = e => { d.title = e.target.value; };
  $("#ftnote", ov).oninput = e => { d.note = e.target.value; };
  $$("[data-si]", ov).forEach(i => i.oninput = () => { d.touched = true; d.spots[+i.dataset.si][i.dataset.k] = i.value; if (i.dataset.k === "name") $("#ftgo", ov).disabled = !d.spots.some(x => x.name.trim()); });
  $$("[data-sdel]", ov).forEach(b => b.onclick = () => { d.touched = true; d.spots.splice(+b.dataset.sdel, 1); redraw(); });
  $$("[data-sadd]", ov).forEach(b => b.onclick = () => { const x = SPOTS.find(y => y[1] === b.dataset.sadd); d.touched = true; d.spots.push({ id: uid("sp"), icon: x[0], name: x[1], text: x[2], secret: "" }); redraw(); });
  $$("[data-splace]", ov).forEach(b => b.onclick = () => { const p = placeOf(s, b.dataset.splace); d.touched = true; d.spots.push({ id: uid("sp"), icon: "📍", name: p.name, text: p.summary || "", place: p.id, secret: p.secret || "" }); redraw(); });
  $$("[data-snew]", ov).forEach(b => b.onclick = () => { d.touched = true; d.spots.push({ id: uid("sp"), icon: "📍", name: "", text: "", secret: "" }); redraw(); setTimeout(() => { const l = $$('[data-k="name"]', ov).pop(); if (l) l.focus(); }); });
  $("#ftgo", ov).onclick = () => {
    const spots = d.spots.filter(x => x.name.trim()).map(x => ({ ...x, name: x.name.trim(), icon: (x.icon || "📍").trim() }));
    if (d.edit) editFree((ft, st) => { ft.spots = spots; ft.note = d.note; ft.place = d.place || null; const p = placeOf(st, d.place); ft.title = d.title.trim() || `Tiempo libre${p ? " en " + p.name : ""}`; });
    else { openFree({ place: d.place || null, title: d.title.trim(), note: d.note.trim(), spots }); toast("Tiempo libre abierto: los jugadores ya pueden elegir."); }
    ov.remove();
  };
}

/* ---------- Máster: contarle algo a un solo personaje ---------- */
export function openWhisper(charId) {
  const s = store.get(), c = s.characters.find(x => x.id === charId); if (!c) return;
  const ft = freeOf(s), p = pickOf(ft, c), sp = p && spotOf(ft, p.spot), prev = whispersFor(s, charId).filter(w => !ft || w.ft === ft.id);
  const ov = overlay("whdlg", `<div class="modalbox"><header><h3>🤫 Solo para ${esc(c.name)}</h3><button class="x" data-close aria-label="Cerrar">✕</button></header>
    ${p ? `<p class="note">${sp ? `${esc(sp.icon || "")} <b>${esc(sp.name)}</b>` : ""}${p.plan ? ` · «${esc(p.plan)}»` : ""}</p>` : ""}${sp && sp.secret ? `<p class="ftsec">🔒 ${esc(sp.secret)}</p>` : ""}
    ${prev.length ? `<div class="whlist">${prev.map(w => `<div class="whit"><b>${esc(w.title || "")}</b> ${esc(w.text)} <small>${ago(w.at)}</small><button class="ib" data-whdel="${w.id}" title="Borrar">✕</button></div>`).join("")}</div>` : ""}
    <label class="field">Título (opcional)<input id="whtit" placeholder="Lo que dice el bibliotecario" maxlength="80"></label>
    <label class="field">Lo que pasa o lo que descubre<textarea id="whtxt" rows="4" placeholder="Entre los legajos encuentras un plano del campanario con una puerta que no aparece en ningún otro sitio…"></textarea></label>
    <label class="chk"><input type="checkbox" id="whstar"> ⭐ Es un descubrimiento importante</label>
    <label class="chk"><input type="checkbox" id="whall"> 📣 Contarlo también al grupo (en la crónica)</label>
    <footer><span class="note">${c.owner ? `Solo lo leerán ${esc(first(c.name))} y los másteres.` : "Este personaje no tiene jugador: solo lo verán los másteres."}</span><span class="grow"></span><button class="btn gold" id="whgo">Enviar</button></footer></div>`);
  $("[data-close]", ov).onclick = () => ov.remove();
  $$("[data-whdel]", ov).forEach(b => b.onclick = () => { dropWhisper(b.dataset.whdel); ov.remove(); openWhisper(charId); });
  $("#whgo", ov).onclick = () => {
    const text = $("#whtxt", ov).value, title = $("#whtit", ov).value;
    if (!text.trim()) return toast("Escribe lo que pasa.");
    whisper(charId, { title, text, star: $("#whstar", ov).checked });
    const live = liveSession(store.get());
    if ($("#whall", ov).checked && live) addEntry(live.id, `${c.name}${sp ? ` (${sp.name})` : ""}: ${title ? title + ". " : ""}${text}`);
    toast(`Enviado solo a ${first(c.name)}.`); ov.remove();
  };
}

/* ---------- Registro ---------- */
function openLog() {
  const s = store.get(), log = s.freeLog || [], W = whispersFor(s);
  const ov = overlay("ftlogdlg", `<div class="modalbox ftbox"><header><h3>📜 Registro del tiempo libre</h3><button class="x" data-close aria-label="Cerrar">✕</button></header>
    ${log.map(e => `<details class="ftlog"><summary><b>${esc(e.title)}</b> <small>${esc(e.session || "")} · ${ago(e.at)}</small></summary>
      ${e.picks.map(p => { const ws = W.filter(w => w.ft === e.id && w.char === p.char);
        return `<div class="ftlrow"><b>${esc(p.name)}</b> ${p.spot ? `→ ${esc(p.spotName)}` : `<em>no decidió</em>`}${p.plan ? `<p class="ftplan">«${esc(p.plan)}»</p>` : ""}${ws.map(w => `<p class="whit">🤫 ${w.title ? `<b>${esc(w.title)}</b> ` : ""}${esc(w.text)}</p>`).join("")}</div>`; }).join("")}</details>`).join("") || `<p class="empty">Aún no hay ninguno cerrado.</p>`}</div>`);
  $("[data-close]", ov).onclick = () => ov.remove();
  const d = $("details.ftlog", ov); if (d) d.open = true;
}

/* ---------- La mesa (escenario de la Partida) ---------- */
export function freeStageHTML(s) {
  const ft = freeOf(s);
  if (!ft) return `<div class="pres empty-stage"><div class="body"><div class="eyebrow">TIEMPO LIBRE</div><h2>El tiempo libre ha terminado</h2></div></div>`;
  const dm = isDM(s), P = placeOf(s, ft.place);
  return `<div class="pres ftstage"><div class="ftinner"><div class="eyebrow">TIEMPO LIBRE${P ? " · " + esc(P.name.toUpperCase()) : ""}</div><h2>${esc(ft.title)}</h2>${ft.note ? `<p class="ftintro">${esc(ft.note)}</p>` : ""}
    ${dm ? overview(s, ft, true) : chooser(s, ft)}</div></div>`;
}
/** El jugador: para cada uno de sus personajes, a dónde va y qué quiere hacer; los compañeros, a dónde van. */
function chooser(s, ft) {
  const me = currentUser(s) || {}, mineC = partyChars(s).filter(c => c.owner === me.id), others = partyChars(s).filter(c => c.owner !== me.id);
  if (!mineC.length) return overviewPublic(s, ft);
  return mineC.map(c => { const p = pickOf(ft, c), cur = pick[c.id] || (p ? p.spot : null), ws = whispersFor(s, c.id).filter(w => w.ft === ft.id);
    return `<section class="ftme" data-ftc="${c.id}"><h3>${esc(c.name)}${p ? ` <small class="ok">✓ enviado</small>` : ""}</h3>
      <div class="ftcards">${ft.spots.map(sp => `<button class="ftcard ${cur === sp.id ? "on" : ""}" data-ftsp="${c.id}|${sp.id}"><i>${esc(sp.icon || "📍")}</i><b>${esc(sp.name)}</b>${sp.text ? `<small>${esc(sp.text)}</small>` : ""}
        <em>${others.filter(o => (pickOf(ft, o) || {}).spot === sp.id).map(o => esc(first(o.name))).join(", ")}</em></button>`).join("")}</div>
      <label class="field">¿Qué quieres hacer allí?<textarea data-ftplan="${c.id}" rows="2" placeholder="Pregunto por el herrero y escucho los rumores…">${esc(plans[c.id] ?? (p ? p.plan : ""))}</textarea></label>
      <div class="row"><button class="btn gold" data-ftsend="${c.id}" ${cur ? "" : "disabled"}>${p ? "Cambiar mi elección" : "Enviar al máster"}</button><span class="note">El máster te contará lo que pasa; si es solo para ti, nadie más lo leerá.</span></div>
      ${ws.length ? `<div class="whmine"><h4>🤫 Lo que sabes tú</h4>${ws.map(w => `<p class="whit">${w.title ? `<b>${esc(w.title)}</b> ` : ""}${esc(w.text)}</p>`).join("")}</div>` : ""}</section>`; }).join("");
}
function overviewPublic(s, ft) {
  const chars = partyChars(s);
  return `<div class="ftboard">${ft.spots.map(sp => `<div class="ftcol"><h4>${esc(sp.icon || "📍")} ${esc(sp.name)}</h4>${chars.filter(c => (pickOf(ft, c) || {}).spot === sp.id).map(c => `<div class="ftwho"><b>${esc(c.name)}</b></div>`).join("") || `<p class="empty">Nadie</p>`}</div>`).join("")}</div>`;
}
const pick = {}, plans = {};
export function bindFreeStage(root, redraw) {
  bindFreeDM(root);
  $$("[data-ftsp]", root).forEach(b => b.onclick = () => { const [c, sp] = b.dataset.ftsp.split("|"); pick[c] = sp; const t = $(`[data-ftplan="${c}"]`, root); if (t) plans[c] = t.value; redraw(); });
  $$("[data-ftplan]", root).forEach(t => t.oninput = () => { plans[t.dataset.ftplan] = t.value; });
  $$("[data-ftsend]", root).forEach(b => b.onclick = () => {
    const c = b.dataset.ftsend, s = store.get(), ft = freeOf(s), ch = s.characters.find(x => x.id === c), sp = pick[c] || (pickOf(ft, ch) || {}).spot;
    if (!sp) return toast("Elige un sitio.");
    choose(c, sp, plans[c] ?? (pickOf(ft, ch) || {}).plan ?? ""); delete pick[c]; delete plans[c];
    toast(`${first(ch.name)} va a ${spotOf(ft, sp).name}. El máster ya lo sabe.`);
  });
}

/* ---------- En la ficha del jugador ---------- */
/** Aviso de tiempo libre abierto (si no lo está mostrando la mesa) y lo que solo sabe este personaje. */
export function sheetFreeHTML(s, c) {
  const ft = freeOf(s), p = ft && pickOf(ft, c), sp = p && spotOf(ft, p.spot);
  const onStage = s.presentation && s.presentation.type === "freetime";
  const banner = ft && !onStage ? `<button class="ftbanner" data-ftopen>🕰 <b>${esc(ft.title)}</b><small>${sp ? `Vas a ${esc(sp.name)} · cambiar` : "Elige a dónde vas y qué haces"}</small></button>` : "";
  return banner;
}
export function whispersHTML(s, c, { limit = 0 } = {}) {
  let ws = whispersFor(s, c.id); if (!ws.length) return "";
  const n = ws.length; if (limit) ws = ws.slice(0, limit);
  return `<div class="whmine">${ws.map(w => `<div class="whit"><div>${w.star ? "⭐ " : ""}${w.title ? `<b>${esc(w.title)}</b> ` : ""}${esc(w.text)}</div><small>${esc(w.session || "")}${w.session ? " · " : ""}${ago(w.at)}</small>${mine(s, c) ? `<button class="btn small" data-wh2note="${w.id}" title="Copiarlo a tu cuaderno">📓</button>` : ""}</div>`).join("")}${limit && n > limit ? `<p class="note">y ${n - limit} más en la ficha completa</p>` : ""}</div>`;
}
export function bindSheetFree(root, c) {
  $$("[data-ftopen]", root).forEach(b => b.onclick = () => openChooser());
  $$("[data-wh2note]", root).forEach(b => b.onclick = () => { const w = (store.get().whispers || []).find(x => x.id === b.dataset.wh2note); if (w) { addNote(c.id, `${w.title ? w.title + ": " : ""}${w.text}`, !!w.star); toast("Copiado a tu cuaderno."); } });
}
/** El elector en una ventana (cuando la mesa enseña otra cosa). */
export function openChooser() {
  const ov = overlay("ftchoose", "");
  const draw = () => { const s = store.get(); if (!freeOf(s)) { ov.remove(); return; } ov.innerHTML = `<div class="modalbox ftbox"><header><h3>🕰 ${esc(freeOf(s).title)}</h3><button class="x" data-close aria-label="Cerrar">✕</button></header>${freeOf(s).note ? `<p class="ftintro">${esc(freeOf(s).note)}</p>` : ""}${chooser(s, freeOf(s))}</div>`;
    $("[data-close]", ov).onclick = () => { off(); ov.remove(); }; bindFreeStage(ov, draw); };
  const off = store.subscribe(() => { if (!document.body.contains(ov)) return off(); const a = document.activeElement; if (a && ov.contains(a) && a.tagName === "TEXTAREA") return; draw(); });
  draw();
}
