// Arranque: modo (nube o demostración), cabecera, navegación y aviso de lo que muestra el máster.
import { store, useLocal } from "./core/store.js";
import { pendingCount } from "./core/propuestas.js";
import { session, currentUser, realUser, isDM, isEditor, viewingAs, ROLE } from "./core/session.js";
import { visibleLive, sessionName, presentationFor, presentationTitle } from "./core/sesiones.js";
import { presence } from "./core/presence.js";
import { $, esc, avatar } from "./core/ui.js";
import * as inicio from "./views/inicio.js";
import * as partida from "./views/partida.js";
import * as mundo from "./views/mundo.js";
import * as personajes from "./views/personajes.js";
import * as escenas from "./views/escenas.js";
import * as cronica from "./views/cronica.js";
import * as reglas from "./views/reglas.js";
import { preload } from "./core/srd.js";
import { visibleRolls } from "./views/tiradas.js";
import * as lore from "./views/lore.js";
import { clockOf, clockShort } from "./core/lore.js";

const ROUTES = [
  { id: "inicio", label: "Inicio", view: inicio },
  { id: "partida", label: "Partida", view: partida },
  { id: "mundo", label: "Mapa", view: mundo },
  { id: "escenas", label: "Escenas", view: escenas, dmOnly: true },
  { id: "personajes", label: "Personajes", view: personajes },
  { id: "reglas", label: "Reglas", view: reglas },
  { id: "lore", label: "Lore", view: lore },
  { id: "cronica", label: "Crónica", view: cronica }
];

let current = null, mounted = null, cloudMod = null;
const demo = new URLSearchParams(location.search).has("demo");

function ready() {
  const s = store.get();
  if (!s) return false;
  if (store.mode() === "cloud") return cloudMod && cloudMod.cloud.status === "ready";
  return true;
}

function route() {
  const h = (location.hash || "").slice(1).split("/")[0];
  if (!currentUser(store.get())) return "inicio";
  return ROUTES.some(r => r.id === h) ? h : "inicio";
}

function topbar(state) {
  const me = currentUser(state), real = realUser(state), va = viewingAs(state);
  const r = route();
  const cloudMode = store.mode() === "cloud";
  const live = visibleLive(state);
  const players = state.users.filter(u => u.role === "player");
  return `<header class="top">
    <div class="brand"><b>La Mesa</b><span>${esc(state.campaign.name)} · ${live ? `${esc(sessionName(live))} en curso · ${esc(clockShort(clockOf(state)))}` : "sin partida"}${cloudMode ? "" : " · demostración"}</span></div>
    ${me ? `<nav class="nav" aria-label="Secciones">${ROUTES.filter(x => !x.dmOnly || isDM(state)).map(x => `<a href="#${x.id}" ${x.id === r ? 'aria-current="page"' : ""}>${x.label}${x.id === "partida" && live ? ` <i class="livedot" title="Partida en curso"></i>` : ""}${x.id === "personajes" && isDM(state) && pendingCount(state) ? ` <i class="pendot" title="Cambios de fichas por revisar">${pendingCount(state)}</i>` : ""}${x.soon ? ` <span class="soon">· hito ${x.soon}</span>` : ""}</a>`).join("")}</nav>
    <span class="sync" title="Conectados ahora"><i></i>${presence.count()} conectado${presence.count() === 1 ? "" : "s"}</span>
    ${isEditor(state) && players.length ? `<label class="viewas">Ver como<select id="viewas" class="btn small"><option value="">${esc(ROLE[real.role])}</option>${players.map(p => `<option value="${p.id}" ${va && va.id === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>` : ""}
    <div class="me">${avatar(real)}<div>${esc(real.name)}<small>${esc(ROLE[real.role] || "Jugador")}</small></div>
      ${cloudMode ? `<button class="btn small" id="campaigns">Mundos</button>` : `<button class="btn small" id="switchme">Cambiar</button>`}</div>` : ""}
  </header>
  ${va ? `<div class="viewbar">Estás viendo la app como <b>${esc(va.name)}</b>: ves exactamente lo que ve este jugador. <button class="btn small" id="unview">Volver a mi vista</button></div>` : ""}`;
}

function render() {
  if (!ready()) {
    mounted && mounted.unmount && mounted.unmount(); mounted = null; current = null;
    if (cloudMod) cloudMod.renderAccess($("#app"));
    notice();
    return;
  }
  const state = store.get();
  const r = route();
  if (r !== current || !mounted) {
    mounted && mounted.unmount && mounted.unmount();
    $("#app").innerHTML = `<div id="bar">${topbar(state)}</div><main id="main"></main>`;
    const def = ROUTES.find(x => x.id === r);
    mounted = def.view.mount($("#main"), { route: def });
    current = r;
  } else $("#bar").innerHTML = topbar(state);
  const sw = $("#switchme");
  if (sw) sw.onclick = () => { session.clear(); location.hash = "inicio"; current = null; render(); };
  const cp = $("#campaigns");
  if (cp) cp.onclick = () => cloudMod.toLobby();
  const vs = $("#viewas");
  if (vs) vs.onchange = () => setView(vs.value);
  const uv = $("#unview");
  if (uv) uv.onclick = () => setView(null);
  notice();
}

function setView(id) { session.setViewAs(id); current = null; render(); }

// Aviso flotante cuando el máster muestra algo y tú estás en otra sección.
let dismissed = null;
function notice() {
  const ov = $("#overlay");
  const state = store.get();
  const p = ready() ? presentationFor(state) : null;
  const key = JSON.stringify(p);
  if (!p || route() === "partida" || isDM(state) || dismissed === key) { ov.classList.remove("on"); ov.innerHTML = ""; return; }
  ov.innerHTML = `<div class="pill"><span>El máster os muestra <b>${esc(presentationTitle(state, p))}</b></span><a class="btn gold small" href="#partida">Ver</a><button class="btn small" id="pillx" aria-label="Cerrar aviso">✕</button></div>`;
  ov.classList.add("on");
  $("#pillx").onclick = () => { dismissed = key; notice(); };
}

store.subscribe((state, label, remote) => {
  const wasReady = !!mounted;
  render();
  if (wasReady && mounted && mounted.update) mounted.update(state, label, remote);
});
presence.subscribe(() => {
  const s = $(".sync"); if (s) { const n = presence.count(); s.innerHTML = `<i></i>${n} conectado${n === 1 ? "" : "s"}`; }
  if (mounted && mounted.presence) mounted.presence();
});
// Inicio del turno de una criatura (recarga, Regeneración, legendarias): si el turno lo pasó un jugador, lo aplica el máster
let creatureSeq = null;
store.subscribe(state => {
  const b = state.board; if (!b || b.combat !== "live" || !isDM(state) || b.seq === creatureSeq) return;
  const t = state.tokens.find(x => x.id === b.turn); if (!t || t.kind === "pc") return;
  creatureSeq = b.seq;
  if (t.ts !== b.seq) queueMicrotask(() => import("./core/criaturas.js").then(m => store.commit("token", st => { const k = st.tokens.find(x => x.id === t.id); if (k) m.onTurnStart(st, k); })));
});
// Cajetilla de dados: cada tirada nueva (que puedas ver) sube desde abajo, estés en la sección que estés
const rollSeen = new Set(); let rollBoot = false, diceCam = null;
store.subscribe(state => {
  if (!ready() || !currentUser(state)) return;
  const fresh = visibleRolls(state).filter(r => !rollSeen.has(r.id));
  fresh.forEach(r => rollSeen.add(r.id));
  const show = fresh.filter(r => r.dice && r.dice.length && (rollBoot || Date.now() - r.at < 6000));
  rollBoot = true;
  if (!show.length) return;
  (diceCam || (diceCam = import("./views/dicecam.js"))).then(m => show.forEach(r => m.showRoll(r, store.get())));
});
// Tapete de las tiradas que pide el máster (en cualquier pantalla)
import("./views/peticiones.js").then(m => m.watchRequests());
import("./core/tesoros.js").then(m => m.watchGifts());
import("./core/comercio.js").then(m => m.watchChests());
import("./core/tiempolibre.js").then(m => m.watchFree());
window.addEventListener("hashchange", render);
window.addEventListener("lamesa:login", () => { presence.beat(); current = null; render(); });

async function boot() {
  if (!demo) {
    try {
      const [c, a] = await Promise.all([import("./core/cloud.js"), import("./views/acceso.js")]);
      cloudMod = { ...c, renderAccess: a.renderAccess };
      c.onCloud(() => render());
      render();
      await c.initCloud();
      return;
    } catch (e) {
      console.error(e);
      cloudMod = null;
    }
  }
  useLocal();
  render();
  presence.beat();
}
boot();
preload();
