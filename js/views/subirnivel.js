// Asistente de subida de nivel (reglas 2024, SRD 5.2.1). El máster concede el nivel; el jugador sube aquí, paso a paso:
// 1) qué gana su clase en ese nivel, 2) puntos de golpe, 3) elecciones (subclase, dote o mejora, don épico),
// 4) magia (espacios, trucos y conjuros nuevos), 5) resumen antes/después y confirmar.
// También ofrece el «horizonte»: lo que trae cada uno de los próximos niveles.
import { store } from "../core/store.js";
import { isDM } from "../core/session.js";
import { PROG, FEATS } from "../data/progresion.js";
import { ABILITIES, AB_SHORT, classInfo, mod, sign, prof } from "../data/dnd.js";
import { srd } from "../core/srd.js";
import { $, $$, esc, toast } from "../core/ui.js";

const AB = Object.fromEntries(ABILITIES);
// Por las tres primeras letras: así vale el femenino («Maga», «Pícara», «Clériga»…)
export const progOf = cls => PROG[cls] || PROG[Object.keys(PROG).find(k => cls && k.toLowerCase().startsWith(String(cls).toLowerCase().trim().slice(0, 3)))] || null;
const rowOf = (P, L) => { const r = (P.rows || [])[L - 1] || []; return Object.fromEntries(P.cols.map((c, i) => [c, r[i] ?? "—"])); };
const slotsOf = (P, L) => {
  const r = rowOf(P, L);
  if (r["Espacios de pacto"] != null) { const n = +r["Espacios de pacto"] || 0, lv = +r["Nivel de los espacios"] || 0; return n ? { [lv]: n } : {}; }
  const out = {}; for (let i = 1; i <= 9; i++) { const v = +r["s" + i]; if (v > 0) out[i] = v; } return out;
};
const num = v => (v == null || v === "—" ? 0 : +String(v).replace(/[^\d]/g, "") || 0);
const COLNAME = { s1: "Espacios nv 1" };

/** Qué trae un nivel concreto para esta clase (y su subclase si es la del SRD). */
export function levelInfo(c, L) {
  const P = progOf(c.cls); if (!P) return null;
  const items = (P.lv[L] || []).map(x => ({ ...x }));
  // «Campeona» = «Campeón», «Ladrona» = «Ladrón»… (se compara sin género ni tildes)
  const norm = x => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/(ona|ora|a|o|on)\b/g, "").trim();
  const subName = (c.subclass || "").trim(), srdSub = !!(P.sub && P.sub.n && subName && norm(subName) === norm(P.sub.n));
  const subFeats = srdSub ? (P.sub.lv[L] || []) : [];
  const before = rowOf(P, L - 1), after = rowOf(P, L), changes = [];
  P.cols.forEach(k => { if (!/^s\d$/.test(k) && String(before[k]) !== String(after[k]) && L > 1) changes.push([k, before[k], after[k]]); });
  const sb = L > 1 ? slotsOf(P, L - 1) : {}, sa = slotsOf(P, L);
  const slotCh = Object.keys({ ...sb, ...sa }).filter(l => (sb[l] || 0) !== (sa[l] || 0)).map(l => [l, sb[l] || 0, sa[l] || 0]);
  return { P, items, subFeats, srdSub, changes, slotCh, slotsAfter: sa, row: after, prevRow: before };
}

/* ---------- Horizonte: los próximos niveles, en tarjetas ---------- */
export function horizonHTML(c, n = 3) {
  const P = progOf(c.cls); if (!P || c.level >= 20) return "";
  const cards = [];
  for (let L = c.level + 1; L <= Math.min(20, c.level + n); L++) {
    const I = levelInfo(c, L), tags = [];
    I.items.forEach(i => tags.push(i.k === "sub" ? `<b class="hz must">🎓 Eliges subclase</b>` : i.k === "asi" ? `<b class="hz must">⬆ Dote o +2 característica</b>` : i.k === "epic" ? `<b class="hz must">🌟 Don épico</b>` : i.k === "subf" ? `<span class="hz">Rasgo de ${esc(c.subclass || "subclase")}${I.subFeats.length ? ": " + esc(I.subFeats.map(x => x.n).join(", ")) : ""}</span>` : `<span class="hz">${esc(i.n)}</span>`));
    if (L === 5 || L === 9 || L === 13 || L === 17) tags.push(`<span class="hz">Competencia ${sign(prof(L))}</span>`);
    I.changes.forEach(([k, a, b]) => tags.push(`<span class="hz num">${esc(k)}: ${esc(a)} → <b>${esc(b)}</b></span>`));
    if (I.slotCh.length) tags.push(`<span class="hz num">✨ Espacios: ${I.slotCh.map(([l, a, b]) => `nv${l} ${a}→${b}`).join(", ")}</span>`);
    cards.push(`<div class="hzcard"><div class="hzl">Nivel ${L}</div><div class="hzt">${tags.join("") || `<span class="hz">Solo puntos de golpe</span>`}</div></div>`);
  }
  return `<section class="horizon"><h3 class="sub">🔭 Lo que viene</h3>${cards.join("")}</section>`;
}

/* ---------- El asistente ---------- */
let W = null; // estado del asistente abierto
export function openLevelUp(charId) {
  const s = store.get(), c = s.characters.find(x => x.id === charId); if (!c || c.level >= 20) return;
  const P = progOf(c.cls);
  W = { id: charId, step: 0, hp: null, roll: 0, sub: c.subclass || (P && P.sub ? P.sub.n : ""), subOther: "", asi: { mode: "abil", a: "", b: "", feat: "" }, epic: { feat: "", ab: "" }, spells: [], spellQ: "" };
  const ov = document.createElement("div"); ov.className = "reqdlg lvlwiz"; ov.id = "lvlwiz"; document.body.appendChild(ov);
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
  srd("conjuros").then(() => draw());
  draw();
}
const close = () => { const o = document.getElementById("lvlwiz"); if (o) o.remove(); W = null; };

function needs(c, I) {
  return { sub: I.items.some(i => i.k === "sub"), asi: I.items.some(i => i.k === "asi"), epic: I.items.some(i => i.k === "epic"), magic: !!classInfo(c.cls).cast && I.P && (I.P.cols.includes("Conjuros preparados")) };
}
function steps(c, I) {
  const n = needs(c, I), st = [["gain", "Qué ganas"], ["hp", "Puntos de golpe"]];
  if (n.sub) st.push(["sub", "Subclase"]);
  if (n.asi) st.push(["asi", "Dote o característica"]);
  if (n.epic) st.push(["epic", "Don épico"]);
  if (n.magic) st.push(["magic", "Magia"]);
  st.push(["sum", "Resumen"]);
  return st;
}
const featOk = (c, f, L) => {
  if (f.lvl > L) return [false, `nivel ${f.lvl}`];
  const r = f.req || "";
  const m = r.match(/(Fuerza|Destreza|Constitución|Inteligencia|Sabiduría|Carisma)(?: o (Fuerza|Destreza|Constitución|Inteligencia|Sabiduría|Carisma))? (\d+) o más/);
  if (m) { const keys = [m[1], m[2]].filter(Boolean).map(n => ABILITIES.find(a => a[1] === n)[0]); if (!keys.some(k => (+c.abilities[k] || 10) >= +m[3])) return [false, r]; }
  if (/Estilo de combate/.test(r) && !(c.features || []).some(x => /estilo de combate/i.test(x.name || "")) && !["Guerrero", "Paladín", "Explorador"].includes(c.cls)) return [false, "rasgo Estilo de combate"];
  if (/Lanzamiento de conjuros/.test(r) && !classInfo(c.cls).cast) return [false, "lanzar conjuros"];
  return [true, ""];
};

function draw() {
  const ov = document.getElementById("lvlwiz"); if (!ov || !W) return;
  const s = store.get(), c = s.characters.find(x => x.id === W.id); if (!c) return close();
  const L = c.level + 1, I = levelInfo(c, L), ST = steps(c, I), cur = ST[Math.min(W.step, ST.length - 1)][0];
  const hd = classInfo(c.cls).hd, con = mod(c.abilities.con), avg = Math.floor(hd / 2) + 1, gain = Math.max(1, (W.roll || avg) + con);
  let body = "";
  if (!I) body = `<p class="note">No tengo la tabla de «${esc(c.cls)}». Sube los puntos de golpe y apunta los rasgos a mano.</p>`;
  else if (cur === "gain") {
    body = `<p class="lead">${esc(c.name)} pasa a <b>${esc(c.cls)} ${L}</b>${L === 5 || L === 9 || L === 13 || L === 17 ? ` · tu bonificador de competencia sube a <b>${sign(prof(L))}</b>` : ""}.</p>
      <div class="gains">${I.items.map(i => `<details class="gain ${i.k}"><summary><b>${esc(i.n)}</b>${i.k === "sub" ? `<em>tendrás que elegir</em>` : i.k === "asi" || i.k === "epic" ? `<em>tendrás que elegir</em>` : i.k === "subf" ? `<em>de tu subclase</em>` : `<em>automático</em>`}</summary>${i.t ? `<p>${esc(i.t)}</p>` : ""}</details>`).join("")}
      ${I.subFeats.map(i => `<details class="gain subf"><summary><b>${esc(i.n)}</b><em>${esc(c.subclass)}</em></summary><p>${esc(i.t)}</p></details>`).join("")}
      ${I.items.some(i => i.k === "subf") && !I.srdSub ? `<p class="note">Tu subclase («${esc(c.subclass || "sin elegir")}») no está en el SRD: mira su rasgo de nivel ${L} en el manual y apúntalo en Rasgos.</p>` : ""}</div>
      ${I.changes.length || I.slotCh.length ? `<h4>Cambian tus números</h4><div class="chg">${I.changes.map(([k, a, b]) => `<span>${esc(k)} <s>${esc(a)}</s> → <b>${esc(b)}</b></span>`).join("")}${I.slotCh.map(([l, a, b]) => `<span>Espacios de nivel ${l} <s>${a}</s> → <b>${b}</b></span>`).join("")}</div>` : ""}`;
  } else if (cur === "hp") {
    body = `<p>Ganas un dado de golpe: <b>d${hd}</b> ${sign(con)} (Constitución). Elige el valor fijo o tira el dado.</p>
      <div class="row"><button class="btn" data-hp="avg" aria-pressed="${!W.roll}">Valor fijo: ${avg}</button><button class="btn" data-hp="roll" aria-pressed="${!!W.roll}">${W.roll ? `Tirada: ${W.roll}` : `🎲 Tirar d${hd}`}</button></div>
      <p class="lead">Ganas <b>${gain} PG</b> · máximo ${c.hp.max} → <b>${c.hp.max + gain}</b></p>`;
  } else if (cur === "sub") {
    const P = I.P;
    body = `<p>En nivel 3 todas las clases eligen subclase. El SRD incluye una por clase; si usáis otra del manual, escríbela.</p>
      ${P.sub && P.sub.n ? `<label class="subopt ${W.sub === P.sub.n ? "on" : ""}"><input type="radio" name="sub" value="${esc(P.sub.n)}" ${W.sub === P.sub.n ? "checked" : ""}><div><b>${esc(P.sub.n)}</b><small>${Object.entries(P.sub.lv).map(([l, fs]) => `nv${l}: ${fs.map(f => f.n).join(", ")}`).join(" · ")}</small></div></label>` : ""}
      <label class="subopt ${W.sub && P.sub && W.sub !== P.sub.n ? "on" : ""}"><input type="radio" name="sub" value="__otra" ${W.sub && P.sub && W.sub !== P.sub.n ? "checked" : ""}><div><b>Otra subclase</b><input id="subother" placeholder="Nombre de la subclase" value="${esc(P.sub && W.sub !== P.sub.n ? W.sub : "")}"></div></label>`;
  } else if (cur === "asi") {
    const gen = FEATS.filter(f => f.cat === "general" && f.n !== "Mejora de característica");
    const a = W.asi;
    body = `<p>Elige <b>Mejora de característica</b> (+2 a una o +1 a dos, máximo 20) o una <b>dote general</b>.</p>
      <div class="row"><button class="btn small" data-asim="abil" aria-pressed="${a.mode === "abil"}">⬆ Mejora de característica</button><button class="btn small" data-asim="feat" aria-pressed="${a.mode === "feat"}">📜 Una dote</button></div>
      ${a.mode === "abil" ? `<div class="abpick">${ABILITIES.map(([k, n]) => { const v = +c.abilities[k] || 10, plus = (a.a === k ? 1 : 0) + (a.b === k ? 1 : 0); return `<button class="abbtn ${plus ? "on" : ""}" data-ab="${k}" ${v >= 20 ? "disabled" : ""}><small>${AB_SHORT[k]}</small><b>${v}${plus ? `<i>→${Math.min(20, v + plus)}</i>` : ""}</b></button>`; }).join("")}</div>
        <p class="note" style="margin:6px 0 0">Pulsa una característica dos veces para +2, o dos distintas para +1 cada una. ${a.a || a.b ? `<button class="btn small" data-abclear>Borrar</button>` : ""}</p>`
      : `<div class="featlist">${gen.map(f => { const [ok, why] = featOk(c, f, L); return `<label class="featopt ${a.feat === f.n ? "on" : ""} ${ok ? "" : "no"}"><input type="radio" name="feat" value="${esc(f.n)}" ${a.feat === f.n ? "checked" : ""} ${ok ? "" : "disabled"}><div><b>${esc(f.n)}</b>${ok ? "" : `<em>requiere ${esc(why)}</em>`}<small>${esc(f.t.slice(0, 220))}…</small>${f.ab.length && a.feat === f.n ? `<span class="row">+1 a ${f.ab.map(k => `<button class="btn small" data-featab="${k}" aria-pressed="${a.a === k}">${AB_SHORT[k]}</button>`).join("")}</span>` : ""}</div></label>`; }).join("")}
        <label class="featopt ${a.feat === "__otra" ? "on" : ""}"><input type="radio" name="feat" value="__otra" ${a.feat === "__otra" ? "checked" : ""}><div><b>Otra dote del manual</b><input id="featother" placeholder="Nombre de la dote" value="${esc(a.other || "")}"></div></label></div>`}`;
  } else if (cur === "epic") {
    const ep = FEATS.filter(f => f.cat === "epico");
    body = `<p>En nivel 19 obtienes un <b>Don épico</b>: incluye +1 a una característica (máximo 30).</p><div class="featlist">${ep.map(f => { const [ok, why] = featOk(c, f, L); return `<label class="featopt ${W.epic.feat === f.n ? "on" : ""} ${ok ? "" : "no"}"><input type="radio" name="epic" value="${esc(f.n)}" ${W.epic.feat === f.n ? "checked" : ""} ${ok ? "" : "disabled"}><div><b>${esc(f.n)}</b>${ok ? "" : `<em>requiere ${esc(why)}</em>`}<small>${esc(f.t.slice(0, 200))}…</small>${W.epic.feat === f.n ? `<span class="row">+1 a ${f.ab.map(k => `<button class="btn small" data-epab="${k}" aria-pressed="${W.epic.ab === k}">${AB_SHORT[k]}</button>`).join("")}</span>` : ""}</div></label>`; }).join("")}</div>`;
  } else if (cur === "magic") {
    const r0 = I.prevRow, r1 = I.row, addPrep = Math.max(0, num(r1["Conjuros preparados"]) - num(r0["Conjuros preparados"])), addCan = Math.max(0, num(r1["Trucos"]) - num(r0["Trucos"]));
    const maxLv = Math.max(0, ...Object.keys(I.slotsAfter).map(Number));
    const lc = c.cls.toLowerCase(), have = new Set((c.spells && c.spells.list || []).map(x => (x.name || "").toLowerCase()));
    const q = W.spellQ.toLowerCase();
    const pool = (CONJ() || []).filter(sp => (sp.cls || "").toLowerCase().includes(lc) && sp.lvl <= maxLv && !have.has(sp.n.toLowerCase()) && (!q || sp.n.toLowerCase().includes(q)));
    const picked = W.spells, pc = picked.filter(n => (CONJ().find(x => x.n === n) || {}).lvl === 0).length, pp = picked.length - pc;
    body = `<div class="chg">${I.slotCh.map(([l, a, b]) => `<span>Espacios de nivel ${l} <s>${a}</s> → <b>${b}</b></span>`).join("") || `<span>Tus espacios no cambian</span>`}<span>Conjuros de hasta nivel <b>${maxLv}</b></span></div>
      <p>${addCan ? `Aprendes <b>${addCan} truco${addCan > 1 ? "s" : ""}</b> nuevo${addCan > 1 ? "s" : ""}. ` : ""}${addPrep ? `Puedes preparar <b>${addPrep} conjuro${addPrep > 1 ? "s" : ""} más</b>${c.cls === "Mago" ? " (y añadir dos a tu libro)" : ""}. ` : ""}${!addCan && !addPrep ? "No ganas conjuros nuevos en este nivel. " : ""}${["Bardo", "Hechicero", "Brujo"].includes(c.cls) ? "Al subir de nivel también puedes cambiar uno de tus conjuros por otro de tu lista." : ["Clérigo", "Druida", "Mago"].includes(c.cls) ? "Recuerda: tras un descanso largo puedes cambiar los que tengas preparados." : ""}</p>
      ${addCan || addPrep || c.cls === "Mago" ? `<div class="spsel"><input id="spq" placeholder="Buscar conjuro de ${esc(c.cls.toLowerCase())}…" value="${esc(W.spellQ)}"><small>Elegidos: ${pc}${addCan ? "/" + addCan : ""} trucos · ${pp}${addPrep ? "/" + (addPrep + (c.cls === "Mago" ? 2 : 0)) : ""} conjuros</small>
        <div class="splist">${pool.slice(0, 60).map(sp => `<label class="spopt ${picked.includes(sp.n) ? "on" : ""}"><input type="checkbox" data-sp="${esc(sp.n)}" ${picked.includes(sp.n) ? "checked" : ""}><i>${sp.lvl || "T"}</i><b>${esc(sp.n)}</b><small>${esc(sp.esc || "")}</small></label>`).join("") || `<p class="empty">Sin resultados.</p>`}</div></div>` : ""}`;
  } else if (cur === "sum") {
    const ab = abilitiesAfter(c, I), subNew = needs(c, I).sub ? W.sub : c.subclass;
    body = `<div class="sumtab">
      <div><small>Nivel</small><b>${c.level} → ${L}</b></div>
      <div><small>PG máximos</small><b>${c.hp.max} → ${c.hp.max + gain}</b></div>
      <div><small>Competencia</small><b>${sign(prof(c.level))} → ${sign(prof(L))}</b></div>
      ${subNew !== c.subclass ? `<div><small>Subclase</small><b>${esc(subNew || "—")}</b></div>` : ""}
      ${ABILITIES.filter(([k]) => ab[k] !== (+c.abilities[k] || 10)).map(([k, n]) => `<div><small>${n}</small><b>${c.abilities[k]} → ${ab[k]}</b></div>`).join("")}
      ${featPicked(c, I) ? `<div><small>Dote</small><b>${esc(featPicked(c, I))}</b></div>` : ""}
      ${I.slotCh.length ? `<div><small>Espacios</small><b>${I.slotCh.map(([l, a, b]) => `nv${l}: ${b}`).join(" · ")}</b></div>` : ""}
      ${W.spells.length ? `<div><small>Conjuros nuevos</small><b>${esc(W.spells.join(", "))}</b></div>` : ""}
      <div class="wide"><small>Rasgos que se añaden a tu ficha</small><b>${esc(newFeatures(c, I, L).map(f => f.name).join(", ") || "—")}</b></div></div>
      ${problems(c, I).length ? `<p class="warn">⚠ ${problems(c, I).map(esc).join(" · ")}</p>` : ""}`;
  }
  ov.innerHTML = `<div class="modalbox"><header><h3>⬆ Subir a nivel ${L} · ${esc(c.name)}</h3><button class="x" data-close aria-label="Cerrar">✕</button></header>
    <nav class="wsteps">${ST.map(([k, n], i) => `<button data-step="${i}" class="${i === W.step ? "on" : i < W.step ? "done" : ""}">${i + 1}. ${n}</button>`).join("")}</nav>
    <div class="wbody">${body}</div>
    <footer>${W.step > 0 ? `<button class="btn" data-prev>← Atrás</button>` : ""}<span class="grow"></span>${cur === "sum" ? `<button class="btn gold" data-ok ${problems(c, I).length ? "disabled" : ""}>✓ Confirmar nivel ${L}</button>` : `<button class="btn gold" data-next>Siguiente →</button>`}</footer></div>`;
  bindW(ov, c, I, ST, L, hd, gain);
}
const CONJ = () => window.__conj;
function abilitiesAfter(c, I) {
  const out = Object.fromEntries(ABILITIES.map(([k]) => [k, +c.abilities[k] || 10]));
  if (needs(c, I).asi) { const a = W.asi; if (a.mode === "abil") { if (a.a) out[a.a] = Math.min(20, out[a.a] + 1); if (a.b) out[a.b] = Math.min(20, out[a.b] + 1); } else if (a.mode === "feat" && a.a) out[a.a] = Math.min(20, out[a.a] + 1); }
  if (needs(c, I).epic && W.epic.ab) out[W.epic.ab] = Math.min(30, out[W.epic.ab] + 1);
  return out;
}
function featPicked(c, I) {
  const n = needs(c, I), r = [];
  if (n.asi && W.asi.mode === "feat" && W.asi.feat) r.push(W.asi.feat === "__otra" ? (W.asi.other || "Dote") : W.asi.feat);
  if (n.epic && W.epic.feat) r.push(W.epic.feat);
  return r.join(", ");
}
function problems(c, I) {
  const n = needs(c, I), p = [];
  if (n.sub && !W.sub) p.push("elige la subclase");
  if (n.asi && W.asi.mode === "abil" && !(W.asi.a && W.asi.b) && !(W.asi.a && !W.asi.b && false)) { if (!W.asi.a) p.push("reparte la mejora de característica"); else if (!W.asi.b) p.push("te falta 1 punto de la mejora (pulsa otra característica, o la misma para +2)"); }
  if (n.asi && W.asi.mode === "feat" && !W.asi.feat) p.push("elige la dote");
  if (n.asi && W.asi.mode === "feat" && W.asi.feat && W.asi.feat !== "__otra") { const f = FEATS.find(x => x.n === W.asi.feat); if (f && f.ab.length && !W.asi.a) p.push("elige qué característica sube la dote"); }
  if (n.epic && !W.epic.feat) p.push("elige el don épico");
  if (n.epic && W.epic.feat && !W.epic.ab) p.push("elige qué característica sube el don");
  return p;
}
function newFeatures(c, I, L) {
  const out = [];
  I.items.forEach(i => { if (i.k === "f") out.push({ name: i.n, text: `(${c.cls} ${L}) ${i.t}` }); });
  (needs(c, I).sub && W.sub === (I.P.sub || {}).n ? (I.P.sub.lv[L] || []) : I.subFeats).forEach(i => out.push({ name: i.n, text: `(${W.sub || c.subclass} ${L}) ${i.t}` }));
  const fp = featPicked(c, I); if (fp) fp.split(", ").forEach(n => { const f = FEATS.find(x => x.n === n); out.push({ name: n, text: f ? `(Dote) ${f.t}` : "(Dote)" }); });
  const have = new Set((c.features || []).map(f => (f.name || "").toLowerCase()));
  return out.filter(f => !have.has(f.name.toLowerCase()) || /Mejora|Pericia/.test(f.name));
}
function bindW(ov, c, I, ST, L, hd, gain) {
  const go = n => { W.step = Math.max(0, Math.min(ST.length - 1, n)); draw(); };
  $("[data-close]", ov).onclick = close;
  $$("[data-step]", ov).forEach(b => b.onclick = () => go(+b.dataset.step));
  const nx = $("[data-next]", ov); if (nx) nx.onclick = () => go(W.step + 1);
  const pv = $("[data-prev]", ov); if (pv) pv.onclick = () => go(W.step - 1);
  $$("[data-hp]", ov).forEach(b => b.onclick = () => { W.roll = b.dataset.hp === "roll" ? 1 + Math.floor(Math.random() * hd) : 0; draw(); });
  $$("input[name=sub]", ov).forEach(r => r.onchange = () => { W.sub = r.value === "__otra" ? ($("#subother", ov).value.trim() || "") : r.value; draw(); });
  const so = $("#subother", ov); if (so) so.oninput = () => { W.sub = so.value.trim(); const r = $("input[name=sub][value=__otra]", ov); if (r) r.checked = true; };
  $$("[data-asim]", ov).forEach(b => b.onclick = () => { W.asi = { mode: b.dataset.asim, a: "", b: "", feat: "" }; draw(); });
  $$("[data-ab]", ov).forEach(b => b.onclick = () => { const k = b.dataset.ab, a = W.asi; if (!a.a) a.a = k; else if (!a.b) a.b = k; else { a.a = k; a.b = ""; } draw(); });
  const ac = $("[data-abclear]", ov); if (ac) ac.onclick = () => { W.asi.a = W.asi.b = ""; draw(); };
  $$("input[name=feat]", ov).forEach(r => r.onchange = () => { W.asi.feat = r.value; W.asi.a = ""; draw(); });
  const fo = $("#featother", ov); if (fo) fo.oninput = () => { W.asi.other = fo.value; };
  $$("[data-featab]", ov).forEach(b => b.onclick = e => { e.preventDefault(); W.asi.a = b.dataset.featab; draw(); });
  $$("input[name=epic]", ov).forEach(r => r.onchange = () => { W.epic = { feat: r.value, ab: "" }; draw(); });
  $$("[data-epab]", ov).forEach(b => b.onclick = e => { e.preventDefault(); W.epic.ab = b.dataset.epab; draw(); });
  const q = $("#spq", ov); if (q) q.oninput = () => { W.spellQ = q.value; const pos = q.selectionStart; draw(); const q2 = $("#spq", document.getElementById("lvlwiz")); if (q2) { q2.focus(); q2.setSelectionRange(pos, pos); } };
  $$("[data-sp]", ov).forEach(x => x.onchange = () => { const n = x.dataset.sp; W.spells = x.checked ? [...W.spells, n] : W.spells.filter(y => y !== n); draw(); });
  const ok = $("[data-ok]", ov); if (ok) ok.onclick = () => apply(c, I, L, gain);
}
function apply(c0, I, L, gain) {
  const ab = abilitiesAfter(c0, I), feats = newFeatures(c0, I, L), n = needs(c0, I), spells = W.spells.slice(), subNew = n.sub ? W.sub : null;
  const slots = I.slotsAfter, isPact = I.P.cols.includes("Espacios de pacto"), fp = featPicked(c0, I);
  store.commit("char", s => {
    const c = s.characters.find(x => x.id === c0.id); if (!c) return;
    c.level = L; c.hp.max += gain; c.hp.cur += gain;
    ABILITIES.forEach(([k]) => { c.abilities[k] = ab[k]; });
    if (subNew) c.subclass = subNew;
    c.features = c.features || []; feats.forEach(f => c.features.push({ id: "f-" + Math.random().toString(36).slice(2, 8), name: f.name, text: f.text.slice(0, 900) }));
    if (classInfo(c.cls).cast) {
      c.spells = c.spells || { slots: {}, list: [] }; c.spells.slots = c.spells.slots || {};
      Object.entries(slots).forEach(([l, m]) => { const cur = c.spells.slots[l] || { max: 0, used: 0 }; c.spells.slots[l] = { max: m, used: Math.min(cur.used || 0, m), ...(isPact ? { pact: true } : {}) }; });
      spells.forEach(nm => { const d = (window.__conj || []).find(x => x.n === nm); c.spells.list.push({ id: "s-" + Math.random().toString(36).slice(2, 8), name: nm, level: d ? d.lvl : 0, prepared: true }); });
    }
    if ((+c.lvlGrant || 0) <= c.level) delete c.lvlGrant;
    c.levelLog = c.levelLog || []; c.levelLog.push({ lvl: L, at: Date.now(), hp: gain, sub: subNew || undefined, feat: fp || undefined, spells: spells.length ? spells : undefined });
  });
  close(); toast(`⬆ ${c0.name} sube a nivel ${L}`);
}

// Los conjuros del SRD (para elegir los nuevos): se cargan una vez
srd("conjuros").then(list => { window.__conj = list; if (W) draw(); }).catch(() => {});
