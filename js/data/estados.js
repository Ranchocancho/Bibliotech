// Estados (condiciones) de las reglas de 2024, resumidos. Basado en el SRD 5.2.1 (CC BY 4.0, ver CREDITS.md).
// Cada estado tiene un color de anillo, como los anillos de estado que se ponen en la peana de las miniaturas.
export const ESTADOS = [
  { id: "agarrado", n: "Agarrado", c: "#c98a3d", t: "Velocidad 0. Desventaja al atacar a cualquiera que no sea quien te agarra. Quien te agarra puede arrastrarte." },
  { id: "apresado", n: "Apresado", c: "#8a5a2b", t: "Velocidad 0. Los ataques contra ti tienen ventaja; los tuyos, desventaja. Desventaja en salvaciones de Destreza." },
  { id: "asustado", n: "Asustado", c: "#7b4fb0", t: "Desventaja en pruebas y ataques mientras veas la fuente del miedo. No puedes acercarte a ella voluntariamente." },
  { id: "aturdido", n: "Aturdido", c: "#e0c23a", t: "Incapacitado. Fallas automáticamente las salvaciones de Fuerza y Destreza. Los ataques contra ti tienen ventaja." },
  { id: "cegado", n: "Cegado", c: "#4a4a4a", t: "No ves: fallas pruebas que requieran vista. Tus ataques tienen desventaja; los ataques contra ti, ventaja." },
  { id: "derribado", n: "Derribado", c: "#9a7a52", t: "Solo puedes arrastrarte o levantarte (mitad de tu movimiento). Desventaja al atacar. Ataques contra ti: ventaja a 1,5 m, desventaja más lejos." },
  { id: "ensordecido", n: "Ensordecido", c: "#6f8a8a", t: "No oyes: fallas pruebas que requieran oído." },
  { id: "envenenado", n: "Envenenado", c: "#5e9a32", t: "Desventaja en tiradas de ataque y pruebas de característica." },
  { id: "hechizado", n: "Hechizado", c: "#d65a9a", t: "No puedes atacar a quien te hechiza ni dañarle. Tiene ventaja en sus pruebas sociales contigo." },
  { id: "incapacitado", n: "Incapacitado", c: "#a65a3a", t: "No puedes realizar acciones, acciones adicionales ni reacciones. Se rompe la concentración. Desventaja en iniciativa." },
  { id: "inconsciente", n: "Inconsciente", c: "#2a2a5a", t: "Incapacitado y derribado; sueltas lo que llevas. Fallas salvaciones de Fuerza y Destreza. Ataques contra ti con ventaja; crítico a 1,5 m." },
  { id: "invisible", n: "Invisible", c: "#bfe4ff", t: "Ventaja en iniciativa. No te ven sin magia o sentidos especiales. Tus ataques con ventaja; los ataques contra ti, con desventaja." },
  { id: "paralizado", n: "Paralizado", c: "#3a8ad6", t: "Incapacitado y velocidad 0. Fallas salvaciones de Fuerza y Destreza. Ataques contra ti con ventaja; crítico a 1,5 m." },
  { id: "petrificado", n: "Petrificado", c: "#8c8c8c", t: "Convertido en piedra: incapacitado, velocidad 0, resistencia a todo el daño, inmune a veneno. Ataques contra ti con ventaja." },
  { id: "agotamiento", n: "Agotamiento", c: "#b33a2e", t: "Por cada nivel: −2 a las tiradas d20 y −1,5 m de velocidad. A nivel 6 mueres. Un descanso largo quita un nivel.", levels: 6 },
  { id: "esquivando", n: "Esquivando", c: "#e8e2d0", t: "Acción de Esquivar: los ataques contra ti tienen desventaja y tienes ventaja en las salvaciones de Destreza, hasta el principio de tu siguiente turno." },
  { id: "destrabado", n: "Destrabado", c: "#a0d0c0", t: "Acción de Destrabarse: tu movimiento no provoca ataques de oportunidad durante el resto del turno." },
  { id: "concentracion", n: "Concentración", c: "#d6aa4e", t: "Mantiene un conjuro. Al recibir daño, salvación de Constitución (CD 10 o la mitad del daño, la mayor) o se pierde." },
  { id: "bendecido", n: "Bendecido", c: "#f2d36b", t: "Bendición: suma 1d4 a sus tiradas de ataque y de salvación mientras dure." },
  { id: "perdicion", n: "Perdición", c: "#5a2a6a", t: "Perdición: resta 1d4 a sus tiradas de ataque y de salvación mientras dure." },
  { id: "debilitado", n: "Debilitado (maestría)", c: "#b08a6a", t: "Debilitar: desventaja en su próxima tirada de ataque antes del principio del siguiente turno de quien le acertó." },
  { id: "ralentizado", n: "Ralentizado (maestría)", c: "#6a8ab0", t: "Ralentizar: su velocidad baja 3 m hasta el principio del siguiente turno de quien le acertó (no se acumula)." },
  { id: "muerto", n: "Muerto", c: "#111111", t: "Ha fallado tres salvaciones contra muerte (o recibió daño masivo). Solo la magia puede devolverlo." }
];
export const estado = id => ESTADOS.find(e => e.id === id);
/** Texto corto para la etiqueta: "Aturdido", "Agotamiento 2"… */
export const etiqueta = (id, lvl) => { const e = estado(id); return e ? e.n + (e.levels && lvl ? " " + lvl : "") : id; };
