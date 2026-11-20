// Combate: ataques contra un objetivo, daño y la decisión del máster (confirmar, cambiar o anular).
import { store } from "./store.js";
import { isDM, currentUser } from "./session.js";
import { publish } from "./dados.js";
import { charOf } from "./mesa.js";
import { damage as hurt } from "./salud.js";
import { findSpell } from "./srd.js";
import { classInfo, prof } from "../data/dnd.js";
import { rangeOf, inRange, cover, modifiers, spend, dist, gap, hasCond, canActNow } from "./turnos.js";
import { toast } from "./ui.js";
import { kitOf, kitAttacks, gate, spendKit, condsIn, sizeOk } from "./criaturas.js";
import { masteryOf, onHit, onDamage } from "./maestria.js";

const num = s => { const m = String(s || "").match(/[+-−]?\s*\d+/); return m ? +m[0].replace(/\s|−/g, s => s === "−" ? "-" : "") : 0; };
/** "1d8+4 perforante" → { expr: "1d8+4", type: "perforante" } */
export function splitDamage(s) {
  const m = String(s || "").trim().match(/^([0-9d+\-−\s]+)(.*)$/i);
  return m ? { expr: m[1].replace(/\s/g, "").replace(/−/g, "-"), type: m[2].trim() } : { expr: "", type: String(s || "") };
}
export const nameOf = (s, t) => t ? (charOf(s, t) || t).name : "";
export const acOf = (s, t) => { const c = charOf(s, t); return c ? +c.ac : +t.ac || 10; };

/** Ataques disponibles para una ficha: armas del personaje o ataques del enemigo. */
export function attacksOf(s, t) {
  const c = charOf(s, t);
  // Criaturas del compendio: sus ataques reales del SRD (todos los daños, efectos al acertar); si no, los de su ficha
  const kit = !c && kitOf(t);
  if (kit) return kitAttacks(kit).map(w => ({ ...w, rng: rangeOf(w) }));
  const list = c ? (c.weapons || []) : (t.attacks || []);
  const out = list.filter(w => w.name || w.atk || w.dmg).map(w => {
    const rng = rangeOf(w), mas = c ? masteryOf(c, w) : null;
    return { name: w.name || "Ataque", atk: num(w.atk), ...splitDamage(w.dmg), rng, ...(mas ? { mas: { ...mas, melee: !rng.ranged || !!rng.melee } } : {}) };
  });
  // Conjuros preparados con tirada de ataque (del compendio): ataque = competencia + característica de lanzamiento
  if (c) {
    const ab = classInfo(c.cls).cast, bonus = ab ? prof(c.level) + Math.floor(((+c.abilities[ab] || 10) - 10) / 2) : 0;
    for (const s of (c.spells && c.spells.list) || []) {
      const d = s.prepared !== false && findSpell(s.name);
      // Los trucos de ataque van aquí (escalan con el nivel); los de nivel 1+ se lanzan desde «Conjuros», que gasta el espacio
      if (d && d.atk && d.dmg && !d.lvl) { const k = c.level >= 17 ? 4 : c.level >= 11 ? 3 : c.level >= 5 ? 2 : 1, [, n, die] = d.dmg.match(/(\d+)d(\d+)/) || [, 1, 8];
        out.push({ name: "✨ " + d.n, atk: bonus, expr: `${n * k}d${die}`, type: d.dt, spell: true, rng: rangeOf({ al: d.al }) }); }
    }
  }
  return out;
}

/** Ataque según las reglas: alcance, cobertura y ventaja/desventaja automáticas (el jugador puede forzar una). */
export function attack(attackerId, targetId, weapon, force = null, use = "act", opt = {}) {
  const s = store.get(), a = s.tokens.find(t => t.id === attackerId), t = s.tokens.find(x => x.id === targetId);
  if (!a || !t) return null;
  // opt.free: ya lo ha permitido quien llama (acción legendaria, reacción o conjuro de una criatura)
  if (!opt.free && !canActNow(s, a.id, use)) { toast(`No es el turno de ${nameOf(s, a)}: fuera de su turno solo puede usar reacciones.`); return null; }
  { const me = currentUser(s); if (!isDM(s) && !(a.owner && me && a.owner === me.id)) { toast("Solo puedes atacar con tu propio personaje."); return null; } }
  const rng = weapon.rng || { n: 1.5, l: 1.5 }, reach = inRange(rng, a, t), cov = cover(s, a, t), mods = modifiers(s, a, t, rng);
  if (reach === "out") { toast(`${t.name || "El objetivo"} está a ${(gap(a, t) * 1.5).toLocaleString("es-ES")} m: fuera del alcance de ${weapon.name} (${rng.l} m)`); return null; }
  if (cov.level === "total") { toast("Cobertura total: no tienes línea hasta el objetivo"); return null; }
  const adv = force != null ? force : mods.net;
  const why = [...mods.adv.map(x => "ventaja: " + x), ...mods.dis.map(x => "desventaja: " + x)];
  if (force != null && force !== mods.net) why.push(force ? `${force > 0 ? "ventaja" : "desventaja"} elegida a mano` : "sin ventaja ni desventaja (elegido a mano)");
  const kitA = kitOf(a);
  if (kitA && use) { const why2 = gate(s, a, use === "react" ? "react" : use, { attack: true }); if (why2) { toast(why2); return null; } }
  if (kitA && use) spendKit(a.id, use, { attack: use === "act" }); else if (use) spend(a.id, use);
  let extra = "";
  if (hasCond(a, "bendecido")) { extra += "+1d4"; why.push("+1d4 por Bendición"); }
  if (hasCond(a, "perdicion")) { extra += "-1d4"; why.push("−1d4 por Perdición"); }
  const ex = (a.conds || []).find(c => c.id === "agotamiento"), exn = ex ? 2 * (+ex.lvl || 1) : 0;
  if (exn) why.push(`−${exn} por agotamiento`);
  const atk = weapon.atk - exn;
  // Daño del SRD que depende de algo: «más 1d4 si la tirada tenía ventaja» se suma solo; el resto, como nota para el máster
  let dmgExpr = weapon.expr;
  if (weapon.ifAdv && adv > 0) { dmgExpr += "+" + weapon.ifAdv.e; why.push(`+${weapon.ifAdv.e} de daño por atacar con ventaja`); }
  if (weapon.alt) why.push(`Daño alternativo: ${weapon.alt.e} ${weapon.alt.t} ${weapon.alt.si}`);
  (weapon.ifs || []).forEach(x => why.push(`+${x.e} ${x.t} ${x.si}`));
  if (weapon.mas && weapon.mas.n === "Mellar") why.push("Mellar (maestría): el ataque extra de «ligera» puede ir dentro de la acción de atacar");
  const r = publish({
    kind: "attack", label: `${use === "react" ? "Ataque de oportunidad: " : ""}${nameOf(s, a)} ataca a ${nameOf(s, t)} · ${weapon.name}`, expr: `1d20${atk >= 0 ? "+" : ""}${atk}${extra}`,
    adv, by: a.id, target: t.id, ac: acOf(s, t) + (cov.bonus || 0), dmg: dmgExpr, dtype: weapon.type,
    why: why.length ? why : null, link: opt.link || null, cov: cov.txt || null, auto: mods.autoCrit ? "Objetivo paralizado o inconsciente a 1,5 m: si impacta, es crítico" : null,
    mas: weapon.mas && !opt.cleaveOf ? weapon.mas : null, wname: weapon.name, cleaveOf: opt.cleaveOf || null
  });
  // Lo que se gasta al atacar: Debilitar (desventaja en su próximo ataque) y Molestar (ventaja en el siguiente contra ese objetivo)
  if (r && (a.conds || []).some(c => c.id === "debilitado" || (c.id === "molestar" && c.t === t.id))) store.commit("token", st => { const k = st.tokens.find(x => x.id === a.id); if (k) k.conds = (k.conds || []).filter(c => !(c.id === "debilitado" || (c.id === "molestar" && c.t === t.id))); });
  if (r && r.mas && r.status === "ok" && isDM(store.get())) store.commit("roll", st => onHit(st, st.rolls.find(x => x.id === r.id)));
  // Efectos del SRD al acertar (criaturas): salvación del objetivo (p. ej. la parálisis del gul) o un estado directo (agarre, derribo)
  if (r && (weapon.rider || weapon.cond) && (r.result === "hit" || r.result === "crit") && r.status === "ok") onHitEffects(a, t, weapon);
  return r;
}
function onHitEffects(a, t, w) {
  import("./salud.js").then(({ rollSave, addCond }) => {
    if (w.rider) {
      if (!sizeOk(w.txt, t) && /criatura (Diminuta|Pequeña|Mediana|Grande|Enorme) o más pequeña/.test(w.rider.fail + " " + w.txt.split("Tirada de salvación")[0].slice(-120))) return;
      const nm = nameOf(store.get(), t), AB = { fue: "Fuerza", des: "Destreza", con: "Constitución", int: "Inteligencia", sab: "Sabiduría", car: "Carisma" };
      const res = rollSave(t, w.rider.sv, w.rider.dc, `Salvación de ${AB[w.rider.sv]} de ${nm} (CD ${w.rider.dc}) · ${w.name} de ${a.name}`);
      const cs = condsIn(w.rider.fail);
      if (!res.ok && cs.length) { store.commit("token", st => { const k = st.tokens.find(x => x.id === t.id); if (k) cs.forEach(id => addCond(k, id, { src: a.id, note: w.name })); }); toast(`${nm} falla la salvación: ${cs.join(", ")}`); }
      else if (!res.ok && w.rider.fail) toast(`${nm} falla la salvación: ${w.rider.fail.slice(0, 110)}`);
      return;
    }
    if (w.cond && sizeOk(w.txt, t)) {
      store.commit("token", st => { const k = st.tokens.find(x => x.id === t.id); if (k) addCond(k, w.cond, { src: a.id, note: w.name }); });
      toast(`${nameOf(store.get(), t)}: ${w.cond}${/escapar/.test(w.txt) ? ` (${(w.txt.match(/CD \d+ para escapar/) || [""])[0]})` : ""}`);
    }
  });
}

/** Tira el daño de un ataque que ha impactado (crítico: dados dobles). */
export function damageFor(rollId) {
  const s = store.get(), r = (s.rolls || []).find(x => x.id === rollId);
  if (!r || !r.dmg) return null;
  const a = s.tokens.find(t => t.id === r.tok), t = s.tokens.find(x => x.id === r.target);
  return publish({ kind: "damage", label: `Daño a ${nameOf(s, t)}${r.dtype ? " · " + r.dtype : ""}`, expr: r.dmg, crit: r.result === "crit", by: r.tok, target: r.target, link: r.id, dtype: r.dtype });
}

/** El máster decide sobre una tirada. action: "ok" | "void" | "flip" (impacto↔fallo) | {total} | "half" (daño a la mitad) */
export function decide(rollId, action) {
  if (!isDM(store.get())) return;
  let apply = null;
  store.commit("roll", s => {
    const r = (s.rolls || []).find(x => x.id === rollId); if (!r) return;
    if (action === "void") { r.status = "void"; return; }
    if (action === "flip") { r.result = r.result === "miss" ? "hit" : "miss"; r.status = "mod"; r.note = "El máster cambia el resultado"; return; }
    if (typeof action === "object" && action.total != null) { r.note = `El máster cambia ${r.total} → ${action.total}`; r.total = action.total; r.status = "mod"; if (r.kind === "attack" && r.ac != null) r.result = r.nat === 20 ? "crit" : r.total >= r.ac ? "hit" : "miss"; return; }
    if (r.kind === "damage" && !r.applied) {
      const amt = action === "half" ? Math.floor(r.total / 2) : action === "double" ? r.total * 2 : r.total;
      r.applied = amt; r.status = action === "ok" ? "ok" : "mod"; if (action === "half") r.note = "Mitad de daño (resistencia o salvación)"; if (action === "double") r.note = "Daño doble (vulnerabilidad)";
      apply = { target: r.target, amt, crit: !!r.crit };
      return;
    }
    r.status = r.status === "pending" ? "ok" : r.status;
  });
  if (apply) hurt(apply.target, apply.amt, { crit: apply.crit });
  // Maestría: Debilitar al confirmarse el impacto; Molestar al aplicarse el daño
  const st0 = store.get(), r0 = (st0.rolls || []).find(x => x.id === rollId);
  if (r0 && r0.kind === "attack" && r0.mas && !r0.masAuto && r0.status !== "pending" && r0.status !== "void") store.commit("roll", st => onHit(st, st.rolls.find(x => x.id === rollId)));
  if (apply && r0 && r0.link) { const atk = (st0.rolls || []).find(x => x.id === r0.link); if (atk && atk.mas && atk.mas.n === "Molestar") store.commit("token", st => onDamage(st, atk, apply.amt)); }
}

/* ---------- Ataques de oportunidad ----------
   Quien tiene la reacción responde con una tirada SUYA enlazada al aviso (atacar o dejar pasar):
   así no hace falta modificar el aviso (en Firestore solo el máster puede tocar tiradas ajenas). */
export const oaOpen = (s, r) => r && r.kind === "oa" && r.status === "pending" && !(s.rolls || []).some(x => x.link === r.id && x.status !== "void")
  && r.seq != null && !!s.board && r.seq === s.board.seq // caduca al cambiar el turno (y los avisos antiguos, sin turno, ya no cuentan)
  && Date.now() - (r.at || 0) < 30000; // y nunca bloquea: si en 30 s nadie decide, se entiende que lo deja pasar
export function answerOA(oaId, go) {
  const s = store.get(), r = (s.rolls || []).find(x => x.id === oaId); if (!oaOpen(s, r)) return;
  const h = s.tokens.find(t => t.id === r.tok), t = s.tokens.find(x => x.id === r.target); if (!h) return;
  if (go) {
    const w = attacksOf(s, h).find(x => !x.rng.ranged || x.rng.melee);
    if (!w) { toast(`${nameOf(s, h)} no tiene un ataque cuerpo a cuerpo.`); go = false; }
    else if (!attack(h.id, r.target, w, null, "react", { link: r.id })) go = false;
  }
  if (!go) {
    const me = currentUser(s);
    store.commit("roll", st => { st.rolls.push({ id: "oap" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: Date.now(), who: me ? me.id : null, whoName: me ? me.name : "", kind: "oapass",
      label: `${nameOf(s, h)} deja pasar a ${nameOf(s, t)}`, expr: "", dice: [], total: null, status: "ok", secret: false, link: r.id, tok: h.id, target: r.target }); });
  }
}
