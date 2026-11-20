// Tablero de casillas cuadradas (1,5 m por casilla), vista plana. Lo usan el editor de escenas y la mesa en directo.
// Modelo: { grid: { cols, rows, terrain: {"c,r": tipo}, props: [{id,c,r,k,rot,hidden,open,label,loot,trap}] }, tokens: [...] }
import { getImage } from "../core/images.js";
import { esc } from "../core/ui.js";
import { estado } from "../data/estados.js";
import { TERRAIN, TERRAIN_CATS, PROPS, PROP_CATS, isDoor, isWallT, propVisible } from "../data/mapas.js";
import { terrainURL } from "./texturas.js";
import { generateDungeon } from "../core/generador.js";
import { pathTo, moveHint } from "../core/movimiento.js";
import { RES_TEXT, RES_COLOR } from "../core/golpes.js";
export { TERRAIN, PROPS };

const T = 44, S = T / 2; // lado de la casilla en el plano 2D
const key = (c, r) => c + "," + r;
export const center = (c, r) => [c * T + S + 4, r * T + S + 4];
const corners = (x, y, h = S) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => (x + a * h).toFixed(1) + "," + (y + b * h).toFixed(1)).join(" ");
/** Distancia en casillas con la regla de 2024: cada diagonal cuenta como una casilla (1,5 m). */
export const dist = (a, b) => Math.max(Math.abs(a.c - b.c), Math.abs(a.r - b.r));
const pixelToHex = (x, y) => ({ c: Math.floor((x - 4) / T), r: Math.floor((y - 4) / T) });
export const healthWord = (hp, max) => hp <= 0 ? "Fuera de combate" : hp / max > 0.75 ? "Ileso" : hp / max > 0.5 ? "Herido" : hp / max > 0.25 ? "Malherido" : "Al borde";
const imgCache = new Map();
/** Casillas de una línea recta (para muros y para el coste del movimiento). */
export function lineCells(a, b) {
  const out = []; let x0 = a.c, y0 = a.r; const x1 = b.c, y1 = b.r, dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy;
  for (let i = 0; i < 400; i++) { out.push({ c: x0, r: y0 }); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  return out;
}

const TOOLS = [["move", "✋", "Mover y seleccionar"], ["paint", "🖌", "Pincel de terreno"], ["rect", "▭", "Rellenar rectángulo"], ["room", "🏠", "Habitación (suelo y muros)"],
  ["wall", "🧱", "Muro en línea"], ["prop", "🪑", "Objetos"], ["foe", "👹", "Enemigo"], ["erase", "🧽", "Borrar"]];

/**
 * opts: { model(): {grid,tokens}, dm, edit, canMove(token), mutate(label, fn(model)), selected, onSelect(id), hpOf(token),
 *         onProp(prop) (máster, fuera del editor), onSelectProp(id) (editor), marker(), onCell(h), decorate, aim, fogState }
 */
export function createBoard(host, opts) {
  host.classList.add("board");
  host.innerHTML = `<svg class="boardsvg" aria-label="Tablero"><defs></defs><g class="world"></g><g class="ruler"></g><g class="fxl"></g></svg><div class="bvig" aria-hidden="true"></div>
    ${opts.edit ? `<div class="mapeditor" role="toolbar" aria-label="Editor de mapas"></div>` : ""}
    <div class="boardzoom"><button data-z="1.25" aria-label="Acercar">+</button><button data-z="0.8" aria-label="Alejar">−</button><button data-z="fit" aria-label="Encajar">⤢</button>${opts.edit ? "" : `<button data-ruler aria-pressed="false" title="Medir distancias: arrastra de una casilla a otra" aria-label="Regla">📏</button>`}</div>
    <div class="dragtip" hidden></div>`;
  const svg = host.querySelector("svg"), world = svg.querySelector(".world"), defs = svg.querySelector("defs"), tip = host.querySelector(".dragtip");
  const fxl = svg.querySelector(".fxl"), rulerG = svg.querySelector(".ruler");
  let measuring = false; const lastHp = new Map(), shakeUntil = new Map(); let hpPrimed = false;
  let vb = null, drag = null, selected = opts.selected || null, selProp = null, hover = null;
  // Estado del editor (se recuerda mientras dura la sesión)
  const E = createBoard.E = createBoard.E || { tool: "move", brush: "piedra", wall: "muro", floor: "piedra", prop: "mesa", pcat: "mueble", tcat: "interior", size: 1 };
  const hist = { undo: [], redo: [] };

  const size = () => { const g = opts.model().grid; return [g.cols * T + 8, g.rows * T + 8]; };
  const fit = () => { const [w, h] = size(); vb = [0, 0, w, h]; setVB(); };
  const setVB = () => svg.setAttribute("viewBox", vb.map(v => v.toFixed(1)).join(" "));
  const pt = e => { const r = svg.getBoundingClientRect(), k = Math.max(vb[2] / r.width, vb[3] / r.height); const ox = (r.width * k - vb[2]) / 2, oy = (r.height * k - vb[3]) / 2; return [vb[0] + (e.clientX - r.left) * k - ox, vb[1] + (e.clientY - r.top) * k - oy, k]; };
  const inside = h => { const g = opts.model().grid; return h.c >= 0 && h.r >= 0 && h.c < g.cols && h.r < g.rows; };

  /* ---------- Historial (deshacer / rehacer) ---------- */
  const snap = () => { const m = opts.model(); return JSON.stringify({ fl: m.grid.floor || 0, cols: m.grid.cols, rows: m.grid.rows, terrain: m.grid.terrain || {}, props: m.grid.props || [], tokens: m.tokens }); };
  const restore = j => { const d = JSON.parse(j); opts.mutate("board", mm => { if ((mm.grid.floor || 0) !== (d.fl || 0)) return; // no deshacer sobre otra planta
    Object.assign(mm.grid, { cols: d.cols, rows: d.rows, terrain: d.terrain, props: d.props }); mm.tokens.splice(0, mm.tokens.length, ...d.tokens); }); };
  /** Toda edición pasa por aquí: guarda el estado anterior para poder deshacer. */
  const edit = fn => { hist.undo.push(snap()); if (hist.undo.length > 60) hist.undo.shift(); hist.redo = []; opts.mutate("board", fn); tools(); };
  const undo = () => { if (!hist.undo.length) return; hist.redo.push(snap()); restore(hist.undo.pop()); tools(); };
  const redo = () => { if (!hist.redo.length) return; hist.undo.push(snap()); restore(hist.redo.pop()); tools(); };

  /* ---------- Barra del editor ---------- */
  function tools() {
    const t = host.querySelector(".mapeditor"); if (!t) return;
    const g = opts.model().grid, tc = Object.entries(TERRAIN).filter(([, v]) => v.cat === E.tcat);
    const sw = (k, v, attr, on) => `<button class="tsw" data-${attr}="${k}" aria-pressed="${on}" title="${esc(v.n)}${v.dif ? " · terreno difícil" : ""}${v.hz ? " · " + esc(v.hz) : ""}"><i style="background-image:url(${terrainURL(k)})"></i><span>${esc(v.n)}</span></button>`;
    const terrainPicker = (attr, cur, cats) => `<div class="tabs">${Object.entries(TERRAIN_CATS).filter(([k]) => cats.includes(k)).map(([k, n]) => `<button data-tcat="${k}" aria-pressed="${E.tcat === k}">${n}</button>`).join("")}</div>
      <div class="pal">${Object.entries(TERRAIN).filter(([, v]) => v.cat === (cats.includes(E.tcat) ? E.tcat : cats[0])).map(([k, v]) => sw(k, v, attr, cur === k)).join("")}</div>`;
    let pal = "";
    if (E.tool === "paint" || E.tool === "rect") pal = terrainPicker("brush", E.brush, ["interior", "exterior", "peligro", "muro"]) + (E.tool === "paint" ? `<div class="sizes">Tamaño ${[1, 2, 3, 5].map(n => `<button data-size="${n}" aria-pressed="${E.size === n}">${n}×${n}</button>`).join("")}</div>` : `<p class="hint">Arrastra para rellenar un rectángulo.</p>`);
    if (E.tool === "room") pal = `<p class="hint">Arrastra para trazar una habitación. Suelo:</p><div class="pal">${Object.entries(TERRAIN).filter(([, v]) => !v.wall && !v.liquid && v.cat !== "peligro").map(([k, v]) => sw(k, v, "floor", E.floor === k)).join("")}</div><p class="hint">Muros:</p><div class="pal">${Object.entries(TERRAIN).filter(([, v]) => v.wall && !v.void).map(([k, v]) => sw(k, v, "wallt", E.wall === k)).join("")}</div>`;
    if (E.tool === "wall") pal = `<p class="hint">Arrastra para levantar un muro recto.</p><div class="pal">${Object.entries(TERRAIN).filter(([, v]) => v.wall).map(([k, v]) => sw(k, v, "wallt", E.wall === k)).join("")}</div>`;
    if (E.tool === "prop") pal = `<div class="tabs">${Object.entries(PROP_CATS).map(([k, n]) => `<button data-pcat="${k}" aria-pressed="${E.pcat === k}">${n}</button>`).join("")}</div>
      <div class="pal props">${Object.entries(PROPS).filter(([, v]) => v.cat === E.pcat).map(([k, v]) => `<button class="psw" data-prop="${k}" aria-pressed="${E.prop === k}" title="${esc(v.n)}${v.block ? " · no se puede atravesar" : ""}${v.cover ? " · da cobertura" : ""}${v.hidden ? " · oculto a los jugadores" : ""}"><b>${v.i}</b><span>${esc(v.n)}</span></button>`).join("")}</div>
      <p class="hint">${E.pcat === "puerta" ? "Toca un muro para abrir el hueco y poner la puerta." : E.pcat === "tesoro" || E.pcat === "peligro" ? "Colócalo y tócalo con ✋ para escribir su contenido o su efecto." : "Toca una casilla para colocarlo. Con ✋ lo seleccionas, lo mueves y lo giras."}</p>`;
    if (E.tool === "erase") pal = `<div class="sizes">Tamaño ${[1, 2, 3].map(n => `<button data-size="${n}" aria-pressed="${E.size === n}">${n}×${n}</button>`).join("")}</div><p class="hint">Quita fichas y objetos; si no hay, el terreno.</p>`;
    if (E.tool === "foe") pal = `<p class="hint">Toca una casilla para poner un enemigo y edítalo en el panel.</p>`;
    if (E.tool === "move") pal = `<p class="hint">Arrastra fichas y objetos. Toca un objeto para editarlo.</p>`;
    t.innerHTML = `<div class="mtools">${TOOLS.map(([k, ic, n]) => `<button data-tool="${k}" aria-pressed="${E.tool === k}" title="${n}"><b>${ic}</b><span>${n.split(" ")[0]}</span></button>`).join("")}
        <span class="sep"></span><button data-act="undo" ${hist.undo.length ? "" : "disabled"} title="Deshacer (Ctrl+Z)"><b>↶</b><span>Deshacer</span></button><button data-act="redo" ${hist.redo.length ? "" : "disabled"} title="Rehacer (Ctrl+Y)"><b>↷</b><span>Rehacer</span></button>
        <button data-act="more" aria-pressed="${!!E.more}" title="Tamaño del mapa y generar mazmorra"><b>⚙</b><span>Mapa</span></button></div>
      ${E.more ? `<div class="mpal"><div class="row">Tamaño <label>ancho <input type="number" min="6" max="60" id="mcols" value="${g.cols}"></label><label>alto <input type="number" min="6" max="60" id="mrows" value="${g.rows}"></label><button class="btn small" data-act="resize">Aplicar</button></div>
        <div class="row"><button class="btn small gold" data-act="gen">🎲 Generar mazmorra</button><button class="btn small" data-act="gencave">🕳 Generar cueva</button><button class="btn small" data-act="fill">Rellenar todo con el pincel</button></div>
        <p class="hint">Generar sustituye el mapa actual (se puede deshacer).</p></div>` : ""}
      <div class="mpal">${pal}</div>`;
    t.querySelectorAll("[data-tool]").forEach(b => b.onclick = () => { E.tool = b.dataset.tool; if (E.tool !== "move") selectProp(null); tools(); });
    t.querySelectorAll("[data-brush]").forEach(b => b.onclick = () => { E.brush = b.dataset.brush; tools(); });
    t.querySelectorAll("[data-floor]").forEach(b => b.onclick = () => { E.floor = b.dataset.floor; tools(); });
    t.querySelectorAll("[data-wallt]").forEach(b => b.onclick = () => { E.wall = b.dataset.wallt; tools(); });
    t.querySelectorAll("[data-tcat]").forEach(b => b.onclick = () => { E.tcat = b.dataset.tcat; tools(); });
    t.querySelectorAll("[data-pcat]").forEach(b => b.onclick = () => { E.pcat = b.dataset.pcat; const f = Object.entries(PROPS).find(([, v]) => v.cat === E.pcat); if (f) E.prop = f[0]; tools(); });
    t.querySelectorAll("[data-prop]").forEach(b => b.onclick = () => { E.prop = b.dataset.prop; tools(); });
    t.querySelectorAll("[data-size]").forEach(b => b.onclick = () => { E.size = +b.dataset.size; tools(); });
    t.querySelectorAll("[data-act]").forEach(b => b.onclick = () => {
      const a = b.dataset.act;
      if (a === "undo") undo(); else if (a === "redo") redo(); else if (a === "more") { E.more = !E.more; tools(); }
      else if (a === "resize") { const c = Math.max(6, Math.min(60, +t.querySelector("#mcols").value || g.cols)), r = Math.max(6, Math.min(60, +t.querySelector("#mrows").value || g.rows));
        edit(mm => { mm.grid.cols = c; mm.grid.rows = r; mm.grid.props = (mm.grid.props || []).filter(p => p.c < c && p.r < r); for (const k of Object.keys(mm.grid.terrain || {})) { const [x, y] = k.split(",").map(Number); if (x >= c || y >= r) delete mm.grid.terrain[k]; }
          for (let y = 0; y < r; y++) for (let x = 0; x < c; x++) if (!mm.grid.terrain[key(x, y)]) mm.grid.terrain[key(x, y)] = E.brush; mm.tokens.forEach(k => { k.c = Math.min(k.c, c - 1); k.r = Math.min(k.r, r - 1); }); }); fit(); }
      else if (a === "gen" || a === "gencave") edit(mm => { const d = generateDungeon(mm.grid.cols, mm.grid.rows, { cave: a === "gencave", floor: E.floor, wall: a === "gencave" ? "muroroca" : E.wall }); mm.grid.terrain = d.terrain; mm.grid.props = d.props; if (d.start) mm.grid.start = d.start; mm.tokens.splice(0, mm.tokens.length, ...mm.tokens.filter(k => d.terrain[key(k.c, k.r)] && !isWallT(d.terrain[key(k.c, k.r)]))); if (opts.onStart && d.start) opts.onStart(d.start); })
      else if (a === "fill") edit(mm => { mm.grid.terrain = {}; for (let y = 0; y < mm.grid.rows; y++) for (let x = 0; x < mm.grid.cols; x++) mm.grid.terrain[key(x, y)] = E.brush; });
    });
  }

  /* ---------- Dibujo ---------- */
  const usedPatterns = new Set();
  function pattern(k) {
    if (usedPatterns.has(k)) return `url(#tx-${k})`;
    usedPatterns.add(k);
    defs.insertAdjacentHTML("beforeend", `<pattern id="tx-${k}" patternUnits="userSpaceOnUse" x="4" y="4" width="${T * 2}" height="${T * 2}"><image href="${terrainURL(k)}" width="${T * 2}" height="${T * 2}"/></pattern>`);
    return `url(#tx-${k})`;
  }
  if (!defs.querySelector("#difh")) defs.insertAdjacentHTML("beforeend", `<pattern id="difh" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="rgba(255,240,200,.16)" stroke-width="2"/></pattern>
    <filter id="wsh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000" flood-opacity=".75"/></filter>`);

  function render() {
    if (drag && (drag.token || drag.prop)) return; // no redibujar a mitad de un arrastre
    const { grid, tokens } = opts.model();
    if (!vb) fit();
    const t = grid.terrain || {}, wallAt = (c, r) => c < 0 || r < 0 || c >= grid.cols || r >= grid.rows ? false : isWallT(t[key(c, r)]);
    let cells = "", walls = "", dif = "";
    for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) {
      const [x, y] = center(c, r), k = t[key(c, r)], ty = TERRAIN[k];
      if (ty && ty.wall) {
        if (ty.void) { walls += `<rect x="${x - S}" y="${y - S}" width="${T}" height="${T}" fill="#0a0908"/>`; continue; }
        walls += `<rect x="${x - S}" y="${y - S}" width="${T}" height="${T}" fill="${pattern(k)}"/><rect x="${x - S}" y="${y - S}" width="${T}" height="${T}" class="wtop"/>`;
        // Borde iluminado donde el muro da a una casilla transitable
        [[0, -1, `M${x - S},${y - S}h${T}`], [1, 0, `M${x + S},${y - S}v${T}`], [0, 1, `M${x - S},${y + S}h${T}`], [-1, 0, `M${x - S},${y - S}v${T}`]].forEach(([dc, dr, d]) => { if (!wallAt(c + dc, r + dr) && c + dc >= 0 && r + dr >= 0 && c + dc < grid.cols && r + dr < grid.rows) walls += `<path d="${d}" class="wedge"/>`; });
      } else {
        cells += `<rect x="${x - S}" y="${y - S}" width="${T + .5}" height="${T + .5}" fill="${ty ? pattern(k) : "#3a332b"}"/>`;
        if (ty && ty.dif) dif += `<rect x="${x - S}" y="${y - S}" width="${T}" height="${T}" fill="url(#difh)"/>`;
      }
    }
    const grid2 = `<path class="gridl" d="${Array.from({ length: grid.cols + 1 }, (_, c) => `M${4 + c * T},4v${grid.rows * T}`).join("")}${Array.from({ length: grid.rows + 1 }, (_, r) => `M4,${4 + r * T}h${grid.cols * T}`).join("")}"/>`;
    const props = (grid.props || []).filter(p => propVisible(p, opts.dm)).map(p => propSvg(p, grid, wallAt)).join("");
    const fog = opts.fogState ? opts.fogState() : null;
    let fogSvg = "";
    if (fog) for (let r = 0; r < grid.rows; r++) for (let c = 0; c < grid.cols; c++) {
      const k = key(c, r); if (fog.vis.has(k)) continue;
      const [x, y] = center(c, r);
      fogSvg += `<rect x="${x - S}" y="${y - S}" width="${T}" height="${T}" fill="${fog.exp.has(k) ? "rgba(5,7,12,.62)" : "#0c0a08"}"/>`;
    }
    host.dataset.amb = grid.ambient || "interior";
    // Daño y curación: el número sale flotando sobre la ficha (todos lo ven)
    tokens.forEach(k => { const hp = opts.hpOf(k); if (!hp) return; const was = lastHp.get(k.id); lastHp.set(k.id, hp.cur);
      if (hpPrimed && was != null && was !== hp.cur && (opts.dm || !k.hidden)) { const [x, y] = center(k.c, k.r), d = hp.cur - was; setTimeout(() => floatTxt(x + S * 0.55, y + 6, (d > 0 ? "+" : "−") + Math.abs(d), d > 0 ? "#7dff9a" : "#ff5a48", Math.abs(d) >= 15), 450);
        if (d < 0) shakeUntil.set(k.id, Date.now() + 450); } });
    hpPrimed = true;
    const toks = tokens.filter(k => (opts.dm || !k.hidden) && (!fog || k.kind === "pc" || fog.vis.has(key(k.c, k.r)))).map(k => {
      const dk = { name: k.name, color: k.color, ...(opts.decorate ? opts.decorate(k) : {}) };
      const [x, y] = center(k.c, k.r), rad = S * 0.8 * (k.size || 1), hp = opts.hpOf(k), down = hp && hp.cur <= 0;
      const img = dk.portrait && imgCache.get(dk.portrait);
      if (dk.portrait && !imgCache.has(dk.portrait)) { imgCache.set(dk.portrait, null); getImage(dk.portrait).then(u => { imgCache.set(dk.portrait, u); render(); }); }
      const ring = k.kind === "pc" ? "#d6aa4e" : k.kind === "npc" ? "#7d8fe0" : "#b33a2e";
      const raw = hp ? Math.max(0, Math.min(1, hp.cur / Math.max(1, hp.max))) : 1;
      const pct = opts.dm || k.kind === "pc" ? raw : raw > 0.75 ? 1 : raw > 0.5 ? 0.7 : raw > 0.25 ? 0.45 : raw > 0 ? 0.18 : 0; // a los enemigos se les ve "a ojo"
      return `<g class="tok ${down ? "down" : ""} ${k.hidden ? "hid" : ""} ${selected === k.id ? "sel" : ""} ${opts.canMove(k) ? "mov" : ""} ${(shakeUntil.get(k.id) || 0) > Date.now() ? "shake" : ""}" data-tok="${k.id}" transform="translate(${x},${y})">
        <clipPath id="cp-${k.id}"><circle r="${rad - 2}"/></clipPath>
        <circle r="${rad + 3}" class="halo"/>
        ${(k.conds || []).map((cd, i) => { const e = estado(cd.id); return e ? `<circle r="${rad + 5 + i * 3.5}" fill="none" stroke="${e.c}" stroke-width="3"/>` : ""; }).join("")}
        <circle r="${rad}" fill="${dk.color || "#777"}" stroke="${ring}" stroke-width="3"/>
        ${img ? `<image href="${img}" x="${-rad}" y="${-rad}" width="${rad * 2}" height="${rad * 2}" clip-path="url(#cp-${k.id})" preserveAspectRatio="xMidYMid slice"/>` : `<text class="ini" y="5">${esc((dk.name || "?").replace(/\s*\(.*?\)/g, "").split(/\s+/).map(w => w.replace(/[^\p{L}\p{N}]/gu, "")[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?")}</text>`}
        ${hp ? `<rect x="${-rad}" y="${rad + 3}" width="${rad * 2}" height="6" rx="2" class="hpbg"/><rect x="${-rad}" y="${rad + 3}" width="${rad * 2 * pct}" height="6" rx="2" class="hpfg ${pct <= .25 ? "low" : pct <= .5 ? "mid" : ""}"/>` : ""}
        ${dk.isTurn ? `<circle r="${rad + 7}" class="turn"/>` : ""}
      </g>`;
    }).join("");
    const mk = opts.marker && opts.marker(), mkp = mk && center(mk.c, mk.r);
    const start = mkp ? `<g class="startmk" transform="translate(${mkp[0]},${mkp[1]})"><polygon points="${corners(0, 0, S * 0.92)}"/><text y="6">⚑</text></g>` : "";
    const aim = opts.aim && opts.aim(), A = aim && tokens.find(t => t.id === aim.from), B = aim && tokens.find(t => t.id === aim.to);
    let aimSvg = "";
    if (A && B && (opts.dm || !B.hidden)) { const [x0, y0] = center(A.c, A.r), [x1, y1] = center(B.c, B.r); aimSvg = `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="${aim.color}" stroke-width="3" stroke-dasharray="8 5"/><text x="${(x0 + x1) / 2}" y="${(y0 + y1) / 2 - 8}" class="aimtxt" fill="${aim.color}">${esc(aim.label)}</text>`; }
    // Alcance del movimiento de la ficha que tiene el turno
    const R = selected && opts.reach ? opts.reach(selected) : null; let reach = "";
    if (R) { R.cells.forEach((v, k) => { if (!v.cost || v.occ) return; const [c, r] = k.split(",").map(Number), [x, y] = center(c, r); reach += `<rect x="${x - S + 2}" y="${y - S + 2}" width="${T - 4}" height="${T - 4}" rx="4" class="rch ${v.dash ? "dash" : v.dif ? "dif" : ""}"/>`; });
      const [ox, oy] = center(R.from.c, R.from.r); reach += `<circle cx="${ox}" cy="${oy}" r="${S * .8}" class="rorig"/>`; }
    world.innerHTML = `<g class="cells">${cells}</g><g>${dif}</g><g filter="url(#wsh)">${walls}</g>${grid2}${start}<g class="reach">${reach}</g><g class="props">${props}</g><g class="fog">${fogSvg}</g><g class="toks">${toks}</g><g class="aim">${aimSvg}</g><g class="ghost"></g>`;
    ghost();
  }
  function propSvg(p, grid, wallAt) {
    const v = PROPS[p.k] || { i: "?", n: p.k }, [x, y] = center(p.c, p.r), hid = p.hidden ?? v.hidden, sel = selProp === p.id ? " sel" : "";
    if (v.door) {
      const horiz = wallAt(p.c - 1, p.r) || wallAt(p.c + 1, p.r), rot = horiz ? 0 : 90;
      const leaf = p.open ? `<rect x="${-S + 2}" y="-3" width="${T * .42}" height="6" rx="1" transform="rotate(-70 ${-S + 2} 0)" class="dleaf"/>` : v.seeThrough ? `<g class="dbars">${[-14, -7, 0, 7, 14].map(o => `<line x1="${o}" y1="-5" x2="${o}" y2="5"/>`).join("")}<line x1="${-S + 3}" y1="0" x2="${S - 3}" y2="0"/></g>` : `<rect x="${-S + 2}" y="-5" width="${T - 4}" height="10" rx="2" class="dleaf"/>`;
      return `<g class="prop door${hid ? " hid" : ""}${sel}" data-prop="${p.id}" transform="translate(${x},${y}) rotate(${rot})">${leaf}${v.lock && !p.open ? `<text y="4" class="dlock" transform="rotate(${-rot})">🔒</text>` : ""}${hid ? `<rect x="${-S + 1}" y="-8" width="${T - 2}" height="16" class="hidring"/>` : ""}</g>`;
    }
    return `<g class="prop c-${v.cat}${hid ? " hid" : ""}${sel}${v.block ? " block" : ""}" data-prop="${p.id}" transform="translate(${x},${y})"><circle r="${S * .78}" class="pbg"/><text y="${S * .32}" transform="rotate(${(p.rot || 0) * 90})">${v.i}</text>${p.label ? `<title>${esc(p.label)}</title>` : ""}</g>`;
  }
  /** Vista previa de lo que se va a pintar o trazar. */
  function ghost() {
    const g = world.querySelector(".ghost"); if (!g) return;
    let html = "";
    const cellsOf = () => {
      if (drag && drag.rect) { const a = drag.rect, b = drag.cur || a, out = []; for (let r = Math.min(a.r, b.r); r <= Math.max(a.r, b.r); r++) for (let c = Math.min(a.c, b.c); c <= Math.max(a.c, b.c); c++) out.push({ c, r, edge: r === Math.min(a.r, b.r) || r === Math.max(a.r, b.r) || c === Math.min(a.c, b.c) || c === Math.max(a.c, b.c) }); return out; }
      if (drag && drag.line) return lineCells(drag.line, drag.cur || drag.line);
      if (hover && ["paint", "erase"].includes(E.tool)) return brushCells(hover);
      if (hover && ["prop", "foe", "wall"].includes(E.tool)) return [hover];
      return [];
    };
    for (const h of cellsOf()) {
      if (!inside(h)) continue;
      const [x, y] = center(h.c, h.r);
      const k = E.tool === "room" ? (h.edge ? E.wall : E.floor) : E.tool === "wall" ? E.wall : E.brush;
      html += E.tool === "erase" ? `<rect x="${x - S}" y="${y - S}" width="${T}" height="${T}" class="gerase"/>`
        : ["prop", "foe"].includes(E.tool) ? `<rect x="${x - S}" y="${y - S}" width="${T}" height="${T}" class="gcell"/>${E.tool === "prop" ? `<text x="${x}" y="${y + 8}" class="gicon">${(PROPS[E.prop] || {}).i || ""}</text>` : ""}`
        : `<rect x="${x - S}" y="${y - S}" width="${T}" height="${T}" fill="${pattern(k)}" opacity=".85" class="gcell"/>`;
    }
    if (drag && drag.rect && drag.cur) { const w = Math.abs(drag.cur.c - drag.rect.c) + 1, h = Math.abs(drag.cur.r - drag.rect.r) + 1; showTip(`${w} × ${h} casillas · ${(w * 1.5).toLocaleString("es-ES")} × ${(h * 1.5).toLocaleString("es-ES")} m`); }
    g.innerHTML = html;
  }
  const brushCells = h => { const n = E.size || 1, o = Math.floor((n - 1) / 2), out = []; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) out.push({ c: h.c - o + c, r: h.r - o + r }); return out; };
  let lastEv = null;
  const showTip = txt => { if (!lastEv) return; const r = host.getBoundingClientRect(); tip.hidden = false; tip.textContent = txt; tip.style.left = (lastEv.clientX - r.left + 14) + "px"; tip.style.top = (lastEv.clientY - r.top + 14) + "px"; };

  /* ---------- Golpes: tajo, proyectil, chispas y texto flotante ---------- */
  const NS = "http://www.w3.org/2000/svg";
  function addFx(html, ms) { const g = document.createElementNS(NS, "g"); g.innerHTML = html; fxl.appendChild(g); setTimeout(() => g.remove(), ms); return g; }
  function floatTxt(x, y, text, color, big) { addFx(`<text class="ftxt${big ? " big" : ""}" x="${x}" y="${y}" fill="${color}">${esc(text)}</text>`, big ? 2200 : 1800); }
  function sparks2(x, y, color, n = 12) {
    addFx(Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2 + Math.random() * 0.4, d = 16 + Math.random() * 18;
      return `<circle class="fspark" cx="${x}" cy="${y}" r="${2 + Math.random() * 2}" fill="${color}" style="--dx:${(Math.cos(a) * d).toFixed(1)}px;--dy:${(Math.sin(a) * d).toFixed(1)}px"/>`; }).join("")
      + `<circle class="fflash" cx="${x}" cy="${y}" r="${S * 0.9}" fill="${color}"/>`, 800);
  }
  function playEvents(evs) {
    for (const e of evs) setTimeout(() => {
      if (!host.isConnected) return;
      const m = opts.model(), B = m.tokens.find(t => t.id === e.to); if (!B || (B.hidden && !opts.dm)) return;
      const [x1, y1] = center(B.c, B.r), rb = S * 0.8 * (B.size || 1);
      const say = () => floatTxt(x1, y1 - rb - 20, RES_TEXT[e.res], RES_COLOR[e.res], e.res === "crit");
      const A = e.from && e.from !== e.to && m.tokens.find(t => t.id === e.from);
      if (e.type !== "atk" || !A) return say();
      const [x0, y0] = center(A.c, A.r), melee = dist(A, B) <= 1 + Math.max(A.size || 1, B.size || 1), miss = e.res === "miss";
      const land = () => { if (miss) return say(); sparks2(x1, y1, e.res === "crit" ? "#ffd65a" : e.color === "#f4ecd8" ? "#ffb15a" : e.color, e.res === "crit" ? 20 : 12); shakeUntil.set(B.id, Date.now() + 450); const g = world.querySelector(`[data-tok="${B.id}"]`); if (g) { g.classList.remove("shake"); void g.getBBox(); g.classList.add("shake"); } setTimeout(say, 60); };
      if (melee && !e.magic) {
        const ang = Math.atan2(y1 - y0, x1 - x0), r = rb + 10, ux = Math.cos(ang), uy = Math.sin(ang), px = -uy, py = ux;
        const sx = x1 + px * r - ux * 4, sy = y1 + py * r - uy * 4, ex = x1 - px * r - ux * 4, ey = y1 - py * r - uy * 4, qx = x1 - ux * r * 1.1, qy = y1 - uy * r * 1.1;
        addFx(`<path class="fslash${miss ? " miss" : ""}" d="M${sx.toFixed(1)},${sy.toFixed(1)} Q${qx.toFixed(1)},${qy.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}"/>`, 600);
        setTimeout(land, 170);
      } else {
        let tx = x1, ty = y1; if (miss) { const nx = -(y1 - y0), ny = x1 - x0, l = Math.hypot(nx, ny) || 1; tx += nx / l * 22 + (x1 - x0) / l * 40; ty += ny / l * 22 + (y1 - y0) / l * 40; }
        const g = addFx(`<line class="ftrail" x1="${x0}" y1="${y0}" x2="${x0}" y2="${y0}" stroke="${e.color}"/><circle class="fball${e.magic ? " magic" : ""}" cx="${x0}" cy="${y0}" r="${e.magic ? 7 : 4}" fill="${e.color}"/>`, 1200);
        const ln = g.querySelector("line"), bl = g.querySelector("circle"), dur = Math.min(520, 160 + Math.hypot(tx - x0, ty - y0) * 0.9), t0 = performance.now();
        const step = now => { const k = Math.min(1, (now - t0) / dur), x = x0 + (tx - x0) * k, y = y0 + (ty - y0) * k;
          bl.setAttribute("cx", x); bl.setAttribute("cy", y); ln.setAttribute("x2", x); ln.setAttribute("y2", y); ln.setAttribute("x1", x0 + (tx - x0) * Math.max(0, k - 0.35)); ln.setAttribute("y1", y0 + (ty - y0) * Math.max(0, k - 0.35));
          if (k < 1) requestAnimationFrame(step); else { bl.remove(); ln.style.opacity = 0; land(); } };
        requestAnimationFrame(step);
      }
    }, e.delay || 0);
  }

  /* ---------- Regla: medir de una casilla a otra (cada diagonal cuenta 1,5 m) ---------- */
  function drawRuler(a, b) {
    if (!a) { rulerG.innerHTML = ""; return; }
    const [x0, y0] = center(a.c, a.r), [x1, y1] = center(b.c, b.r), n = dist(a, b), m = (n * 1.5).toLocaleString("es-ES");
    rulerG.innerHTML = `<line class="rl" x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}"/><circle class="rdot" cx="${x0}" cy="${y0}" r="5"/><circle class="rdot" cx="${x1}" cy="${y1}" r="5"/>
      <g transform="translate(${(x0 + x1) / 2},${(y0 + y1) / 2 - 14})"><rect class="rbox" x="-42" y="-13" width="84" height="24" rx="12"/><text class="rtxt" y="4">${m} m · ${n}</text></g>`;
  }
  { const rb = host.querySelector("[data-ruler]"); if (rb) rb.onclick = () => { measuring = !measuring; rb.setAttribute("aria-pressed", measuring); host.classList.toggle("measuring", measuring); if (!measuring) drawRuler(null); }; }

  /* ---------- Interacción ---------- */
  const propAt = (h, m = opts.model()) => [...(m.grid.props || [])].reverse().find(p => p.c === h.c && p.r === h.r && propVisible(p, opts.dm));
  svg.addEventListener("pointerdown", e => {
    lastEv = e;
    const [x, y] = pt(e), h = pixelToHex(x, y), tokEl = e.target.closest("[data-tok]");
    const m = opts.model(), tok = tokEl && m.tokens.find(k => k.id === tokEl.dataset.tok);
    svg.setPointerCapture(e.pointerId);
    if (e.button === 1 || e.button === 2) { drag = { pan: true, sx: e.clientX, sy: e.clientY, vb: [...vb], moved: true }; return; }
    if (opts.edit && inside(h)) {
      if (E.tool === "erase") { drag = { erase: true, done: new Set() }; hist.undo.push(snap()); hist.redo = []; eraseAt(h, tok, drag.done); return; }
      if (E.tool === "paint") { drag = { paint: new Map() }; brushCells(h).forEach(b => inside(b) && drag.paint.set(key(b.c, b.r), E.brush)); paintPreview(); return; }
      if (E.tool === "rect" || E.tool === "room") { drag = { rect: h, cur: h }; ghost(); return; }
      if (E.tool === "wall") { drag = { line: h, cur: h }; ghost(); return; }
      if (E.tool === "prop") { placeProp(h); return; }
      if (E.tool === "foe") {
        const id = "t" + Date.now().toString(36);
        edit(mm => mm.tokens.push({ id, kind: "foe", name: "Enemigo", c: h.c, r: h.r, color: "#7a2a22", size: 1, hp: 7, maxhp: 7, ac: 12, initBonus: 0 }));
        select(id); return;
      }
    }
    if (measuring && !opts.edit && inside(h)) { drag = { ruler: h, cur: h }; drawRuler(h, h); return; }
    if (tok) { drag = { token: tok, from: { c: tok.c, r: tok.r }, sx: x, sy: y, moved: false, can: opts.canMove(tok) }; return; }
    const pr = inside(h) && propAt(h);
    if (pr && opts.edit) { drag = { prop: pr, sx: x, sy: y, moved: false }; return; }
    drag = { pan: true, sx: e.clientX, sy: e.clientY, vb: [...vb], moved: false, prop: null, cell: h };
  });
  svg.addEventListener("contextmenu", e => e.preventDefault());
  svg.addEventListener("pointermove", e => {
    lastEv = e;
    const [x, y] = pt(e), h = pixelToHex(x, y);
    if (!drag) { if (opts.edit && (!hover || hover.c !== h.c || hover.r !== h.r)) { hover = inside(h) ? h : null; ghost(); } return; }
    if (drag.pan) {
      const r = svg.getBoundingClientRect(), k = Math.max(vb[2] / r.width, vb[3] / r.height);
      const dx = (e.clientX - drag.sx) * k, dy = (e.clientY - drag.sy) * k;
      if (Math.hypot(dx, dy) > 3) drag.moved = true;
      vb = [drag.vb[0] - dx, drag.vb[1] - dy, vb[2], vb[3]]; setVB(); return;
    }
    if (drag.ruler) { if (inside(h)) { drag.cur = h; drawRuler(drag.ruler, h); } return; }
    if (drag.erase) { if (inside(h)) eraseAt(h, null, drag.done); return; }
    if (drag.paint) { brushCells(h).forEach(b => inside(b) && drag.paint.set(key(b.c, b.r), E.brush)); paintPreview(); return; }
    if (drag.rect || drag.line) { if (inside(h) && (!drag.cur || drag.cur.c !== h.c || drag.cur.r !== h.r)) { drag.cur = h; ghost(); } return; }
    if (drag.prop) {
      if (!drag.moved && Math.hypot(x - drag.sx, y - drag.sy) < 6) return;
      drag.moved = true; const g = world.querySelector(`[data-prop="${drag.prop.id}"]`); if (g) g.setAttribute("transform", `translate(${x},${y})`); return;
    }
    if (drag.token && drag.can) {
      if (!drag.moved && Math.hypot(x - drag.sx, y - drag.sy) < 12) return;
      drag.moved = true;
      const g = world.querySelector(`[data-tok="${drag.token.id}"]`); if (g) g.setAttribute("transform", `translate(${x},${y})`);
      const [cx, cy] = center(h.c, h.r), cost = moveCost(opts.model().grid, drag.from, h);
      const R = opts.reach ? opts.reach(drag.token.id) : null, path = R ? pathTo(R, h.c, h.r) : [], ok = !R || (R.cells.has(h.c + "," + h.r) && !R.cells.get(h.c + "," + h.r).occ);
      world.querySelector(".ghost").innerHTML = (inside(h) ? `<polygon points="${corners(cx, cy)}" class="target ${ok ? "" : "bad"}"/>` : "") + (path.length > 1 ? `<polyline points="${path.map(q => center(q.c, q.r).join(",")).join(" ")}" class="rpath ${R.cells.get(h.c + "," + h.r).dash ? "dash" : ""}"/>` : "");
      showTip(R ? moveHint(R, h.c, h.r) : `${(cost * 1.5).toLocaleString("es-ES")} m${cost > dist(drag.from, h) ? " (terreno difícil)" : ""}`);
    }
  });
  svg.addEventListener("pointerleave", () => { hover = null; if (!drag) { tip.hidden = true; ghost(); } });
  const end = e => {
    if (!drag) return;
    const d = drag; drag = null; tip.hidden = true;
    const [x, y] = pt(e), h = pixelToHex(x, y);
    if (d.ruler) return; // la medida se queda a la vista hasta la siguiente
    if (d.erase) { tools(); return; }
    if (d.paint) { const p = d.paint; edit(mm => { mm.grid.terrain = mm.grid.terrain || {}; p.forEach((v, k) => (mm.grid.terrain[k] = v)); }); return; }
    if (d.rect) { const a = d.rect, b = d.cur || a, room = E.tool === "room";
      edit(mm => { mm.grid.terrain = mm.grid.terrain || {}; const r0 = Math.min(a.r, b.r), r1 = Math.max(a.r, b.r), c0 = Math.min(a.c, b.c), c1 = Math.max(a.c, b.c);
        for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const edge = r === r0 || r === r1 || c === c0 || c === c1;
          mm.grid.terrain[key(c, r)] = room ? (edge ? (isDoorAt(mm, c, r) ? mm.grid.terrain[key(c, r)] : E.wall) : E.floor) : E.brush; } }); return; }
    if (d.line) { const cells = lineCells(d.line, d.cur || d.line); edit(mm => { mm.grid.terrain = mm.grid.terrain || {}; cells.forEach(cc => { if (inside(cc)) mm.grid.terrain[key(cc.c, cc.r)] = E.wall; }); mm.grid.props = (mm.grid.props || []).filter(p => !cells.some(cc => cc.c === p.c && cc.r === p.r) || isDoor(p)); }); return; }
    if (d.prop) {
      if (!d.moved) { selectProp(d.prop.id); return; }
      if (inside(h)) edit(mm => { const p = (mm.grid.props || []).find(z => z.id === d.prop.id); if (p) { p.c = h.c; p.r = h.r; } });
      selectProp(d.prop.id); return;
    }
    if (d.pan) {
      if (!d.moved) {
        const pr = d.cell && inside(d.cell) && propAt(d.cell);
        if (pr && !opts.edit && opts.dm && opts.onProp) { opts.onProp(pr); return; }
        select(null); selectProp(null); if (opts.onCell && inside(h)) opts.onCell(h);
      }
      return;
    }
    if (d.token) {
      if (!d.moved || (h.c === d.token.c && h.r === d.token.r)) { select(d.token.id); render(); return; }
      const g = opts.model().grid, t = (g.terrain || {})[key(h.c, h.r)], blockedProp = (g.props || []).some(p => p.c === h.c && p.r === h.r && ((PROPS[p.k] || {}).block || (isDoor(p) && !p.open && !opts.dm)));
      if (inside(h) && !isWallT(t) && !blockedProp) opts.mutate("token", mm => { const k = mm.tokens.find(z => z.id === d.token.id); if (k) { k.c = h.c; k.r = h.r; } }, d.token);
      select(d.token.id); render();
    }
  };
  svg.addEventListener("pointerup", end);
  svg.addEventListener("pointercancel", () => { drag = null; tip.hidden = true; render(); });
  svg.addEventListener("wheel", e => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0015), pt(e)); }, { passive: false });
  host.querySelectorAll("[data-z]").forEach(b => b.onclick = () => b.dataset.z === "fit" ? fit() : zoom(1 / +b.dataset.z, [vb[0] + vb[2] / 2, vb[1] + vb[3] / 2]));
  function zoom(f, [x, y]) { const nw = Math.max(150, Math.min(size()[0] * 3, vb[2] * f)), k = nw / vb[2]; vb = [x - (x - vb[0]) * k, y - (y - vb[1]) * k, vb[2] * k, vb[3] * k]; setVB(); }
  function paintPreview() {
    const g = world.querySelector(".ghost");
    g.innerHTML = [...drag.paint.keys()].map(k => { const [c, r] = k.split(",").map(Number), [x, y] = center(c, r); return `<rect x="${x - S}" y="${y - S}" width="${T}" height="${T}" fill="${pattern(E.brush)}" opacity=".9"/>`; }).join("");
  }
  const isDoorAt = (mm, c, r) => (mm.grid.props || []).some(p => p.c === c && p.r === r && isDoor(p));
  function placeProp(h) {
    const v = PROPS[E.prop]; if (!v) return;
    const id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    edit(mm => {
      mm.grid.props = mm.grid.props || []; mm.grid.terrain = mm.grid.terrain || {};
      const here = mm.grid.terrain[key(h.c, h.r)];
      if (v.door) {
        // Abre el hueco en el muro con el suelo de al lado
        mm.grid.props = mm.grid.props.filter(p => !(p.c === h.c && p.r === h.r && isDoor(p)));
        if (isWallT(here)) { const n = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([a, b]) => mm.grid.terrain[key(h.c + a, h.r + b)]).find(x => x && !isWallT(x)); mm.grid.terrain[key(h.c, h.r)] = n || "piedra"; }
      } else if (isWallT(here) && !v.wall) return;
      mm.grid.props.push({ id, c: h.c, r: h.r, k: E.prop, rot: 0, hidden: !!v.hidden, ...(v.loot ? { loot: "" } : {}), ...(v.trap ? { trap: { dc: 13, save: "des", dmg: "2d10", type: "perforante", detect: 13 } } : {}) });
    });
    if (v.loot || v.trap || v.cat === "marca") selectProp(id);
  }
  function eraseAt(h, tok, done) {
    const cells = tok ? [h] : brushCells(h).filter(inside);
    opts.mutate("board", mm => {
      for (const cc of cells) {
        const k = key(cc.c, cc.r); if (done.has(k)) continue; done.add(k);
        const ti = mm.tokens.findIndex(z => z.c === cc.c && z.r === cc.r);
        if (ti >= 0) { mm.tokens.splice(ti, 1); continue; }
        const i = (mm.grid.props || []).findIndex(p => p.c === cc.c && p.r === cc.r);
        if (i >= 0) mm.grid.props.splice(i, 1); else if (mm.grid.terrain) delete mm.grid.terrain[k];
      }
    });
  }
  function select(id) { selected = id; opts.onSelect && opts.onSelect(id); render(); }
  function selectProp(id) { selProp = id; opts.onSelectProp && opts.onSelectProp(id); render(); }
  const onKey = e => {
    if (!opts.edit || !host.isConnected) return;
    if (/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName)) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
    else if (selProp && e.key.toLowerCase() === "r") edit(mm => { const p = (mm.grid.props || []).find(z => z.id === selProp); if (p) p.rot = ((p.rot || 0) + 1) % 4; });
    else if (selProp && (e.key === "Delete" || e.key === "Backspace")) { const id = selProp; selectProp(null); edit(mm => { mm.grid.props = (mm.grid.props || []).filter(p => p.id !== id); }); }
  };
  addEventListener("keydown", onKey);

  tools(); render();
  return { render, fit, select, playEvents, get selected() { return selected; }, get selectedProp() { return selProp; }, selectProp, editProp: (id, fn) => edit(mm => { const p = (mm.grid.props || []).find(z => z.id === id); if (p) fn(p, mm); }), resize() { fit(); }, undo, redo };
}

/** Coste de moverse en línea recta, en casillas: el terreno difícil cuenta doble. */
export function moveCost(grid, a, b) {
  const t = grid.terrain || {};
  return lineCells(a, b).slice(1).reduce((n, cc) => n + (TERRAIN[t[key(cc.c, cc.r)]] && TERRAIN[t[key(cc.c, cc.r)]].dif ? 2 : 1), 0);
}
