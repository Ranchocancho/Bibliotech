// Apuntar como en Baldur's Gate 3, pero con las reglas del SRD 5.2.1:
//  - al elegir arma o conjuro, la mesa enseña su alcance (normal y largo) y a quién puedes elegir;
//  - sobre cada objetivo, la probabilidad de impactar (d20 + ataque contra su CA, con ventaja o desventaja
//    y la cobertura), el daño posible y por qué hay ventaja o desventaja;
//  - si el objetivo está fuera de tu alcance cuerpo a cuerpo pero llegas andando, «te acercas y atacas»;
//  - las áreas de los conjuros se colocan con una plantilla que sigue al cursor y marca a quién alcanza.
import { inRange, cover, modifiers, gap, dist, eco, phase, hasCond } from "./turnos.js";
import { acOf, attacksOf } from "./combate.js";
import { reachMap } from "./movimiento.js";

/** Probabilidad (0–1) de impactar: 20 natural siempre acierta, 1 natural siempre falla. extra = dados que suman (+1d4…). */
export function hitChance(bonus, ac, adv = 0, extra = []) {
  // reparto del modificador extra (p. ej. Bendición +1d4 o Perdición −1d4)
  let dist0 = new Map([[0, 1]]);
  for (const d of extra) { const n = new Map(); dist0.forEach((p, v) => { for (let i = 1; i <= Math.abs(d); i++) { const k = v + Math.sign(d) * i; n.set(k, (n.get(k) || 0) + p / Math.abs(d)); } }); dist0 = n; }
  let p1 = 0;
  dist0.forEach((p, v) => { let hits = 0; for (let r = 1; r <= 20; r++) if (r === 20 || (r !== 1 && r + bonus + v >= ac)) hits++; p1 += p * hits / 20; });
  return adv > 0 ? 1 - (1 - p1) ** 2 : adv < 0 ? p1 ** 2 : p1;
}
/** Daño mínimo y máximo de una expresión como «1d8+3+1d6». */
export function dmgRange(expr) {
  let lo = 0, hi = 0;
  String(expr || "").replace(/\s/g, "").replace(/([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/g, (m, s1, n, f, s2, k) => {
    if (f) { const c = +(n || 1), sg = s1 === "-" ? -1 : 1; lo += sg * c; hi += sg * c * +f; } else if (k) { const sg = s2 === "-" ? -1 : 1; lo += sg * +k; hi += sg * +k; }
    return m;
  });
  return [Math.max(0, lo), Math.max(0, hi)];
}
const isMelee = rng => !rng.ranged || !!rng.melee;

/** Cómo sería atacar a t con el arma w. */
export function attackPreview(s, a, w, t, { approach = true } = {}) {
  const rng = w.rng || { n: 1.5, l: 1.5 };
  let st = inRange(rng, a, t), from = a, appr = null;
  // BG3: si no llegas pero puedes acercarte andando (sin correr), te acercas y atacas
  if (st === "out" && approach && isMelee(rng) && phase(s) === "live" && s.board.turn === a.id) {
    const R = reachMap(s, a, {});
    if (R) { let best = null; R.cells.forEach((x, k) => { if (!x.cost || x.occ || x.dash) return; const [c, r] = k.split(",").map(Number), p = { ...a, c, r };
      if (inRange({ ...rng, l: rng.n }, p, t) === "ok" && (!best || x.cost < best.cost)) best = { c, r, cost: x.cost }; });
      if (best) { appr = best; from = { ...a, c: best.c, r: best.r }; st = "ok"; } }
  }
  if (st === "out") return { state: "out", far: Math.round(gap(a, t) * 15) / 10 };
  const cov = cover(s, from, t);
  if (cov.level === "total") return { state: "cover", cov: cov.txt };
  const mods = modifiers(s, from, t, rng);
  const ex = (a.conds || []).find(c => c.id === "agotamiento"), exn = ex ? 2 * (+ex.lvl || 1) : 0;
  const extra = [...(hasCond(a, "bendecido") ? [4] : []), ...(hasCond(a, "perdicion") ? [-4] : [])];
  const ac = acOf(s, t) + (cov.bonus || 0);
  const pct = Math.round(hitChance(w.atk - exn, ac, mods.net, extra) * 100);
  return { state: st, pct, adv: mods.net, why: [...mods.adv.map(x => "▲ " + x), ...mods.dis.map(x => "▼ " + x)], cov: cov.txt || "", dmg: dmgRange(w.expr), crit: mods.autoCrit, approach: appr };
}

/** Lo que enseña la mesa al apuntar con un arma: alcance y, por cada criatura, cómo sería atacarla. */
export function weaponTargeting(s, a, i, visible = () => true) {
  const w = attacksOf(s, a)[i]; if (!w) return null;
  const rng = w.rng || { n: 1.5, l: 1.5 };
  const targets = s.tokens.filter(t => t.id !== a.id && visible(t)).map(t => ({ id: t.id, ally: (t.kind === "pc") === (a.kind === "pc"), ...attackPreview(s, a, w, t) }));
  return { kind: "atk", from: a.id, label: w.name, rng: { n: rng.n / 1.5, l: rng.l / 1.5, melee: isMelee(rng) }, targets };
}

/** Casillas de una plantilla de área del SRD. origin: casilla del lanzador; aim: casilla apuntada.
 *  Esfera, cilindro y emanación: radio (contado como la cuadrícula). Cono: anchura = distancia al origen.
 *  Línea: 1,5 m de ancho salvo que diga otra cosa. Cubo: centrado en la casilla apuntada. */
export function templateCells(g, origin, aim, area) {
  const out = new Set(), N = Math.max(1, Math.round(area.size / 1.5)), sh = area.shape;
  const inG = (c, r) => c >= 0 && r >= 0 && c < g.cols && r < g.rows, add = (c, r) => inG(c, r) && out.add(c + "," + r);
  if (/esfera|cilindro/.test(sh)) { for (let r = aim.r - N; r <= aim.r + N; r++) for (let c = aim.c - N; c <= aim.c + N; c++) add(c, r); }
  else if (/emanación/.test(sh)) { for (let r = origin.r - N; r <= origin.r + N; r++) for (let c = origin.c - N; c <= origin.c + N; c++) if (c !== origin.c || r !== origin.r) add(c, r); }
  else if (/cubo/.test(sh)) { const o = Math.floor((N - 1) / 2); for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) add(aim.c - o + c, aim.r - o + r); }
  else { // cono o línea: desde el lanzador hacia la casilla apuntada
    let dx = aim.c - origin.c, dy = aim.r - origin.r; const L = Math.hypot(dx, dy); if (!L) return out; dx /= L; dy /= L;
    const W = /línea/.test(sh) ? Math.max(1, Math.round((area.w || 1.5) / 1.5)) : 0;
    for (let r = origin.r - N - 1; r <= origin.r + N + 1; r++) for (let c = origin.c - N - 1; c <= origin.c + N + 1; c++) {
      const ox = c - origin.c, oy = r - origin.r, t = ox * dx + oy * dy, p = Math.abs(ox * dy - oy * dx);
      if (t <= 0.25 || t > N + 0.3) continue;
      if (W ? p <= W / 2 + 0.05 : p <= t / 2 + 0.3) add(c, r);
    }
  }
  return out;
}
/** Criaturas dentro de la plantilla. */
export const tokensIn = (s, cells, skip = null) => s.tokens.filter(t => t.id !== skip && !t.hidden && cells.has(t.c + "," + t.r)).map(t => t.id);

/** ¿Se puede colocar el área ahí? (el punto de origen tiene que estar a su alcance) */
export function templateOk(s, caster, aim, area, rng) {
  if (/cono|línea|emanación/.test(area.shape) || !rng || rng.self) return true;
  return Math.max(Math.abs(aim.c - caster.c), Math.abs(aim.r - caster.r)) * 1.5 <= (rng.n || 0) + 0.01;
}
export { dist, eco };
