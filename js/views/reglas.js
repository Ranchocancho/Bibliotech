// Reglas: el SRD 5.2.1 en español para todos (libro con buscador, conjuros y monstruos).
import { store } from "../core/store.js";
import { isDM, currentUser } from "../core/session.js";
import { srd, CAPITULOS, ESCUELAS, norm, monsterToken } from "../core/srd.js";
import { $, $$, esc, toast } from "../core/ui.js";
import { openCreaturePicker } from "./criaturas.js";
import { TYPES, typeOf, withCustom } from "../core/bestiario.js";
import { isWallT } from "../data/mapas.js";
import { getImage } from "../core/images.js";
import { INDICE, ACCESOS } from "../data/indice.js";
import { XP_BY_CR } from "../core/srd.js";
import { difficulty, partyOf, HINT } from "../core/encuentro.js";

let el = null, tab = "libro", page = 5, q = "", sel = null, filt = { lvl: "", cls: null, vd: "", ty: "", fx: "" }, PROGM = null;
let sortM = "az", mfOpen = matchMedia("(min-width: 761px)").matches, mf = { vdr: "", ty: "", sz: "", mv: "", tr: "", df: "", or: "" }, gf = "", anchor = null, here = null, side = false, openCh = null;
const CLASES = ["bardo", "brujo", "clérigo", "druida", "explorador", "hechicero", "mago", "paladín"];

export function mount(root) {
  el = document.createElement("div"); el.className = "reglas"; root.appendChild(el);
  draw();
  return { update() {}, unmount() { el = null; } };
}
export function openRules(t, item) { tab = t; sel = item; q = ""; side = false; location.hash = "reglas"; if (el) draw(); }

async function draw() {
  if (!el) return;
  el.innerHTML = `<nav class="rtabs" role="tablist">${[["libro", "📖", "Libro"], ["glosario", "📚", "Glosario"], ["conjuros", "✨", "Conjuros"], ["monstruos", "🐉", "Monstruos"]].map(([k, i, n]) => `<button role="tab" data-t="${k}" aria-selected="${tab === k}">${i} ${n}</button>`).join("")}
    <span class="grow"></span><small class="srdnote">SRD 5.2.1 · Wizards of the Coast · CC BY 4.0</small></nav><div class="rbody"><p class="empty" style="padding:20px">Cargando las reglas…</p></div>`;
  $$("[data-t]", el).forEach(b => b.onclick = () => { tab = b.dataset.t; sel = null; q = ""; side = false; draw(); });
  const body = $(".rbody", el);
  if (tab === "libro") return libro(body, await srd("paginas"));
  if (tab === "glosario") return glosario(body, await srd("glosario"), await srd("paginas"));
  if (tab === "conjuros") return conjuros(body, await srd("conjuros"));
  return monstruos(body, await srd("monstruos"));
}
/** Ir a otra pestaña desde el índice o un acceso rápido. */
function jump(target) {
  if (target === "tab:animales") { tab = "monstruos"; mf = { vdr: "", ty: "", sz: "", mv: "", tr: "", df: "", or: "animal" }; }
  else tab = target.slice(4);
  sel = null; q = ""; side = false; draw();
}
// En el móvil se ve la lista o la página: este botón vuelve a la lista
const backBtn = (txt = "← Lista") => `<button class="btn small rback" data-back>${txt}</button>`;
function bindBack(body, redraw, showList) { $$("[data-back]", body).forEach(b => b.onclick = () => { side = true; redraw(); }); body.classList.toggle("showside", !!showList); }

// Une las líneas del PDF en párrafos: corta solo tras un punto (o dos puntos) cuando la siguiente empieza en mayúscula
const paras = t => {
  const ls = t.replace(/([a-záéíóúñ])-\n+([a-záéíóúñ])/g, "$1$2").split(/\n+/).map(l => l.trim()).filter(Boolean), out = [];
  let cur = "";
  for (const l of ls) {
    if (cur && /[.:!?)»”]$/.test(cur) && /^[A-ZÁÉÍÓÚÑ¿¡«“•|0-9]/.test(l)) { out.push(cur); cur = l; }
    else cur = cur ? cur + " " + l : l;
  }
  if (cur) out.push(cur);
  return out;
};

// Maqueta de libro: títulos, términos con etiqueta [acción], tablas, viñetas y negritas de entrada
const UP = /^[A-ZÁÉÍÓÚÑ¿¡«“0-9]/, END = /[.:!?)»”]$/;
const isRow = l => l.split(/\s{3,}/).filter(Boolean).length >= 2;
function blocks(t) {
  const L = (t || "").replace(/([a-záéíóúñ])-\n+([a-záéíóúñ])/g, "$1$2").replace(/^([A-ZÁÉÍÓÚÑ]) ([a-záéíóúñ]+)/gm, "$1$2").split(/\n+/).filter(l => !/^\s*\d*\s*Documento de referencia del sistema/.test(l)).map(l => l.replace(/\s+$/, "")).filter(l => l.trim());
  const out = []; let par = null, tbl = null, list = null;
  const flush = () => { if (par) out.push({ k: "p", t: par }); if (tbl) out.push({ k: "t", rows: tbl }); if (list) out.push({ k: "ul", items: list }); par = tbl = list = null; };
  L.forEach((raw, i) => {
    const l = raw.trim(), next = (L[i + 1] || "").trim();
    if (isRow(raw) && !/[.,;]$/.test(l)) { if (!tbl) { flush(); tbl = []; } tbl.push(l.split(/\s{3,}/)); return; }
    if (tbl) flush();
    if (/^[•●▪]/.test(l)) { if (par && !list) flush(); if (par && list) { list.push(par); par = null; } list = list || []; par = l.replace(/^[•●▪]\s*/, ""); return; }
    const free = !par || END.test(par);
    const tag = l.match(/^(.{2,50}?)\s*\[([^\]]{3,30})\]$/);
    if (free && tag) { if (list) { list.push(par); par = null; } flush(); out.push({ k: "h", t: tag[1], tag: tag[2], lvl: 3 }); return; }
    if (free && UP.test(l) && l.length <= 58 && !/[.,;:]$/.test(l) && !/\. /.test(l) && l.split(" ").length <= 8 && (!next || UP.test(next) || isRow(L[i + 1]))) {
      if (list && par) { list.push(par); par = null; } flush();
      out.push({ k: "h", t: l, lvl: l === l.toUpperCase() || l.length < 22 && /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(l) ? 2 : 3 }); return;
    }
    if (par && END.test(par) && UP.test(l)) { if (list) { list.push(par); par = l; flush(); par = null; list = null; par = l; return; } out.push({ k: "p", t: par }); par = l; return; }
    par = par ? par + " " + l : l;
  });
  if (list && par) { list.push(par); par = null; }
  flush();
  return out;
}
// Detalles finos: negrita de entrada («Término. Texto…»), tiradas de dados y CD
const rich = (txt, term) => {
  let h = esc(txt);
  const m = h.match(/^([A-ZÁÉÍÓÚÑ¿][^.:!?]{2,60}?[.:])(\s)/);
  if (m && m[1].split(" ").length <= 7 && h.length > m[1].length + 25) h = `<b class="runin">${m[1]}</b>` + h.slice(m[1].length);
  h = h.replace(/\b(\d*d\d+(?:\s?[+−-]\s?\d+)?)\b/g, '<span class="dx">$1</span>').replace(/\bCD (\d+)/g, '<span class="cd">CD $1</span>')
    .replace(/(^|[\s.])(Acierto|Fallo|Éxito|Fallo o éxito|Desencadenante|Respuesta|Usando un espacio de conjuro de nivel superior|Mejora de truco):/g, '$1<b class="kw">$2:</b>');
  return term ? mark(h, term) : h;
};
export function bookHTML(t, term) {
  return blocks(t).map(b => b.k === "h" ? `<h${b.lvl} class="bh">${esc(b.t)}${b.tag ? ` <span class="btag">${esc(b.tag)}</span>` : ""}</h${b.lvl}>`
    : b.k === "t" ? `<div class="btbl"><table>${b.rows.map((r, i) => `<tr>${r.map(c => i === 0 && b.rows.length > 1 ? `<th>${esc(c)}</th>` : `<td>${rich(c, term)}</td>`).join("")}</tr>`).join("")}</table></div>`
    : b.k === "ul" ? `<ul class="bul">${b.items.map(x => `<li>${rich(x, term)}</li>`).join("")}</ul>`
    : `<p>${rich(b.t, term)}</p>`).join("");
}
const mark = (html, term) => term ? html.replace(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"), "<mark>$1</mark>") : html;

/** Capítulo y subsección en las que cae una página (la última subsección que empieza en o antes de ella). */
function whereIs(pg) {
  const ch = [...INDICE].reverse().find(c => pg >= c.p) || INDICE[0];
  let subs = ch.subs.filter(x => typeof x[1] === "number" && x[1] <= pg);
  // Si se llegó desde el índice, manda la subsección elegida (varias empiezan en la misma página)
  if (here && here[1] === pg) { const i = subs.findIndex(x => x[0] === here[0] && x[1] === pg); if (i >= 0) subs = subs.slice(0, i + 1); }
  const top = [...subs].reverse().find(x => (x[2] || 1) === 1), leaf = subs[subs.length - 1];
  return { ch, top, leaf: leaf && leaf !== top ? leaf : null };
}
function libro(body, P) {
  const results = q.length > 2 ? P.map((t, i) => ({ i, t })).filter(x => norm(x.t).includes(norm(q))).slice(0, 60) : [];
  const w = whereIs(page), cur = openCh || w.ch.n;
  const sub = ([t, p, l], ch) => {
    const on = typeof p === "number" && (w.leaf ? w.leaf[0] === t && w.leaf[1] === p : w.top && w.top[0] === t && w.top[1] === p) && w.ch === ch;
    return typeof p === "number" ? `<button class="tocsub l${l || 1} ${on ? "on" : ""}" data-p="${p}" data-a="${esc(t)}"><span>${esc(t)}</span><small>${p}</small></button>`
      : `<button class="tocsub l1 tocjump" data-j="${p}"><span>${esc(t)}</span></button>`;
  };
  body.innerHTML = `<aside class="rside">
      <input id="rq" type="search" placeholder="Buscar en las reglas (p. ej. «agarrar», «cobertura»)" value="${esc(q)}">
      ${q.length > 2 ? `<div class="rres">${results.map(x => { const k = norm(x.t).indexOf(norm(q)), wh = whereIs(x.i + 1); return `<button class="place" data-p="${x.i + 1}"><span>${esc(x.t.slice(Math.max(0, k - 40), k + 70).replace(/\n/g, " "))}…</span><small>${esc(wh.ch.n)}${wh.top ? " › " + esc(wh.top[0]) : ""} · p. ${x.i + 1}</small></button>`; }).join("") || `<p class="empty">Nada encontrado.</p>`}</div>`
      : `<div class="quick">${ACCESOS.map(([n, a], i) => `<button data-qa="${i}">${n}</button>`).join("")}</div>
      <nav class="toc">${INDICE.map(c => `<details ${cur === c.n ? "open" : ""} data-ch="${esc(c.n)}"><summary class="${w.ch === c ? "on" : ""}"><span>${c.i} ${esc(c.n)}</span><small>${c.p}</small></summary><div>${c.subs.map(x => sub(x, c)).join("")}</div></details>`).join("")}</nav>`}
    </aside>
    <article class="rpage book"><div class="pnav"><button class="btn small rback" data-back>☰ Índice</button><button class="btn small" data-go="-1" aria-label="Página anterior">◀</button><span class="crumbs"><b>${esc(w.ch.n)}</b>${w.top ? ` › ${esc(w.top[0])}` : ""}${w.leaf ? ` › ${esc(w.leaf[0])}` : ""} <em>· p. ${page}/${P.length}</em></span><button class="btn small" data-go="1" aria-label="Página siguiente">▶</button></div>
      <div class="bookpage">${bookHTML(P[page - 1] || "", q.length > 2 ? esc(q) : "")}<div class="folio">— ${page} —</div></div>
      <div class="pnav bottom"><button class="btn small" data-go="-1">◀ Anterior</button><button class="btn small" data-go="1">Siguiente ▶</button></div></article>`;
  const redraw = () => libro(body, P);
  const rq = $("#rq", body);
  rq.oninput = () => { q = rq.value; const pos = rq.selectionStart; redraw(); const n = $("#rq", body); n.focus(); n.setSelectionRange(pos, pos); };
  const goPage = (p, a) => { page = p; anchor = a || null; here = a ? [a, p] : null; openCh = null; side = false; redraw(); };
  $$("[data-p]", body).forEach(b => b.onclick = () => goPage(+b.dataset.p, b.dataset.a || (q.length > 2 ? null : null)));
  $$("[data-go]", body).forEach(b => b.onclick = () => { page = Math.max(1, Math.min(P.length, page + +b.dataset.go)); anchor = null; openCh = null; redraw(); $(".rpage", body).scrollTop = 0; });
  $$("[data-j]", body).forEach(b => b.onclick = () => jump(b.dataset.j));
  $$("details[data-ch]", body).forEach(d => d.addEventListener("toggle", () => { if (d.open) { openCh = d.dataset.ch; $$("details[data-ch]", body).forEach(o => { if (o !== d) o.open = false; }); } }));
  $$("[data-qa]", body).forEach(b => b.onclick = () => {
    const a = ACCESOS[+b.dataset.qa][1];
    if (a.p) return goPage(a.p);
    tab = "glosario"; gf = a.f || ""; sel = a.g || null; q = ""; side = !a.g; draw();
  });
  bindBack(body, redraw, side);
  // Lleva al título de la subsección dentro de la página
  const pg = $(".rpage", body);
  if (anchor) { const n = norm(anchor).slice(0, 18), h = $$(".bookpage .bh, .bookpage p", body).find(e => norm(e.textContent).startsWith(n)); if (h) { h.classList.add("flash"); requestAnimationFrame(() => { pg.scrollTop = Math.max(0, h.offsetTop - 70); }); } else pg.scrollTop = 0; anchor = null; }
  const on = $(".tocsub.on", body); if (on && !q) on.scrollIntoView({ block: "nearest" });
}

/* ---------- Glosario: las 150 definiciones del SRD como diccionario, por etiqueta y por letra ---------- */
const GTAGS = [["", "Todas"], ["estado", "Estados"], ["acción", "Acciones"], ["área de efecto", "Áreas"], ["peligro", "Peligros"], ["actitud", "Actitudes"]];
// Fuera las cabeceras de tabla que el PDF coló como entradas
const gKeys = G => Object.keys(G).filter(k => !/\s{3,}/.test(k) && !/^Consumo de/.test(k));
const letterOf = k => norm(k)[0].toUpperCase();
function glosario(body, G, P) {
  const keys = gKeys(G).filter(k => k !== "Convenciones del glosario").sort((a, b) => a.localeCompare(b, "es"));
  const list = keys.filter(k => (!gf || G[k].tipo === gf) && (!q || norm(k).includes(norm(q)) || q.length > 3 && norm(G[k].txt).includes(norm(q))));
  const cur = G[sel] ? sel : null;
  const letters = [...new Set(list.map(letterOf))];
  const counts = Object.fromEntries(GTAGS.map(([t]) => [t, keys.filter(k => !t || G[k].tipo === t).length]));
  // Página del libro donde está la entrada (glosario: 194–210)
  const pageOf = k => { const n = norm(k); for (let p = 194; p <= 210; p++) if (norm(P[p - 1]).split("\n").some(l => l.trim().startsWith(n))) return p; return 194; };
  // «Consulta también»: enlaces a otras entradas
  const linkify = html => html.replace(/(Consulta también[^<]*)/g, m => { let out = m; keys.filter(k => k.length > 3 && k !== cur).sort((a, b) => b.length - a.length).forEach(k => { out = out.replace(new RegExp(`(^|[\\s“"(,])(${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?=[\\s”"),.;]|$)`), `$1<a href="#" data-g="${esc(k)}">$2</a>`); }); return out; });
  body.innerHTML = `<aside class="rside">
      <input id="rq" type="search" placeholder="Buscar término (p. ej. «agarrado», «descanso»)" value="${esc(q)}">
      <div class="cptypes side">${GTAGS.map(([t, n]) => `<button data-gf="${t}" aria-pressed="${gf === t}">${n} <small>${counts[t]}</small></button>`).join("")}</div>
      <div class="azbar">${letters.map(L => `<button data-az="${L}">${L}</button>`).join("")}</div>
      <div class="places">${letters.map(L => `<h4 class="lvh" id="az-${L}">${L}</h4>` + list.filter(k => letterOf(k) === L).map(k => `<button class="place ${cur === k ? "on" : ""}" data-g="${esc(k)}"><span>${esc(k)}</span>${G[k].tipo ? `<small class="gtag">${esc(G[k].tipo)}</small>` : ""}</button>`).join("")).join("") || `<p class="empty">Nada con ese filtro.</p>`}</div>
      <p class="note" style="margin:0">${list.length} términos del glosario de reglas</p>
    </aside><article class="rpage">${backBtn()}${cur ? `<div class="scard gloss"><h2>${esc(cur)}${G[cur].tipo ? ` <span class="btag">${esc(G[cur].tipo)}</span>` : ""}</h2>
      <div class="stext">${linkify(bookHTML(G[cur].txt, q.length > 2 ? esc(q) : ""))}</div>
      <p class="gfoot"><button class="btn small" data-book="${pageOf(cur)}">📖 Ver en el libro · p. ${pageOf(cur)}</button></p></div>`
      : `<div class="scard gloss"><h2>Glosario de reglas</h2><div class="stext">${bookHTML(G["Convenciones del glosario"].txt.split("Abreviaciones.")[0])}</div><p>Elige un término de la lista o filtra por estados, acciones, áreas, peligros o actitudes.</p></div>`}</article>`;
  const redraw = () => glosario(body, G, P);
  bindList(body, redraw);
  $$("[data-gf]", body).forEach(b => b.onclick = () => { gf = b.dataset.gf; redraw(); });
  $$("[data-az]", body).forEach(b => b.onclick = () => { const h = $("#az-" + b.dataset.az, body); if (h) h.scrollIntoView({ block: "start" }); });
  $$("[data-g]", body).forEach(b => b.onclick = e => { e.preventDefault(); sel = b.dataset.g; side = false; redraw(); $(".rpage", body).scrollTop = 0; });
  $$("[data-book]", body).forEach(b => b.onclick = () => { tab = "libro"; page = +b.dataset.book; anchor = cur; q = ""; side = false; draw(); });
  bindBack(body, redraw, side || !cur);
  const on = $(".place.on", body); if (on) on.scrollIntoView({ block: "nearest" });
}

export function spellCard(s) {
  return `<div class="scard spell lv${s.lvl}"><h2>${esc(s.n)}</h2><p class="smeta">${s.lvl ? `${s.esc[0].toUpperCase() + s.esc.slice(1)} de nivel ${s.lvl}` : `Truco de ${s.esc}`} (${esc(s.cls)})</p>
    <dl><dt>Tiempo de lanzamiento</dt><dd>${esc(s.t)}</dd><dt>Alcance</dt><dd>${esc(s.al)}</dd><dt>Componentes</dt><dd>${esc(s.co)}</dd><dt>Duración</dt><dd>${esc(s.du)}</dd></dl>
    <div class="stext">${bookHTML(s.txt)}</div>${s.sup ? `<p class="sup">${rich(s.sup)}</p>` : ""}</div>`;
}
/* ---------- Conjuros: listas de clase en el orden oficial (por nivel y alfabético), con lo que se abre al subir ---------- */
const CAP = c => c[0].toUpperCase() + c.slice(1);
// Lo que hace cada conjuro, para comparar sin abrirlo
const fxOf = s => ({
  atk: !!s.atk, save: !!s.sv, heal: /recupera(?:n)? (?:una cantidad de )?puntos de golpe|recupera(?:n)? \d+d\d+/i.test(s.txt || ""),
  area: /(esfera|cono|cubo|línea|cilindro|emanación) de \d/i.test(s.txt || ""), conc: /^concentraci/i.test(s.du || ""),
  bonus: /adicional/i.test(s.t || ""), react: /reacci/i.test(s.t || ""), ritual: /ritual/i.test(s.t || ""), dt: s.dt || ""
});
const ICONS = f => [f.atk && ["⚔", "Tirada de ataque"], f.save && ["🛡", "Salvación"], f.heal && ["❤", "Cura"], f.area && ["💥", "Área"], f.conc && ["⏳", "Concentración"], f.bonus && ["⚡", "Acción adicional"], f.react && ["↺", "Reacción"], f.ritual && ["📜", "Ritual"]].filter(Boolean);
const FX_FILTERS = [["dmg", "Hace daño"], ["heal", "Cura"], ["area", "Área"], ["noconc", "Sin concentración"], ["ritual", "Ritual"], ["react", "Reacción"]];
/** A qué nivel de personaje se abre cada nivel de conjuro para una clase (de su tabla de progresión). */
function unlocks(clsKey) {
  const P = PROGM && PROGM.PROG[clsKey]; if (!P) return null;
  const out = {};
  if (clsKey === "Brujo") {
    const iL = P.cols.indexOf("Nivel de los espacios"), iT = P.cols.indexOf("Trucos");
    if (iT >= 0) out[0] = 1;
    for (let L = 1; L <= 5; L++) { const r = P.rows.findIndex(x => +x[iL] >= L); if (r >= 0) out[L] = r + 1; }
    Object.assign(out, { 6: 11, 7: 13, 8: 15, 9: 17 }); // Arcano místico
    return out;
  }
  const iT = P.cols.indexOf("Trucos"); if (iT >= 0) { const r = P.rows.findIndex(x => +x[iT] > 0); if (r >= 0) out[0] = r + 1; }
  for (let L = 1; L <= 9; L++) { const i = P.cols.indexOf("s" + L); if (i < 0) continue; const r = P.rows.findIndex(x => +x[i] > 0); if (r >= 0) out[L] = r + 1; }
  return out;
}
function conjuros(body, S) {
  if (!PROGM) { import("../data/progresion.js").then(m => { PROGM = m; conjuros(body, S); }); }
  const s = store.get(), u = currentUser(s), mine = s.characters.filter(c => u && c.owner === u.id);
  const keyOf = cls => { if (!cls || !PROGM) return null; const k = Object.keys(PROGM.PROG).find(k => k.toLowerCase().startsWith(String(cls).toLowerCase().trim().slice(0, 3))); return k && CLASES.includes(k.toLowerCase()) ? k : null; };
  // Por defecto, el jugador ve la lista de su personaje (si lanza conjuros); el máster, todas
  if (filt.who !== (u && u.id)) { filt.who = u && u.id; filt.cls = null; } // cada usuario empieza por su propio personaje
  if (filt.cls === null && PROGM) { const c = mine.find(c => keyOf(c.cls)); filt.cls = c ? "pj:" + c.id : ""; }
  const pj = (filt.cls || "").startsWith("pj:") ? s.characters.find(c => c.id === filt.cls.slice(3)) : null;
  const ck = pj ? keyOf(pj.cls) : filt.cls && !filt.cls.startsWith("pj:") ? CAP(filt.cls) : null, cl = ck ? ck.toLowerCase() : "";
  const un = ck ? unlocks(ck) : null, have = new Set(((pj && pj.spells && pj.spells.list) || []).map(x => norm(x.name)));
  const pass = sp => { const f = fxOf(sp); return !filt.fx || (filt.fx === "dmg" ? !!(sp.dmg || f.dt) : filt.fx === "noconc" ? !f.conc : f[filt.fx]); };
  const list = S.filter(sp => (!q || norm(sp.n).includes(norm(q))) && (filt.lvl === "" || sp.lvl === +filt.lvl) && (!cl || norm(sp.cls).split(/,\s*/).includes(norm(cl))) && pass(sp))
    .sort((a, b) => a.lvl - b.lvl || a.n.localeCompare(b.n, "es"));
  const cur = S.find(x => x.n === sel) || null;
  const byLvl = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(L => [L, list.filter(x => x.lvl === L)]).filter(([, l]) => l.length);
  const head = L => {
    const at = un && un[L];
    let tag = "";
    if (at && pj) tag = pj.level >= at ? `<em class="ok">✓ ya a tu alcance</em>` : `<em class="lock">🔒 a nivel ${at} · te ${at - pj.level === 1 ? "falta 1 nivel" : `faltan ${at - pj.level} niveles`}</em>`;
    else if (at) tag = `<em>desde nivel ${at} de personaje</em>`;
    else if (ck && un) tag = `<em class="lock">${ck} no llega a este nivel</em>`;
    return `<h4 class="lvh">${L ? `Nivel ${L}` : "Trucos"}${tag}</h4>`;
  };
  const row = sp => { const f = fxOf(sp), at = un && un[sp.lvl], locked = pj && at && pj.level < at, got = have.has(norm(sp.n));
    return `<button class="place sprow ${cur === sp ? "on" : ""} ${locked ? "locked" : ""} ${got ? "got" : ""}" data-s="${esc(sp.n)}"><span>${got ? "✓ " : ""}${esc(sp.n)}</span><small>${esc(sp.esc)}${f.dt ? " · " + esc(f.dt) : ""}</small><i class="spic">${ICONS(f).map(([i, t]) => `<b title="${t}">${i}</b>`).join("")}</i></button>`; };
  body.innerHTML = `<aside class="rside">
      <input id="rq" type="search" placeholder="Buscar conjuro" value="${esc(q)}">
      <select id="fcls" aria-label="Lista de conjuros">${mine.filter(c => keyOf(c.cls)).map(c => `<option value="pj:${c.id}" ${filt.cls === "pj:" + c.id ? "selected" : ""}>🧙 ${esc(c.name)} · ${esc(c.cls)} ${c.level}</option>`).join("")}
        <option value="" ${!filt.cls ? "selected" : ""}>Todas las clases</option>${CLASES.map(c => `<option value="${c}" ${filt.cls === c ? "selected" : ""}>Lista de ${CAP(c)}</option>`).join("")}</select>
      <div class="row"><select id="flvl"><option value="">Todos los niveles</option>${[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(l => `<option value="${l}" ${filt.lvl === String(l) ? "selected" : ""}>${l ? "Nivel " + l : "Trucos"}</option>`).join("")}</select></div>
      <div class="spfx">${FX_FILTERS.map(([k, n]) => `<button data-fx="${k}" aria-pressed="${filt.fx === k}">${n}</button>`).join("")}</div>
      ${pj ? `<p class="note" style="margin:0">Lista de ${esc(ck)} en el orden del SRD. ✓ los que ya tienes · 🔒 lo que se abre al subir.</p>` : ""}
      <div class="places">${byLvl.map(([L, l]) => head(L) + l.map(row).join("")).join("") || `<p class="empty">Ningún conjuro con esos filtros.</p>`}</div>
      <p class="note" style="margin:0">${list.length} conjuros · ⚔ ataque · 🛡 salvación · ❤ cura · 💥 área · ⏳ concentración · ⚡ adicional · ↺ reacción · 📜 ritual</p>
    </aside><article class="rpage">${backBtn()}${cur ? spellCard(cur) : `<p class="empty">Elige un conjuro de la lista.</p>`}</article>`;
  bindList(body, () => conjuros(body, S));
  bindBack(body, () => conjuros(body, S), side || !cur);
  $("#flvl", body).onchange = e => { filt.lvl = e.target.value; conjuros(body, S); };
  $("#fcls", body).onchange = e => { filt.cls = e.target.value; conjuros(body, S); };
  $$("[data-fx]", body).forEach(b => b.onclick = () => { filt.fx = filt.fx === b.dataset.fx ? "" : b.dataset.fx; conjuros(body, S); });
  $$("[data-s]", body).forEach(b => b.onclick = () => { sel = b.dataset.s; side = false; conjuros(body, S); $(".rpage", body).scrollTop = 0; });
}

// Separa la cabecera del perfil (salvaciones, sentidos, inmunidades, idiomas, VD) del cuerpo (rasgos, acciones…).
// El PDF junta a veces toda la cabecera en una línea: se corta por sus etiquetas.
const MLABELS = "Habilidades|Resistencias|Vulnerabilidades|Inmunidades|Equipo|Sentidos|Idiomas|VD";
function monsterParts(txt) {
  const ls = (txt || "").split("\n"), rest = ls.slice(1).join("\n");
  const vd = rest.match(/VD:\s*[^()\n]*(\([^)]*\))?/);
  if (!vd) return { head: [], body: rest };
  const cut = vd.index + vd[0].length, headT = rest.slice(0, cut).replace(/\s+/g, " ");
  const saves = [...headT.matchAll(/\b(Fue|Des|Con|Int|Sab|Car) (\d+) ([+−-]\d+) ([+−-]\d+)/g)].filter(m => m[3] !== m[4]).map(m => `${m[1]} ${m[4]}`);
  const from = headT.search(new RegExp(`(${MLABELS}):`));
  const head = (saves.length ? [`Salvaciones: ${saves.join(", ")}`] : []).concat(from >= 0 ? headT.slice(from).split(new RegExp(`\\s(?=(?:${MLABELS}):)`)).map(x => x.trim()).filter(Boolean) : []);
  const body = rest.slice(cut).replace(/^\s+/, "").replace(/(^|\s)(Atributos|Acciones legendarias|Acciones adicionales|Acciones|Reacciones)\s+(?=[A-ZÁÉÍÓÚÑ])/g, (m, a, h) => `${a ? "\n" : ""}${h}\n`);
  return { head, body };
}
export function monsterCard(m, withAdd) {
  const mod = v => { const x = Math.floor((v - 10) / 2); return (x >= 0 ? "+" : "−") + Math.abs(x); };
  return `<div class="scard statblock"><h2>${esc(m.n)}</h2><p class="smeta">${esc(m.tipo)}</p>
    <div class="mstats"><span><b>CA</b> ${m.ca}</span><span><b>PG</b> ${m.pg} (${esc(m.pgd)})</span><span><b>Iniciativa</b> ${esc(m.ini)}</span><span><b>Velocidad</b> ${esc(m.vel)}</span><span><b>VD</b> ${esc(m.vd)}</span></div>
    <div class="mab">${Object.entries(m.ab).map(([k, v]) => `<div><small>${k.toUpperCase()}</small><b>${v}</b><em>${mod(v)}</em></div>`).join("")}</div>
    ${m.atk.length ? `<div class="matk">${m.atk.map(a => `<span>⚔️ <b>${esc(a.name)}</b> ${rich(a.atk)} · ${rich(a.dmg)}</span>`).join("")}</div>` : ""}
    ${withAdd ? `<div class="row" style="margin:10px 0"><button class="btn gold small" id="addmon">➕ Poner en la mesa</button><input type="number" id="addn" value="1" min="1" max="12" style="width:56px" aria-label="Cuántos"><label class="chk" title="No las verán hasta que las muestres (🙈 en su ficha o «Mostrar ocultos»). Aunque estén visibles, los jugadores solo ven lo que sus personajes alcanzan a ver."><input type="checkbox" id="addhid" ${addHidden ? "checked" : ""}> 🙈 Ocultas a los jugadores</label></div>` : ""}
    ${(() => { const { head, body } = monsterParts(m.txt); return `<div class="mhead">${head.map(l => `<p>${esc(l.trim()).replace(/(^|\s)([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñ ]{1,30}):/g, "$1<b>$2:</b>")}</p>`).join("")}</div>
    <details open><summary>Rasgos y acciones</summary><div class="stext">${bookHTML(body)}</div></details>`; })()}</div>`;
}
const VDS = ["0", "1/8", "1/4", "1/2", ...Array.from({ length: 30 }, (_, i) => String(i + 1))];
const vdNum = v => { const [a, b] = String(v).split("/").map(Number); return b ? a / b : a; }; // «1/8» → 0,125
/* ---------- Monstruos: categorías sacadas del propio perfil del SRD ---------- */
const SIZES = [["Diminuto", "Diminut"], ["Pequeño", "Pequeñ"], ["Mediano", "Median"], ["Grande", "Grande"], ["Enorme", "Enorme"], ["Gargantuesco", "Gargantu"]];
const MGROUPS = [
  ["vdr", "Desafío (VD)", [["0-1", "0 – 1"], ["2-4", "2 – 4"], ["5-10", "5 – 10"], ["11-16", "11 – 16"], ["17-30", "17 o más"]]],
  ["ty", "Tipo", TYPES.map(t => [t, t])],
  ["sz", "Tamaño", SIZES.map(([n]) => [n, n])],
  ["mv", "Movimiento", [["vuela", "🪽 Vuela"], ["nada", "🌊 Nada"], ["trepa", "🧗 Trepa"], ["excava", "⛏ Excava"]]],
  ["tr", "Rasgos", [["conj", "✨ Lanza conjuros"], ["leg", "👑 Legendaria"], ["reac", "↺ Reacciones"], ["anf", "🐸 Anfibia"], ["resmag", "🔰 Resistencia mágica"]]],
  ["df", "Defensas", [["inm", "Inmunidades"], ["res", "Resistencias"], ["vul", "Vulnerabilidades"]]],
  ["or", "Origen", [["monstruo", "Monstruos"], ["animal", "Animales"]]]
];
const FCACHE = new WeakMap();
function facets(m, M) {
  if (FCACHE.has(m)) return FCACHE.get(m);
  const vel = String(m.vel).toLowerCase(), t = m.txt || "", animal0 = M.findIndex(x => x.n === "Águila");
  const f = { vd: vdNum(m.vd), ty: typeOf(m), sz: SIZES.filter(([, r]) => m.tipo.split(",")[0].includes(r)).map(([n]) => n),
    mv: { vuela: /volar/.test(vel), nada: /nadar/.test(vel), trepa: /trepar/.test(vel), excava: /excavar/.test(vel) },
    tr: { conj: /Lanzamiento de conjuros/.test(t), leg: /Acciones legendarias/.test(t), reac: t.includes("Reacciones"), anf: /Anfibi/.test(t), resmag: /Resistencia mágica/.test(t) },
    df: { inm: /Inmunidades:/.test(t), res: /Resistencias:/.test(t), vul: /Vulnerabilidades:/.test(t) },
    or: animal0 >= 0 && M.indexOf(m) >= animal0 ? "animal" : "monstruo" };
  FCACHE.set(m, f); return f;
}
const passes = (f, k, v) => !v || (k === "vdr" ? (([a, b]) => f.vd >= +a && f.vd <= +b)(v.split("-")) : k === "ty" ? f.ty === v : k === "sz" ? f.sz.includes(v) : k === "or" ? f.or === v : f[k][v]);
const MICONS = f => [f.mv.vuela && ["🪽", "Vuela"], f.mv.nada && ["🌊", "Nada"], f.mv.trepa && ["🧗", "Trepa"], f.mv.excava && ["⛏", "Excava"], f.tr.conj && ["✨", "Lanza conjuros"], f.tr.leg && ["👑", "Acciones legendarias"], f.tr.reac && ["↺", "Reacciones"]].filter(Boolean);
/** Cuánto pesa una criatura para el grupo (presupuesto de PX del SRD) y cuántas caben en cada dificultad. */
function partyFit(s, m) {
  const party = partyOf(s), xp = XP_BY_CR[m.vd] || 0; if (!party.length || !xp) return "";
  const one = difficulty(s, [{ kind: "foe", xp }], party);
  const LB = { trivial: "muy fácil", baja: "baja", moderada: "moderada", alta: "alta", mortal: "por encima de alta" };
  // Cuántas hacen falta para pasar a cada categoría (1, 2, 3… hasta salirse del presupuesto alto)
  const steps = []; let last = one.k;
  for (let n = 2; n <= 20 && last !== "mortal"; n++) { const k = difficulty(s, Array.from({ length: n }, () => ({ kind: "foe", xp })), party).k; if (k !== last) { steps.push(`${n} → ${LB[k]}`); last = k; } }
  return `<div class="diff k-${one.k} mfit" title="${HINT[one.k]}"><div class="diff-h"><b>⚖️ Para tu grupo</b><span>${one.n} personaje${one.n === 1 ? "" : "s"} de nivel ${one.lvls.join("/")}</span></div>
    <small>Una sola (${xp.toLocaleString("es-ES")} PX): <b>${LB[one.k]}</b>.${steps.length ? ` Con más: ${steps.join(" · ")}.` : ""} Presupuesto del SRD, sin multiplicadores.</small></div>`;
}
function monstruos(body, M) {
  const ok = (m, except) => { const f = facets(m, M); return (!q || norm(m.n).includes(norm(q)) || norm(m.tipo).includes(norm(q))) && (!filt.vd || m.vd === filt.vd) && MGROUPS.every(([k]) => k === except || passes(f, k, mf[k])); };
  const list = M.filter(m => ok(m)).sort((a, b) => sortM === "vd" ? vdNum(a.vd) - vdNum(b.vd) || a.n.localeCompare(b.n, "es") : a.n.localeCompare(b.n, "es"));
  const cur = M.find(m => m.n === sel) || null, s = store.get(), canAdd = isDM(s) && s.board;
  const active = MGROUPS.filter(([k]) => mf[k]).length + (filt.vd ? 1 : 0);
  const chips = ([k, n, opts]) => { const base = M.filter(m => ok(m, k)); const shown = opts.map(([v, l]) => [v, l, base.filter(m => passes(facets(m, M), k, v)).length]).filter(([v, , c]) => c || mf[k] === v);
    return `<div class="mgroup"><b>${n}</b><div class="cptypes side">${shown.map(([v, l, c]) => `<button data-mf="${k}" data-v="${esc(v)}" aria-pressed="${mf[k] === v}">${l} <small>${c}</small></button>`).join("")}</div></div>`; };
  body.innerHTML = `<aside class="rside">
      <input id="rq" type="search" placeholder="Buscar monstruo o tipo («dragón», «muerto viviente»)" value="${esc(q)}">
      <details class="mfilters" ${mfOpen ? "open" : ""}><summary>Filtros${active ? ` <em>${active} activo${active === 1 ? "" : "s"}</em>` : ""}</summary>
        ${MGROUPS.map(chips).join("")}
        <div class="row"><label class="mgroup"><b>VD exacto</b> <select id="fvd"><option value="">Cualquiera</option>${VDS.map(v => `<option ${filt.vd === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        ${active ? `<button class="btn small" data-mclear>✕ Quitar filtros</button>` : ""}</div></details>
      <div class="row msort">Ordenar <button data-sort="az" aria-pressed="${sortM !== "vd"}">A–Z</button><button data-sort="vd" aria-pressed="${sortM === "vd"}">Por VD</button></div>
      <div class="places">${list.map(m => { const f = facets(m, M); return `<button class="place sprow ${cur === m ? "on" : ""}" data-m="${esc(m.n)}"><span>${esc(m.n)}</span><small>${esc(f.ty)} · ${esc(f.sz.join("/"))} · VD ${m.vd}</small><i class="spic">${MICONS(f).map(([i, t]) => `<b title="${t}">${i}</b>`).join("")}</i></button>`; }).join("") || `<p class="empty">Ninguna criatura con esos filtros.</p>`}</div>
      <p class="note" style="margin:0">${list.length} de ${M.length} criaturas · 🪽 vuela · 🌊 nada · 🧗 trepa · ⛏ excava · ✨ conjuros · 👑 legendaria · ↺ reacciones</p>
    </aside><article class="rpage">${backBtn()}${cur ? `${isDM(s) ? `<div class="row" style="max-width:820px;margin:0 auto 10px"><button class="btn small gold" id="mpick">${canAdd ? "👹 Ajustar nivel y añadir a la mesa…" : "✎ Imagen, datos y nivel…"}</button></div>` : ""}${isDM(s) ? `<div style="max-width:820px;margin:0 auto 10px">${partyFit(s, cur)}</div>` : ""}${withCustom(s, cur).img ? `<div class="mimg" data-img="${esc(withCustom(s, cur).img)}"></div>` : ""}${monsterCard(withCustom(s, cur), canAdd)}` : `<p class="empty">Elige una criatura.${isDM(s) && !s.board ? " Para ponerla en la mesa, carga antes una escena en la Partida." : ""}</p>`}</article>`;
  const redraw = () => monstruos(body, M);
  bindList(body, redraw);
  bindBack(body, redraw, side || !cur);
  $("#fvd", body).onchange = e => { filt.vd = e.target.value; redraw(); };
  $(".mfilters", body).addEventListener("toggle", e => { mfOpen = e.target.open; });
  $$("[data-mf]", body).forEach(b => b.onclick = () => { const k = b.dataset.mf; mf[k] = mf[k] === b.dataset.v ? "" : b.dataset.v; redraw(); });
  const mc = $("[data-mclear]", body); if (mc) mc.onclick = () => { mf = { vdr: "", ty: "", sz: "", mv: "", tr: "", df: "", or: "" }; filt.vd = ""; redraw(); };
  $$("[data-sort]", body).forEach(b => b.onclick = () => { sortM = b.dataset.sort; redraw(); });
  const mp = $("#mpick", body); if (mp) mp.onclick = () => openCreaturePicker({ preselect: cur.n, title: "Criatura", onAdd: canAdd ? (m, n, h) => addToBoard(m, n, { hidden: h }) : null });
  $$("[data-img]", body).forEach(async e => { const u = await getImage(e.dataset.img); if (u) e.style.backgroundImage = `url('${u}')`; });
  $$("[data-m]", body).forEach(b => b.onclick = () => { sel = b.dataset.m; side = false; redraw(); $(".rpage", body).scrollTop = 0; });
  const add = $("#addmon", body);
  { const h = $("#addhid", body); if (h) h.onchange = () => { addHidden = h.checked; try { localStorage.setItem("lamesa:addhid", addHidden ? "1" : "0"); } catch (e) { /* */ } }; }
  if (add) add.onclick = () => { const n = Math.max(1, +$("#addn", body).value || 1); addToBoard(cur, n, { hidden: addHidden }); toast(`${n} × ${cur.n} en la mesa${addHidden ? " · ocultas a los jugadores" : ""}`); };
}
function bindList(body, redraw) {
  const rq = $("#rq", body);
  rq.oninput = () => { q = rq.value; const pos = rq.selectionStart; redraw(); const n = $("#rq", body); n.focus(); n.setSelectionRange(pos, pos); };
}

/** Coloca n criaturas en casillas libres cerca del centro de la mesa. */
export { openCreaturePicker };
let addHidden = (() => { try { return localStorage.getItem("lamesa:addhid") !== "0"; } catch (e) { return true; } })();
export function addToBoard(m, n = 1, { hidden = false } = {}) {
  store.commit("board", s => {
    const b = s.board; if (!b) return;
    const busy = new Set(s.tokens.map(t => t.c + "," + t.r)), out = [];
    const cc = Math.floor(b.cols * 0.65), cr = Math.floor(b.rows / 2);
    for (let d = 0; d < 12 && out.length < n; d++) for (let r = cr - d; r <= cr + d && out.length < n; r++) for (let c = cc - d; c <= cc + d && out.length < n; c++) {
      if (c < 0 || r < 0 || c >= b.cols || r >= b.rows || busy.has(c + "," + r) || isWallT((b.terrain || {})[c + "," + r])) continue;
      busy.add(c + "," + r); out.push([c, r]);
    }
    // Numeradas tras las que ya hubiera con el mismo nombre (Lobo 3, Lobo 4…)
    const had = s.tokens.filter(t => t.kind !== "pc" && String(t.name).replace(/\s+\d+(\s*\(.*\))?$/, "") === m.n).length;
    out.forEach(([c, r], i) => { const t = monsterToken(m, c, r); if (n > 1 || had) t.name = `${m.n} ${had + i + 1}`; if (hidden) t.hidden = true; s.tokens.push(t); });
  });
}
