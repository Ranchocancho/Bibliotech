// La mesa táctica dentro de la Partida: tablero, columna de iniciativa y mini-ficha (HUD) plegable.
import { openChest } from "../core/comercio.js";
import { deployOf, placer, zoneCells, zoneReach, markReady, endDeploy } from "../core/despliegue.js";
import { condImmune } from "../core/defensas.js";
import { combatEvents } from "../core/golpes.js";
// Iniciales para la tira de iniciativa: sin paréntesis y con el número de los repetidos («Goblin 2 (en la maleza)» → «G2»)
const initials = n => (String(n || "?").replace(/\s*\(.*?\)/g, "").split(/\s+/).map(w => w.replace(/[^\p{L}\p{N}]/gu, "")[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?");
import { kitHTML, bindKit, kitPart, kitArmed, kitDefs, kitRest, multiLine, legLeft, legMax } from "./accionesnpc.js";
import { loadKits, kitOf, gate as kitGate } from "../core/criaturas.js";
import { store } from "../core/store.js";
import { isDM, currentUser } from "../core/session.js";
import { createBoard, healthWord, moveCost } from "./tablero.js";
import { hpOf, charOf, order } from "../core/mesa.js";
import { changeHP as applyHP, deathSave } from "../core/salud.js";
import { $, $$, esc, pickFile, toast } from "../core/ui.js";
import { putImage, readImageFile } from "../core/images.js";
import { SILUETAS } from "../data/siluetas.js";
import { ESTADOS, estado, etiqueta } from "../data/estados.js";
import { floatAt } from "./flotantes.js";
import { PROPS } from "../data/mapas.js";
import { reachMap, pathTo, moveHint } from "../core/movimiento.js";
import { propEditorHTML, bindPropEditor } from "./propeditor.js";
import { triggerTrap, announceLoot } from "../core/hechizos.js";
import { hazardAt, onEnter, douse } from "../core/peligros.js";
import { EFECTOS } from "../data/efectos.js";
import { computeVision, explored, visionOn, tokenSeen, unseenFn, LIGHT_ITEMS } from "../core/vision.js";
import { renderRolls, visibleRolls } from "./tiradas.js";
import { attacksOf, attack, acOf, nameOf, damageFor, answerOA, decide } from "../core/combate.js";
import { canActNow, phase, current, pending, beginCombat, rollInit, startRounds, endTurn, stopCombat, eco, moveBudget, speedOf, spend, toggle, ACCIONES, rangeOf, inRange, cover, modifiers, dist, metres, gap } from "../core/turnos.js";
import { srd, findSpell } from "../core/srd.js";
import { spellMech } from "../core/hechizos.js";
import { classInfo, prof, mod } from "../data/dnd.js";
import { spellDC } from "../core/salud.js";
import { nowState } from "./ahora.js";
import { armedNow, arm, togglePick, picked, clearPicks, onAim } from "../core/apuntar.js";
import { weaponTargeting, attackPreview, hitChance, dmgRange, templateCells, tokensIn, templateOk } from "../core/objetivo.js";
import { npcArmedArea } from "./accionesnpc.js";
import { colors, setColor, resetColors, onColors, COLOR_KEYS, DEFAULT_COLORS } from "../core/colores.js";
import { floorIdx } from "../core/plantas.js";
import { publish, mySkin, SKIN_HEX } from "../core/dados.js";

// Nombres de las miniaturas 3D (los modelos están en assets/kaykit/minis)
export const MINI_NAMES = { peana: "Peana de cartón", Skeleton_Minion: "Esqueleto", Skeleton_Warrior: "Esqueleto guerrero", Skeleton_Rogue: "Esqueleto pícaro", Skeleton_Mage: "Esqueleto mago", Knight: "Caballero", Barbarian: "Bárbaro", Mage: "Mago", Rogue: "Pícaro", Rogue_Hooded: "Encapuchado" };

let want3d = true;
let floorOpen = false, floorRen = null;
let editOpen = false, condPick = null, lastArea = null, accOpen = false, sideTab = "ini", atkAdv = null, dmTarget = null, atkIdx = 0, ruleOpen = null, lastTurnSeen = null;
let GLOS = null; srd("glosario").then(g => (GLOS = g));
let hudOpen = !(window.matchMedia && window.matchMedia("(max-width: 900px)").matches);

export function mountTactical(host, opts = {}) {
  host.innerHTML = `<div class="tactical"><div class="boardwrap"></div><aside class="sidecol"><div class="sidetabs" role="tablist"><button role="tab" data-side="ini">Iniciativa</button><button role="tab" data-side="tir">🎲 Tiradas</button></div><div class="initcol" aria-label="Iniciativa"></div><div class="rollcol" hidden></div></aside><div class="hud"></div>
    <div class="topbar"><div class="tb-now" aria-live="polite"></div><div class="turnbar"></div><div class="tb-right"><div class="tb-ctl"></div><button class="btn small" id="v3d" title="Cambiar entre la mesa en 3D y el plano en 2D"></button><button class="btn small" id="vcol" title="Colores del movimiento, el alcance, los objetivos y las áreas">🎨</button></div></div><div class="editbadge" hidden>✏️ El máster está retocando la mesa…</div><div class="turnbanner" hidden></div><div class="taskcall" hidden></div></div>`;
  // Para los jugadores, la iniciativa va en su columna fija de la derecha (opts.sideHost) y el tablero ocupa todo el ancho
  if (opts.sideHost) { $(".sidecol", host).remove(); $(".tactical", host).classList.add("noside"); opts.sideHost.innerHTML = `<div class="initcol" aria-label="Iniciativa"></div>`; }
  const sideRoot = opts.sideHost || host;
  const bw = $(".boardwrap", host), ini = $(".initcol", sideRoot), hud = $(".hud", host), rc = $(".rollcol", host), tb = $(".turnbar", host), banner = $(".turnbanner", host);
  const wantRolls = () => { if (opts.onWantRolls) return opts.onWantRolls(); sideTab = "tir"; sideShow(); };
  const sideShow = () => { if (!rc) return; $$("[data-side]", host).forEach(b => b.setAttribute("aria-selected", b.dataset.side === sideTab)); ini.hidden = sideTab !== "ini"; rc.hidden = sideTab !== "tir"; if (sideTab === "tir") renderRolls(rc); };
  $$("[data-side]", host).forEach(b => b.onclick = () => { sideTab = b.dataset.side; sideShow(); });
  let rollsSeen = (store.get().rolls || []).length;
  const actHost = opts.actHost || null; let actSig = "", npcId = null, npcPick = null;
  // Seleccionar una figura (desde la mesa, la iniciativa o la tira): se abre su consulta abajo
  // El jugador ha elegido arma o conjuro en su ficha: tocar una figura la usa como objetivo
  function aimAt(id) {
    const A = armedNow(), st = S(), dm = isDM(st); if (!A) return false;
    if (A.kind === "atk") {
      if (id === A.tok) return false;
      const a = st.tokens.find(t => t.id === A.tok), w = a && attacksOf(st, a)[A.i]; if (!w) { arm(null); return false; }
      if (dm && a.kind === "pc") return false;
      const tt = st.tokens.find(t => t.id === id), pv = tt && attackPreview(st, a, w, tt);
      // Como en BG3: si no llegas pero puedes acercarte andando, la figura se acerca (pagando su movimiento) y ataca
      if (pv && pv.approach) { bopts.mutate("token", m => { const k = m.tokens.find(x => x.id === a.id); if (k) { k.c = pv.approach.c; k.r = pv.approach.r; } }); toast(`Te acercas ${metres(pv.approach.cost / 1.5)} y atacas.`); }
      sel = id; const r = attack(A.tok, id, w, dm ? atkAdv : null, A.use || "act"); if (r) { const left = eco(S(), a).atkLeft; if (A.use === "bonus" || !(left > 0)) arm(null); atkAdv = null; } actSig = ""; drawHud(); return true;
    }
    if (A.kind === "npcact") { if (id !== A.tok || A.sp) togglePick(id); sel = id; actSig = ""; drawHud(); return true; } // el máster elige objetivos de la acción de su criatura
    if (dm) return false;
    if (A.kind === "spell") {
      const T = targeting();
      if (T && T.kind === "tmpl") return true; // con plantilla de área se toca el suelo, no una figura
      const tg = T && T.targets && T.targets.find(x => x.id === id);
      if (tg && tg.state === "out") { toast(`Fuera del alcance de ${A.name}${tg.far ? ` (está a ${String(tg.far).replace(".", ",")} m)` : ""}.`); return true; }
      togglePick(id); sel = id; drawHud();
      if (A.go && T && T.single && picked.has(id)) A.go(); // un ataque de conjuro a un solo objetivo: se lanza al tocarlo
      return true;
    }
    return false;
  }
  function selectTok(id) { if (aimAt(id)) return; if (board && board.select) board.select(id); if (sel !== id) { sel = id; } hudOpen = true; if (isDM(S()) && (S().tokens.find(t => t.id === id) || {}).kind !== "pc") npcId = id; drawHud(); if (opts.onSelect) opts.onSelect(id); }
  let sel = null, selPropId = null, sceneId = store.get().board && (store.get().board.scene + "#" + floorIdx(store.get().board)), board = null;
  const S = () => store.get();
  const me = () => (currentUser(S()) || {}).id;
  const bopts = {
    controlsHost: $(".tb-ctl", host),
    model: () => ({ grid: S().board, tokens: S().tokens }),
    dm: isDM(S()), edit: !!opts.edit && isDM(S()),
    // En combate, cada uno mueve su figura solo en su turno; el máster, siempre
    marker: () => { const d = deployOf(S()); return d ? { c: d.c, r: d.r, rad: d.rad } : null; },
    // En el despliegue, cada jugador mueve su figura solo cuando le toca colocarse
    canMove: t => { const s = S(); if (isDM(s)) return true; if (!t.owner || t.owner !== me()) return false; if (deployOf(s)) { const p = placer(s); return !!p && p.id === t.id; } return phase(s) !== "live" || s.board.turn === t.id; },
    mutate: (label, fn) => {
      let warn = null; const oas = [], traps = [], hzs = [];
      store.commit(label === "token" ? "token" : "board", s => {
        const before = new Map(s.tokens.map(t => [t.id, { c: t.c, r: t.r }]));
        fn({ grid: s.board, tokens: s.tokens });
        // Despliegue: solo dentro de la zona de inicio y en casillas libres (el máster puede poner a cualquiera donde quiera)
        if (deployOf(s) && !isDM(s) && !opts.edit) { const Z = zoneCells(s); for (const t of s.tokens) { const o = before.get(t.id); if (!o || (o.c === t.c && o.r === t.r)) continue;
          if (!Z.has(t.c + "," + t.r) || s.tokens.some(x => x.id !== t.id && x.c === t.c && x.r === t.r)) { t.c = o.c; t.r = o.r; warn = "Colócate dentro de la zona de inicio, en una casilla libre."; } } }
        // Ataques de oportunidad (reglas): solo los provoca la criatura que SE MUEVE POR SÍ MISMA EN SU TURNO y sale
        // del alcance de un enemigo que aún tiene su reacción (y no se ha destrabado). Recolocar figuras, editar la mesa
        // o mover a alguien fuera de su turno (movimiento forzado) no provoca nada.
        if (phase(s) === "live" && !opts.edit) for (const t of s.tokens) {
          if (s.board.turn !== t.id) continue;
          const o = before.get(t.id); if (!o || (o.c === t.c && o.r === t.r) || (t.conds || []).some(c => c.id === "destrabado")) continue;
          for (const h of s.tokens) {
            if (h.id === t.id || h.hidden || (h.kind === "pc") === (t.kind === "pc")) continue;
            const hp = hpOf(s, h); if (hp && hp.cur <= 0) continue;
            if ((h.conds || []).some(c => ["incapacitado", "inconsciente", "aturdido", "paralizado", "petrificado", "muerto"].includes(c.id)) || eco(s, h).react) continue;
            if (dist(o, h) <= 1 && dist(t, h) > 1 && attacksOf(s, h).some(w => !w.rng.ranged || w.rng.melee)) oas.push({ by: h.id, target: t.id });
          }
        }
        // Trampas: quien pisa una trampa armada la dispara (se revela y se tiran las salvaciones)
        for (const t of s.tokens) { const o = before.get(t.id); if (!o || (o.c === t.c && o.r === t.r)) continue;
          const p = (s.board.props || []).find(x => x.c === t.c && x.r === t.r && (PROPS[x.k] || {}).trap && !x.sprung && !x.disarmed); if (p) traps.push({ p: p.id, t: t.id }); }
        // Movimiento en combate: se mide desde la casilla de inicio del turno; más allá de tu velocidad, Correr gasta la acción
        if (phase(s) === "live") for (const t of s.tokens) {
          const o = before.get(t.id); if (!o || (o.c === t.c && o.r === t.r) || s.board.turn !== t.id) continue;
          const e = eco(s, t); const from = e.from || o, dm = isDM(s);
          const R = reachMap(s, { ...t, c: from.c, r: from.r, eco: { ...e, from } }, { dm }), x = R && R.cells.get(t.c + "," + t.r);
          if (!x || x.occ) {
            if (!dm) { t.c = o.c; t.r = o.r; warn = x && x.occ ? "Esa casilla está ocupada." : R && R.stopped ? `No puede moverse: ${R.stopped}.` : "No llega tan lejos este turno."; continue; }
            warn = `${nameOf(s, t)} va más allá de su movimiento (el máster lo permite).`;
          }
          e.from = from; e.mov = x ? x.cost : e.mov;
          if (x && x.dash && !e.dash) { e.dash = true; e.act = true; e.dashAuto = true; warn = `${nameOf(s, t)} corre: gasta su acción.`; }
          else if (x && !x.dash && e.dashAuto) { e.dash = false; e.act = false; e.dashAuto = false; }
          t.eco = e;
        }
        // Peligros del terreno (caídas, hielo, fuego, lava): al entrar; en combate, solo la primera vez en el turno
        if (!opts.edit) for (const t of s.tokens) { const o = before.get(t.id); if (!o || (o.c === t.c && o.r === t.r)) continue;
          const hz = hazardAt(s, t.c, t.r); if (!hz) continue;
          const was = hazardAt(s, o.c, o.r);
          if (phase(s) === "live") { t.eco = t.eco || {}; const m = t.eco.hz && t.eco.hz.q === s.board.seq ? t.eco.hz : { q: s.board.seq, k: [] }; if (m.k.includes(hz.key)) continue; t.eco.hz = { q: m.q, k: [...m.k, hz.key] }; }
          else if (was && was.key === hz.key) continue;
          hzs.push({ t: t.id, hz }); }
      });
      if (warn) toast(warn);
      oas.forEach(o => offerOA(o.by, o.target));
      traps.forEach(tr => triggerTrap(tr.p, [tr.t]));
      if (hzs.length) onEnter(hzs);
    },
    onProp: p => { selPropId = p.id; hudOpen = true; drawHud(); },
    // Hasta dónde puede llegar la ficha que tiene el turno (la suya o, para el máster, cualquiera)
    reach: id => { const s = S(); if (deployOf(s)) { const t = s.tokens.find(k => k.id === id); if (!t || t.kind !== "pc" || (!isDM(s) && t.owner !== me())) return null; const p = placer(s); if (!isDM(s) && (!p || p.id !== id)) return null; return zoneReach(s, t); }
      if (phase(s) !== "live" || !s.board || s.board.turn !== id) return null; const t = s.tokens.find(k => k.id === id); if (!t || (!isDM(s) && t.owner !== me())) return null; return reachMap(s, t, { dm: isDM(s) }); },
    onSelectProp: id => { selPropId = id; if (id) hudOpen = true; drawHud(); },
    decorate: t => { const c = charOf(S(), t); return { ...(c ? { name: c.name, color: c.color, portrait: c.portrait } : t.portrait ? { portrait: t.portrait } : {}), isTurn: S().board.turn === t.id }; },
    hpOf: t => hpOf(S(), t),
    onSelect: id => { if (id && aimAt(id)) return; sel = id; if (id && isDM(S()) && (S().tokens.find(t => t.id === id) || {}).kind !== "pc") npcId = id; drawHud(); if (opts.onSelect) opts.onSelect(id); },
    charOf: t => charOf(S(), t),
    chars: () => S().characters,
    setFog: v => store.commit("board", st => { st.board.fog = v; }),
    setSound: v => store.commit("board", st => { st.board.sound = v; }),
    rolls: () => visibleRolls(S()),
    aim: () => aimInfo(),
    targeting: () => targeting(),
    onTemplate: cell => placeTemplate(cell),
    rollColor: r => { const t = S().tokens.find(x => x.id === r.tok), c = t && charOf(S(), t); const u = S().users.find(x => x.id === r.who); return (c && c.color) || (u && u.role !== "player" ? "#6a3fb0" : (u && u.color) || "#8a2be2"); },
    fogState: () => { const s = S(); if (isDM(s) || !visionOn(s.board)) return null; const vis = computeVision(s.board, s.tokens, s.characters); return { vis, exp: explored((s.board.scene || "mesa") + "#" + floorIdx(s.board), vis) }; },
    setAmbient: k => store.commit("board", st => { st.board.ambient = k; })
  };
  const use3d = () => want3d && !opts.edit;
  function mountBoard() {
    if (board && board.dispose) board.dispose();
    bw.innerHTML = ""; bw.className = "boardwrap"; board = null;
    const tg = $("#v3d", host); $(".tb-right", host).appendChild(tg); // vuelve a su sitio antes de vaciar los controles
    $(".tb-ctl", host).innerHTML = ""; tg.textContent = use3d() ? "🗺 Plano 2D" : "🎲 Mesa 3D"; tg.hidden = !!opts.edit;
    if (use3d()) import("./tablero3d.js").then(m => { if (!m.webglOK) throw new Error("sin WebGL"); board = m.createBoard3D(bw, bopts); const col = $(".tb-ctl .camst", host); if (col) col.appendChild($("#v3d", host)); if (sel) board.select(sel); drawHud(); })
      .catch(e => { console.warn("Vista 3D no disponible", e); want3d = false; mountBoard(); });
    else board = createBoard(bw, bopts);
  }
  $("#v3d", host).onclick = () => { want3d = !want3d; mountBoard(); };
  combatEvents(); // toma nota de lo que ya había: solo se ve lo que pase a partir de ahora
  mountBoard();

  // Quién actúa: el jugador, su personaje; el máster, la criatura del turno (o el enemigo que tenga seleccionado)
  function actorTok() {
    const s = S(), dm = isDM(s), cur = current(s);
    if (!dm) return s.tokens.find(t => t.kind === "pc" && t.owner === me());
    if (cur && cur.kind !== "pc") return cur;
    const st = s.tokens.find(t => t.id === sel); return st && st.kind !== "pc" ? st : cur;
  }
  /** Lo que la mesa dibuja al apuntar (BG3): alcance, objetivos con su probabilidad, o una plantilla de área. */
  function targeting() {
    const s = S(), A = armedNow(); if (!A || !s.board || !s.tokens) return null;
    const dm = isDM(s), hid = unseenFn(s, dm), vis = t => dm || !hid(t), odds = dm || s.showOdds !== false;
    if (A.kind === "atk") {
      const a = s.tokens.find(t => t.id === A.tok); if (!a || (!dm && a.owner !== me())) return null;
      const T = weaponTargeting(s, a, A.i, vis); if (T) T.odds = odds; return T;
    }
    if (A.kind === "spell") {
      const a = actorTok(), d = findSpell(A.name), m = d && spellMech(d); if (!a || !m || m.self) return null;
      const rng = m.touch ? { n: 1.5, l: 1.5 } : m.rng || { n: 1.5, l: 1.5 };
      if (m.area) return { kind: "tmpl", from: a.id, area: m.area, rng, label: d.n };
      const sw = attacksOf(s, a).find(x => x.spell && x.name === "✨ " + d.n), sdmg = sw ? dmgRange(sw.expr) : m.dmg ? dmgRange(m.dmg) : null; // trucos: el daño que toca a tu nivel
      const c = charOf(s, a), ab = c && classInfo(c.cls).cast, bonus = c && ab ? prof(c.level) + mod(c.abilities[ab]) : 0, dc = c ? spellDC(c) : null;
      const targets = s.tokens.filter(t => vis(t)).map(t => { const st = inRange(rng, a, t), cv = st === "out" ? null : cover(s, a, t);
        if (st === "out") return { id: t.id, state: "out", far: Math.round(gap(a, t) * 15) / 10, ally: (t.kind === "pc") === (a.kind === "pc") };
        if (cv.level === "total") return { id: t.id, state: "cover", ally: (t.kind === "pc") === (a.kind === "pc") };
        const mods = modifiers(s, a, t, rng), pct = m.atk ? Math.round(hitChance(bonus, acOf(s, t) + (cv.bonus || 0), mods.net) * 100) : null;
        return { id: t.id, state: st, ally: (t.kind === "pc") === (a.kind === "pc"), pct, picked: picked.has(t.id), save: m.save ? `CD ${dc} ${({ fue: "Fue", des: "Des", con: "Con", int: "Int", sab: "Sab", car: "Car" })[m.save]}` : "", dmg: sdmg, why: m.atk ? [...mods.adv.map(x => "▲ " + x), ...mods.dis.map(x => "▼ " + x)] : [], cov: cv.txt || "" }; });
      return { kind: "spell", from: a.id, label: d.n, rng: { n: rng.n / 1.5, l: (rng.l || rng.n) / 1.5, melee: rng.n <= 1.5 }, targets, odds, single: !!m.atk };
    }
    if (A.kind === "npcact") {
      const ar = npcArmedArea(s, A); if (ar) return { kind: "tmpl", from: ar.tok, area: ar.area, rng: ar.rng, label: ar.label };
      const a = s.tokens.find(t => t.id === A.tok); if (!a) return null;
      return { kind: "pick", from: a.id, targets: s.tokens.filter(t => t.id !== a.id).map(t => ({ id: t.id, state: "ok", picked: picked.has(t.id) })) };
    }
    return null;
  }
  /** Se ha colocado una plantilla de área: se marcan las criaturas dentro y, si el conjuro está listo, se lanza. */
  function placeTemplate(cell) {
    const s = S(), T = targeting(), A = armedNow(); if (!T || T.kind !== "tmpl" || !A) return;
    const a = s.tokens.find(t => t.id === T.from); if (!a) return;
    if (!templateOk(s, a, cell, T.area, T.rng)) return toast(`Demasiado lejos: el punto de origen tiene que estar a ${String(T.rng.n).replace(".", ",")} m o menos.`);
    const ids = tokensIn(s, templateCells(s.board, a, cell, T.area), /cono|línea|emanación/.test(T.area.shape) ? a.id : null);
    clearPicks(); ids.forEach(id => picked.add(id));
    if (!ids.length) { toast("No hay ninguna criatura dentro del área."); drawHud(); return; }
    const names = ids.map(id => nameOf(s, s.tokens.find(t => t.id === id))).join(", ");
    if (A.go) A.go(); else { toast(`Dentro del área: ${names}. Pulsa «Usar» para resolverlo.`); actSig = ""; drawHud(); }
    if (board) board.render();
  }
  function aimInfo() {
    const s = S(), a = actorTok(), t = s.tokens.find(x => x.id === (isDM(s) && a && a.kind !== "pc" ? dmTarget || sel : sel));
    if (!a || !t || a.id === t.id) return null;
    // Al jugador solo se le mide el ataque en su turno; a un aliado, solo la distancia
    if (!isDM(s) && phase(s) === "live" && s.board.turn !== a.id) return null;
    if ((t.kind === "pc") === (a.kind === "pc")) return { from: a.id, to: t.id, color: "#9fb3c8", label: metres(dist(a, t)) };
    const list = attacksOf(s, a), w = list[Math.min(atkIdx, list.length - 1)];
    const rng = w ? w.rng : { n: 1.5, l: 1.5 }, st = inRange(rng, a, t), cv = cover(s, a, t);
    const col = cv.level === "total" || st === "out" ? "#c4513f" : st === "long" || cv.level ? "#d6aa4e" : "#7ec850";
    const txt = `${metres(dist(a, t))}${w ? ` · ${w.name.replace("✨ ", "")}: ${st === "ok" ? "al alcance" : st === "long" ? "alcance largo" : "fuera de alcance"}` : ""}${cv.level ? ` · ${cv.level === "total" ? "cobertura total" : "cobertura " + cv.level}` : ""}`;
    return { from: a.id, to: t.id, color: col, label: txt };
  }

  // Destellos de herida/curación en la fila de iniciativa y en la tira superior
  const hpSeen = new Map(), flashes = new Map(); let lastIni = "", lastStrip = "";
  function flashOf(id, h) {
    const now = Date.now(), cur = h ? h.cur : null, prev = hpSeen.get(id);
    if (prev != null && cur != null && cur !== prev) flashes.set(id, { k: cur < prev ? "dmg" : "heal", until: now + 1300 });
    hpSeen.set(id, cur);
    const f = flashes.get(id); if (!f) return "";
    if (f.until < now) { flashes.delete(id); return ""; }
    if (!f.timer) f.timer = setTimeout(() => { flashes.delete(id); lastIni = lastStrip = ""; drawInit(); }, f.until - now + 30);
    return " fx-" + f.k;
  }
  function drawInit() {
    { const eb = $(".editbadge", host); if (eb) eb.hidden = !(S().board && S().board.editing) || isDM(S()); }
    const s = S(), dm = isDM(s), b = s.board, ph = phase(s), cur = current(s);
    const hid = unseenFn(s, dm), vis = t => dm || !hid(t), pv = dm ? unseenFn(s, false) : hid;
    const o = order(s).filter(vis), rest = s.tokens.filter(t => vis(t) && !o.includes(t));
    const name = t => esc((charOf(s, t) || t).name);
    const row = t => {
      const h = hpOf(s, t), mine = t.owner && t.owner === me(), turn = b.turn === t.id, exact = dm || t.kind === "pc";
      const pct = h ? Math.max(0, Math.min(1, h.cur / Math.max(1, h.max))) : null;
      const shown = pct == null ? null : exact ? pct : pct > 0.75 ? 1 : pct > 0.5 ? 0.7 : pct > 0.25 ? 0.45 : pct > 0 ? 0.18 : 0;
      const showInit = dm || t.kind === "pc" || ph === "live", fx = flashOf(t.id, h);
      const conds = (t.conds || []).map(cd => { const e = estado(cd.id); return e ? `<i class="cdot" style="background:${e.c}" title="${esc(etiqueta(cd.id, cd.lvl))}">${esc(etiqueta(cd.id, cd.lvl).slice(0, 1))}</i>` : ""; }).join("");
      return `<div class="inirow ${turn ? "turn" : ""} ${h && h.cur <= 0 ? "down" : ""} ${t.kind}${fx} ${mine ? "mine" : ""}" data-sel="${t.id}">
        ${mine && t.init == null && ph ? `<button class="ininum inibtn" data-iroll="${t.id}" title="Tirar iniciativa">🎲</button>` : dm ? `<input type="number" class="ininum" data-init="${t.id}" value="${t.init ?? ""}" placeholder="–" aria-label="Iniciativa de ${name(t)}">` : `<b class="ininum">${showInit ? t.init ?? "–" : "?"}</b>`}
        <span class="ininame">${name(t)}${t.hidden ? ` <small title="Oculto: los jugadores no lo ven aunque esté a la vista">🙈 oculto</small>` : dm && t.kind !== "pc" && pv(t) ? ` <small title="Los personajes no lo ven: está fuera de su vista (muros, puertas o falta de luz)">👁‍🗨 no lo ven</small>` : ""}</span><span class="iniconds">${conds}</span>
        ${h ? `<span class="inihp"><span class="ihb ${shown <= 0.25 ? "low" : shown <= 0.5 ? "mid" : ""}"><i style="width:${Math.round(shown * 100)}%"></i></span><small>${exact ? `${h.cur}/${h.max}` : healthWord(h.cur, h.max)}</small></span>` : `<span class="inihp"></span>`}</div>`;
    };
    const missing = pending(s);
    const step = !ph ? `<div class="phase"><b>Fuera de combate</b><span>Movimiento libre. Cuando empiece la pelea, el máster inicia el combate.</span></div>`
      : ph === "init" ? `<div class="phase init"><b>⚔️ ¡Combate! Tirad iniciativa</b><span>${missing.length ? `Faltan: ${missing.map(t => esc(nameOf(s, t))).join(", ")}` : "Todos han tirado. El máster empieza la ronda 1."}</span></div>`
      : `<div class="phase live"><b>Ronda ${b.round}</b><span>Turno de <strong>${esc(cur ? nameOf(s, cur) : "")}</strong></span></div>`;
    const iniHTML = `${step}
      <div class="inilist">${o.map(row).join("")}${rest.length ? `<div class="inisep">${ph ? "Sin iniciativa" : "En la mesa"}</div>${rest.map(row).join("")}` : ""}</div>
      <div class="inibtns">
        ${dm && !ph ? `<button class="btn gold" id="cbegin">⚔️ Iniciar combate</button>` : ""}
        ${dm && ph === "init" ? `<button class="btn gold" id="cstart">${missing.length ? "Empezar igualmente" : "▶ Empezar ronda 1"}</button>` : ""}
        ${ph === "live" && cur && (dm || cur.owner === me()) ? `<button class="btn gold" id="cnext">Terminar turno ▶</button>` : ""}
        ${dm && ph ? `<button class="btn small" id="cstop">Terminar combate</button>` : ""}
      </div>`;
    if (iniHTML === lastIni && ini.childElementCount) { drawTurnBar(); return; }
    lastIni = iniHTML; ini.innerHTML = iniHTML;
    $$("[data-init]", ini).forEach(i => i.onchange = () => store.commit("token", st => { const t = st.tokens.find(x => x.id === i.dataset.init); if (t) t.init = i.value === "" ? null : +i.value; }));
    $$("[data-iroll]", ini).forEach(b => b.onclick = e => { e.stopPropagation(); rollInit(b.dataset.iroll); });
    $$("[data-sel]", ini).forEach(r => r.onclick = e => { if (e.target.tagName !== "INPUT" && e.target.tagName !== "BUTTON") selectTok(r.dataset.sel); });
    const on = (id, fn) => { const x = $("#" + id, ini); if (x) x.onclick = fn; };
    on("cbegin", () => { beginCombat(); toast("¡Combate! Todos tiran iniciativa"); });
    on("cstart", startRounds); on("cnext", endTurn);
    on("cstop", () => { const x = $("#cstop", ini); if (!x.dataset.sure) { x.dataset.sure = 1; x.textContent = "¿Seguro? Pulsa otra vez"; return; } stopCombat(); });
    drawTurnBar();
  }

  // Cola de turnos sobre la mesa y aviso de cambio de turno
  // Panel «Ahora» (izquierda de la barra superior): qué pasa y quién tiene que hacer qué
  let nowSig = "", lastTaskKey;
  function drawNow() {
    const s = S(), dm = isDM(s), N = nowState(s, me(), dm), box = $(".tb-now", host);
    const html = `<div class="nowhead">${esc(N.head)}${N.next ? `<small> · después: ${esc(N.next)}${N.nextMine ? " (tú)" : ""}</small>` : ""}</div>
      <div class="nowtask">${N.who ? `<b class="nowwho">${esc(N.who)}</b>` : ""}<span>${esc(N.text)}</span></div>
      ${N.eco || N.acts.length ? `<div class="nowrow">${N.eco ? `<span class="noweco"><i class="${N.eco.act ? "used" : ""}" title="Acción">A</i><i class="${N.eco.bonus ? "used" : ""}" title="Acción adicional">+</i><em title="Movimiento">👣 ${esc(N.eco.mov)}</em></span>` : ""}${N.acts.map((a, i) => `<button class="btn small${a.gold ? " gold" : ""}" data-now="${i}">${esc(a.label)}</button>`).join("")}</div>` : ""}`;
    box.className = `tb-now ${N.tone || ""}${N.mine ? " me" : ""}`;
    if (html !== nowSig) {
      nowSig = html; box.innerHTML = html;
      // Al jugador que le toca colocarse se le selecciona su figura: así ve la zona iluminada
      { const p = deployOf(s) && placer(s); if (p && (dm || p.owner === me()) && sel !== p.id && board && board.select) { sel = p.id; board.select(p.id); } }
      $$("[data-now]", box).forEach(b => b.onclick = () => { const a = N.acts[+b.dataset.now]; if (!a) return;
        if (a.k === "begin") { beginCombat(); toast("¡Combate! Todos tiran iniciativa"); }
        else if (a.k === "init") rollInit(a.id);
        else if (a.k === "start") startRounds();
        else if (a.k === "end") endTurn();
        else if (a.k === "dmg") damageFor(a.id);
        else if (a.k === "death") deathSave(a.id);
        else if (a.k === "ok" || a.k === "flip" || a.k === "half") decide(a.id, a.k);
        else if (a.k === "oa") answerOA(a.id, true);
        else if (a.k === "oapass") answerOA(a.id, false);
        else if (a.k === "npc") selectTok(a.id);
        else if (a.k === "rolls") wantRolls();
        else if (a.k === "depok") markReady(a.id);
        else if (a.k === "depundo") markReady(a.id, false);
        else if (a.k === "depend") endDeploy(); });
    }
    // Aviso momentáneo cuando algo pasa a depender de ti (tirar daño, decidir una reacción, confirmar…)
    const key = N.mine ? N.text : null;
    if (key && key !== lastTaskKey && lastTaskKey !== undefined && !/^Te queda|^Lo has gastado/.test(key)) {
      const t = $(".taskcall", host); t.textContent = `👉 ${N.text}`; t.hidden = false; t.classList.remove("go"); void t.offsetWidth; t.classList.add("go");
      clearTimeout(t._h); t._h = setTimeout(() => (t.hidden = true), 2600);
    }
    lastTaskKey = key;
  }
  // La tira se encoge para que quepan todos, sin barra de desplazamiento
  function fitStrip() {
    const n = tb.querySelectorAll(".tbchip").length; if (!n) return;
    const w = tb.clientWidth - 24, nowW = tb.querySelector(".tbchip.now") ? 120 : 0;
    const av = Math.max(16, Math.min(32, Math.floor((w - nowW) / Math.max(1, n) - 10)));
    tb.style.setProperty("--av", av + "px"); tb.classList.toggle("tight", av < 24);
  }
  if (window.ResizeObserver) new ResizeObserver(() => fitStrip()).observe(tb);
  function drawTurnBar() {
    const s = S(), ph = phase(s), cur = current(s), dm = isDM(s);
    drawNow();
    if (!ph) { if (lastStrip !== "-") { lastStrip = "-"; tb.innerHTML = `<span class="tbidle">Sin combate · el orden de turno aparecerá aquí</span>`; } return; }
    // Tira de iniciativa pegada al borde superior: orden, retrato, vida y estados de cada uno
    const hidU = unseenFn(s, dm), all = order(s).filter(t => (dm || !hidU(t)) && !(hpOf(s, t) && hpOf(s, t).cur <= 0 && t.kind !== "pc"));
    const i = cur ? Math.max(0, all.findIndex(t => t.id === cur.id)) : 0, seq = ph === "live" ? [...all.slice(i), ...all.slice(0, i)] : all;
    const chip = (t, k) => {
      const c = charOf(s, t), h = hpOf(s, t), exact = dm || t.kind === "pc", nm = nameOf(s, t);
      const pct = h ? Math.max(0, Math.min(1, h.cur / Math.max(1, h.max))) : null;
      const shown = pct == null ? null : exact ? pct : pct > 0.75 ? 1 : pct > 0.5 ? 0.7 : pct > 0.25 ? 0.45 : pct > 0 ? 0.18 : 0;
      const fx = (flashes.get(t.id) && flashes.get(t.id).until > Date.now()) ? " fx-" + flashes.get(t.id).k : "";
      const now = ph === "live" && k === 0;
      return `<span class="tbchip ${t.kind}${now ? " now" : ""}${h && h.cur <= 0 ? " down" : ""}${t.owner && t.owner === me() ? " mine" : ""}${fx}" data-tsel="${t.id}" title="${esc(nm)}${h ? ` · ${exact ? `${h.cur}/${h.max} PG` : healthWord(h.cur, h.max)}` : ""}">
        <i class="tbav" style="background:${(c || t).color || "#777"}">${esc(initials(nm))}${t.init != null && ph === "live" ? `<sup>${t.init}</sup>` : ""}</i>
        ${now ? `<em>${esc((w => w.length > 1 && /^(hermano|hermana|sir|lady|lord|fray|sor|don|doña)$/i.test(w[0]) ? w[1] : w[0])(String(nm).replace(/\s*\(.*?\)/g, "").trim().split(/\s+/)))}</em>` : ""}
        ${h ? `<span class="ihb ${shown <= 0.25 ? "low" : shown <= 0.5 ? "mid" : ""}"><i style="width:${Math.round(shown * 100)}%"></i></span>` : ""}
        <span class="tbconds">${(t.conds || []).slice(0, 4).map(cd => { const e = estado(cd.id); return e ? `<i style="background:${e.c}"></i>` : ""; }).join("")}</span></span>`;
    };
    const stripHTML = seq.map(chip).join("") || `<span class="tbidle">Esperando iniciativas…</span>`;
    if (stripHTML !== lastStrip) {
      lastStrip = stripHTML; tb.innerHTML = stripHTML;
      $$("[data-tsel]", tb).forEach(x => x.onclick = () => selectTok(x.dataset.tsel));
      fitStrip();
    }
    if (ph !== "live" || !cur) return;
    if (s.board.seq !== lastTurnSeen) {
      const first = lastTurnSeen === null; lastTurnSeen = s.board.seq;
      if (!first) {
        const mineNow = cur.owner === me();
        banner.textContent = mineNow ? "¡Es tu turno!" : `Turno de ${nameOf(s, cur)}`;
        banner.className = "turnbanner" + (mineNow ? " mine" : ""); banner.hidden = false;
        clearTimeout(banner._h); banner._h = setTimeout(() => (banner.hidden = true), 2200);
        if (mineNow) import("../core/sonido.js").then(m => m.sound.play("holy"));
        else { const N = nowState(s, me(), isDM(s)); if (N.nextMine) toast("Prepárate: después te toca a ti"); }
        if (board && board.select && mineNow) { sel = null; }
      }
    }
  }

  function propCard(s) {
    if (!selPropId || !isDM(s)) return "";
    const p = (s.board.props || []).find(y => y.id === selPropId); if (!p) { selPropId = null; return ""; }
    return `<div class="hudcard hudprop"><button class="x" aria-label="Cerrar">✕</button>${propEditorHTML(p, { live: !opts.edit })}</div>`;
  }
  function drawHud() {
    const s = S(), dm = isDM(s);
    const ae = document.activeElement; if (ae && (hud.contains(ae) || (actHost && actHost.contains(ae))) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) return;
    const mineT = s.tokens.find(t => t.kind === "pc" && t.owner && t.owner === me());
    const target = s.tokens.find(t => t.id === sel && (dm || !unseenFn(s, dm)(t)));
    // Jugador: el objetivo en pequeño, con sus opciones de ataque desde tu figura
    const tcard = tg => { const h = hpOf(s, tg), exact = tg.kind === "pc", pct = h ? Math.max(0, Math.min(100, h.cur / Math.max(1, h.max) * 100)) : 0;
      return `<div class="hudcard tcard"><div class="tch"><b>🎯 ${esc(nameOf(s, tg))}</b>${h ? `<span class="hw ${pct <= 25 ? "low" : pct <= 50 ? "mid" : ""}">${exact ? `${h.cur}/${h.max} PG` : healthWord(h.cur, h.max)}</span>` : ""}</div>
        ${(tg.conds || []).length ? `<div class="tconds">${tg.conds.map(x => { const e = estado(x.id); return e ? `<span class="cchip" style="--c:${e.c}" title="${esc(e.t)}">${esc(e.n)}</span>` : ""; }).join("")}</div>` : ""}
        ${atkBlock(s, mineT, true, tg.id)}</div>`; };
    // Ficha con control (solo el máster, en su pestaña PNJ)
    const card = (t, title) => {
      const h = hpOf(s, t), c = charOf(s, t), canHurt = dm;
      const pct = h ? Math.max(0, Math.min(100, h.cur / Math.max(1, h.max) * 100)) : 0;
      return `<div class="hudcard"><small>${title}</small><b>${esc((c || t).name)}</b>
        ${h ? `<div class="hpbar ${pct <= 25 ? "low" : pct <= 50 ? "mid" : ""}"><i style="width:${pct}%"></i><em>${h.cur}/${h.max} PG${h.temp ? ` +${h.temp}` : ""}</em></div>` : ""}
        <div class="hudmeta">CA ${c ? c.ac : t.ac}${c ? ` · ${esc(c.cls)} ${c.level}` : ` · Vel. ${esc(String(t.speed || 9))} m`}</div>
        ${canHurt && h ? `<div class="hpquick"><input type="number" min="0" placeholder="0" data-amt="${t.id}" aria-label="Cantidad"><button class="btn small danger" data-hurt="${t.id}">Daño</button><button class="btn small" data-heal="${t.id}">Curar</button></div>` : ""}
        ${condBlock(t, canHurt)}
        ${t.kind !== "pc" ? atkBlock(s, t, canHurt, sel) : ""}
        ${canHurt && board && board.pick ? `<details class="castbox"><summary title="Solo dibuja el efecto en la mesa: no tira dados ni aplica daño">✨ Efecto visual (sin reglas)</summary><div class="castlist">${Object.entries(EFECTOS).map(([k, e]) => `<button class="btn small" data-cast="${t.id}|${k}" title="${e.hint || ""}">${e.n}</button>`).join("")}</div></details>` : ""}
        ${dm && t.kind !== "pc" ? `<details class="tkdetails" ${editOpen ? "open" : ""}><summary>Editar ${t.kind === "npc" ? "PNJ" : "enemigo"}</summary>${tokenEditor(t)}</details>` : ""}</div>`;
    };
    hud.classList.toggle("open", hudOpen);
    const cur = current(s), live = phase(s) === "live";
    // Abajo, en la mesa: solo consulta (nadie lanza nada desde aquí)
    hud.innerHTML = `<button class="hudtoggle" id="hudt" aria-expanded="${hudOpen}">${hudOpen ? "▾ Ocultar" : "▸ Consultar ficha"}</button>
      ${hudOpen ? `<div class="hudbody">${propCard(s)}${areaBlock(s)}${target ? infoCard(s, target, dm, me()) : `<p class="empty">Toca una figura (en la mesa o en la iniciativa) para consultar su estado.</p>`}</div>` : ""}`;
    // A la derecha: lo que puedes hacer tú (jugador: tu turno y tu objetivo; máster: la criatura que lleva)
    if (actHost) {
      let html = "";
      if (!dm) {
        html = ""; // el jugador lo tiene todo en su ficha (pestaña Personaje)
      } else {
        const npcs = s.tokens.filter(t => t.kind !== "pc");
        const pickId = npcId && s.tokens.some(t => t.id === npcId) ? npcId : cur && cur.kind !== "pc" ? cur.id : (target ? target.id : npcs[0] && npcs[0].id);
        const t = s.tokens.find(x => x.id === pickId); npcPick = pickId;
        html = `<div class="npcpick">${npcs.map(n => { const h = hpOf(s, n); return `<button class="npcchip ${n.id === pickId ? "on" : ""} ${h && h.cur <= 0 ? "down" : ""} ${cur && cur.id === n.id ? "turn" : ""}" data-npc="${n.id}" title="${esc(n.name)}${h ? ` · ${h.cur}/${h.max}` : ""}">${esc(n.name.split(" ")[0])}${h ? `<small>${h.cur}</small>` : ""}</button>`; }).join("") || `<p class="empty">No hay PNJ ni enemigos en la mesa.</p>`}</div>
          ${t ? npcCard(s, t, live && cur && cur.id === t.id, !!(board && board.pick)) : ""}`;
      }
      if (html !== actSig) { actSig = html; actHost.innerHTML = html; bindActs(actHost); bindKit(actHost, () => { actSig = ""; drawHud(); }, () => atkAdv);
        $$("[data-narm]", actHost).forEach(b => b.onclick = () => { const [tid, i] = b.dataset.narm.split("|"), A = armedNow(); arm(A && A.kind === "atk" && A.tok === tid && A.i === +i ? null : { kind: "atk", tok: tid, i: +i }); actSig = ""; drawHud(); });
        $$("details[data-nph]", actHost).forEach(d => d.ontoggle = () => { npcPh[d.dataset.nph] = d.open; });
        $$("[data-tkhide]", actHost).forEach(b => b.onclick = () => { store.commit("token", st => { const k = st.tokens.find(x => x.id === b.dataset.tkhide); if (k) k.hidden = !k.hidden; }); actSig = ""; drawHud(); });
        $$("[data-ndisarm]", actHost).forEach(b => b.onclick = () => { arm(null); actSig = ""; drawHud(); }); $$("[data-npc]", actHost).forEach(b => b.onclick = () => { npcId = b.dataset.npc; if (board) board.select(npcId); drawHud(); }); }
    }
    $("#hudt", hud).onclick = () => { hudOpen = !hudOpen; drawHud(); };
    const pc = $(".hudprop", hud);
    if (pc) {
      const id = selPropId, setP = fn => store.commit("board", st => { const x = (st.board.props || []).find(y => y.id === id); if (x) fn(x); });
      $(".hudprop .x", hud).onclick = () => { selPropId = null; drawHud(); };
      bindPropEditor(pc, setP, { reveal: () => setP(p => { p.hidden = false; }), loot: () => openChest(id),
        trap: () => { const st = S(), p = st.board.props.find(y => y.id === id), on = st.tokens.filter(t => p && t.c === p.c && t.r === p.r).map(t => t.id); if (!on.length) return toast("No hay nadie en esa casilla."); triggerTrap(id, on); },
        rot: () => setP(p => { p.rot = ((p.rot || 0) + 1) % 4; }), del: () => { store.commit("board", st => { st.board.props = st.board.props.filter(y => y.id !== id); }); selPropId = null; drawHud(); } });
    }
    bindActs(hud);
  }
  function bindActs(R) {
    const mineOk = id => { const st = S(), t = st.tokens.find(x => x.id === id); return isDM(st) || (t && t.owner && t.owner === me()); };
    $$(".tkdetails", R).forEach(d => d.ontoggle = () => { editOpen = d.open; });
    $$(".accd", R).forEach(d => d.ontoggle = () => { accOpen = d.open; });
    const amt = id => Math.max(0, +($(`[data-amt="${id}"]`, R) || {}).value || 0);
    $$("[data-hurt]", R).forEach(b => b.onclick = () => { const a = amt(b.dataset.hurt); if (a) applyHP(b.dataset.hurt, -a); });
    $$("[data-heal]", R).forEach(b => b.onclick = () => { const a = amt(b.dataset.heal); if (a) applyHP(b.dataset.heal, a); });
    bindTokenEditor(R, (id, fn) => store.commit("board", st => { const t = st.tokens.find(x => x.id === id); if (t) fn(t); }));
    const T = (id, fn) => store.commit("token", st => { const t = st.tokens.find(x => x.id === id); if (t) fn(t); });
    $$("[data-addcond]", R).forEach(b => b.onclick = () => { condPick = condPick === b.dataset.addcond ? null : b.dataset.addcond; drawHud(); });
    $$("[data-cond]", R).forEach(b => b.onclick = () => { const [id, cid] = b.dataset.cond.split("|"); if (!mineOk(id)) return; T(id, t => { t.conds = t.conds || []; const i = t.conds.findIndex(c => c.id === cid); if (i >= 0) t.conds.splice(i, 1); else if (condImmune(t, cid)) toast(`${t.name} es inmune a ${estado(cid).n.toLowerCase()} (perfil del SRD).`); else t.conds.push({ id: cid, lvl: estado(cid).levels ? 1 : undefined }); }); });
    $$("[data-condlvl]", R).forEach(b => b.onclick = () => { const [id, cid, d] = b.dataset.condlvl.split("|"); if (!mineOk(id)) return; T(id, t => { const c = (t.conds || []).find(x => x.id === cid); if (c) { c.lvl = Math.max(1, Math.min(6, (c.lvl || 1) + +d)); } }); });
    $$("[data-atk]", R).forEach(b => b.onclick = () => {
      const [aid, i] = b.dataset.atk.split("|"), st = S(), a = st.tokens.find(x => x.id === aid);
      if (!a || !mineOk(aid)) { toast("Solo puedes tirar con tu propio personaje."); return; }
      const tgt = isDM(st) && a.kind !== "pc" ? dmTarget || sel : sel;
      if (!tgt || tgt === aid) { toast("Elige primero el objetivo: toca un enemigo en la mesa"); return; }
      if (phase(st) === "live" && st.board.turn !== aid && !isDM(st)) { toast("No es tu turno (los ataques fuera de turno son reacciones: márcala y avisa al máster)"); }
      atkIdx = +i;
      const r = attack(aid, tgt, attacksOf(st, a)[+i], atkAdv); atkAdv = null;
      if (r) wantRolls();
      drawHud();
    });
    $$("[data-atkpick]", R).forEach(b => b.onmouseenter = () => { atkIdx = +b.dataset.atkpick; if (board) board.render(); });
    $$("[data-atkadv]", R).forEach(b => b.onclick = () => { const v = +b.dataset.atkadv; atkAdv = atkAdv === v ? null : v; drawHud(); });
    $$("[data-eco]", R).forEach(b => b.onclick = () => mineOk(b.dataset.eco.split("|")[0]) && toggle(b.dataset.eco.split("|")[0], b.dataset.eco.split("|")[1]));
    $$("[data-acc]", R).forEach(b => b.onclick = () => {
      const [tid, nm] = b.dataset.acc.split("|"); if (!mineOk(tid)) return; ruleOpen = nm;
      if (nm === "Correr") spend(tid, "dash");
      else if (nm === "Esquivar" || nm === "Destrabarse") { spend(tid, "act"); store.commit("token", st => { const t = st.tokens.find(x => x.id === tid); t.conds = (t.conds || []).filter(c => c.id !== (nm === "Esquivar" ? "esquivando" : "destrabado")); t.conds.push({ id: nm === "Esquivar" ? "esquivando" : "destrabado", seq: st.board.seq }); }); }
      else if (nm !== "Atacar" && nm !== "Magia") spend(tid, "act");
      drawHud();
    });
    $$("[data-douse]", R).forEach(b => b.onclick = () => { if (mineOk(b.dataset.douse)) douse(b.dataset.douse).then(drawHud); });
    $$("[data-rule]", R).forEach(b => b.onclick = () => { ruleOpen = ruleOpen === b.dataset.rule ? null : b.dataset.rule; drawHud(); });
    const et = $("#endturn", R); if (et) et.onclick = endTurn;
    const dt = $("#dmtarget", R); if (dt) dt.onchange = () => { dmTarget = dt.value || null; };
    $$("[data-cast]", R).forEach(b => b.onclick = () => {
      const [id, k] = b.dataset.cast.split("|"), e = EFECTOS[k], t = S().tokens.find(x => x.id === id);
      if (!mineOk(id)) return;
      if (!canActNow(S(), id)) { toast(`No es el turno de ${t ? t.name : "esa criatura"}: fuera de su turno solo reacciones.`); return; }
      const cast = to => {
        if (!to) return;
        const fx = { id: "fx" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), k, to, at: Date.now() };
        T(id, tk => { tk.fx = fx; });
        if (e.area && isDM(S())) {
          const hit = S().tokens.filter(z => Math.max(Math.abs(z.c - to.c), Math.abs(z.r - to.r)) <= e.area);
          lastArea = { n: e.n, ids: hit.map(z => z.id) };
        }
        drawHud();
      };
      if (e.self) cast({ c: t.c, r: t.r });
      else { toast(`Elige el objetivo de ${e.n} en la mesa${e.area ? " (" + e.hint + ")" : ""} · Esc para cancelar`); board.pick(e.area || 0, cast); }
    });
    $$("[data-area]", R).forEach(b => b.onclick = () => {
      const amt = Math.max(0, +($("#areadmg", R) || {}).value || 0); if (!amt || !lastArea) return;
      const half = b.dataset.area === "half", ids = $$("[data-areaid]:checked", R).map(x => x.dataset.areaid);
      ids.forEach(id => applyHP(id, -(half ? Math.floor(amt / 2) : amt)));
      toast(`${half ? "Mitad de daño" : "Daño"} aplicado a ${ids.length}`); lastArea = null; drawHud();
    });
    const ax = $("#areax", R); if (ax) ax.onclick = () => { lastArea = null; drawHud(); };
    }
  // Un solo oyente por contenedor (la mesa se vuelve a montar a menudo y no deben acumularse)
  const onDeath = e => { const b = e.target.closest("[data-death]"); if (b) deathSave(b.dataset.death); };
  if (host._onDeath) host.removeEventListener("click", host._onDeath); host._onDeath = onDeath; host.addEventListener("click", onDeath);
  // Texto flotante sobre las figuras: daño, curación, estados, fallos, críticos y salvaciones
  const screenOf = id => { if (bw.__screenOf) return bw.__screenOf(id); const g = bw.querySelector(`[data-tok="${id}"]`); if (!g) return null; const r = g.getBoundingClientRect(); return [r.left + r.width / 2, r.top]; };
  const snapOf = s => new Map(s.tokens.map(t => { const h = hpOf(s, t); return [t.id, { hp: h ? h.cur : null, conds: (t.conds || []).map(c => c.id), pc: t.kind === "pc" }]; }));
  let snap = snapOf(S()); const fbSeen = new Set(visibleRolls(S()).map(r => r.id + ":" + (r.status !== "pending")));
  function feedback() {
    const s = S(), now = snapOf(s);
    for (const [id, v] of now) {
      const o = snap.get(id), p = o && screenOf(id); if (!p) continue;
      if (o.hp != null && v.hp != null && v.hp !== o.hp) {
        const d = v.hp - o.hp; floatAt(p[0], p[1], d < 0 ? `−${-d}` : `+${d}`, d < 0 ? "dmg" : "heal", { big: Math.abs(d) >= 15 });
        if (v.hp === 0 && o.hp > 0) floatAt(p[0], p[1], v.pc ? "Inconsciente" : "¡Cae!", "down", { delay: 450 });
      }
      v.conds.filter(c => !o.conds.includes(c)).forEach((c, i) => { const e = estado(c); if (e) floatAt(p[0], p[1] - 26, "+ " + e.n, "cond", { color: e.c, delay: 300 + i * 250 }); });
      o.conds.filter(c => !v.conds.includes(c)).forEach((c, i) => { const e = estado(c); if (e) floatAt(p[0], p[1] - 26, "− " + e.n, "cond", { color: e.c, delay: 300 + i * 250 }); });
    }
    snap = now;
    for (const r of visibleRolls(s)) {
      const key = r.id + ":" + (r.status !== "pending"); if (fbSeen.has(key)) continue; fbSeen.add(key);
      const wait = r.dice && r.dice.length && r.status === "pending" ? 2600 : r.dice && r.dice.length && !fbSeen.has(r.id + ":false") ? 2600 : 0;
      if (r.kind === "attack" && r.target && r.result && (r.status !== "pending" || isDM(s))) {
        const p = screenOf(r.target); if (p) floatAt(p[0], p[1], r.result === "crit" ? "¡Crítico!" : r.result === "miss" ? "Fallo" : "Impacto", r.result === "crit" ? "crit" : r.result === "miss" ? "miss" : "hit", { delay: wait });
      }
      if (r.kind === "save" && r.tok && r.result) { const p = screenOf(r.tok); if (p) floatAt(p[0], p[1], r.result === "save" ? "✓ Salva" : "✗ Falla", r.result === "save" ? "save" : "fail", { delay: wait }); }
      if (r.saves && r.status === "pending") r.saves.forEach(sv => { if (sv.auto) return; const p = screenOf(sv.t); if (p) floatAt(p[0], p[1], sv.ok ? "✓ Salva" : "✗ Falla", sv.ok ? "save" : "fail", { delay: wait }); });
      if (r.kind === "oa" && r.status === "pending") { const p = screenOf(r.tok); if (p) floatAt(p[0], p[1], "¡Oportunidad!", "crit"); }
      if (r.kind === "death" && r.result) { const p = screenOf(r.tok); if (p) floatAt(p[0], p[1], r.result === "save" ? "✓ Resiste" : "✗ Se apaga", r.result === "save" ? "save" : "fail", { delay: wait }); }
    }
  }
  if (opts.sideHost) { const sh = opts.sideHost; if (sh._onDeath) sh.removeEventListener("click", sh._onDeath); sh._onDeath = onDeath; sh.addEventListener("click", onDeath); }
  drawInit(); drawHud(); sideShow();
  // Los avisos con caducidad (reacciones) se refrescan solos aunque nadie toque nada
  // Acciones reales de las criaturas del SRD: se cargan una vez y se redibuja la ficha
  loadKits().then(() => { if (!host.isConnected) return; actSig = ""; drawHud(); }).catch(e => console.warn("Acciones del SRD no disponibles", e));
  const tickNow = setInterval(() => { if (!host.isConnected || !$(".tb-now", host)) return clearInterval(tickNow); drawNow(); }, 4000);
  // Apuntar (BG3): al elegir arma o conjuro, la mesa enseña el alcance y los objetivos; una barra dice qué hacer
  const aimbar = document.createElement("div"); aimbar.className = "aimbar"; aimbar.hidden = true; $(".tactical", host).appendChild(aimbar);
  function drawAimbar() {
    const T = targeting(), A = armedNow();
    if (!T || !A) { aimbar.hidden = true; return; }
    const ok = (T.targets || []).filter(x => !x.ally && (x.state === "ok" || x.state === "long")).length;
    const what = T.kind === "tmpl" ? `◎ Coloca el área (${esc(T.area.shape)} de ${String(T.area.size).replace(".", ",")} m)${T.rng && !/cono|línea|emanación/.test(T.area.shape) && T.rng.n ? ` a ${String(T.rng.n).replace(".", ",")} m o menos` : ""}` : T.kind === "pick" ? "🎯 Toca los objetivos" : `🎯 Elige objetivo${ok ? ` · ${ok} a tu alcance` : " · nadie a tu alcance"}`;
    aimbar.innerHTML = `<b>${esc(T.label || "")}</b><span>${what}</span><small>Esc o clic derecho para cancelar</small><button class="ib" data-aimx aria-label="Cancelar">✕</button>`;
    aimbar.hidden = false; $("[data-aimx]", aimbar).onclick = () => { arm(null); };
  }
  const offAim = onAim(() => { if (!host.isConnected) return offAim(); drawAimbar(); if (board) board.render(); });
  const onKey = e => { if (!host.isConnected) return document.removeEventListener("keydown", onKey); if (e.key === "Escape" && armedNow()) { arm(null); actSig = ""; drawHud(); } };
  document.addEventListener("keydown", onKey);
  host.addEventListener("contextmenu", e => { if (armedNow() && e.target.closest(".boardwrap")) { e.preventDefault(); arm(null); actSig = ""; drawHud(); } });
  // Colores de la mesa (cada jugador, en su navegador)
  $("#vcol", host).onclick = e => {
    e.stopPropagation();
    let pop = $(".colpop", host); if (pop) { pop.remove(); return; }
    pop = document.createElement("div"); pop.className = "colpop"; $(".tactical", host).appendChild(pop);
    const draw = () => { const c = colors(), s = S();
      pop.innerHTML = `<h4>🎨 Colores de la mesa</h4>${COLOR_KEYS.map(([k, n, d]) => `<label title="${esc(d)}">${n}<input type="color" data-col="${k}" value="${c[k]}"></label>`).join("")}
        <label>Intensidad<input type="range" min="0.5" max="1.8" step="0.1" data-colk="strength" value="${c.strength}"></label>
        ${isDM(s) ? `<label title="Regla de campaña: como en BG3, los jugadores ven la probabilidad de impactar (deja adivinar la CA)"><span>Mostrar % de impacto a los jugadores</span><input type="checkbox" data-odds ${s.showOdds !== false ? "checked" : ""}></label>` : ""}
        <div class="row"><button class="btn small" data-colreset>Restablecer</button><span class="grow"></span><button class="btn small" data-colx>Cerrar</button></div><p class="note" style="margin:6px 0 0">Solo cambia en tu pantalla.</p>`;
      $$("[data-col]", pop).forEach(i => i.oninput = () => setColor(i.dataset.col, i.value));
      $$("[data-colk]", pop).forEach(i => i.oninput = () => setColor("strength", +i.value));
      const od = $("[data-odds]", pop); if (od) od.onchange = () => store.commit("campaign", st => { st.showOdds = od.checked; });
      $("[data-colreset]", pop).onclick = () => { resetColors(); draw(); };
      $("[data-colx]", pop).onclick = () => pop.remove(); };
    draw();
  };
  const offCol = onColors(() => { if (!host.isConnected) return offCol(); if (board) board.render(); });
  drawAimbar();
  return {
    selected: () => sel,
    npc: () => npcPick,
    update() {
      const s = S();
      if (!s.board) return;
      const fk = s.board.scene + "#" + floorIdx(s.board);
      if (board && fk !== sceneId) { sceneId = fk; board.fit(); }
      if (board) board.render();
      drawAimbar();
      if (!opts.edit) { const ev = combatEvents(s); if (ev.length && board && board.playEvents) board.playEvents(ev); }
      drawInit();
      if (rc && sideTab === "tir") renderRolls(rc);
      if (s.board.seq !== lastTurnSeen) { sel = sel; drawHud(); }
      const n = (s.rolls || []).length; if (rc && n > rollsSeen && sideTab !== "tir") { const b = $('[data-side="tir"]', host); if (b) b.classList.add("ping"); } rollsSeen = n;
      if (!host.querySelector(".hud input:focus")) drawHud();
      feedback();
    }
  };
}

/* Estados de una ficha: chips de color con su texto, y selector para añadir */
function condBlock(t, canEdit) {
  const conds = t.conds || [];
  if (!conds.length && !canEdit) return "";
  return `<div class="conds">${conds.map(cd => { const e = estado(cd.id); if (!e) return ""; return `<span class="cond" style="--c:${e.c}" title="${esc(e.t)}">${esc(etiqueta(cd.id, cd.lvl))}${canEdit && e.levels ? `<button data-condlvl="${t.id}|${cd.id}|-1" aria-label="Bajar nivel">−</button><button data-condlvl="${t.id}|${cd.id}|1" aria-label="Subir nivel">+</button>` : ""}${canEdit ? `<button data-cond="${t.id}|${cd.id}" aria-label="Quitar ${esc(e.n)}">✕</button>` : ""}</span>`; }).join("")}
      ${canEdit ? `<button class="btn small" data-addcond="${t.id}">${condPick === t.id ? "Cerrar" : "+ Estado"}</button>` : ""}</div>
    ${condPick === t.id ? `<div class="condpick">${ESTADOS.map(e => `<button class="cond ${conds.some(c => c.id === e.id) ? "on" : ""}" style="--c:${e.c}" data-cond="${t.id}|${e.id}" title="${esc(e.t)}">${e.n}</button>`).join("")}</div>` : ""}
    ${conds.length ? `<ul class="condtxt">${conds.map(cd => { const e = estado(cd.id); return e ? `<li><b style="color:${e.c}">${esc(etiqueta(cd.id, cd.lvl))}:</b> ${esc(e.t)}</li>` : ""; }).join("")}</ul>` : ""}`;
}
/* Tarjeta del turno: movimiento, acción, acción adicional, reacción y acciones del manual */
/* Consulta (solo lectura): el estado actual de cualquier figura. Los jugadores ven a los enemigos «a ojo». */
function infoCard(s, t, dm, meId) {
  // Cada rol consulta lo suyo: el jugador ve a las criaturas (vida a ojo); el máster, a los personajes al completo
  const h = hpOf(s, t), c = charOf(s, t), exact = dm || t.kind === "pc";
  const pct = h ? Math.max(0, Math.min(100, h.cur / Math.max(1, h.max) * 100)) : 0, shown = exact ? pct : pct > 75 ? 100 : pct > 50 ? 70 : pct > 25 ? 45 : pct > 0 ? 15 : 0;
  const kind = t.kind === "pc" ? (c ? `${esc(c.cls)} ${c.level}${c.species ? " · " + esc(c.species) : ""}` : "Personaje") : t.kind === "npc" ? "PNJ" : "Enemigo";
  const atks = attacksOf(s, t), live = phase(s) === "live", e = live && s.board.turn === t.id ? eco(s, t) : null;
  const sp = c && c.spells && Object.entries(c.spells.slots || {}).filter(([, v]) => v.max > 0);
  const d = c && c.hp.cur === 0 ? (c.death || { s: 0, f: 0 }) : null;
  const pas = c ? 10 + Math.floor(((+c.abilities.sab || 10) - 10) / 2) + ((c.skills || {}).percepcion ? 2 + Math.floor((Math.max(1, c.level) - 1) / 4) : 0) : null;
  return `<div class="hudcard infocard ${t.kind}"><div class="tch"><b>${esc(nameOf(s, t))}</b><small>${kind}</small>${e ? `<span class="pill hit">actuando</span>` : ""}</div>
    ${h ? `<div class="hpbar ${shown <= 25 ? "low" : shown <= 50 ? "mid" : ""}"><i style="width:${shown}%"></i><em>${exact ? `${h.cur}/${h.max} PG${h.temp ? ` +${h.temp}` : ""}` : healthWord(h.cur, h.max)}</em></div>` : ""}
    <div class="hudmeta">${exact ? `CA ${c ? c.ac : t.ac ?? "—"} · ` : ""}Vel. ${esc(String(c ? c.speed : t.speed || 9))} m${t.init != null && t.init !== "" ? ` · Inic. ${t.init}` : ""}${pas != null && dm ? ` · Percepción pasiva ${pas}` : ""}${t.size > 1 ? ` · tamaño ${t.size}×${t.size}` : ""}</div>
    ${e ? `<div class="hudmeta">Turno: ${e.act ? "acción gastada" : "acción libre"} · ${e.bonus ? "adicional gastada" : "adicional libre"} · ${e.mov.toLocaleString("es-ES")} m movidos</div>` : ""}
    ${d ? `<div class="hudmeta">💀 Contra muerte: ${d.s} éxitos · ${d.f} fallos${d.stable ? " · estable" : ""}</div>` : ""}
    ${(t.conds || []).length ? `<div class="tconds">${t.conds.map(x => { const es = estado(x.id); return es ? `<span class="cchip" style="--c:${es.c}" title="${esc(es.t || "")}">${esc(etiqueta(x.id, x.lvl))}</span>` : ""; }).join("")}</div>` : `<small class="note" style="border:0;padding:0;margin:2px 0">Sin estados.</small>`}
    ${atks.length ? `<div class="infoatk"><small>${t.kind === "pc" ? "Ataques" : "Ataques que se le conocen"}</small>${atks.slice(0, 6).map(w => `<span>${esc(w.name)}${exact ? ` <b>${w.atk >= 0 ? "+" : ""}${w.atk}</b>` : ""} <small>${esc(w.expr || "")} ${esc(w.type || "")} · ${w.rng.ranged ? `${w.rng.n}/${w.rng.l} m` : `${w.rng.l} m`}</small></span>`).join("")}</div>` : ""}
    ${dm && sp && sp.length ? `<div class="hudmeta">Espacios: ${sp.map(([l, v]) => `nv${l} ${v.max - v.used}/${v.max}`).join(" · ")}</div>` : ""}
    ${t.owner && t.owner === meId && !dm ? `<small class="note" style="border:0;padding:0;margin:4px 0 0">Tus acciones están en la pestaña «Personaje».</small>` : ""}${dm && t.kind !== "pc" ? `<small class="note" style="border:0;padding:0;margin:4px 0 0">Para jugarlo: pestaña «PNJ».</small>` : ""}</div>`;
}
/* Ficha de juego de un PNJ/enemigo para el máster (pestaña PNJ): compacta, todo a la vista */
// Fases abiertas a mano en la tarjeta del PNJ (se reinician cada turno)
let npcPh = {}, npcPhSeq = null;
const NOACT_NPC = ["incapacitado", "inconsciente", "aturdido", "paralizado", "petrificado"];
/** Tarjeta del PNJ o enemigo para el máster. En combate, por fases como la del jugador:
 *  en su turno, movimiento · acción · adicional · reacción (y legendarias); fuera de su turno, solo reacción y legendarias. */
function npcCard(s, t, turn, canPick) {
  const h = hpOf(s, t), A = armedNow(), atks = attacksOf(s, t), live = phase(s) === "live", e = live ? eco(s, t) : null;
  const pct = h ? Math.max(0, Math.min(100, h.cur / Math.max(1, h.max) * 100)) : 0, kit = kitOf(t);
  const head = `<div class="npch"><b>${esc(t.name)}</b><button class="ib tkhide ${t.hidden ? "on" : ""}" data-tkhide="${t.id}" title="${t.hidden ? "Oculto a los jugadores: pulsa para mostrarlo" : "Visible para los jugadores si sus personajes lo ven: pulsa para ocultarlo"}">${t.hidden ? "🙈 Oculto" : "👁 Visible"}</button><small>${t.kind === "npc" ? "PNJ" : "Enemigo"} · CA ${t.ac ?? "—"} · Vel. ${esc(String(t.speed || 9))} m${t.init != null && t.init !== "" ? ` · Inic. ${t.init}` : ""}</small>${turn ? `<span class="pill hit">su turno</span>` : ""}</div>
    ${h ? `<div class="npchp"><div class="hpbar ${pct <= 25 ? "low" : pct <= 50 ? "mid" : ""}"><i style="width:${pct}%"></i><em>${h.cur}/${h.max} PG</em></div><input type="number" min="0" placeholder="0" data-amt="${t.id}" aria-label="Cantidad"><button class="ib red" data-hurt="${t.id}" title="Daño">−</button><button class="ib" data-heal="${t.id}" title="Curar">+</button></div>` : ""}
    ${condBlock(t, true)}${kitDefs(t)}`;
  const weapons = why => `<div class="fweap npcw">${atks.map((w, i) => `<button class="fw ${A && A.kind === "atk" && A.tok === t.id && A.i === i ? "armed" : ""}" data-narm="${t.id}|${i}" ${why ? `disabled title="${esc(why)}"` : ""}><b>${esc(w.name)}</b><span>${w.atk >= 0 ? "+" : ""}${w.atk} · ${esc(w.expr)}</span><small>${esc(w.type || "")} · ${w.rng.ranged ? `${w.rng.n}/${w.rng.l} m` : `${w.rng.l} m`}</small></button>`).join("") || `<p class="note" style="margin:0">Sin ataques: añádelos en «Editar».</p>`}</div>
    ${A && A.kind === "atk" && A.tok === t.id ? `<div class="farmed">🎯 Toca al objetivo en la mesa <span><button class="ib ${atkAdv === 1 ? "gold" : ""}" data-atkadv="1">Ventaja</button><button class="ib ${atkAdv === -1 ? "gold" : ""}" data-atkadv="-1">Desv.</button><button class="ib" data-ndisarm>✕</button></span></div>` : ""}`;
  const fx = canPick && !kit && !(live && !turn) ? `<details class="castbox"><summary title="Solo dibuja el efecto en la mesa: no tira dados ni aplica daño">✨ Efecto visual (sin reglas)</summary><div class="castlist">${Object.entries(EFECTOS).map(([k, x]) => `<button class="btn small" data-cast="${t.id}|${k}" title="${x.hint || ""}">${x.n}</button>`).join("")}</div></details>` : "";
  const more = `<div class="npcmore">${kitRest(t)}${fx}<details class="tkdetails" ${editOpen ? "open" : ""}><summary>✎ Editar</summary>${tokenEditor(t)}</details></div>`;
  // Fuera de combate: todo a la vista
  if (!live) return `<div class="npcc">${head}${weapons("")}${kitHTML(s, t, false).replace(kitDefs(t), "")}${more}</div>`;

  if (npcPhSeq !== s.board.seq) { npcPhSeq = s.board.seq; npcPh = {}; }
  const conds = (t.conds || []).map(c => c.id), incapId = conds.find(c => NOACT_NPC.includes(c)), incap = incapId ? (estado(incapId) || { n: incapId }).n.toLowerCase() : "";
  const tag = (used, txt) => `<em class="phst ${used ? "used" : "ok"}">${used ? "✓ " : "● "}${txt}</em>`;
  const fix = k => `<button class="phfix" data-eco="${t.id}|${k}" title="Corregir: marcarla como ${(k === "react" ? e.react : e[k]) ? "disponible" : "gastada"}">↺</button>`;
  const box = (k, icon, title, used, st, body, open) => `<details class="phbox ${used ? "used" : ""} ${open ? "now" : ""}" data-nph="${k}" ${(npcPh[k] ?? open) ? "open" : ""}><summary><span>${icon} ${title}</span>${st}${k === "mov" || k === "leg" ? "" : fix(k)}</summary><div class="phbody">${body}</div></details>`;
  const ll = legLeft(t), reactPart = kitPart(s, t, turn, "react"), legPart = kitPart(s, t, turn, "leg");
  const reactBox = open => box("react", "↺", "Reacción", !!e.react || !!incap, tag(!!e.react || !!incap, incap ? "no puede" : e.react ? "gastada esta ronda" : "disponible"),
    incap ? `<p class="phno">Está ${incap}.</p>` : `<p class="phhint">Ataque de oportunidad: si un personaje sale de su alcance, la mesa lo ofrecerá.</p>${reactPart}`, open);
  const legBox = open => ll == null ? "" : box("leg", "👑", "Legendarias", ll <= 0, tag(ll <= 0, `${ll}/${legMax(t)} esta ronda`),
    `<p class="phhint">Al terminar el turno de otra criatura. Se recuperan al empezar su turno.</p>${legPart}`, open);

  if (!turn) {
    const oaNow = (s.rolls || []).find(r => r.kind === "oa" && r.status === "pending" && r.tok === t.id);
    return `<div class="npcc">${head}
      <p class="phwait">⏳ No es su turno.${oaNow ? "" : " Solo puede reaccionar o usar acciones legendarias."}</p>
      ${oaNow ? `<p class="phnow">⚔ <b>¡Oportunidad!</b> Responde en el aviso o en Tiradas.</p>` : ""}
      ${reactBox(!!oaNow)}${legBox(ll > 0 && !incap)}
      ${more}</div>`;
  }
  // ---- Su turno ----
  const max = moveBudget(s, t), left = Math.max(0, max - e.mov), moveStop = incap || conds.find(c => ["agarrado", "apresado"].includes(c));
  const movBody = moveStop ? `<p class="phno">No puede moverse: está ${esc(moveStop)}.</p>` : `<div class="movebar thin ${e.mov > max ? "over" : ""}"><i style="width:${Math.min(100, e.mov / Math.max(1, max) * 100)}%"></i><em>🦶 ${fm(e.mov)} / ${fm(max)} m${e.dash ? " · corriendo" : ""}</em></div><p class="phhint">Arrastra su figura por la mesa.</p>`;
  const atkWhy = incap ? `Está ${incap}` : kit ? kitGate(s, t, "act", { attack: true }) : e.act ? "Ya ha usado su acción" : "";
  const actUsed = !!e.act && !!atkWhy;
  const actPart = kitPart(s, t, turn, "act");
  const actBody = incap ? `<p class="phno">Está ${incap}: no puede hacer acciones.</p>` : `${multiLine(s, t, turn)}
    <small class="phsub">Atacar · elige el ataque y toca al objetivo</small>${weapons(atkWhy)}
    ${actPart ? `<small class="phsub">Otras acciones del perfil</small>${actPart}` : ""}
    <details class="faccs"><summary>Acciones comunes: Correr, Esquivar, Destrabarse…</summary><div class="accs">${ACCIONES.filter(([n]) => n !== "Atacar" && n !== "Magia").map(([n, d]) => `<button class="btn small" data-acc="${t.id}|${esc(n)}" title="${esc(d)}" ${e.act ? "disabled" : ""}>${n}</button>`).join("")}</div></details>`;
  const bonusPart = kitPart(s, t, turn, "bonus");
  const bonusBody = incap ? `<p class="phno">Está ${incap}.</p>` : bonusPart || `<p class="phno">No tiene nada que use la acción adicional.</p>`;
  const now = [!moveStop && left > 0 ? "mov" : null, !actUsed ? "act" : null, !e.bonus && bonusPart ? "bonus" : null].filter(Boolean)[0];
  return `<div class="npcc turn">${head}
    ${box("mov", "🦶", "Movimiento", !!moveStop || left <= 0, tag(!!moveStop || left <= 0, moveStop ? "0 m" : `quedan ${fm(left)} m`), movBody, !moveStop && left > 0)}
    ${box("act", "⚡", "Acción", actUsed || !!incap, incap ? tag(true, "no puede") : e.act && !atkWhy ? `<em class="phst ok">● más ataques</em>` : tag(!!e.act, e.act ? "gastada" : "disponible"), actBody, !actUsed && !incap)}
    ${box("bonus", "✦", "Acción adicional", !!e.bonus || !bonusPart || !!incap, tag(!!e.bonus || !bonusPart || !!incap, e.bonus ? "gastada" : bonusPart ? "disponible" : "nada que usar"), bonusBody, !e.bonus && !!bonusPart && !incap)}
    ${reactBox(false)}${legBox(false)}
    ${kitArmed(s, t)}
    ${!now ? `<p class="phdone">Ha gastado lo que tenía. Termina su turno.</p>` : ""}
    <button class="btn gold" id="endturn">Terminar el turno de ${esc(t.name.split(" ")[0])} ▶</button>
    ${more}</div>`;
}
const fm = n => (Math.round(n * 10) / 10).toLocaleString("es-ES");
function turnCard(s, t) {
  const e = eco(s, t), max = moveBudget(s, t), pct = Math.min(100, e.mov / Math.max(1, max) * 100);
  const chip = (k, n, on) => `<button class="eco ${on ? "used" : ""}" data-eco="${t.id}|${k}" title="${on ? "Gastada (pulsa para devolverla)" : "Disponible (pulsa para marcarla)"}">${n}</button>`;
  const rule = ruleOpen && GLOS && GLOS[ruleOpen];
  const ch = charOf(s, t);
  if (ch && ch.hp.cur === 0 && !(ch.death && (ch.death.dead || ch.death.stable))) {
    const d = ch.death || { s: 0, f: 0 }, pip = (n, on, cls) => Array.from({ length: 3 }, (_, i) => `<i class="pip ${cls} ${i < on ? "on" : ""}"></i>`).join("");
    return `<div class="hudcard turncard dying"><small>Turno de ${esc(ch.name)} · ronda ${s.board.round}</small>
      <b>A 0 PG: salvación contra muerte</b><div class="dsv"><span>Éxitos ${pip(3, d.s, "ok")}</span><span>Fallos ${pip(3, d.f, "ko")}</span></div>
      <p class="note">d20: 10 o más es un éxito; un 1 son dos fallos; un 20 te levanta con 1 PG. Tres éxitos te estabilizan; tres fallos…</p>
      <button class="btn gold" data-death="${t.id}">🎲 Tirar salvación contra muerte</button> <button class="btn" id="endturn">Terminar turno ▶</button></div>`;
  }
  return `<div class="hudcard turncard compact"><div class="tch"><b>${esc(nameOf(s, t).split(" ")[0])}</b><small>ronda ${s.board.round}</small><span class="ecos">${chip("act", "⚡ Acción", e.act)}${chip("bonus", "✦ Adic.", e.bonus)}${chip("react", "↺ Reac.", !!e.react)}</span><button class="btn gold small" id="endturn">Terminar ▶</button></div>
    <div class="movebar thin ${e.mov > max ? "over" : ""}"><i style="width:${pct}%"></i><em>🦶 ${e.mov.toLocaleString("es-ES")} / ${max.toLocaleString("es-ES")} m${e.dash ? " · corriendo" : ""}</em></div>
    ${(t.conds || []).some(c => c.id === "ardiendo") ? `<button class="btn small red" data-douse="${t.id}" title="SRD «Fuego»: con una acción apagas el fuego rodando por el suelo y quedas derribado" ${e.act ? "disabled" : ""}>🔥 Apagarse (acción)</button>` : ""}
    <details class="accd" ${accOpen ? "open" : ""}><summary>Otras acciones</summary><div class="accs">${ACCIONES.map(([n, d]) => `<button class="btn small" data-acc="${t.id}|${n}" title="${esc(d)}" ${e.act && n !== "Atacar" && n !== "Magia" ? "disabled" : ""}>${n}</button>`).join("")}</div></details>
    ${rule ? `<div class="rulebox"><b>${esc(ruleOpen)}</b> <small>[${esc(rule.tipo || "regla")}]</small>${rule.txt.split("\n").slice(0, 3).map(p => `<p>${esc(p)}</p>`).join("")}<button class="btn small" data-rule="${esc(ruleOpen)}">Cerrar</button></div>` : ""}</div>`;
}

/* Ataques: el jugador ataca al objetivo que tenga seleccionado; el máster elige objetivo para sus enemigos */
function atkBlock(s, t, canAct, sel) {
  if (!canAct) return "";
  const list = attacksOf(s, t), dm = isDM(s);
  if (!list.length) return dm && t.kind !== "pc" ? `<p class="note" style="margin:0">Añade sus ataques en «Editar enemigo».</p>` : "";
  const targets = s.tokens.filter(x => x.id !== t.id && (dm || !unseenFn(s, dm)(x)));
  return `<details class="atkbox" open><summary>⚔️ Atacar</summary>
    ${dm && t.kind !== "pc" ? `<label class="field">Objetivo<select id="dmtarget"><option value="">Elige…</option>${targets.map(x => `<option value="${x.id}" ${dmTarget === x.id ? "selected" : ""}>${esc(nameOf(s, x))}</option>`).join("")}</select></label>` : ""}
    ${(() => { const tg = s.tokens.find(x => x.id === (dm && t.kind !== "pc" ? dmTarget || sel : sel)); if (!tg || tg.id === t.id) return `<p class="note" style="margin:0 0 4px">Toca un objetivo en la mesa para ver alcance, cobertura y modificadores.</p>`;
      const m = modifiers(s, t, tg, (list[atkIdx] || list[0]).rng), cv = cover(s, t, tg);
      const w = list[atkIdx] || list[0], netAdv = atkAdv != null ? atkAdv : m.net, ac = acOf(s, tg) + (cv.bonus || 0);
      const p1 = Math.min(.95, Math.max(.05, (21 - (ac - w.atk)) / 20)), pc = netAdv > 0 ? 1 - (1 - p1) ** 2 : netAdv < 0 ? p1 * p1 : p1, pct = Math.round(pc * 100);
      const band = pct >= 75 ? "Muy probable" : pct >= 55 ? "Probable" : pct >= 35 ? "Incierto" : pct >= 15 ? "Difícil" : "Casi imposible";
      const chance = `<div class="hitch" style="--p:${pct}%;--hc:${pct >= 55 ? "#5bbf6a" : pct >= 35 ? "#d6aa4e" : "#d04a3a"}"><i></i><span>${dm ? `${pct} % de impactar` : band}${netAdv ? (netAdv > 0 ? " · ventaja" : " · desventaja") : ""}</span></div>`;
      return chance + `<div class="aimbox">🎯 <b>${esc(nameOf(s, tg))}</b> a ${metres(dist(t, tg))}${cv.txt ? ` · ${esc(cv.txt)}` : ""}${m.adv.length ? `<div class="adv">▲ Ventaja: ${esc(m.adv.join(", "))}</div>` : ""}${m.dis.length ? `<div class="dis">▼ Desventaja: ${esc(m.dis.join(", "))}</div>` : ""}${m.autoCrit ? `<div class="adv">Si impacta, es crítico</div>` : ""}</div>`; })()}
    <div class="castlist">${list.map((w, i) => { const tg = s.tokens.find(x => x.id === (dm && t.kind !== "pc" ? dmTarget || sel : sel)); const st = tg && tg.id !== t.id ? inRange(w.rng, t, tg) : null;
      return `<button class="btn small rng-${st || "na"}" data-atk="${t.id}|${i}" data-atkpick="${i}" title="${esc(w.expr + " " + w.type)} · alcance ${w.rng.n === w.rng.l ? w.rng.n + " m" : w.rng.n + "/" + w.rng.l + " m"}">${esc(w.name)} <b>${w.atk >= 0 ? "+" : ""}${w.atk}</b>${st === "out" ? " ✗" : st === "long" ? " ⚠" : st === "ok" ? " ✓" : ""}</button>`; }).join("")}</div>
    <div class="row" style="margin-top:4px"><small class="note" style="margin:0;border:0;padding:0">Forzar:</small><button class="btn small" data-atkadv="1" aria-pressed="${atkAdv === 1}">Ventaja</button><button class="btn small" data-atkadv="-1" aria-pressed="${atkAdv === -1}">Desventaja</button><button class="btn small" data-atkadv="0" aria-pressed="${atkAdv === 0}">Normal</button></div>
  </details>`;
}
function areaBlock(s) {
  if (!lastArea || !isDM(s)) return "";
  const list = lastArea.ids.map(id => s.tokens.find(t => t.id === id)).filter(Boolean);
  return `<div class="hudcard areabox"><small>Afectados por ${esc(lastArea.n)}</small>
    ${list.map(t => `<label class="switch"><input type="checkbox" data-areaid="${t.id}" checked> ${esc((charOf(s, t) || t).name)}</label>`).join("") || `<p class="empty">Nadie en el área.</p>`}
    <div class="hpquick"><input type="number" id="areadmg" min="0" placeholder="Daño"><button class="btn small danger" data-area="full">Daño</button><button class="btn small" data-area="half">Mitad (salvan)</button><button class="btn small" id="areax">✕</button></div></div>`;
}

/* Editor de la ficha de un enemigo o PNJ (también lo usa el editor de escenas) */
export function tokenEditor(t) {
  return `<div class="tokedit" data-tokedit="${t.id}">
    <label class="field">Nombre<input data-tk="name" value="${esc(t.name)}"></label>
    <div class="tkgrid">
      <label class="field">PG<input type="number" data-tk="hp" value="${t.hp ?? ""}"></label>
      <label class="field">PG máx.<input type="number" data-tk="maxhp" value="${t.maxhp ?? ""}"></label>
      <label class="field">CA<input type="number" data-tk="ac" value="${t.ac ?? ""}"></label>
      <label class="field">Inic. +<input type="number" data-tk="initBonus" value="${t.initBonus ?? 0}"></label>
      <label class="field">Tamaño<select data-tk="size">${[[1, "Mediano"], [1.6, "Grande"], [2.4, "Enorme"], [0.7, "Pequeño"]].map(([v, n]) => `<option value="${v}" ${+t.size === v ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label class="field">Miniatura<select data-tk="mini"><option value="">Automática</option>${Object.entries(MINI_NAMES).map(([k, n]) => `<option value="${k}" ${t.mini === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label class="field">Tipo<select data-tk="kind"><option value="foe" ${t.kind === "foe" ? "selected" : ""}>Enemigo</option><option value="npc" ${t.kind === "npc" ? "selected" : ""}>PNJ</option></select></label>
    </div>
    <label class="field">Ataques <small>(uno por línea: nombre | ataque | daño)</small><textarea data-tkatk rows="2" placeholder="Cimitarra | +4 | 1d6+2 cortante">${esc((t.attacks || []).map(a => [a.name, a.atk, a.dmg].join(" | ")).join("\n"))}</textarea></label>
    <div class="tkgrid" style="grid-template-columns:1fr auto"><label class="field">Silueta de la peana<select data-tk="icon"><option value="">Según el nombre</option>${SILUETAS.map(([id, n]) => `<option value="${id}" ${t.icon === id ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <div class="row" style="align-self:end"><button class="btn small" data-tkimg="${t.id}">${t.img ? "Cambiar ilustración" : "Subir ilustración"}</button>${t.img ? `<button class="btn small" data-tknoimg="${t.id}">Quitar</button>` : ""}</div></div>
    <label class="field" title="SRD «Volar»: con velocidad volando puede quedarse en el aire. Cuenta para distancias y alcance.">Vuela a (m)<select data-tk="alt"><option value="">En el suelo</option>${[1.5, 3, 4.5, 6, 9, 12, 18].map(v => `<option value="${v}" ${+t.alt === v ? "selected" : ""}>${String(v).replace(".", ",")} m</option>`).join("")}</select></label>
    <label class="field">Lleva luz<select data-tk="light"><option value="">Nada</option>${Object.entries(LIGHT_ITEMS).map(([k, x]) => `<option value="${k}" ${t.light === k ? "selected" : ""} title="${esc(x.src)}">${x.n}</option>`).join("")}</select></label>
    <div class="row"><label class="switch"><input type="checkbox" data-tk="hidden" ${t.hidden ? "checked" : ""}> Oculto a los jugadores</label><input type="color" data-tk="color" value="${t.color || "#7a2a22"}" aria-label="Color"></div>
  </div>`;
}
export function bindTokenEditor(root, mutate) {
  $$("[data-tkimg]", root).forEach(b => b.onclick = async () => {
    const f = await pickFile(); if (!f) return;
    try { toast("Cargando la ilustración…"); const r = await readImageFile(f, 700); const key = "ilu-" + Math.random().toString(36).slice(2, 9); await putImage(key, r.dataURL); mutate(b.dataset.tkimg, t => { t.img = key; }); }
    catch (e) { toast("No se pudo cargar la imagen. Prueba con un JPG o PNG."); }
  });
  $$("[data-tkatk]", root).forEach(i => i.onchange = () => { const id = i.closest("[data-tokedit]").dataset.tokedit; mutate(id, t => { t.attacks = i.value.split("\n").map(l => l.split("|").map(x => x.trim())).filter(x => x[0]).map(([name, atk, dmg]) => ({ name, atk: atk || "+0", dmg: dmg || "" })); }); });
  $$("[data-tknoimg]", root).forEach(b => b.onclick = () => mutate(b.dataset.tknoimg, t => { delete t.img; }));
  $$("[data-tokedit]", root).forEach(box => {
    const id = box.dataset.tokedit;
    $$("[data-tk]", box).forEach(i => i.onchange = () => mutate(id, t => {
      const k = i.dataset.tk;
      t[k] = i.type === "checkbox" ? i.checked : i.type === "number" || k === "size" || k === "alt" ? +i.value : i.value;
      if (k === "alt" && !t.alt) delete t.alt;
      if (k === "maxhp" && (t.hp == null || t.hp > t.maxhp)) t.hp = t.maxhp;
    }));
  });
}

/** Avisa en la mesa de un ataque de oportunidad posible: lo decide quien controla al atacante (o el máster). */
function offerOA(byId, targetId) {
  const s = store.get(), h = s.tokens.find(t => t.id === byId), t = s.tokens.find(x => x.id === targetId), u = currentUser(s) || {};
  if (!h || !t) return;
  store.commit("roll", st => { st.rolls = st.rolls || []; st.rolls.push({ id: "oa" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: Date.now(), who: u.id || null, whoName: u.name || "", kind: "oa",
    label: `${nameOf(s, t)} sale del alcance de ${nameOf(s, h)}: ataque de oportunidad`, expr: "", dice: [], total: null, nat: null, tok: h.id, target: t.id, status: "pending", secret: false, seq: s.board ? s.board.seq : null }); });
}
/** Sin objetivo elegido: una pista mínima (la ficha completa ya está en la columna de la derecha). */
function atkOnly(s, t) { return s.board && s.board.turn === t.id ? `<p class="note hudhint">⚔️ Toca a un enemigo para atacarlo o lanzarle un conjuro.</p>` : ""; }
