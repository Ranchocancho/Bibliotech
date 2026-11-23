// Tiempo libre en un lugar: el máster abre unos sitios (taberna, mercado, biblioteca, catacumbas…), cada jugador
// elige a dónde va su personaje y qué quiere hacer, y el máster le cuenta lo que pasa, a veces en privado.
// Es una herramienta de mesa (regla de campaña): no añade mecánicas; las tiradas se piden como siempre.
//
// Dónde se guarda:
//   s.freeTime            el tiempo libre abierto (documento de la campaña; lo escribe el máster)
//   spot.secret           notas del máster de cada sitio (colección secrets: solo el máster)
//   c.ft                  la elección de cada personaje (en su ficha; la escribe su jugador)
//   s.whispers            lo que sabe solo un jugador (colección whispers: el máster y ese jugador)
//   s.freeLog             registro de los tiempos libres cerrados: quién fue a dónde y qué quería hacer
import { store, uid } from "./store.js";
import { isDM, currentUser } from "./session.js";
import { placeOf } from "./lore.js";
import { liveSession, sessionName } from "./sesiones.js";
import { toast } from "./ui.js";

/** Sitios de siempre en una ciudad, para añadirlos de un toque (el máster los cambia o crea otros). */
export const SPOTS = [
  ["🍺", "Taberna", "Bebida, música y rumores. Alguien siempre sabe algo."],
  ["🛒", "Mercado", "Puestos, regateo y mercancía de todas partes."],
  ["⚒️", "Herrería", "Reparar el equipo o encargar algo."],
  ["⛪", "Templo", "Rezar, pedir consejo o curación."],
  ["📚", "Biblioteca", "Libros, mapas y archivos antiguos."],
  ["🔮", "Torre de magos", "Saber arcano… a cambio de algo."],
  ["💀", "Catacumbas", "Lo que la ciudad esconde bajo tierra."],
  ["🏛️", "Gremio", "Contratos, permisos y contactos."],
  ["⚓", "Puerto", "Barcos, marineros y mercancía de contrabando."],
  ["👂", "Callejear", "Pasear, escuchar y ver qué se cuece."],
  ["🛏️", "Descansar", "Dormir en la posada y recuperarse."]
];

export const freeOf = s => (s.freeTime && s.freeTime.open ? s.freeTime : null);
export const spotOf = (ft, id) => ((ft && ft.spots) || []).find(x => x.id === id) || null;
/** Personajes del grupo (con jugador o sobre la mesa). */
export const partyChars = s => s.characters.filter(c => c.owner || (s.tokens || []).some(t => t.kind === "pc" && t.char === c.id));
/** Lo que eligió cada personaje en este tiempo libre. */
export const pickOf = (ft, c) => ft && c.ft && c.ft.id === ft.id ? c.ft : null;
/** Lo que este usuario puede leer de lo que se ha susurrado (el máster, todo). */
export const whispersFor = (s, charId = null) => (s.whispers || []).filter(w => (isDM(s) || w.to === (currentUser(s) || {}).id) && (!charId || w.char === charId)).sort((a, b) => b.at - a.at);

/** Sitios propuestos al abrir: taberna y mercado (si no hay ya uno así dentro) y los lugares que hay dentro. */
export function suggestSpots(s, placeId) {
  const kids = s.world.places.filter(p => p.parent === placeId);
  const fromPlaces = kids.map(p => ({ id: uid("sp"), icon: "📍", name: p.name, text: p.summary || "", place: p.id, secret: p.secret || "" }));
  const base = SPOTS.slice(0, 2).filter(([, n]) => !kids.some(p => p.name.toLowerCase().includes(n.toLowerCase()))).map(([icon, name, text]) => ({ id: uid("sp"), icon, name, text, secret: "" }));
  return [...base, ...fromPlaces];
}

/** El máster abre el tiempo libre (y lo muestra en la mesa). */
export function openFree({ place, title, note, spots, show = true }) {
  if (!isDM(store.get())) return;
  store.commit("freetime", s => {
    const p = placeOf(s, place);
    s.freeTime = { id: uid("ft"), place: place || null, title: title || `Tiempo libre${p ? " en " + p.name : ""}`, note: note || "", open: true, at: Date.now(), spots: spots.filter(x => x.name && x.name.trim()) };
    if (show) s.presentation = { type: "freetime" };
  });
}
export function editFree(fn) { if (isDM(store.get())) store.commit("freetime", s => { if (s.freeTime) fn(s.freeTime, s); }); }

/** El jugador elige a dónde va su personaje y qué quiere hacer (se guarda en su ficha). */
export function choose(charId, spot, plan) {
  const s = store.get(), ft = freeOf(s); if (!ft) return;
  store.commit("char", st => { const c = st.characters.find(x => x.id === charId); if (!c) return; c.ft = { id: ft.id, spot, plan: (plan || "").trim().slice(0, 600), at: Date.now() }; });
}

/** El máster le cuenta algo a un personaje: solo lo leen su jugador y los másteres. */
export function whisper(charId, { title = "", text, spot = null, star = false }) {
  const s = store.get(); if (!isDM(s) || !text || !text.trim()) return null;
  const c = s.characters.find(x => x.id === charId); if (!c) return null;
  const ft = freeOf(s), live = liveSession(s), me = currentUser(s) || {};
  const w = { id: uid("su"), at: Date.now(), to: c.owner || null, char: c.id, charName: c.name, by: me.name || "El máster", title: title.trim(), text: text.trim(), star: !!star,
    ft: ft ? ft.id : null, spot: spot || (ft && pickOf(ft, c) ? pickOf(ft, c).spot : null), place: ft ? ft.place : null, session: live ? sessionName(live) : "" };
  store.commit("whisper", st => { st.whispers = st.whispers || []; st.whispers.push(w); });
  return w;
}
export const dropWhisper = id => { if (isDM(store.get())) store.commit("whisper", s => { s.whispers = (s.whispers || []).filter(w => w.id !== id); }); };

/** Cierra el tiempo libre: queda en el registro quién fue a dónde y qué quería hacer. */
export function closeFree() {
  const s0 = store.get(); if (!isDM(s0) || !s0.freeTime) return;
  store.commit("freetime", s => {
    const ft = s.freeTime;
    const picks = partyChars(s).map(c => { const p = pickOf(ft, c), sp = p && spotOf(ft, p.spot); return { char: c.id, name: c.name, spot: p ? p.spot : null, spotName: sp ? `${sp.icon || ""} ${sp.name}`.trim() : "", plan: p ? p.plan : "" }; });
    const live = liveSession(s);
    s.freeLog = s.freeLog || [];
    s.freeLog.unshift({ id: ft.id, place: ft.place, title: ft.title, at: ft.at, closed: Date.now(), session: live ? sessionName(live) : "", spots: ft.spots.map(({ secret, ...x }) => x), picks });
    s.freeTime = null;
    if (s.presentation && s.presentation.type === "freetime") s.presentation = null;
  });
  toast("Tiempo libre cerrado: queda en el registro.");
}

/** Avisos: al jugador, cuando el máster le cuenta algo o abre un tiempo libre; al máster, cuando alguien elige. */
export function watchFree() {
  let seenW = null, seenFt = null, seenPicks = null;
  store.subscribe(() => {
    const s = store.get(), dm = isDM(s), me = currentUser(s); if (!me) return;
    const ws = whispersFor(s).filter(w => dm ? false : w.to === me.id).map(w => w.id);
    if (seenW === null) seenW = new Set(ws);
    else ws.forEach(id => { if (seenW.has(id)) return; seenW.add(id); const w = s.whispers.find(x => x.id === id); toast(`🤫 Solo para ${w.charName.split(" ")[0]}: ${w.title || w.text.slice(0, 60)}${w.title ? "" : "…"} (en su ficha)`); });
    const ft = freeOf(s);
    if (seenFt === null) seenFt = ft ? ft.id : "";
    else if (ft && ft.id !== seenFt) { seenFt = ft.id; if (!dm) toast(`🕰 ${ft.title}: elige a dónde va tu personaje.`); }
    if (dm && ft) {
      const now = partyChars(s).map(c => pickOf(ft, c)).filter(Boolean).map(p => p.at).join(",");
      if (seenPicks !== null && now !== seenPicks && now.length > seenPicks.length) toast("🕰 Un jugador ha elegido qué hace en su tiempo libre.");
      seenPicks = now;
    }
  });
}
