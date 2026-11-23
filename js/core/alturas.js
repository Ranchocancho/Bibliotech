// Alturas del mapa táctico (reglas del SRD 5.2.1).
//  - Cada casilla puede estar más alta o más baja que el suelo (tarimas, riscos, fosos, galerías), en pasos de 1,5 m.
//  - Distancias: se cuenta igual que en la cuadrícula (cada 1,5 m, en cualquier dirección, es una casilla),
//    así que la diferencia de altura cuenta como casillas: un enemigo 3 m más arriba está a 2 casillas.
//    Por eso el alcance cuerpo a cuerpo (1,5 m) no llega a quien está en lo alto de un risco de 3 m.
//  - Trepar (SRD «Trepar»): cada metro de subida o bajada cuesta 1 m más de movimiento (2 m más en terreno
//    difícil), salvo con velocidad trepando. Las escaleras y las rampas se andan sin trepar.
//  - Caer (SRD «Caídas»): 1d6 contundente por cada 3 m (máx. 20d6) y derribado. Saltar abajo lo decide quien
//    se mueve; la mesa le avisa del daño posible.
//  - Volar (velocidad volando): la figura puede ponerse a una altura sobre el suelo (alt, en metros).
//  - Línea de visión: la tapa el terreno más alto que la línea entre los ojos (1,5 m sobre el suelo) y el
//    objetivo. Lo de detrás de un risco no se ve desde abajo.
export const STEP = 1.5;
export const LEVELS = [-6, -4.5, -3, -1.5, 0, 1.5, 3, 4.5, 6, 7.5, 9, 12];
const key = (c, r) => c + "," + r;

export const elevAt = (g, c, r) => (g && g.elev ? +g.elev[key(c, r)] || 0 : 0);
export const altOf = t => (t && +t.alt) || 0;
/** Altura absoluta de una figura (suelo de su casilla + lo que vuela) o de una casilla. */
export const zOf = (g, p) => elevAt(g, p.c, p.r) + altOf(p);
export const hasElev = g => !!(g && g.elev && Object.values(g.elev).some(v => +v));
/** Distancia en casillas teniendo en cuenta la altura (como la cuadrícula: la mayor de las tres). */
export const dist3 = (g, a, b) => Math.max(Math.abs(a.c - b.c), Math.abs(a.r - b.r), Math.round(Math.abs(zOf(g, a) - zOf(g, b)) / STEP));
export const fmtM = m => (m > 0 ? "+" : m < 0 ? "−" : "") + Math.abs(m).toLocaleString("es-ES", { maximumFractionDigits: 1 }) + " m";
/** Casillas por las que se cambia de altura sin trepar: escaleras y rampas. */
export const isStairs = (g, c, r) => (g.props || []).some(p => p.c === c && p.r === r && (p.k === "escaleras" || p.k === "rampa"));

/** Coste extra de pasar de una casilla a otra por la altura (metros). Con velocidad trepando, nada. */
export function climbExtra(g, a, b, { dif = false, climber = false } = {}) {
  const dh = Math.abs(elevAt(g, b.c, b.r) - elevAt(g, a.c, a.r));
  if (!dh) return 0;
  if ((isStairs(g, a.c, a.r) || isStairs(g, b.c, b.r)) && dh <= STEP) return 0; // escalera o rampa: un tramo se anda
  if (climber) return 0;
  return dh * (dif ? 2 : 1);
}
/** Daño de una caída de h metros (SRD): 1d6 por cada 3 m, máximo 20d6. */
export const fallDice = h => Math.min(20, Math.floor(h / 3));

/** ¿Tapa el relieve la vista entre dos casillas? Ojos a 1,5 m sobre el suelo; objetivo a 1 m sobre su suelo. */
export function reliefBlocks(g, a, b, eyeA = STEP, eyeB = 1) {
  if (!g || !g.elev) return false;
  const za = elevAt(g, a.c, a.r) + eyeA + altOf(a), zb = elevAt(g, b.c, b.r) + eyeB + altOf(b);
  const dx = b.c - a.c, dy = b.r - a.r, n = Math.max(Math.abs(dx), Math.abs(dy)) * 3;
  for (let i = 1; i < n; i++) {
    const f = i / n, c = Math.round(a.c + dx * f), r = Math.round(a.r + dy * f);
    if ((c === a.c && r === a.r) || (c === b.c && r === b.r)) continue;
    if (elevAt(g, c, r) > za + (zb - za) * f + 0.01) return true;
  }
  return false;
}
