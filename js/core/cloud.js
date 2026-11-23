// Conexión con Firebase: cuentas de Google, mundos y sincronización en tiempo real.
// (En Firestore la colección se llama "campaigns" por historia; cada documento es un mundo.)
//
// Cómo se guarda una campaña en Firestore (las reglas están en firestore.rules):
//   campaigns/{cid}                el mundo: nombre, dueño, másteres, miembros, sesiones, presentación, mapa, personajes
//   campaigns/{cid}/places/{id}    lugares del mapa (los jugadores solo reciben los visibles)
//   campaigns/{cid}/items/{id}     contenido de los lugares (los jugadores solo reciben lo revelado)
//   campaigns/{cid}/secrets/{id}   notas secretas del máster (solo el máster), de lugares y de entradas del lore
//   campaigns/{cid}/lore/{id}      Lore: personajes, facciones, eventos, galería, notas (los jugadores solo reciben lo revelado)
//   campaigns/{cid}/characters/{id} fichas de personaje (todos las leen; cada jugador edita la suya)
//   campaigns/{cid}/scenes/{id}    escenas tácticas preparadas (solo el máster)
//   campaigns/{cid}/board/live     la mesa táctica en directo
//   campaigns/{cid}/tokens/{id}    fichas sobre la mesa (cada jugador mueve la suya)
//   campaigns/{cid}/chronicle/{id} notas de la crónica (cada uno escribe las suyas)
//   campaigns/{cid}/rolls/{id}     tiradas de dados (cada uno las suyas; el máster las confirma)
//   campaigns/{cid}/images/{key}   imágenes troceadas en documentos de menos de 1 MB
//   campaigns/{cid}/presence/{uid} última señal de cada participante
//   campaigns/{cid}/whispers/{id}  lo que el máster cuenta a un solo jugador (lo leen él y los másteres)
import { firebaseConfig } from "./firebase-config.js";
import { store, useCloud } from "./store.js";
import { session } from "./session.js";
import { presence } from "./presence.js";
import { setImageBackend } from "./images.js";
import { seed } from "../data/seed.js";

const V = "10.12.2";
const BASE = `https://www.gstatic.com/firebasejs/${V}/`;
const COLORS = ["#79a85a", "#c97a3d", "#7d8fe0", "#e0d6b0", "#b4583a", "#8a9a4a", "#9b6bc4", "#4f9aa0"];

let fb, auth, db;
const unsubs = [];
const cache = { campaign: null, places: new Map(), items: new Map(), secrets: new Map(), characters: new Map(), scenes: new Map(), tokens: new Map(), chronicle: new Map(), rolls: new Map(), lore: new Map(), whispers: new Map(), board: null, got: new Set() };
let last = new Map();       // lo último sincronizado, para enviar solo lo que cambia
let beatTimer = null;

export const cloud = {
  status: "init",   // init | out | lobby | joining | loading | ready | error
  user: null,
  cid: null,
  campaigns: [],
  joinable: null,
  error: null,
  isEditor: false
};
const watchers = new Set();
export const onCloud = fn => watchers.add(fn);
const ping = () => watchers.forEach(fn => fn());

const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* ignorado */ } };
const urlCid = () => new URLSearchParams(location.search).get("c");
const clean = v => JSON.parse(JSON.stringify(v));
const initials = name => (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");

export async function initCloud() {
  const [a, au, fs] = await Promise.all([import(BASE + "firebase-app.js"), import(BASE + "firebase-auth.js"), import(BASE + "firebase-firestore.js")]);
  fb = { ...a, ...au, ...fs };
  const app = fb.initializeApp(firebaseConfig);
  auth = fb.getAuth(app);
  db = fb.getFirestore(app);
  useCloud(queuePush);
  setImageBackend({ put: putImageCloud, get: getImageCloud });
  fb.onAuthStateChanged(auth, async u => {
    cloud.user = u;
    if (!u) { stopCampaign(); session.clear(); cloud.status = "out"; ping(); return; }
    session.set(u.uid);
    const want = urlCid() || lsGet("lamesa:cid");
    if (want) await openCampaign(want);
    else await toLobby();
  });
}

export async function signIn() {
  try { await fb.signInWithPopup(auth, new fb.GoogleAuthProvider()); }
  catch (e) { cloud.error = e.code === "auth/popup-closed-by-user" ? null : "No se pudo entrar con Google. Revisa que el navegador permita ventanas emergentes."; ping(); }
}
export async function signOut() { stopCampaign(); lsSet("lamesa:cid", null); await fb.signOut(auth); }

/* ---------- Campañas ---------- */
export async function toLobby() {
  stopCampaign();
  lsSet("lamesa:cid", null);
  if (urlCid()) history.replaceState(null, "", location.pathname + location.hash);
  cloud.status = "lobby"; cloud.joinable = null; ping();
  try {
    const q = fb.query(fb.collection(db, "campaigns"), fb.where("memberIds", "array-contains", cloud.user.uid));
    const snap = await fb.getDocs(q);
    cloud.campaigns = snap.docs.map(d => { const x = d.data(), r = (x.members || {})[cloud.user.uid] || {}; return { id: d.id, name: x.name, role: r.role || "player", live: !!x.live }; });
  } catch (e) { cloud.campaigns = []; cloud.error = "No se pudieron cargar tus mundos."; }
  ping();
}

export async function openCampaign(cid) {
  stopCampaign();
  cloud.status = "loading"; cloud.error = null; ping();
  let snap;
  try { snap = await fb.getDoc(fb.doc(db, "campaigns", cid)); }
  catch (e) { cloud.error = "No se pudo abrir el mundo."; return toLobby(); }
  if (!snap.exists()) { cloud.error = "Ese mundo no existe o el enlace está mal copiado."; return toLobby(); }
  const data = snap.data();
  if (!(data.memberIds || []).includes(cloud.user.uid)) {
    cloud.status = "joining"; cloud.joinable = { cid, name: data.name }; ping(); return;
  }
  cloud.cid = cid;
  cloud.isEditor = data.owner === cloud.user.uid || (data.dms || []).includes(cloud.user.uid);
  lsSet("lamesa:cid", cid);
  const url = new URL(location.href); url.searchParams.set("c", cid); history.replaceState(null, "", url);
  listen(cid);
}

export async function joinCampaign() {
  const j = cloud.joinable; if (!j) return;
  const u = cloud.user;
  const me = { role: "player", name: u.displayName || "Jugador", initials: initials(u.displayName), color: COLORS[Math.floor(Math.random() * COLORS.length)], photo: u.photoURL || null };
  try {
    await fb.updateDoc(fb.doc(db, "campaigns", j.cid), { memberIds: fb.arrayUnion(u.uid), ["members." + u.uid]: me });
    await openCampaign(j.cid);
  } catch (e) { cloud.error = "No se pudo entrar en el mundo."; ping(); }
}

export async function createCampaign(name, withExample) {
  const u = cloud.user;
  const ref = fb.doc(fb.collection(db, "campaigns"));
  const s = seed();
  const me = { role: "admin", name: u.displayName || "Administrador", initials: initials(u.displayName), color: "#d6aa4e", photo: u.photoURL || null };
  s.campaign.name = name || "Nuevo mundo";
  s.users = [{ id: u.uid, ...me }];
  s.dms = []; s.live = null; s.presentation = null;
  s.characters = withExample ? s.characters.map(c => ({ ...c, owner: null })) : [];
  if (!withExample) { s.world.places = []; s.sessions = []; s.lore = []; s.clock = null; s.scenes = s.scenes.filter(x => !x.place); } // la biblioteca de escenas genéricas se queda
  const docs = docsOf(s, true);
  const batch = fb.writeBatch(db);
  batch.set(ref, { ...clean(docs.get("C")), owner: u.uid, memberIds: [u.uid], createdAt: Date.now() });
  for (const [k, v] of docs) if (k !== "C") batch.set(fb.doc(db, "campaigns", ref.id, ...k.split("/")), clean(v));
  await batch.commit();
  await openCampaign(ref.id);
}

/* ---------- Escucha en tiempo real ---------- */
function listen(cid) {
  const dm = cloud.isEditor;
  const col = n => fb.collection(db, "campaigns", cid, n);
  const need = dm ? ["campaign", "places", "items", "secrets", "characters", "board", "tokens", "scenes", "chronicle", "rolls", "lore", "whispers"] : ["campaign", "places", "items", "characters", "board", "tokens", "chronicle", "rolls", "lore", "whispers"];
  cache.got.clear();
  const done = k => { cache.got.add(k); if (need.every(n => cache.got.has(n))) refresh(); };
  const fail = e => { console.error(e); cloud.error = "Se perdió la conexión con la campaña. Recarga la página."; ping(); };
  unsubs.push(fb.onSnapshot(fb.doc(db, "campaigns", cid), d => { cache.campaign = d.data(); done("campaign"); }, fail));
  unsubs.push(fb.onSnapshot(dm ? col("places") : fb.query(col("places"), fb.where("visible", "==", true)), s => { cache.places = new Map(s.docs.map(d => [d.id, d.data()])); done("places"); }, fail));
  unsubs.push(fb.onSnapshot(dm ? col("items") : fb.query(col("items"), fb.where("revealed", "==", true)), s => { cache.items = new Map(s.docs.map(d => [d.id, d.data()])); done("items"); }, fail));
  unsubs.push(fb.onSnapshot(dm ? col("lore") : fb.query(col("lore"), fb.where("revealed", "==", true)), s => { cache.lore = new Map(s.docs.map(d => [d.id, d.data()])); done("lore"); }, fail));
  unsubs.push(fb.onSnapshot(col("characters"), s => { cache.characters = new Map(s.docs.map(d => [d.id, d.data()])); done("characters"); }, fail));
  unsubs.push(fb.onSnapshot(fb.doc(db, "campaigns", cid, "board", "live"), d => { cache.board = d.exists() ? d.data() : null; done("board"); }, fail));
  unsubs.push(fb.onSnapshot(col("rolls"), s => { cache.rolls = new Map(s.docs.map(d => [d.id, d.data()])); done("rolls"); }, fail));
  unsubs.push(fb.onSnapshot(col("chronicle"), s => { cache.chronicle = new Map(s.docs.map(d => [d.id, d.data()])); done("chronicle"); }, fail));
  unsubs.push(fb.onSnapshot(col("tokens"), s => { cache.tokens = new Map(s.docs.map(d => [d.id, d.data()])); done("tokens"); }, fail));
  // Susurros: el máster los recibe todos; cada jugador, solo los suyos (las reglas no le dejan leer otros)
  unsubs.push(fb.onSnapshot(dm ? col("whispers") : fb.query(col("whispers"), fb.where("to", "==", cloud.user.uid)), s => { cache.whispers = new Map(s.docs.map(d => [d.id, d.data()])); done("whispers"); }, fail));
  if (dm) unsubs.push(fb.onSnapshot(col("scenes"), s => { cache.scenes = new Map(s.docs.map(d => [d.id, d.data()])); done("scenes"); }, fail));
  if (dm) unsubs.push(fb.onSnapshot(col("secrets"), s => { cache.secrets = new Map(s.docs.map(d => [d.id, d.data()])); done("secrets"); }, fail));
  unsubs.push(fb.onSnapshot(col("presence"), s => { const m = {}; s.docs.forEach(d => (m[d.id] = d.data().t)); presence.feed(m); }, () => {}));
  const beat = () => fb.setDoc(fb.doc(db, "campaigns", cid, "presence", cloud.user.uid), { t: Date.now() }).catch(() => {});
  beat(); beatTimer = setInterval(beat, 25000);
}

function stopCampaign() {
  unsubs.splice(0).forEach(u => u());
  clearInterval(beatTimer); beatTimer = null;
  cache.campaign = null; cache.places.clear(); cache.items.clear(); cache.secrets.clear(); cache.characters.clear(); cache.scenes.clear(); cache.tokens.clear(); cache.chronicle.clear(); cache.rolls.clear(); cache.lore.clear(); cache.whispers.clear(); cache.board = null; cache.got.clear();
  last = new Map(); cloud.cid = null; cloud.isEditor = false;
}

function refresh() {
  const c = cache.campaign; if (!c) return;
  // Si el administrador te ha nombrado máster (o te lo ha quitado), se vuelve a abrir con los permisos nuevos.
  const ed = c.owner === cloud.user.uid || (c.dms || []).includes(cloud.user.uid);
  if (ed !== cloud.isEditor) { const cid = cloud.cid; setTimeout(() => openCampaign(cid)); return; }
  const strip = (o, ...keys) => { const r = { ...o }; keys.forEach(k => delete r[k]); return r; };
  const users = Object.entries(c.members || {}).map(([id, m]) => ({ id, ...m }))
    .sort((a, b) => (a.role === "dm" ? -1 : b.role === "dm" ? 1 : a.name.localeCompare(b.name)));
  const items = [...cache.items.entries()].map(([id, i]) => ({ id, ...i }));
  const places = [...cache.places.entries()].map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map(p => ({
      ...strip(p, "order"),
      secret: (cache.secrets.get(p.id) || {}).secret || "",
      items: items.filter(i => i.place === p.id).sort((a, b) => (a.order || 0) - (b.order || 0)).map(i => strip(i, "place", "order"))
    }));
  const prev = store.get();
  const state = {
    version: 2, rev: ((prev && prev.rev) || 0) + 1,
    campaign: { name: c.name, rules: c.rules || "D&D 2024" },
    dms: c.dms || [], live: c.live || null,
    users, characters: [...cache.characters.entries()].map(([id, x]) => ({ id, ...x })).sort((a, b) => (a.order || 0) - (b.order || 0)).map(x => strip(x, "order")),
    world: { map: c.map ? c.map.key : null, mapW: c.map ? c.map.w : null, mapH: c.map ? c.map.h : null, places,
      regions: (c.regions || []).map(r => ({ ...r, secret: (cache.secrets.get(r.id) || {}).secret || "" })) },
    sessions: c.sessions || [], presentation: c.presentation || null, clock: c.clock || null, backdrop: c.backdrop || null, bestiary: c.bestiary || {},
    loot: c.loot || null, shopAdj: +c.shopAdj || 0, freeLog: c.freeLog || [], showOdds: c.showOdds !== false,
    freeTime: c.freeTime ? { ...c.freeTime, spots: (c.freeTime.spots || []).map(x => ({ ...x, secret: (cache.secrets.get("ft-" + x.id) || {}).secret || "" })) } : null,
    whispers: [...cache.whispers.entries()].map(([id, x]) => ({ id, ...x })).sort((a, b) => a.at - b.at),
    lore: [...cache.lore.entries()].map(([id, x]) => ({ id, ...x, secret: (cache.secrets.get(id) || {}).secret || "" })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.at || 0) - (b.at || 0)),
    scenes: [...cache.scenes.entries()].map(([id, x]) => ({ id, ...x })).sort((a, b) => (a.order || 0) - (b.order || 0)).map(x => strip(x, "order")),
    rolls: [...cache.rolls.entries()].map(([id, x]) => ({ id, ...x })).sort((a, b) => a.at - b.at),
    chronicle: [...cache.chronicle.entries()].map(([id, x]) => ({ id, ...x })).sort((a, b) => a.at - b.at),
    board: cache.board, tokens: [...cache.tokens.entries()].map(([id, x]) => ({ id, ...x }))
  };
  last = new Map([...docsOf(state, cloud.isEditor)].map(([k, v]) => [k, JSON.stringify(v)]));
  const first = cloud.status !== "ready";
  cloud.status = "ready";
  store.replace(state, first ? "open" : "remote");
  if (first) ping();
}

/* ---------- Envío de cambios ---------- */
function docsOf(s, dm) {
  const out = new Map();
  const members = {};
  s.users.forEach(u => { const { id, ...m } = u; members[id] = m; });
  out.set("C", {
    name: s.campaign.name, rules: s.campaign.rules,
    dms: s.dms || [], live: s.live || null,
    sessions: s.sessions, presentation: s.presentation || null, clock: s.clock || null, backdrop: s.backdrop || null, bestiary: s.bestiary || {},
    loot: s.loot || null, shopAdj: +s.shopAdj || 0, freeLog: s.freeLog || [], showOdds: s.showOdds !== false,
    freeTime: s.freeTime ? { ...s.freeTime, spots: (s.freeTime.spots || []).map(({ secret, ...x }) => x) } : null,
    map: s.world.map ? { key: s.world.map, w: s.world.mapW, h: s.world.mapH } : null,
    regions: (s.world.regions || []).map(({ secret, ...r }) => r),
    members
  });
  s.characters.forEach((ch, i) => { const { id, ...rest } = ch; out.set("characters/" + id, { ...rest, order: i }); });
  (s.scenes || []).forEach((sc, i) => { const { id, ...rest } = sc; out.set("scenes/" + id, { ...rest, order: i }); });
  if (s.board) out.set("board/live", s.board);
  (s.chronicle || []).forEach(e => { const { id, ...rest } = e; out.set("chronicle/" + id, rest); });
  (s.rolls || []).forEach(e => { const { id, ...rest } = e; out.set("rolls/" + id, rest); });
  (s.tokens || []).forEach(t => { const { id, ...rest } = t; out.set("tokens/" + id, rest); });
  (s.whispers || []).forEach(w => { const { id, ...rest } = w; out.set("whispers/" + id, rest); });
  if (dm && s.freeTime) (s.freeTime.spots || []).forEach(x => out.set("secrets/ft-" + x.id, { secret: x.secret || "" }));
  if (dm) (s.world.regions || []).forEach(r => out.set("secrets/" + r.id, { secret: r.secret || "" }));
  (s.lore || []).forEach(e => { const { id, secret, ...rest } = e; out.set("lore/" + id, rest); if (dm) out.set("secrets/" + id, { secret: secret || "" }); });
  s.world.places.forEach((p, i) => {
    const { items, secret, id, ...rest } = p;
    out.set("places/" + id, { ...rest, order: i });
    if (dm) out.set("secrets/" + id, { secret: secret || "" });
    (items || []).forEach((it, j) => { const { id: iid, ...ir } = it; out.set("items/" + iid, { ...ir, place: id, order: j }); });
  });
  return out;
}

// Los cambios seguidos del mismo momento (publicar una tirada y completarla) salen juntos: así una tirada nueva
// de un jugador llega como una sola creación, que es lo que las reglas le permiten (no puede actualizarla después).
let queued = null;
function queuePush(state) {
  if (queued) { queued = state; return; }
  queued = state;
  queueMicrotask(() => { const st = queued; queued = null; push(st); });
}

function push(state) {
  if (!cloud.cid) return;
  const me = cloud.user.uid;
  const all = docsOf(state, true);
  // El administrador y los másteres guardan todo; un jugador solo puede tocar su propia ficha.
  const lb = last.get("board/live"), lastTurn = lb ? (o => JSON.stringify([o.turn, o.round, o.seq]))(JSON.parse(lb)) : "";
  const allowed = (k, v) => cloud.isEditor || ((k.startsWith("characters/") || k.startsWith("tokens/")) && v && v.owner === me) || (k.startsWith("chronicle/") && v && v.by === me) || (k.startsWith("rolls/") && v && v.who === me) || (k === "board/live" && lastTurn !== JSON.stringify([v.turn, v.round, v.seq]));
  const ref = k => k === "C" ? fb.doc(db, "campaigns", cloud.cid) : fb.doc(db, "campaigns", cloud.cid, ...k.split("/"));
  // Firestore admite 500 escrituras por lote: los cambios grandes (restaurar una copia) se parten en varios
  const ops = [], keys = [];
  for (const [k, v] of all) {
    const j = JSON.stringify(v);
    if (last.get(k) !== j && allowed(k, v)) { ops.push(b => b.set(ref(k), clean(v), k === "C" ? { merge: true } : {})); keys.push(k); }
  }
  for (const [k, j] of last) if (!all.has(k) && allowed(k, JSON.parse(j))) { ops.push(b => b.delete(ref(k))); keys.push(k); }
  last = new Map([...all].map(([k, v]) => [k, JSON.stringify(v)]));
  // Un jugador escribe pocos documentos: uno a uno, para que si el servidor rechaza un cambio en su ficha
  // (las reglas solo le dejan lo de la Partida, sus notas, sus propuestas y la subida de nivel) no arrastre el resto.
  if (!cloud.isEditor) {
    ops.forEach((op, i) => { const b = fb.writeBatch(db); op(b); b.commit().catch(e => {
      console.error(e);
      cloud.error = e.code === "permission-denied" && keys[i].startsWith("characters/")
        ? "El servidor no ha aceptado ese cambio en tu ficha: pídeselo al máster con «✎ Proponer un cambio»."
        : "No se pudo guardar el último cambio. Comprueba la conexión.";
      ping();
    }); });
    return;
  }
  for (let i = 0; i < ops.length; i += 450) {
    const batch = fb.writeBatch(db);
    ops.slice(i, i + 450).forEach(op => op(batch));
    batch.commit().catch(e => { console.error(e); cloud.error = "No se pudo guardar el último cambio. Comprueba la conexión."; ping(); });
  }
}

/* ---------- Imágenes en Firestore (troceadas) ---------- */
const CHUNK = 900000;
async function putImageCloud(key, dataURL) {
  const parts = [];
  for (let i = 0; i < dataURL.length; i += CHUNK) parts.push(dataURL.slice(i, i + CHUNK));
  const batch = fb.writeBatch(db);
  batch.set(fb.doc(db, "campaigns", cloud.cid, "images", key), { n: parts.length });
  parts.forEach((d, i) => batch.set(fb.doc(db, "campaigns", cloud.cid, "images", key, "c", String(i)), { d }));
  await batch.commit();
}
async function getImageCloud(key) {
  if (!cloud.cid) return null;
  const meta = await fb.getDoc(fb.doc(db, "campaigns", cloud.cid, "images", key));
  if (!meta.exists()) return null;
  const n = meta.data().n;
  const docs = await Promise.all(Array.from({ length: n }, (_, i) => fb.getDoc(fb.doc(db, "campaigns", cloud.cid, "images", key, "c", String(i)))));
  return docs.map(d => d.data().d).join("");
}

export const inviteLink = () => { const u = new URL(location.href); u.search = "?c=" + cloud.cid; u.hash = ""; return u.toString(); };
