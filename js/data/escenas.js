import { cloneFloors } from "../core/plantas.js";
// Escenas tácticas de ejemplo y utilidades para crear escenas nuevas.
const id = p => p + "-" + Math.random().toString(36).slice(2, 8);
const k = (c, r) => c + "," + r;
const foe = (name, c, r, hp, ac, extra = {}) => ({ id: id("t"), kind: "foe", name, c, r, hp, maxhp: hp, ac, initBonus: 1, size: 1, color: "#7a2a22", ...extra });

export function blankScene(name = "Nueva escena", place = null, cols = 16, rows = 11, fill = "piedra") {
  const terrain = {};
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) terrain[k(c, r)] = fill;
  return { id: id("esc"), name, place, cols, rows, terrain, props: [], tokens: [], start: { c: 1, r: Math.floor(rows / 2) }, ambient: "interior" };
}

/* ---------- Escenas de ejemplo (criaturas del SRD 5.2.1 con sus estadísticas y acciones reales) ---------- */
// [PG, CA, iniciativa, velocidad (m), VD, tamaño] tomados de cada perfil del SRD
const SRD = {
  "Gárgola": [67, 15, 2, 9, "2", 1], "Diablillo": [21, 13, 3, 6, "1", 0.7], "Mago": [81, 15, 2, 9, "6", 1], "Esqueleto": [13, 14, 3, 9, "1/4", 1],
  "Guerrero veterano": [65, 17, 3, 9, "3", 1], "Berserker": [67, 13, 1, 9, "2", 1], "Pendenciero": [32, 12, 1, 9, "1/2", 1], "Sacerdote": [38, 13, 0, 9, "2", 1],
  "Zombi": [15, 8, -2, 6, "1/4", 1], "Gul": [22, 12, 2, 9, "1", 1], "Ghast": [36, 13, 3, 9, "2", 1], "Tumulario": [82, 14, 4, 9, "3", 1],
  "Jefe goblin": [21, 17, 2, 9, "1", 0.7], "Guerrero goblin": [10, 15, 2, 9, "1/4", 0.7], "Lobo terrible": [22, 14, 2, 15, "1", 1.6],
  "Guerrero osgo": [33, 14, 2, 9, "1", 1], "Ogro": [68, 11, -1, 12, "2", 1.6]
};
const XP = { "1/4": 50, "1/2": 100, "1": 200, "2": 450, "3": 700, "6": 2300 };
/** Una criatura del SRD en la escena (name: cómo se llama en la mesa; srd: su perfil). */
function mon(srd, c, r, extra = {}) {
  const [hp, ac, ini, vel, vd, size] = SRD[srd];
  return { id: id("t"), kind: "foe", name: srd, srd, c, r, hp, maxhp: hp, ac, initBonus: ini, speed: vel, vd, xp: XP[vd], size, color: "#7a2a22", ...extra };
}
const prop = (s, k, c, r, extra = {}) => s.props.push({ id: id("p"), c, r, k, ...extra });
const rect = (s, c0, r0, c1, r1, t) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) s.terrain[k(c, r)] = t; };
/** Muros alrededor de un rectángulo (los huecos se abren después con puertas). */
const walls = (s, c0, r0, c1, r1, t = "muro") => { for (let c = c0; c <= c1; c++) { s.terrain[k(c, r0)] = t; s.terrain[k(c, r1)] = t; } for (let r = r0; r <= r1; r++) { s.terrain[k(c0, r)] = t; s.terrain[k(c1, r)] = t; } };
const door = (s, c, r, kind = "puerta", floor = "piedra", extra = {}) => { s.terrain[k(c, r)] = floor; prop(s, kind, c, r, extra); };
const trap = (s, c, r, label, t) => prop(s, "trampaoculta", c, r, { hidden: true, label, trap: { detect: 13, save: "des", half: true, ...t } });

/* La torre del hechicero: tres plantas, trampas ocultas y un cofre en lo alto */
function torreRonda(name, floor) {
  const N = 13, s = { name, cols: N, rows: N, terrain: {}, props: [], tokens: [] };
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { const d = Math.hypot(c - 6, r - 6); s.terrain[k(c, r)] = d > 6.4 ? "vacio" : d > 5.2 ? "muro" : floor; }
  return s;
}
function torre() {
  // Planta baja: el vestíbulo. Dos gárgolas quietas como estatuas y una losa de dardos tras la puerta
  const p0 = torreRonda("Planta baja · Vestíbulo", "piedra");
  door(p0, 6, 12, "puerta", "piedra", { label: "Puerta de la torre" });
  prop(p0, "escaleras", 6, 2, { label: "Escalera de caracol: sube a la biblioteca" });
  [[3, 6], [9, 6]].forEach(([c, r]) => prop(p0, "columna", c, r));
  [[0, 6], [12, 6], [3, 1], [9, 1]].forEach(([c, r]) => prop(p0, "antorcha", c, r));
  prop(p0, "estandarte", 6, 0); prop(p0, "brasero", 6, 6);
  trap(p0, 6, 9, "Losa de presión: dardos", { dc: 13, dmg: "2d10", type: "perforante" });
  p0.tokens.push(mon("Gárgola", 4, 3, { name: "Gárgola (quieta como una estatua)" }), mon("Gárgola", 8, 3, { name: "Gárgola (quieta como una estatua)" }));
  // Primer piso: la biblioteca. Un diablillo invisible, dos esqueletos guardianes y un glifo de fuego junto a la escalera
  const p1 = torreRonda("Primer piso · Biblioteca", "madera");
  rect(p1, 4, 5, 8, 7, "alfombra");
  prop(p1, "escaleras", 6, 2, { label: "Baja al vestíbulo" }); prop(p1, "escaleras", 6, 10, { label: "Sube a la cámara del hechicero" });
  [[2, 4], [2, 8], [10, 4], [10, 8], [3, 3], [9, 3]].forEach(([c, r]) => prop(p1, "estanteria", c, r));
  prop(p1, "mesa", 6, 6); prop(p1, "silla", 5, 6); prop(p1, "velas", 7, 6); prop(p1, "pergamino", 6, 5, { loot: "Notas del hechicero: «La llave de la cámara no se separa de mí»." });
  trap(p1, 6, 9, "Glifo de fuego en el suelo", { dc: 14, dmg: "4d6", type: "fuego", detect: 14 });
  p1.tokens.push(mon("Diablillo", 9, 6, { hidden: true, name: "Diablillo (invisible)" }), mon("Esqueleto", 4, 8), mon("Esqueleto", 8, 8));
  // Segundo piso: la cámara del hechicero y, tras una puerta con llave, el cofre (con una runa en la cerradura)
  const p2 = torreRonda("Segundo piso · Cámara del hechicero", "marmol");
  for (let c = 2; c <= 10; c++) if (p2.terrain[k(c, 4)] !== "vacio") p2.terrain[k(c, 4)] = "muro";
  door(p2, 6, 4, "puertallave", "marmol", { label: "Cámara del tesoro (la llave la lleva el mago)" });
  prop(p2, "escaleras", 6, 10, { label: "Baja a la biblioteca" });
  prop(p2, "cofre", 6, 2, { label: "Cofre del hechicero", loot: "350 po, un pergamino de Bola de fuego, una Varita de proyectiles mágicos y dos Pociones de curación." });
  trap(p2, 6, 3, "Runa de relámpagos ante el cofre", { dc: 15, dmg: "3d10", type: "relámpago", detect: 15 });
  [[4, 2], [8, 2]].forEach(([c, r]) => prop(p2, "velas", c, r));
  prop(p2, "altar", 6, 6); [[3, 8], [9, 8]].forEach(([c, r]) => prop(p2, "brasero", c, r)); [[0, 6], [12, 6]].forEach(([c, r]) => prop(p2, "antorcha", c, r));
  p2.tokens.push(mon("Mago", 6, 7, { name: "Valdric, el hechicero (Mago)" }), mon("Esqueleto", 4, 8), mon("Esqueleto", 8, 8));
  const s = { id: id("esc"), name: "La torre del hechicero", place: null, cols: 13, rows: 13, terrain: p0.terrain, props: p0.props, tokens: p0.tokens,
    start: { c: 6, r: 10 }, ambient: "interior", sound: "mazmorra", floor: 0, floors: [{ name: p0.name }, p1, p2] };
  return s;
}

/* Pelea en una taberna grande: un grupo de enanos con muy mal beber */
function taberna() {
  const s = blankScene("Pelea en la taberna de la Jarra Rota", null, 22, 14, "madera");
  walls(s, 0, 0, 21, 13, "muromadera");
  door(s, 11, 13, "puerta", "madera"); door(s, 21, 2, "puerta", "madera", { label: "Puerta trasera (al callejón)" });
  // Cocina al fondo a la derecha y la barra delante
  for (let r = 1; r <= 5; r++) s.terrain[k(16, r)] = "muromadera"; door(s, 16, 3, "puerta", "piedra"); rect(s, 17, 1, 20, 5, "piedra");
  prop(s, "hoguera", 18, 2, { label: "Fogón de la cocina" }); prop(s, "caja", 20, 4); prop(s, "barril", 17, 5); prop(s, "mesa", 19, 4);
  for (let c = 9; c <= 14; c++) prop(s, "mesalarga", c, 4, { label: c === 9 ? "La barra" : "" });
  [[10, 2], [12, 2], [14, 2]].forEach(([c, r]) => prop(s, "tonel", c, r)); [[9, 1], [11, 1], [13, 1], [15, 1]].forEach(([c, r]) => prop(s, "barril", c, r));
  // Chimenea, escalera al piso de arriba y las mesas
  prop(s, "hoguera", 1, 7, { label: "Chimenea" }); prop(s, "escaleras", 2, 1, { label: "Escalera a las habitaciones" });
  rect(s, 4, 6, 8, 10, "alfombra");
  for (let c = 4; c <= 7; c++) prop(s, "mesalarga", c, 8, { label: c === 4 ? "Mesa de los enanos" : "" });
  [[4, 7], [6, 7], [5, 9], [7, 9]].forEach(([c, r]) => prop(s, "silla", c, r));
  [[12, 7], [16, 8], [13, 10], [18, 11], [9, 11]].forEach(([c, r]) => prop(s, "mesa", c, r));
  [[11, 7], [13, 7], [17, 8], [14, 10], [19, 11], [10, 11]].forEach(([c, r]) => prop(s, "silla", c, r));
  [[0, 4], [0, 10], [21, 8], [6, 0], [18, 13]].forEach(([c, r]) => prop(s, "antorcha", c, r)); prop(s, "estandarte", 11, 0, { label: "Jarra rota colgada sobre la barra" });
  s.tokens.push(
    mon("Guerrero veterano", 5, 7, { name: "Thorgrim Yunquefirme (enano)" }),
    mon("Berserker", 7, 7, { name: "Brokk Barbarroja (enano)" }),
    mon("Pendenciero", 4, 9, { name: "Durin (enano)" }), mon("Pendenciero", 6, 9, { name: "Grumli (enano)" }),
    mon("Sacerdote", 3, 8, { name: "Hilda Martillo-Santo (enana)" }),
    mon("Guerrero veterano", 8, 9, { name: "Balin Rompeyunques (enano)" }),
    mon("Pendenciero", 3, 10, { name: "Nori (enano)" }), mon("Pendenciero", 8, 7, { name: "Ori (enano)" })
  );
  s.start = { c: 11, r: 12 }; s.sound = "taberna"; s.ambient = "interior";
  return s;
}

/* El cementerio de la colina, de noche: tumbas abiertas, un mausoleo y muertos que no descansan */
function cementerio() {
  const s = blankScene("El cementerio de la colina", null, 22, 15, "hierba");
  walls(s, 0, 0, 21, 14, "muro"); door(s, 11, 14, "rastrillo", "camino", { label: "Verja del cementerio" }); s.props[s.props.length - 1].open = true;
  for (let r = 1; r <= 13; r++) s.terrain[k(11, r)] = "camino"; for (let c = 4; c <= 17; c++) s.terrain[k(c, 8)] = "camino";
  rect(s, 2, 2, 6, 4, "tierra"); rect(s, 13, 10, 18, 12, "tierra"); rect(s, 3, 10, 7, 12, "hierbalta");
  // Mausoleo al fondo a la derecha
  walls(s, 14, 1, 20, 6, "muro"); rect(s, 15, 2, 19, 5, "piedra"); door(s, 17, 6, "puerta", "piedra", { label: "Puerta del mausoleo" });
  prop(s, "sarcofago", 16, 3, { loot: "Un anillo de plata (25 po) entre los huesos." }); prop(s, "sarcofago", 18, 3); prop(s, "altar", 17, 2); [[15, 2], [19, 2]].forEach(([c, r]) => prop(s, "velas", c, r));
  // Tumbas, lápidas y árboles muertos
  [[2, 2], [4, 2], [6, 2], [2, 4], [4, 4], [6, 4], [13, 10], [15, 10], [17, 10], [14, 12], [16, 12], [18, 12]].forEach(([c, r]) => prop(s, "calavera", c, r, { label: "Tumba" }));
  [[3, 3], [5, 3], [16, 11]].forEach(([c, r]) => prop(s, "sarcofago", c, r, { label: "Tumba abierta" }));
  [[8, 3], [9, 11], [13, 5]].forEach(([c, r]) => prop(s, "estatua", c, r, { label: "Ángel de piedra" }));
  [[1, 7], [20, 9], [8, 12], [9, 1], [20, 12]].forEach(([c, r]) => prop(s, "arbolmuerto", c, r));
  prop(s, "pozo", 8, 6, { label: "Pozo de agua bendita (seco)" }); prop(s, "telarana", 19, 5);
  trap(s, 9, 9, "Fosa abierta tapada por la maleza", { dc: 12, dmg: "1d6", type: "contundente", detect: 12, cond: "derribado" });
  s.tokens.push(
    mon("Zombi", 3, 3), mon("Zombi", 5, 4), mon("Zombi", 14, 11, { hidden: true, name: "Zombi (bajo tierra)" }), mon("Zombi", 17, 11, { hidden: true, name: "Zombi (bajo tierra)" }),
    mon("Esqueleto", 7, 8), mon("Esqueleto", 13, 7), mon("Esqueleto", 12, 4),
    mon("Gul", 16, 9), mon("Gul", 4, 11, { hidden: true, name: "Gul (entre la maleza)" }), mon("Ghast", 16, 4, { hidden: true }), mon("Ghast", 18, 2, { hidden: true }), mon("Tumulario", 18, 4, { hidden: true, name: "Tumulario (señor del mausoleo)" })
  );
  s.start = { c: 11, r: 12 }; s.ambient = "noche"; s.sound = "viento"; s.fog = true;
  return s;
}

/* Emboscada en el bosque: goblins escondidos en la maleza, huargos y un lazo en el camino */
function bosque() {
  const s = blankScene("Emboscada en el bosque", null, 24, 15, "hierba");
  // Camino que serpentea de oeste a este y un arroyo con un puente de tablones
  const road = [[0, 8], [1, 8], [2, 8], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7], [8, 6], [9, 6], [10, 6], [11, 7], [12, 7], [13, 7], [14, 8], [15, 8], [16, 8], [17, 7], [18, 7], [19, 6], [20, 6], [21, 6], [22, 6], [23, 6]];
  road.forEach(([c, r]) => { s.terrain[k(c, r)] = "camino"; s.terrain[k(c, r + 1)] = "tierra"; });
  for (let r = 0; r < 15; r++) { const c = 15 + Math.round(Math.sin(r / 2.5) * 1.5); s.terrain[k(c, r)] = "agua"; }
  [7, 8, 9].forEach(r => { const c = 15 + Math.round(Math.sin(r / 2.5) * 1.5); s.terrain[k(c, r)] = "madera"; });
  rect(s, 7, 2, 12, 4, "hierbalta"); rect(s, 9, 10, 14, 12, "hierbalta"); rect(s, 19, 2, 22, 4, "hierbalta");
  [[1, 2], [3, 4], [5, 1], [2, 12], [4, 13], [6, 11], [12, 1], [13, 13], [17, 1], [18, 12], [21, 10], [23, 2], [20, 13], [6, 4], [8, 13]].forEach(([c, r]) => prop(s, "arbol", c, r));
  [[8, 4], [11, 3], [10, 10], [13, 11], [20, 3]].forEach(([c, r]) => prop(s, "arbusto", c, r));
  [[16, 4], [17, 4], [5, 10], [21, 8]].forEach(([c, r]) => prop(s, "roca", c, r)); prop(s, "penasco", 18, 3, { label: "Peñasco del jefe" }); prop(s, "tocon", 3, 10);
  prop(s, "arbolmuerto", 12, 6, { label: "Árbol caído sobre el camino" });
  trap(s, 10, 7, "Lazo de cuerda escondido", { dc: 12, dmg: "1d4", type: "contundente", detect: 13, cond: "apresado" });
  s.tokens.push(
    mon("Jefe goblin", 18, 2, { name: "Jefe goblin (en el peñasco)" }),
    mon("Guerrero goblin", 9, 3, { hidden: true, name: "Goblin (en la maleza)" }), mon("Guerrero goblin", 11, 2, { hidden: true, name: "Goblin (en la maleza)" }),
    mon("Guerrero goblin", 11, 11, { hidden: true, name: "Goblin (en la maleza)" }), mon("Guerrero goblin", 13, 12, { hidden: true, name: "Goblin (en la maleza)" }),
    mon("Lobo terrible", 21, 4, { hidden: true, name: "Huargo (lobo terrible)" }), mon("Lobo terrible", 20, 9, { hidden: true, name: "Huargo (lobo terrible)" }),
    mon("Lobo terrible", 22, 11, { hidden: true, name: "Huargo (lobo terrible)" }), mon("Lobo terrible", 1, 4, { hidden: true, name: "Huargo (lobo terrible)" }),
    mon("Guerrero osgo", 6, 3, { hidden: true, name: "Osgo (tras los árboles)" }), mon("Guerrero osgo", 7, 12, { hidden: true, name: "Osgo (tras los árboles)" }),
    mon("Ogro", 13, 5, { hidden: true, name: "Ogro (tras el árbol caído)" })
  );
  s.start = { c: 2, r: 8 }; s.ambient = "dia"; s.sound = "bosque";
  return s;
}

/** ex: versión de las escenas de ejemplo (2 = equilibradas para 4 PJ de nivel 5). */
export const EX_VER = 2;
export const exampleScenes = () => [torre(), taberna(), cementerio(), bosque()].map(sc => Object.assign(sc, { ex: EX_VER }));

/** Criaturas con el mismo nombre: «Goblin (en la maleza)» ×4 → «Goblin 1 (en la maleza)», «Goblin 2…», para distinguirlas. */
export function numberDupes(tokens) {
  const groups = {};
  const base = n => String(n).replace(/\s*\(.*\)$/, "").trim();
  tokens.filter(t => t.kind !== "pc").forEach(t => (groups[base(t.name)] = groups[base(t.name)] || []).push(t));
  Object.values(groups).forEach(g => { if (g.length < 2) return; g.forEach((t, i) => { const m = String(t.name).match(/^(.*?)(\s*\(.*\))?$/); t.name = `${m[1]} ${i + 1}${m[2] || ""}`; }); });
  return tokens;
}
/** Copia una escena preparada a la mesa en directo, colocando al grupo en su punto de inicio. */
export function sceneToBoard(scene, characters, keepPCs) {
  const floors = cloneFloors(scene, { newIds: true });
  const board = { scene: scene.id, name: scene.name, cols: scene.cols, rows: scene.rows, terrain: { ...scene.terrain }, ...(scene.elev ? { elev: { ...scene.elev } } : {}), props: scene.props.map(p => ({ ...p })), ambient: scene.ambient || "interior", sound: scene.sound || "", region: scene.region || "", lavaDmg: scene.lavaDmg || "", fallH: scene.fallH || 3, turn: null, round: 0, ...(scene.light ? { light: scene.light } : {}), ...(scene.fog === false ? { fog: false } : {}), ...(floors ? { floors, floor: scene.floor || 0 } : {}) };
  const foes = numberDupes(scene.tokens.map(t => ({ ...t, id: id("t"), init: null })));
  const spots = ring(scene.start || { c: 1, r: 1 }, scene);
  const pcs = characters.map((ch, i) => {
    const old = keepPCs && keepPCs.find(t => t.char === ch.id);
    const at = spots[i] || spots[spots.length - 1] || { c: 0, r: 0 };
    return { id: old ? old.id : id("t"), kind: "pc", char: ch.id, owner: ch.owner || null, name: ch.name, c: at.c, r: at.r, size: 1, init: null, conds: old && old.conds ? old.conds : [] };
  });
  // Despliegue: el grupo se coloca por turnos dentro de la zona de inicio (core/despliegue.js)
  const st = scene.start || { c: 1, r: 1 };
  if (pcs.length) board.deploy = { id: "dp" + Date.now().toString(36), c: st.c, r: st.r, rad: +scene.deployRad || 2, on: true };
  return { board, tokens: [...pcs, ...foes] };
}
function ring(start, scene) {
  const out = [], seen = new Set(), wall = (c, r) => scene.terrain[k(c, r)] === "muro";
  for (let d = 0; d < 6 && out.length < 12; d++) for (let r = start.r - d; r <= start.r + d; r++) for (let c = start.c - d; c <= start.c + d; c++) {
    if (c < 0 || r < 0 || c >= scene.cols || r >= scene.rows || seen.has(k(c, r)) || wall(c, r)) continue;
    if (scene.tokens.some(t => t.c === c && t.r === r)) continue;
    seen.add(k(c, r)); out.push({ c, r });
  }
  return out;
}
