// Reglas oficiales en español: SRD 5.2.1 (CC BY 4.0, ver CREDITS.md). Se cargan solo cuando hacen falta.
const cache = {};
export const srdNow = {}; // lo ya cargado, para usarlo sin esperar
export function srd(kind) {
  if (!cache[kind]) cache[kind] = fetch(`js/data/srd/${kind}.json`).then(r => r.json()).then(d => (srdNow[kind] = d));
  return cache[kind];
}
export const preload = () => setTimeout(() => { srd("conjuros"); srd("monstruos"); }, 1500);

export const CAPITULOS = [
  ["Cómo jugar", 5, 20], ["Creación de personajes", 21, 31], ["Clases", 32, 88], ["Trasfondos y especies", 89, 93], ["Dotes", 94, 96],
  ["Equipo", 97, 113], ["Conjuros", 114, 193], ["Glosario de reglas", 194, 210], ["Herramientas del máster", 211, 222],
  ["Objetos mágicos", 223, 277], ["Monstruos", 278, 375], ["Animales", 376, 398]
];
export const ESCUELAS = ["abjuración", "adivinación", "conjuración", "encantamiento", "evocación", "ilusión", "nigromancia", "transmutación"];
const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export const findSpell = name => (srdNow.conjuros || []).find(x => norm(x.n) === norm(name));
export const findMonster = name => (srdNow.monstruos || []).find(x => norm(x.n) === norm(name));
export { norm };

/** Ficha de mesa a partir de un monstruo del compendio. */
/** PX por valor de desafío (tabla oficial). */
export const XP_BY_CR = { "0": 10, "1/8": 25, "1/4": 50, "1/2": 100, "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800, "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900, "11": 7200, "12": 8400, "13": 10000, "14": 11500, "15": 13000, "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000, "21": 33000, "22": 41000, "23": 50000, "24": 62000, "25": 75000, "26": 90000, "27": 105000, "28": 120000, "29": 135000, "30": 155000 };
export function monsterToken(m, c, r) {
  // «Mediano o Pequeño» es Mediano (la figura no debe encogerse)
  const size = /Enorme/.test(m.tipo) ? 2.4 : /Gargantu/.test(m.tipo) ? 3 : /Grande/.test(m.tipo) ? 1.6 : /Mediano/.test(m.tipo) ? 1 : /Pequeñ|Diminut/.test(m.tipo) ? 0.7 : 1;
  const xp = m.xp != null ? m.xp : XP_BY_CR[m.vd];
  return { id: "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), kind: "foe", name: m.n, srd: m.n, c, r, hp: m.pg, maxhp: m.pg, ac: m.ca,
    initBonus: parseInt(m.ini) || 0, size, color: "#7a2a22", vd: m.vd, ...(xp != null ? { xp } : {}), ...(m.img ? { portrait: m.img } : {}), speed: parseFloat(String(m.vel).replace(",", ".")) || 9, attacks: m.atk.map(a => ({ name: a.name, atk: a.atk, dmg: a.dmg, rng: a.rng })) };
}
