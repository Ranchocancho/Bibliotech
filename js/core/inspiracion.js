// Inspiración heroica (SRD 5.2.1, «Cómo jugar» y glosario): el máster la concede (los humanos la obtienen al
// terminar un descanso largo). Quien la tiene puede gastarla para volver a tirar un dado justo después de lanzarlo
// y debe usar el nuevo resultado. Con ventaja o desventaja solo se repite uno de los dos d20.
import { store } from "./store.js";
import { isDM, currentUser } from "./session.js";
import { charOf } from "./mesa.js";
import { rnd } from "./dados.js";
import { toast } from "./ui.js";

const KINDS = ["attack", "check", "save", "free", "damage", "init"];
const FRESH = 3 * 60 * 1000; // «inmediatamente después»: unos minutos de margen para decidirlo en la mesa

/** Personaje de quien hizo la tirada (el de la ficha que tiró, si es suya; si no, su personaje). */
export function rollerChar(s, r) {
  const t = r.tok && (s.tokens || []).find(x => x.id === r.tok), c = t && charOf(s, t);
  if (c && c.owner === r.who) return c;
  return s.characters.find(x => x.owner && x.owner === r.who) || null;
}
/** ¿Puede esta persona gastar la inspiración en esta tirada ahora? */
export function canInspire(s, r) {
  const me = currentUser(s);
  if (!me || !r || r.who !== me.id || r.insp || r.status === "void" || !KINDS.includes(r.kind) || r.applied != null || r.total == null) return false;
  if (Date.now() - (r.at || 0) > FRESH) return false;
  if (r.kind === "attack" && r.status === "pending") return false; // el jugador aún no ve el resultado: primero lo confirma el máster
  if (r.kind === "attack" && (s.rolls || []).some(x => x.link === r.id && x.kind === "damage" && x.status !== "void")) return false;
  if (r.kind === "init" && s.board && s.board.combat === "live") return false;
  const c = rollerChar(s, r);
  return !!(c && c.inspiration);
}

/** Gasta la inspiración: vuelve a tirar el dado que más conviene (el d20 de la prueba; en el daño, el más bajo). */
export function useInspiration(rollId) {
  const s = store.get(), r0 = (s.rolls || []).find(x => x.id === rollId);
  if (!canInspire(s, r0)) return;
  const cId = rollerChar(s, r0).id;
  let msg = "";
  store.commit("roll", st => {
    const r = st.rolls.find(x => x.id === rollId); if (!r) return;
    const dice = r.dice || [], d20 = dice.map((d, i) => [d, i]).filter(([d]) => d.d === 20);
    let i, old, nv;
    if (d20.length && r.kind !== "damage") {
      // Con ventaja o desventaja: se repite el más bajo de los dos (es el que interesa cambiar)
      const pairI = d20.length >= 2 && r.adv ? d20.slice(0, 2) : [d20.find(([d]) => !d.drop) || d20[0]];
      [, i] = pairI.reduce((m, x) => x[0].v < m[0].v ? x : m);
      old = dice[i].v; nv = rnd(20); dice[i] = { d: 20, v: nv };
      const prevKept = (pairI.find(([d]) => !d.drop) || pairI[0])[0].v;
      let kept = nv;
      if (pairI.length === 2) {
        const [[a, ia], [b, ib]] = pairI.map(([, k]) => [dice[k], k]);
        kept = r.adv > 0 ? Math.max(a.v, b.v) : Math.min(a.v, b.v);
        const keepI = (r.adv > 0 ? a.v >= b.v : a.v <= b.v) ? ia : ib;
        [ia, ib].forEach(k => { if (k === keepI) delete dice[k].drop; else dice[k].drop = true; });
      }
      r.total += kept - prevKept; r.nat = kept;
    } else {
      const live = dice.map((d, k) => [d, k]).filter(([d]) => !d.drop); if (!live.length) return;
      [, i] = live.reduce((m, x) => x[0].v / x[0].d < m[0].v / m[0].d ? x : m);
      old = dice[i].v; nv = rnd(dice[i].d); dice[i] = { d: dice[i].d, v: nv };
      r.total += nv - old;
    }
    if (r.kind === "attack" && r.ac != null) r.result = r.nat === 20 ? "crit" : r.nat === 1 ? "miss" : r.total >= r.ac ? (r.auto ? "crit" : "hit") : "miss";
    if (r.dc != null && (r.kind === "check" || r.kind === "save")) r.result = r.total >= r.dc ? "save" : "fail";
    r.insp = { d: dice[i].d, from: old, to: nv };
    r.why = [...(r.why || []), `✨ Inspiración heroica: d${dice[i].d} ${old} → ${nv}`];
    msg = `✨ Inspiración heroica: ${old} → ${nv} · total ${r.total}`;
    if (r.kind === "init" && r.tok) { const t = st.tokens.find(x => x.id === r.tok); if (t) t.init = r.total; }
  });
  store.commit("char", st => { const c = st.characters.find(x => x.id === cId); if (c) c.inspiration = false; });
  if (msg) toast(msg);
}

/** El máster la concede o la retira. Si ya la tenía, la regla dice que puede cedérsela a otro que no la tenga. */
export function setInspiration(charId, on) {
  const s = store.get(); if (!isDM(s)) return;
  const c = s.characters.find(x => x.id === charId); if (!c) return;
  store.commit("char", st => { const x = st.characters.find(y => y.id === charId); if (x) x.inspiration = !!on; });
  toast(on ? `✨ ${c.name} recibe inspiración heroica` : `${c.name} ya no tiene inspiración heroica`);
}
/** Ceder: quien ya la tiene se la pasa a otro personaje jugador que no la tenga (lo hace el máster). */
export function giveInspiration(fromId, toId) {
  const s = store.get(); if (!isDM(s)) return;
  store.commit("char", st => { const a = st.characters.find(x => x.id === fromId), b = st.characters.find(x => x.id === toId); if (a && b && !b.inspiration) { a.inspiration = false; b.inspiration = true; } });
}
