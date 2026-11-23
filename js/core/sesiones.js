// Sesiones de juego: se abren cuando os sentáis a jugar y se cierran con un resumen.
// No hay campañas: la historia del mundo continúa de una sesión a la siguiente.
// Una "sesión de pruebas" solo la ven el administrador y los másteres.
import { store, uid } from "./store.js";
import { isEditor, isDM, currentUser } from "./session.js";

export const liveSession = s => s.sessions.find(x => x.id === s.live && x.status === "open") || null;
export const lastClosed = s => [...s.sessions].reverse().find(x => x.status === "closed" && !x.test) || null;
export const pastSessions = s => s.sessions.filter(x => x.status === "closed" && !x.test).sort((a, b) => b.n - a.n);
export const nextNumber = s => Math.max(0, ...s.sessions.filter(x => !x.test && x.n).map(x => x.n)) + 1;
/** La sesión abierta, si este usuario puede verla (las de prueba quedan ocultas a los jugadores). */
export const visibleLive = s => { const l = liveSession(s); return l && (!l.test || isEditor(s)) ? l : null; };
export const sessionName = x => x.test ? "Sesión de pruebas" : `Sesión ${x.n}`;

/** Lo que el máster está mostrando, si este usuario debe verlo. */
export function presentationFor(s) {
  const p = s.presentation; if (!p) return null;
  const l = liveSession(s);
  if (l && l.test && !isEditor(s)) return null;
  if (p.to && !isDM(s) && (currentUser(s) || {}).id !== p.to) return null; // mostrado solo a otro jugador
  return p;
}

export function presentationTitle(s, p) {
  if (!p) return "";
  if (p.type === "recap") return "Anteriormente…";
  if (p.type === "world") return "Mapa del mundo";
  if (p.type === "tactical") return "Escena táctica";
  if (p.type === "freetime") return (s.freeTime && s.freeTime.title) || "Tiempo libre";
  if (p.type === "region") return ((s.world.regions || []).find(r => r.id === p.region) || {}).name || "Una región";
  if (p.type === "lore") return (p.snap && p.snap.title) || "";
  if (p.type === "timeline") return "Cronología · " + ((p.snap && p.snap.title) || "");
  const place = s.world.places.find(x => x.id === p.place);
  if (!place) return "";
  if (p.type === "item") { const it = place.items.find(i => i.id === p.item); return it ? it.title : place.name; }
  return place.name;
}

export function startSession(test) {
  store.commit("session", s => {
    const id = uid("ses");
    s.sessions.push({ id, n: test ? null : nextNumber(s), title: "", recap: "", status: "open", test: !!test, date: new Date().toISOString().slice(0, 10) });
    s.live = id;
    s.presentation = lastClosed(s) ? { type: "recap" } : { type: "world" };
  });
}

/** Añade una nota a la crónica de una sesión. */
export function addEntry(sessionId, text) {
  const me = currentUser(store.get());
  if (!me || !text.trim()) return;
  store.commit("chronicle", s => { s.chronicle = s.chronicle || []; s.chronicle.push({ id: uid("cr"), session: sessionId, by: me.id, name: me.name, text: text.trim(), at: Date.now() }); });
}

/** Cierra la sesión: resumen para el «Anteriormente…» y experiencia repartida (xp: [{char, amount, reason}]). */
export function closeSession(title, recap, xp = []) {
  store.commit("session", s => {
    const l = liveSession(s);
    if (l && l.test) s.sessions = s.sessions.filter(x => x.id !== l.id);
    else if (l) {
      Object.assign(l, { status: "closed", title: title || `Sesión ${l.n}`, recap });
      l.xp = xp.filter(x => x.amount).map(x => { const c = s.characters.find(y => y.id === x.char); if (c) c.xp = (c.xp || 0) + x.amount; return { char: x.char, name: c ? c.name : "", amount: x.amount, reason: x.reason || "" }; });
    }
    s.live = null; s.presentation = null;
  });
}

export const show = p => store.commit("present", s => {
  if (p && (p.type === "place" || p.type === "item")) {
    const place = s.world.places.find(x => x.id === p.place);
    if (place) { place.visible = true; if (p.type === "item") { const it = place.items.find(i => i.id === p.item); if (it) it.revealed = true; } }
  }
  s.presentation = p;
});

/* ---------- Sesiones terminadas: corregir o borrar ---------- */
export const editSession = (id, patch) => store.commit("session", s => { const x = s.sessions.find(y => y.id === id); if (x) Object.assign(x, patch); });
/** Cambia los PX de una línea del reparto y ajusta la ficha del personaje en la diferencia. */
export const editXP = (id, i, amount, reason) => store.commit("session", s => {
  const x = s.sessions.find(y => y.id === id); if (!x || !x.xp || !x.xp[i]) return;
  const line = x.xp[i], delta = (amount || 0) - (line.amount || 0);
  const c = line.char && s.characters.find(y => y.id === line.char); if (c && delta) c.xp = Math.max(0, (c.xp || 0) + delta);
  line.amount = amount || 0; if (reason != null) line.reason = reason;
});
/** Borra una sesión cerrada con sus notas de crónica. Con undoXP, resta a cada personaje los PX que le dio. */
export const deleteSession = (id, undoXP) => store.commit("session", s => {
  const x = s.sessions.find(y => y.id === id); if (!x) return;
  if (undoXP) (x.xp || []).forEach(l => { const c = l.char && s.characters.find(y => y.id === l.char); if (c) c.xp = Math.max(0, (c.xp || 0) - (l.amount || 0)); });
  s.sessions = s.sessions.filter(y => y.id !== id);
  s.chronicle = (s.chronicle || []).filter(e => e.session !== id);
  (s.lore || []).forEach(e => { if (e.session === id) e.session = null; });
});
