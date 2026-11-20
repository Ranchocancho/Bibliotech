// Copia de seguridad del mundo: un archivo .json con todo (lugares, lore, fichas, escenas, crónica, tiradas…)
// y las imágenes que usa. Restaurar sustituye el contenido del mundo abierto, pero conserva quién está dentro
// (miembros, másteres y partida en curso) para que nadie pierda el acceso.
import { store } from "./store.js";
import { getImage, putImage } from "./images.js";

const FORMAT = "la-mesa-copia";
const KEEP = ["users", "dms", "live", "version", "rev"]; // no se tocan al restaurar
const IMGFIELD = /^(img|image|imagen|portrait|retrato|map|mapa|backdrop|cover|art|bg|photo|pic|ilu)$/i;
const lsKey = () => { let id = "demo"; try { if (store.mode() === "cloud") id = localStorage.getItem("lamesa:cid") || "nube"; } catch (e) { /* sin almacenamiento */ } return "lamesa:copia:" + id; };

/** Claves de imagen que aparecen en el estado (campos con nombre de imagen y valor que no es una URL). */
export function imageKeys(state) {
  const out = new Set();
  const walk = (v, k) => {
    if (Array.isArray(v)) v.forEach(x => walk(x, k));
    else if (v && typeof v === "object") Object.entries(v).forEach(([kk, vv]) => walk(vv, kk));
    else if (typeof v === "string" && k && IMGFIELD.test(k) && v.length < 120 && !/^(https?:|data:|blob:)|\/|\.(png|jpe?g|webp|svg)$/i.test(v)) out.add(v);
  };
  walk(state, "");
  return [...out];
}

export async function exportBackup(onStep = () => {}) {
  const state = JSON.parse(JSON.stringify(store.get()));
  const keys = imageKeys(state), images = {};
  let i = 0;
  for (const k of keys) { onStep(`Imágenes ${++i}/${keys.length}`); const v = await getImage(k); if (v) images[k] = v; }
  const data = { format: FORMAT, v: 1, at: new Date().toISOString(), name: state.campaign.name, state, images };
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const a = document.createElement("a"), day = new Date().toISOString().slice(0, 10);
  a.href = URL.createObjectURL(blob);
  a.download = `${slug(state.campaign.name)}-${day}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  try { localStorage.setItem(lsKey(), String(Date.now())); } catch (e) { /* sin almacenamiento */ }
  return { size: blob.size, images: Object.keys(images).length, missing: keys.length - Object.keys(images).length };
}

/** Lee y comprueba un archivo de copia. Devuelve el resumen para confirmar antes de restaurar. */
export async function readBackup(file) {
  const txt = await file.text();
  let d; try { d = JSON.parse(txt); } catch (e) { throw new Error("El archivo no es una copia de La Mesa (no es JSON)."); }
  if (!d || d.format !== FORMAT || !d.state || !d.state.campaign || !Array.isArray(d.state.characters)) throw new Error("El archivo no es una copia de La Mesa.");
  const s = d.state;
  return { data: d, summary: { name: s.campaign.name, at: d.at, places: (s.world && s.world.places || []).length, lore: (s.lore || []).length, characters: s.characters.length, scenes: (s.scenes || []).length, sessions: (s.sessions || []).length, images: Object.keys(d.images || {}).length } };
}

export async function restoreBackup(d, onStep = () => {}) {
  const imgs = Object.entries(d.images || {});
  let i = 0;
  for (const [k, v] of imgs) { onStep(`Imágenes ${++i}/${imgs.length}`); await putImage(k, v); }
  const cur = store.get(), ids = new Set(cur.users.map(u => u.id));
  store.commit("restore", s => {
    Object.keys(s).forEach(k => { if (!KEEP.includes(k)) delete s[k]; });
    Object.entries(d.state).forEach(([k, v]) => { if (!KEEP.includes(k)) s[k] = v; });
    // Fichas de jugadores que no están en este mundo: quedan sin dueño para que el máster las asigne
    (s.characters || []).forEach(c => { if (c.owner && !ids.has(c.owner)) c.owner = null; });
    (s.tokens || []).forEach(t => { if (t.owner && !ids.has(t.owner)) t.owner = null; });
  });
}

export function lastBackup() { try { return +localStorage.getItem(lsKey()) || 0; } catch (e) { return 0; } }
const slug = s => String(s || "mundo").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "mundo";
