// Dificultad de un encuentro según el SRD 5.2.1 («Crear un encuentro de combate»): cada personaje aporta
// el presupuesto de PX de su nivel (tabla «Presupuesto de PX por personaje») y se compara con la suma de los
// PX de los monstruos. Sin multiplicadores (reglas de 2024). Con niveles distintos se suma personaje a personaje.
import { xpOf } from "./experiencia.js";

/** Presupuesto de PX por personaje: [baja, moderada, alta] según su nivel. */
export const BUDGET = {
  1: [50, 75, 100], 2: [100, 150, 200], 3: [150, 225, 400], 4: [250, 375, 500], 5: [500, 750, 1100],
  6: [600, 1000, 1400], 7: [750, 1300, 1700], 8: [1000, 1700, 2100], 9: [1300, 2000, 2600], 10: [1600, 2300, 3100],
  11: [1900, 2900, 4100], 12: [2200, 3700, 4700], 13: [2600, 4200, 5400], 14: [2900, 4900, 6200], 15: [3300, 5400, 7800],
  16: [3800, 6100, 9800], 17: [4500, 7200, 11700], 18: [5000, 8700, 14200], 19: [5500, 10700, 17200], 20: [6400, 13200, 22000]
};
const fmt = n => n.toLocaleString("es-ES");

/** El grupo: los personajes que hay en la mesa; si no hay ninguno, todos los de la campaña. */
export function partyOf(s, tokens = s.tokens) {
  const onBoard = (tokens || []).filter(t => t.kind === "pc" && t.char).map(t => s.characters.find(c => c.id === t.char)).filter(Boolean);
  return onBoard.length ? onBoard : s.characters.filter(c => !c.archived);
}
/**
 * Dificultad de unas criaturas para un grupo. Cuenta las vivas (y las ocultas: también pelearán).
 * Devuelve { xp, low, mod, high, n, lvls, k: "trivial"|"baja"|"moderada"|"alta"|"mortal", label }
 */
export function difficulty(s, foes, party = partyOf(s)) {
  const xp = foes.filter(t => t.kind === "foe" && (t.hp == null || +t.hp > 0)).reduce((a, t) => a + xpOf(t), 0);
  const sum = i => party.reduce((a, c) => a + BUDGET[Math.max(1, Math.min(20, +c.level || 1))][i], 0);
  const low = sum(0), mod = sum(1), high = sum(2);
  const k = !xp ? "nada" : xp < low * 0.75 ? "trivial" : xp <= low ? "baja" : xp <= mod ? "moderada" : xp <= high ? "alta" : "mortal";
  const LBL = { nada: "Sin enemigos", trivial: "Muy fácil", baja: "Baja", moderada: "Moderada", alta: "Alta", mortal: "Por encima de alta" };
  const lv = [...new Set(party.map(c => c.level))].sort((a, b) => a - b);
  return { xp, low, mod, high, n: party.length, lvls: lv, k, label: LBL[k] };
}
/** Explicación corta para el máster (lo que dice el SRD de cada categoría). */
export const HINT = {
  nada: "Añade criaturas para ver la dificultad.",
  trivial: "Muy por debajo del presupuesto de dificultad baja: apenas gastarán recursos.",
  baja: "Uno o dos momentos de apuro, pero deberían salir sin bajas.",
  moderada: "Sin curación ni recursos, algún personaje podría caer.",
  alta: "Puede ser letal para uno o más personajes: necesitarán buena estrategia y algo de suerte.",
  mortal: "Supera el presupuesto de dificultad alta: puede acabar con el grupo. Úsalo a propósito."
};
/** Ficha compacta con barra: dónde cae el encuentro entre baja, moderada y alta. */
export function difficultyHTML(d, opts = {}) {
  const max = Math.max(d.high * 1.25, d.xp, 1), pct = v => Math.min(100, v / max * 100);
  const who = `${d.n} personaje${d.n === 1 ? "" : "s"} de nivel ${d.lvls.join("/") || "—"}`;
  return `<div class="diff k-${d.k}" title="${HINT[d.k]}">
    <div class="diff-h"><b>⚖️ ${d.label}</b><span>${fmt(d.xp)} PX · ${who}</span></div>
    ${opts.bar === false ? "" : `<div class="diff-bar"><i style="width:${pct(d.xp)}%"></i><em style="left:${pct(d.low)}%" title="Baja: ${fmt(d.low)}"></em><em style="left:${pct(d.mod)}%" title="Moderada: ${fmt(d.mod)}"></em><em style="left:${pct(d.high)}%" title="Alta: ${fmt(d.high)}"></em></div>
    <div class="diff-l"><span>Baja ${fmt(d.low)}</span><span>Moderada ${fmt(d.mod)}</span><span>Alta ${fmt(d.high)}</span></div>`}
    ${opts.hint === false ? "" : `<small>${HINT[d.k]}</small>`}</div>`;
}
