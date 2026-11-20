// Asistente de creación de personaje (SRD 5.2.1, «Creación de personajes»): clase → origen (trasfondo y especie) →
// características → habilidades → rasgos y dotes → conjuros → equipo e idiomas → detalles → resumen.
// Todo sale de js/data/creacion.js, equipo.js y progresion.js; la ficha se calcula sola (PG, CA, ataques, salvaciones…).
import { store } from "../core/store.js";
import { PROG, FEATS } from "../data/progresion.js";
import { ABILITIES, AB_SHORT, SKILLS, mod, sign, newCharacter } from "../data/dnd.js";
import { CLS, CLASS_PICK, BACKGROUNDS, SPECIES, ORIGIN_FEATS, PACKS, STANDARD, POINT_COST, POINTS, LANGS, LANGS_RARE, ALIGN } from "../data/creacion.js";
import { weaponOf, armorOf, WEAPONS } from "../data/equipo.js";
import { srd } from "../core/srd.js";
import { $, $$, esc, toast } from "../core/ui.js";

const AB = Object.fromEntries(ABILITIES), SKN = Object.fromEntries(SKILLS.map(([k, n]) => [k, n]));
const ABK = ABILITIES.map(a => a[0]);
const PROF = 2; // nivel 1
const STEPS = [["cls", "Clase"], ["origin", "Origen"], ["abil", "Características"], ["skills", "Habilidades"], ["feats", "Rasgos y dotes"], ["magic", "Conjuros"], ["gear", "Equipo e idiomas"], ["det", "Detalles"], ["sum", "Resumen"]];
let W = null, onDone = null;

export function openCreate({ owner = null, color = "#8a9a4a", name = "", done = null } = {}) {
  onDone = done;
  W = { step: 0, owner, color, name, cls: "", bg: "", sp: "", spOpt: "", size: "", castAb: "", spSkill: "",
    method: "std", pool: STANDARD.slice(), asg: null, pts: Object.fromEntries(ABK.map(k => [k, 8])), rolls: null,
    inc: { mode: "21", a: "", b: "" }, skills: [], extraSkill: "", habil: [], expertise: [],
    feat2: "", feat2List: "mago", featAb: "car", feat2Ab: "car", clsPick: "", style: "", mastery: [],
    cantrips: [], prepared: [], init1: { c: [], s: "" }, init2: { c: [], s: "" },
    eqC: 0, eqB: 0, langs: [], align: "", notes: "", q: "" };
  const ov = document.createElement("div"); ov.className = "reqdlg lvlwiz newwiz"; ov.id = "newwiz"; document.body.appendChild(ov);
  srd("conjuros").then(l => { window.__conj = l; draw(); }).catch(() => {});
  draw();
}
const close = () => { const o = document.getElementById("newwiz"); if (o) o.remove(); W = null; };
const C = () => CLS[W.cls], B = () => BACKGROUNDS[W.bg], S = () => SPECIES[W.sp];
const spOpt = () => S() && S().choice ? S().choice.opts.find(o => o.n === W.spOpt) : null;
const P0 = () => (PROG[W.cls] ? Object.fromEntries(PROG[W.cls].cols.map((c, i) => [c, PROG[W.cls].rows[0][i]])) : {});
const num = v => +String(v || "").replace(/[^\d]/g, "") || 0;
const CONJ = () => window.__conj || [];
const spellsOf = (list, lvl) => CONJ().filter(sp => sp.lvl === lvl && (sp.cls || "").toLowerCase().split(/,\s*/).includes(list));
const clsList = () => W.cls.toLowerCase();
/** Conjuros ya elegidos o concedidos fuera de «key» (para no repetir el mismo en dos sitios). */
function taken(key) {
  const t = new Set(freeSpells().map(x => x[0]));
  if (key !== "cantrips") W.cantrips.forEach(n => t.add(n));
  if (key !== "prepared") W.prepared.forEach(n => t.add(n));
  ["init1", "init2"].forEach(k => { if (k !== key) { W[k].c.forEach(n => t.add(n)); if (W[k].s) t.add(W[k].s); } });
  return t;
}
const pick = () => (CLASS_PICK[W.cls] || { opts: [] }).opts.find(o => o.n === W.clsPick);

/* ---------- Cálculos ---------- */
function baseScores() {
  if (W.method === "points") return { ...W.pts };
  if (!W.asg) return null;
  return Object.fromEntries(ABK.map(k => [k, W.pool[W.asg[k]]]));
}
function scores() {
  const b = baseScores(); if (!b) return null;
  const o = { ...b }, bg = B();
  if (bg) {
    if (W.inc.mode === "111") bg.ab.forEach(k => { o[k] += 1; });
    else { if (W.inc.a) o[W.inc.a] += 2; if (W.inc.b) o[W.inc.b] += 1; }
  }
  ABK.forEach(k => { o[k] = Math.min(20, o[k]); });
  return o;
}
const feats = () => [B() && B().feat, S() && S().extraFeat ? W.feat2 : ""].filter(Boolean);
const hasFeat = n => feats().includes(n);
function arms() { const a = { ...(C() || {}).arms }; const p = pick(); if (p && p.arms) Object.assign(a, p.arms); return a; }
function armorTrain() { const a = { ...(C() || {}).armor }; const p = pick(); if (p && p.armor) Object.assign(a, p.armor); return a; }
const profWith = w => { const a = arms(); if (w.c === "sencilla") return !!a.simple; if (a.martial) return true; return !!(a.martialIf || []).some(p => w.p.toLowerCase().includes(p)); };
function gear() {
  const out = [], add = (opt, src) => { (opt.items || []).forEach(([n, q]) => { const e = out.find(x => x.n === n); if (e) e.q += q; else out.push({ n, q, src }); }); };
  if (C()) add(C().equip[W.eqC] || {}, "clase");
  if (B()) add(B().equip[W.eqB] || {}, "trasfondo");
  const po = (C() ? (C().equip[W.eqC] || {}).po || 0 : 0) + (B() ? (B().equip[W.eqB] || {}).po || 0 : 0);
  return { items: out, po };
}
function acOf(sc) {
  const g = gear().items, body = g.map(i => armorOf(i.n)).find(a => a && a.cat !== "escudo"), shield = g.some(i => i.n === "Escudo") && armorTrain().escudo;
  const d = mod(sc.des);
  let ac, how;
  if (body) { ac = body.ca + (body.dex === 0 ? 0 : body.dex == null ? d : Math.min(body.dex, d)); how = body.n; if (W.style === "Defensa") { ac += 1; how += " + Defensa"; } }
  else if (C() && C().unarmored === "con") { ac = 10 + d + mod(sc.con); how = "Defensa sin armadura (DES + CON)"; }
  else if (C() && C().unarmored === "sab" && !shield) { ac = 10 + d + mod(sc.sab); how = "Defensa sin armadura (DES + SAB)"; }
  else { ac = 10 + d; how = "Sin armadura"; }
  if (shield) { ac += 2; how += " + escudo"; }
  const untrained = body && !armorTrain()[body.cat];
  return { ac, how, untrained, body };
}
function weaponsOf(sc) {
  const out = [];
  gear().items.forEach(({ n, q }) => {
    const w = weaponOf(n); if (!w) return;
    const pr = w.p.toLowerCase(), fin = pr.includes("sutil"), ranged = w.r === "dist";
    const ab = fin ? (mod(sc.des) >= mod(sc.fue) ? "des" : "fue") : ranged ? "des" : "fue";
    const m = mod(sc[ab]), ok = profWith(w), archery = W.style === "Tiro con arco" && ranged;
    const atk = m + (ok ? PROF : 0) + (archery ? 2 : 0);
    const r = (w.p.match(/alcance ([\d,]+)\/([\d,]+)/) || []);
    const notes = [];
    if (ranged && r[1]) notes.push(`Distancia ${r[1]}/${r[2]} m`);
    else if (/arrojadiz/.test(pr) && r[1]) notes.push(`Cuerpo a cuerpo 1,5 m o arrojadiza ${r[1]}/${r[2]} m`);
    else if (/gran alcance/.test(pr)) notes.push("Alcance 3 m");
    if (w.p !== "—") notes.push(w.p.replace(/\s*\(alcance [^)]*\)/, m => m.includes(";") ? ` (${m.split(";")[1].trim()}` : ""));
    if (W.mastery.includes(w.n)) notes.push(`Maestría: ${w.m}`);
    if (!ok) notes.push("sin competencia");
    if (q > 1) notes.push(`×${q}`);
    out.push({ name: w.n, atk: sign(atk).replace("−", "-"), dmg: `${w.d}${m ? (m > 0 ? "+" : "-") + Math.abs(m) : ""} ${w.t}`, notes: notes.join(". "), weight: Math.round(w.kg * q * 100) / 100 });
  });
  return out;
}
const fixedSkills = () => [...(B() ? B().skills : [])];
function allSkills() {
  const s = new Set([...fixedSkills(), ...W.skills, ...(W.spSkill ? [W.spSkill] : []), ...(W.extraSkill ? [W.extraSkill] : []), ...W.habil]);
  return s;
}
/** Habilidades que ya da otra fuente (para no elegir la misma dos veces). */
function skillsBut(src) {
  const t = new Set(fixedSkills());
  if (src !== "cls") W.skills.forEach(k => t.add(k));
  if (src !== "sp" && W.spSkill) t.add(W.spSkill);
  if (src !== "ex" && W.extraSkill) t.add(W.extraSkill);
  if (src !== "hab") W.habil.forEach(k => t.add(k));
  return t;
}
function magicNeeds() {
  const p0 = P0(), out = { can: 0, prep: 0, book: 0 };
  if (p0["Trucos"]) out.can = num(p0["Trucos"]);
  if (p0["Conjuros preparados"]) out.prep = num(p0["Conjuros preparados"]);
  const p = pick(); if (p && p.cantrip) out.can += 1;
  if (W.cls === "Mago") out.book = 6;
  return out;
}
const initiates = () => { const r = []; if (B() && B().feat === "Iniciado en la magia") r.push(["init1", B().featList]); if (W.feat2 === "Iniciado en la magia") r.push(["init2", W.feat2List]); return r; };
function freeSpells() {
  const r = [];
  (S() && S().spells || []).forEach(n => r.push([n, W.sp]));
  (spOpt() && spOpt().spells || []).forEach(n => r.push([n, W.spOpt]));
  const p = pick(); if (p && p.spell) r.push([p.spell, p.n]);
  if (W.cls === "Explorador") r.push(["Marca del cazador", "Enemigo predilecto"]);
  return r;
}
function langsAuto() { const r = ["Común"]; if (W.cls === "Pícaro") r.push("Jerga de ladrones"); if (W.cls === "Druida") r.push("Druídico"); return r; }
const langsN = () => 2 + (W.cls === "Pícaro" ? 1 : 0);

/* ---------- Comprobaciones por paso ---------- */
function problems(step) {
  const p = [], sc = scores();
  if (step === "cls" && !W.cls) p.push("elige una clase");
  if (step === "origin") {
    if (!W.bg) p.push("elige un trasfondo"); if (!W.sp) p.push("elige una especie");
    if (S() && S().choice && !W.spOpt) p.push(`elige ${S().choice.name.toLowerCase()}`);
    if (S() && S().sizePick && !W.size) p.push("elige el tamaño");
    if (S() && S().castAb && !W.castAb) p.push("elige la aptitud mágica de tu linaje");
    if (S() && S().extraFeat && !W.feat2) p.push("elige la dote de origen de Versátil");
    if (S() && S().extraFeat && B() && W.feat2 && W.feat2 === B().feat && !["Habilidoso", "Iniciado en la magia"].includes(W.feat2)) p.push(`ya tienes ${W.feat2} por el trasfondo: elige otra dote en Versátil`);
    if (S() && S().extraFeat && B() && W.feat2 === "Iniciado en la magia" && B().featList === W.feat2List) p.push("Iniciado en la magia se repite con otra lista de conjuros: cambia la lista");
  }
  if (step === "abil") {
    if (!baseScores()) p.push(W.method === "roll" ? "tira y asigna las puntuaciones" : "asigna las puntuaciones");
    if (W.method === "points" && spent() > POINTS) p.push(`te pasas de ${POINTS} puntos`);
    if (W.method === "points" && spent() < POINTS) p.push(`te quedan ${POINTS - spent()} puntos por gastar`);
    if (B() && W.inc.mode === "21" && (!W.inc.a || !W.inc.b)) p.push("reparte el +2 y el +1 del trasfondo");
  }
  if (step === "skills" && C()) {
    if (W.skills.length !== C().n) p.push(`elige ${C().n} habilidades de clase (llevas ${W.skills.length})`);
    if (S() && S().skillPick && !W.spSkill) p.push("elige la habilidad de Sentidos agudos");
    if (S() && S().extraSkill && !W.extraSkill) p.push("elige la habilidad de Diestro");
    if (hasFeat("Habilidoso") && W.habil.length !== 3) p.push("elige 3 habilidades de Habilidoso");
    const srcs = [...fixedSkills(), ...W.skills, ...(W.spSkill ? [W.spSkill] : []), ...(W.extraSkill ? [W.extraSkill] : []), ...W.habil];
    if (new Set(srcs).size < srcs.length) p.push("hay una habilidad elegida dos veces: cambia una por otra");
    if (C().expertise && W.expertise.length !== C().expertise) p.push(`elige ${C().expertise} habilidades con pericia`);
  }
  if (step === "feats") {
    if (CLASS_PICK[W.cls] && !W.clsPick) p.push(`elige ${CLASS_PICK[W.cls].name.toLowerCase()}`);
    if (W.cls === "Guerrero" && !W.style) p.push("elige un estilo de combate");
    if (C() && C().mastery && W.mastery.length !== C().mastery) p.push(`elige ${C().mastery} armas para Maestría`);
  }
  if (step === "magic") {
    const n = magicNeeds();
    if (n.can && W.cantrips.length !== n.can) p.push(`elige ${n.can} trucos (llevas ${W.cantrips.length})`);
    const want = n.book || n.prep;
    if (want && W.prepared.length !== want) p.push(`elige ${want} conjuros de nivel 1 (llevas ${W.prepared.length})`);
    initiates().forEach(([k]) => { if (W[k].c.length !== 2 || !W[k].s) p.push("completa los conjuros de Iniciado en la magia"); });
  }
  if (step === "gear" && W.langs.length !== langsN()) p.push(`elige ${langsN()} idiomas`);
  if (step === "det" && !W.name.trim()) p.push("ponle nombre");
  if (step === "sum") STEPS.slice(0, -1).forEach(([k]) => p.push(...problems(k)));
  return p;
}
const spent = () => ABK.reduce((t, k) => t + POINT_COST[W.pts[k]], 0);
const hasMagicStep = () => { const n = magicNeeds(); return n.can || n.prep || n.book || initiates().length || freeSpells().length; };

/* ---------- Pintar ---------- */
const chk = (on, attrs, label, extra = "") => `<label class="spopt ${on ? "on" : ""}"><input type="checkbox" ${attrs} ${on ? "checked" : ""}>${label}${extra}</label>`;
const radio = (on, attrs, title, text = "", dis = false) => `<label class="featopt ${on ? "on" : ""} ${dis ? "no" : ""}"><input type="radio" ${attrs} ${on ? "checked" : ""} ${dis ? "disabled" : ""}><div><b>${title}</b>${text ? `<small>${text}</small>` : ""}</div></label>`;
function draw() {
  const ov = document.getElementById("newwiz"); if (!ov || !W) return;
  const cur = STEPS[W.step][0];
  let body = "";
  if (cur === "cls") {
    body = `<p class="lead">¿Qué clase de aventurero vas a ser? Marca casi todo lo demás.</p><div class="clsgrid">${Object.entries(CLS).map(([n, c]) =>
      `<button class="clsopt ${W.cls === n ? "on" : ""}" data-cls="${esc(n)}"><b>${esc(n)}</b><small>${esc(c.main)} · d${c.hd} · salv. ${c.saves.map(k => AB_SHORT[k]).join("+")}</small><small>${esc(c.armorTxt)}</small></button>`).join("")}</div>
      ${C() ? `<div class="chg"><span>Dado de golpe <b>d${C().hd}</b></span><span>Habilidades: elige <b>${C().n}</b></span><span>${esc(C().armsTxt)}</span>${C().tools ? `<span>${esc(C().tools)}</span>` : ""}</div>
        <div class="gains">${(PROG[W.cls].lv[1] || []).map(i => `<details class="gain"><summary><b>${esc(i.n)}</b><em>nivel 1</em></summary><p>${esc(i.t)}</p></details>`).join("")}</div>` : ""}`;
  } else if (cur === "origin") {
    const s = S();
    body = `<h4>Trasfondo</h4><div class="featlist">${Object.entries(BACKGROUNDS).map(([n, b]) => radio(W.bg === n, `name="bg" value="${esc(n)}"`, esc(n),
      `${b.ab.map(k => AB[k]).join(", ")} · dote ${esc(b.feat)}${b.featList ? ` (${b.featList})` : ""} · ${b.skills.map(k => SKN[k]).join(" y ")} · ${esc(b.tools)}`)).join("")}</div>
      <h4>Especie</h4><div class="clsgrid">${Object.entries(SPECIES).map(([n, x]) => `<button class="clsopt ${W.sp === n ? "on" : ""}" data-sp="${esc(n)}"><b>${esc(n)}</b><small>${esc(x.size)} · ${String(x.speed).replace(".", ",")} m${x.dv ? ` · visión ${x.dv} m` : ""}</small></button>`).join("")}</div>
      ${s ? `<div class="gains">${s.traits.map(([n, t]) => `<details class="gain"><summary><b>${esc(n)}</b></summary><p>${esc(t)}</p></details>`).join("")}</div>
        ${s.choice ? `<h4>${esc(s.choice.name)}</h4><div class="featlist">${s.choice.opts.map(o => radio(W.spOpt === o.n, `name="spopt" value="${esc(o.n)}"`, esc(o.n), esc(o.t))).join("")}</div>` : ""}
        ${s.sizePick ? `<h4>Tamaño</h4><div class="row">${["Mediano", "Pequeño"].map(z => `<button class="btn small ${W.size === z ? "gold" : ""}" data-size="${z}">${z}</button>`).join("")}</div>` : ""}
        ${s.extraFeat ? `<h4>Versátil (humano): otra dote de origen</h4><div class="featlist">${Object.entries(ORIGIN_FEATS).map(([n, t]) => radio(W.feat2 === n, `name="feat2" value="${esc(n)}"`, esc(n) + (n === "Habilidoso" ? " · recomendada" : ""), esc(t.slice(0, 170)) + "…", n === (B() || {}).feat && n !== "Habilidoso" && n !== "Iniciado en la magia")).join("")}</div>
        ${W.feat2 === "Iniciado en la magia" ? `<div class="row">Lista: ${["clérigo", "druida", "mago"].filter(l => !(B() && B().featList === l)).map(l => `<button class="btn small ${W.feat2List === l ? "gold" : ""}" data-f2list="${l}">${l}</button>`).join("")}</div>` : ""}` : ""}
        ${s.castAb ? `<h4>Aptitud mágica del linaje</h4><div class="row">${["int", "sab", "car"].map(k => `<button class="btn small ${W.castAb === k ? "gold" : ""}" data-castab="${k}">${AB[k]}</button>`).join("")}</div>` : ""}` : ""}`;
  } else if (cur === "abil") {
    const sc = scores(), bs = baseScores(), bg = B();
    const used = W.asg ? Object.values(W.asg) : [];
    body = `<div class="row">${[["std", "Conjunto estándar"], ["points", "Coste en puntos"], ["roll", "Tirar 4d6"]].map(([k, n]) => `<button class="btn small ${W.method === k ? "gold" : ""}" data-method="${k}">${n}</button>`).join("")}</div>
      <p class="note">${W.method === "std" ? `15, 14, 13, 12, 10 y 8. Te las propongo según la tabla «Conjunto estándar por clase»; cambia cualquiera y se intercambia con la otra.` : W.method === "points" ? `Tienes ${POINTS} puntos; cada puntuación va de 8 a 15. Gastados: <b>${spent()}</b>/${POINTS}.` : `Tira 4d6 seis veces y quédate con los tres dados más altos de cada tirada. Luego asígnalas.`}</p>
      ${W.method === "roll" ? `<div class="row"><button class="btn gold small" data-roll>🎲 ${W.rolls ? "Volver a tirar" : "Tirar"}</button>${W.rolls ? W.rolls.map(r => `<span class="cpill">${r.d.join("+")} → <b>${r.v}</b></span>`).join("") : ""}</div>` : ""}
      <div class="abgrid">${ABILITIES.map(([k, n]) => {
        const base = bs ? bs[k] : null, inc = sc && base != null ? sc[k] - base : 0;
        const ctl = W.method === "points" ? `<span class="row"><button class="btn small" data-pm="${k}:-1" ${W.pts[k] <= 8 ? "disabled" : ""}>−</button><b>${W.pts[k]}</b><button class="btn small" data-pm="${k}:1" ${W.pts[k] >= 15 ? "disabled" : ""}>+</button></span><small>coste ${POINT_COST[W.pts[k]]}</small>`
          : W.asg ? `<select data-asg="${k}">${W.pool.map((v, i) => `<option value="${i}" ${W.asg[k] === i ? "selected" : ""}>${v}</option>`).join("")}</select>` : `<em>—</em>`;
        return `<div class="abcell ${C() && C().main.includes(n) ? "main" : ""}"><small>${n}${bg && bg.ab.includes(k) ? " ✦" : ""}</small>${ctl}${sc ? `<div class="abres"><b>${sc[k]}</b><i>(${sign(mod(sc[k]))})</i>${inc ? `<em>✦+${inc}</em>` : ""}</div>` : ""}</div>`;
      }).join("")}</div>
      ${bg ? `<h4>Aumentos del trasfondo (${esc(W.bg)}: ✦ ${bg.ab.map(k => AB[k]).join(", ")})</h4>
        <div class="row"><button class="btn small ${W.inc.mode === "21" ? "gold" : ""}" data-inc="21">+2 a una y +1 a otra</button><button class="btn small ${W.inc.mode === "111" ? "gold" : ""}" data-inc="111">+1 a las tres</button></div>
        ${W.inc.mode === "21" ? `<div class="row">${bg.ab.map(k => `<span class="cpill">${AB[k]} <button class="btn small ${W.inc.a === k ? "gold" : ""}" data-inca="${k}">+2</button><button class="btn small ${W.inc.b === k ? "gold" : ""}" data-incb="${k}">+1</button></span>`).join("")}</div>` : ""}
        <p class="note">Ninguna puntuación puede pasar de 20.</p>` : ""}`;
  } else if (cur === "skills") {
    const c = C(), fx = fixedSkills(), have = allSkills();
    body = !c ? `<p class="note">Elige antes la clase.</p>` : `<p>Del trasfondo (${esc(W.bg || "—")}): <b>${fx.map(k => SKN[k]).join(", ") || "—"}</b></p>
      <h4>De la clase: elige ${c.n}</h4><div class="splist">${c.skills.map(k => { const had = !W.skills.includes(k) && skillsBut("cls").has(k); return chk(W.skills.includes(k), `data-csk="${k}" ${had ? "disabled" : ""}`, `<b>${SKN[k]}</b>`, had ? "<small>ya la tienes</small>" : ""); }).join("")}</div>
      ${S() && S().skillPick ? `<h4>Sentidos agudos (elfo)</h4><div class="row">${S().skillPick.map(k => `<button class="btn small ${W.spSkill === k ? "gold" : ""}" data-spsk="${k}" ${skillsBut("sp").has(k) ? "disabled" : ""}>${SKN[k]}</button>`).join("")}</div>` : ""}
      ${S() && S().extraSkill ? `<h4>Diestro (humano): una habilidad a tu elección</h4><select data-exsk><option value="">—</option>${SKILLS.filter(([k]) => !skillsBut("ex").has(k)).map(([k, n]) => `<option value="${k}" ${W.extraSkill === k ? "selected" : ""}>${n}</option>`).join("")}</select>` : ""}
      ${hasFeat("Habilidoso") ? `<h4>Habilidoso: elige 3</h4><div class="splist">${SKILLS.map(([k, n]) => chk(W.habil.includes(k), `data-hab="${k}" ${skillsBut("hab").has(k) ? "disabled" : ""}`, `<b>${n}</b>`)).join("")}</div><p class="note">La dote permite también herramientas: si prefieres alguna, apúntala en Competencias de la ficha.</p>` : ""}
      ${c.expertise ? `<h4>Pericia (pícaro): elige ${c.expertise} de tus habilidades</h4><div class="splist">${[...have].map(k => chk(W.expertise.includes(k), `data-exp="${k}"`, `<b>${SKN[k]}</b>`)).join("")}</div><p class="note">Se recomiendan Juego de manos y Sigilo si eres competente en ellas.</p>` : ""}`;
  } else if (cur === "feats") {
    const cp = CLASS_PICK[W.cls], c = C();
    const masteryPool = c && c.mastery ? WEAPONS.filter(w => (W.cls === "Bárbaro" ? w.r === "cac" : true) && profWith(w)) : [];
    body = `${B() ? `<h4>Dote de origen del trasfondo</h4><div class="gain"><b>${esc(B().feat)}${B().featList ? ` (${B().featList})` : ""}</b><p>${esc(ORIGIN_FEATS[B().feat])}</p></div>` : ""}
      ${S() && S().extraFeat && W.feat2 ? `<h4>Versátil (humano)</h4><div class="gain"><b>${esc(W.feat2)}${W.feat2 === "Iniciado en la magia" ? ` (${W.feat2List})` : ""}</b><p>${esc(ORIGIN_FEATS[W.feat2])}</p></div>` : ""}
      ${cp ? `<h4>${esc(cp.name)}</h4><div class="featlist">${cp.opts.map(o => radio(W.clsPick === o.n, `name="clspick" value="${esc(o.n)}"`, esc(o.n), esc(o.t))).join("")}</div>` : ""}
      ${W.cls === "Guerrero" ? `<h4>Estilo de combate</h4><div class="featlist">${FEATS.filter(f => f.cat === "estilo").map(f => radio(W.style === f.n, `name="style" value="${esc(f.n)}"`, esc(f.n), esc(f.t))).join("")}</div>` : ""}
      ${c && c.mastery ? `<h4>Maestría con armas: elige ${c.mastery} tipos</h4><p class="note">Con esas armas podrás usar su propiedad de maestría. Tras un descanso largo puedes cambiar una.${W.cls === "Bárbaro" ? " (Bárbaro: armas cuerpo a cuerpo.)" : ""}</p>
        <div class="splist">${masteryPool.map(w => chk(W.mastery.includes(w.n), `data-mas="${esc(w.n)}"`, `<b>${esc(w.n)}</b>`, `<small>${esc(w.m)}</small>`)).join("")}</div>` : ""}
      ${!B() && !cp && !(c && c.mastery) ? `<p class="note">Nada que elegir aquí.</p>` : ""}`;
  } else if (cur === "magic") {
    const n = magicNeeds(), q = W.q.toLowerCase(), f = sp => !q || sp.n.toLowerCase().includes(q);
    const list = (arr, key) => { const tk = taken(key); return `<div class="splist">${arr.filter(f).map(sp => chk(W[key].includes(sp.n), `data-${key}="${esc(sp.n)}" ${tk.has(sp.n) ? "disabled" : ""}`, `<i>${sp.lvl || "T"}</i><b>${esc(sp.n)}</b>`, `<small>${tk.has(sp.n) ? "ya lo tienes" : esc(sp.esc || "")}</small>`)).join("")}</div>`; };
    const ini = ([k, l]) => { const tk = taken(k); return `<h4>Iniciado en la magia (${l}): 2 trucos y 1 conjuro de nivel 1</h4>
      <div class="row">Aptitud: ${["int", "sab", "car"].map(a => `<button class="btn small ${(k === "init1" ? W.featAb : W.feat2Ab) === a ? "gold" : ""}" data-iab="${k}:${a}">${AB[a]}</button>`).join("")}</div>
      <div class="splist">${spellsOf(l, 0).filter(f).map(sp => chk(W[k].c.includes(sp.n), `data-ic="${k}:${esc(sp.n)}" ${tk.has(sp.n) ? "disabled" : ""}`, `<i>T</i><b>${esc(sp.n)}</b>`, tk.has(sp.n) ? "<small>ya lo tienes</small>" : "")).join("")}</div>
      <div class="splist">${spellsOf(l, 1).filter(f).map(sp => chk(W[k].s === sp.n, `data-is="${k}:${esc(sp.n)}" ${tk.has(sp.n) ? "disabled" : ""}`, `<i>1</i><b>${esc(sp.n)}</b>`, tk.has(sp.n) ? "<small>ya lo tienes</small>" : "")).join("")}</div>`; };
    body = !CONJ().length ? `<p class="note">Cargando conjuros…</p>` : `<input id="spq" placeholder="Buscar conjuro…" value="${esc(W.q)}">
      ${freeSpells().length ? `<p>Ya los tienes por tu origen o tus rasgos: <b>${freeSpells().map(([s, w]) => `${esc(s)} <small>(${esc(w)})</small>`).join(", ")}</b></p>` : ""}
      ${n.can ? `<h4>Trucos de ${clsList()}: elige ${n.can} · ${W.cantrips.length}/${n.can}</h4>${list(spellsOf(clsList(), 0), "cantrips")}` : ""}
      ${n.book ? `<h4>Libro de conjuros: elige 6 de nivel 1 · ${W.prepared.length}/6</h4><p class="note">De ellos preparas ${n.prep} (los ${n.prep} primeros que marques; podrás cambiarlos tras un descanso largo).</p>${list(spellsOf("mago", 1), "prepared")}`
        : n.prep ? `<h4>Conjuros preparados de nivel 1: elige ${n.prep} · ${W.prepared.length}/${n.prep}</h4>${list(spellsOf(clsList(), 1), "prepared")}` : ""}
      ${initiates().map(ini).join("")}`;
  } else if (cur === "gear") {
    const c = C(), b = B(), g = gear(), sc = scores() || Object.fromEntries(ABK.map(k => [k, 10])), A = acOf(sc);
    const optTxt = o => o.items ? o.items.map(([n, q]) => (q > 1 ? q + " " : "") + n).join(", ") + ` y ${o.po} po` : `${o.po} po`;
    body = `${c ? `<h4>Equipo de ${esc(W.cls.toLowerCase())}</h4><div class="featlist">${c.equip.map((o, i) => radio(W.eqC === i, `name="eqc" value="${i}"`, "ABC"[i], esc(optTxt(o)))).join("")}</div>` : ""}
      ${b ? `<h4>Equipo de ${esc(W.bg.toLowerCase())}</h4><div class="featlist">${b.equip.map((o, i) => radio(W.eqB === i, `name="eqb" value="${i}"`, "AB"[i], esc(optTxt(o)))).join("")}</div>` : ""}
      <div class="chg"><span>CA <b>${A.ac}</b> (${esc(A.how)})</span><span>Monedas <b>${g.po} po</b></span>${A.untrained ? `<span class="warn">⚠ Sin entrenamiento con ${esc(A.body.n.toLowerCase())}: desventaja en pruebas de FUE y DES y no puedes lanzar conjuros</span>` : ""}</div>
      ${g.po && !g.items.length ? `<p class="note">Con el oro puedes comprar tu equipo en el capítulo «Equipo» (Reglas); apúntalo luego en la ficha.</p>` : ""}
      <h4>Idiomas: ${langsAuto().join(", ")} y elige ${langsN()}</h4>
      <div class="splist">${LANGS.map(l => chk(W.langs.includes(l), `data-lang="${esc(l)}"`, `<b>${esc(l)}</b>`)).join("")}</div>
      ${W.cls === "Pícaro" ? `<p class="note">Jerga de ladrones te deja elegir el idioma extra también de los inusuales:</p><div class="splist">${LANGS_RARE.filter(l => !langsAuto().includes(l)).map(l => chk(W.langs.includes(l), `data-lang="${esc(l)}"`, `<b>${esc(l)}</b>`)).join("")}</div>` : ""}`;
  } else if (cur === "det") {
    body = `<label class="field">Nombre<input id="cname" value="${esc(W.name)}" placeholder="¿Cómo se llama?"></label>
      <label class="field">Alineamiento<select id="calign"><option value="">—</option>${ALIGN.map(a => `<option ${W.align === a ? "selected" : ""}>${a}</option>`).join("")}</select></label>
      <p class="note">El juego da por hecho que los personajes no son malvados: habla con el máster antes.</p>
      <label class="field">Color<input type="color" id="ccolor" value="${esc(W.color)}"></label>
      <label class="field">Historia<textarea id="cnotes" rows="5" placeholder="¿Quién te crio? ¿Con quién tenías más amistad en la infancia? ¿Tuviste una mascota? ¿Te has enamorado alguna vez? ¿Perteneces a alguna organización? ¿Qué te ha llevado a la aventura?">${esc(W.notes)}</textarea></label>`;
  } else if (cur === "sum") {
    const pr = problems("sum"), c = pr.length ? null : build();
    body = c ? `<div class="sumtab">
        <div><small>Personaje</small><b>${esc(c.name)}</b></div><div><small>Clase</small><b>${esc(c.cls)} 1</b></div>
        <div><small>Especie</small><b>${esc(c.species)}</b></div><div><small>Trasfondo</small><b>${esc(c.background)}</b></div>
        <div><small>PG</small><b>${c.hp.max}</b></div><div><small>CA</small><b>${c.ac}</b></div><div><small>Velocidad</small><b>${String(c.speed).replace(".", ",")} m</b></div>
        <div><small>Iniciativa</small><b>${sign(mod(c.abilities.des) + (c.initBonus || 0))}</b></div>
        ${ABILITIES.map(([k, n]) => `<div><small>${n}${c.saves.includes(k) ? " · salv." : ""}</small><b>${c.abilities[k]} (${sign(mod(c.abilities[k]))})</b></div>`).join("")}
        <div class="wide"><small>Habilidades</small><b>${Object.entries(c.skills).map(([k, v]) => SKN[k] + (v === 2 ? " (pericia)" : "")).join(", ")}</b></div>
        <div class="wide"><small>Ataques</small><b>${c.weapons.map(w => `${esc(w.name)} ${w.atk} · ${esc(w.dmg)}`).join(" | ") || "—"}</b></div>
        ${c.spells.list.length ? `<div class="wide"><small>Conjuros</small><b>${esc(c.spells.list.map(x => x.name).join(", "))}</b></div>` : ""}
        <div class="wide"><small>Rasgos</small><b>${esc(c.features.map(f => f.name).join(", "))}</b></div>
        <div class="wide"><small>Idiomas</small><b>${esc(c.languages)}</b></div></div>`
      : `<p class="warn">⚠ Falta: ${pr.map(esc).join(" · ")}</p>`;
  }
  const pr = cur === "sum" ? [] : problems(cur);
  ov.innerHTML = `<div class="modalbox"><header><h3>✨ Nuevo personaje${W.cls ? ` · ${esc(W.cls)}` : ""}</h3><button class="x" data-close aria-label="Cerrar">✕</button></header>
    <nav class="wsteps">${STEPS.map(([k, n], i) => `<button data-step="${i}" class="${i === W.step ? "on" : i < W.step && !problems(k).length ? "done" : ""}" ${k === "magic" && !hasMagicStep() ? "hidden" : ""}>${i + 1}. ${n}</button>`).join("")}</nav>
    <div class="wbody">${body}${pr.length ? `<p class="warn">Falta: ${pr.map(esc).join(" · ")}</p>` : ""}</div>
    <footer>${W.step > 0 ? `<button class="btn" data-prev>← Atrás</button>` : ""}<span class="grow"></span>${cur === "sum" ? `<button class="btn gold" data-ok ${problems("sum").length ? "disabled" : ""}>✓ Crear personaje</button>` : `<button class="btn gold" data-next>Siguiente →</button>`}</footer></div>`;
  bind(ov);
}

/* ---------- Eventos ---------- */
function bind(ov) {
  const go = n => { W.step = Math.max(0, Math.min(STEPS.length - 1, n)); if (STEPS[W.step][0] === "magic" && !hasMagicStep()) W.step += n > W.step ? 1 : -1; draw(); ov.querySelector(".wbody").scrollTop = 0; };
  const re = () => draw();
  $("[data-close]", ov).onclick = close;
  $$("[data-step]", ov).forEach(b => b.onclick = () => go(+b.dataset.step));
  const nx = $("[data-next]", ov); if (nx) nx.onclick = () => { const to = W.step + 1; W.step = to; if (STEPS[to][0] === "magic" && !hasMagicStep()) W.step++; draw(); };
  const pv = $("[data-prev]", ov); if (pv) pv.onclick = () => { W.step--; if (STEPS[W.step][0] === "magic" && !hasMagicStep()) W.step--; draw(); };
  $$("[data-cls]", ov).forEach(b => b.onclick = () => {
    if (W.cls === b.dataset.cls) return;
    Object.assign(W, { cls: b.dataset.cls, skills: [], expertise: [], clsPick: "", style: "", mastery: [], cantrips: [], prepared: [], eqC: 0 });
    if (W.method === "std" && !W.rolls) { W.pool = STANDARD.slice(); W.asg = stdAsg(C().std); }
    re();
  });
  $$("input[name=bg]", ov).forEach(r => r.onchange = () => { W.bg = r.value; W.inc = { mode: W.inc.mode, a: "", b: "" }; W.eqB = 0; W.skills = W.skills.filter(k => !B().skills.includes(k)); re(); });
  $$("[data-sp]", ov).forEach(b => b.onclick = () => { if (W.sp !== b.dataset.sp) Object.assign(W, { sp: b.dataset.sp, spOpt: "", size: "", spSkill: "", extraSkill: "", feat2: "", habil: [], castAb: "" }); re(); });
  $$("input[name=spopt]", ov).forEach(r => r.onchange = () => { W.spOpt = r.value; re(); });
  $$("[data-size]", ov).forEach(b => b.onclick = () => { W.size = b.dataset.size; re(); });
  $$("[data-castab]", ov).forEach(b => b.onclick = () => { W.castAb = b.dataset.castab; re(); });
  $$("[data-method]", ov).forEach(b => b.onclick = () => {
    W.method = b.dataset.method;
    if (W.method === "std") { W.pool = STANDARD.slice(); W.rolls = null; W.asg = C() ? stdAsg(C().std) : Object.fromEntries(ABK.map((k, i) => [k, i])); }
    if (W.method === "roll") { W.rolls = null; W.asg = null; }
    re();
  });
  const rb = $("[data-roll]", ov); if (rb) rb.onclick = () => {
    W.rolls = Array.from({ length: 6 }, () => { const d = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 6)).sort((a, b) => b - a); return { d, v: d[0] + d[1] + d[2] }; });
    W.pool = W.rolls.map(r => r.v);
    // Propuesta: las más altas a las características que la clase pone primero
    const order = C() ? ABK.slice().sort((a, b) => C().std[ABK.indexOf(b)] - C().std[ABK.indexOf(a)]) : ABK;
    const idx = W.pool.map((v, i) => i).sort((a, b) => W.pool[b] - W.pool[a]);
    W.asg = {}; order.forEach((k, i) => { W.asg[k] = idx[i]; });
    re();
  };
  $$("[data-asg]", ov).forEach(s => s.onchange = () => { const k = s.dataset.asg, v = +s.value, other = ABK.find(x => W.asg[x] === v); if (other) W.asg[other] = W.asg[k]; W.asg[k] = v; re(); });
  $$("[data-pm]", ov).forEach(b => b.onclick = () => { const [k, d] = b.dataset.pm.split(":"); W.pts[k] = Math.max(8, Math.min(15, W.pts[k] + +d)); re(); });
  $$("[data-inc]", ov).forEach(b => b.onclick = () => { W.inc = { mode: b.dataset.inc, a: "", b: "" }; re(); });
  $$("[data-inca]", ov).forEach(b => b.onclick = () => { W.inc.a = b.dataset.inca; if (W.inc.b === W.inc.a) W.inc.b = ""; re(); });
  $$("[data-incb]", ov).forEach(b => b.onclick = () => { W.inc.b = b.dataset.incb; if (W.inc.a === W.inc.b) W.inc.a = ""; re(); });
  const tog = (arr, v, max) => arr.includes(v) ? arr.filter(x => x !== v) : (max && arr.length >= max ? [...arr.slice(1), v] : [...arr, v]);
  $$("[data-csk]", ov).forEach(x => x.onchange = () => { W.skills = tog(W.skills, x.dataset.csk, C().n); W.expertise = W.expertise.filter(k => allSkills().has(k)); re(); });
  $$("[data-spsk]", ov).forEach(b => b.onclick = () => { W.spSkill = b.dataset.spsk; re(); });
  const ex = $("[data-exsk]", ov); if (ex) ex.onchange = () => { W.extraSkill = ex.value; re(); };
  $$("[data-hab]", ov).forEach(x => x.onchange = () => { W.habil = tog(W.habil, x.dataset.hab, 3); re(); });
  $$("[data-exp]", ov).forEach(x => x.onchange = () => { W.expertise = tog(W.expertise, x.dataset.exp, C().expertise); re(); });
  $$("input[name=feat2]", ov).forEach(r => r.onchange = () => { W.feat2 = r.value; if (B() && B().featList === W.feat2List) W.feat2List = ["clérigo", "druida", "mago"].find(l => l !== B().featList); re(); });
  $$("[data-f2list]", ov).forEach(b => b.onclick = () => { W.feat2List = b.dataset.f2list; W.init2 = { c: [], s: "" }; re(); });
  $$("input[name=clspick]", ov).forEach(r => r.onchange = () => { W.clsPick = r.value; re(); });
  $$("input[name=style]", ov).forEach(r => r.onchange = () => { W.style = r.value; re(); });
  $$("[data-mas]", ov).forEach(x => x.onchange = () => { W.mastery = tog(W.mastery, x.dataset.mas, C().mastery); re(); });
  const q = $("#spq", ov); if (q) q.oninput = () => { W.q = q.value; const pos = q.selectionStart; draw(); const q2 = $("#spq", document.getElementById("newwiz")); if (q2) { q2.focus(); q2.setSelectionRange(pos, pos); } };
  const n = magicNeeds();
  $$("[data-cantrips]", ov).forEach(x => x.onchange = () => { W.cantrips = tog(W.cantrips, x.dataset.cantrips, n.can); re(); });
  $$("[data-prepared]", ov).forEach(x => x.onchange = () => { W.prepared = tog(W.prepared, x.dataset.prepared, n.book || n.prep); re(); });
  $$("[data-iab]", ov).forEach(b => b.onclick = () => { const [k, a] = b.dataset.iab.split(":"); if (k === "init1") W.featAb = a; else W.feat2Ab = a; re(); });
  $$("[data-ic]", ov).forEach(x => x.onchange = () => { const [k, nm] = x.dataset.ic.split(/:(.+)/); W[k].c = tog(W[k].c, nm, 2); re(); });
  $$("[data-is]", ov).forEach(x => x.onchange = () => { const [k, nm] = x.dataset.is.split(/:(.+)/); W[k].s = W[k].s === nm ? "" : nm; re(); });
  $$("input[name=eqc]", ov).forEach(r => r.onchange = () => { W.eqC = +r.value; re(); });
  $$("input[name=eqb]", ov).forEach(r => r.onchange = () => { W.eqB = +r.value; re(); });
  $$("[data-lang]", ov).forEach(x => x.onchange = () => { W.langs = tog(W.langs, x.dataset.lang, langsN()); re(); });
  const nm = $("#cname", ov); if (nm) nm.oninput = () => { W.name = nm.value; const w = $(".wbody .warn", ov); if (w && W.name.trim()) w.remove(); };
  const al = $("#calign", ov); if (al) al.onchange = () => { W.align = al.value; };
  const co = $("#ccolor", ov); if (co) co.oninput = () => { W.color = co.value; };
  const no = $("#cnotes", ov); if (no) no.oninput = () => { W.notes = no.value; };
  const ok = $("[data-ok]", ov); if (ok) ok.onclick = () => {
    const c = build(); store.commit("char", s => s.characters.push(c));
    const d = onDone; close(); toast(`✨ ${c.name} está listo para la aventura`); if (d) d(c);
  };
}
function stdAsg(std) {
  // std es FUE..CAR con valores del conjunto estándar → índice en el pool
  const asg = {}; ABK.forEach((k, i) => { asg[k] = STANDARD.indexOf(std[i]); }); return asg;
}

/* ---------- La ficha ---------- */
function build() {
  const sc = scores(), c = C(), b = B(), s = S(), o = spOpt(), g = gear(), A = acOf(sc);
  const fid = () => "f-" + Math.random().toString(36).slice(2, 8), sid = () => "s-" + Math.random().toString(36).slice(2, 8);
  const features = [];
  (PROG[W.cls].lv[1] || []).forEach(i => {
    let t = i.t;
    if (pick() && ["Orden divina", "Orden primigenia", "Invocaciones sobrenaturales"].includes(i.n)) t = `${W.clsPick}: ${pick().t}`;
    if (i.n === "Estilo de combate" && W.style) t = `${W.style}: ${FEATS.find(f => f.n === W.style).t}`;
    if (i.n === "Maestría con armas" && W.mastery.length) t = `Armas: ${W.mastery.map(n => `${n} (${weaponOf(n).m})`).join(", ")}. ${i.t}`;
    features.push({ id: fid(), name: i.n, text: `(${W.cls} 1) ${t}`.slice(0, 900) });
  });
  s.traits.forEach(([n, t]) => {
    let tx = t;
    if (s.choice && (n === s.choice.name || n.startsWith("Linaje") || n.startsWith("Legado"))) tx = `${W.spOpt}: ${o.t} ${t}`;
    if (n === "Resistencia al daño" && o && o.resist) tx = `Tienes resistencia al daño de ${o.resist}.`;
    if (n === "Visión en la oscuridad" && o && o.dv) tx = `Tienes visión en la oscuridad hasta ${o.dv} m.`;
    features.push({ id: fid(), name: n, text: `(${W.sp}) ${tx}`.slice(0, 900) });
  });
  if (s.castAb) features.push({ id: fid(), name: "Aptitud mágica del linaje", text: `(${W.sp}) ${AB[W.castAb]}` });
  feats().forEach((n, i) => {
    const list = n === "Iniciado en la magia" ? (i === 0 ? b.featList : W.feat2List) : "";
    features.push({ id: fid(), name: n + (list ? ` (${list})` : ""), text: `(Dote de origen) ${ORIGIN_FEATS[n]}` });
  });
  const skills = {}; allSkills().forEach(k => { skills[k] = W.expertise.includes(k) ? 2 : 1; });
  const weapons = weaponsOf(sc);
  const inventory = [];
  g.items.forEach(({ n, q }) => {
    if (weaponOf(n)) return;
    const a = armorOf(n);
    inventory.push({ id: "i-" + Math.random().toString(36).slice(2, 8), name: PACKS[n] ? `${n}: ${PACKS[n]}` : n, qty: q, weight: a ? a.kg : "", equipped: !!a });
  });
  const pr = [`Armas: ${c.armsTxt}${pick() && pick().arms ? ", marciales" : ""}`, `Armaduras: ${c.armorTxt}${pick() && pick().armor ? (pick().armor.pesada ? ", pesadas" : ", medias") : ""}`];
  const tools = [...new Set([c.tools, b.tools].filter(Boolean))]; if (tools.length) pr.push(`Herramientas: ${tools.join("; ")}`);
  // Conjuros
  const list = [], addSp = (name, prepared = true, src = "") => { if (list.some(x => x.name === name)) return; const d = CONJ().find(x => x.n === name); list.push({ id: sid(), name, level: d ? d.lvl : 0, prepared, ...(src ? { src } : {}) }); };
  W.cantrips.forEach(n => addSp(n));
  const nprep = magicNeeds().prep; W.prepared.forEach((n, i) => addSp(n, W.cls !== "Mago" || i < nprep));
  freeSpells().forEach(([n, src]) => addSp(n, true, src));
  initiates().forEach(([k]) => { W[k].c.forEach(n => addSp(n, true, "Iniciado en la magia")); if (W[k].s) addSp(W[k].s, true, "Iniciado en la magia"); });
  const slots = {}, p0 = P0();
  if (p0["Espacios de pacto"]) slots[num(p0["Nivel de los espacios"])] = { max: num(p0["Espacios de pacto"]), used: 0, pact: true };
  for (let i = 1; i <= 9; i++) { const v = num(p0["s" + i]); if (v) slots[i] = { max: v, used: 0 }; }
  let speed = (o && o.speed) || s.speed;
  if (A.body && A.body.fue && sc.fue < A.body.fue) speed -= 3;
  const hp = Math.max(1, c.hd + mod(sc.con) + (s.hpPerLevel || 0));
  const name = W.name.trim();
  return newCharacter({
    owner: W.owner, name, cls: W.cls, background: W.bg, level: 1, color: W.color, alignment: W.align,
    species: W.sp + (W.spOpt ? ` (${W.spOpt.replace(/\s*\(.*\)$/, "")})` : "") + (s.sizePick ? `, ${W.size}` : ""),
    initials: name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase(),
    abilities: sc, saves: [...c.saves], skills, hp: { max: hp, cur: hp, temp: 0 }, ac: A.ac, speed,
    darkvision: (o && o.dv) || s.dv || 0, ...(hasFeat("Alerta") ? { initBonus: PROF } : {}),
    weapons, inventory, coins: { po: g.po, pp: 0, pe: 0, pc: 0 }, spells: { slots, list }, features,
    languages: [...langsAuto(), ...W.langs].join(", "), proficiencies: pr.join(". "), notes: W.notes,
    created: { at: Date.now(), method: W.method, srd: "5.2.1" }
  });
}
