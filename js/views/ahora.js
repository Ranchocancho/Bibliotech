// «Ahora»: qué está pasando en la mesa y quién tiene que hacer qué.
// Lo lee la barra superior de la mesa (a la izquierda de la iniciativa) para que, aunque
// os pongáis a hablar, siempre se sepa qué falta por tirar o por resolver.
import { unseenFn } from "../core/vision.js";
import { nameOf, oaOpen } from "../core/combate.js";
import { hpOf, order } from "../core/mesa.js";
import { phase, current, pending, eco, moveBudget } from "../core/turnos.js";
import { visibleRolls } from "./tiradas.js";
import { deployOf, deployOrder, placer, isReady } from "../core/despliegue.js";

const fm = n => (Math.round(n * 10) / 10).toLocaleString("es-ES");
// Nombre corto: «Brena Martillo-Ceniza» → «Brena»; «Goblin 2 (en la maleza)» → «Goblin 2» (el número distingue a los repetidos)
const first = n => { const w = String(n || "").replace(/\s*\(.*?\)/g, "").trim().split(/\s+/); return w.length > 1 && /^\d+$/.test(w[w.length - 1]) ? `${w[0]} ${w[w.length - 1]}` : w[0]; };

/** Devuelve { head, text, who, mine, tone, acts: [{k, id, label, gold}], next } */
export function nowState(s, me, dm) {
  const ph = phase(s), cur = current(s), hid = unseenFn(s, dm), N = t => (!dm && t && hid(t) ? "?" : first(nameOf(s, t)));
  const tok = id => s.tokens.find(t => t.id === id);
  const ownerOf = t => t && t.kind === "pc" ? t.owner : null; // de las criaturas se encarga el máster
  const mineT = s.tokens.find(t => t.kind === "pc" && t.owner === me);
  // Despliegue: el grupo se coloca por turnos en la zona de inicio antes de empezar
  const dep = !ph && deployOf(s);
  if (dep) {
    const L = deployOrder(s), cur = placer(s), done = L.filter(t => isReady(t, dep)).length;
    const head = `Despliegue · ${done}/${L.length} colocados`;
    if (dm) return { head, who: cur ? N(cur) : "Todos", mine: true, tone: cur ? "wait" : "go",
      text: cur ? `Se coloca ${N(cur)}: arrastra su figura dentro de la zona marcada alrededor del ⚑ (${dep.rad} casillas). Si no responde, pulsa «Listo» por él.` : "Todos colocados. Empieza la escena o el combate.",
      acts: [...(cur ? [{ k: "depok", id: cur.id, label: `✓ Listo ${N(cur)}` }] : []), { k: "depend", label: "Terminar despliegue" }, { k: "begin", label: "⚔️ Iniciar combate", gold: !cur }] };
    if (cur && cur.owner === me) return { head, who: "Tú", mine: true, tone: "go", text: "Te toca colocarte: arrastra tu figura a cualquier casilla iluminada de la zona de inicio, según lo que veas (delante, detrás, a cubierto), y pulsa «Listo».", acts: [{ k: "depok", id: cur.id, label: "✓ Listo", gold: true }] };
    const pos = mineT ? L.filter(t => !isReady(t, dep)).findIndex(t => t.id === mineT.id) : -1;
    return { head, who: cur ? N(cur) : "Máster", mine: false, tone: "calm",
      text: !cur ? "Todos colocados. El máster empezará en cuanto esté listo." : mineT && isReady(mineT, dep) ? `Ya estás colocado. Ahora se coloca ${N(cur)}.` : `Se está colocando ${N(cur)}.${pos > 0 ? ` Vas tú dentro de ${pos}.` : ""} Mira la mesa: lo que ves te ayuda a decidir dónde ponerte.`,
      acts: mineT && isReady(mineT, dep) && cur ? [{ k: "depundo", id: mineT.id, label: "Cambiar mi sitio" }] : [] };
  }
  if (!ph) {
    // Fuera de combate también hay cosas a medias: una trampa que ha saltado, un conjuro o un aliento por resolver
    const pend = visibleRolls(s).filter(r => r.kind === "spell" && r.status === "pending" && Date.now() - (r.at || 0) < 3600e3).pop();
    if (pend) {
      const mine = (pend.targets || []).some(id => { const t = tok(id); return t && t.owner === me; });
      const sv = (pend.saves || []).map(x => `${first(x.name)} ${x.total}${x.ok ? " ✓" : " ✗"}`).join(", ");
      return dm ? { head: "Exploración · por resolver", who: "Máster", mine: true, tone: "alert", text: `${pend.label.replace(/ ·.*/, "")}${sv ? ` — salvaciones: ${sv} (CD ${pend.dc}).` : "."} Aplica el resultado.`, acts: [{ k: "rolls", label: "Resolver", gold: true }] }
        : { head: "Exploración", who: "Máster", mine: false, tone: mine ? "alert" : "wait", text: mine ? `${pend.label.replace(/ ·.*/, "")}: el máster está aplicando el resultado.` : "El máster está resolviendo algo.", acts: [] };
    }
    return { head: "Exploración", text: "Movimiento libre. Habla con el máster o explora la mesa.", tone: "calm", acts: dm ? [{ k: "begin", label: "⚔️ Iniciar combate", gold: true }] : [] };
  }
  if (ph === "init") {
    const miss = pending(s), acts = [];
    let text = miss.length ? `Faltan: ${miss.map(N).join(", ")}` : "Todos han tirado. El máster empieza la ronda.";
    let mine = false;
    if (mineT && (mineT.init == null || mineT.init === "")) { text = "Tira tu iniciativa: 1d20 + Destreza."; mine = true; acts.push({ k: "init", id: mineT.id, label: "🎲 Tirar iniciativa", gold: true }); }
    if (dm) acts.push({ k: "start", label: miss.length ? "▶ Empezar igualmente" : "▶ Empezar ronda 1", gold: !miss.length });
    return { head: "⚔️ ¡Combate! · Iniciativa", text, who: mine ? "Tú" : "Todos", mine, tone: "alert", acts };
  }
  // En combate: primero, lo que está a medias en este turno (por orden de urgencia)
  // Solo cuenta lo de ESTE combate (lo de combates anteriores no puede bloquear nada)
  const since = s.board.combatAt || 0;
  const rolls = visibleRolls(s).filter(r => r.status !== "void" && (r.at || 0) >= since).slice(-40);
  const hasDmg = id => rolls.some(x => x.link === id);
  const after = (() => { const o = order(s).filter(t => !(hpOf(s, t) && hpOf(s, t).cur <= 0 && t.kind !== "pc")); const i = o.findIndex(t => t.id === (cur && cur.id)); return o.length > 1 && i >= 0 ? o[(i + 1) % o.length] : null; })();
  const base = { head: `Ronda ${s.board.round} · turno de ${cur ? N(cur) : "—"}`, next: after && !(hid(after) && !dm) ? N(after) : null, nextMine: !!(after && after.owner === me) };
  // Turno de una criatura oculta: los jugadores no deben saber ni quién es
  if (!dm && cur && hid(cur)) return { head: `Ronda ${s.board.round}`, next: base.next, nextMine: base.nextMine, who: "Máster", text: `El máster está resolviendo un turno. Espera${base.nextMine ? ": vas tú después" : ""}.`, mine: false, acts: [], tone: "calm" };
  const task = (who, text, mine, acts = [], tone = "wait") => ({ ...base, who, text, mine, acts, tone });
  // 1. Reacciones: interrumpen el turno en curso hasta que quien puede reaccionar decide (el máster puede decidir por él)
  const oa = rolls.find(r => oaOpen(s, r));
  if (oa) { const a = tok(oa.tok), t = tok(oa.target), o = ownerOf(a), mine = o ? o === me : dm, can = mine || dm;
    return task(a ? N(a) : "?", `⏸ Reacción: ${N(t)} sale del alcance de ${N(a)}. ${o ? N(a) + " decide" : "El máster decide"}: ¿ataque de oportunidad o lo deja pasar? Después sigue el turno de ${cur ? N(cur) : "—"}.`, mine,
      can ? [{ k: "oa", id: oa.id, label: "⚔ Atacar", gold: true }, { k: "oapass", id: oa.id, label: "Dejar pasar" }] : [], "alert"); }
  const atk = rolls.find(r => r.kind === "attack" && r.status === "pending");
  if (atk) return task("Máster", `Confirma el ataque de ${N(tok(atk.tok))} a ${N(tok(atk.target))}: ${atk.total} contra CA ${atk.ac ?? "?"} → ${atk.result === "miss" ? "falla" : atk.result === "crit" ? "¡crítico!" : "impacta"}.`, dm,
    dm ? [{ k: "ok", id: atk.id, label: "✓ Vale", gold: true }, { k: "flip", id: atk.id, label: atk.result === "miss" ? "Que impacte" : "Que falle" }] : [], "wait");
  const dmg = rolls.find(r => r.kind === "damage" && r.status === "pending");
  if (dmg) return task("Máster", `Aplica ${dmg.total} de daño${dmg.dtype ? " " + dmg.dtype : ""} a ${N(tok(dmg.target))}.`, dm, dm ? [{ k: "ok", id: dmg.id, label: `✓ Aplicar ${dmg.total}`, gold: true }, { k: "half", id: dmg.id, label: "½" }, { k: "rolls", label: "Más…" }] : [], "wait");
  const sp = rolls.find(r => r.saves && r.status === "pending");
  if (sp) return task("Máster", `Resuelve el conjuro de ${N(tok(sp.tok))}: salvaciones y daño.`, dm, dm ? [{ k: "rolls", label: "Resolver", gold: true }] : []);
  const hit = rolls.find(r => r.kind === "attack" && (r.status === "ok" || r.status === "mod") && r.result && r.result !== "miss" && r.dmg && !hasDmg(r.id) && r.seq === s.board.seq);
  if (hit) { const a = tok(hit.tok), mine = hit.who === me || (dm && (!a || a.kind !== "pc")); return task(a ? N(a) : "?", `¡Impacta! Tira el daño: ${hit.dmg}${hit.result === "crit" ? " (crítico: dados ×2)" : ""}.`, mine, mine ? [{ k: "dmg", id: hit.id, label: "🩸 Tirar daño", gold: true }] : [], "go"); }
  if (!cur) return task("Máster", "Elige quién empieza.", dm);
  const h = hpOf(s, cur), owner = ownerOf(cur), mineTurn = owner ? owner === me : dm;
  if (cur.kind === "pc" && h && h.cur <= 0) {
    const c = s.characters.find(x => x.id === cur.char), d = (c && c.death) || {};
    if (!d.stable) return task(N(cur), "Está inconsciente: tira la salvación contra muerte (1d20, 10 o más salva).", mineTurn, mineTurn ? [{ k: "death", id: cur.id, label: "💀 Salvación", gold: true }, { k: "end", label: "Terminar turno ▶" }] : [], "alert");
  }
  const e = eco(s, cur), budget = moveBudget(s, cur);
  const left = [e.act ? null : "acción", e.bonus ? null : "acción adicional", e.mov < budget ? `${fm(budget - e.mov)} m de movimiento` : null].filter(Boolean);
  const foe = cur.kind !== "pc";
  // Qué hay que hacer en este turno, paso a paso, según quién lo lleva
  const text = mineTurn
    ? (foe ? (left.length ? `Lo llevas tú: muévelo arrastrándolo, elige su ataque (pestaña PNJ) y toca al objetivo. Le queda: ${left.join(", ")}.` : `${N(cur)} ya lo ha hecho todo: termina su turno.`)
      : (left.length ? `Te toca: muévete arrastrando tu figura; para atacar, elige arma en «Personaje» y toca al enemigo. Te queda: ${left.join(", ")}.` : "Lo has gastado todo: termina tu turno."))
    : foe ? `El máster mueve a ${N(cur)} y decide qué hace. Espera${base.nextMine ? ": vas tú después" : " tu turno"}.`
    : `${N(cur)} está actuando${left.length ? ` (le queda ${left.join(", ")})` : ""}.${base.nextMine ? " Vas tú después." : ""}`;
  const acts = mineTurn ? [...(foe && dm ? [{ k: "npc", id: cur.id, label: "👹 Sus ataques" }] : []), { k: "end", label: "Terminar turno ▶", gold: !left.length }] : [];
  return { ...task(mineTurn ? (foe ? "Máster" : "Tú") : N(cur), text, mineTurn, acts, mineTurn ? "go" : "calm"), eco: { act: !!e.act, bonus: !!e.bonus, mov: `${fm(e.mov)}/${fm(budget)} m` } };
}
