// Niebla de la vista, dibujada con suavidad (como en Foundry, Owlbear Rodeo o Roll20): un velo oscuro con los bordes
// difuminados en vez de bloques. Lo que no se ha visto nunca queda casi negro; lo explorado que ahora no se ve,
// en penumbra azulada (se recuerda, pero no se ve lo que pasa); la luz tenue, apenas un velo.
// La misma imagen sirve para el plano 2D (como <image>) y para la mesa 3D (como textura sobre el suelo).
const PPC = 24; // píxeles por casilla

/** Lienzo con el velo: vis = casillas que se ven (vis.dim, en penumbra); exp = exploradas. */
export function fogCanvas(cols, rows, vis, exp) {
  const W = cols * PPC, H = rows * PPC;
  // 1) Opacidad por casilla en un lienzo pequeño (2 píxeles por casilla)
  const sm = document.createElement("canvas"); sm.width = cols * 2; sm.height = rows * 2;
  const s = sm.getContext("2d");
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const k = c + "," + r;
    const a = !exp.has(k) ? 1 : !vis.has(k) ? 0.55 : vis.dim && vis.dim.has(k) ? 0.28 : 0;
    if (!a) continue;
    s.fillStyle = `rgba(0,0,0,${a})`; s.fillRect(c * 2, r * 2, 2, 2);
  }
  // 2) Se agranda con suavizado y se difumina: bordes suaves
  const big = document.createElement("canvas"); big.width = W; big.height = H;
  const g = big.getContext("2d");
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  try { g.filter = `blur(${Math.round(PPC * 0.32)}px)`; } catch (e) { /* sin filtros: queda el suavizado */ }
  g.drawImage(sm, -PPC * 0.25, -PPC * 0.25, W + PPC * 0.5, H + PPC * 0.5);
  g.filter = "none";
  // 3) Color: tinta oscura y fría, con un grano leve para que parezca bruma y no un recorte
  g.globalCompositeOperation = "source-in";
  const grd = g.createLinearGradient(0, 0, W, H); grd.addColorStop(0, "#0b0c14"); grd.addColorStop(1, "#0a0a10");
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "source-atop";
  g.fillStyle = noise(); g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "source-over";
  return big;
}

let pattern = null;
function noise() {
  if (pattern) return pattern;
  const n = document.createElement("canvas"); n.width = n.height = 128;
  const x = n.getContext("2d"), img = x.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) { const v = 20 + Math.random() * 26; img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v + 8; img.data[i + 3] = Math.random() * 38; }
  x.putImageData(img, 0, 0);
  pattern = x.createPattern(n, "repeat");
  return pattern;
}

/** Firma para no rehacer el velo si no ha cambiado nada. */
export const fogSig = (vis, exp, cols, rows) => `${cols}x${rows}|${exp.size}|${[...vis].join(";")}|${vis.dim ? [...vis.dim].join(";") : ""}`;
