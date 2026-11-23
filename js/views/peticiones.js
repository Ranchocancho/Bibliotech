// Tiradas a petición del máster: «Todos, Sabiduría (Percepción)», «Brena, salvación de Destreza CD 14»…
// Valen en combate y en roleplay. Al jugador le aparece un tapete con su bonificador y el botón de tirar;
// si son varios a la vez, los dados caen juntos en la misma bandeja (dicecam agrupa por petición).
import { store, uid } from "../core/store.js";
import { isDM, currentUser } from "../core/session.js";
import { publish } from "../core/dados.js";
import { ABILITIES, SKILLS, mod, sign, saveBonus, skillBonus } from "../data/dnd.js";
import { $, $$, esc, toast } from "../core/ui.js";

const AB = Object.fromEntries(ABILITIES);
const ICON = { fue: "💪", des: "🤸", con: "🫀", int: "📚", sab: "👁", car: "🎭" };

/** Qué se pide, en palabras. */
export function reqName(q) {
  if (q.type === "save") return `Salvación de ${AB[q.ab]}`;
  if (q.type === "ab") return `Prueba de ${AB[q.ab]}`;
  const sk = SKILLS.find(x => x[0] === q.key); return sk ? `${sk[1]} (${AB[sk[2]]})` : q.key;
}
export function bonusFor(c, q) {
  if (q.type === "save") return saveBonus(c, q.ab);
  if (q.type === "ab") return mod(c.abilities[q.ab]);
  const sk = SKILLS.find(x => x[0] === q.key); return sk ? skillBonus(c, sk[0], sk[2]) : 0;
}
export const answersOf = (s, rq) => (s.rolls || []).filter(r => r.link === rq.id && r.status !== "void");
export const answerFor = (s, rq, charId) => answersOf(s, rq).find(r => r.char === charId);

/** El máster crea la petición. chars: ids de personaje. */
export function askRoll(q, chars) {
  const s = store.get(), me = currentUser(s);
  const e = { id: uid("tir"), at: Date.now(), who: me ? me.id : null, whoName: me ? me.name : "", kind: "req", label: reqName(q), expr: "", dice: [], total: null, status: "ok", secret: false,
    req: { ...q, chars } };
  store.commit("roll", st => { st.rolls = st.rolls || []; st.rolls.push(e); });
  return e;
}
/** Tira la respuesta de un personaje (el jugador la suya; el máster, la de quien falte). */
export function answer(rq, charId, adv = 0) {
  const s = store.get(), c = s.characters.find(x => x.id === charId); if (!c || answerFor(s, rq, charId)) return null;
  const q = rq.req, b = bonusFor(c, q), tok = (s.tokens || []).find(t => t.kind === "pc" && t.char === charId);
  return publish({ kind: q.type === "save" ? "save" : "check", label: `${reqName(q)} de ${c.name}`, expr: `1d20${b >= 0 ? "+" : ""}${b}`, adv: adv || q.adv || 0,
    by: tok ? tok.id : null, link: rq.id, char: charId, dc: q.dc || null });
}
export function answerMissing(rq) {
  const s = store.get(); rq.req.chars.filter(id => !answerFor(s, rq, id)).forEach(id => answer(rq, id));
}

/* ---------- Tapete del jugador: aparece en cualquier pantalla ---------- */
let box = null, advPick = {};
export function watchRequests() {
  store.subscribe(drawPrompt);
  drawPrompt();
}
function openReqs(s, me) {
  const mine = s.characters.filter(c => c.owner === me.id).map(c => c.id);
  return (s.rolls || []).filter(r => r.kind === "req" && r.status !== "void" && Date.now() - r.at < 30 * 60 * 1000)
    .flatMap(r => r.req.chars.filter(id => mine.includes(id) && !answerFor(s, r, id)).map(id => ({ r, id })));
}
function drawPrompt() {
  const s = store.get(), me = currentUser(s);
  if (!me || isDM(s)) { if (box) box.hidden = true; return; }
  const list = openReqs(s, me);
  if (!box) { box = document.createElement("div"); box.className = "reqmat"; document.body.appendChild(box); }
  if (!list.length) { box.hidden = true; box.innerHTML = ""; box._sig = ""; return; }
  const { r, id } = list[0], c = s.characters.find(x => x.id === id), q = r.req, b = bonusFor(c, q), adv = advPick[r.id] ?? (q.adv || 0);
  const sig = r.id + id + adv;
  box.hidden = false;
  if (box._sig === sig) return; box._sig = sig;
  box.innerHTML = `<div class="rqhead"><span>🎲 El máster te pide una tirada</span>${list.length > 1 ? `<small>+${list.length - 1} más</small>` : ""}</div>
    <div class="rqbody"><i class="rqic">${ICON[q.ab || (SKILLS.find(x => x[0] === q.key) || [])[2]] || "🎲"}</i>
      <div><b>${esc(reqName(q))}</b><small>${esc(c.name)} · 1d20 ${sign(b)}${q.dc && !q.hideDC ? ` · CD ${q.dc}` : ""}${q.note ? ` · ${esc(q.note)}` : ""}</small></div></div>
    <div class="rqbtns"><button class="btn small" data-rqadv="1" aria-pressed="${adv === 1}">Ventaja</button><button class="btn small" data-rqadv="-1" aria-pressed="${adv === -1}">Desventaja</button>
      <button class="btn gold" data-rqgo>🎲 Tirar</button></div>`;
  $$("[data-rqadv]", box).forEach(x => x.onclick = () => { const v = +x.dataset.rqadv; advPick[r.id] = adv === v ? 0 : v; drawPrompt(); });
  $("[data-rqgo]", box).onclick = () => { answer(r, id, advPick[r.id] ?? (q.adv || 0)); };
}

/* ---------- Ventana del máster para pedir la tirada ---------- */
let pick = { type: "skill", key: "percepcion", ab: "sab", dc: "", hideDC: true, adv: 0, who: "all", chars: [] };
export function openAskDialog(only = null) {
  const s = store.get(), dm = isDM(s); if (!dm) return;
  if (only && only.length) { pick.who = "some"; pick.chars = [...only]; }
  const pcs = s.characters.filter(c => c.owner || (s.tokens || []).some(t => t.kind === "pc" && t.char === c.id));
  const ov = document.createElement("div"); ov.className = "modal reqdlg";
  const draw = () => {
    const opts = pick.type === "skill" ? SKILLS.map(([k, n, a]) => [k, `${n}`, a]) : ABILITIES.map(([k, n]) => [k, n, k]);
    const cur = pick.type === "skill" ? pick.key : pick.ab;
    ov.innerHTML = `<div class="modalbox"><header><h3>🎲 Pedir una tirada</h3><button class="x" data-close aria-label="Cerrar">✕</button></header>
      <div class="rqtabs">${[["skill", "Habilidad"], ["ab", "Característica"], ["save", "Salvación"]].map(([k, n]) => `<button class="btn small" data-rqt="${k}" aria-pressed="${pick.type === k}">${n}</button>`).join("")}</div>
      <div class="rqopts">${opts.map(([k, n, a]) => `<button class="rqopt ${cur === k ? "on" : ""}" data-rqo="${k}|${a}"><i>${ICON[a] || ""}</i>${esc(n)}<small>${AB[a] ? AB[a].slice(0, 3).toUpperCase() : ""}</small></button>`).join("")}</div>
      <div class="rqrow"><label>CD <input type="number" min="1" max="40" id="rqdc" value="${esc(String(pick.dc))}" placeholder="—"></label>
        <label class="chk"><input type="checkbox" id="rqhide" ${pick.hideDC ? "checked" : ""}> CD oculta a los jugadores</label>
        <span class="grow"></span><button class="btn small" data-rqa="1" aria-pressed="${pick.adv === 1}">Ventaja</button><button class="btn small" data-rqa="-1" aria-pressed="${pick.adv === -1}">Desventaja</button></div>
      <div class="rqwho"><button class="btn small" data-rqw="all" aria-pressed="${pick.who === "all"}">👥 Todos</button>${pcs.map(c => `<button class="btn small" data-rqc="${c.id}" aria-pressed="${pick.who !== "all" && pick.chars.includes(c.id)}">${esc(c.name.split(" ")[0])}</button>`).join("")}</div>
      <footer><span class="note">${esc(reqName({ ...pick }))} · ${pick.who === "all" ? "todos" : pick.chars.length + " personaje(s)"}</span><span class="grow"></span>
        <button class="btn" data-rqgo="me">Tirar yo por ellos</button><button class="btn gold" data-rqgo="ask">Pedir la tirada</button></footer></div>`;
    $("[data-close]", ov).onclick = () => ov.remove();
    $$("[data-rqt]", ov).forEach(b => b.onclick = () => { pick.type = b.dataset.rqt; draw(); });
    $$("[data-rqo]", ov).forEach(b => b.onclick = () => { const [k, a] = b.dataset.rqo.split("|"); if (pick.type === "skill") { pick.key = k; pick.ab = a; } else pick.ab = k; draw(); });
    $$("[data-rqa]", ov).forEach(b => b.onclick = () => { const v = +b.dataset.rqa; pick.adv = pick.adv === v ? 0 : v; draw(); });
    $("[data-rqw]", ov).onclick = () => { pick.who = "all"; pick.chars = []; draw(); };
    $$("[data-rqc]", ov).forEach(b => b.onclick = () => { const id = b.dataset.rqc; if (pick.who === "all") { pick.who = "some"; pick.chars = []; } pick.chars = pick.chars.includes(id) ? pick.chars.filter(x => x !== id) : [...pick.chars, id]; if (!pick.chars.length) pick.who = "all"; draw(); });
    $("#rqdc", ov).oninput = e => { pick.dc = e.target.value; };
    $("#rqhide", ov).onchange = e => { pick.hideDC = e.target.checked; };
    $$("[data-rqgo]", ov).forEach(b => b.onclick = () => {
      const chars = pick.who === "all" ? pcs.map(c => c.id) : pick.chars; if (!chars.length) return toast("No hay personajes a los que pedírsela.");
      const q = { type: pick.type, key: pick.type === "skill" ? pick.key : null, ab: pick.ab, dc: +pick.dc || null, hideDC: !!pick.hideDC, adv: pick.adv || 0 };
      const rq = askRoll(q, chars);
      if (b.dataset.rqgo === "me") answerMissing(rq); else toast(`Pedida: ${reqName(q)}`);
      ov.remove();
    });
  };
  draw(); document.body.appendChild(ov);
  ov.addEventListener("click", e => { if (e.target === ov) ov.remove(); });
}
