// Preparar escenas tácticas (solo administrador y másteres).
// Cada escena va asociada a un lugar del mundo o a la biblioteca, para improvisar.
import { LEVELS, ambientLevel } from "../core/vision.js";
import { store } from "../core/store.js";
import { isDM } from "../core/session.js";
import { blankScene, exampleScenes } from "../data/escenas.js";
import { loadScene } from "../core/mesa.js";
import { createBoard, TERRAIN } from "./tablero.js";
import { propEditorHTML, bindPropEditor } from "./propeditor.js";
import { generateDungeon, generateRegion } from "../core/generador.js";
import { openCreaturePicker } from "./criaturas.js";
import { difficulty, difficultyHTML, partyOf } from "../core/encuentro.js";
// Todas las criaturas de la escena, en todas sus plantas
const sceneFoes = x => [...(x.tokens || []), ...((x.floors || []).flatMap(f => f.tokens || []))].filter(t => t.kind === "foe");
import { isWallT, REGIONS } from "../data/mapas.js";
import { regionPackOf } from "../core/regiones.js";
import { tokenEditor, bindTokenEditor } from "./mesa.js";
import { $, $$, esc, toast } from "../core/ui.js";
import { floorsOf, floorIdx, swapFloor, addFloor, renameFloor, removeFloor } from "../core/plantas.js";
import { srdNow, monsterToken, findMonster } from "../core/srd.js";

let el = null, openId = null, board = null, sel = null, selProp = null, placing = false, preview3d = false;

export function mount(root) {
  el = document.createElement("div");
  el.className = "escenas";
  root.appendChild(el);
  board = null; sel = null; placing = false;
  draw();
  return {
    update(s, label, remote) { if (label === "field" && !remote) return; if (label === "board" && board && openId && s.scenes.some(x => x.id === openId)) { board.render(); side(); return; } draw(); },
    unmount() { el = null; board = null; }
  };
}

const scene = () => store.get().scenes.find(x => x.id === openId);

function draw() {
  if (!el) return;
  const s = store.get();
  if (!isDM(s)) { el.innerHTML = `<div class="page"><div class="wrap"><h1 class="title">Escenas</h1><p class="lead">Esta sección es solo para el máster.</p></div></div>`; return; }
  if (!scene()) openId = null;
  const groups = [["", "Biblioteca (para improvisar)"], ...s.world.places.map(p => [p.id, p.name])];
  el.innerHTML = `<aside class="scenes-side">
      <h2 class="sec">Escenas</h2>
      ${groups.map(([pid, n]) => { const list = s.scenes.filter(x => (x.place || "") === pid || (!pid && x.place && !s.world.places.some(p => p.id === x.place))); return list.length || !pid ? `<div class="sgroup"><small>${esc(n)}</small>${list.map(x => `<button class="place ${x.id === openId ? "on" : ""}" data-open="${x.id}"><span>${esc(x.name)}</span><small>${x.tokens.length}</small></button>`).join("") || `<p class="empty">Ninguna todavía.</p>`}</div>` : ""; }).join("")}
      <form id="newsc" class="panel" style="margin-top:12px;display:flex;flex-direction:column;gap:8px;padding:12px">
        <h2 class="sec" style="margin:0">Nueva escena</h2>
        <label class="field">Nombre<input id="nsname" required placeholder="Asalto al almacén"></label>
        <label class="field">Lugar<select id="nsplace"><option value="">Biblioteca (sin lugar)</option>${s.world.places.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join("")}</select></label>
        <label class="field">Suelo inicial<select id="nsfill"><option value="gen:dungeon">🎲 Mazmorra generada</option><option value="gen:cave">🕳 Cueva generada</option>${Object.entries(REGIONS).map(([k, v]) => `<option value="reg:${k}">${v.i} ${esc(v.n)} (generado)</option>`).join("")}<option value="vacio">Vacío (para dibujar salas)</option>${Object.entries(TERRAIN).filter(([, v]) => !v.wall).map(([k, v]) => `<option value="${k}">${v.n}</option>`).join("")}</select></label>
        <button class="btn gold small">Crear</button>
      </form>
    </aside>
    <section class="scenes-main">${openId ? `<div class="board-host"></div>` : `<div class="page"><div class="wrap"><h1 class="title">Preparar escenas</h1>
      <p class="lead">Prepara los combates y situaciones tácticas de cada lugar, o deja escenas genéricas en la biblioteca (una pelea de taberna, una emboscada en el camino…) para cargarlas al momento si la partida se tuerce.</p>
      <p class="note">Elige una escena a la izquierda para editarla. Durante la partida se cargan desde el panel del máster, en la pestaña Partida.</p>
      <div class="panel" style="margin-top:16px"><h2 class="sec">Escenas de ejemplo</h2>
        <p style="margin:0 0 10px">La torre del hechicero (3 plantas, trampas ocultas y un cofre), pelea con enanos en la taberna de la Jarra Rota, el cementerio de la colina con no muertos y una emboscada goblin en el bosque. Todas con criaturas del SRD y sus acciones reales.</p>
        <button class="btn gold small" id="renew">🔄 Renovar escenas de ejemplo</button>
        <p class="note" style="margin:8px 0 0">Quita las cuatro antiguas (taberna, camino, cripta y puente, con sus «enemigos» genéricos) si siguen sin tocar, añade las nuevas y actualiza las de ejemplo a su versión equilibrada. Tus escenas no se tocan.</p></div></div></div>`}</section>
    <aside class="scenes-props" ${openId ? "" : "hidden"}></aside>`;
  $$("[data-open]", el).forEach(b => b.onclick = () => { openId = b.dataset.open; sel = null; placing = false; board = null; draw(); });
  const rn = $("#renew", el);
  if (rn) rn.onclick = () => {
    if (!rn.dataset.sure) { rn.dataset.sure = 1; rn.textContent = "¿Seguro? Pulsa otra vez"; return; }
    const OLD = ["Pelea en la taberna", "Emboscada en el camino", "La cripta bajo el campanario", "Emboscada en el puente"], fresh = exampleScenes();
    let gone = 0, added = 0, upd = 0;
    store.commit("board", st => {
      // Solo las antiguas de ejemplo: mismo nombre y criaturas sin perfil del SRD (las genéricas de antes)
      const before = st.scenes.length;
      st.scenes = st.scenes.filter(x => !(OLD.includes(x.name) && (x.tokens || []).every(t => !t.srd)));
      gone = before - st.scenes.length;
      fresh.forEach(sc => {
        const i = st.scenes.findIndex(x => x.name === sc.name);
        if (i < 0) { st.scenes.push(sc); added++; return; }
        // Versión anterior de una escena de ejemplo (todas sus criaturas del SRD): se cambia por la equilibrada, con el mismo id
        const x = st.scenes[i];
        if ((x.ex || 1) < sc.ex && (x.tokens || []).every(t => t.srd || t.kind === "pc")) { st.scenes[i] = Object.assign(sc, { id: x.id }); upd++; }
      });
    });
    toast(`Escenas de ejemplo: ${gone} antiguas quitadas, ${added} nuevas, ${upd} actualizadas.`);
  };
  $("#newsc", el).onsubmit = e => {
    e.preventDefault();
    const fill = $("#nsfill", el).value, reg = fill.startsWith("reg:") ? fill.slice(4) : "", gen = fill.startsWith("gen:") || !!reg, place = $("#nsplace", el).value || null;
    const sc = blankScene($("#nsname", el).value.trim() || "Nueva escena", place, gen ? 26 : 16, gen ? 18 : 11, gen ? "vacio" : fill);
    // La región del lugar decide las piezas del editor (y su luz y sonido)
    const pack = reg || (place ? regionPackOf(store.get(), place) : "");
    if (pack && REGIONS[pack]) Object.assign(sc, { region: pack, ambient: REGIONS[pack].light, sound: REGIONS[pack].sound });
    if (reg) { const d = generateRegion(sc.cols, sc.rows, reg); sc.terrain = d.terrain; sc.props = d.props; sc.start = d.start; }
    else if (gen) { const d = generateDungeon(sc.cols, sc.rows, { cave: fill === "gen:cave" }); sc.terrain = d.terrain; sc.props = d.props; sc.start = d.start; sc.ambient = "interior"; }
    store.commit("board", st => st.scenes.push(sc));
    openId = sc.id; board = null; draw();
  };
  if (openId && preview3d) {
    const host = $(".board-host", el);
    import("./tablero3d.js").then(m => {
      if (!el || !host.isConnected) return;
      board = m.createBoard3D(host, {
        model: () => scene() ? { grid: scene(), tokens: scene().tokens } : null, dm: true, canMove: () => true,
        mutate: (label, fn) => store.commit("board", st => { const x = st.scenes.find(y => y.id === openId); fn({ grid: x, tokens: x.tokens }); }),
        hpOf: t => t.maxhp ? { cur: t.hp, max: t.maxhp } : null, decorate: () => ({}), charOf: () => null,
        onSelect: id => { sel = id; side(); }, setAmbient: k => store.commit("board", st => { st.scenes.find(y => y.id === openId).ambient = k; })
      });
    }).catch(e => { console.warn(e); preview3d = false; draw(); });
    side();
  } else if (openId) {
    board = createBoard($(".board-host", el), {
      model: () => ({ grid: scene(), tokens: scene().tokens }),
      dm: true, edit: true, canMove: () => true,
      mutate: (label, fn) => store.commit("board", st => { const x = st.scenes.find(y => y.id === openId); fn({ grid: x, tokens: x.tokens }); }),
      hpOf: t => t.maxhp ? { cur: t.hp, max: t.maxhp } : null,
      onSelect: id => { sel = id; if (id) selProp = null; side(); },
      onSelectProp: id => { selProp = id; if (id) sel = null; side(); },
      onStart: st => store.commit("board", z => { z.scenes.find(y => y.id === openId).start = st; }),
      onCell: h => { if (placing) { placing = false; store.commit("board", st => { st.scenes.find(y => y.id === openId).start = h; }); } },
      suggestRegion: () => scene() && scene().place ? regionPackOf(store.get(), scene().place) : "",
      marker: () => scene() && scene().start && { ...scene().start, rad: +(scene().deployRad ?? 2) }
    });
    side();
  }
}

function side() {
  const box = $(".scenes-props", el), sc = scene();
  if (!box || !sc) return;
  const s = store.get(), t = sc.tokens.find(x => x.id === sel), pr = selProp && (sc.props || []).find(x => x.id === selProp);
  const ae = document.activeElement; if (ae && box.contains(ae) && ae.closest(".propedit") && /INPUT|TEXTAREA/.test(ae.tagName)) return;
  box.innerHTML = `<div class="panel">
      <label class="field">Nombre<input id="scname" value="${esc(sc.name)}"></label>
      <label class="field" style="margin-top:8px">Lugar<select id="scplace"><option value="">Biblioteca (sin lugar)</option>${s.world.places.map(p => `<option value="${p.id}" ${sc.place === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
      <div class="tkgrid" style="margin-top:8px"><label class="field">Columnas<input type="number" min="5" max="40" id="sccols" value="${sc.cols}"></label><label class="field">Filas<input type="number" min="5" max="30" id="scrows" value="${sc.rows}"></label></div>
      <label class="field" title="Reglas de visión: con luz tenue se ve con desventaja en Percepción; a oscuras no se ve sin visión en la oscuridad. Las antorchas, velas y hogueras de la escena iluminan alrededor.">Luz de la escena<select id="sclight">${Object.entries(LEVELS).map(([k, n]) => `<option value="${k}" ${ambientLevel(sc) === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <div class="row" style="margin-top:10px"><button class="btn small" id="scstart" aria-pressed="${placing}">${placing ? "Toca una casilla del mapa…" : "⚑ Punto de inicio del grupo"}</button>
        <label class="field" title="Al cargar la escena, cada jugador se coloca por turnos dentro de esta zona">Zona de despliegue<select id="scrad">${[0, 1, 2, 3, 4, 5, 6].map(n => `<option value="${n}" ${(+(sc.deployRad ?? 2)) === n ? "selected" : ""}>${n ? `${n} casilla${n > 1 ? "s" : ""} (${n * 1.5} m)` : "solo el punto"}</option>`).join("")}</select></label></div>
      <p class="note" style="margin:4px 0 0">El grupo empieza en el ⚑ y, por turnos, cada jugador se coloca dentro de la zona según lo que ve.</p>
      <div class="scfloors" style="margin-top:10px"><small class="note">🏰 Plantas del mapa (torres, sótanos…)</small>
        ${floorsOf(sc).map((f, i) => ({ f, i })).reverse().map(({ f, i }) => `<div class="scfl${i === floorIdx(sc) ? " on" : ""}"><input data-scfln="${i}" value="${esc(f.name)}" aria-label="Nombre de la planta">${i === floorIdx(sc) ? `<small>editando</small>` : `<button class="btn small" data-scflgo="${i}">Editar</button><button class="flic" data-scfldel="${i}" title="Quitar">🗑</button>`}</div>`).join("")}
        <div class="row"><button class="btn small" data-scfladd="up">＋ Planta encima</button><button class="btn small" data-scfladd="down">＋ Sótano</button></div></div>
      <div class="row" style="margin-top:10px"><button class="btn small" id="sc3d" aria-pressed="${preview3d}">${preview3d ? "✏️ Editar en 2D" : "🎲 Ver en 3D"}</button></div>
      <div class="row" style="margin-top:10px"><button class="btn gold small" id="scload">Cargar en la mesa</button><button class="btn small" id="scdup">Duplicar</button><button class="btn small danger" id="scdel">Eliminar</button></div>
    </div>
    <div class="panel" style="margin-top:12px"><h2 class="sec">Criaturas</h2>
      ${difficultyHTML(difficulty(store.get(), sceneFoes(sc), partyOf(store.get(), [])))}
      <button class="btn gold" id="monpick">👹 Añadir criaturas…</button>
      <p class="note" style="margin:6px 0 0">Busca por nombre o tipo, ajusta su nivel y despliégalas junto al punto de inicio.</p></div>
    ${pr ? `<div class="panel" style="margin-top:12px">${propEditorHTML(pr)}</div>` : ""}
    <div class="panel" style="margin-top:12px">${t ? `<h2 class="sec">Ficha seleccionada</h2>${tokenEditor(t)}` : `<p class="empty">Usa «👹 Enemigo» para colocar enemigos y tócalos para editarlos. Con «✋ Mover» los recolocas o seleccionas objetos.</p>`}</div>`;
  if (pr && board && board.editProp) bindPropEditor(box, fn => board.editProp(pr.id, fn), { rot: () => board.editProp(pr.id, p => { p.rot = ((p.rot || 0) + 1) % 4; }), del: () => { const id = pr.id; board.selectProp(null); store.commit("board", st => { const x = st.scenes.find(y => y.id === openId); x.props = (x.props || []).filter(z => z.id !== id); }); } });
  const M = fn => store.commit("board", st => fn(st.scenes.find(y => y.id === openId)));
  $("#scname", box).onchange = e => M(x => { x.name = e.target.value; });
  $("#scplace", box).onchange = e => M(x => { x.place = e.target.value || null; });
  $("#sccols", box).onchange = e => M(x => { x.cols = Math.max(5, Math.min(40, +e.target.value)); });
  $("#sclight", box).onchange = e => M(x => { x.light = e.target.value; });
  $("#scrows", box).onchange = e => M(x => { x.rows = Math.max(5, Math.min(30, +e.target.value)); });
  $("#monpick", box).onclick = () => openCreaturePicker({ title: "Añadir criaturas a la escena", onAdd: (m, n, h) => {
    M(x => { const busy = new Set(x.tokens.map(k => k.c + "," + k.r)); let placed = 0; const st0 = x.start || { c: 1, r: 1 };
      for (let d = 2; d < 20 && placed < n; d++) for (let r = 0; r < x.rows && placed < n; r++) for (let c = x.cols - 1; c >= 0 && placed < n; c--) {
        if (Math.max(Math.abs(c - st0.c), Math.abs(r - st0.r)) !== d || busy.has(c + "," + r) || isWallT(x.terrain[c + "," + r])) continue;
        busy.add(c + "," + r); const t = monsterToken(m, c, r); if (n > 1) t.name = `${m.n} ${placed + 1}`; if (h) t.hidden = true; x.tokens.push(t); placed++;
      } });
  } });
  $$("[data-scflgo]", box).forEach(b => b.onclick = () => { M(x => { x.tokens = swapFloor(x, x.tokens, +b.dataset.scflgo); }); sel = null; selProp = null; if (board && board.fit) board.fit(); });
  $$("[data-scfladd]", box).forEach(b => b.onclick = () => M(x => { addFloor(x, b.dataset.scfladd === "down"); }));
  $$("[data-scfln]", box).forEach(i => i.onchange = () => M(x => renameFloor(x, +i.dataset.scfln, i.value.trim())));
  $$("[data-scfldel]", box).forEach(b => b.onclick = () => { if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = "¿Seguro?"; return; } M(x => removeFloor(x, +b.dataset.scfldel)); });
  $("#sc3d", box).onclick = () => { preview3d = !preview3d; board = null; draw(); };
  $("#scstart", box).onclick = () => { placing = !placing; side(); };
  { const rd = $("#scrad", box); if (rd) rd.onchange = () => store.commit("board", st => { const x = st.scenes.find(y => y.id === openId); if (x) x.deployRad = +rd.value; }); }
  $("#scload", box).onclick = () => { loadScene(openId); location.hash = "partida"; toast("Escena cargada en la mesa"); };
  $("#scdup", box).onclick = () => { const c = JSON.parse(JSON.stringify(sc)); c.id = "esc-" + Math.random().toString(36).slice(2, 8); c.name += " (copia)"; store.commit("board", st => st.scenes.push(c)); openId = c.id; board = null; draw(); };
  const del = $("#scdel", box);
  del.onclick = () => { if (!del.dataset.sure) { del.dataset.sure = 1; del.textContent = "Pulsa otra vez"; return; } store.commit("board", st => { st.scenes = st.scenes.filter(y => y.id !== openId); }); openId = null; board = null; draw(); };
  bindTokenEditor(box, (id, fn) => M(x => { const k = x.tokens.find(z => z.id === id); if (k) fn(k); }));
}
