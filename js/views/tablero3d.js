// La mesa en 3D: tablero de casillas de 1,5 m sobre una mesa de madera, escenografía y miniaturas de KayKit (CC0),
// luces de antorcha con parpadeo, fuego con partículas, ambientes de luz y cámara orbital o libre.
// Usa los mismos datos que la vista 2D: { grid: {cols, rows, terrain, props, ambient}, tokens: [...] }.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { clone as skClone } from "three/addons/utils/SkeletonUtils.js";
import { getImage } from "../core/images.js";
import { TERRAIN, dist } from "./tablero.js";
import { PROPS, isDoor, propVisible } from "../data/mapas.js";
import { pathTo, moveHint } from "../core/movimiento.js";
import { terrainCanvas } from "./texturas.js";
import { PROC } from "./props3d.js";
import { siluetaFor, siluetaURL } from "../data/siluetas.js";
import { estado, etiqueta } from "../data/estados.js";
import { computeVision, explored } from "../core/vision.js";
import { playEffect, EFECTOS } from "./efectos3d.js";
import { sound, AMBIENTES } from "../core/sonido.js";
import { floatText, strike, motes } from "./golpes3d.js";
import { RES_TEXT, RES_COLOR, cells as cellDist } from "../core/golpes.js";

const CELL = 4, BASE = "assets/kaykit/";
const loader = new GLTFLoader();
const cache = new Map();
const load = p => { if (!cache.has(p)) cache.set(p, loader.loadAsync(BASE + p + ".glb").catch(e => { console.warn("No se pudo cargar", p, e); return null; })); return cache.get(p); };

export const MINIS = {
  Knight: "Caballero", Barbarian: "Bárbaro", Mage: "Mago", Rogue: "Pícaro", Rogue_Hooded: "Encapuchado",
  Skeleton_Warrior: "Esqueleto guerrero", Skeleton_Minion: "Esqueleto", Skeleton_Rogue: "Esqueleto pícaro", Skeleton_Mage: "Esqueleto mago", peana: "Peana de cartón"
};
/** Qué miniatura usar. */
export function miniFor(t, ch) {
  // Peana de cartón por defecto para todos; la figura 3D solo si se elige en la ficha (jugadores) o en el editor (enemigos)
  return t.mini || (ch && ch.mini) || "peana";
}

// Escenografía: modelo, escala y si va colgada de la pared
const PROP3D = {
  mesa: ["dungeon/table_medium", 1.2], mesalarga: ["dungeon/table_long_decorated_A", 1], silla: ["dungeon/chair", 1.2], barril: ["dungeon/barrel_large", 1],
  caja: ["dungeon/crates_stacked", 1], cofre: ["dungeon/chest", 1.1], columna: ["dungeon/pillar_decorated", 1], cama: ["dungeon/bed_decorated", 1],
  calavera: ["dungeon/rubble_large", 0.45], tonel: ["dungeon/keg", 1], baul: ["dungeon/trunk_large_A", 1.2], escaleras: ["dungeon/stairs", 0.8],
  velas: ["dungeon/candle_triple", 1.6], antorcha: ["dungeon/torch_mounted", 1.6, "wall"], estandarte: ["dungeon/banner_red", 1, "wall"], puerta: ["dungeon/wall_doorway", 1, "door"],
  puertallave: ["dungeon/wall_doorway", 1, "door"], puertasecreta: ["dungeon/wall_doorway", 1, "door"], rastrillo: ["dungeon/wall_doorway", 1, "door"],
  estanteria: ["dungeon/shelf_large", 1], cofre: ["dungeon/chest", 1.1]
};
// Texturas de terreno como materiales 3D (con relieve sacado de la propia imagen); una por tipo
const TEXMAT = new Map();
function terrainMat(k) {
  if (TEXMAT.has(k)) return TEXMAT.get(k);
  const ty = TERRAIN[k] || TERRAIN.piedra, map = new THREE.CanvasTexture(terrainCanvas(k));
  map.wrapS = map.wrapT = THREE.RepeatWrapping; map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const bump = new THREE.CanvasTexture(terrainCanvas(k)); bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  const m = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: ty.liquid ? 0.3 : ty.wall ? 0.5 : 1.1, roughness: k === "hielo" || k === "marmol" ? 0.5 : ty.liquid ? 0.2 : 1, metalness: 0,
    ...(ty.liquid && k !== "lava" ? { transparent: true, opacity: 0.9 } : {}), ...(ty.glow ? { emissive: 0xff5a10, emissiveMap: map, emissiveIntensity: 1.1 } : {}) });
  TEXMAT.set(k, m); return m;
}
/** Suelo continuo de un tipo de terreno: un cuadrado por casilla con coordenadas de textura del mundo (sin costuras). */
function floorGeometry(list, cx, cz, y) {
  const pos = [], uv = [], idx = [], h = CELL / 2;
  list.forEach(([c, r], i) => {
    const x = cx(c), z = cz(r);
    [[-h, -h], [h, -h], [h, h], [-h, h]].forEach(([a, b]) => { pos.push(x + a, y, z + b); uv.push((x + a) / (CELL * 2), -(z + b) / (CELL * 2)); });
    const o = i * 4; idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const FLOOR = { piedra: "dungeon/floor_tile_large", madera: "dungeon/floor_wood_large", tierra: "dungeon/floor_dirt_large", barro: "dungeon/floor_dirt_large" };
const FLOOR_TINT = { barro: 0x8a7458 };
const AMBIENT = {
  dia: { n: "Día", hemi: [0xdfeaff, 0x6b5a45, 1.6], sun: [0xfff1dc, 2.6], bg: 0x2b2722, torch: 0.5 },
  interior: { n: "Interior", hemi: [0xffe2c0, 0x3a2c20, 0.55], sun: [0xffc58a, 0.9], bg: 0x17120e, torch: 1 },
  noche: { n: "Noche", hemi: [0x7a8fc8, 0x1a1c26, 0.5], sun: [0x9fb4ff, 0.6], bg: 0x080a10, torch: 1.25 }
};

// ---------- Texturas procedurales (sin descargas) ----------
function noiseTex(base, spread, size = 128, grain = 1) {
  const c = document.createElement("canvas"); c.width = c.height = size;
  const g = c.getContext("2d"), col = new THREE.Color(base);
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = (Math.random() - 0.5) * spread * grain + Math.sin(i * 0.013) * spread * 0.15;
    img.data[i * 4] = Math.max(0, Math.min(255, col.r * 255 + v * 255));
    img.data[i * 4 + 1] = Math.max(0, Math.min(255, col.g * 255 + v * 255));
    img.data[i * 4 + 2] = Math.max(0, Math.min(255, col.b * 255 + v * 255));
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function woodTex() {
  const c = document.createElement("canvas"); c.width = 512; c.height = 512;
  const g = c.getContext("2d");
  for (let p = 0; p < 8; p++) {
    const y = p * 64, base = 70 + Math.random() * 20;
    g.fillStyle = `rgb(${base + 40},${base + 10},${base - 25})`; g.fillRect(0, y, 512, 64);
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(40,22,10,${0.08 + Math.random() * 0.12})`; g.lineWidth = 1 + Math.random() * 2; g.beginPath(); const yy = y + Math.random() * 64; g.moveTo(0, yy); g.bezierCurveTo(170, yy + Math.random() * 8 - 4, 340, yy + Math.random() * 8 - 4, 512, yy); g.stroke(); }
    g.fillStyle = "rgba(20,10,4,.6)"; g.fillRect(0, y, 512, 2);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let LEAF = null;
function woodLeaf() {
  if (LEAF) return LEAF;
  const c = document.createElement("canvas"); c.width = 128; c.height = 192;
  const g = c.getContext("2d"); g.fillStyle = "#6b4526"; g.fillRect(0, 0, 128, 192);
  for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? "#5e3b20" : "#734b2a"; g.fillRect(i * 32, 0, 30, 192); }
  g.fillStyle = "#2b2b2b"; g.fillRect(0, 30, 128, 10); g.fillRect(0, 150, 128, 10); g.beginPath(); g.arc(104, 100, 6, 0, 7); g.fill();
  LEAF = new THREE.CanvasTexture(c); LEAF.colorSpace = THREE.SRGBColorSpace; return LEAF;
}
function glowTex() {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,240,200,1)"); r.addColorStop(0.3, "rgba(255,160,60,.8)"); r.addColorStop(1, "rgba(255,80,0,0)");
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
let GLOW = null;

// ---------- Elementos procedurales ----------
const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...extra });
function tree() {
  const g = new THREE.Group(), h = 0.85 + Math.random() * 0.35;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, 2, 7), mat(0x5a3d22)); trunk.position.y = 1; g.add(trunk);
  const leaf = mat(new THREE.Color().setHSL(0.27 + Math.random() * 0.05, 0.45, 0.22 + Math.random() * 0.06));
  [[1.9, 2.6, 2.2], [1.5, 2.2, 3.4], [1, 1.8, 4.5]].forEach(([r, hh, y]) => { const m = new THREE.Mesh(new THREE.ConeGeometry(r, hh, 8), leaf); m.position.y = y; g.add(m); });
  g.scale.setScalar(h); g.rotation.y = Math.random() * 6;
  return g;
}
function bush() { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), mat(0x3f5f2a)); m.scale.set(1.2, 0.7, 1.1); m.position.y = 0.6; m.rotation.y = Math.random() * 6; return m; }
function rock() { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2, 0), mat(0x77736c)); m.scale.set(1.1, 0.75 + Math.random() * 0.3, 0.9); m.position.y = 0.55; m.rotation.set(Math.random(), Math.random() * 6, Math.random() * 0.3); return m; }
function trap() {
  const g = new THREE.Group(), plate = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 3), mat(0x3a3530)); plate.position.y = 0.06; g.add(plate);
  for (let i = 0; i < 9; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 5), mat(0x9a9a9a, { metalness: 0.6, roughness: 0.4 })); s.position.set((i % 3 - 1) * 0.9, 0.45, (Math.floor(i / 3) - 1) * 0.9); g.add(s); }
  return g;
}
function fire(scale = 1) {
  if (!GLOW) GLOW = glowTex();
  const n = 26, geo = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), life = new Float32Array(n);
  for (let i = 0; i < n; i++) life[i] = Math.random();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: GLOW, size: 0.9 * scale, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffa040 }));
  pts.userData.tick = dt => {
    for (let i = 0; i < n; i++) {
      life[i] += dt * (0.9 + (i % 5) * 0.12); if (life[i] > 1) life[i] -= 1;
      const l = life[i], a = i * 2.39996;
      pos[i * 3] = Math.cos(a) * 0.25 * scale * (1 - l); pos[i * 3 + 1] = l * 1.6 * scale; pos[i * 3 + 2] = Math.sin(a) * 0.25 * scale * (1 - l);
    }
    geo.attributes.position.needsUpdate = true;
  };
  return pts;
}
function campfire() {
  const g = new THREE.Group();
  for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.6, 6), mat(0x4a2e18)); l.rotation.z = Math.PI / 2; l.rotation.y = i * Math.PI / 4; l.position.y = 0.2; g.add(l); }
  for (let i = 0; i < 8; i++) { const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25, 0), mat(0x666058)); const a = i / 8 * Math.PI * 2; s.position.set(Math.cos(a) * 1, 0.15, Math.sin(a) * 1); g.add(s); }
  const f = fire(1.3); f.position.y = 0.2; g.add(f);
  g.userData.light = { y: 1.2, power: 1.4 };
  return g;
}

// ---------- Etiqueta (nombre y vida) ----------
function labelSprite(text, sub, pct, color) {
  const c = document.createElement("canvas"); c.width = 256; c.height = 84;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(20,15,12,.85)"; g.beginPath(); g.roundRect(2, 2, 252, 80, 12); g.fill();
  g.strokeStyle = color; g.lineWidth = 3; g.stroke();
  g.fillStyle = "#f1e6cc"; g.font = "bold 28px Georgia"; g.textAlign = "center"; g.fillText(text.slice(0, 18), 128, 34);
  if (pct != null) { g.fillStyle = "#2b1512"; g.fillRect(24, 48, 208, 14); g.fillStyle = pct > 0.5 ? "#6f9a3d" : pct > 0.25 ? "#c9a23d" : "#c4513f"; g.fillRect(24, 48, 208 * Math.max(0, pct), 14); }
  if (sub) { g.fillStyle = "#cdbb98"; g.font = "18px Georgia"; g.fillText(sub, 128, pct != null ? 78 : 62); }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(3.8, 1.25, 1); s.renderOrder = 10;
  return s;
}

// Barra de vida siempre visible sobre cada figura (exacta para el máster y los personajes; aproximada para los enemigos)
function hpBarSprite(pct, txt, color) {
  const c = document.createElement("canvas"); c.width = 192; c.height = 40; const g = c.getContext("2d");
  g.fillStyle = "rgba(14,10,8,.88)"; g.beginPath(); g.roundRect(2, 4, 188, 32, 10); g.fill();
  g.strokeStyle = color; g.lineWidth = 2.5; g.stroke();
  const w = 176 * Math.max(0, Math.min(1, pct));
  g.fillStyle = "#3a1b16"; g.beginPath(); g.roundRect(8, 10, 176, 20, 6); g.fill();
  if (w > 0) { const gr = g.createLinearGradient(0, 10, 0, 30); const base = pct > 0.5 ? ["#9bd06a", "#4f7d2a"] : pct > 0.25 ? ["#f0c85a", "#a37a1e"] : ["#ff7a62", "#a3291c"]; gr.addColorStop(0, base[0]); gr.addColorStop(1, base[1]); g.fillStyle = gr; g.beginPath(); g.roundRect(8, 10, Math.max(8, w), 20, 6); g.fill(); }
  if (txt) { g.font = "bold 19px Georgia"; g.textAlign = "center"; g.textBaseline = "middle"; g.lineWidth = 4; g.strokeStyle = "rgba(0,0,0,.85)"; g.strokeText(txt, 96, 21); g.fillStyle = "#fff"; g.fillText(txt, 96, 21); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(2.9, 0.6, 1); s.renderOrder = 9; return s;
}
// Placa con el nombre y la vida: mismo tamaño en pantalla esté la cámara cerca o lejos, para que siempre se lea
const PLATE_H = 0.043;
const TITLES = /^(hermano|hermana|sir|lady|lord|maese|fray|sor|don|doña|capitán|capitana|madre|padre)$/i;
/** Criaturas: sin el paréntesis («Tumulario (señor del mausoleo)» → «Tumulario»); si sigue largo, la primera palabra. */
const plateName = n => { const b = String(n || "?").replace(/\s*\(.*?\)/g, "").trim() || "?"; return b.length > 16 ? b.split(/\s+/)[0] : b; };
/** Nombre corto para la placa: «Brena Martillo-Ceniza» → «Brena», «Hermano Osric» → «Osric». */
const shortName = n => { const w = (n || "?").trim().split(/\s+/); return w.length > 1 && TITLES.test(w[0]) ? w[1] : w[0].length < 3 && w[1] ? w.slice(0, 2).join(" ") : w[0]; };
function namePlate(name, pct, txt, color, hl) {
  const c = document.createElement("canvas"); c.width = 640; c.height = 150; const g = c.getContext("2d");
  g.font = "bold 58px Georgia"; let fs = 58; while (g.measureText(name).width > 560 && fs > 30) { fs -= 2; g.font = `bold ${fs}px Georgia`; }
  const w = Math.min(632, Math.max(300, g.measureText(name).width + 70)), x0 = (640 - w) / 2;
  g.shadowColor = hl ? color : "rgba(0,0,0,.6)"; g.shadowBlur = hl ? 18 : 8;
  g.fillStyle = "rgba(14,10,8,.92)"; g.beginPath(); g.roundRect(x0, 6, w, 138, 26); g.fill(); g.shadowBlur = 0;
  g.strokeStyle = color; g.lineWidth = hl ? 7 : 4; g.stroke();
  g.fillStyle = hl ? "#ffe6a6" : "#f6ecd2"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(name, 320, pct != null ? 54 : 75);
  if (pct != null) {
    const bx = x0 + 22, bw = w - 44;
    g.fillStyle = "#3a1b16"; g.beginPath(); g.roundRect(bx, 92, bw, 34, 10); g.fill();
    const fw = bw * Math.max(0, Math.min(1, pct));
    if (fw > 0) { const gr = g.createLinearGradient(0, 92, 0, 126), base = pct > 0.5 ? ["#9bd06a", "#4f7d2a"] : pct > 0.25 ? ["#f0c85a", "#a37a1e"] : ["#ff7a62", "#a3291c"]; gr.addColorStop(0, base[0]); gr.addColorStop(1, base[1]); g.fillStyle = gr; g.beginPath(); g.roundRect(bx, 92, Math.max(12, fw), 34, 10); g.fill(); }
    if (txt) { g.font = "bold 28px Georgia"; g.lineWidth = 6; g.strokeStyle = "rgba(0,0,0,.85)"; g.strokeText(txt, 320, 110); g.fillStyle = "#fff"; g.fillText(txt, 320, 110); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true, sizeAttenuation: false }));
  s.scale.set(PLATE_H * 640 / 150, PLATE_H, 1); s.center.set(0.5, 0); s.renderOrder = 9; return s;
}
function condTag(conds) {
  const list = conds.map(cd => ({ e: estado(cd.id || cd), lvl: cd.lvl })).filter(x => x.e);
  const c = document.createElement("canvas"), rowH = 50; c.width = 400; c.height = rowH * list.length + 10;
  const g = c.getContext("2d"); g.font = "bold 30px Georgia"; g.textAlign = "center";
  list.forEach(({ e, lvl }, i) => {
    const y = 5 + i * rowH; g.shadowColor = "rgba(0,0,0,.8)"; g.shadowBlur = 8;
    g.fillStyle = e.c; g.beginPath(); g.roundRect(14, y, 372, rowH - 8, 20); g.fill(); g.shadowBlur = 0;
    g.strokeStyle = "rgba(255,255,255,.75)"; g.lineWidth = 3; g.stroke();
    const lum = new THREE.Color(e.c), dark = (lum.r * 0.3 + lum.g * 0.59 + lum.b * 0.11) > 0.55;
    g.lineWidth = 5; g.strokeStyle = dark ? "rgba(255,255,255,.5)" : "rgba(0,0,0,.65)"; g.strokeText(etiqueta(e.id, lvl).toUpperCase(), 200, y + 32);
    g.fillStyle = dark ? "#1a140c" : "#fff"; g.fillText(etiqueta(e.id, lvl).toUpperCase(), 200, y + 32);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set(3.6, 3.6 * c.height / 400, 1); s.renderOrder = 11; s.center.set(0.5, 0);
  return s;
}

/**
 * opts: { model(), dm, canMove(t), mutate(label, fn), decorate(t), hpOf(t), onSelect(id), charOf(t), setAmbient(key) }
 */
export function createBoard3D(host, opts) {
  host.classList.add("board", "board3d");
  // Los controles de cámara y ambiente pueden ir fuera del tablero (en la barra superior de la mesa)
  const ctl = opts.controlsHost || host;
  // En la barra superior va la versión compacta: volumen vertical, ⌖ y ⬇ en cuadraditos, Órbita/Libre y Muros.
  // Niebla, música y luz (día/noche/interior) las decide el máster desde su pestaña.
  const camHTML = opts.controlsHost ? `<div class="cam3d compact" role="toolbar" aria-label="Cámara">
      <span class="camsq"><button class="sq" data-cam="center" title="Centrar la cámara en la mesa" aria-label="Centrar">⌖</button><button class="sq" data-cam="top" title="Vista cenital (desde arriba)" aria-label="Cenital">⬇</button><button class="sq" data-cam="ruler" aria-pressed="false" title="Regla: arrastra de una casilla a otra para medir" aria-label="Regla">📏</button><button class="sq" data-cam="mute" title="Silenciar">${sound.muted ? "🔇" : "🔊"}</button></span>
      <span class="volv" title="Volumen"><input type="range" min="0" max="1" step="0.05" value="${sound.volume}" data-vol aria-label="Volumen" orient="vertical"></span>
      <span class="camst"><button class="btn small" data-cam="mode" aria-pressed="false" title="Órbita alrededor del centro o cámara libre">Órbita</button><button class="btn small" data-cam="walls" aria-pressed="true" title="Muros bajos para ver mejor">Muros bajos</button></span>
    </div>` : `<div class="cam3d" role="toolbar" aria-label="Cámara">
      <button class="btn small" data-cam="center" title="Centrar la cámara en la mesa">⌖ Centrar</button>
      <button class="btn small" data-cam="top" title="Vista desde arriba">⬇ Cenital</button>
      <button class="btn small" data-cam="ruler" aria-pressed="false" title="Regla: arrastra de una casilla a otra para medir">📏 Medir</button>
      <button class="btn small" data-cam="mode" aria-pressed="false" title="Órbita alrededor del centro o cámara libre">Órbita</button>
      <button class="btn small" data-cam="walls" aria-pressed="true" title="Muros bajos para ver mejor">Muros bajos</button>
      ${opts.dm && opts.setFog ? `<button class="btn small" data-cam="fog" title="Niebla de guerra para los jugadores">Niebla</button>` : ""}
      ${opts.dm && opts.setSound ? `<select class="btn small" data-snd aria-label="Sonido ambiente">${Object.entries(AMBIENTES).map(([k, v]) => `<option value="${k}">🎵 ${v}</option>`).join("")}</select>` : ""}
      <span class="volbox"><button class="btn small" data-cam="mute" title="Silenciar">${sound.muted ? "🔇" : "🔊"}</button><input type="range" min="0" max="1" step="0.05" value="${sound.volume}" data-vol aria-label="Volumen"></span>
      ${opts.dm ? `<select class="btn small" data-amb aria-label="Ambiente">${Object.entries(AMBIENT).map(([k, v]) => `<option value="${k}">${v.n}</option>`).join("")}</select>` : ""}
    </div>`;
  host.innerHTML = `${opts.controlsHost ? "" : camHTML}<div class="dragtip" hidden></div><div class="loading3d">Montando la mesa…</div>`;
  if (opts.controlsHost) opts.controlsHost.innerHTML = camHTML;
  const tip = host.querySelector(".dragtip"), loadingEl = host.querySelector(".loading3d");
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  host.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 600);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.47; controls.minDistance = 8; controls.maxDistance = 160;
  controls.enablePan = false;
  const hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03; scene.add(sun, sun.target);
  const world = new THREE.Group(), tokGroup = new THREE.Group(), fx = new THREE.Group(); scene.add(world, tokGroup, fx);
  const hl = new THREE.Mesh(new THREE.PlaneGeometry(CELL * 0.96, CELL * 0.96), new THREE.MeshBasicMaterial({ color: 0xd6aa4e, transparent: true, opacity: 0.35, depthWrite: false }));
  hl.rotation.x = -Math.PI / 2; hl.position.y = 0.12; hl.visible = false; scene.add(hl);

  let trays = 0, fogGroup = new THREE.Group(), fxList = [], seenFx = new Set(), fxReady = false, pickMode = null, fogSig = "";
  scene.add(fogGroup);
  const pickRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 64), new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
  pickRing.rotation.x = -Math.PI / 2; pickRing.position.y = 0.2; pickRing.visible = false; scene.add(pickRing);
  let G = null, lastSig = "", build = 0, free = false, lowWalls = true, selected = null, ambient = null, disposed = false;
  const toks = new Map(); // id -> { root, mixer, actions, mini, target, moving, down, label, labelKey }
  const torches = [];
  const clock = new THREE.Clock();
  const ticks = new Set();

  const cx = c => (c - G.cols / 2 + 0.5) * CELL, cz = r => (r - G.rows / 2 + 0.5) * CELL;
  const inside = h => h.c >= 0 && h.r >= 0 && h.c < G.cols && h.r < G.rows;
  const isWall = (c, r) => { const t = (G.terrain || {})[c + "," + r]; return !!(TERRAIN[t] && TERRAIN[t].wall); };

  function frame(view) {
    if (!G) return;
    const span = Math.max(G.cols, G.rows * 1.3) * CELL;
    controls.target.set(0, 0, 0);
    if (view === "top") camera.position.set(0, span * 1.25, 0.01);
    else camera.position.set(0, span * 0.62, span * 0.62);
    controls.update();
  }
  function setFree(on) {
    free = on; controls.enablePan = on; controls.screenSpacePanning = false; controls.zoomToCursor = on;
    if (!on) { const off = camera.position.clone().sub(controls.target); controls.target.set(0, 0, 0); camera.position.copy(off); }
    const b = ctl.querySelector('[data-cam="mode"]'); b.textContent = on ? "Libre" : "Órbita"; b.setAttribute("aria-pressed", on);
  }
  ctl.querySelectorAll("[data-cam]").forEach(b => b.onclick = () => {
    const k = b.dataset.cam;
    if (k === "center") { setFree(false); frame("persp"); }
    if (k === "top") frame("top");
    if (k === "mode") setFree(!free);
    if (k === "fog") { opts.setFog(!(G && G.fog)); return; }
    if (k === "ruler") { measuring = !measuring; b.setAttribute("aria-pressed", measuring); renderer.domElement.style.cursor = measuring ? "crosshair" : ""; if (!measuring) drawRuler(null); return; }
    if (k === "mute") { sound.setMuted(!sound.muted); b.textContent = sound.muted ? "🔇" : "🔊"; return; }
    if (k === "walls") { lowWalls = !lowWalls; b.textContent = lowWalls ? "Muros bajos" : "Muros altos"; b.setAttribute("aria-pressed", lowWalls); lastSig = ""; sync(); }
  });
  const amb = ctl.querySelector("[data-amb]");
  if (amb) amb.onchange = () => opts.setAmbient && opts.setAmbient(amb.value);
  const snd = ctl.querySelector("[data-snd]"); if (snd) snd.onchange = () => opts.setSound(snd.value);
  ctl.querySelector("[data-vol]").oninput = e => sound.setVolume(+e.target.value);
  // Cámara libre: flechas o WASD mueven el punto de mira por la mesa
  const keys = new Set();
  const kd = e => { if (free && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) keys.add(e.key.toLowerCase()); }, ku = e => keys.delete(e.key.toLowerCase());
  window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);

  // Motas de ambiente (polvo, luciérnagas, polen): se rehacen al cambiar la luz o el tamaño de la mesa
  let moteFx = null, moteKey = "";
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function setMotes() {
    if (!G || calm) return;
    const k = [ambient, G.cols, G.rows].join("|"); if (k === moteKey) return; moteKey = k;
    if (moteFx) { ticks.delete(moteFx.step); moteFx.dispose(); }
    moteFx = motes(scene, G.cols * CELL, G.rows * CELL, ambient); ticks.add(moteFx.step);
  }
  function applyAmbient(k) {
    const a = AMBIENT[k] || AMBIENT.interior;
    if (ambient === k) return; ambient = k;
    hemi.color.set(a.hemi[0]); hemi.groundColor.set(a.hemi[1]); hemi.intensity = a.hemi[2];
    sun.color.set(a.sun[0]); sun.intensity = a.sun[1];
    scene.background = new THREE.Color(a.bg); scene.fog = new THREE.Fog(a.bg, 90, 260);
    torches.forEach(t => (t.base = t.power * 34 * a.torch));
    if (amb) amb.value = k;
  }

  // ---------- Construir el escenario ----------
  async function buildWorld(g) {
    const my = ++build;
    const grp = new THREE.Group(), newTorches = [];
    const W = g.cols * CELL, H = g.rows * CELL;
    // Mesa de madera y marco del tablero
    const wood = woodTex(); wood.repeat.set(3, 3);
    const table = new THREE.Mesh(new THREE.BoxGeometry(W + CELL * 8, 2.5, H + CELL * 8), new THREE.MeshStandardMaterial({ map: wood, roughness: 0.7 }));
    table.position.y = -1.6; table.receiveShadow = true; grp.add(table);
    const frameM = new THREE.Mesh(new THREE.BoxGeometry(W + 1.6, 0.6, H + 1.6), new THREE.MeshStandardMaterial({ color: 0x2b1d12, roughness: 0.6 }));
    frameM.position.y = -0.35; frameM.receiveShadow = true; grp.add(frameM);
    // Suelos: un trozo continuo por tipo de terreno, con su textura y relieve
    const cells = {};
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
      const t = (g.terrain || {})[c + "," + r] || "piedra";
      if (TERRAIN[t] && TERRAIN[t].wall) continue;
      (cells[t] = cells[t] || []).push([c, r]);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    for (const [t, list] of Object.entries(cells)) {
      const ty = TERRAIN[t] || TERRAIN.piedra, y = t === "abismo" ? -1.6 : ty.liquid ? -0.18 : 0.01;
      const mesh = new THREE.Mesh(floorGeometry(list, cx, cz, y), terrainMat(t)); mesh.receiveShadow = true; grp.add(mesh);
      if (ty.liquid || t === "abismo") { // lecho y orillas debajo del agua, la lava o el abismo
        const bed = new THREE.Mesh(floorGeometry(list, cx, cz, y - 0.5), new THREE.MeshStandardMaterial({ color: t === "lava" ? 0x1a0804 : 0x1a2a2a, roughness: 1 })); grp.add(bed);
      }
      if (ty.liquid) { const tex = mesh.material.map; ticks.add(dt => { tex.offset.x += dt * (t === "lava" ? 0.006 : 0.018); tex.offset.y += dt * (t === "lava" ? 0.004 : 0.011); }); }
      if (t === "lava") { const mm = mesh.material; let k = 0; ticks.add(dt => { k += dt; mm.emissiveIntensity = 0.95 + Math.sin(k * 1.7) * 0.25; }); }
    }
    // Muros: bloque de piedra y caras de muro de KayKit hacia las casillas transitables
    const wallGl = await load("dungeon/wall"); if (my !== build) return;
    let wallMesh = null; wallGl && wallGl.scene.traverse(o => { if (o.isMesh && !wallMesh) wallMesh = o; });
    const wh = lowWalls ? 0.32 : 1, faces = [], blocks = [];
    const byType = {};
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
      if (!isWallIn(g, c, r)) continue;
      const wt = (g.terrain || {})[c + "," + r];
      // El vacío no se dibuja salvo que toque suelo (entonces se ve como roca)
      const touches = [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([a, b]) => { const n = (g.terrain || {})[(c + a) + "," + (r + b)]; return c + a >= 0 && r + b >= 0 && c + a < g.cols && r + b < g.rows && !(TERRAIN[n] && TERRAIN[n].wall); });
      if (TERRAIN[wt].void && !touches) continue;
      const kind = TERRAIN[wt].void ? "muroroca" : wt;
      (byType[kind] = byType[kind] || []).push([c, r]);
      if (kind !== "muro") continue;
      [[0, -1, 0], [1, 0, -Math.PI / 2], [0, 1, Math.PI], [-1, 0, Math.PI / 2]].forEach(([dc, dr, rot]) => {
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= g.cols || nr >= g.rows || isWallIn(g, nc, nr)) return;
        faces.push([cx(c) + dc * (CELL / 2 - 0.5), cz(r) + dr * (CELL / 2 - 0.5), rot]);
      });
    }
    for (const [kind, list] of Object.entries(byType)) {
      const hgt = (kind === "seto" ? 2.6 : 4) * wh, mt = terrainMat(kind).clone(); mt.map = mt.map.clone(); mt.map.repeat.set(2, hgt / 2); mt.map.needsUpdate = true;
      mt.roughness = 1; mt.metalness = 0; mt.bumpScale = 0.5;
      const top = new THREE.MeshStandardMaterial({ color: kind === "seto" ? 0x2e4a22 : 0x2a2622, roughness: 1 });
      const bm = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, hgt, CELL), [mt, mt, top, top, mt, mt], list.length);
      list.forEach(([c, r], i) => bm.setMatrixAt(i, m4.compose(v.set(cx(c), hgt / 2, cz(r)), q.identity(), one)));
      bm.castShadow = bm.receiveShadow = true; grp.add(bm);
    }
    if (faces.length && wallMesh) {
      // Las caras de muro de KayKit traen algo de brillo: se dejan mates para que la luz no «resbale» por ellas
      const wmat = (Array.isArray(wallMesh.material) ? wallMesh.material : [wallMesh.material]).map(x => { const c = x.clone(); if ("roughness" in c) c.roughness = 1; if ("metalness" in c) c.metalness = 0; return c; });
      const fm = new THREE.InstancedMesh(wallMesh.geometry, wmat.length === 1 ? wmat[0] : wmat, faces.length);
      const sc = new THREE.Vector3(1, wh, 1);
      faces.forEach(([x, z, rot], i) => fm.setMatrixAt(i, m4.compose(v.set(x, 0, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), sc)));
      fm.castShadow = fm.receiveShadow = true; grp.add(fm);
    }
    // Escenografía
    for (const p of g.props || []) { try {
      if (!propVisible(p, opts.dm)) continue;
      const x = cx(p.c), z = cz(p.r);
      let obj = null;
      if (p.k === "arbol") obj = tree(); else if (p.k === "arbusto") obj = bush(); else if (p.k === "roca") obj = rock(); else if (p.k === "trampa") obj = trap();
      else if (p.k === "hoguera") obj = campfire();
      else if (PROC[p.k]) { obj = PROC[p.k](fire); if (!["telarana"].includes(p.k)) obj.rotation.y = (p.rot || 0) * Math.PI / 2; }
      else if (PROP3D[p.k]) {
        const [path, scale, how] = PROP3D[p.k];
        const gl = await load(path); if (my !== build) return;
        if (!gl) continue;
        obj = gl.scene.clone(true); obj.scale.setScalar(scale);
        if (how === "wall") {
          // Se cuelga en la pared más cercana, mirando hacia la casilla
          const dirs = [[0, -1, 0], [1, 0, -Math.PI / 2], [0, 1, Math.PI], [-1, 0, Math.PI / 2]].filter(([dc, dr]) => isWallIn(g, p.c + dc, p.r + dr));
          const [dc, dr, rot] = dirs[0] || [0, -1, 0];
          obj.rotation.y = rot; obj.position.set(dc * (CELL / 2 - 0.05), p.k === "antorcha" ? 2.2 * wh + 0.6 : 0.2, dr * (CELL / 2 - 0.05));
          if (!dirs.length) obj.position.y = 0.6;
        } else if (how === "door") {
          obj.rotation.y = isWallIn(g, p.c - 1, p.r) || isWallIn(g, p.c + 1, p.r) ? 0 : Math.PI / 2;
          obj.scale.set(1, wh < 1 ? 0.6 : 1, 1);
          // Hoja de madera: cerrada tapa el hueco; abierta, girada contra el marco
          const lh = wh < 1 ? 1.9 : 3.1;
          const leaf = p.k === "rastrillo" ? (() => { const bars = new THREE.Group(), iron = new THREE.MeshStandardMaterial({ color: 0x2e2c2a, metalness: 0.7, roughness: 0.45 }); for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, lh, 6), iron); b.position.set(-0.95 + i * 0.38, 0, 0); bars.add(b); } [-0.3, 0.3].forEach(y => { const b = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 0.08), iron); b.position.set(0, y * lh, 0); bars.add(b); }); return bars; })()
            : new THREE.Mesh(new THREE.BoxGeometry(2.2, lh, 0.22), p.k === "puertasecreta" ? terrainMat("muro") : new THREE.MeshStandardMaterial({ map: woodLeaf(), roughness: 0.8, ...(p.k === "puertallave" ? { color: 0xc8b0a0 } : {}) }));
          const hinge = new THREE.Group(); hinge.position.set(-1.1, 0, 0); leaf.position.set(1.1, (wh < 1 ? 1.9 : 3.1) / 2, 0); hinge.add(leaf);
          hinge.rotation.y = p.open ? -Math.PI / 2 * 0.92 : 0;
          obj.add(hinge);
          obj.traverse(o => { o.userData.door = p.id; });
        } else obj.rotation.y = (p.rot != null ? p.rot : (p.c * 3 + p.r * 5) % 4) * Math.PI / 2;
        if (p.k === "antorcha" || p.k === "velas") {
          const f = fire(p.k === "velas" ? 0.35 : 0.55);
          const wrap = new THREE.Group(); wrap.add(obj);
          obj.updateMatrix();
          const fpos = (p.k === "velas" ? new THREE.Vector3(0.05, 0.95, 0.03) : new THREE.Vector3(0, 0.78, 0.42)).applyMatrix4(obj.matrix);
          f.position.copy(fpos); wrap.add(f);
          wrap.userData.light = { y: fpos.y + 0.4, dx: fpos.x, dz: fpos.z, power: p.k === "velas" ? 0.5 : 1 };
          obj = wrap;
        }
      }
      if (!obj) continue;
      const w = new THREE.Group(); w.add(obj); w.position.set(x, 0, z);
      const ghostly = opts.dm && !propVisible(p, false); // oculto a los jugadores: el máster lo ve translúcido
      w.traverse(o => { o.userData.prop = p.id; if (o.isMesh) { o.castShadow = !ghostly; o.receiveShadow = true; if (ghostly) { o.material = (Array.isArray(o.material) ? o.material : [o.material]).map(mm => { const c = mm.clone(); c.transparent = true; c.opacity = 0.42; return c; }); if (o.material.length === 1) o.material = o.material[0]; } if (o.userData.spin) ticks.add(dt => { o.rotation.y += dt * 1.2; }); } if (o.isPoints) ticks.add(o.userData.tick); });
      if (obj.userData.glow) { const G0 = obj.userData.glow, pl = new THREE.PointLight(G0.color, 14 * G0.power, 9, 1.6); pl.position.set(x, G0.y, z); grp.add(pl); }
      const L = obj.userData.light;
      if (L) {
        const light = new THREE.PointLight(0xff9a4a, 30, 22, 1.6);
        light.position.set(x + (L.dx || 0), L.y, z + (L.dz || 0));
        grp.add(light); newTorches.push({ light, power: L.power, base: 34 * L.power, seed: Math.random() * 10 });
      }
      grp.add(w);
    } catch (e) { console.warn("Pieza sin montar", p.k, e); } }
    if (my !== build) return;
    // Sustituir el escenario anterior de golpe (sin parpadeos)
    world.children.slice().forEach(o => world.remove(o));
    world.add(grp);
    torches.length = 0; torches.push(...newTorches.slice(0, 10));
    newTorches.slice(10).forEach(t => (t.light.visible = false));
    ambient = null; applyAmbient(g.ambient || "interior");
    const span = Math.max(W, H);
    sun.position.set(span * 0.35, span * 0.9, span * 0.5);
    Object.assign(sun.shadow.camera, { left: -span * 0.7, right: span * 0.7, top: span * 0.7, bottom: -span * 0.7, near: 1, far: span * 3 });
    sun.shadow.camera.updateProjectionMatrix();
    loadingEl.hidden = true;
  }
  const isWallIn = (g, c, r) => { const t = (g.terrain || {})[c + "," + r]; return !!(TERRAIN[t] && TERRAIN[t].wall); };

  // ---------- Miniaturas ----------
  async function makeToken(t) {
    const rec = { root: new THREE.Group(), mixer: null, actions: {}, mini: null, target: new THREE.Vector3(), moving: 0, down: false };
    rec.root.userData.tok = t.id;
    const ring = t.kind === "pc" ? 0xd6aa4e : t.kind === "npc" ? 0x7d8fe0 : 0xb33a2e;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.6, 0.28, 40), new THREE.MeshStandardMaterial({ color: 0x1b1714, roughness: 0.5 }));
    base.position.y = 0.14; base.castShadow = base.receiveShadow = true; rec.root.add(base);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.52, 0.09, 8, 48), new THREE.MeshStandardMaterial({ color: ring, emissive: ring, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.4 }));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.28; rec.root.add(rim);
    const sel = new THREE.Mesh(new THREE.RingGeometry(1.75, 2.05, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    sel.rotation.x = -Math.PI / 2; sel.position.y = 0.05; sel.visible = false; rec.root.add(sel); rec.sel = sel;
    const turn = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 7, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    turn.position.y = 3.5; turn.visible = false; rec.root.add(turn); rec.turn = turn;
    // Efecto de herida o curación: onda en la peana y columna de luz
    const pulse = new THREE.Mesh(new THREE.RingGeometry(1.3, 1.75, 48), new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    pulse.rotation.x = -Math.PI / 2; pulse.position.y = 0.32; pulse.visible = false; rec.root.add(pulse); rec.pulse = pulse;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 6, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x6cff8a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.position.y = 3; beam.visible = false; rec.root.add(beam); rec.beam = beam; rec.fxT = 0;
    tokGroup.add(rec.root);
    rec.miniKey = miniFor(t, opts.charOf(t));
    await dressToken(rec, t);
    return rec;
  }
  async function dressToken(rec, t) {
    if (rec.mini) { rec.root.remove(rec.mini); rec.mini = null; rec.mixer = null; rec.actions = {}; }
    const key = rec.miniKey, size = +t.size || 1;
    let mini;
    if (key !== "peana") {
      const gl = await load("minis/" + key);
      if (gl) {
        mini = skClone(gl.scene);
        rec.mixer = new THREE.AnimationMixer(mini);
        gl.animations.forEach(a => (rec.actions[a.name] = rec.mixer.clipAction(a)));
        play(rec, "Idle");
      }
    }
    if (!mini) mini = await card(t);
    mini.scale.multiplyScalar(size * (key === "peana" ? 1.22 : 1.35));
    mini.position.y = 0.28;
    mini.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    { const bb = new THREE.Box3().setFromObject(mini); rec.h = Math.max(2.5, bb.max.y - bb.min.y + 0.28); } // altura real de la figura (para la placa del nombre)
    rec.tilt = 0; rec.hitT = 0;
    if (t.hidden) mini.traverse(o => { if (o.isMesh) { const see = m => { const c = m.clone(); c.transparent = true; c.opacity = 0.4; return c; }; o.material = Array.isArray(o.material) ? o.material.map(see) : see(o.material); if (mini.userData.mats) mini.userData.mats = Array.isArray(o.material) ? [...new Set(o.material)] : mini.userData.mats; } });
    rec.root.add(mini); rec.mini = mini; rec.condKey = null;
  }
  // Peana de cartón: tarjeta gruesa con la ilustración por las dos caras, canto pintado y placa con el nombre
  const KIND = { pc: ["#d6aa4e", "#5a4320"], npc: ["#7d8fe0", "#2a3160"], foe: ["#b33a2e", "#4a1712"] };
  const loadImg = src => new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  async function card(t) {
    const d = opts.decorate(t) || {}, [ring, edge] = KIND[t.kind] || KIND.foe;
    const W = 512, H = 680, c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d");
    const pg = g.createLinearGradient(0, 0, 0, H); pg.addColorStop(0, "#efe2c2"); pg.addColorStop(1, "#cbb487");
    g.fillStyle = pg; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(90,60,30,${Math.random() * 0.06})`; g.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
    const art = d.portrait || t.img ? await getImage(d.portrait || t.img) : null;
    const ch = opts.charOf(t);
    const im = art ? await loadImg(art) : await loadImg(siluetaURL(t.icon || (ch ? siluetaFor(`${ch.cls} ${ch.species}`) : siluetaFor(t.name))));
    const ax = 30, ay = 30, aw = W - 60, ah = H - 150;
    if (im && art) { g.save(); g.beginPath(); g.rect(ax, ay, aw, ah); g.clip(); const k = Math.max(aw / im.width, ah / im.height); g.drawImage(im, ax + (aw - im.width * k) / 2, ay + (ah - im.height * k) / 2, im.width * k, im.height * k); g.restore(); }
    else {
      const vg = g.createRadialGradient(W / 2, ah / 2 + ay, 40, W / 2, ah / 2 + ay, ah * 0.7); vg.addColorStop(0, "rgba(255,250,235,.0)"); vg.addColorStop(1, ring + "55");
      g.fillStyle = vg; g.fillRect(ax, ay, aw, ah);
      if (im) g.drawImage(im, W / 2 - 190, ay + ah / 2 - 190, 380, 380);
    }
    g.lineWidth = 6; g.strokeStyle = ring; g.strokeRect(ax, ay, aw, ah);
    g.lineWidth = 18; g.strokeStyle = edge; g.strokeRect(9, 9, W - 18, H - 18);
    g.fillStyle = edge; g.fillRect(18, H - 112, W - 36, 94);
    g.fillStyle = "#f3e7c8"; g.textAlign = "center"; g.font = "bold 46px Georgia";
    let name = d.name || t.name || "?"; while (g.measureText(name).width > W - 70 && name.length > 4) name = name.slice(0, -2) + "…";
    g.fillText(name, W / 2, H - 50);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }), side = new THREE.MeshStandardMaterial({ color: edge, roughness: 0.8 });
    const CW = 3.0, CH = 4.0;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(CW, CH, 0.09), [side, side, side, side, face, face]);
    mesh.position.y = CH / 2; mesh.castShadow = true;
    const clip = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.28, 0.34), new THREE.MeshStandardMaterial({ color: 0x14110e, roughness: 0.5 }));
    clip.position.y = 0.1;
    const pivot = new THREE.Group(); pivot.add(mesh, clip);
    const grp = new THREE.Group(); grp.add(pivot); grp.userData.card = true; grp.userData.pivot = pivot; grp.userData.mats = [face, side];
    return grp;
  }
  function play(rec, name, once) {
    const a = rec.actions[name] || rec.actions.Idle || Object.values(rec.actions)[0];
    if (!a || rec.current === a) return;
    a.reset(); a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = !!once;
    if (rec.current) a.crossFadeFrom(rec.current, 0.25, false);
    a.play(); rec.current = a;
  }

  async function syncTokens(list) {
    const vis = list.filter(t => opts.dm || !t.hidden), ids = new Set(vis.map(t => t.id));
    for (const [id, rec] of toks) if (!ids.has(id)) { tokGroup.remove(rec.root); toks.delete(id); }
    const pcs = vis.filter(t => t.kind === "pc"), foes = vis.filter(t => t.kind !== "pc");
    for (const t of vis) {
      let rec = toks.get(t.id);
      if (!rec) {
        rec = { pending: true }; toks.set(t.id, rec);
        rec = await makeToken(t); if (disposed) return;
        toks.set(t.id, rec);
        rec.root.position.set(cx(t.c), 0, cz(t.r)); rec.target.copy(rec.root.position);
      } else if (rec.pending) continue;
      const want = miniFor(t, opts.charOf(t)), dd = opts.decorate(t) || {};
      const dressKey = [want, t.hidden, +t.size || 1, t.img, t.icon, dd.portrait, dd.name || t.name].join("|");
      if (dressKey !== rec.dressKey) { const first = !rec.dressKey; rec.dressKey = dressKey; if (!first || want !== rec.miniKey) { rec.miniKey = want; await dressToken(rec, t); } }
      rec.hidden = !!t.hidden; rec.size = +t.size || 1;
      const tx = cx(t.c), tz = cz(t.r);
      if (rec.target.x !== tx || rec.target.z !== tz) { rec.target.set(tx, 0, tz); rec.moving = 1; play(rec, "Walking_A"); }
      // Mirar hacia el otro bando
      const others = t.kind === "pc" ? foes : pcs;
      if (others.length) { let mx = 0, mz = 0; others.forEach(o => { mx += cx(o.c); mz += cz(o.r); }); rec.face = Math.atan2(mx / others.length - tx, mz / others.length - tz); }
      const hp = opts.hpOf(t), down = !!hp && hp.cur <= 0;
      if (hp && rec.lastHp != null && hp.cur < rec.lastHp && !down) {
        rec.hitT = 1; if (fxReady) sound.play("hit");
        if (rec.mixer) { play(rec, "Hit_A", true); setTimeout(() => { if (!rec.down) play(rec, "Idle"); }, 700); }
      }
      if (hp && rec.lastHp != null && hp.cur !== rec.lastHp && fxReady) {
        const dHp = hp.cur - rec.lastHp, top = rec.root.position.clone(); top.y = 2.6 * (+t.size || 1); top.x += 1.1;
        setTimeout(() => { if (!disposed) fxList.push(floatText(scene, top, (dHp > 0 ? "+" : "−") + Math.abs(dHp), dHp > 0 ? "#7dff9a" : "#ff5a48", Math.abs(dHp) >= 15, 1.35)); }, 450);
      }
      if (hp && rec.lastHp != null && hp.cur !== rec.lastHp) {
        rec.fxT = 1; rec.fxHeal = hp.cur > rec.lastHp;
        rec.pulse.material.color.set(rec.fxHeal ? 0x5cff7a : 0xff3a2a); rec.beam.material.color.set(rec.fxHeal ? 0x6cff8a : 0xff4a2a);
      }
      rec.lastHp = hp ? hp.cur : null;
      if (down !== rec.down) {
        if (down && rec.lastHp != null) sound.play("down");
        rec.down = down; play(rec, down ? "Death_A" : "Idle", down);
        if (rec.mini && rec.mini.userData.mats) rec.mini.userData.mats.forEach(m => m.color.setScalar(down ? 0.45 : 1));
      }
      // Estados: anillos de color en la peana, etiqueta escrita y algunos efectos en la figura
      const conds = t.conds || [], condKey = JSON.stringify(conds);
      if (condKey !== rec.condKey) {
        rec.condKey = condKey;
        (rec.rings || []).forEach(o => rec.root.remove(o)); rec.rings = [];
        conds.forEach((cd, i) => {
          const e = estado(cd.id || cd); if (!e) return;
          const ring = new THREE.Mesh(new THREE.TorusGeometry(1.7 + i * 0.16, 0.075, 8, 48), new THREE.MeshStandardMaterial({ color: e.c, emissive: e.c, emissiveIntensity: 0.35, roughness: 0.4 }));
          ring.rotation.x = Math.PI / 2; ring.position.y = 0.1 + i * 0.03; rec.root.add(ring); rec.rings.push(ring);
        });
        if (rec.tag) { rec.root.remove(rec.tag); rec.tag = null; }
        if (conds.length) { rec.tag = condTag(conds); rec.root.add(rec.tag); }
        const has = id => conds.some(cd => (cd.id || cd) === id);
        rec.prone = has("derribado") || has("inconsciente");
        const ghost = has("invisible"), stone = has("petrificado");
        if (rec.mini) rec.mini.traverse(o => { if (o.isMesh) {
          if (!o.userData.baseMat) o.userData.baseMat = o.material;
          if (ghost || stone) { const m = (Array.isArray(o.userData.baseMat) ? o.userData.baseMat : [o.userData.baseMat]).map(x => { const c = x.clone(); if (ghost) { c.transparent = true; c.opacity = 0.35; } if (stone && c.color) c.color.set(0x8c8c8c); return c; }); o.material = Array.isArray(o.userData.baseMat) ? m : m[0]; }
          else o.material = o.userData.baseMat;
        } });
      }
      const d = opts.decorate(t) || {};
      rec.turn.visible = !!d.isTurn;
      rec.sel.visible = selected === t.id;
      const hl = selected === t.id || !!d.isTurn, exact = opts.dm || t.kind === "pc", top = (rec.h || 4) + 0.35;
      const pctQ = hp ? (exact ? hp.cur / Math.max(1, hp.max) : (r => r > 0.75 ? 1 : r > 0.5 ? 0.7 : r > 0.25 ? 0.45 : r > 0 ? 0.18 : 0)(hp.cur / Math.max(1, hp.max))) : null;
      const word = hp && !exact ? (pctQ >= 1 ? "Ileso" : pctQ >= 0.7 ? "Herido" : pctQ >= 0.45 ? "Malherido" : pctQ > 0 ? "Al borde" : "Fuera de combate") : "";
      const plateKey = JSON.stringify([d.name || t.name, pctQ, exact && hp && hp.cur, exact && hp && hp.max, hl, word]);
      if (plateKey !== rec.barKey) {
        if (rec.bar) { rec.root.remove(rec.bar); rec.bar.material.map.dispose(); rec.bar.material.dispose(); rec.bar = null; }
        rec.bar = namePlate(t.kind === "pc" ? shortName(d.name || t.name) : plateName(d.name || t.name), pctQ, hp ? (exact ? `${hp.cur} / ${hp.max} PG` : word) : "", t.kind === "pc" ? "#d6aa4e" : t.kind === "npc" ? "#7d8fe0" : "#b33a2e", hl);
        rec.root.add(rec.bar); rec.barKey = plateKey;
      }
      rec.bar.position.y = top;
      if (rec.tag) rec.tag.position.y = top + 1.9;
    }
  }

  // Las obras se hacen de una en una: si el máster edita mientras tanto, se monta la última versión al acabar
  // (antes, cada cambio cancelaba la obra en curso y, editando seguido, los jugadores nunca veían la mesa)
  let building = false, pendingG = null;
  function queueBuild(g) {
    if (building) { pendingG = g; return; }
    building = true;
    Promise.resolve().then(() => buildWorld(g)).catch(e => console.warn("Mesa 3D: no se pudo montar del todo", e))
      .finally(() => { building = false; loadingEl.hidden = true; if (pendingG && !disposed) { const n = pendingG; pendingG = null; queueBuild(n); } });
  }
  function sync() {
    if (disposed) return;
    const m = opts.model(); if (!m || !m.grid) return;
    const first = !G; G = m.grid;
    const sig = JSON.stringify([G.cols, G.rows, G.terrain, G.props, lowWalls]);
    if (sig !== lastSig) { lastSig = sig; queueBuild(G); if (first) frame("persp"); }
    applyAmbient(G.ambient || "interior"); setMotes();
    sound.ambient(G.sound || "");
    if (snd) snd.value = G.sound || "";
    const fb = ctl.querySelector('[data-cam="fog"]'); if (fb) { fb.setAttribute("aria-pressed", !!G.fog); fb.textContent = G.fog ? "Niebla: sí" : "Niebla: no"; }
    syncTokens(m.tokens).then(() => updateFog(m));
    updateAim(m);
    // Efectos lanzados (en la mesa o en la ficha de quien lanza). Los ve todo el mundo; no se repiten al entrar más tarde.
    const all = [G.fx, ...m.tokens.map(t => t.fx && { ...t.fx, caster: t.id })].filter(Boolean);
    for (const fx of all) {
      if (seenFx.has(fx.id)) continue;
      seenFx.add(fx.id);
      if (!(fxReady || Date.now() - fx.at < 6000)) continue;
      const caster = fx.caster && m.tokens.find(t => t.id === fx.caster);
      const from = caster ? { c: caster.c, r: caster.r } : fx.to;
      sound.fx(fx.k);
      fxList.push(playEffect(scene, fx.k, new THREE.Vector3(cx(from.c), 0, cz(from.r)), new THREE.Vector3(cx(fx.to.c), 0, cz(fx.to.r)), CELL));
      const r = fx.caster && toks.get(fx.caster);
      if (r && r.mixer) { play(r, "Spellcast_Shoot", true); setTimeout(() => { if (!r.down) play(r, "Idle"); }, 900); }
      else if (r) r.hitT = 0.5;
    }
    // Los dados ya no ruedan sobre el tablero: salen en la cajetilla (dicecam.js)
    fxReady = true;
    refreshReach();
  }

  // ---------- Golpes: lo que pasa en cada ataque, visto por todos ----------
  function playEvents(evs) {
    for (const e of evs) setTimeout(() => {
      if (disposed || !G) return;
      const m = opts.model(), B = toks.get(e.to), tb = m.tokens.find(t => t.id === e.to);
      if (!B || !B.root || !tb || (tb.hidden && !opts.dm)) return;
      const top = B.root.position.clone(); top.y = (B.h || 4) + 1.6;
      const say = () => fxList.push(floatText(scene, top, RES_TEXT[e.res], RES_COLOR[e.res], e.res === "crit"));
      const A = e.from && toks.get(e.from), ta = e.from && m.tokens.find(t => t.id === e.from);
      if (e.type === "atk" && A && A.root && ta && e.from !== e.to) {
        const melee = cellDist(ta, tb) <= 1 + Math.max(+ta.size || 1, +tb.size || 1);
        if (A.mixer) { play(A, e.magic ? "Spellcast_Shoot" : "1H_Melee_Attack_Chop", true); setTimeout(() => { if (!A.down) play(A, "Idle"); }, 800); } else A.hitT = Math.max(A.hitT || 0, 0.35);
        sound.play(melee && !e.magic ? "whoosh" : e.magic ? "magic" : "twang");
        fxList.push(strike(scene, A.root.position.clone(), B.root.position.clone(), { melee, magic: e.magic, color: e.color, res: e.res,
          onHit: () => { B.hitT = Math.max(B.hitT || 0, e.res === "crit" ? 1 : 0.7); if (e.res === "crit") sound.play("crit"); } }));
        setTimeout(() => { if (!disposed) say(); }, melee && !e.magic ? 180 : 420);
      } else say();
    }, e.delay || 0);
  }

  // ---------- Línea de puntería: distancia, alcance y cobertura hasta el objetivo ----------
  const aimLine = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0x7ec850, transparent: true, opacity: 0.85, depthTest: false }));
  aimLine.renderOrder = 9; aimLine.visible = false; scene.add(aimLine);
  const aimRing = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.2, 40), new THREE.MeshBasicMaterial({ color: 0x7ec850, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
  aimRing.rotation.x = -Math.PI / 2; aimRing.position.y = 0.08; aimRing.visible = false; scene.add(aimRing);
  let aimLabel = null, aimKey = "";
  function updateAim(m) {
    const a = opts.aim ? opts.aim() : null;
    const A = a && m.tokens.find(t => t.id === a.from), B = a && m.tokens.find(t => t.id === a.to);
    if (!A || !B || (!opts.dm && B.hidden)) { aimLine.visible = aimRing.visible = false; if (aimLabel) aimLabel.visible = false; return; }
    const p0 = new THREE.Vector3(cx(A.c), 1.6, cz(A.r)), p1 = new THREE.Vector3(cx(B.c), 1.6, cz(B.r)), d = p1.clone().sub(p0), len = d.length();
    aimLine.visible = aimRing.visible = true;
    aimLine.position.copy(p0).add(p1).multiplyScalar(0.5); aimLine.scale.set(1, len, 1);
    aimLine.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    aimLine.material.color.set(a.color); aimRing.material.color.set(a.color); aimRing.position.x = p1.x; aimRing.position.z = p1.z;
    const key = a.label + a.color;
    if (key !== aimKey) {
      aimKey = key; if (aimLabel) scene.remove(aimLabel);
      const c = document.createElement("canvas"), g = c.getContext("2d"); g.font = "bold 26px Georgia";
      const w = Math.min(1000, g.measureText(a.label).width + 40); c.width = w; c.height = 50;
      g.font = "bold 26px Georgia"; g.fillStyle = "rgba(15,12,10,.88)"; g.beginPath(); g.roundRect(2, 2, w - 4, 46, 12); g.fill();
      g.strokeStyle = a.color; g.lineWidth = 3; g.stroke(); g.fillStyle = "#fff"; g.textAlign = "center"; g.fillText(a.label, w / 2, 34);
      aimLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
      aimLabel.scale.set(w / 50 * 1.1, 1.1, 1); aimLabel.renderOrder = 12; scene.add(aimLabel);
    }
    aimLabel.visible = true; aimLabel.position.copy(p0).add(p1).multiplyScalar(0.5).setY(3.2);
  }

  // ---------- Niebla de guerra (solo para los jugadores) ----------
  function updateFog(m) {
    const on = !opts.dm && G && G.fog && opts.chars;
    const vis = on ? computeVision(G, m.tokens, opts.chars()) : null;
    const exp = on ? explored((G.scene || "mesa") + "", vis) : null;
    const sig = on ? [...vis].join(";") + "|" + exp.size + "|" + G.cols + "x" + G.rows : "off";
    for (const [id, rec] of toks) {
      if (!rec.root) continue;
      const t = m.tokens.find(k => k.id === id);
      rec.root.visible = !on || !t || t.kind === "pc" || vis.has(t.c + "," + t.r);
    }
    if (sig === fogSig) return; fogSig = sig;
    fogGroup.children.slice().forEach(o => { fogGroup.remove(o); o.geometry.dispose(); });
    if (!on) return;
    const black = [], dim = [];
    for (let r = 0; r < G.rows; r++) for (let c = 0; c < G.cols; c++) { const k = c + "," + r; if (!exp.has(k)) black.push([c, r]); else if (!vis.has(k)) dim.push([c, r]); }
    const m4 = new THREE.Matrix4();
    const mk = (list, mat, h) => { if (!list.length) return; const im = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, h, CELL), mat, list.length); list.forEach(([c, r], i) => im.setMatrixAt(i, m4.makeTranslation(cx(c), h / 2 - 0.05, cz(r)))); fogGroup.add(im); };
    mk(black, FOG_BLACK, 7.5); mk(dim, FOG_DIM, 6);
  }
  const FOG_BLACK = new THREE.MeshStandardMaterial({ color: 0x0c0a08, roughness: 1 });
  const FOG_DIM = new THREE.MeshBasicMaterial({ color: 0x05070c, transparent: true, opacity: 0.62, depthWrite: false });

  // ---------- Alcance del movimiento: casillas a las que llegas este turno ----------
  const reachGrp = new THREE.Group(); scene.add(reachGrp);
  let reachFor = null, reachR = null, pathMesh = null;
  const RMAT = {
    walk: new THREE.MeshBasicMaterial({ color: 0x6fd0e8, transparent: true, opacity: 0.17, depthWrite: false }),
    dif: new THREE.MeshBasicMaterial({ color: 0xe0b45a, transparent: true, opacity: 0.22, depthWrite: false }),
    dash: new THREE.MeshBasicMaterial({ color: 0xa88ae0, transparent: true, opacity: 0.12, depthWrite: false })
  };
  const tileGeo = new THREE.PlaneGeometry(CELL * 0.92, CELL * 0.92).rotateX(-Math.PI / 2);
  function showReach(id) {
    reachGrp.clear(); reachFor = id; reachR = id && opts.reach ? opts.reach(id) : null;
    if (!reachR || !G) return;
    const groups = { walk: [], dif: [], dash: [] };
    reachR.cells.forEach((x, k) => { if (!x.cost || x.occ) return; const [c, r] = k.split(",").map(Number); groups[x.dash ? "dash" : x.dif ? "dif" : "walk"].push([c, r]); });
    const m4 = new THREE.Matrix4();
    for (const [k, list] of Object.entries(groups)) {
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(tileGeo, RMAT[k], list.length); im.renderOrder = 2;
      list.forEach(([c, r], i) => im.setMatrixAt(i, m4.makeTranslation(cx(c), 0.07, cz(r)))); reachGrp.add(im);
    }
    // La casilla de origen queda marcada: siempre puedes volver a ella
    const o = reachR.from, ring = new THREE.Mesh(new THREE.RingGeometry(CELL * 0.36, CELL * 0.46, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.75, depthWrite: false }));
    ring.position.set(cx(o.c), 0.09, cz(o.r)); reachGrp.add(ring);
  }
  function showPath(h) {
    if (pathMesh) { reachGrp.remove(pathMesh); pathMesh.geometry.dispose(); pathMesh = null; }
    if (!reachR || !h) return;
    const p = pathTo(reachR, h.c, h.r); if (p.length < 2) return;
    const x = reachR.cells.get(h.c + "," + h.r);
    const curve = new THREE.CatmullRomCurve3(p.map(q => new THREE.Vector3(cx(q.c), 0.3, cz(q.r))), false, "centripetal", 0.2);
    pathMesh = new THREE.Mesh(new THREE.TubeGeometry(curve, p.length * 6, 0.16, 6), new THREE.MeshBasicMaterial({ color: x && x.dash ? 0xc8a8ff : 0xffe2a0, transparent: true, opacity: 0.85, depthWrite: false }));
    pathMesh.renderOrder = 3; reachGrp.add(pathMesh);
  }

  // ---------- Regla: medir distancias (cada diagonal cuenta 1,5 m) ----------
  let measuring = false, measure = null; const rulerG = new THREE.Group(); scene.add(rulerG);
  const rulerMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95, depthTest: false });
  function drawRuler(a, b) {
    rulerG.children.slice().forEach(o => { rulerG.remove(o); if (o.geometry) o.geometry.dispose(); if (o.material && o.material !== rulerMat) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    if (!a) return;
    const A = new THREE.Vector3(cx(a.c), 0.45, cz(a.r)), B = new THREE.Vector3(cx(b.c), 0.45, cz(b.r)), len = A.distanceTo(B);
    [A, B].forEach(p => { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 24), rulerMat); d.position.copy(p); d.renderOrder = 12; rulerG.add(d); });
    if (len > 0.01) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, len, 8), rulerMat); l.position.copy(A).lerp(B, 0.5); l.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()); l.renderOrder = 12; rulerG.add(l); }
    const n = dist(a, b), c = document.createElement("canvas"), g = c.getContext("2d"); c.width = 256; c.height = 72;
    g.fillStyle = "rgba(17,14,12,.92)"; g.strokeStyle = "#ffe08a"; g.lineWidth = 3; g.beginPath(); g.roundRect(4, 4, 248, 64, 32); g.fill(); g.stroke();
    g.fillStyle = "#ffe08a"; g.font = "700 34px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(`${(n * 1.5).toLocaleString("es-ES")} m · ${n}`, 128, 38);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })); sp.scale.set(7, 1.97, 1); sp.position.copy(A).lerp(B, 0.5); sp.position.y = 2.4; sp.renderOrder = 13; rulerG.add(sp);
  }

  // ---------- Interacción: seleccionar y arrastrar miniaturas ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  let drag = null, down = null;
  const setNdc = e => { const r = renderer.domElement.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); };
  const cellAt = () => { if (!ray.ray.intersectPlane(ground, hit)) return null; return { c: Math.floor(hit.x / CELL + G.cols / 2), r: Math.floor(hit.z / CELL + G.rows / 2) }; };
  const tokenAt = () => {
    const hits = ray.intersectObjects(tokGroup.children, true);
    for (const h of hits) { let o = h.object; while (o && !o.userData.tok) o = o.parent; if (o) return o.userData.tok; }
    return null;
  };
  function pickPreview(e) {
    setNdc(e); const h = cellAt(); if (!h || !inside(h)) { pickRing.visible = hl.visible = false; return; }
    const R = pickMode.area;
    if (R) { pickRing.visible = true; pickRing.scale.setScalar((R + 0.5) * CELL); pickRing.position.x = cx(h.c); pickRing.position.z = cz(h.r); hl.visible = false; }
    else { hl.visible = true; hl.position.x = cx(h.c); hl.position.z = cz(h.r); hl.material.color.set(0xff8a3a); }
  }
  renderer.domElement.addEventListener("pointermove", e => { if (pickMode && !drag) pickPreview(e); });
  renderer.domElement.addEventListener("pointerdown", e => {
    if (!G) return;
    if (pickMode) { setNdc(e); const h = cellAt(); const pm = pickMode; pickMode = null; pickRing.visible = hl.visible = false; renderer.domElement.style.cursor = ""; if (h && inside(h)) pm.cb(h); else pm.cb(null); e.stopPropagation(); return; }
    if (measuring) { setNdc(e); const h = cellAt(); if (h && inside(h)) { measure = { a: h, b: h }; drawRuler(h, h); controls.enabled = false; renderer.domElement.setPointerCapture(e.pointerId); } return; }
    setNdc(e); down = { x: e.clientX, y: e.clientY };
    const id = tokenAt(), t = id && opts.model().tokens.find(k => k.id === id);
    if (!t && opts.dm) {
      const dh = ray.intersectObjects(world.children, true).find(h => h.object.userData.door);
      if (dh) { const did = dh.object.userData.door; opts.mutate("board", mm => { const pr = (mm.grid.props || []).find(x => x.id === did); if (pr) pr.open = !pr.open; }); sound.play("door"); return; }
      const ph = opts.onProp && ray.intersectObjects(world.children, true).find(h => h.object.userData.prop);
      if (ph) { const pr = (G.props || []).find(x => x.id === ph.object.userData.prop); if (pr && (PROPS[pr.k] || {}).loot || pr && (PROPS[pr.k] || {}).trap || pr && pr.hidden || pr && pr.label) { opts.onProp(pr); return; } }
    }
    if (t && opts.canMove(t)) { drag = { id, from: { c: t.c, r: t.r }, moved: false, t0: performance.now() }; controls.enabled = false; renderer.domElement.setPointerCapture(e.pointerId); if (reachFor !== id) showReach(id); }
    else if (t) down.tok = id;
  });
  renderer.domElement.addEventListener("pointermove", e => {
    if (measure) { setNdc(e); const h = cellAt(); if (h && inside(h) && (h.c !== measure.b.c || h.r !== measure.b.r)) { measure.b = h; drawRuler(measure.a, h); } return; }
    if (!drag) return;
    setNdc(e);
    // Un clic con algo de temblor no es un arrastre: hace falta desplazar el ratón de verdad
    if (!drag.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 16) return;
    drag.moved = true;
    const h = cellAt(); if (!h) return;
    const rec = toks.get(drag.id);
    if (rec && rec.root) { rec.root.position.set(hit.x, 1.2, hit.z); rec.target.copy(rec.root.position); }
    const ok = reachR ? reachR.cells.has(h.c + "," + h.r) && !reachR.cells.get(h.c + "," + h.r).occ : !isWall(h.c, h.r);
    if (inside(h)) { hl.visible = true; hl.position.x = cx(h.c); hl.position.z = cz(h.r); hl.material.color.set(ok ? 0xd6aa4e : 0xb33a2e); }
    if (!drag.last || drag.last.c !== h.c || drag.last.r !== h.r) { drag.last = h; showPath(h); }
    const d = dist(drag.from, h);
    tip.hidden = false; tip.textContent = reachR ? moveHint(reachR, h.c, h.r) : `${(d * 1.5).toLocaleString("es-ES")} m (${d} casillas)`;
    const r = host.getBoundingClientRect(); tip.style.left = (e.clientX - r.left + 14) + "px"; tip.style.top = (e.clientY - r.top + 14) + "px";
  });
  const up = e => {
    controls.enabled = true; hl.visible = false; tip.hidden = true;
    if (measure) { measure = null; return; } // la medida se queda a la vista hasta la siguiente
    if (drag) {
      const d = drag; drag = null;
      setNdc(e); const h = cellAt(), rec = toks.get(d.id);
      // Seleccionar no mueve: si apenas se arrastró, o se soltó en su casilla, la figura vuelve a su sitio
      const quick = performance.now() - d.t0 < 250 && h && dist(d.from, h) <= 1;
      if (!d.moved || quick || (h && h.c === d.from.c && h.r === d.from.r)) {
        if (rec && rec.root) { rec.root.position.set(cx(d.from.c), 0, cz(d.from.r)); rec.target.copy(rec.root.position); }
        showPath(null); select(d.id); return;
      }
      const shut = (G.props || []).some(pr => isDoor(pr) && !pr.open && pr.c === h?.c && pr.r === h?.r);
      if (h && inside(h) && !isWall(h.c, h.r) && (!shut || opts.dm)) {
        if (rec && rec.root) { rec.root.position.set(cx(h.c), 0, cz(h.r)); rec.target.copy(rec.root.position); }
        opts.mutate("token", mm => { const k = mm.tokens.find(z => z.id === d.id); if (k) { k.c = h.c; k.r = h.r; } });
      } else if (rec && rec.root) { rec.root.position.set(cx(d.from.c), 0, cz(d.from.r)); rec.target.copy(rec.root.position); }
      select(d.id); return;
    }
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) select(down.tok || null);
    down = null;
  };
  renderer.domElement.addEventListener("pointerup", up);
  renderer.domElement.addEventListener("pointercancel", () => { showPath(null); drag = null; controls.enabled = true; hl.visible = false; tip.hidden = true; });
  function select(id) { selected = id; opts.onSelect && opts.onSelect(id); sync(); }
  function refreshReach() { try { if (drag) return; const id = selected && opts.reach && opts.reach(selected) ? selected : null; showReach(id); showPath(null); } catch (e) { /* aún montándose */ } }

  // ---------- Bucle de dibujo ----------
  function resize() {
    const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(host);
  const fwd = new THREE.Vector3(), side = new THREE.Vector3();
  renderer.setAnimationLoop(() => {
    if (!host.isConnected) return dispose();
    const dt = Math.min(0.05, clock.getDelta()), time = clock.elapsedTime;
    if (free && keys.size) {
      camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize(); side.crossVectors(fwd, camera.up);
      const s = dt * 30, mv = new THREE.Vector3();
      if (keys.has("w") || keys.has("arrowup")) mv.add(fwd); if (keys.has("s") || keys.has("arrowdown")) mv.sub(fwd);
      if (keys.has("d") || keys.has("arrowright")) mv.add(side); if (keys.has("a") || keys.has("arrowleft")) mv.sub(side);
      mv.multiplyScalar(s); controls.target.add(mv); camera.position.add(mv);
    }
    controls.update();
    ticks.forEach(f => f(dt));
    if (fxList.length) fxList = fxList.filter(f => f(dt));
    // Luz de antorcha: una respiración lenta y suave (el parpadeo rápido hacía «bailar» los reflejos de las paredes)
    torches.forEach(t => { t.light.intensity = t.base * (0.95 + 0.035 * Math.sin(time * 2.1 + t.seed) + 0.015 * Math.sin(time * 4.7 + t.seed * 2)); });
    for (const rec of toks.values()) {
      if (!rec.root) continue;
      if (rec.mixer) rec.mixer.update(dt);
      if (rec.moving && (!drag || drag.id !== rec.root.userData.tok)) {
        const p = rec.root.position, d = rec.target.clone().sub(p); d.y = 0;
        const len = d.length();
        if (len < 0.08) { p.copy(rec.target); rec.moving = 0; if (!rec.down) play(rec, "Idle"); }
        else { p.add(d.multiplyScalar(Math.min(1, dt * 7 / Math.max(1, len / 4)))); rec.root.rotation.y = Math.atan2(rec.target.x - p.x, rec.target.z - p.z); }
      } else if (rec.face != null && !drag) {
        const diff = ((rec.face - rec.root.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        rec.root.rotation.y += diff * Math.min(1, dt * 4);
      }
      if (rec.fxT > 0) {
        rec.fxT = Math.max(0, rec.fxT - dt / 1.1); const k = 1 - rec.fxT;
        rec.pulse.visible = rec.beam.visible = rec.fxT > 0;
        rec.pulse.scale.setScalar(1 + k * 1.4); rec.pulse.material.opacity = rec.fxT * 0.95;
        rec.beam.material.opacity = Math.sin(Math.min(1, k * 1.4) * Math.PI) * (rec.fxHeal ? 0.32 : 0.22);
        rec.beam.scale.set(1 - k * 0.3, rec.fxHeal ? 0.6 + k * 0.7 : 1, 1 - k * 0.3); rec.beam.position.y = rec.fxHeal ? 1.8 + k * 2.5 : 3;
        if (rec.bar) { const k = 1 + 0.18 * rec.fxT; rec.bar.scale.set(PLATE_H * 640 / 150 * k, PLATE_H * k, 1); }
      }
      if (rec.sel && rec.sel.visible) rec.sel.material.opacity = 0.55 + 0.3 * Math.sin(time * 4);
      if (rec.turn && rec.turn.visible) rec.turn.material.opacity = 0.09 + 0.06 * Math.sin(time * 3);
      if (rec.mini && rec.mini.userData.card) {
        const pv = rec.mini.userData.pivot;
        if (!rec.down) rec.mini.rotation.y = Math.atan2(camera.position.x - rec.root.position.x, camera.position.z - rec.root.position.z) - rec.root.rotation.y;
        const want = rec.down ? -1.5 : rec.prone ? -1.1 : rec.moving ? -0.2 : 0;
        rec.tilt += (want - rec.tilt) * Math.min(1, dt * (rec.down ? 5 : 8));
        rec.hitT = Math.max(0, rec.hitT - dt * 1.6);
        pv.rotation.x = rec.tilt; pv.rotation.z = Math.sin(time * 26) * 0.22 * rec.hitT;
      } else if (rec.mini) {
        if (rec.hitT > 0) rec.hitT = Math.max(0, rec.hitT - dt * 1.6);
        const want = rec.prone && !rec.down ? -1.35 : 0; rec.mini.rotation.x += (want - rec.mini.rotation.x) * Math.min(1, dt * 6);
      }
    }
    renderer.render(scene, camera);
  });
  function dispose() {
    if (disposed) return; disposed = true;
    renderer.setAnimationLoop(null); ro.disconnect(); sound.ambient(""); controls.dispose(); renderer.dispose();
    window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku);
  }

  resize(); sync();
  // Para pruebas: posición en pantalla de una miniatura
  host.__screenOf = id => { const r = toks.get(id); if (!r || !r.root) return null; const v = r.root.position.clone(); v.y = 1; v.project(camera); const b = renderer.domElement.getBoundingClientRect(); return [b.left + (v.x + 1) / 2 * b.width, b.top + (1 - v.y) / 2 * b.height]; };
  const esc = e => { if (e.key === "Escape" && pickMode) { const pm = pickMode; pickMode = null; pickRing.visible = hl.visible = false; renderer.domElement.style.cursor = ""; pm.cb(null); } };
  window.addEventListener("keydown", esc);
  return {
    render: sync, fit: () => frame("persp"), select, resize, dispose, playEvents, get selected() { return selected; },
    /** Elegir casilla objetivo (con área opcional, en casillas). */
    pick(area, cb) { pickMode = { area, cb }; renderer.domElement.style.cursor = "crosshair"; },
    has3d: true
  };
}

export const webglOK = (() => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch (e) { return false; } })();
