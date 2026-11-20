// Reglas: el SRD 5.2.1 en español para todos (libro con buscador, conjuros y monstruos).
import { store } from "../core/store.js";
import { isDM, currentUser } from "../core/session.js";
import { srd, CAPITULOS, ESCUELAS, norm, monsterToken } from "../core/srd.js";
import { $, $$, esc, toast } from "../core/ui.js";
import { openCreaturePicker } from "./criaturas.js";
import { TYPES, typeOf, withCustom } from "../core/bestiario.js";
import { isWallT } from "../data/mapas.js";
import { getImage } from "../core/images.js";

let el = null, tab = "libro", page = 5, q = "", sel = null, filt = { lvl: "", cls: null, vd: "", ty: "", fx: "" }, PROGM = null;
const CLASES = ["bardo", "brujo", "clérigo", "druida", "explorador", "hechicero", "mago", "paladín"];

export function mount(root) {
  el = document.createElement("div"); el.className = "reglas"; root.appendChild(el);
  draw();
  return { update() {}, unmount() { el = null; } };
}
export function openRules(t, item) { tab = t; sel = item; q = ""; location.hash = "reglas"; if (el) draw(); }

async function draw() {
  if (!el) return;
  el.innerHTML = `<nav class="rtabs" role="tablist">${[["libro", "📖 Libro de reglas"], ["conjuros", "✨ Conjuros"], ["monstruos", "🐉 Monstruos"]].map(([k, n]) => `<button role="tab" data-t="${k}" aria-selected="${tab === k}">${n}</button>`).join("")}
    <span class="grow"></span><small class="srdnote">SRD 5.2.1 · Wizards of the Coast · CC BY 4.0</small></nav><div class="rbody"><p class="empty" style="padding:20px">Cargando las reglas…</p></div>`;
  $$("[data-t]", el).forEach(b => b.onclick = () => { tab = b.dataset.t; sel = null; q = ""; draw(); });
  const body = $(".rbody", el);
  if (tab === "libro") return libro(body, await srd("paginas"));
  if (tab === "conjuros") return conjuros(body, await srd("conjuros"));
  return monstruos(body, await srd("monstruos"));
}

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

function libro(body, P) {
  const results = q.length > 2 ? P.map((t, i) => ({ i, t })).filter(x => norm(x.t).includes(norm(q))).slice(0, 60) : [];
  const chap = CAPITULOS.find(([, a, b]) => page >= a && page <= b);
  body.innerHTML = `<aside class="rside">
      <input id="rq" type="search" placeholder="Buscar en las reglas (p. ej. «agarrar», «cobertura»)" value="${esc(q)}">
      ${q.length > 2 ? `<div class="rres">${results.map(x => { const k = norm(x.t).indexOf(norm(q)); return `<button class="place" data-p="${x.i + 1}"><span>${esc(x.t.slice(Math.max(0, k - 40), k + 70).replace(/\n/g, " "))}…</span><small>p. ${x.i + 1}</small></button>`; }).join("") || `<p class="empty">Nada encontrado.</p>`}</div>`
      : `<div class="places">${CAPITULOS.map(([n, a]) => `<button class="place ${chap && chap[0] === n ? "on" : ""}" data-p="${a}"><span>${n}</span><small>p. ${a}</small></button>`).join("")}</div>`}
    </aside>
    <article class="rpage book"><div class="pnav"><button class="btn small" data-go="-1">◀</button><span>${chap ? esc(chap[0]) + " · " : ""}página ${page} de ${P.length}</span><button class="btn small" data-go="1">▶</button></div>
      <div class="bookpage">${bookHTML(P[page - 1] || "", q.length > 2 ? esc(q) : "")}<div class="folio">— ${page} —</div></div>
      <div class="pnav bottom"><button class="btn small" data-go="-1">◀ Anterior</button><button class="btn small" data-go="1">Siguiente ▶</button></div></article>`;
  const rq = $("#rq", body);
  rq.oninput = () => { q = rq.value; const pos = rq.selectionStart; libro(body, P); const n = $("#rq", body); n.focus(); n.setSelectionRange(pos, pos); };
  $$("[data-p]", body).forEach(b => b.onclick = () => { page = +b.dataset.p; libro(body, P); $(".rpage", body).scrollTop = 0; });
  $$("[data-go]", body).forEach(b => b.onclick = () => { page = Math.max(1, Math.min(P.length, page + +b.dataset.go)); libro(body, P); $(".rpage", body).scrollTop = 0; });
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
    </aside><article class="rpage">${cur ? spellCard(cur) : `<p class="empty">Elige un conjuro de la lista.</p>`}</article>`;
  bindList(body, () => conjuros(body, S));
  $("#flvl", body).onchange = e => { filt.lvl = e.target.value; conjuros(body, S); };
  $("#fcls", body).onchange = e => { filt.cls = e.target.value; conjuros(body, S); };
  $$("[data-fx]", body).forEach(b => b.onclick = () => { filt.fx = filt.fx === b.dataset.fx ? "" : b.dataset.fx; conjuros(body, S); });
  $$("[data-s]", body).forEach(b => b.onclick = () => { sel = b.dataset.s; conjuros(body, S); });
}

// Separa la cabecera del perfil (sentidos, inmunidades, idiomas, VD) del cuerpo (rasgos, acciones…)
function monsterParts(txt) {
  const ls = (txt || "").split("\n"), v = ls.findIndex(l => /^VD:/.test(l.trim()));
  const head = v > 0 ? ls.slice(1, v + 1).filter(l => !/^CA:/.test(l.trim())) : [];
  const body = (v > 0 ? ls.slice(v + 1) : ls.slice(1)).join("\n").replace(/^(Rasgos|Acciones legendarias|Acciones adicionales|Acciones|Reacciones)\s+(?=[A-ZÁÉÍÓÚÑ])/gm, "$1\n");
  return { head, body };
}
export function monsterCard(m, withAdd) {
  const mod = v => { const x = Math.floor((v - 10) / 2); return (x >= 0 ? "+" : "−") + Math.abs(x); };
  return `<div class="scard statblock"><h2>${esc(m.n)}</h2><p class="smeta">${esc(m.tipo)}</p>
    <div class="mstats"><span><b>CA</b> ${m.ca}</span><span><b>PG</b> ${m.pg} (${esc(m.pgd)})</span><span><b>Iniciativa</b> ${esc(m.ini)}</span><span><b>Velocidad</b> ${esc(m.vel)}</span><span><b>VD</b> ${esc(m.vd)}</span></div>
    <div class="mab">${Object.entries(m.ab).map(([k, v]) => `<div><small>${k.toUpperCase()}</small><b>${v}</b><em>${mod(v)}</em></div>`).join("")}</div>
    ${m.atk.length ? `<div class="matk">${m.atk.map(a => `<span>⚔️ <b>${esc(a.name)}</b> ${rich(a.atk)} · ${rich(a.dmg)}</span>`).join("")}</div>` : ""}
    ${withAdd ? `<div class="row" style="margin:10px 0"><button class="btn gold small" id="addmon">➕ Poner en la mesa</button><input type="number" id="addn" value="1" min="1" max="12" style="width:56px" aria-label="Cuántos"></div>` : ""}
    ${(() => { const { head, body } = monsterParts(m.txt); return `<div class="mhead">${head.map(l => `<p>${esc(l.trim()).replace(/(^|\s)([A-ZÁÉÍÓÚÑ][a-záéíóúñ ]{2,30}):/g, "$1<b>$2:</b>")}</p>`).join("")}</div>
    <details open><summary>Rasgos y acciones</summary><div class="stext">${bookHTML(body)}</div></details>`; })()}</div>`;
}
const VDS = ["0", "1/8", "1/4", "1/2", ...Array.from({ length: 30 }, (_, i) => String(i + 1))];
function monstruos(body, M) {
  const list = M.filter(m => (!q || norm(m.n).includes(norm(q)) || norm(m.tipo).includes(norm(q))) && (!filt.vd || m.vd === filt.vd) && (!filt.ty || typeOf(m) === filt.ty));
  const cur = M.find(m => m.n === sel) || null, s = store.get(), canAdd = isDM(s) && s.board;
  body.innerHTML = `<aside class="rside">
      <input id="rq" type="search" placeholder="Buscar monstruo o tipo («dragón», «muerto viviente»)" value="${esc(q)}">
      <select id="fvd"><option value="">Cualquier VD</option>${VDS.map(v => `<option ${filt.vd === v ? "selected" : ""}>${v}</option>`).join("")}</select>
      <div class="cptypes side"><button data-fty="" aria-pressed="${!filt.ty}">Todas</button>${TYPES.map(t => `<button data-fty="${t}" aria-pressed="${filt.ty === t}">${t}</button>`).join("")}</div>
      <div class="places">${list.map(m => `<button class="place ${cur === m ? "on" : ""}" data-m="${esc(m.n)}"><span>${esc(m.n)}</span><small>${esc(typeOf(m))} · VD ${m.vd}</small></button>`).join("")}</div>
      <p class="note" style="margin:0">${list.length} criaturas</p>
    </aside><article class="rpage">${cur ? `${isDM(s) ? `<div class="row" style="max-width:820px;margin:0 auto 10px"><button class="btn small gold" id="mpick">${canAdd ? "👹 Ajustar nivel y añadir a la mesa…" : "✎ Imagen, datos y nivel…"}</button></div>` : ""}${withCustom(s, cur).img ? `<div class="mimg" data-img="${esc(withCustom(s, cur).img)}"></div>` : ""}${monsterCard(withCustom(s, cur), canAdd)}` : `<p class="empty">Elige una criatura.${isDM(s) && !s.board ? " Para ponerla en la mesa, carga antes una escena en la Partida." : ""}</p>`}</article>`;
  bindList(body, () => monstruos(body, M));
  $("#fvd", body).onchange = e => { filt.vd = e.target.value; monstruos(body, M); };
  $$("[data-fty]", body).forEach(b => b.onclick = () => { filt.ty = b.dataset.fty; monstruos(body, M); });
  const mp = $("#mpick", body); if (mp) mp.onclick = () => openCreaturePicker({ preselect: cur.n, title: "Criatura", onAdd: canAdd ? (m, n) => addToBoard(m, n) : null });
  $$("[data-img]", body).forEach(async e => { const u = await getImage(e.dataset.img); if (u) e.style.backgroundImage = `url('${u}')`; });
  $$("[data-m]", body).forEach(b => b.onclick = () => { sel = b.dataset.m; monstruos(body, M); });
  const add = $("#addmon", body);
  if (add) add.onclick = () => { const n = Math.max(1, +$("#addn", body).value || 1); addToBoard(cur, n); toast(`${n} × ${cur.n} en la mesa`); };
}
function bindList(body, redraw) {
  const rq = $("#rq", body);
  rq.oninput = () => { q = rq.value; const pos = rq.selectionStart; redraw(); const n = $("#rq", body); n.focus(); n.setSelectionRange(pos, pos); };
}

/** Coloca n criaturas en casillas libres cerca del centro de la mesa. */
export { openCreaturePicker };
export function addToBoard(m, n = 1) {
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
    out.forEach(([c, r], i) => { const t = monsterToken(m, c, r); if (n > 1 || had) t.name = `${m.n} ${had + i + 1}`; s.tokens.push(t); });
  });
}
