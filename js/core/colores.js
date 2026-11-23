// Colores de la mesa: cada jugador elige los suyos (se guardan en su navegador).
// Movimiento (andando y corriendo), camino, alcance del arma o conjuro, objetivos y áreas de efecto.
const K = "lamesa:colores";
export const COLOR_KEYS = [
  ["walk", "Movimiento", "Hasta dónde llegas andando"],
  ["dash", "Correr", "Lo que alcanzas gastando tu acción en Correr"],
  ["path", "Camino", "La ruta que sigue tu figura"],
  ["range", "Alcance", "Hasta dónde llega tu arma o conjuro"],
  ["long", "Alcance largo", "Con desventaja"],
  ["target", "Objetivo válido", "Criaturas que puedes elegir"],
  ["area", "Área de efecto", "Plantilla de conjuros y acciones de área"]
];
export const DEFAULT_COLORS = { walk: "#2fc8ff", dash: "#b47cff", path: "#ffd166", range: "#ff9f1c", long: "#ffcf70", target: "#ff4d4d", area: "#ff6a00", strength: 1 };
const subs = new Set();
let cur = load();
function load() { try { return { ...DEFAULT_COLORS, ...JSON.parse(localStorage.getItem(K) || "{}") }; } catch (e) { return { ...DEFAULT_COLORS }; } }
export const colors = () => cur;
export function setColor(k, v) { cur = { ...cur, [k]: v }; save(); }
export function resetColors() { cur = { ...DEFAULT_COLORS }; save(); }
function save() { try { localStorage.setItem(K, JSON.stringify(cur)); } catch (e) { /* */ } apply(); subs.forEach(f => { try { f(cur); } catch (e) { console.warn(e); } }); }
export const onColors = f => { subs.add(f); return () => subs.delete(f); };
/** Alfa según la intensidad elegida (0,5 suave … 1,6 muy intenso). */
export const alpha = a => Math.max(0.02, Math.min(0.95, a * (+cur.strength || 1)));
export const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${alpha(a).toFixed(3)})`; };
/** Variables CSS para el plano 2D. */
export function apply() {
  const r = document.documentElement.style, c = cur;
  r.setProperty("--c-walk", rgba(c.walk, 0.34)); r.setProperty("--c-walk-b", rgba(c.walk, 0.75));
  r.setProperty("--c-dash", rgba(c.dash, 0.26)); r.setProperty("--c-dash-b", rgba(c.dash, 0.65));
  r.setProperty("--c-path", c.path); r.setProperty("--c-range", rgba(c.range, 0.14)); r.setProperty("--c-range-b", rgba(c.range, 0.95));
  r.setProperty("--c-long-b", rgba(c.long, 0.8)); r.setProperty("--c-target", c.target); r.setProperty("--c-area", rgba(c.area, 0.42)); r.setProperty("--c-area-b", rgba(c.area, 0.95));
}
apply();
