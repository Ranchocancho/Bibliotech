// Prueba de extremo a extremo con Chrome en tamaño móvil.
// Uso: node tests/e2e.js http://localhost:8765/ /tmp/shots
const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const base = process.argv[2];
  const shots = process.argv[3];
  fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
    permissions: ['clipboard-read', 'clipboard-write']
  });
  const errors = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const shot = (n) => page.screenshot({ path: `${shots}/${n}.png` });
  const wait = (ms) => page.waitForTimeout(ms);

  await page.goto(base);
  await wait(800);
  await shot('01-vacia');

  // Añadir juegos de Switch
  await page.click('[data-act="add"]');
  await page.fill('#q', 'mario');
  await wait(700);
  await shot('02-buscar-mario');
  const count = await page.locator('.result').count();
  console.log('resultados "mario" en Switch:', count);
  await page.locator('.result').first().click();
  await wait(200);
  for (const q of ['zelda', 'metroid', 'hollow', 'splatoon', 'animal', 'odyssey', 'bananza']) {
    await page.fill('#q', q); await wait(500);
    const n = await page.locator('.result:not(.owned)').count();
    if (n) await page.locator('.result:not(.owned)').first().click();
    await wait(150);
  }
  // Búsqueda por nombre alternativo en español en DS
  await page.click('[data-act="addColl"][data-id="nin"]');
  await page.fill('#q', 'villa misteriosa'); await wait(600);
  console.log('resultados "villa misteriosa":', await page.locator('.result').count());
  await page.locator('.result').first().click(); await wait(150);
  await page.fill('#q', 'heartgold'); await wait(500); await page.locator('.result').first().click();
  await page.fill('#q', 'kart'); await wait(500); await page.locator('.result').first().click();
  await page.click('[data-act="addColl"][data-id="ps"]');
  for (const q of ['god of war', 'astro', 'parte ii', 'tsushima', 'bloodborne']) {
    await page.fill('#q', q); await wait(500);
    if (await page.locator('.result').count()) await page.locator('.result').first().click();
  }
  await shot('03-ps-anadidos');
  await page.click('[data-act="closeLayer"]');
  await wait(300);
  await shot('04-estanteria-ps');
  await page.click('[data-act="tab"][data-id="sw"]'); await wait(300);
  await shot('05-estanteria-switch');
  await page.click('[data-act="tab"][data-id="nin"]'); await wait(300);
  await shot('06-estanteria-ds');

  // Detalle
  await page.click('[data-act="tab"][data-id="sw"]'); await wait(200);
  await page.locator('.item.spine').first().click(); await wait(700);
  await shot('07-detalle-portada');
  await page.click('[data-act="view"][data-id="back"]'); await wait(900);
  await shot('08-detalle-contraportada');
  await page.click('[data-act="view"][data-id="inside"]'); await wait(600);
  await shot('09-detalle-dentro');
  await page.click('[data-act="toggleFace"]'); await wait(300);
  await page.click('[data-act="closeLayer"]'); await wait(300);
  await shot('10-tras-poner-de-frente');

  // Juego con contraportada real (id impar): Metroid Dread 2003
  const metroid = page.locator('[aria-label^="Metroid Dread"]');
  if (await metroid.count()) {
    await metroid.first().click(); await wait(500);
    await page.click('[data-act="view"][data-id="back"]'); await wait(900); await shot('11-contra-real');
    await page.click('[data-act="view"][data-id="inside"]'); await wait(500); await shot('12-dentro-real');
    await page.click('[data-act="closeLayer"]');
  }

  // Películas (sin internet en las pruebas: las inyectamos)
  await page.evaluate(() => {
    const items = JSON.parse(localStorage.getItem('ludo.items'));
    const mk = (t, y, plat, face) => ({ uid: Math.random().toString(36).slice(2), kind: 'movie', plat, ref: t, title: t, year: y, front: null, back: null, media: null, face, added: Date.now() });
    items.push(mk('El laberinto del fauno', 2006, 'dvd', true), mk('Dune', 2021, 'bluray', true), mk('Amélie', 2001, 'dvd', false), mk('Interstellar', 2014, 'bluray', false), mk('Volver', 2006, 'dvd', false));
    localStorage.setItem('ludo.items', JSON.stringify(items));
  });
  await page.reload(); await wait(600);
  await page.click('[data-act="tab"][data-id="mov"]'); await wait(300);
  await shot('13-peliculas');
  await page.locator('.item').first().click(); await wait(500);
  await page.click('[data-act="view"][data-id="back"]'); await wait(900); await shot('14-peli-contra');
  await page.click('[data-act="view"][data-id="inside"]'); await wait(500); await shot('15-peli-dentro');
  await page.click('[data-act="closeLayer"]');

  // Añadir película: comprobar que avisa sin conexión a Wikipedia
  await page.click('[data-act="add"]'); await wait(200);
  await page.fill('#q', 'dune'); await wait(1500);
  await shot('16-buscar-peli-sin-red');
  console.log('hint películas:', await page.textContent('#hint'));
  await page.click('[data-act="closeLayer"]');

  // Compartir
  await page.click('[data-act="share"]'); await wait(200);
  await page.fill('#myName', 'Juanjo');
  await shot('17-compartir');
  await page.evaluate(() => { delete navigator.share; });
  await page.click('[data-act="doShare"]'); await wait(800);
  const link = await page.evaluate(() => navigator.clipboard.readText());
  console.log('longitud del enlace:', link.length);
  await page.click('[data-act="closeLayer"]');

  // Un amigo abre el enlace (otro móvil = otro contexto)
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', (e) => errors.push('amigo pageerror: ' + e.message));
  await p2.goto(link); await p2.waitForTimeout(1200);
  await p2.screenshot({ path: `${shots}/18-amigo-ve.png` });
  await p2.click('[data-act="tab"][data-id="sw"]'); await p2.waitForTimeout(300);
  await p2.screenshot({ path: `${shots}/19-amigo-switch.png` });
  await p2.locator('.item').first().click(); await p2.waitForTimeout(600);
  await p2.screenshot({ path: `${shots}/20-amigo-detalle.png` });
  await p2.click('[data-act="copyToMine"]'); await p2.waitForTimeout(300);
  await p2.click('[data-act="closeLayer"]');
  await p2.click('[data-act="closeFriend"]'); await p2.waitForTimeout(300);
  await p2.screenshot({ path: `${shots}/21-lista-amigos.png` });
  console.log('el amigo tiene ahora:', await p2.evaluate(() => JSON.parse(localStorage.getItem('ludo.items') || '[]').length), 'cajas propias');

  // Ajustes
  await page.click('[data-act="settings"]'); await wait(200);
  await shot('22-ajustes');

  console.log('ERRORES:', errors.length ? errors.join('\n') : 'ninguno');
  await browser.close();
})();
