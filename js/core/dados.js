// Dados: expresiones como "1d20+5", "2d6+3", "4d6kh3"; ventaja/desventaja y críticos.
// Cada tirada se guarda en el registro compartido (state.rolls): todos la ven, el máster la confirma, modifica o anula.
import { store, uid } from "./store.js";
import { currentUser, isDM } from "./session.js";

export const rnd = sides => 1 + Math.floor(Math.random() * sides);
// Juego de dados de este jugador (se guarda en su navegador y viaja con cada tirada)
export const mySkin = () => { try { return localStorage.getItem("lamesa:dados") || "rubi"; } catch (e) { return "rubi"; } };
export const diceAnim = () => { try { return localStorage.getItem("lamesa:anim") || "full"; } catch (e) { return "full"; } };
export const setDiceAnim = v => { try { localStorage.setItem("lamesa:anim", v); } catch (e) { /* */ } };
export const setMySkin = k => { try { localStorage.setItem("lamesa:dados", k); } catch (e) { /* */ } };

/** Interpreta "2d6+1d4+3" → [{n,d,kh?,kl?}|{k:num}] */
export function parse(expr) {
  const parts = [];
  const s = String(expr || "").toLowerCase().replace(/\s+/g, "").replace(/−/g, "-");
  const re = /([+-]?)(\d*)d(\d+)(k[hl]\d+)?|([+-]?)(\d+)/g;
  let m;
  while ((m = re.exec(s))) {
    if (m[3]) {
      const sign = m[1] === "-" ? -1 : 1, n = +(m[2] || 1), d = +m[3];
      const t = { n: Math.min(n, 50), d, sign };
      if (m[4]) t[m[4][1] === "h" ? "kh" : "kl"] = +m[4].slice(2);
      parts.push(t);
    } else if (m[6]) parts.push({ k: (m[5] === "-" ? -1 : 1) * +m[6] });
  }
  return parts;
}

/**
 * Tira una expresión. opts: { adv: 1|-1|0 (ventaja/desventaja en el primer d20), crit: true (duplica los dados) }
 * Devuelve { total, dice: [{d, v, drop?}], mod, nat (d20 natural si lo hay) }
 */
export function roll(expr, opts = {}) {
  const parts = parse(expr), dice = [];
  let total = 0, mod = 0, nat = null, firstD20 = true;
  for (const p of parts) {
    if (p.k != null) { total += p.k; mod += p.k; continue; }
    let n = p.n * (opts.crit ? 2 : 1);
    if (p.d === 20 && n === 1 && firstD20 && opts.adv) {
      const a = rnd(20), b = rnd(20), keep = opts.adv > 0 ? Math.max(a, b) : Math.min(a, b), other = keep === a ? b : a;
      dice.push({ d: 20, v: keep }, { d: 20, v: other, drop: true });
      total += p.sign * keep; nat = keep; firstD20 = false; continue;
    }
    const vals = Array.from({ length: n }, () => rnd(p.d));
    let kept = vals.map((v, i) => i);
    if (p.kh || p.kl) kept = [...kept].sort((i, j) => p.kh ? vals[j] - vals[i] : vals[i] - vals[j]).slice(0, p.kh || p.kl);
    vals.forEach((v, i) => { const keep = kept.includes(i); dice.push({ d: p.d, v, ...(keep ? {} : { drop: true }) }); if (keep) total += p.sign * v; });
    if (p.d === 20 && firstD20 && n === 1) { nat = vals[0]; firstD20 = false; }
  }
  return { total, dice, mod, nat };
}

export const ABBR = { fue: "FUE", des: "DES", con: "CON", int: "INT", sab: "SAB", car: "CAR" };
const sgn = n => (n >= 0 ? "+" : "") + n;
export const withMod = (base, m) => base + (m ? sgn(+m) : "");

/**
 * Hace una tirada y la publica en el registro.
 * r: { label, expr, kind: "attack"|"damage"|"check"|"save"|"init"|"free", adv, crit, target (id ficha), ac, by (id ficha que tira), secret, link (id de la tirada de ataque) }
 */
export function publish(r) {
  const s = store.get(), me = currentUser(s);
  const out = roll(r.expr, { adv: r.adv, crit: r.crit });
  const e = {
    id: uid("tir"), at: Date.now(), who: me ? me.id : null, whoName: me ? me.name : "", label: r.label || r.expr, expr: r.expr,
    kind: r.kind || "free", char: r.char || null, dc: r.dc ?? null, seq: s.board && s.board.combat === "live" ? s.board.seq || 0 : null, adv: r.adv || 0, crit: !!r.crit, tok: r.by || null, target: r.target || null, link: r.link || null,
    dice: out.dice, total: out.total, nat: out.nat, secret: !!r.secret, status: "pending", dmg: r.dmg || null, dtype: r.dtype || null, ac: r.ac ?? null, why: r.why || null, cov: r.cov || null, auto: r.auto || null, skin: r.skin || mySkin(), throw: r.throw || null, mas: r.mas || null, wname: r.wname || null, cleaveOf: r.cleaveOf || null
  };
  if (e.kind === "attack" && r.ac != null) e.result = out.nat === 20 ? "crit" : out.nat === 1 ? "miss" : out.total >= r.ac ? (r.auto ? "crit" : "hit") : "miss";
  if (r.dc != null && (e.kind === "check" || e.kind === "save")) e.result = out.total >= r.dc ? "save" : "fail";
  // Las tiradas sin consecuencias (pruebas libres) no necesitan confirmación
  if (e.kind === "free" || e.kind === "check" || e.kind === "init" || r.link && e.kind === "save") e.status = "ok";
  if (isDM(s) && e.kind !== "damage") e.status = "ok"; // lo que tira el propio máster no necesita su confirmación (el daño sí: se aplica)
  store.commit("roll", st => { st.rolls = st.rolls || []; st.rolls.push(e); if (st.rolls.length > 120) st.rolls.splice(0, st.rolls.length - 120); });
  return e;
}

export const RESULT = { hit: "Impacto", miss: "Fallo", crit: "¡Crítico!" };
/** Color de cada juego de dados (para pintar las cajetillas sin cargar el 3D). */
export const SKIN_HEX = { rubi: "#a3122a", zafiro: "#1c46b8", esmeralda: "#0f7a45", amatista: "#6a2bb0", obsidiana: "#161418", oro: "#c99a2e", hueso: "#e8dcc0", madera: "#8a5a2e" };
