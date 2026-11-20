// Inicio del mundo: la partida en curso, el «Anteriormente…», el grupo con sus papeles y las sesiones pasadas.
import { store } from "../core/store.js";
import { session, currentUser, isDM, isAdmin, ROLE } from "../core/session.js";
import { visibleLive, lastClosed, pastSessions, sessionName, nextNumber, startSession, show } from "../core/sesiones.js";
import { presence } from "../core/presence.js";
import { getImage } from "../core/images.js";
import { exampleMap } from "../data/worldmap.js";
import { $, $$, esc, avatar, toast, pickFile } from "../core/ui.js";
import { exportBackup, readBackup, restoreBackup, lastBackup } from "../core/copia.js";

let el = null, editing = null;

export function mount(root) {
  el = document.createElement("div");
  el.className = "page";
  root.appendChild(el);
  editing = null;
  draw();
  return { update: (s, label, remote) => { if (!(label === "recap" && !remote)) draw(); }, presence: drawParty, unmount() { el = null; } };
}

function draw() {
  if (!el) return;
  const state = store.get();
  const me = currentUser(state);
  if (!me) return drawWho(state);
  const dm = isDM(state);
  const live = visibleLive(state);
  const last = lastClosed(state);
  const past = pastSessions(state);
  const go = () => { location.hash = "partida"; };
  el.innerHTML = `<div class="wrap">
    <h1 class="title">${esc(state.campaign.name)}</h1>
    <p class="lead">${live ? `${esc(sessionName(live))} en curso.` : dm ? "No hay ninguna partida en curso. Cuando os sentéis a jugar, empieza una sesión." : "No hay ninguna partida en curso. Mientras tanto puedes repasar el mapa y lo que sabéis del mundo."}</p>
    <section class="livebox ${live ? "on" : ""}">
      ${live ? `<div><b>${esc(sessionName(live))}</b><span>${live.test ? "Solo la veis el administrador y los másteres" : "Todo el grupo está invitado"}</span></div>
        <a class="btn gold" href="#partida">${dm ? "Ir a la partida" : "Unirse a la partida"}</a>`
      : dm ? `<div><b>Sesión ${nextNumber(state)}</b><span>Al empezar, todos verán el «Anteriormente…».</span></div>
        <div class="row"><button class="btn gold" id="start">Empezar sesión</button><button class="btn" id="starttest">Sesión de pruebas</button></div>`
      : `<div><b>Sin partida</b><span>Te avisaremos aquí cuando el máster empiece.</span></div>`}
    </section>
    <div class="lobby">
      <section class="recap" id="recapbg">
        <div class="in">
          <h3>Anteriormente: ${esc(last ? last.title : "")}</h3>
          <p>${esc(last ? last.recap : "Todavía no hay sesiones anteriores.")}</p>
          <div class="row">${dm && last ? `<button class="btn" id="showrecap">Mostrarlo a todos</button>` : ""}<a class="btn" href="#mundo">Ver el mapa del mundo</a></div>
        </div>
      </section>
      <section class="panel">
        <h2 class="sec">El grupo</h2>
        <div class="party" id="party"></div>
        ${dm && store.mode() === "cloud" ? `<h2 class="sec" style="margin-top:20px">Invitar al grupo</h2>
          <p class="note" style="margin:0 0 10px">Envía este enlace. Cada uno entra con su cuenta de Google y queda dentro del mundo como jugador.</p>
          <div class="row"><input id="invite" readonly class="btn" style="flex:1;min-width:0;text-align:left;font-size:13px" aria-label="Enlace de invitación"><button class="btn gold small" id="copyinv">Copiar enlace</button></div>` : ""}
        ${dm && store.mode() === "local" ? `<p class="note" style="margin-top:16px">Modo demostración: abre esta página en otra pestaña y entra como un jugador para ver la sincronización.</p>
          <div class="row" style="margin-top:12px"><button class="btn small danger" id="reset">Restablecer el mundo de ejemplo</button></div>` : ""}
        ${dm ? `<h2 class="sec" style="margin-top:20px">Copia de seguridad</h2>
          <p class="note" style="margin:0 0 8px">Descarga todo el mundo en un archivo (lugares, lore, fichas, escenas, crónica e imágenes). Guárdalo en tu ordenador o en la nube. ${backupAge()}</p>
          <div class="row"><button class="btn gold small" id="bkdown">⬇ Descargar copia</button><button class="btn small" id="bkup">⬆ Restaurar una copia</button></div>
          <div id="bkbox"></div>` : ""}
      </section>
    </div>
    <section style="margin-top:24px"><h2 class="sec">Sesiones anteriores</h2>
      <div class="sessions">${past.map(x => editing === x.id ? `<div class="sess">
          <label class="field">Título<input id="etitle" value="${esc(x.title)}"></label>
          <label class="field" style="margin-top:8px">Resumen<textarea id="erecap" rows="5">${esc(x.recap)}</textarea></label>
          <div class="row" style="margin-top:8px"><button class="btn gold small" id="esave">Guardar</button><button class="btn small" id="ecancel">Cancelar</button></div></div>`
        : `<div class="sess"><div class="head"><b>Sesión ${x.n} · ${esc(x.title)}</b><small>${esc(x.date || "")}</small>${dm ? `<button class="btn small" data-edit="${x.id}">Editar</button>` : ""}</div><p>${esc(x.recap)}</p></div>`).join("") || `<p class="empty">Aún no habéis jugado ninguna sesión.</p>`}</div>
    </section>
  </div>`;
  drawParty();
  const bgURL = state.world.map ? null : exampleMap().url;
  if (bgURL) $("#recapbg").style.backgroundImage = `url('${bgURL}')`;
  else getImage(state.world.map).then(u => { const b = $("#recapbg"); if (b && u) b.style.backgroundImage = `url('${u}')`; });

  const on = (id, fn) => { const b = $("#" + id, el); if (b) b.onclick = fn; };
  on("start", () => { startSession(false); go(); });
  on("starttest", () => { startSession(true); go(); });
  on("showrecap", () => { show({ type: "recap" }); go(); });
  $$("[data-edit]", el).forEach(b => b.onclick = () => { editing = b.dataset.edit; draw(); });
  on("ecancel", () => { editing = null; draw(); });
  on("esave", () => {
    const id = editing, t = $("#etitle").value.trim(), r = $("#erecap").value;
    editing = null;
    store.commit("recap", s => { const x = s.sessions.find(y => y.id === id); if (x) { x.title = t; x.recap = r; } });
    toast("Sesión guardada"); draw();
  });
  const inv = $("#invite");
  if (inv) {
    import("../core/cloud.js").then(m => { inv.value = m.inviteLink(); });
    $("#copyinv").onclick = async () => {
      try { await navigator.clipboard.writeText(inv.value); toast("Enlace copiado"); }
      catch (e) { inv.select(); toast("Selecciona el enlace y cópialo"); }
    };
  }
  on("bkdown", async () => {
    const b = $("#bkdown", el); b.disabled = true;
    try { const r = await exportBackup(t => { b.textContent = "⬇ " + t; }); toast(`Copia descargada (${(r.size / 1048576).toLocaleString("es-ES", { maximumFractionDigits: 1 })} MB, ${r.images} imágenes)${r.missing ? ` · ${r.missing} imágenes no se encontraron` : ""}`); }
    catch (e) { console.error(e); toast("No se pudo hacer la copia."); }
    draw();
  });
  on("bkup", async () => {
    const f = await pickFile(".json,application/json"); if (!f) return;
    const box = $("#bkbox", el);
    try {
      const { data, summary: m } = await readBackup(f);
      box.innerHTML = `<div class="bkconfirm"><p><b>${esc(m.name)}</b> · copia del ${esc(new Date(m.at).toLocaleString("es-ES"))}<br>${m.places} lugares · ${m.lore} entradas de lore · ${m.characters} fichas · ${m.scenes} escenas · ${m.sessions} sesiones · ${m.images} imágenes</p>
        <p class="warn">Sustituye todo el contenido de «${esc(store.get().campaign.name)}» por el de la copia. Los miembros y másteres se quedan como están; las fichas de jugadores que no estén en este mundo quedan sin dueño. Descarga antes una copia de lo actual si dudas.</p>
        <div class="row"><button class="btn small danger" id="bkok">Restaurar ahora</button><button class="btn small" id="bkno">Cancelar</button></div></div>`;
      $("#bkno", box).onclick = () => { box.innerHTML = ""; };
      $("#bkok", box).onclick = async () => {
        const ok = $("#bkok", box); ok.disabled = true;
        try { await restoreBackup(data, t => { ok.textContent = t; }); toast("Copia restaurada"); }
        catch (e) { console.error(e); toast("No se pudo restaurar la copia."); }
        draw();
      };
    } catch (e) { box.innerHTML = `<p class="warn">${esc(e.message)}</p>`; }
  });
  const rs = $("#reset");
  if (rs) rs.onclick = () => { if (rs.dataset.sure) { store.reset(); toast("Mundo de ejemplo restablecido"); } else { rs.dataset.sure = "1"; rs.textContent = "Pulsa otra vez para confirmar"; } };
}

function backupAge() {
  const t = lastBackup(); if (!t) return "Aún no has descargado ninguna copia desde este navegador.";
  const d = Math.floor((Date.now() - t) / 86400000);
  return d < 1 ? "Última copia: hoy." : d === 1 ? "Última copia: ayer." : `Última copia: hace ${d} días.${d > 14 ? " Conviene hacer otra." : ""}`;
}

function drawParty() {
  const box = el && $("#party", el);
  if (!box) return;
  const state = store.get();
  const dm = isDM(state), admin = isAdmin(state) && dm;
  const players = state.users.filter(u => u.role === "player");
  const rows = state.users.map(u => {
    const ch = state.characters.find(c => c.owner === u.id);
    const role = admin && u.role !== "admin"
      ? `<select class="btn small" data-role="${u.id}" aria-label="Papel de ${esc(u.name)}"><option value="player" ${u.role === "player" ? "selected" : ""}>Jugador</option><option value="dm" ${u.role === "dm" ? "selected" : ""}>Máster</option></select>`
      : `<span>${esc(ROLE[u.role] || "Jugador")}</span>`;
    return `<div class="pc">${avatar(ch && u.role === "player" ? ch : u, 44)}<div><b>${esc(u.name)}</b><span>${ch ? `${esc(ch.name)} · ${esc(ch.cls)} ${ch.level}` : u.role === "player" ? "Sin personaje asignado" : esc(ROLE[u.role])}</span></div><div class="pcend">${role}${status(u.id)}</div></div>`;
  });
  let assign = "";
  if (dm && state.characters.length && players.length) {
    assign = `<h2 class="sec" style="margin-top:18px">Personajes</h2>
      <p class="note" style="margin:0 0 8px">Asigna cada personaje a su jugador. Las fichas están en <a href="#personajes" style="color:var(--oro)">Personajes</a>.</p>
      ${state.characters.map(c => `<label class="pc">${avatar(c, 44)}<div><b>${esc(c.name)}</b><span>${esc(c.cls)} ${c.level}</span></div>
        <select class="btn small" data-char="${c.id}" aria-label="Jugador de ${esc(c.name)}"><option value="">Sin jugador</option>${players.map(p => `<option value="${p.id}" ${c.owner === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>`).join("")}`;
  }
  box.innerHTML = rows.join("") + (players.length || !dm ? "" : `<p class="empty">Aún no se ha unido ningún jugador. Mándales el enlace de invitación.</p>`) + assign;
  $$("[data-role]", box).forEach(sel => sel.onchange = () => store.commit("place", s => {
    const u = s.users.find(x => x.id === sel.dataset.role); u.role = sel.value;
    s.dms = s.users.filter(x => x.role === "dm").map(x => x.id);
    toast(sel.value === "dm" ? `${u.name} ahora es máster` : `${u.name} ahora es jugador`);
  }));
  $$("[data-char]", box).forEach(sel => sel.onchange = () => store.commit("place", s => {
    const c = s.characters.find(x => x.id === sel.dataset.char); c.owner = sel.value || null;
    s.users.forEach(u => { if (u.character === c.id) delete u.character; });
    const u = s.users.find(x => x.id === sel.value); if (u) u.character = c.id;
  }));
}

const status = id => presence.online(id) ? `<span class="on">● conectado</span>` : `<span class="off">○ fuera</span>`;

function drawWho(state) {
  el.innerHTML = `<div class="wrap">
    <h1 class="title">¿Quién eres?</h1>
    <p class="lead">Modo demostración: elige con quién entras en esta pestaña. El máster ve y controla todo; cada jugador ve lo que el máster le revela.</p>
    <div class="who">
      ${state.users.map(u => {
        const c = state.characters.find(x => x.owner === u.id);
        return `<button class="whoc ${u.role !== "player" ? "dmc" : ""}" data-id="${u.id}">${avatar(c || u)}<b>${esc(c ? c.name : u.name)}</b><span>${u.role !== "player" ? ROLE[u.role] : `${esc(u.name)} · ${esc(c.cls)} ${c.level}`}</span></button>`;
      }).join("")}
    </div>
    <p class="note">Con la versión en la nube cada uno entra con su cuenta de Google y no hay que elegir.</p>
  </div>`;
  $$(".whoc", el).forEach(b => b.onclick = () => {
    session.set(b.dataset.id);
    window.dispatchEvent(new Event("lamesa:login"));
  });
}
