// Creación de personajes con el SRD 5.2.1 en español (CC BY 4.0): capítulo «Creación de personajes» (p. 22-24),
// «Atributos básicos» de cada clase (p. 31-85), trasfondos (p. 88-89), especies (p. 89-93), dotes de origen (p. 93-94)
// e invocaciones de brujo sin requisitos (p. 43-45). Nada inventado: lo que no está en el SRD lo escribe el jugador.

export const STANDARD = [15, 14, 13, 12, 10, 8];
export const POINT_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
export const POINTS = 27;

// Habilidades del SRD → claves de la ficha
export const SK = { "Acrobacias": "acrobacias", "Conocimiento arcano": "arcanos", "Atletismo": "atletismo", "Engaño": "engano", "Historia": "historia", "Interpretación": "interpretacion", "Intimidación": "intimidacion", "Investigación": "investigacion", "Juego de manos": "juegomanos", "Medicina": "medicina", "Naturaleza": "naturaleza", "Percepción": "percepcion", "Perspicacia": "perspicacia", "Persuasión": "persuasion", "Religión": "religion", "Sigilo": "sigilo", "Supervivencia": "supervivencia", "Trato con animales": "animales" };
const sk = (...n) => n.map(x => SK[x]);
const ALL = Object.values(SK);

/* ---------- Clases: «Atributos básicos» ---------- */
// arms: qué armas sabe usar (simple, martial, o martial solo si ligera / ligera o sutil); armor: entrenamiento.
// std: «Conjunto estándar por clase» (FUE DES CON INT SAB CAR). equip: opciones A/B(/C) de equipo inicial.
// mastery: armas con maestría en nivel 1 (rasgo «Maestría con armas»).
export const CLS = {
  "Bárbaro": { main: "Fuerza", hd: 12, saves: ["fue", "con"], n: 2, skills: sk("Atletismo", "Intimidación", "Naturaleza", "Percepción", "Supervivencia", "Trato con animales"),
    arms: { simple: 1, martial: 1 }, armor: { ligera: 1, media: 1, escudo: 1 }, armsTxt: "Armas sencillas y marciales", armorTxt: "Armaduras ligeras y medias y escudos",
    std: [15, 13, 14, 10, 12, 8], mastery: 2, unarmored: "con",
    equip: [{ items: [["Hacha a dos manos", 1], ["Hacha de mano", 4], ["Paquete de explorador", 1]], po: 15 }, { po: 75 }] },
  "Bardo": { main: "Carisma", hd: 8, saves: ["des", "car"], n: 3, skills: ALL, tools: "Elige tres instrumentos musicales",
    arms: { simple: 1 }, armor: { ligera: 1 }, armsTxt: "Armas sencillas", armorTxt: "Armaduras ligeras",
    std: [8, 14, 12, 13, 10, 15],
    equip: [{ items: [["Armadura de cuero", 1], ["Daga", 2], ["Instrumento musical (a tu elección)", 1], ["Paquete de artista", 1]], po: 19 }, { po: 90 }] },
  "Brujo": { main: "Carisma", hd: 8, saves: ["sab", "car"], n: 2, skills: sk("Conocimiento arcano", "Engaño", "Historia", "Intimidación", "Investigación", "Naturaleza", "Religión"),
    arms: { simple: 1 }, armor: { ligera: 1 }, armsTxt: "Armas sencillas", armorTxt: "Armaduras ligeras",
    std: [8, 14, 13, 12, 10, 15],
    equip: [{ items: [["Armadura de cuero", 1], ["Hoz", 1], ["Daga", 2], ["Canalizador arcano (orbe)", 1], ["Libro (de conocimiento oculto)", 1], ["Paquete de erudito", 1]], po: 15 }, { po: 100 }] },
  "Clérigo": { main: "Sabiduría", hd: 8, saves: ["sab", "car"], n: 2, skills: sk("Historia", "Medicina", "Perspicacia", "Persuasión", "Religión"),
    arms: { simple: 1 }, armor: { ligera: 1, media: 1, escudo: 1 }, armsTxt: "Armas sencillas", armorTxt: "Armaduras ligeras y medias y escudos",
    std: [14, 8, 13, 10, 15, 12],
    equip: [{ items: [["Camisa de malla", 1], ["Escudo", 1], ["Maza", 1], ["Paquete de sacerdote", 1], ["Símbolo sagrado", 1]], po: 7 }, { po: 110 }] },
  "Druida": { main: "Sabiduría", hd: 8, saves: ["int", "sab"], n: 2, skills: sk("Conocimiento arcano", "Medicina", "Naturaleza", "Percepción", "Perspicacia", "Religión", "Supervivencia", "Trato con animales"),
    tools: "Útiles de herborista", arms: { simple: 1 }, armor: { ligera: 1, escudo: 1 }, armsTxt: "Armas sencillas", armorTxt: "Armaduras ligeras y escudos",
    std: [8, 12, 14, 13, 15, 10],
    equip: [{ items: [["Armadura de cuero", 1], ["Escudo", 1], ["Hoz", 1], ["Canalizador druídico (bastón)", 1], ["Paquete de explorador", 1], ["Útiles de herborista", 1]], po: 9 }, { po: 50 }] },
  "Explorador": { main: "Destreza y Sabiduría", hd: 10, saves: ["fue", "des"], n: 3, skills: sk("Atletismo", "Investigación", "Naturaleza", "Percepción", "Perspicacia", "Sigilo", "Supervivencia", "Trato con animales"),
    arms: { simple: 1, martial: 1 }, armor: { ligera: 1, media: 1, escudo: 1 }, armsTxt: "Armas sencillas y marciales", armorTxt: "Armaduras ligeras y medias y escudos",
    std: [12, 15, 13, 8, 14, 10], mastery: 2,
    equip: [{ items: [["Armadura de cuero tachonado", 1], ["Cimitarra", 1], ["Espada corta", 1], ["Arco largo", 1], ["Flecha", 20], ["Aljaba", 1], ["Canalizador druídico (rama de muérdago)", 1], ["Paquete de explorador", 1]], po: 7 }, { po: 150 }] },
  "Guerrero": { main: "Fuerza o Destreza", hd: 10, saves: ["fue", "con"], n: 2, skills: sk("Acrobacias", "Atletismo", "Historia", "Intimidación", "Percepción", "Perspicacia", "Persuasión", "Supervivencia", "Trato con animales"),
    arms: { simple: 1, martial: 1 }, armor: { ligera: 1, media: 1, pesada: 1, escudo: 1 }, armsTxt: "Armas sencillas y marciales", armorTxt: "Armaduras ligeras, medias y pesadas y escudos",
    std: [15, 14, 13, 8, 10, 12], mastery: 3,
    equip: [{ items: [["Cota de malla", 1], ["Espadón", 1], ["Mangual", 1], ["Jabalina", 8], ["Paquete de explorador de mazmorras", 1]], po: 4 },
      { items: [["Armadura de cuero tachonado", 1], ["Cimitarra", 1], ["Espada corta", 1], ["Arco largo", 1], ["Flecha", 20], ["Aljaba", 1], ["Paquete de explorador de mazmorras", 1]], po: 11 }, { po: 155 }] },
  "Hechicero": { main: "Carisma", hd: 6, saves: ["con", "car"], n: 2, skills: sk("Conocimiento arcano", "Engaño", "Intimidación", "Perspicacia", "Persuasión", "Religión"),
    arms: { simple: 1 }, armor: {}, armsTxt: "Armas sencillas", armorTxt: "Ninguna",
    std: [10, 13, 14, 8, 12, 15],
    equip: [{ items: [["Lanza", 1], ["Daga", 2], ["Canalizador arcano (cristal)", 1], ["Paquete de explorador de mazmorras", 1]], po: 28 }, { po: 50 }] },
  "Mago": { main: "Inteligencia", hd: 6, saves: ["int", "sab"], n: 2, skills: sk("Conocimiento arcano", "Historia", "Investigación", "Medicina", "Naturaleza", "Perspicacia", "Religión"),
    arms: { simple: 1 }, armor: {}, armsTxt: "Armas sencillas", armorTxt: "Ninguna",
    std: [8, 12, 13, 15, 14, 10],
    equip: [{ items: [["Daga", 2], ["Canalizador arcano (bastón)", 1], ["Libro de conjuros", 1], ["Paquete de erudito", 1], ["Túnica", 1]], po: 5 }, { po: 55 }] },
  "Monje": { main: "Destreza y Sabiduría", hd: 8, saves: ["fue", "des"], n: 2, skills: sk("Acrobacias", "Atletismo", "Historia", "Perspicacia", "Religión", "Sigilo"),
    tools: "Elige un tipo de herramientas de artesano o instrumento musical", arms: { simple: 1, martialIf: ["ligera"] }, armor: {}, armsTxt: "Armas sencillas, además de marciales que tengan la propiedad «ligera»", armorTxt: "Ninguna",
    std: [12, 15, 13, 10, 14, 8], unarmored: "sab",
    equip: [{ items: [["Lanza", 1], ["Daga", 5], ["Herramientas de artesano o instrumento musical (el de tu competencia)", 1], ["Paquete de explorador", 1]], po: 11 }, { po: 50 }] },
  "Paladín": { main: "Fuerza y Carisma", hd: 10, saves: ["sab", "car"], n: 2, skills: sk("Atletismo", "Intimidación", "Medicina", "Perspicacia", "Persuasión", "Religión"),
    arms: { simple: 1, martial: 1 }, armor: { ligera: 1, media: 1, pesada: 1, escudo: 1 }, armsTxt: "Armas sencillas y marciales", armorTxt: "Armaduras ligeras, medias y pesadas y escudos",
    std: [15, 10, 13, 8, 12, 14], mastery: 2,
    equip: [{ items: [["Cota de malla", 1], ["Escudo", 1], ["Espada larga", 1], ["Jabalina", 6], ["Símbolo sagrado", 1], ["Paquete de sacerdote", 1]], po: 9 }, { po: 150 }] },
  "Pícaro": { main: "Destreza", hd: 8, saves: ["des", "int"], n: 4, skills: sk("Acrobacias", "Atletismo", "Engaño", "Intimidación", "Investigación", "Juego de manos", "Percepción", "Perspicacia", "Persuasión", "Sigilo"),
    tools: "Herramientas de ladrón", arms: { simple: 1, martialIf: ["ligera", "sutil"] }, armor: { ligera: 1 }, armsTxt: "Armas sencillas, además de marciales que tengan las propiedades «ligera» o «sutil»", armorTxt: "Armaduras ligeras",
    std: [12, 15, 13, 14, 10, 8], mastery: 2, expertise: 2,
    equip: [{ items: [["Armadura de cuero", 1], ["Daga", 2], ["Espada corta", 1], ["Arco corto", 1], ["Flecha", 20], ["Aljaba", 1], ["Herramientas de ladrón", 1], ["Paquete de ladrón", 1]], po: 8 }, { po: 100 }] }
};

// Elecciones de nivel 1 que da el rasgo de clase (texto del SRD resumido en la ficha a partir de PROG)
export const CLASS_PICK = {
  "Clérigo": { name: "Orden divina", opts: [
    { n: "Protector", t: "Te has entrenado para el combate y ganas competencia con armas marciales y entrenamiento con armaduras pesadas.", arms: { martial: 1 }, armor: { pesada: 1 } },
    { n: "Taumaturgo", t: "Conoces un truco adicional de la lista de conjuros de clérigo. Además, tu conexión mística con lo divino te proporciona un bonificador a tus pruebas de Inteligencia (Conocimiento arcano y Religión). El bonificador es igual a tu modificador por Sabiduría (mínimo de +1).", cantrip: 1 }] },
  "Druida": { name: "Orden primigenia", opts: [
    { n: "Guardián", t: "Te has entrenado para el combate y ganas competencia con armas marciales y entrenamiento con armaduras medias.", arms: { martial: 1 }, armor: { media: 1 } },
    { n: "Naturalista", t: "Conoces un truco adicional de la lista de conjuros de druida. Además, tu conexión mística con la naturaleza te proporciona un bonificador a tus pruebas de Inteligencia (Conocimiento arcano y Naturaleza). El bonificador es igual a tu modificador por Sabiduría (mínimo de +1).", cantrip: 1 }] },
  "Brujo": { name: "Invocación sobrenatural", opts: [
    { n: "Armadura de sombras", t: "Puedes lanzar armadura de mago sobre ti sin gastar un espacio de conjuro.", spell: "Armadura de mago" },
    { n: "Mente sobrenatural", t: "Tienes ventaja en las tiradas de salvación de Constitución que realices para mantener la concentración." },
    { n: "Pacto de la cadena", t: "Aprendes el conjuro encontrar familiar y puedes lanzarlo como acción de magia sin gastar un espacio de conjuro. Cuando lo lances, escoge entre una de las formas habituales para tu familiar o una de las siguientes formas especiales: diablillo, duende, esfinge de las maravillas, esqueleto, pseudodragón, quasit o serpiente venenosa. Asimismo, cuando realizas la acción de atacar, puedes renunciar a uno de tus propios ataques para que el familiar realice un ataque propio con su reacción.", spell: "Encontrar familiar" },
    { n: "Pacto del filo", t: "Como acción adicional, puedes conjurar en tu mano un arma de pacto, un arma cuerpo a cuerpo sencilla o marcial de tu elección con la que estableces un vínculo. Hasta que termine el vínculo, tendrás competencia con esa arma y podrás usarla como canalizador mágico. Siempre que ataques con el arma vinculada, puedes usar tu modificador por Carisma para las tiradas de ataque y de daño en lugar del modificador por Fuerza o Destreza. Además, puedes hacer que cause daño necrótico, psíquico o radiante en lugar de su tipo de daño normal." },
    { n: "Pacto del grimorio", t: "Al terminar un descanso corto o largo conjuras un Libro de las sombras. Cuando aparezca el libro, elige tres trucos y dos conjuros de nivel 1 que estén marcados como «ritual», de la lista de cualquier clase y que no tengas ya preparados. Mientras lleves el libro contigo, tendrás preparados los conjuros elegidos y funcionarán como conjuros de brujo para ti. Puedes usar el libro como canalizador mágico." }] }
};

/* ---------- Trasfondos (p. 88-89) ---------- */
export const BACKGROUNDS = {
  "Acólito": { ab: ["int", "sab", "car"], feat: "Iniciado en la magia", featList: "clérigo", skills: sk("Perspicacia", "Religión"), tools: "Suministros de calígrafo",
    equip: [{ items: [["Suministros de calígrafo", 1], ["Libro (de oraciones)", 1], ["Pergamino (hoja)", 10], ["Símbolo sagrado", 1], ["Túnica", 1]], po: 8 }, { po: 50 }] },
  "Criminal": { ab: ["des", "con", "int"], feat: "Alerta", skills: sk("Juego de manos", "Sigilo"), tools: "Herramientas de ladrón",
    equip: [{ items: [["Daga", 2], ["Herramientas de ladrón", 1], ["Palanqueta", 1], ["Bolsa", 2], ["Ropas de viaje", 1]], po: 16 }, { po: 50 }] },
  "Erudito": { ab: ["con", "int", "sab"], feat: "Iniciado en la magia", featList: "mago", skills: sk("Conocimiento arcano", "Historia"), tools: "Suministros de calígrafo",
    equip: [{ items: [["Bastón", 1], ["Suministros de calígrafo", 1], ["Libro (de historia)", 1], ["Pergamino (hoja)", 8], ["Túnica", 1]], po: 8 }, { po: 50 }] },
  "Soldado": { ab: ["fue", "des", "con"], feat: "Atacante salvaje", skills: sk("Atletismo", "Intimidación"), tools: "Elige un tipo de juego",
    equip: [{ items: [["Lanza", 1], ["Arco corto", 1], ["Flecha", 20], ["Aljaba", 1], ["Juego (el mismo de tu competencia)", 1], ["Útiles de sanador", 1], ["Ropas de viaje", 1]], po: 14 }, { po: 50 }] }
};

// Contenido de los paquetes (p. 106)
export const PACKS = {
  "Paquete de artista": "campana, cantimplora, 3 disfraces, espejo, 8 frascos de aceite, linterna de ojo de buey, mochila, petate, raciones para 9 días y yesquero",
  "Paquete de erudito": "10 frascos de aceite, 10 hojas de pergamino, lámpara, libro, mochila, pluma, tinta y yesquero",
  "Paquete de explorador": "10 antorchas, cantimplora, cuerda, 2 frascos de aceite, mochila, petate, raciones para 10 días y yesquero",
  "Paquete de explorador de mazmorras": "abrojos, 10 antorchas, cantimplora, cuerda, 2 frascos de aceite, mochila, palanqueta, raciones para 10 días y yesquero",
  "Paquete de ladrón": "bolas de metal, campana, cantimplora, cuerda, 7 frascos de aceite, linterna sorda, mochila, palanqueta, raciones para 5 días, 10 velas y yesquero",
  "Paquete de sacerdote": "agua bendita, lámpara, manta, mochila, raciones para 7 días, túnica y yesquero"
};

/* ---------- Dotes de origen (p. 93-94) ---------- */
export const ORIGIN_FEATS = {
  "Alerta": "Competencia en iniciativa: cuando tires iniciativa, puedes sumar tu bonificador por competencia a la tirada. Intercambio de iniciativa: justo después de tirar iniciativa, puedes cambiar tu iniciativa con la de un aliado que esté dispuesto a hacerlo en el mismo combate. No puedes hacer este intercambio si el aliado o tú tenéis el estado de incapacitado.",
  "Atacante salvaje": "Una vez por turno, cuando aciertes a un objetivo con un arma, podrás tirar dos veces los dados de daño del arma y usar el resultado que prefieras contra el objetivo.",
  "Habilidoso": "Ganas competencia en cualquier combinación de tres habilidades o herramientas que elijas.",
  "Iniciado en la magia": "Dos trucos: aprendes dos trucos de tu elección de la lista de conjuros de clérigo, druida o mago. Tu aptitud mágica para los conjuros de esta dote es la Inteligencia, la Sabiduría o el Carisma (elígela cuando selecciones esta dote). Conjuro de nivel 1: elige un conjuro de nivel 1 de la misma lista. Siempre tienes ese conjuro preparado. Puedes lanzarlo una vez sin gastar un espacio de conjuro y recuperas la capacidad de hacerlo de esta forma tras finalizar un descanso largo. También puedes lanzarlo usando cualquier espacio de conjuro que tengas."
};

/* ---------- Especies (p. 89-93) ---------- */
// dv: visión en la oscuridad (m). choice: elección de la especie (linaje, ancestro…). Los textos son los del SRD.
export const SPECIES = {
  "Dracónido": { size: "Mediano", speed: 9, dv: 18,
    traits: [["Linaje dracónico", "Tu linaje proviene de un progenitor dragón. Tu elección afecta a tus atributos Ataque de aliento y Resistencia al daño además de a tu aspecto."],
      ["Ataque de aliento", "Cuando lleves a cabo la acción de atacar en tu turno, puedes sustituir uno de tus ataques por una exhalación de energía mágica en un cono de 4,5 m o en una línea de 9 m de largo y 1,5 m de ancho (elige la forma cada vez). Todas las criaturas situadas en esa zona deberán hacer una tirada de salvación de Destreza (CD 8 más tu modificador por Constitución y tu bonificador por competencia). Si la fallan, sufrirán 1d10 de daño del tipo determinado por tu atributo Linaje dracónico. Si la superan, sufrirán la mitad de ese daño. El daño aumenta en 1d10 cuando alcanzas los niveles 5 (2d10), 11 (3d10) y 17 (4d10) de personaje. Puedes utilizar este ataque de aliento una cantidad de veces igual a tu bonificador por competencia y recuperas todos los usos tras finalizar un descanso largo."],
      ["Resistencia al daño", "Tienes resistencia al tipo de daño determinado por tu atributo Linaje dracónico."],
      ["Visión en la oscuridad", "Tienes visión en la oscuridad hasta 18 m."],
      ["Vuelo dracónico", "Cuando alcanzas el nivel 5 de personaje, puedes canalizar la magia dracónica para volar de forma temporal. Como acción adicional, haces que en la espalda te broten unas alas espectrales que duran 10 minutos o hasta que las repliegues (no requiere acción) o tengas el estado de incapacitado. Durante ese tiempo, tendrás una velocidad volando igual a tu velocidad. Cuando uses este atributo, no podrás volver a hacerlo hasta que finalices un descanso largo."]],
    choice: { name: "Ancestro dracónico", opts: [["Azul", "relámpago"], ["Blanco", "frío"], ["Bronce", "relámpago"], ["Cobre", "ácido"], ["Negro", "ácido"], ["Oro", "fuego"], ["Oropel", "fuego"], ["Plata", "frío"], ["Rojo", "fuego"], ["Verde", "veneno"]].map(([n, d]) => ({ n, t: `Daño de ${d}`, resist: d })) } },
  "Elfo": { size: "Mediano", speed: 9, dv: 18, castAb: 1,
    traits: [["Linaje élfico", "Formas parte de un linaje que te otorga capacidades sobrenaturales. Obtienes el beneficio de nivel 1 de ese linaje. Cuando alcanzas los niveles 3 y 5 de personaje, aprendes un conjuro de nivel superior, como se muestra en la tabla. Siempre tienes ese conjuro preparado. Puedes lanzarlo una vez sin gastar un espacio de conjuro y recuperas la capacidad de hacerlo de esta forma tras finalizar un descanso largo. También puedes lanzar el conjuro usando cualquier espacio de conjuro que tengas del nivel apropiado. La Inteligencia, la Sabiduría o el Carisma es tu aptitud mágica para los conjuros que lances con este atributo (elige la característica al seleccionar el linaje)."],
      ["Linaje feérico", "Tienes ventaja en las tiradas de salvación para evitar o poner fin al estado de hechizado."],
      ["Sentidos agudos", "Tienes competencia en la habilidad de Percepción, Perspicacia o Supervivencia."],
      ["Trance", "No necesitas dormir y la magia no puede dormirte. Puedes finalizar un descanso largo en 4 horas si las pasas en una meditación similar a un trance, tiempo durante el cual conservas la consciencia."],
      ["Visión en la oscuridad", "Tienes visión en la oscuridad hasta 18 m."]],
    skillPick: sk("Percepción", "Perspicacia", "Supervivencia"),
    choice: { name: "Linaje élfico", opts: [
      { n: "Alto elfo", t: "Conoces el truco prestidigitación. Tras finalizar un descanso largo, puedes sustituir ese truco por otro de la lista de conjuros de mago. Nivel 3: detectar magia. Nivel 5: paso brumoso.", spells: ["Prestidigitación"] },
      { n: "Drow", t: "El alcance de tu visión en la oscuridad aumenta a 36 m. También conoces el truco luces danzantes. Nivel 3: fuego feérico. Nivel 5: oscuridad.", spells: ["Luces danzantes"], dv: 36 },
      { n: "Elfo de los bosques", t: "Tu velocidad aumenta a 10,5 m. También conoces el truco saber druídico. Nivel 3: zancada prodigiosa. Nivel 5: pasar sin rastro.", spells: ["Saber druídico"], speed: 10.5 }] } },
  "Enano": { size: "Mediano", speed: 9, dv: 36, hpPerLevel: 1,
    traits: [["Afinidad con la piedra", "Como acción adicional, ganas la capacidad de sentir vibraciones con un alcance de 18 m durante 10 minutos. Debes encontrarte sobre una superficie de piedra o en contacto con una superficie de piedra para usar esta capacidad. Puedes usar esta acción adicional una cantidad de veces igual a tu bonificador por competencia y recuperas todos los usos tras finalizar un descanso largo."],
      ["Aguante enano", "Tus puntos de golpe máximos se incrementan en 1 y aumentarán en 1 más cada vez que subas un nivel."],
      ["Resistencia enana", "Tienes resistencia al daño de veneno. También tienes ventaja en las tiradas de salvación para evitar o poner fin al estado de envenenado."],
      ["Visión en la oscuridad", "Tienes visión en la oscuridad hasta 36 m."]] },
  "Gnomo": { size: "Pequeño", speed: 9, dv: 18, castAb: 1,
    traits: [["Astucia gnoma", "Tienes ventaja en las tiradas de salvación de Inteligencia, Sabiduría y Carisma."],
      ["Linaje gnomo", "Formas parte de un linaje que te otorga capacidades sobrenaturales. La Inteligencia, la Sabiduría o el Carisma es tu aptitud mágica para los conjuros que lances con este atributo (elige la característica al seleccionar el linaje)."],
      ["Visión en la oscuridad", "Tienes visión en la oscuridad hasta 18 m."]],
    choice: { name: "Linaje gnomo", opts: [
      { n: "Gnomo de las rocas", t: "Conoces los trucos prestidigitación y reparar. Además, puedes pasar 10 minutos lanzando prestidigitación para crear un dispositivo mecánico Diminuto (CA 5, 1 pg), como un juguete, un encendedor o una caja de música, que produce un efecto de prestidigitación cuando alguien emplea una acción adicional para activarlo con un toque. Puedes tener tres activos al mismo tiempo y se desarman 8 horas después de crearlos o cuando los desmontes con un toque como acción de utilizar.", spells: ["Prestidigitación", "Reparar"] },
      { n: "Gnomo de los bosques", t: "Conoces el truco ilusión menor. Además, siempre tienes el conjuro hablar con los animales preparado. Puedes lanzarlo sin gastar un espacio de conjuro una cantidad de veces igual a tu bonificador por competencia y recuperas todos los usos tras finalizar un descanso largo. También puedes usar cualquier espacio de conjuro que tengas para lanzarlo.", spells: ["Ilusión menor", "Hablar con los animales"] }] } },
  "Goliat": { size: "Mediano", speed: 10.5, dv: 0,
    traits: [["Constitución poderosa", "Tienes ventaja en cualquier prueba de característica que hagas para poner fin al estado de agarrado. Además, al determinar tu capacidad de carga, cuentas como si tuvieras un tamaño una categoría superior."],
      ["Forma grande", "A partir del nivel 5 de personaje, puedes cambiar de tamaño a Grande como acción adicional si estás en un lugar lo bastante espacioso. Esta transformación dura 10 minutos o hasta que le pongas fin (no requiere acción). Durante ese tiempo, tendrás ventaja en las pruebas de Fuerza y tu velocidad aumentará en 3 m. Cuando uses este atributo, no podrás volver a hacerlo hasta que finalices un descanso largo."],
      ["Linaje gigante", "Desciendes de los gigantes. Puedes usar el beneficio elegido una cantidad de veces igual a tu bonificador por competencia y recuperas todos los usos tras finalizar un descanso largo."]],
    choice: { name: "Linaje gigante", opts: [
      { n: "Abrasión del fuego (gigante de fuego)", t: "Cuando aciertes a un objetivo con una tirada de ataque y le causes daño, también puedes causarle 1d10 de daño de fuego." },
      { n: "Caída de las colinas (gigante de las colinas)", t: "Cuando aciertes a una criatura Grande o más pequeña con una tirada de ataque y le causes daño, también puedes infligirle el estado de derribada." },
      { n: "Excursión de las nubes (gigante de las nubes)", t: "Como acción adicional, te teletransportas mágicamente hasta 9 m a un espacio sin ocupar que puedas ver." },
      { n: "Frío de la escarcha (gigante de escarcha)", t: "Cuando aciertes a un objetivo con una tirada de ataque y le causes daño, también puedes causarle 1d6 de daño de frío y reducir su velocidad en 3 m hasta el principio de tu siguiente turno." },
      { n: "Resistencia de la piedra (gigante de piedra)", t: "Cuando recibas daño, puedes usar una reacción para tirar 1d12. Suma tu modificador por Constitución al resultado y reduce el daño en ese total." },
      { n: "Trueno de la tormenta (gigante de las tormentas)", t: "Cuando una criatura que esté a 18 m o menos de ti te cause daño, puedes usar una reacción para infligirle 1d8 de daño de trueno." }] } },
  "Humano": { size: "Mediano o Pequeño", speed: 9, dv: 0, sizePick: 1, extraSkill: 1, extraFeat: 1,
    traits: [["Diestro", "Ganas competencia en una habilidad de tu elección."],
      ["Ingenioso", "Obtienes inspiración heroica tras finalizar un descanso largo."],
      ["Versátil", "Obtienes una dote de origen de tu elección. Se recomienda Habilidoso."]] },
  "Mediano": { size: "Pequeño", speed: 9, dv: 0,
    traits: [["Agilidad de mediano", "Puedes moverte a través del espacio ocupado por cualquier criatura de tamaño superior al tuyo, pero no puedes detenerte en el mismo espacio."],
      ["Fortuna", "Cuando saques un 1 en una prueba con d20, podrás repetir la tirada y deberás utilizar el nuevo resultado."],
      ["Sigiloso por naturaleza", "Puedes llevar a cabo la acción de esconderte incluso tras una criatura cuyo tamaño sea, al menos, una categoría superior al tuyo."],
      ["Valiente", "Tienes ventaja en las tiradas de salvación que hagas para evitar o poner fin al estado de asustado."]] },
  "Orco": { size: "Mediano", speed: 9, dv: 36,
    traits: [["Aguante incansable", "Cuando tus puntos de golpe se reducen a 0 pero no mueres inmediatamente, puedes recuperar 1 punto de golpe. Cuando uses este atributo, no podrás volver a hacerlo hasta que finalices un descanso largo."],
      ["Descarga de adrenalina", "Puedes llevar a cabo la acción de correr como acción adicional. Cuando lo hagas, obtendrás una cantidad de puntos de golpe temporales igual a tu bonificador por competencia. Puedes usar este atributo una cantidad de veces igual a tu bonificador por competencia y recuperas todos los usos tras finalizar un descanso corto o largo."],
      ["Visión en la oscuridad", "Tienes visión en la oscuridad hasta 36 m."]] },
  "Tiefling": { size: "Mediano o Pequeño", speed: 9, dv: 18, sizePick: 1, castAb: 1,
    traits: [["Legado infernal", "Eres el destinatario de un legado que te otorga capacidades sobrenaturales. Obtienes el beneficio de nivel 1 del legado elegido. Cuando alcanzas los niveles 3 y 5 de personaje, aprendes un conjuro de nivel superior, como se muestra en la tabla. Siempre tienes ese conjuro preparado. Puedes lanzarlo una vez sin gastar un espacio de conjuro y recuperas la capacidad de hacerlo de esta forma tras finalizar un descanso largo. También puedes lanzar el conjuro usando cualquier espacio de conjuro que tengas del nivel apropiado. La Inteligencia, la Sabiduría o el Carisma es tu aptitud mágica para los conjuros que lances con este atributo (elige la característica al seleccionar el legado)."],
      ["Presencia sobrenatural", "Conoces el truco taumaturgia. Cuando lo lances con este atributo, el conjuro utiliza la misma aptitud mágica que la de tu atributo Legado infernal."],
      ["Visión en la oscuridad", "Tienes visión en la oscuridad hasta 18 m."]],
    spells: ["Taumaturgia"],
    choice: { name: "Legado infernal", opts: [
      { n: "Abisal", t: "Tienes resistencia al daño de veneno. También conoces el truco rociada venenosa. Nivel 3: rayo nauseabundo. Nivel 5: inmovilizar persona.", spells: ["Rociada venenosa"], resist: "veneno" },
      { n: "Ctónico", t: "Tienes resistencia al daño necrótico. También conoces el truco toque helado. Nivel 3: falsa vida. Nivel 5: rayo debilitador.", spells: ["Toque helado"], resist: "necrótico" },
      { n: "Infernal", t: "Tienes resistencia al daño de fuego. También conoces el truco descarga de fuego. Nivel 3: reprensión infernal. Nivel 5: oscuridad.", spells: ["Descarga de fuego"], resist: "fuego" }] } }
};

/* ---------- Idiomas (p. 22) ---------- */
export const LANGS = ["Dracónico", "Elfo", "Enano", "Gigante", "Gnomo", "Goblin", "Lengua de signos común", "Mediano", "Orco"];
export const LANGS_RARE = ["Abisal", "Celestial", "Druídico", "Habla de las profundidades", "Infernal", "Infracomún", "Jerga de ladrones", "Primordial", "Silvano"];
export const ALIGN = ["Legal bueno", "Neutral bueno", "Caótico bueno", "Legal neutral", "Neutral", "Caótico neutral", "Legal malvado", "Neutral malvado", "Caótico malvado"];
