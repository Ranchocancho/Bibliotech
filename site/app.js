'use strict';
/* Ludoteca – colección de juegos y películas en una estantería de madera.
   Todo funciona en el navegador: la colección se guarda en el propio móvil. */
(function () {
  // ---------- Plataformas y colecciones ----------
  // Medidas reales de las cajas (ancho × alto × grosor en mm) a 0,8 px por mm:
  // DS 134×122×15 · 3DS 134×122×12,5 · Switch 105×170×11 · PS4/PS5 135×170×14 · DVD 135×190×14 · Blu-ray 128,5×148×12
  const PLAT = {
    ds:      { label: 'NINTENDO DS',       short: 'DS',       coll: 'nin', caseColor: '#1d1d1f', bandText: '#f2f2f2', w: 107, h: 98, sw: 15, depth: 0.112, media: 'cart' },
    '3ds':   { label: 'NINTENDO 3DS',      short: '3DS',      coll: 'nin', caseColor: '#ececec', bandText: '#a3121c', w: 107, h: 98, sw: 13, depth: 0.093, media: 'cart' },
    switch:  { label: 'NINTENDO SWITCH',   short: 'Switch',   coll: 'sw',  caseColor: '#d4101b', bandText: '#ffffff', w: 84, h: 136, sw: 11, depth: 0.105, media: 'cart' },
    switch2: { label: 'NINTENDO SWITCH 2', short: 'Switch 2', coll: 'sw',  caseColor: '#d4101b', bandText: '#ffffff', w: 84, h: 136, sw: 11, depth: 0.105, media: 'cart' },
    ps4:     { label: 'PS4',               short: 'PS4',      coll: 'ps',  caseColor: '#1a3f8f', bandText: '#ffffff', w: 108, h: 136, sw: 14, depth: 0.104, media: 'disc' },
    ps5:     { label: 'PS5',               short: 'PS5',      coll: 'ps',  caseColor: '#2257b8', bandText: '#ffffff', w: 108, h: 136, sw: 14, depth: 0.104, media: 'disc' },
    dvd:     { label: 'DVD',               short: 'DVD',      coll: 'mov', caseColor: '#141414', bandText: '#dddddd', w: 108, h: 152, sw: 14, depth: 0.104, media: 'disc' },
    bluray:  { label: 'BLU-RAY',           short: 'Blu-ray',  coll: 'mov', caseColor: '#1560bd', bandText: '#ffffff', w: 103, h: 118, sw: 12, depth: 0.093, media: 'disc' },
    // Cómics: tomo de 17×26 cm y grapa de 17×26 cm (a 0,8 px por mm, como el resto)
    tomo:    { label: 'TOMO',              short: 'Tomo',     coll: 'com', caseColor: '#2a2522', bandText: '#f2ead9', w: 136, h: 208, sw: 13, depth: 0.09, media: 'book', book: true },
    grapa:   { label: 'GRAPA',             short: 'Grapa',    coll: 'com', caseColor: '#efe8db', bandText: '#2a2522', w: 134, h: 206, sw: 4, depth: 0.03, media: 'book', book: true }
  };
  const COLLS = [
    { id: 'nin', name: 'DS · 3DS',    full: 'Nintendo DS y 3DS',          plats: ['ds', '3ds'],         noun: ['juego', 'juegos'] },
    { id: 'sw',  name: 'Switch',      full: 'Nintendo Switch y Switch 2', plats: ['switch', 'switch2'], noun: ['juego', 'juegos'] },
    { id: 'ps',  name: 'PlayStation', full: 'PlayStation 4 y 5',          plats: ['ps4', 'ps5'],        noun: ['juego', 'juegos'] },
    { id: 'mov', name: 'Películas',   full: 'DVD y Blu-ray',              plats: ['dvd', 'bluray'],     noun: ['película', 'películas'] },
    { id: 'com', name: 'Cómics',      full: 'Cómics y novelas gráficas',  plats: ['tomo', 'grapa'],     noun: ['cómic', 'cómics'] }
  ];
  const collOf = (id) => COLLS.find((c) => c.id === id) || COLLS[1];
  // Orden de las estanterías elegido por cada persona (se guarda en su móvil)
  function collOrder() {
    let o = []; try { o = JSON.parse(localStorage.getItem('ludo.order') || '[]'); } catch (e) { o = []; }
    o = o.filter((id) => COLLS.some((c) => c.id === id));
    COLLS.forEach((c) => { if (!o.includes(c.id)) o.push(c.id); });
    return o;
  }
  function hiddenColls() { try { return JSON.parse(localStorage.getItem('ludo.hidden') || '[]'); } catch (e) { return []; } }
  const orderedColls = () => collOrder().map(collOf);
  const visibleColls = () => { const h = hiddenColls(); const v = orderedColls().filter((c) => !h.includes(c.id)); return v.length ? v : orderedColls(); };
  const ALLOWED_IMG = ['https://images.launchbox-app.com/', 'https://upload.wikimedia.org/', 'https://art.gametdb.com/', 'https://image.tmdb.org/', 'https://covers.openlibrary.org/'];
  // Clave gratuita de TMDB (uso personal, no comercial). Es la misma para todos.
  const TMDB_KEY = '7ae1e6e55398db1b1c344538507ad7e1';
  const REGION_NAME = { ES: 'España', EU: 'Europa', WW: 'Internacional', US: 'EE. UU.', JP: 'Japón', DE: 'Alemania', FR: 'Francia', IT: 'Italia', NL: 'Países Bajos', AU: 'Australia', KR: 'Corea' };
  let IMG_BASE = 'https://images.launchbox-app.com/';
  let CATALOG_DATE = '';

  // ---------- Utilidades ----------
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { toast('No se ha podido guardar en este dispositivo'); } }
  };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cssUrl = (u) => esc(String(u || '').replace(/["'()\\\s]/g, (c) => encodeURIComponent(c)));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const byTitle = (a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base', numeric: true });
  const plural = (n, w) => `${n} ${n === 1 ? w[0] : w[1]}`;
  const fmtDate = (ts) => { try { return new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }); } catch (e) { return ''; } };
  function colorFor(text) {
    let h = 0; for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return `hsl(${h % 360} 45% 28%)`;
  }
  function safeImg(u) {
    if (!u || typeof u !== 'string') return null;
    if (ALLOWED_IMG.some((p) => u.startsWith(p))) return u;
    if (IMG_BASE !== ALLOWED_IMG[0] && u.startsWith(IMG_BASE)) return u; // modo pruebas
    return null;
  }
  const imgUrl = (file) => (file ? IMG_BASE + file : null);

  const I = {
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    flip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="10" height="18" rx="1.5"/><path d="M18 5v14"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    scan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 8V5h3M20 8V5h-3M4 16v3h3M20 16v3h-3M8 9v6M11 9v6M14 9v6M17 9v6"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="#c9a77c" stroke-width="2" stroke-linecap="round" aria-hidden="true" width="18" height="18"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 20V10M12 20V4M19 20v-7"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
    zoom: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5M11 8v6M8 11h6"/></svg>',
    images: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="14" height="14" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12M3 15l4-4 4 4 3-3 3 3"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>'
  };

  // ---------- Estado ----------
  const state = {
    items: LS.get('ludo.items', []),
    friends: LS.get('ludo.friends', []),
    name: LS.get('ludo.name', ''),
    tab: LS.get('ludo.tab', null) || 'sw',
    mode: 'mine',          // 'mine' | 'wish' | 'friends'
    friendId: null,        // estantería de amigo abierta
    friendWish: false,     // en un amigo: ver sus deseos
    filter: { q: '', sort: LS.get('ludo.sort', 'title'), genre: '', notMine: false },
    detail: null,          // { item, view, readOnly }
    add: null,             // { coll, fmt }
    layer: null            // 'detail' | 'add' | 'share' | 'settings' | 'scan'
  };
  // Las fotos propias viven en IndexedDB; en memoria la portada es una URL temporal (blob:)
  // que nunca se guarda: se guarda la imagen del catálogo que había debajo
  function itemReplacer(k, v) {
    if (k && k[0] === '_') return undefined;
    if (k === 'front' && this && this._url) return this._orig || null;
    return v;
  }
  const saveItems = () => { try { localStorage.setItem('ludo.items', JSON.stringify(state.items, itemReplacer)); } catch (e) { toast('No se ha podido guardar en este dispositivo'); } };
  const saveFriends = () => LS.set('ludo.friends', state.friends);
  let installPrompt = null;

  // ---------- Esqueleto ----------
  const $app = document.getElementById('app');
  $app.innerHTML = '<header class="top" id="top"></header><main class="wall scroll" id="content"></main><div class="dock" id="dock"></div><div id="layers"></div><div id="toastBox"></div>';
  const $top = document.getElementById('top');
  const $content = document.getElementById('content');
  const $dock = document.getElementById('dock');
  const $layers = document.getElementById('layers');
  const $toast = document.getElementById('toastBox');

  let toastTimer;
  function toast(msg) {
    $toast.innerHTML = `<div class="toast" role="status">${esc(msg)}</div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $toast.innerHTML = ''; }, 2600);
  }
  // Aviso con "Deshacer": guarda cómo estaba la colección justo antes del cambio
  let undoSnap = null;
  const snapshot = () => JSON.parse(JSON.stringify(state.items));
  function toastUndo(msg, snap) {
    undoSnap = snap;
    $toast.innerHTML = `<div class="toast undo" role="status"><span>${esc(msg)}</span><button class="undo-btn" data-act="undo">Deshacer</button></div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $toast.innerHTML = ''; undoSnap = null; }, 6000);
  }

  // ---------- Vista principal ----------
  function currentFriend() { return state.friendId ? state.friends.find((f) => f.id === state.friendId) : null; }
  // Todo lo de la persona que se está viendo (yo o un amigo), estantería + deseos
  function allShown() { const f = currentFriend(); return f ? f.items : state.items; }
  // Lo que toca ver ahora: estantería o lista de deseos
  function shownItems() {
    const f = currentFriend();
    const wish = f ? state.friendWish : state.mode === 'wish';
    return allShown().filter((i) => !!i.wish === wish);
  }
  const owned = () => state.items.filter((i) => !i.wish);
  function ownMatch(it) {
    const t = norm(it.title);
    return owned().find((m) => (m.plat === it.plat && String(m.ref) === String(it.ref)) ||
      (PLAT[m.plat].coll === PLAT[it.plat].coll && norm(m.title) === t));
  }
  const itemGenres = (i) => Array.isArray(i.genres) ? i.genres : [];

  function tabsHTML(items, coll) {
    const counts = Object.fromEntries(COLLS.map((c) => [c.id, items.filter((i) => PLAT[i.plat] && PLAT[i.plat].coll === c.id).length]));
    // En la estantería de un amigo se ven también las que yo oculto si él tiene algo en ellas
    const list = state.friendId ? orderedColls().filter((c) => counts[c.id] || visibleColls().includes(c)) : visibleColls();
    return `<nav class="tabs" role="tablist" aria-label="Colecciones" style="grid-template-columns:repeat(${list.length}, minmax(0, 1fr))">${list.map((c) =>
      `<button role="tab" data-act="tab" data-id="${c.id}" aria-selected="${c.id === coll.id}"><span class="t">${esc(c.name)}</span><span class="n">${counts[c.id]}</span></button>`).join('')}</nav>`;
  }

  function render() {
    if (!state.friendId && !visibleColls().some((c) => c.id === state.tab)) state.tab = visibleColls()[0].id;
    const friend = currentFriend();
    const items = shownItems();
    const coll = collOf(state.tab);

    if (friend) {
      const own = friend.items.filter((i) => !i.wish); const wish = friend.items.filter((i) => i.wish);
      const common = own.filter((i) => ownMatch(i)).length;
      $top.innerHTML = `<div class="friend-banner"><button class="icon-btn" data-act="closeFriend" aria-label="Volver a mis amigos">${I.back}</button>
        <div><div class="kicker">Estantería de</div><div class="who">${esc(friend.name)}</div></div>
        <div style="flex:1"></div><div class="when">${common ? `${common} en común<br>` : ''}Recibida el ${esc(fmtDate(friend.received))}</div></div>
        <div class="modes" role="group" aria-label="Qué ver"><button data-act="friendWish" data-id="0" aria-pressed="${!state.friendWish}">Su estantería · ${own.length}</button>
        <button data-act="friendWish" data-id="1" aria-pressed="${!!state.friendWish}">Sus deseos · ${wish.length}</button></div>${tabsHTML(items, coll)}`;
    } else {
      const nWish = state.items.filter((i) => i.wish).length;
      $top.innerHTML = `<div class="top-row"><div><div class="kicker">Mi colección</div><h1 class="brand">Ludoteca</h1></div>
        <div class="top-actions"><button class="icon-btn" data-act="stats" aria-label="Estadísticas">${I.chart}</button>
        <button class="icon-btn" data-act="share" aria-label="Compartir mi estantería">${I.share}</button>
        <button class="icon-btn" data-act="settings" aria-label="Ajustes">${I.gear}</button></div></div>
        <div class="modes modes3" role="group" aria-label="Qué estanterías ver">
        <button data-act="mode" data-id="mine" aria-pressed="${state.mode === 'mine'}">Estantería</button>
        <button data-act="mode" data-id="wish" aria-pressed="${state.mode === 'wish'}">Deseos${nWish ? ` · ${nWish}` : ''}</button>
        <button data-act="mode" data-id="friends" aria-pressed="${state.mode === 'friends'}">Amigos${state.friends.length ? ` · ${state.friends.length}` : ''}</button></div>
        ${state.mode !== 'friends' ? tabsHTML(items, coll) : '<div style="height:12px"></div>'}`;
    }

    if (!friend && state.mode === 'friends') renderFriends();
    else renderShelf(items, coll, !!friend);

    if (friend) {
      $dock.innerHTML = `<span>Solo lectura · toca una caja para verla</span><button class="btn btn-ghost" data-act="closeFriend">Cerrar</button>`;
    } else if (state.mode === 'friends') {
      $dock.innerHTML = `<span>Enséñales la tuya</span><button class="btn btn-amber" data-act="share">${I.share}Compartir</button>`;
    } else if (state.mode === 'wish') {
      $dock.innerHTML = `<span>Lo que te gustaría tener</span><button class="btn btn-amber" data-act="add" aria-label="Añadir a la lista de deseos">${I.plus}Deseo</button>`;
    } else {
      $dock.innerHTML = `<span>${items.length ? (viewMode() === 'feed' ? 'Desliza hacia abajo' : 'Desliza el dedo sobre la balda') : 'Empieza tu colección'}</span><button class="btn btn-amber" data-act="add" aria-label="Añadir a la colección">${I.plus}Añadir</button>`;
    }
  }

  function shelfWidth() { return Math.min(window.innerWidth, 560) - 36; }

  function pack(list, max) {
    const rows = []; let cur = []; let w = 0;
    for (const it of list) {
      const p = PLAT[it.plat];
      const iw = it.face ? p.w + 15 : p.sw + 3;
      if (cur.length && w + iw > max) { rows.push({ items: cur, w }); cur = []; w = 0; }
      cur.push(it); w += iw;
    }
    if (cur.length) rows.push({ items: cur, w });
    return rows;
  }

  // La portada completa de GameTDB es contraportada | lomo | portada
  function fullPart(it, pos) {
    return `<div class="full-part" style="background-image:url('${cssUrl(it.full)}');background-position:${pos} 0"></div>`;
  }
  // Películas: el cartel (2:3) se ve entero; el hueco se rellena con el propio cartel
  // desenfocado, y las de Blu-ray llevan arriba su franja azul como las cajas reales.
  function posterFit(url, alt) {
    return `<div class="pfit"><div class="pfit-bg" style="background-image:url('${cssUrl(url)}')"></div><img class="pfit-img" src="${esc(url)}" alt="${esc(alt || '')}" loading="lazy" decoding="async" draggable="false"></div>`;
  }
  function movieFront(it, alt) {
    const band = it.plat === 'bluray' ? '<div class="br-band"><span>BLU-RAY DISC</span></div>' : '';
    const art = it.front ? posterFit(it.front, alt) : `<div class="noart" style="background:${colorFor(it.title)}"><span>${esc(it.title)}</span></div>`;
    return `<div class="mfront">${band}<div class="mart">${art}</div></div>`;
  }
  function coverInner(it) {
    if (it.kind === 'movie') return movieFront(it, '');
    if (it.kind === 'comic' && !it.front) return comicCover(it, 10);
    if (!it.front && it.full) return fullPart(it, '100%');
    return it.front
      ? `<img src="${esc(it.front)}" alt="" loading="lazy" decoding="async">`
      : `<div style="position:absolute;inset:0;display:flex;align-items:flex-end;padding:8px;background:${colorFor(it.title)};font:800 11px/1.05 var(--serif);color:#fff">${esc(it.title)}</div>`;
  }

  function itemHTML(it, tilt, badge) {
    const p = PLAT[it.plat];
    const label = esc(`${it.title}, ${p.short}${badge ? ', tú también lo tienes' : ''}`);
    const mark = badge ? `<i class="both" aria-hidden="true">${I.check}</i>` : '';
    const cls = it.wish ? ' wish' : '';
    if (it.face) {
      return `<button class="item front${cls}${p.book ? ' book' : ''}" data-act="open" data-uid="${esc(it.uid)}" aria-label="${label}">${mark}
        <div class="case" style="width:${p.w}px;height:${p.h}px;background:${p.caseColor}">
          <div class="cover">${coverInner(it)}</div></div></button>`;
    }
    return `<button class="item spine${cls}${p.book ? ' book' : ''}" data-act="open" data-uid="${esc(it.uid)}" aria-label="${label}" style="transform:rotate(${tilt}deg)">${mark}
      <div class="body" style="width:${p.sw}px;height:${p.h}px;background:${p.caseColor}">${spineInner(it, p)}</div></button>`;
  }
  // Lomo: el escaneado oficial si existe (lomo suelto o la carátula completa abierta);
  // si no, uno hecho a imagen del oficial: franja de la consola arriba y el arte debajo
  const SPINE_BAND = {
    ds: ['#f4f4f4', '#6b6b6b', 'DS'], '3ds': ['#f4f4f4', '#c8102e', '3DS'],
    switch: ['#e60012', '#fff', 'sw'], switch2: ['#e60012', '#fff', 'sw2'],
    ps4: ['#003791', '#fff', 'PS4'], ps5: ['#f4f4f4', '#111', 'PS5'],
    dvd: ['#111', '#eee', 'DVD'], bluray: ['#0b5cad', '#fff', 'Blu-ray']
  };
  const SW_LOGO = (c) => `<svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true"><rect x=".6" y=".6" width="4" height="8.8" rx="2" fill="none" stroke="${c}" stroke-width="1.1"/><circle cx="2.6" cy="3" r=".9" fill="${c}"/><path d="M5.5 .6h1.9a2 2 0 0 1 2 2v4.8a2 2 0 0 1-2 2H5.5z" fill="${c}"/><circle cx="7.4" cy="6.4" r=".9" fill="#e60012"/></svg>`;
  function spineInner(it, p) {
    if (it.kind === 'comic') return comicSpine(it, p);
    // La carátula completa de GameTDB es la edición española/europea: va primero
    if (it.full) return `<div class="sp-real" style="background-image:url('${cssUrl(it.full)}');background-size:${2 * p.w + p.sw}px ${p.h}px"></div>`;
    if (it.spine) return `<div class="sp-real" style="background-image:url('${cssUrl(it.spine)}')"></div>`;
    const [bg, fg, txt] = SPINE_BAND[it.plat] || ['#222', '#fff', p.short];
    const logo = txt.startsWith('sw') ? SW_LOGO(fg) + (txt === 'sw2' ? '<b style="color:#fff">2</b>' : '') : `<b style="color:${fg}">${esc(txt)}</b>`;
    const art = it.front ? `background-image:url('${cssUrl(it.front)}')` : `background:${colorFor(it.title)}`;
    return `<div class="sp-band" style="background:${bg}">${logo}</div><div class="art" style="${art}"><span>${esc(it.title)}</span></div>`;
  }

  const SORTS = [['title', 'A–Z'], ['added', 'Recientes'], ['year', 'Año'], ['plat', 'Consola']];
  function sortList(list) {
    const s = state.filter.sort;
    const ck = (i) => norm(i.kind === 'comic' && i.series ? i.series : i.title);
    const t = (a, b) => (a.kind === 'comic' || b.kind === 'comic')
      ? ck(a).localeCompare(ck(b), 'es') || (parseFloat(a.num) || 0) - (parseFloat(b.num) || 0) || byTitle(a, b)
      : byTitle(a, b);
    if (s === 'added') return list.sort((a, b) => (b.added || 0) - (a.added || 0) || t(a, b));
    if (s === 'year') return list.sort((a, b) => (b.year || 0) - (a.year || 0) || t(a, b));
    if (s === 'plat') return list.sort((a, b) => a.plat.localeCompare(b.plat) || t(a, b));
    return list.sort(t);
  }
  function filtered(list, readOnly) {
    const f = state.filter; const q = norm(f.q);
    return list.filter((i) => (!q || norm(i.title).includes(q)) &&
      (!f.genre || itemGenres(i).includes(f.genre)) &&
      (!readOnly || !f.notMine || !ownMatch(i)));
  }

  function renderShelf(items, coll, readOnly) {
    const all = items.filter((i) => PLAT[i.plat] && PLAT[i.plat].coll === coll.id);
    const genres = [...new Set(all.flatMap(itemGenres))].sort((a, b) => a.localeCompare(b, 'es'));
    if (state.filter.genre && !genres.includes(state.filter.genre)) state.filter.genre = '';
    const wish = readOnly ? state.friendWish : state.mode === 'wish';
    const noun = wish ? ['deseo', 'deseos'] : coll.noun;
    const head = `<div class="wall-head"><h2>${esc(wish ? (readOnly ? 'Sus deseos' : 'Mis deseos') : coll.full)}</h2><span>${plural(all.length, noun)}</span></div>`;
    const sOpen = state.searchOpen || !!state.filter.q;
    const gVal = state.filter.notMine ? '__nm' : state.filter.genre;
    const gSel = genres.length || readOnly ? `<label class="sort gsel ${gVal ? 'on' : ''}"><span class="sr">Filtrar por género</span><select id="genreSel">
        <option value="">Todos los géneros</option>${readOnly ? `<option value="__nm" ${gVal === '__nm' ? 'selected' : ''}>Los que no tengo</option>` : ''}
        ${genres.map((g) => `<option value="${esc(g)}" ${gVal === g ? 'selected' : ''}>${esc(g)}</option>`).join('')}</select></label>` : '';
    const tools = all.length ? `<div class="shelf-tools">${sOpen
      ? `<label class="mini-search">${I.search}<span class="sr">Buscar en esta balda</span><input id="shelfQ" type="search" placeholder="Buscar en la balda" value="${esc(state.filter.q)}" autocomplete="off" enterkeyhint="search"></label>
        <button class="tool-btn" data-act="closeSearch" aria-label="Cerrar la búsqueda">${I.close}</button>`
      : `<button class="tool-btn" data-act="openSearch" aria-label="Buscar en esta balda">${I.search}</button>${gSel}
        <label class="sort"><span class="sr">Ordenar</span><select id="sortSel">${SORTS.map(([v, n]) => `<option value="${v}" ${state.filter.sort === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label>`}</div>` : '';
    const nag = !readOnly && !wish && backupDue()
      ? `<div class="nag" role="status"><div><b>Guarda una copia de tu colección</b><span>${lastBackup() ? `La última es del ${esc(fmtDate(lastBackup()))}.` : 'Si cambias de móvil, la recuperas en un momento.'}</span></div>
        <div class="row"><button class="btn btn-amber" data-act="export">${I.download}Guardar</button><button class="btn btn-ghost" data-act="nagLater">Ahora no</button></div></div>` : '';
    $content.innerHTML = head + nag + tools + '<div id="shelfRows"></div>';
    const q = document.getElementById('shelfQ');
    if (q) q.addEventListener('input', () => { state.filter.q = q.value; renderRows(all, coll, readOnly, wish); });
    const sel = document.getElementById('sortSel');
    if (sel) sel.addEventListener('change', () => { state.filter.sort = sel.value; LS.set('ludo.sort', sel.value); renderRows(all, coll, readOnly, wish); });
    const gs = document.getElementById('genreSel');
    if (gs) gs.addEventListener('change', () => {
      state.filter.notMine = gs.value === '__nm'; state.filter.genre = gs.value === '__nm' ? '' : gs.value;
      gs.parentNode.classList.toggle('on', !!gs.value); renderRows(all, coll, readOnly, wish);
    });
    renderRows(all, coll, readOnly, wish);
  }

  // ---------- Lupa al deslizar por la balda ----------
  // Deslizar en horizontal sobre una balda agranda las cajas bajo el dedo y muestra
  // su título; al soltar, la caja queda sacada y un toque la abre. En vertical, la
  // página se desplaza como siempre.
  let picked = null; let suppressClick = 0;
  function clearPick() {
    document.querySelectorAll('.item.picked').forEach((e) => e.classList.remove('picked'));
    const tip = document.getElementById('scrubTip'); if (tip) tip.remove();
    picked = null;
  }
  function showTip(el, x, live) {
    const it = el && shownItems().find((i) => i.uid === el.dataset.uid); if (!it) return;
    let tip = document.getElementById('scrubTip');
    if (!tip) { tip = document.createElement('button'); tip.id = 'scrubTip'; tip.className = 'scrub-tip'; tip.dataset.act = 'openPicked'; $app.appendChild(tip); }
    tip.dataset.uid = it.uid;
    tip.classList.toggle('live', !!live);
    tip.setAttribute('aria-label', `Abrir ${it.title}`);
    tip.innerHTML = `${it.front ? `<img src="${esc(it.front)}" alt="">` : `<i style="background:${colorFor(it.title)}"></i>`}
      <span><b>${esc(it.title)}</b><small>${esc(PLAT[it.plat].short)}${it.year ? ' · ' + esc(it.year) : ''}${live ? '' : ' · toca para abrir'}</small></span>`;
    const appR = $app.getBoundingClientRect(); const r = el.getBoundingClientRect();
    const w = Math.min(280, appR.width - 24);
    let left = (x != null ? x : r.left + r.width / 2) - appR.left - w / 2;
    left = Math.max(12, Math.min(appR.width - w - 12, left));
    tip.style.width = `${w}px`; tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(8, r.top - appR.top - 86)}px`;
  }
  function setScrub(row, idx) {
    row.querySelectorAll('.item').forEach((e, i) => {
      const d = Math.abs(i - idx);
      e.classList.toggle('s0', d === 0); e.classList.toggle('s1', d === 1); e.classList.toggle('s2', d === 2);
    });
  }
  function bindScrub(row) {
    let st = null;
    const itemAt = (x) => {
      const items = [...row.querySelectorAll('.item')]; let idx = -1; let best = Infinity;
      items.forEach((el, i) => {
        const r = el.getBoundingClientRect();
        const d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
        if (d < best) { best = d; idx = i; }
      });
      return { items, idx };
    };
    row.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      st = { x: e.clientX, y: e.clientY, id: e.pointerId, mode: null, idx: -1 };
    });
    row.addEventListener('pointermove', (e) => {
      if (!st || e.pointerId !== st.id) return;
      const dx = e.clientX - st.x; const dy = e.clientY - st.y;
      if (!st.mode) {
        if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
          st.mode = 'scrub'; clearPick();
          try { row.setPointerCapture(e.pointerId); } catch (err) { /* sin captura */ }
          row.classList.add('scrubbing');
        } else if (Math.abs(dy) > 8) { st = null; return; } else return;
      }
      const { items, idx } = itemAt(e.clientX);
      if (idx < 0) return;
      if (idx !== st.idx) { st.idx = idx; setScrub(row, idx); if (navigator.vibrate) navigator.vibrate(6); }
      showTip(items[idx], e.clientX, true);
    });
    const end = (e) => {
      if (!st || e.pointerId !== st.id) return;
      if (st.mode === 'scrub') {
        const el = row.querySelectorAll('.item')[st.idx];
        row.classList.remove('scrubbing'); setScrub(row, -99);
        if (el) { el.classList.add('picked'); picked = el.dataset.uid; showTip(el, null, false); }
        suppressClick = performance.now();
      }
      st = null;
    };
    row.addEventListener('pointerup', end);
    row.addEventListener('pointercancel', (e) => { if (st && st.mode === 'scrub') end(e); else st = null; });
  }

  function renderRows(all, coll, readOnly, wish) {
    clearPick();
    const $rows = document.getElementById('shelfRows'); if (!$rows) return;
    const list = sortList(filtered(all, readOnly));
    if (!all.length) {
      const msg = readOnly
        ? `<div class="empty"><h3>Balda vacía</h3><p>${wish ? 'No tiene deseos en esta balda.' : 'Todavía no tiene nada en esta estantería.'}</p></div>`
        : wish
          ? `<div class="empty"><h3>Sin deseos todavía</h3><p>Apunta aquí los juegos y películas que te gustaría tener. Se verán en tus estanterías como cajas transparentes y tus amigos los verán al compartir.</p><button class="btn btn-amber" data-act="add">${I.plus}Añadir un deseo</button></div>`
          : `<div class="empty"><h3>Esta balda está vacía</h3><p>Busca por título y la caja aparecerá aquí con su portada y su contraportada.</p><button class="btn btn-amber" data-act="add">${I.plus}Añadir el primero</button></div>`;
      $rows.innerHTML = `<div class="shelf"><div class="shelf-row" style="min-height:60px"></div><div class="plank"></div><div class="plank-under"></div></div>` + msg;
      return;
    }
    if (!list.length) { $rows.innerHTML = `<p class="hint" style="text-align:center;margin:28px 20px">Nada coincide con el filtro.</p>`; return; }
    if (viewMode() === 'feed') { $rows.innerHTML = feedHTML(list, readOnly); return; }
    const max = shelfWidth();
    $rows.innerHTML = pack(list, max).map((r) => {
      const last = r.items[r.items.length - 1];
      return `<div class="shelf"><div class="shelf-row">${r.items.map((it) =>
        itemHTML(it, it === last && !it.face && max - r.w > 40 ? 9 : 0, readOnly && !it.wish && !!ownMatch(it))).join('')}</div><div class="plank"></div><div class="plank-under"></div></div>`;
    }).join('');
    $rows.querySelectorAll('.shelf-row').forEach(bindScrub);
    fillShelves($rows, coll);
  }
  // Vista «carrusel»: portadas grandes, una tras otra, deslizando hacia abajo
  const viewMode = () => (LS.get('ludo.view', 'shelf') === 'feed' ? 'feed' : 'shelf');
  function feedHTML(list, readOnly) {
    const W = Math.min(window.innerWidth * 0.74, 330);
    return `<div class="feed">${list.map((it) => {
      const p = PLAT[it.plat]; const k = W / p.w; const both = readOnly && !it.wish && !!ownMatch(it);
      const meta = it.kind === 'comic' ? [it.series ? `${it.series}${it.num ? ` nº ${it.num}` : ''}` : '', it.authors].filter(Boolean).join(' · ')
        : [p.short, it.year].filter(Boolean).join(' · ');
      return `<div class="fcard"><button class="fc-hit${it.wish ? ' wish' : ''}${p.book ? ' book' : ''}" data-act="open" data-uid="${esc(it.uid)}" aria-label="${esc(it.title)}" style="width:${Math.round(W)}px;height:${Math.round(p.h * k)}px">
        ${both ? `<i class="both" aria-hidden="true">${I.check}</i>` : ''}
        <div class="case" style="width:${p.w}px;height:${p.h}px;background:${p.caseColor};transform:scale(${k.toFixed(4)})"><div class="cover">${coverInner(it)}</div></div></button>
        <div class="fc-meta"><b>${esc(it.title)}</b><span>${esc(meta)}${it.wish ? ' · lo quieres' : ''}</span></div></div>`;
    }).join('')}</div>`;
  }
  // Baldas vacías hasta el final de la pantalla: siempre parece una estantería
  function fillShelves($rows, coll) {
    const h = Math.max(...Object.values(PLAT).filter((p) => p.coll === coll.id).map((p) => p.h)) + 8;
    const empty = `<div class="shelf empty-shelf" aria-hidden="true"><div class="shelf-row" style="min-height:${h}px"></div><div class="plank"></div><div class="plank-under"></div></div>`;
    const bottom = () => $rows.getBoundingClientRect().bottom - $content.getBoundingClientRect().top + $content.scrollTop;
    let n = 0; const want = $content.scrollHeight > $content.clientHeight ? 0 : $content.clientHeight - 90;
    while (n < 8 && ($rows.querySelectorAll('.shelf').length < 3 || bottom() < want)) { $rows.insertAdjacentHTML('beforeend', empty); n += 1; }
  }

  function renderFriends() {
    if (!state.friends.length) {
      $content.innerHTML = `<div class="friends"><div class="empty" style="margin:16px 0 0"><h3>Aún no tienes amigos aquí</h3>
        <p>Cuando un amigo te mande el enlace de su estantería y lo abras, aparecerá en esta lista para que la cotillees cuando quieras.</p>
        <button class="btn btn-amber" data-act="share">${I.share}Mandar la mía</button></div></div>`;
      return;
    }
    const sorted = state.friends.slice().sort((a, b) => b.received - a.received);
    $content.innerHTML = `<div class="friends">${sorted.map((f) => {
      const own = f.items.filter((i) => !i.wish);
      const common = own.filter((i) => ownMatch(i)).length;
      const by = COLLS.map((c) => [c, own.filter((i) => PLAT[i.plat].coll === c.id).length]).filter((x) => x[1]);
      const covers = own.filter((i) => i.front).slice(0, 3).map((i) => `<img src="${esc(i.front)}" alt="" loading="lazy">`).join('');
      return `<div class="friend"><button class="open" data-act="openFriend" data-id="${esc(f.id)}">
        <b>${esc(f.name)}</b><small>${by.map(([c, n]) => `${esc(c.name)} ${n}`).join(' · ') || 'Estantería vacía'}</small>
        <small>${common ? `${common} en común · ` : ''}Actualizada el ${esc(fmtDate(f.received))}</small></button>
        <div class="mini-covers" aria-hidden="true">${covers}</div>
        <button class="icon-btn" data-act="removeFriend" data-id="${esc(f.id)}" aria-label="Quitar a ${esc(f.name)}">${I.trash}</button></div>`;
    }).join('')}<p class="hint" style="text-align:center">Para ver sus novedades, pídeles que te vuelvan a mandar su enlace.</p></div>`;
  }

  // ---------- Detalle de una caja (v2: caja física en 3D) ----------
  function ownedSame(it) {
    return state.items.find((m) => m.kind === it.kind && m.plat === it.plat && String(m.ref) === String(it.ref));
  }

  const PRESET = { front: { x: 4, y: 18 }, back: { x: 4, y: 198 } };
  const fx = { rx: 4, ry: -16, tx: 0, ty: 0, drag: null, raf: 0, moved: false };

  function artBg(it) {
    if (it.full) return `background-image:url('${cssUrl(it.full)}');background-size:auto 100%;background-position:50% 0`;
    return it.front ? `background-image:url('${cssUrl(it.front)}')` : `background:${colorFor(it.title)}`;
  }

  function face(cls, w, h, t, inner, extra) {
    return `<div class="bf ${cls}" style="width:${w}px;height:${h}px;left:${-w / 2}px;top:${-h / 2}px;transform:${t};${extra || ''}">${inner}</div>`;
  }

  // ---------- Cómics: portada, lomo y contraportada cuando no hay imagen ----------
  const comicLine = (it) => [it.series ? `${it.series}${it.num ? ` nº ${it.num}` : ''}` : (it.num ? `Nº ${it.num}` : ''), it.authors].filter(Boolean).join(' · ');
  function comicCover(it, fs) {
    return `<div class="ccover" style="--c:${colorFor(it.series || it.title)};font-size:${fs}px">
      <div class="cc-top">${esc(it.publisher || '')}${it.num ? `<b>${esc(it.num)}</b>` : ''}</div>
      <div class="cc-title">${esc(it.title)}</div>${it.series ? `<div class="cc-ser">${esc(it.series)}</div>` : ''}
      <div class="cc-auth">${esc(it.authors || '')}</div></div>`;
  }
  function comicSpine(it, p) {
    const col = colorFor(it.series || it.publisher || it.title);
    if (it.plat === 'grapa') return `<div class="art" style="${it.front ? `background-image:url('${cssUrl(it.front)}')` : `background:${col}`}"></div>`;
    return `<div class="cs" style="background:${col}">${it.num ? `<div class="cs-num">${esc(it.num)}</div>` : '<div class="cs-cap"></div>'}
      <div class="cs-t"><span>${esc(it.title)}</span></div>${it.publisher ? `<div class="cs-pub">${esc(it.publisher.split(/[ /]/)[0].slice(0, 8))}</div>` : ''}</div>`;
  }
  function comicBack(it, fs) {
    return `<div class="cback" style="--c:${colorFor(it.series || it.title)};font-size:${fs}px">
      ${it.front ? `<div class="cb-art" style="background-image:url('${cssUrl(it.front)}')"></div>` : ''}
      <div class="cb-body"><div class="cb-title">${esc(it.title)}</div>
      ${it.series ? `<p>${esc(it.series)}${it.num ? ` · nº ${esc(it.num)}` : ''}</p>` : ''}
      ${it.cinfo && it.cinfo.syn ? `<p class="cb-syn">${esc(it.cinfo.syn)}</p>` : comicBusy[it.uid] ? '<p class="cb-syn wait">Buscando la sinopsis…</p>' : ''}
      ${it.authors ? `<p class="cb-auth">${esc(it.authors)}</p>` : ''}
      <div class="mb-grow"></div>
      <div class="cb-foot">${esc([it.publisher, it.year].filter(Boolean).join(' · '))}${it.isbn ? `<br>ISBN ${esc(it.isbn)}` : ''}${it.cinfo && it.cinfo.syn ? `<span class="cb-src">Texto: ${esc(it.cinfo.src)}</span>` : ''}</div></div></div>`;
  }

  function plainBack(p) {
    return `<div class="plain-back"><div class="pb-mold"></div><div class="pb-note">Contraportada no disponible en el catálogo</div></div>`;
  }

  function genericDisc(it, p, size) {
    return `<div class="gdisc" style="width:${size}px;height:${size}px" role="img" aria-label="Disco">
      <span class="gd-t">${esc(it.title)}</span><span class="gd-p">${esc(p.short)}</span><i class="gd-hole"></i></div>`;
  }
  function discEl(it, p, size) {
    if (it.media) return `<img class="disc-img" src="${esc(it.media)}" alt="Disco de ${esc(it.title)}" style="width:${size}px;height:${size}px">`;
    const still = it.kind === 'movie' && it.tmdb && it.tmdb.backdrops && it.tmdb.backdrops[0];
    if (still) {
      // Disco serigrafiado con un fotograma de la película
      return `<div class="gdisc pdisc" style="width:${size}px;height:${size}px;background-image:url('${cssUrl(still)}')" role="img" aria-label="Disco">
        <span class="gd-t">${esc(it.title)}</span><span class="gd-p">${esc(p.short)}</span><i class="gd-hole"></i></div>`;
    }
    return genericDisc(it, p, size);
  }
  // Contraportada de película montada con datos reales de TMDB
  const fmtRuntime = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim() : `${m} min`);
  function movieBack(it) {
    const t = it.tmdb;
    if (!t) return `<div class="plain-back"><div class="pb-mold"></div><div class="pb-note">${tmdbBusy[it.uid] ? 'Preparando la contraportada…' : 'Contraportada no disponible'}</div></div>`;
    const band = it.plat === 'bluray' ? '<div class="br-band"><span>BLU-RAY DISC</span></div>' : '<div class="dvd-band"><span>DVD</span></div>';
    const stills = (t.backdrops || []).slice(0, 3);
    const cast = (t.cast || []).slice(0, 3).map((c) => c.name).join(', ');
    return `<div class="mback">${band}<div class="mb-body">
      <div class="mb-title">${esc(it.title)}</div>
      ${t.overview ? `<p class="mb-syn">${esc(t.overview)}</p>` : ''}
      ${stills.length ? `<div class="mb-stills">${stills.map((b) => `<div style="background-image:url('${cssUrl(b)}')"></div>`).join('')}</div>` : ''}
      <p class="mb-cred">${t.director ? `${t.type === 'tv' ? 'Una serie de' : 'Una película de'} <b>${esc(t.director)}</b>` : ''}${t.director && cast ? ' · ' : ''}${cast ? `Con <b>${esc(cast)}</b>` : ''}</p>
      <div class="mb-grow"></div>
      <div class="mb-foot">${t.cert ? `<span class="mb-cert">${esc(t.cert)}</span>` : ''}
        <span class="mb-info">${esc([t.runtime ? fmtRuntime(t.runtime) : '', itemGenres(it).slice(0, 2).join(', ')].filter(Boolean).join(' · '))}<br>${esc([t.country, it.year].filter(Boolean).join(' · '))}</span>
        <span class="mb-src">Datos e imágenes de TMDB</span></div></div></div>`;
  }
  function cartEl(it, p, w, h) {
    if (it.media) return `<img class="cart-img" src="${esc(it.media)}" alt="Cartucho de ${esc(it.title)}" style="max-width:${w}px;max-height:${h}px">`;
    return `<div class="gcart" style="width:${w}px;height:${h}px" role="img" aria-label="Cartucho"><div class="gc-lab"><span>${esc(it.title)}</span></div></div>`;
  }
  const tabs2 = (side) => `<i class="clip ${side} t1"></i><i class="clip ${side} t2"></i>`;

  // Interior según el tipo de caja
  function insideParts(it, p, W, H) {
    let lid = ''; let tray = '';
    if (p.coll === 'sw') {
      // Switch: el cartucho va en su hueco en la cara interior de la tapa
      const cw = Math.round(W * 0.36); const ch = Math.round(cw * 1.22);
      lid = `<div class="well" style="width:${cw + 16}px;height:${ch + 16}px;top:${Math.round(H * 0.16)}px">${cartEl(it, p, cw, ch)}</div>`;
      tray = tabs2('l');
    } else if (p.media === 'cart') {
      // DS / 3DS: manual sujeto a la izquierda, cartucho en su ranura a la derecha
      const cw = Math.round(W * 0.42); const ch = Math.round(cw * (p.coll === 'nin' ? 1.08 : 1.2));
      lid = tabs2('r');
      tray = `<div class="well" style="width:${cw + 16}px;height:${ch + 16}px;top:${Math.round(H * 0.14)}px">${cartEl(it, p, cw, ch)}</div>`;
    } else {
      // PlayStation, DVD y Blu-ray: pestañas para el libreto y disco en el eje
      const ds = Math.round(Math.min(W * 0.88, H * 0.7));
      lid = tabs2('r');
      tray = `<div class="hub-ring" style="width:${ds + 10}px;height:${ds + 10}px"></div><div class="hub-disc">${discEl(it, p, ds)}</div><i class="hub"></i>`;
    }
    return { lid, tray };
  }

  function detailHTML() {
    const d = state.detail; const it = d.item; const p = PLAT[it.plat];
    const vw = Math.min(window.innerWidth, 560); const vh = window.innerHeight;
    const s = Math.min((vh * 0.46) / p.h, (vw * 0.66) / p.w);
    const W = Math.round(p.w * s); const H = Math.round(p.h * s); const D = Math.max(8, Math.round(W * p.depth));
    const rim = Math.max(3, Math.round(W * 0.025));
    const caseVar = `--case:${p.caseColor};--rim:${rim}px`;
    const frontInner = it.kind === 'movie' ? movieFront(it, `Portada de ${it.title}`) + '<i class="gloss"></i>' : (it.kind === 'comic' && !it.front) ? comicCover(it, Math.round(W * 0.075)) + '<i class="gloss"></i>' : (it.front ? `<img class="art" src="${esc(it.front)}" alt="Portada de ${esc(it.title)}" draggable="false">` : it.full ? fullPart(it, '100%') : `<div class="art noart" style="background:${colorFor(it.title)}"><span>${esc(it.title)}</span></div>`) + '<i class="gloss"></i>';
    const backInner = (it.back ? `<img class="art" src="${esc(it.back)}" alt="Contraportada de ${esc(it.title)}" draggable="false">` : it.full ? fullPart(it, '0%') : it.kind === 'movie' ? movieBack(it) : it.kind === 'comic' ? comicBack(it, Math.round(W * 0.05)) : plainBack(p)) + '<i class="gloss"></i>';
    const spineInner = it.kind === 'comic' ? `<div class="body sp-book">${comicSpine(it, p)}</div>` : `<div class="sp-art" style="${artBg(it)}"></div><span class="sp-t">${esc(it.title)}</span>`;
    const box = [
      face('bf-front', W, H, `translateZ(${D / 2}px)`, frontInner),
      face('bf-back', W, H, `rotateY(180deg) translateZ(${D / 2}px)`, backInner, it.kind === 'movie' ? `font-size:${Math.max(7, Math.round(W * 0.034))}px` : ''),
      face('bf-spine', D, H, `rotateY(-90deg) translateZ(${W / 2}px)`, spineInner),
      face('bf-edge', D, H, `rotateY(90deg) translateZ(${W / 2}px)`, ''),
      face('bf-cap', W, D, `rotateX(90deg) translateZ(${H / 2}px)`, ''),
      face('bf-cap', W, D, `rotateX(-90deg) translateZ(${H / 2}px)`, '')
    ].join('');

    const parts = insideParts(it, p, W, H);
    const sc = Math.min(1, (vw - 28) / (2 * W));
    const views = p.book ? [['front', 'Portada'], ['back', 'Contraportada']] : [['front', 'Portada'], ['back', 'Contraportada'], ['inside', 'Por dentro']];

    let actions;
    const zoomBtn = `<button class="btn btn-ghost sq" data-act="viewer" aria-label="Ver en grande">${I.zoom}</button>`;
    if (d.readOnly) {
      const mine = it.wish ? null : ownMatch(it);
      actions = `<div class="row">${mine
        ? `<button class="btn btn-ghost" disabled>${I.check}Tú también lo tienes</button>`
        : `<button class="btn btn-amber" data-act="copyToMine">${I.plus}Lo tengo</button><button class="btn btn-ghost" data-act="copyToWish">${I.heart}Lo quiero</button>`}${zoomBtn}</div>`;
    } else if (it.wish) {
      actions = `<div class="row"><button class="btn btn-amber" data-act="gotIt">${I.check}¡Ya lo tengo!</button>${zoomBtn}
        <button class="btn btn-ghost sq" data-act="altImages" aria-label="Elegir otra imagen">${I.images}</button>
        <button class="btn btn-danger sq" data-act="remove" aria-label="Quitar de la lista de deseos">${I.trash}</button></div>`;
    } else {
      actions = `<div class="row"><button class="btn btn-amber" data-act="toggleFace">${I.flip}${it.face ? 'De lado' : 'De frente'}</button>${zoomBtn}
        <button class="btn btn-ghost sq" data-act="altImages" aria-label="Elegir otra imagen">${I.images}</button>
        <button class="btn btn-danger sq" data-act="remove" aria-label="Quitar de mi colección">${I.trash}</button></div>`;
    }
    const gl = itemGenres(it);
    const genreRow = `<div class="genre-row">${gl.map((g) => `<span class="gchip">${esc(g)}</span>`).join('')}${d.readOnly ? '' : `<button class="gchip edit" data-act="editGenres">${I.tag}${gl.length ? 'Editar' : 'Añadir género'}</button>`}${d.readOnly || it.wish ? '' : valueChip(it)}</div>`;

    return `<div class="layer detail" role="dialog" aria-modal="true" aria-label="${esc(it.title)}">
      <div class="layer-head"><div style="display:flex;flex-direction:column;gap:6px;min-width:0">
        <span class="chip" style="background:${p.caseColor};color:${p.bandText}">${p.label}</span>
        <h2>${esc(it.title)}${it.year ? ` <span style="font-weight:600;font-size:16px;color:var(--soft)">${esc(it.year)}</span>` : ''}</h2>${it.kind === 'comic' && comicLine(it) ? `<p class="sub-h">${esc(comicLine(it))}</p>` : ''}${genreRow}</div>
        <button class="icon-btn" data-act="closeLayer" aria-label="Devolver a la estantería">${I.close}</button></div>
      <div class="stage" id="stage" style="${caseVar}">
        <div class="scene ${d.view === 'inside' ? 'hidden' : ''}" id="scene">
          <div class="floor" style="width:${Math.round(W * 1.1)}px;top:${Math.round(H / 2 + 8)}px;left:${-Math.round(W * 0.55)}px"></div>
          <div class="box anim ${p.book ? 'book' : ''}" id="box">${box}</div>
        </div>
        <div class="opened ${d.view === 'inside' ? '' : 'hidden'}" id="opened" style="width:${2 * W}px;height:${H}px;--W:${W}px;--sc:${sc}">
          <div class="tray plastic" style="left:${W}px;width:${W}px;height:${H}px">${parts.tray}</div>
          <div class="lid" id="lid" style="left:${W}px;width:${W}px;height:${H}px">
            <div class="lid-out" style="padding:${rim}px">${frontInner}</div>
            <div class="lid-in plastic">${parts.lid}</div>
          </div>
        </div>
      </div>
      <p class="drag-hint" id="dragHint">${d.view === 'inside' ? 'Así es por dentro' : 'Arrastra la caja para girarla'}</p>
      <div class="controls"><div class="seg" role="group" aria-label="Vista" style="grid-template-columns:repeat(${views.length}, minmax(0, 1fr))">${views.map(([id, n]) =>
        `<button data-act="view" data-id="${id}" aria-pressed="${d.view === id}">${n}</button>`).join('')}</div>${actions}</div>${fichaHandle(it)}</div>`;
  }

  // Aplica la rotación (con inclinación del móvil) y mueve el brillo
  function applyBox() {
    const box = document.getElementById('box'); if (!box) return;
    const rx = fx.rx + (fx.drag ? 0 : fx.ty); const ry = fx.ry + (fx.drag ? 0 : fx.tx);
    box.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg)`;
    const n = ((ry % 360) + 540) % 360 - 180; // -180..180
    const g = 50 + (Math.abs(n) > 90 ? (180 - Math.abs(n)) * Math.sign(n) : n) * 0.9;
    box.style.setProperty('--gx', `${g}%`);
    const showsBack = Math.abs(n) > 90;
    const want = showsBack ? 'back' : 'front';
    if (state.detail && state.detail.view !== 'inside' && state.detail.view !== want) {
      state.detail.view = want;
      $layers.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === want)));
    }
  }

  function goPreset(v) {
    const box = document.getElementById('box'); if (!box) return;
    box.classList.add('anim');
    // Tomamos el camino corto hasta la vista pedida
    const target = PRESET[v];
    let ty = target.y; while (ty - fx.ry > 180) ty -= 360; while (fx.ry - ty > 180) ty += 360;
    fx.rx = target.x; fx.ry = ty;
    applyBox();
  }

  function setView(v) {
    const d = state.detail; if (!d) return;
    const scene = document.getElementById('scene'); const opened = document.getElementById('opened');
    const hint = document.getElementById('dragHint');
    const prev = d.view; d.view = v;
    $layers.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === v)));
    if (v === 'inside') {
      scene.classList.add('hidden'); opened.classList.remove('hidden'); opened.classList.remove('open');
      if (hint) hint.textContent = 'Así es por dentro';
      void opened.offsetWidth; // fuerza el estado cerrado antes de abrir
      requestAnimationFrame(() => requestAnimationFrame(() => opened.classList.add('open')));
      if (navigator.vibrate) navigator.vibrate(15);
      return;
    }
    if (hint) hint.textContent = 'Arrastra la caja para girarla';
    if (prev === 'inside') {
      opened.classList.remove('open');
      setTimeout(() => {
        if (!state.detail || state.detail.view === 'inside') return;
        opened.classList.add('hidden'); scene.classList.remove('hidden');
        const box = document.getElementById('box'); box.classList.remove('anim');
        fx.rx = PRESET.front.x; fx.ry = PRESET.front.y; applyBox();
        requestAnimationFrame(() => goPreset(v));
      }, 650);
      return;
    }
    goPreset(v);
  }

  function bindStage() {
    const stage = document.getElementById('stage'); if (!stage) return;
    stage.addEventListener('pointerdown', (e) => {
      if (!state.detail || state.detail.view === 'inside') return;
      const box = document.getElementById('box'); if (!box) return;
      box.classList.remove('anim');
      fx.drag = { x: e.clientX, y: e.clientY, rx: fx.rx, ry: fx.ry, t: performance.now(), t0: performance.now(), vx: 0, lx: e.clientX };
      fx.dragMoved = false;
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', (e) => {
      if (!fx.drag) return;
      const dx = e.clientX - fx.drag.x; const dy = e.clientY - fx.drag.y;
      const now = performance.now();
      fx.drag.vx = (e.clientX - fx.drag.lx) / Math.max(1, now - fx.drag.t); fx.drag.lx = e.clientX; fx.drag.t = now;
      if (Math.abs(dx) + Math.abs(dy) > 8) fx.dragMoved = true;
      fx.ry = fx.drag.ry + dx * 0.55;
      fx.rx = Math.max(-35, Math.min(35, fx.drag.rx - dy * 0.35));
      if (Math.abs(dx) > 6 && !fx.moved) { fx.moved = true; const h = document.getElementById('dragHint'); if (h) h.style.opacity = '0'; }
      applyBox();
    });
    const end = () => {
      if (!fx.drag) return;
      const box = document.getElementById('box');
      const fling = fx.drag.vx * 110; // pequeño impulso al soltar
      const wasTap = !fx.dragMoved && performance.now() - fx.drag.t0 < 350;
      fx.drag = null;
      if (wasTap) { openViewer(); return; }
      if (box && Math.abs(fling) > 8) { box.classList.add('anim'); fx.ry += Math.max(-70, Math.min(70, fling)); }
      applyBox();
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    stage.addEventListener('dblclick', () => { if (state.detail && state.detail.view !== 'inside') goPreset('front'); });
  }

  // Inclinación del móvil: la caja y el brillo se mueven un poco
  let tiltOn = false;
  function onTilt(e) {
    if (!state.detail || e.gamma == null) return;
    const tx = Math.max(-12, Math.min(12, e.gamma * 0.35));
    const ty = Math.max(-10, Math.min(10, ((e.beta || 45) - 45) * -0.25));
    fx.tx += (tx - fx.tx) * 0.25; fx.ty += (ty - fx.ty) * 0.25;
    if (!fx.raf) fx.raf = requestAnimationFrame(() => { fx.raf = 0; if (!fx.drag && state.detail && state.detail.view !== 'inside') applyBox(); });
  }

  function openDetail(item, readOnly) {
    state.detail = { item, view: 'front', readOnly };
    state.layer = 'detail';
    fx.rx = PRESET.front.x; fx.ry = PRESET.front.y - 70; fx.tx = 0; fx.ty = 0; fx.moved = false; fx.drag = null;
    $layers.innerHTML = detailHTML();
    bindStage();
    const box = document.getElementById('box'); box.classList.remove('anim'); applyBox();
    requestAnimationFrame(() => requestAnimationFrame(() => goPreset('front')));
    if (!tiltOn && 'DeviceOrientationEvent' in window) { window.addEventListener('deviceorientation', onTilt); tiltOn = true; }
    if (item.kind === 'movie' && !item.tmdb) loadMovieData(item);
    if (item.kind === 'comic' && !(item.cinfo && item.cinfo.at)) loadComicData(item);
    bindFichaHandle();
  }

  function bindFichaHandle() {
    const h = $layers.querySelector('.ficha-handle'); if (!h) return; let y0 = null;
    h.addEventListener('pointerdown', (e) => { y0 = e.clientY; });
    h.addEventListener('pointerup', (e) => { if (y0 != null && y0 - e.clientY > 30) openFicha(); y0 = null; });
  }
  function rerenderDetail() {
    const v = state.detail.view;
    const subs = [...$layers.querySelectorAll('.sub')];
    $layers.innerHTML = detailHTML();
    subs.forEach((x) => $layers.appendChild(x));
    bindFichaHandle();
    bindStage();
    const box = document.getElementById('box'); if (box) { box.classList.remove('anim'); applyBox(); }
    if (v === 'inside') document.getElementById('opened').classList.add('open');
  }

  function closeLayer() {
    stopScanner();
    state.layer = null; state.detail = null; state.add = null;
    $layers.innerHTML = '';
  }

  // ---------- Capas sobre el detalle (visor, imágenes, géneros) ----------
  function openSub(html, cls) {
    const div = document.createElement('div');
    div.className = `layer sub ${cls || ''}`;
    div.setAttribute('role', 'dialog'); div.setAttribute('aria-modal', 'true');
    div.innerHTML = html;
    $layers.appendChild(div);
    return div;
  }
  function closeSub() { const subs = $layers.querySelectorAll('.sub'); if (subs.length) subs[subs.length - 1].remove(); }

  // Versiones grandes de cada imagen para el visor
  function hq(u) {
    if (!u) return u;
    return u.replace('/t/p/w500/', '/t/p/original/').replace(/\/(cover|back|coverfull)M\//, '/$1HQ/');
  }
  function viewerSlides(it) {
    const p = PLAT[it.plat]; const s = [];
    if (it.front) s.push(['Portada', it.front]);
    if (it.back) s.push(['Contraportada', it.back]);
    if (it.full) s.push(['Portada completa', it.full]);
    if (it.media) s.push([p.media === 'disc' ? 'Disco' : 'Cartucho', it.media]);
    return s;
  }
  function openViewer() {
    if (!state.detail) return;
    const sl = viewerSlides(state.detail.item);
    if (!sl.length) { toast('Esta caja no tiene imágenes para ampliar'); return; }
    const el = openSub(`<div class="v-top"><span id="vLabel">${esc(sl[0][0])} · 1/${sl.length}</span>
        <button class="icon-btn" data-act="closeSub" aria-label="Cerrar">${I.close}</button></div>
      <div class="v-track" id="vTrack">${sl.map(([n, u]) => `<div class="v-slide"><div class="v-zoom"><img src="${esc(hq(u))}" data-fallback="${esc(u)}" alt="${esc(n)}" draggable="false"></div></div>`).join('')}</div>
      <div class="v-dots" aria-hidden="true">${sl.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div>
      <p class="v-hint">${sl.length > 1 ? 'Desliza para ver más · ' : ''}pellizca o toca dos veces para ampliar</p>`, 'viewer');
    el.querySelectorAll('img[data-fallback]').forEach((img) => { img.onerror = () => { if (img.src !== img.dataset.fallback) img.src = img.dataset.fallback; }; });
    const track = el.querySelector('#vTrack');
    track.addEventListener('scroll', () => {
      const i = Math.round(track.scrollLeft / track.clientWidth);
      const lab = el.querySelector('#vLabel'); if (lab && sl[i]) lab.textContent = `${sl[i][0]} · ${i + 1}/${sl.length}`;
      el.querySelectorAll('.v-dots i').forEach((d, k) => d.classList.toggle('on', k === i));
    }, { passive: true });
    el.querySelectorAll('.v-zoom').forEach((z) => bindZoom(z, track));
  }
  function bindZoom(z, track) {
    const img = z.querySelector('img');
    const st = { s: 1, x: 0, y: 0, pts: new Map(), d0: 0, s0: 1, lastTap: 0, px: 0, py: 0 };
    const apply = () => {
      img.style.transform = `translate(${st.x}px, ${st.y}px) scale(${st.s})`;
      const zoomed = st.s > 1.02; z.classList.toggle('zoomed', zoomed); track.classList.toggle('locked', zoomed);
    };
    const reset = () => { st.s = 1; st.x = 0; st.y = 0; img.style.transition = 'transform .25s'; apply(); setTimeout(() => { img.style.transition = ''; }, 260); };
    z.addEventListener('pointerdown', (e) => {
      st.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (st.pts.size === 2) {
        const [a, b] = [...st.pts.values()];
        st.d0 = Math.hypot(a.x - b.x, a.y - b.y); st.s0 = st.s;
        z.setPointerCapture(e.pointerId);
      } else if (st.pts.size === 1) {
        st.px = e.clientX; st.py = e.clientY;
        const now = performance.now();
        if (now - st.lastTap < 300) {
          if (st.s > 1.02) reset(); else { st.s = 2.6; img.style.transition = 'transform .25s'; apply(); setTimeout(() => { img.style.transition = ''; }, 260); }
          st.lastTap = 0;
        } else st.lastTap = now;
        if (st.s > 1.02) z.setPointerCapture(e.pointerId);
      }
    });
    z.addEventListener('pointermove', (e) => {
      if (!st.pts.has(e.pointerId)) return;
      st.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (st.pts.size === 2) {
        const [a, b] = [...st.pts.values()];
        st.s = Math.max(1, Math.min(5, st.s0 * Math.hypot(a.x - b.x, a.y - b.y) / (st.d0 || 1)));
        apply();
      } else if (st.s > 1.02) {
        st.x += e.clientX - st.px; st.y += e.clientY - st.py; st.px = e.clientX; st.py = e.clientY;
        const lim = (z.clientWidth * (st.s - 1)) / 2; const limY = (z.clientHeight * (st.s - 1)) / 2;
        st.x = Math.max(-lim, Math.min(lim, st.x)); st.y = Math.max(-limY, Math.min(limY, st.y));
        apply();
      }
    });
    const up = (e) => { st.pts.delete(e.pointerId); if (!st.pts.size && st.s <= 1.02) reset(); };
    z.addEventListener('pointerup', up); z.addEventListener('pointercancel', up);
  }

  // ---------- Elegir otra imagen ----------
  const LANG_NAME = { ES: 'España', EN: 'Europa (inglés)', US: 'EE. UU.', FR: 'Francia', DE: 'Alemania', IT: 'Italia' };
  let imgFiles = {};
  async function loadImageList(plat) {
    if (!imgFiles[plat]) {
      imgFiles[plat] = fetch(`data/images-${plat}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    }
    return imgFiles[plat];
  }
  async function altCandidates(it) {
    const out = { front: [], back: [], media: [] };
    const push = (k, url, label, big) => { if (url && !out[k].some((c) => c.url === url)) out[k].push({ url, label, big: big || url }); };
    const ref = String(it.ref);
    if (ref.startsWith('t:')) {
      let g = null; try { g = await findGame(it.plat, ref); } catch (e) { g = null; }
      const ids = [ref.slice(2)].concat(((g && g.editions) || []).map((e) => e[0])).slice(0, 4);
      const sys = TDB_SYS[it.plat]; const jobs = [];
      for (const id of ids) {
        for (const l of ['ES', 'EN', 'US', 'FR', 'DE', 'IT']) {
          const base = `https://art.gametdb.com/${sys}`;
          const lab = `${LANG_NAME[l]}${id !== ids[0] ? ` · ${id}` : ''}`;
          jobs.push(probe(`${base}/coverM/${l}/${id}.jpg`).then((u) => u && push('front', u, lab, `${base}/coverHQ/${l}/${id}.jpg`)));
          jobs.push(probe(`${base}/backM/${l}/${id}.jpg`).then((u) => u && push('back', u, lab, `${base}/backHQ/${l}/${id}.jpg`)));
          jobs.push(probe(`${base}/cart/${l}/${id}.png`).then((u) => u && push('media', u, lab)));
        }
      }
      await Promise.all(jobs);
    } else if (typeof it.ref === 'number' || /^\d+$/.test(ref)) {
      const list = (await loadImageList(it.plat))[ref] || [];
      list.forEach(([code, region, file]) => push(code === 'f' ? 'front' : code === 'b' ? 'back' : 'media', imgUrl(file), region || 'Sin región'));
    } else if (it.kind === 'comic') {
      try {
        const q = it.series && !norm(it.title).includes(norm(it.series)) ? `${it.series} ${it.title}` : it.title;
        const j = await fetch(`${OL}/search.json?` + new URLSearchParams({ q, limit: '24', fields: 'cover_i,language' })).then((r) => r.json());
        (j.docs || []).filter((d) => d.cover_i).forEach((d) => push('front', olCover(d.cover_i, 'M'), (d.language || []).includes('spa') ? 'Español' : 'Otra edición', olCover(d.cover_i)));
      } catch (e) { /* sin conexión */ }
    } else if (ref.startsWith('tmdb:')) {
      const [, type, id] = ref.split(':');
      try {
        const r = await fetch(`https://api.themoviedb.org/3/${type}/${id}/images?` + new URLSearchParams({ api_key: TMDB_KEY, include_image_language: 'es,en,null' }));
        const j = await r.json();
        (j.posters || []).slice(0, 24).forEach((p) => push('front', 'https://image.tmdb.org/t/p/w185' + p.file_path, p.iso_639_1 === 'es' ? 'Español' : p.iso_639_1 === 'en' ? 'Inglés' : 'Sin texto', 'https://image.tmdb.org/t/p/w500' + p.file_path));
      } catch (e) { /* sin conexión */ }
    }
    [['front', it.front], ['back', it.back], ['media', it.media]].forEach(([k, u]) => { if (u && !out[k].some((c) => c.big === u || c.url === u)) out[k].unshift({ url: u, label: 'La actual', big: u }); });
    return out;
  }
  let altList = [];
  async function openAlt() {
    const it = state.detail.item; const p = PLAT[it.plat];
    const el = openSub(`<div class="layer-head"><h2>Elegir otra imagen</h2><button class="icon-btn" data-act="closeSub" aria-label="Cerrar">${I.close}</button></div>
      <div class="body scroll alt-body"><p class="hint">Buscando todas las versiones en los catálogos…</p></div>`, 'sheet');
    const c = await altCandidates(it);
    if (!el.isConnected) return;
    altList = [];
    const sec = (k, title) => {
      if (!c[k].length) return '';
      return `<h3 class="alt-h">${title}</h3><div class="alt-strip">${c[k].map((x) => {
        altList.push({ k, big: x.big });
        const cur = it[k] === x.big || it[k] === x.url;
        return `<button class="alt ${cur ? 'cur' : ''}" data-act="altPick" data-i="${altList.length - 1}" aria-label="${esc(title)}: ${esc(x.label)}"><img src="${esc(x.url)}" alt="" loading="lazy"><small>${esc(x.label)}</small></button>`;
      }).join('')}</div>`;
    };
    const html = sec('front', 'Portada') + sec('back', 'Contraportada') + (p.book ? '' : sec('media', p.media === 'disc' ? 'Disco' : 'Cartucho'));
    const mine = `<div class="photo-box"><button class="btn btn-amber" data-act="photo">${I.camera}Hacer una foto a tu portada</button>
      ${it.photo ? '<button class="btn btn-ghost" data-act="photoDel">Quitar mi foto</button>' : ''}<p class="hint">Se queda solo en este móvil. Tus amigos verán la del catálogo.</p></div>`;
    el.querySelector('.alt-body').innerHTML = mine + (html
      ? `<p class="hint">O toca la que coincida con tu caja. Se guarda al momento.</p>${html}`
      : `<p class="hint">No hay más imágenes de esta caja en los catálogos.${String(it.ref).startsWith('w:') ? ' Viene de Wikipedia, que solo tiene la portada.' : ''}</p>`);
  }
  async function pickAlt(i) {
    const a = altList[i]; const d = state.detail; if (!a || !d) return;
    const it = state.items.find((x) => x.uid === d.item.uid); if (!it) return;
    let url = a.big; const snapI = snapshot();
    if (url.includes('art.gametdb.com') && !(await probe(url))) url = url.replace(/\/(cover|back)HQ\//, '/$1M/');
    if (a.k === 'front' && it.photo) dropPhoto(it);
    it[a.k] = url;
    if (a.k === 'back') it.full = it.full || null;
    saveItems(); cacheImgs([url]);
    d.item = it; closeSub(); rerenderDetail(); render();
    toastUndo('Imagen cambiada', snapI);
  }

  // ---------- Fotos propias (se quedan en este móvil) ----------
  const Photos = (() => {
    let dbp = null;
    const db = () => dbp || (dbp = new Promise((ok, ko) => {
      const r = indexedDB.open('ludo-photos', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('p');
      r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error);
    }));
    const tx = async (mode, fn) => { const d = await db(); return new Promise((ok, ko) => { const t = d.transaction('p', mode); const req = fn(t.objectStore('p')); t.oncomplete = () => ok(req && req.result); t.onerror = () => ko(t.error); }); };
    return {
      put: (k, blob) => tx('readwrite', (st) => st.put(blob, k)),
      del: (k) => tx('readwrite', (st) => st.delete(k)),
      get: (k) => tx('readonly', (st) => st.get(k)),
      keys: () => tx('readonly', (st) => st.getAllKeys())
    };
  })();
  const photoURLs = {};
  function applyPhoto(it, key, blob) {
    if (!blob) return;
    if (photoURLs[key]) URL.revokeObjectURL(photoURLs[key]);
    const url = photoURLs[key] = URL.createObjectURL(blob);
    if (!it._url) it._orig = it.front || null;
    it._url = url; it.front = url; it.photo = key;
  }
  function dropPhoto(it) {
    if (!it.photo) return;
    Photos.del(it.photo).catch(() => {});
    if (it._url) { it.front = it._orig || null; }
    delete it._url; delete it._orig; delete it.photo;
  }
  async function loadPhotos() {
    const own = state.items.filter((i) => i.photo); if (!own.length && !window.indexedDB) return;
    try {
      const keys = new Set(await Photos.keys());
      for (const it of own) { if (keys.has(it.photo)) applyPhoto(it, it.photo, await Photos.get(it.photo)); else delete it.photo; }
      const used = new Set(state.items.map((i) => i.photo).filter(Boolean));
      keys.forEach((k) => { if (!used.has(k)) Photos.del(k).catch(() => {}); });
      if (own.length) render();
    } catch (e) { /* sin IndexedDB: se quedan las del catálogo */ }
  }
  // Elegir foto (cámara o galería) y encuadrarla con el formato de la caja
  function pickPhoto(aspect, done) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) openCropper(f, aspect, done); };
    inp.click();
  }
  let crop = null;
  function openCropper(file, aspect, done) {
    const url = URL.createObjectURL(file);
    const el = openSub(`<div class="layer-head"><h2>Encuadra la portada</h2><button class="icon-btn" data-act="closeSub" aria-label="Cerrar">${I.close}</button></div>
      <div class="body crop-body"><div class="crop-frame" id="cropFrame" style="aspect-ratio:${aspect}"><img id="cropImg" alt="" draggable="false"></div>
      <p class="hint">Arrastra para mover y pellizca para acercar.</p>
      <input type="range" id="cropZoom" min="1" max="4" step="0.01" value="1" aria-label="Zoom">
      <div class="row"><button class="btn btn-ghost" data-act="cropAgain">Otra foto</button><button class="btn btn-amber" data-act="cropSave">Guardar</button></div></div>`, 'sheet');
    const img = el.querySelector('#cropImg'); const frame = el.querySelector('#cropFrame'); const zoom = el.querySelector('#cropZoom');
    crop = { url, img, frame, aspect, done, x: 0, y: 0, z: 1, base: 1 };
    const fit = () => { const fw = frame.clientWidth, fh = frame.clientHeight; crop.base = Math.max(fw / img.naturalWidth, fh / img.naturalHeight); crop.x = (fw - img.naturalWidth * crop.base) / 2; crop.y = (fh - img.naturalHeight * crop.base) / 2; draw(); };
    const clamp = () => { const fw = frame.clientWidth, fh = frame.clientHeight; const w = img.naturalWidth * crop.base * crop.z, h = img.naturalHeight * crop.base * crop.z; crop.x = Math.min(0, Math.max(fw - w, crop.x)); crop.y = Math.min(0, Math.max(fh - h, crop.y)); };
    const draw = () => { clamp(); img.style.transform = `translate(${crop.x}px, ${crop.y}px) scale(${crop.base * crop.z})`; };
    const zoomTo = (z, cx, cy) => { z = Math.max(1, Math.min(4, z)); const k = z / crop.z; crop.x = cx - (cx - crop.x) * k; crop.y = cy - (cy - crop.y) * k; crop.z = z; zoom.value = z; draw(); };
    img.onload = fit; img.src = url;
    zoom.addEventListener('input', () => zoomTo(Number(zoom.value), frame.clientWidth / 2, frame.clientHeight / 2));
    const pts = new Map(); let last = null;
    frame.addEventListener('pointerdown', (e) => { frame.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); last = null; });
    frame.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
      if (pts.size === 1) { crop.x += e.clientX - prev[0]; crop.y += e.clientY - prev[1]; draw(); return; }
      const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const r = frame.getBoundingClientRect();
      if (last) zoomTo(crop.z * d / last, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top);
      last = d;
    });
    const up = (e) => { pts.delete(e.pointerId); last = null; };
    frame.addEventListener('pointerup', up); frame.addEventListener('pointercancel', up);
  }
  function cropSave() {
    if (!crop || !crop.img.naturalWidth) return;
    const H = 900; const W = Math.round(H * crop.aspect);
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const k = W / crop.frame.clientWidth; const sc = crop.base * crop.z * k;
    const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.drawImage(crop.img, crop.x * k, crop.y * k, crop.img.naturalWidth * sc, crop.img.naturalHeight * sc);
    const c = crop; crop = null;
    cv.toBlob((blob) => { URL.revokeObjectURL(c.url); closeSub(); if (blob) c.done(blob); }, 'image/jpeg', 0.85);
  }
  const coverAspect = (it) => { const p = PLAT[it.plat]; return p.book ? p.w / p.h : p.w / (p.h - 13); };
  async function setPhoto(it, blob) {
    const key = 'p:' + it.uid + ':' + Date.now();
    try { await Photos.put(key, blob); } catch (e) { toast('No se ha podido guardar la foto en este móvil'); return false; }
    if (it.photo) Photos.del(it.photo).catch(() => {});
    applyPhoto(it, key, blob); saveItems(); return true;
  }
  function photoForDetail() {
    const it = state.items.find((x) => x.uid === state.detail.item.uid); if (!it) return;
    pickPhoto(coverAspect(it), async (blob) => {
      if (!(await setPhoto(it, blob))) return;
      state.detail.item = it; closeSub(); rerenderDetail(); render(); toast('Portada cambiada por tu foto');
    });
  }

  // ---------- Géneros y etiquetas ----------
  const GAME_GENRES = ['Acción', 'Aventura', 'Rol', 'Plataformas', 'Puzle', 'Carreras', 'Deportes', 'Lucha', 'Disparos', 'Estrategia', 'Simulación', 'Party', 'Música', 'Terror', 'Sigilo', 'Educativo', 'Arcade'];
  const MOVIE_GENRES = ['Acción', 'Aventura', 'Animación', 'Comedia', 'Crimen', 'Documental', 'Drama', 'Familia', 'Fantasía', 'Historia', 'Terror', 'Música', 'Misterio', 'Romance', 'Ciencia ficción', 'Suspense', 'Bélica', 'Western'];
  const TMDB_GENRES = { 28: 'Acción', 12: 'Aventura', 16: 'Animación', 35: 'Comedia', 80: 'Crimen', 99: 'Documental', 18: 'Drama', 10751: 'Familia', 14: 'Fantasía', 36: 'Historia', 27: 'Terror', 10402: 'Música', 9648: 'Misterio', 10749: 'Romance', 878: 'Ciencia ficción', 53: 'Suspense', 10752: 'Bélica', 37: 'Western', 10759: 'Acción', 10765: 'Ciencia ficción', 10768: 'Bélica', 10762: 'Familia' };
  const COMIC_GENRES = ['Ciencia ficción', 'Superhéroes', 'Fantasía', 'Terror', 'Policiaco', 'Bélico', 'Western', 'Aventura', 'Humor', 'Histórico', 'Drama', 'Autobiográfico', 'Europeo', 'Manga'];
  let gSel = [];
  function genreSheetHTML(it) {
    const base = it.kind === 'movie' ? MOVIE_GENRES : it.kind === 'comic' ? COMIC_GENRES : GAME_GENRES;
    const mine = state.items.filter((x) => x.kind === it.kind).flatMap(itemGenres);
    const all = [...new Set(base.concat(mine, gSel))];
    return `<div class="layer-head"><h2>Géneros y etiquetas</h2><button class="icon-btn" data-act="closeSub" aria-label="Cerrar">${I.close}</button></div>
      <div class="body scroll"><p class="hint">Marca los que encajen. Son tuyos: sirven para filtrar tu estantería.</p>
      <div class="chips wrap" id="gChips">${all.map((g) => `<button data-act="gToggle" data-id="${esc(g)}" aria-pressed="${gSel.includes(g)}">${esc(g)}</button>`).join('')}</div>
      <div class="field"><label for="gNew">Crear una etiqueta propia</label><div class="row"><input id="gNew" maxlength="24" placeholder="Por ejemplo: Cooperativo"><button class="btn btn-ghost" data-act="gAdd" style="flex:0 0 auto">Añadir</button></div></div>
      <button class="btn btn-amber" data-act="gSave" style="height:50px">Guardar</button></div>`;
  }
  function openGenres() {
    const it = state.detail.item; gSel = itemGenres(it).slice();
    openSub(genreSheetHTML(it), 'sheet');
  }
  function refreshGenres() { const el = $layers.querySelector('.sub.sheet:last-child'); if (el) el.innerHTML = genreSheetHTML(state.detail.item); }

  // ---------- Valor (privado: no viaja en el enlace de amigos) ----------
  const isNum = (n) => typeof n === 'number' && isFinite(n);
  const eur = (n) => n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const STALE = 183 * 864e5;
  function valueChip(it) {
    const pd = isNum(it.paid); const vl = isNum(it.value);
    if (!pd && !vl) return `<button class="gchip edit val" data-act="value">€ Valor</button>`;
    const diff = pd && vl ? it.value - it.paid : null;
    const old = vl && it.valueAt && Date.now() - it.valueAt > STALE;
    return `<button class="gchip val ${old ? 'stale' : ''}" data-act="value" aria-label="Valor y precio de compra">${vl ? eur(it.value) : 'Pagado ' + eur(it.paid)}${diff != null && diff !== 0 ? ` <em class="${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '+' : '−'}${eur(Math.abs(diff))}</em>` : ''}${old ? ' ·' : ''}</button>`;
  }
  const PC_NAME = { ds: 'Nintendo DS', '3ds': 'Nintendo 3DS', switch: 'Nintendo Switch', switch2: 'Nintendo Switch 2', ps4: 'Playstation 4', ps5: 'Playstation 5' };
  function priceLinks(it) {
    const fmt = it.kind === 'movie' ? (it.plat === 'bluray' ? 'blu-ray' : 'dvd') : it.kind === 'comic' ? [it.series && it.num ? '' : '', it.publisher ? it.publisher.split(' ')[0] : 'cómic'].join(' ').trim() : (PC_NAME[it.plat] || PLAT[it.plat].label);
    const q = encodeURIComponent(`${it.title} ${fmt}`);
    const links = [[`https://www.ebay.es/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1`, 'eBay · vendidos']];
    if (PC_NAME[it.plat]) links.push([`https://www.pricecharting.com/search-products?type=prices&q=${encodeURIComponent(`${it.title} PAL ${PC_NAME[it.plat]}`)}`, 'PriceCharting']);
    links.push([`https://www.todocoleccion.net/buscador?bu=${q}`, 'todocoleccion']);
    return links.map(([u, n]) => `<a class="btn btn-ghost" href="${esc(u)}" target="_blank" rel="noopener">${esc(n)}</a>`).join('');
  }
  function valueSheetHTML(it) {
    const n = (v) => isNum(v) ? String(v).replace('.', ',') : '';
    const has = isNum(it.paid) || isNum(it.value);
    return `<div class="layer-head"><h2>Valor</h2><button class="icon-btn" data-act="closeSub" aria-label="Cerrar">${I.close}</button></div>
      <div class="body scroll"><p class="hint">Solo lo ves tú: no se comparte con tus amigos.</p>
      <div class="vgrid"><div class="field"><label for="vPaid">Me costó (€)</label><input id="vPaid" inputmode="decimal" autocomplete="off" value="${n(it.paid)}" placeholder="0"></div>
      <div class="field"><label for="vDate">Lo compré el</label><input id="vDate" type="date" value="${esc(it.paidAt || '')}"></div></div>
      <div class="field"><label for="vNow">Se vende ahora por (€)</label><input id="vNow" inputmode="decimal" autocomplete="off" value="${n(it.value)}" placeholder="0"></div>
      ${it.valueAt ? `<p class="hint">Precio actual apuntado el ${esc(new Date(it.valueAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }))}${Date.now() - it.valueAt > STALE ? '. Quizá toque revisarlo.' : '.'}</p>` : ''}
      <h4 class="vh">Mira lo que se está pagando</h4><div class="vlinks">${priceLinks(it)}</div>
      <button class="btn btn-amber" data-act="vSave" style="height:50px">Guardar</button>
      ${has ? `<button class="btn btn-ghost" data-act="vClear">Borrar precios</button>` : ''}</div>`;
  }
  function openValue() { openSub(valueSheetHTML(state.detail.item), 'sheet'); }
  function saveValue(clear) {
    const it = state.items.find((x) => x.uid === state.detail.item.uid); if (!it) return;
    const num = (id) => { const v = (document.getElementById(id) || {}).value || ''; const f = parseFloat(v.replace(/[€\s]/g, '').replace(',', '.')); return isFinite(f) && f >= 0 ? Math.round(f * 100) / 100 : undefined; };
    const snapS = snapshot();
    if (clear) { delete it.paid; delete it.paidAt; delete it.value; delete it.valueAt; } else {
      const paid = num('vPaid'); const value = num('vNow'); const d = (document.getElementById('vDate') || {}).value || '';
      if (value !== it.value) it.valueAt = value === undefined ? undefined : Date.now();
      it.paid = paid; it.value = value; it.paidAt = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined;
    }
    saveItems(); state.detail.item = it; closeSub(); rerenderDetail(); render();
    setTimeout(() => toastUndo(clear ? 'Precios borrados' : 'Valor guardado', snapS), 0);
  }
  function valueCard(own) {
    const pr = own.filter((i) => isNum(i.paid) || isNum(i.value)); if (!pr.length) return '';
    const sum = (k) => pr.reduce((a, i) => a + (isNum(i[k]) ? i[k] : 0), 0);
    const both = pr.filter((i) => isNum(i.paid) && isNum(i.value));
    const profit = both.reduce((a, i) => a + i.value - i.paid, 0);
    const top = both.filter((i) => i.value > i.paid).sort((a, b) => (b.value - b.paid) - (a.value - a.paid)).slice(0, 3);
    const stale = pr.filter((i) => isNum(i.value) && i.valueAt && Date.now() - i.valueAt > STALE).length;
    return `<div class="card"><h3>Valor de la colección</h3>
      <div class="stat-grid v3"><div class="stat"><b>${eur(sum('paid'))}</b><span>invertido</span></div><div class="stat"><b>${eur(sum('value'))}</b><span>vale hoy</span></div>
      <div class="stat"><b class="${profit >= 0 ? 'up' : 'down'}">${profit >= 0 ? '+' : '−'}${eur(Math.abs(profit))}</b><span>si lo vendes</span></div></div>
      <p class="hint">${pr.length} de ${own.length} con precio${both.length < pr.length ? ` · el beneficio cuenta solo los ${both.length} con los dos precios` : ''}.${stale ? ` ${stale} con precio de hace más de 6 meses.` : ''}</p>
      ${top.length ? `<p>${top.map((i) => `${esc(i.title)}: <em class="up">+${eur(i.value - i.paid)}</em>`).join('<br>')}</p>` : ''}</div>`;
  }

  // ---------- Estadísticas ----------
  function statsHTML() {
    const own = owned(); const wish = state.items.filter((i) => i.wish);
    const byPlat = Object.keys(PLAT).map((k) => [k, own.filter((i) => i.plat === k).length]).filter((x) => x[1]).sort((a, b) => b[1] - a[1]);
    const maxP = Math.max(1, ...byPlat.map((x) => x[1]));
    const gCount = {}; own.forEach((i) => itemGenres(i).forEach((g) => { gCount[g] = (gCount[g] || 0) + 1; }));
    const topG = Object.entries(gCount).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const year = new Date().getFullYear();
    const thisYear = own.filter((i) => i.added && new Date(i.added).getFullYear() === year).length;
    const oldest = own.filter((i) => i.year).sort((a, b) => a.year - b.year)[0];
    const friendsC = state.friends.map((f) => [f.name, f.items.filter((i) => !i.wish && ownMatch(i)).length]).sort((a, b) => b[1] - a[1]);
    const bar = (label, n, max) => `<div class="bar"><span>${esc(label)}</span><i style="width:${Math.max(6, Math.round((n / max) * 100))}%"></i><b>${n}</b></div>`;
    return `<div class="layer sheet" role="dialog" aria-modal="true" aria-label="Estadísticas">
      <div class="layer-head"><h2>Tu colección en números</h2><button class="icon-btn" data-act="closeLayer" aria-label="Cerrar">${I.close}</button></div>
      <div class="body scroll">
        <div class="stat-grid">
          <div class="stat"><b>${own.filter((i) => i.kind === 'game').length}</b><span>juegos</span></div>
          <div class="stat"><b>${own.filter((i) => i.kind === 'movie').length}</b><span>películas</span></div>
          <div class="stat"><b>${own.filter((i) => i.kind === 'comic').length}</b><span>cómics</span></div>
          <div class="stat"><b>${thisYear}</b><span>añadidos en ${year}</span></div>
          <div class="stat"><b>${wish.length}</b><span>en deseos</span></div>
        </div>
        ${valueCard(own)}
        ${byPlat.length ? `<div class="card"><h3>Por formato</h3>${byPlat.map(([k, n]) => bar(PLAT[k].short, n, maxP)).join('')}</div>` : ''}
        ${topG.length ? `<div class="card"><h3>Géneros favoritos</h3>${topG.map(([g, n]) => bar(g, n, topG[0][1])).join('')}</div>` : ''}
        ${oldest ? `<div class="card"><h3>La más veterana</h3><p>${esc(oldest.title)} (${esc(oldest.year)}, ${esc(PLAT[oldest.plat].short)})</p></div>` : ''}
        ${friendsC.length && friendsC[0][1] ? `<div class="card"><h3>Con quién compartes gustos</h3><p>${friendsC.filter((f) => f[1]).slice(0, 3).map(([n, c]) => `${esc(n)}: ${c} en común`).join('<br>')}</p></div>` : ''}
      </div></div>`;
  }

  // ---------- Puesta al día de cajas antiguas (géneros y contraportadas) ----------
  async function upgradeItems() {
    let changed = false;
    for (const it of state.items) {
      const ref = String(it.ref);
      try {
        if (it.kind === 'game' && !it.spinev && !it.spine) { // lomos oficiales (catálogo nuevo)
          const g = await findGame(it.plat, ref).catch(() => null);
          if (g && g.v11) { if (g.spine) it.spine = g.spine; it.spinev = 1; changed = true; }
        }
        const needImg = ref.startsWith('t:') && (it.imgv || 0) < 3 && (!it.back || !it.media);
        if (it.kind === 'game' && (it.genres === undefined || needImg)) {
          const g = await findGame(it.plat, ref).catch(() => null);
          if (it.genres === undefined || (!it.genres.length && g && g.genres && g.genres.length)) { it.genres = (g && g.genres) || it.genres || []; changed = true; }
          if (needImg && g) {
            const r = await resolveTdb(g);
            if (r.front) { // si GameTDB no responde, lo reintentamos otro día
              ['front', 'back', 'full', 'media'].forEach((k) => { if (!it[k] && r[k]) { it[k] = r[k]; changed = true; } });
              it.imgv = 3; changed = true;
              cacheImgs([it.back, it.full, it.media]);
            }
          }
        } else if (it.kind === 'movie' && it.genres === undefined) {
          it.genres = [];
          if (ref.startsWith('tmdb:')) {
            const [, type, id] = ref.split(':');
            const j = await fetch(`https://api.themoviedb.org/3/${type}/${id}?` + new URLSearchParams({ api_key: TMDB_KEY, language: 'es-ES' })).then((r) => r.json());
            it.genres = [...new Set((j.genres || []).map((x) => TMDB_GENRES[x.id]).filter(Boolean))];
          }
          changed = true;
        } else if (it.genres === undefined) { it.genres = []; changed = true; }
      } catch (e) { /* lo intentamos la próxima vez */ }
    }
    if (changed) { saveItems(); if (!state.layer) render(); }
  }

  // ---------- Datos de cine de TMDB (en español) ----------
  const tmdbBusy = {};
  function tmdbRefOf(it) {
    const r = String(it.tmdbRef || it.ref || '');
    return r.startsWith('tmdb:') ? r : null;
  }
  async function tmdbGet(path, params) {
    const r = await fetch(`https://api.themoviedb.org/3/${path}?` + new URLSearchParams(Object.assign({ api_key: TMDB_KEY, language: 'es-ES' }, params || {})));
    if (!r.ok) throw new Error('tmdb ' + r.status);
    return r.json();
  }
  function saveOwner(it) {
    if (state.items.includes(it)) saveItems(); else saveFriends();
  }
  async function ensureTmdb(it) {
    if (it.kind !== 'movie' || tmdbBusy[it.uid]) return false;
    if (it.tmdb && Date.now() - (it.tmdb.at || 0) < 14 * DAY) return false;
    tmdbBusy[it.uid] = true;
    try {
      let ref = tmdbRefOf(it);
      if (!ref) {
        // Película añadida desde Wikipedia: buscamos su ficha en TMDB por título y año
        const res = await searchTmdb(it.title).catch(() => []);
        const m = res.find((x) => it.year && x.year === it.year) || res[0];
        if (!m) return false;
        it.tmdbRef = m.ref; ref = m.ref;
        if (!it.front && m.front) it.front = m.front;
      }
      const [, type, id] = ref.split(':');
      const j = await tmdbGet(`${type}/${id}`, {
        append_to_response: type === 'tv' ? 'credits,videos,images,content_ratings,watch/providers' : 'credits,videos,images,release_dates,watch/providers',
        include_image_language: 'es,null,en', include_video_language: 'es,en'
      });
      const dirs = type === 'tv' ? (j.created_by || []).map((x) => ({ id: x.id, name: x.name }))
        : ((j.credits && j.credits.crew) || []).filter((c) => c.job === 'Director').map((c) => ({ id: c.id, name: c.name }));
      const vids = ((j.videos && j.videos.results) || []).filter((v) => v.site === 'YouTube' && /Trailer|Teaser/i.test(v.type));
      const tr = vids.find((v) => v.iso_639_1 === 'es') || vids[0];
      let cert = '';
      if (type === 'movie') {
        const es = ((j.release_dates && j.release_dates.results) || []).find((r) => r.iso_3166_1 === 'ES');
        cert = ((es && es.release_dates) || []).map((d) => d.certification).find(Boolean) || '';
      } else {
        const es = ((j.content_ratings && j.content_ratings.results) || []).find((r) => r.iso_3166_1 === 'ES');
        cert = (es && es.rating) || '';
      }
      const prov = (j['watch/providers'] && j['watch/providers'].results && j['watch/providers'].results.ES) || {};
      const mapP = (a) => (a || []).slice(0, 6).map((x) => ({ name: x.provider_name, logo: x.logo_path ? 'https://image.tmdb.org/t/p/w92' + x.logo_path : null }));
      const bds = (j.images && j.images.backdrops) || [];
      const clean = bds.filter((b) => !b.iso_639_1);
      it.tmdb = {
        at: Date.now(), type, id: Number(id),
        overview: j.overview || '', runtime: j.runtime || (j.episode_run_time || [])[0] || null,
        director: dirs.map((d) => d.name).slice(0, 2).join(', '), directors: dirs.slice(0, 2),
        cast: ((j.credits && j.credits.cast) || []).slice(0, 8).map((c) => ({ id: c.id, name: c.name })),
        vote: j.vote_average ? Math.round(j.vote_average * 10) / 10 : null,
        trailer: tr ? tr.key : null, cert,
        backdrops: (clean.length ? clean : bds).slice(0, 3).map((b) => 'https://image.tmdb.org/t/p/w780' + b.file_path),
        collection: j.belongs_to_collection ? { id: j.belongs_to_collection.id, name: j.belongs_to_collection.name } : null,
        providers: { flat: mapP(prov.flatrate), rent: mapP(prov.rent), buy: mapP(prov.buy) }, link: prov.link || null,
        country: ((j.production_countries || [])[0] || {}).name || '', seasons: j.number_of_seasons || null
      };
      if (!itemGenres(it).length) it.genres = [...new Set((j.genres || []).map((g) => TMDB_GENRES[g.id]).filter(Boolean))];
      saveOwner(it);
      cacheImgs(it.tmdb.backdrops);
      return true;
    } catch (e) { return false; } finally { delete tmdbBusy[it.uid]; }
  }
  // Al abrir una película, si faltan sus datos, se piden y se repinta la caja
  async function loadMovieData(it) {
    if (it.kind !== 'movie') return;
    const had = !!it.tmdb;
    if (!had && state.detail && state.detail.item === it) rerenderDetail();
    const ok = await ensureTmdb(it);
    if ((ok || !had) && state.detail && state.detail.item === it) {
      rerenderDetail();
      const f = $layers.querySelector('.sub.ficha'); if (f) f.querySelector('.fsheet').innerHTML = fichaInner(it);
    }
  }

  // ---------- Cómics: sinopsis (Wikipedia en español y, si no, Open Library) ----------
  const comicBusy = {};
  const COMIC_RX = /historieta|c[oó]mic|novela gr[aá]fica|tebeo|manga|vi[nñ]eta|dibujante|guionista|bande dessin|tira/i;
  const comicQ = (t) => String(t || '').replace(/\b(vol(umen)?\.?|tomo|n[ºo°]\.?|parte)\s*\d+.*$/i, '').replace(/\[.*?\]|\(.*?\)/g, '').trim();
  async function wikiComic(q) {
    const sr = await fetch('https://es.wikipedia.org/w/api.php?' + new URLSearchParams({ action: 'query', list: 'search', srsearch: `${q} historieta OR cómic`, srlimit: '5', format: 'json', origin: '*' })).then((r) => r.json());
    const want = norm(q).split(' ').filter((w) => w.length > 2);
    const hits = ((sr.query || {}).search || []).filter((h) => { const t = norm(h.title); return want.length && want.filter((w) => t.includes(w)).length >= Math.ceil(want.length / 2); });
    for (const h of hits.slice(0, 3)) {
      const j = await fetch('https://es.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(h.title.replace(/ /g, '_'))).then((r) => r.json()).catch(() => null);
      if (j && j.type === 'standard' && j.extract && COMIC_RX.test(j.extract + ' ' + (j.description || ''))) {
        return { syn: j.extract, src: 'Wikipedia', url: (j.content_urls && j.content_urls.mobile && j.content_urls.mobile.page) || '' };
      }
    }
    return null;
  }
  async function olDescription(it) {
    const ref = String(it.ref || '');
    let key = ref.startsWith('olw:') ? '/works/' + ref.slice(4) : null;
    if (!key && it.isbn) {
      const e = await fetch(`${OL}/isbn/${encodeURIComponent(it.isbn)}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      key = e && e.works && e.works[0] && e.works[0].key;
    }
    if (!key || !/^\/works\/OL\d+W$/.test(key)) return null;
    const w = await fetch(`${OL}${key}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    let d = w && w.description; if (d && typeof d === 'object') d = d.value;
    if (!d || typeof d !== 'string') return null;
    d = d.split(/\n-{3,}/)[0].replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();
    return d.length > 40 ? { syn: d.slice(0, 1600), src: 'Open Library', url: `${OL}${key}`, en: true } : null;
  }
  async function ensureComicInfo(it) {
    if (it.kind !== 'comic' || comicBusy[it.uid]) return false;
    if (it.cinfo && (it.cinfo.syn || Date.now() - (it.cinfo.at || 0) < 30 * DAY)) return false;
    comicBusy[it.uid] = true;
    try {
      const tries = [comicQ(it.title)];
      if (it.series && !/^(dc comics|marvel|colecci)/i.test(it.series)) tries.push(comicQ(it.series));
      let r = null;
      for (const q of [...new Set(tries)].filter((x) => x.length > 1)) { r = await wikiComic(q).catch(() => null); if (r) break; }
      if (!r) r = await olDescription(it).catch(() => null);
      it.cinfo = Object.assign({ syn: '', at: Date.now() }, r || {});
      saveOwner(it);
      return !!r;
    } finally { delete comicBusy[it.uid]; }
  }
  async function loadComicData(it) {
    if (state.detail && state.detail.item === it) rerenderDetail();
    const ok = await ensureComicInfo(it);
    if (state.detail && state.detail.item === it) {
      rerenderDetail();
      const f = $layers.querySelector('.sub.ficha'); if (f && ok) f.querySelector('.fsheet').innerHTML = fichaInner(it);
    }
  }

  // ---------- Ficha desplegable ----------
  const stars = (n) => '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n);
  function fichaSummary(it) {
    const seenWord = it.kind === 'movie' ? 'Vista' : it.kind === 'comic' ? 'Leído' : 'Jugado';
    const bits = [];
    if (it.seen) bits.push(seenWord);
    if (it.rating) bits.push(stars(it.rating));
    if (it.tmdb && it.tmdb.runtime) bits.push(fmtRuntime(it.tmdb.runtime));
    else if (it.year) bits.push(String(it.year));
    return bits.join(' · ');
  }
  function fichaHandle(it) {
    return `<button class="ficha-handle" data-act="ficha" aria-label="Abrir la ficha"><i class="grip"></i>
      <span>Ficha ${I.up}<small>${esc(fichaSummary(it))}</small></span></button>`;
  }
  const dateVal = (ts) => { try { return new Date(ts).toISOString().slice(0, 10); } catch (e) { return ''; } };
  function personChips(t) {
    const ppl = [];
    (t.directors || []).forEach((d) => ppl.push({ id: d.id, name: d.name, role: 'dir' }));
    (t.cast || []).slice(0, 6).forEach((c) => { if (!ppl.some((x) => x.id === c.id)) ppl.push({ id: c.id, name: c.name, role: 'cast' }); });
    return ppl.map((x) => `<button class="pchip ${x.role === 'dir' ? 'dir' : ''}" data-act="person" data-id="${x.id}" data-name="${esc(x.name)}" data-role="${x.role}">${esc(x.name)}${x.role === 'dir' ? ` · ${t.type === 'tv' ? 'creación' : 'dirección'}` : ''}</button>`).join('');
  }
  function provHTML(t) {
    const g = [['flat', 'Suscripción'], ['rent', 'Alquiler'], ['buy', 'Compra']].filter(([k]) => t.providers && t.providers[k] && t.providers[k].length);
    if (!g.length) return '<p class="hint">No consta en ninguna plataforma en España ahora mismo.</p>';
    return g.map(([k, n]) => `<div class="prov-row"><small>${n}</small><div class="prov-list">${t.providers[k].map((p) =>
      `<span class="prov">${p.logo ? `<img src="${esc(p.logo)}" alt="">` : ''}${esc(p.name)}</span>`).join('')}</div></div>`).join('') +
      '<p class="fine">Datos de streaming: JustWatch, vía TMDB.</p>';
  }
  function fichaInner(it) {
    const d = state.detail || {}; const ro = !!d.readOnly; const isM = it.kind === 'movie'; const isC = it.kind === 'comic';
    const seenWord = isM ? 'Vista' : isC ? 'Leído' : 'Jugado';
    const diary = ro
      ? `<div class="diary"><div class="diary-top"><span class="dt">Su diario</span></div>
          <p class="hint">${it.seen ? `${seenWord}${it.seenAt ? ` el ${esc(fmtDate(it.seenAt))}` : ''}` : (isM ? 'Aún sin ver' : isC ? 'Aún sin leer' : 'Aún sin jugar')}${it.rating ? ` · <span class="stars-ro">${stars(it.rating)}</span>` : ''}</p></div>`
      : `<div class="diary"><div class="diary-top"><span class="dt">Tu diario</span>
          ${it.seen ? `<label class="seen-date">${seenWord} el <input type="date" id="seenDate" value="${esc(dateVal(it.seenAt || Date.now()))}"></label>` : ''}</div>
          <div class="diary-row"><button class="btn ${it.seen ? 'btn-amber' : 'btn-ghost'}" data-act="seenToggle">${it.seen ? I.check : ''}${seenWord}</button>
          <div class="rate" role="group" aria-label="Tu nota">${[1, 2, 3, 4, 5].map((n) =>
            `<button data-act="rate" data-n="${n}" aria-label="${n} de 5" aria-pressed="${(it.rating || 0) >= n}">★</button>`).join('')}</div></div></div>`;
    let body = '';
    if (isM) {
      const t = it.tmdb;
      if (!t) body = `<p class="hint">${tmdbBusy[it.uid] ? 'Cargando los datos de TMDB…' : 'No he encontrado esta película en TMDB.'}</p>`;
      else {
        body = `${t.overview ? `<p class="syn" id="syn">${esc(t.overview)}</p>${t.overview.length > 220 ? '<button class="linkish" data-act="synMore">Leer más</button>' : ''}` : ''}
          <div class="row">${t.vote ? `<span class="vote">TMDB ${esc(String(t.vote).replace('.', ','))}</span>` : ''}
            ${t.trailer ? `<a class="btn btn-ghost" href="https://www.youtube.com/watch?v=${encodeURIComponent(t.trailer)}" target="_blank" rel="noopener"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg>Ver tráiler</a>` : ''}</div>
          ${(t.directors || []).length || (t.cast || []).length ? `<h4>${t.type === 'tv' ? 'Creación y reparto' : 'Dirección y reparto'}</h4><div class="pchips">${personChips(t)}</div>` : ''}
          ${t.collection ? `<div class="saga" id="saga"><div class="saga-info"><b>${esc(t.collection.name)}</b><small>Buscando el resto de la saga…</small></div></div>` : ''}
          <h4>Dónde verla en España</h4>${provHTML(t)}`;
      }
    } else if (isC) {
      const row = (k, v) => v ? `<div class="crow"><small>${k}</small><span>${esc(v)}</span></div>` : '';
      const ci = it.cinfo || {};
      const syn = ci.syn ? `<p class="syn" id="syn">${esc(ci.syn)}</p>${ci.syn.length > 220 ? '<button class="linkish" data-act="synMore">Leer más</button>' : ''}
        <p class="hint">${ci.en ? 'Sinopsis en inglés, de Open Library' : 'Sinopsis de Wikipedia'}${ci.url ? ` · <a href="${esc(ci.url)}" target="_blank" rel="noopener">ver la fuente</a>` : ''}</p>`
        : comicBusy[it.uid] ? '<p class="hint">Buscando la sinopsis…</p>' : '';
      body = `${syn}<div class="cinfo">${row('Colección', it.series ? `${it.series}${it.num ? ` · nº ${it.num}` : ''}` : (it.num ? `Nº ${it.num}` : ''))}${row('Autores', it.authors)}
        ${row('Editorial', it.publisher)}${row('Año', it.year ? String(it.year) : '')}${row('Formato', PLAT[it.plat].short)}${row('ISBN', it.isbn)}</div>
        ${ro ? '' : '<button class="btn btn-ghost" data-act="comicEdit">Editar datos</button>'}`;
    } else {
      body = `<p class="hint">${esc(PLAT[it.plat].label)}${it.year ? ` · ${esc(it.year)}` : ''}</p>`;
    }
    const gl = itemGenres(it);
    const genres = `<h4>Géneros</h4><div class="genre-row">${gl.map((g) => `<span class="gchip">${esc(g)}</span>`).join('')}${ro ? '' : `<button class="gchip edit" data-act="editGenres">${I.tag}${gl.length ? 'Editar' : 'Añadir género'}</button>`}</div>`;
    return `<button class="fs-grip" data-act="closeSub" aria-label="Cerrar la ficha"><i class="grip"></i><span>Ficha ${I.down}</span></button>${diary}${body}${genres}`;
  }
  function openFicha() {
    const it = state.detail && state.detail.item; if (!it) return;
    const el = openSub(`<div class="fs-dim" data-act="closeSub"></div><div class="fsheet" role="dialog" aria-label="Ficha de ${esc(it.title)}">${fichaInner(it)}</div>`, 'ficha');
    bindFicha(el, it);
    if (it.kind === 'movie') { if (!it.tmdb) loadMovieData(it); else loadSaga(it); }
    if (it.kind === 'comic' && !(it.cinfo && it.cinfo.at)) loadComicData(it);
  }
  function refreshFicha() {
    const it = state.detail && state.detail.item; const el = $layers.querySelector('.sub.ficha');
    if (!it || !el) return;
    el.querySelector('.fsheet').innerHTML = fichaInner(it); bindFicha(el, it);
    if (it.kind === 'movie' && it.tmdb) loadSaga(it);
    const h = $layers.querySelector('.ficha-handle small'); if (h) h.textContent = fichaSummary(it);
  }
  function bindFicha(el, it) {
    const dt = el.querySelector('#seenDate');
    if (dt) dt.addEventListener('change', () => { const v = new Date(dt.value); if (!isNaN(v)) { it.seenAt = v.getTime(); saveItems(); } });
    // Deslizar la ficha hacia abajo la cierra
    const grip = el.querySelector('.fs-grip'); let y0 = null;
    grip.addEventListener('pointerdown', (e) => { y0 = e.clientY; });
    grip.addEventListener('pointerup', (e) => { if (y0 != null && e.clientY - y0 > 40) closeSub(); y0 = null; });
  }
  function tmdbOwned(type, id) {
    return owned().find((m) => tmdbRefOf(m) === `tmdb:${type}:${id}`);
  }
  async function loadSaga(it) {
    const t = it.tmdb; if (!t || !t.collection) return;
    try {
      if (!t.parts) {
        const c = await tmdbGet(`collection/${t.collection.id}`);
        t.parts = (c.parts || []).filter((p) => p.release_date).sort((a, b) => a.release_date.localeCompare(b.release_date))
          .map((p) => ({ id: p.id, title: p.title, year: Number((p.release_date || '').slice(0, 4)) || null, poster: p.poster_path ? 'https://image.tmdb.org/t/p/w342' + p.poster_path : null }));
        saveOwner(it);
      }
      const box = document.getElementById('saga'); if (!box) return;
      const have = t.parts.filter((p) => tmdbOwned('movie', p.id) || owned().some((m) => m.kind === 'movie' && norm(m.title) === norm(p.title)));
      const wished = t.parts.filter((p) => state.items.some((m) => m.wish && tmdbRefOf(m) === `tmdb:movie:${p.id}`));
      const missing = t.parts.filter((p) => !have.includes(p) && !wished.includes(p));
      box.innerHTML = `<div class="saga-posters">${t.parts.slice(0, 6).map((p) => {
        const h = have.includes(p);
        return p.poster ? `<img src="${esc(p.poster)}" alt="" class="${h ? '' : 'missing'}">` : `<i class="${h ? '' : 'missing'}"></i>`;
      }).join('')}</div><div class="saga-info"><b>${esc(t.collection.name)}</b><small>Tienes ${have.length} de ${t.parts.length}${wished.length ? ` · ${wished.length} en deseos` : ''}</small></div>
        ${missing.length && !(state.detail && state.detail.readOnly) ? `<button class="btn btn-amber" data-act="sagaWish">${I.heart}Apuntar ${missing.length}</button>` : ''}`;
    } catch (e) { const box = document.getElementById('saga'); if (box) box.querySelector('small').textContent = 'No se ha podido cargar la saga.'; }
  }
  function addMissingSaga() {
    const it = state.detail.item; const t = it.tmdb; if (!t || !t.parts) return;
    const snap = snapshot(); let n = 0;
    t.parts.forEach((p) => {
      if (tmdbOwned('movie', p.id) || state.items.some((m) => tmdbRefOf(m) === `tmdb:movie:${p.id}`) || owned().some((m) => m.kind === 'movie' && norm(m.title) === norm(p.title))) return;
      if (addItem({ ref: `tmdb:movie:${p.id}`, title: p.title, year: p.year, front: p.poster ? p.poster.replace('/w342/', '/w500/') : null, genres: [] }, 'movie', it.plat, true)) n += 1;
    });
    if (n) { render(); refreshFicha(); toastUndo(`${n} ${n === 1 ? 'película apuntada' : 'películas apuntadas'} en tus deseos`, snap); }
  }

  // Películas de una persona (director o actor) que tienes y que te faltan
  async function openPerson(id, name, role) {
    const el = openSub(`<div class="layer-head"><h2>${esc(name)}</h2><button class="icon-btn" data-act="closeSub" aria-label="Cerrar">${I.close}</button></div>
      <div class="body scroll person-body"><p class="hint">Buscando sus películas…</p></div>`, 'sheet');
    try {
      const j = await tmdbGet(`person/${id}/movie_credits`);
      const raw = role === 'dir' ? (j.crew || []).filter((c) => c.job === 'Director') : (j.cast || []);
      const seen = new Set();
      const list = raw.filter((m) => m.release_date && !seen.has(m.id) && seen.add(m.id))
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0)).slice(0, 30)
        .sort((a, b) => b.release_date.localeCompare(a.release_date));
      if (!el.isConnected) return;
      personList = list.map((m) => ({ ref: `tmdb:movie:${m.id}`, title: m.title, year: Number(m.release_date.slice(0, 4)) || null, front: m.poster_path ? 'https://image.tmdb.org/t/p/w500' + m.poster_path : null, genres: [...new Set((m.genre_ids || []).map((g) => TMDB_GENRES[g]).filter(Boolean))] }));
      const haveN = personList.filter((m) => personHas(m)).length;
      el.querySelector('.person-body').innerHTML = `<p class="hint">${role === 'dir' ? 'Como director/a' : 'Como intérprete'} · tienes ${haveN} de ${personList.length}</p>` +
        personList.map((m, i) => personRow(m, i)).join('');
    } catch (e) { const b = el.querySelector('.person-body'); if (b) b.innerHTML = '<p class="hint">No he podido cargar sus películas.</p>'; }
  }
  let personList = [];
  const personHas = (m) => owned().find((x) => tmdbRefOf(x) === m.ref || (x.kind === 'movie' && norm(x.title) === norm(m.title)));
  const personWish = (m) => state.items.find((x) => x.wish && tmdbRefOf(x) === m.ref);
  function personRow(m, i) {
    const h = personHas(m); const w = personWish(m);
    return `<div class="result ${h ? 'owned' : ''}">${m.front ? `<img src="${esc(m.front.replace('/w500/', '/w185/'))}" alt="" loading="lazy">` : '<div class="noimg"></div>'}
      <div class="info"><b>${esc(m.title)}</b><small>${m.year || ''}</small></div>
      ${h ? '<span class="state">La tienes</span>' : w ? '<span class="state">En deseos</span>' : `<button class="btn btn-ghost sq" data-act="personWish" data-i="${i}" aria-label="Apuntar ${esc(m.title)} en deseos">${I.heart}</button>`}</div>`;
  }

  // ---------- Catálogo de juegos ----------
  const index = {};
  function loadPlat(plat) {
    if (!index[plat]) {
      index[plat] = fetch(`data/games-${plat}.json`, { cache: 'no-cache' })
        .then((r) => { if (!r.ok) throw new Error('sin catálogo'); return r.json(); })
        .then((j) => {
          const games = j.games || [];
          return { games, keys: games.map((g) => norm(g[1] + ' ' + (g[6] || []).join(' '))), byId: null };
        })
        .catch((e) => { delete index[plat]; throw e; });
    }
    return index[plat];
  }
  function gameFromRow(plat, g) {
    if (typeof g[0] === 'string' && g[0].startsWith('t:')) {
      return { plat, ref: g[0], title: g[1], year: g[2] || null, front: null, back: null, media: null, full: null, region: g[7] || 'WW', tdb: g[0].slice(2), genres: g[8] || [], editions: g[9] || [],
        lb: { front: imgUrl(g[3]), back: imgUrl(g[4]), media: imgUrl(g[5]) }, spine: imgUrl(g[10]), v11: g.length > 10 };
    }
    return { plat, ref: g[0], title: g[1], year: g[2] || null, front: imgUrl(g[3]), back: imgUrl(g[4]), media: imgUrl(g[5]), full: null, genres: g[8] || [], spine: imgUrl(g[10]), v11: g.length > 10 };
  }

  // ---------- Imágenes de GameTDB (se buscan al añadir) ----------
  const TDB_SYS = { ds: 'ds', '3ds': '3ds', switch: 'switch', switch2: 'switch2' };
  // Nombres comprobados en art.gametdb.com: coverHQ/coverM/cover (.jpg), backHQ/backM/back (.jpg),
  // coverfullHQ/coverfullM/coverfull (.jpg) y cart (.png)
  const K_FRONT = [['coverHQ', 'jpg'], ['coverM', 'jpg'], ['cover', 'jpg'], ['coverHQ', 'png'], ['coverM', 'png'], ['cover', 'png']];
  const K_THUMB = [['cover', 'jpg'], ['coverM', 'jpg'], ['cover', 'png']];
  const K_BACK = [['backHQ', 'jpg'], ['backM', 'jpg'], ['back', 'jpg']];
  const K_FULL = [['coverfullHQ', 'jpg'], ['coverfullM', 'jpg'], ['coverfull', 'jpg']];
  const K_MEDIA = [['cart', 'png'], ['cartHQ', 'png']];
  function tdbLangs(reg) {
    const first = ({ ES: ['ES', 'EN'], EU: ['EN', 'ES'], WW: ['ES', 'EN'], US: ['US', 'EN'], JP: ['JA', 'EN'], DE: ['DE', 'EN'], FR: ['FR', 'EN'], IT: ['IT', 'EN'], NL: ['NL', 'EN'], AU: ['AU', 'EN'], KR: ['KO', 'EN'] })[reg] || ['EN', 'ES'];
    return [...new Set(first.concat(['ES', 'EN', 'US']))];
  }
  function tdbCands(r, kinds, langs) {
    const out = [];
    for (const l of (langs || tdbLangs(r.region))) for (const [t, e] of kinds) out.push(`https://art.gametdb.com/${TDB_SYS[r.plat]}/${t}/${l}/${r.tdb}.${e}`);
    return out;
  }
  function probe(url, wide) {
    return new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im.naturalWidth > 40 && (!wide || im.naturalWidth > im.naturalHeight * 1.3) ? url : null);
      im.onerror = () => res(null);
      im.src = url;
    });
  }
  async function firstOk(urls, wide) {
    for (let i = 0; i < urls.length; i += 4) {
      const got = (await Promise.all(urls.slice(i, i + 4).map((u) => probe(u, wide)))).find(Boolean);
      if (got) return got;
    }
    return null;
  }
  async function resolveTdb(r) {
    const [front, back, full, media] = await Promise.all([firstOk(tdbCands(r, K_FRONT)), firstOk(tdbCands(r, K_BACK)), firstOk(tdbCands(r, K_FULL), true), firstOk(tdbCands(r, K_MEDIA))]);
    const out = Object.assign({}, r, { front, back, full, media });
    // Si a esta edición le falta algo, lo buscamos en otras ediciones del mismo juego
    for (const [id, reg] of (r.editions || []).slice(0, 4)) {
      if (out.back && out.media) break;
      const ed = Object.assign({}, r, { tdb: id, region: reg });
      const [b, f, m] = await Promise.all([out.back ? null : firstOk(tdbCands(ed, K_BACK)), out.back || out.full ? null : firstOk(tdbCands(ed, K_FULL), true), out.media ? null : firstOk(tdbCands(ed, K_MEDIA))]);
      out.back = out.back || b; out.full = out.full || f; out.media = out.media || m;
      if (!out.front) out.front = await firstOk(tdbCands(ed, K_FRONT));
    }
    // Último recurso: las imágenes de la misma ficha en LaunchBox
    if (r.lb) {
      if (!out.back && !out.full && r.lb.back) out.back = r.lb.back;
      if (!out.media && r.lb.media) out.media = r.lb.media;
      if (!out.front && r.lb.front) out.front = r.lb.front;
    }
    return out;
  }
  function hydrateThumbs(root) {
    root.querySelectorAll('img[data-cands]').forEach((img) => {
      const list = img.dataset.cands.split('|'); let i = 0;
      img.onerror = () => { i += 1; if (i < list.length) img.src = list[i]; else img.replaceWith(Object.assign(document.createElement('div'), { className: 'noimg' })); };
      img.src = list[0];
    });
  }
  async function searchGames(coll, q) {
    const nq = norm(q); if (nq.length < 2) return [];
    const toks = nq.split(' ');
    const out = [];
    for (const plat of coll.plats) {
      let ix; try { ix = await loadPlat(plat); } catch (e) { continue; }
      ix.keys.forEach((k, i) => {
        if (!toks.every((t) => k.includes(t))) return;
        const name = norm(ix.games[i][1]);
        const score = name === nq ? 0 : name.startsWith(nq) ? 1 : (' ' + name).includes(' ' + toks[0]) ? 2 : 3;
        out.push({ score, len: name.length, r: gameFromRow(plat, ix.games[i]) });
      });
    }
    out.sort((a, b) => a.score - b.score || a.len - b.len);
    return out.slice(0, 40).map((x) => x.r);
  }
  async function findGame(plat, id) {
    const ix = await loadPlat(plat);
    if (!ix.byId) { ix.byId = new Map(); ix.games.forEach((g) => ix.byId.set(String(g[0]), g)); }
    const g = ix.byId.get(String(id));
    return g ? gameFromRow(plat, g) : null;
  }

  // ---------- Películas (Wikipedia, sin cuentas) ----------
  async function wjson(base, params) {
    const r = await fetch(base + '?' + new URLSearchParams(Object.assign({ format: 'json', origin: '*' }, params)));
    if (!r.ok) throw new Error('wiki');
    return r.json();
  }
  async function searchTmdb(q) {
    const r = await fetch('https://api.themoviedb.org/3/search/multi?' + new URLSearchParams({ api_key: TMDB_KEY, language: 'es-ES', region: 'ES', query: q, include_adult: 'false' }));
    if (!r.ok) throw new Error('tmdb');
    const j = await r.json();
    return (j.results || []).filter((m) => m.media_type === 'movie' || m.media_type === 'tv').slice(0, 14).map((m) => {
      const title = m.title || m.name || '';
      const orig = m.original_title || m.original_name || '';
      const date = m.release_date || m.first_air_date || '';
      return {
        ref: `tmdb:${m.media_type}:${m.id}`, title, year: Number(date.slice(0, 4)) || null,
        desc: [m.media_type === 'tv' ? 'Serie' : 'Película', date.slice(0, 4), orig && orig !== title ? orig : ''].filter(Boolean).join(' · '),
        front: m.poster_path ? 'https://image.tmdb.org/t/p/w500' + m.poster_path : null, back: null, media: null,
        genres: [...new Set((m.genre_ids || []).map((g) => TMDB_GENRES[g]).filter(Boolean))]
      };
    });
  }
  async function searchMovies(q) {
    if (norm(q).length < 2) return [];
    try { return await searchTmdb(q); } catch (e) { return searchWiki(q, /pel[ií]cula|film|largometraje|serie/i, /\s*\((?:película|film|serie)[^)]*\)$/i); }
  }
  const searchWikiGames = (q) => searchWiki(q + ' videojuego', /videojuego|video ?game/i, /\s*\((?:videojuego|video game)[^)]*\)$/i);
  async function searchWiki(q, kindRe, stripRe) {
    if (norm(q).length < 2) return [];
    const j = await wjson('https://es.wikipedia.org/w/api.php', {
      action: 'query', generator: 'search', gsrsearch: q, gsrlimit: '12', gsrnamespace: '0',
      prop: 'pageimages|description|pageprops', piprop: 'thumbnail', pithumbsize: '700', ppprop: 'wikibase_item'
    });
    let pages = Object.values((j.query && j.query.pages) || {}).sort((a, b) => a.index - b.index);
    const films = pages.filter((p) => kindRe.test(p.description || ''));
    if (films.length) pages = films;
    pages = pages.slice(0, 8);

    // Los carteles suelen estar en la Wikipedia en inglés
    const qids = pages.map((p) => p.pageprops && p.pageprops.wikibase_item).filter(Boolean);
    const enOf = {}; const thumbOf = {};
    try {
      if (qids.length) {
        const wd = await wjson('https://www.wikidata.org/w/api.php', { action: 'wbgetentities', ids: qids.join('|'), props: 'sitelinks', sitefilter: 'enwiki' });
        for (const [id, e] of Object.entries(wd.entities || {})) if (e.sitelinks && e.sitelinks.enwiki) enOf[id] = e.sitelinks.enwiki.title;
      }
      const titles = Object.values(enOf);
      if (titles.length) {
        const en = await wjson('https://en.wikipedia.org/w/api.php', { action: 'query', titles: titles.join('|'), prop: 'pageimages', piprop: 'thumbnail', pithumbsize: '700', redirects: '1' });
        const map = {};
        ((en.query && en.query.normalized) || []).forEach((n) => { map[n.from] = n.to; });
        ((en.query && en.query.redirects) || []).forEach((n) => { map[n.from] = n.to; });
        const thumbs = {};
        Object.values((en.query && en.query.pages) || {}).forEach((p) => { if (p.thumbnail) thumbs[p.title] = p.thumbnail.source; });
        titles.forEach((t) => { let x = t; for (let k = 0; k < 3 && map[x]; k++) x = map[x]; if (thumbs[x]) thumbOf[t] = thumbs[x]; });
      }
    } catch (e) { /* si falla, usamos lo que haya en español */ }

    return pages.map((p) => {
      const qid = p.pageprops && p.pageprops.wikibase_item;
      const en = qid && enOf[qid];
      const front = (en && thumbOf[en]) || (p.thumbnail && p.thumbnail.source) || null;
      const ym = (p.description || '').match(/\b(18|19|20)\d{2}\b/);
      return {
        ref: qid || p.title,
        title: p.title.replace(stripRe, ''),
        desc: p.description || '', year: ym ? Number(ym[0]) : null, front, back: null, media: null
      };
    });
  }

  // ---------- Añadir ----------
  function countFace(collId) { return state.items.filter((i) => !i.wish && PLAT[i.plat].coll === collId && i.face).length; }

  function addItem(r, kind, plat, wish) {
    if (state.items.find((m) => m.kind === kind && m.plat === plat && String(m.ref) === String(r.ref))) return false;
    const it = {
      uid: uid(), kind, plat, ref: r.ref, title: r.title, year: r.year || null,
      front: r.front || null, back: r.back || null, media: r.media || null, full: r.full || null, spine: r.spine || null, spinev: 1,
      genres: Array.isArray(r.genres) ? r.genres.slice(0, 6) : [], wish: !!wish, imgv: 3,
      face: countFace(PLAT[plat].coll) < 4, added: Date.now()
    };
    if (kind === 'comic') {
      ['authors', 'publisher', 'series', 'num', 'isbn'].forEach((k) => { if (r[k]) it[k] = String(r[k]).slice(0, 160); });
      it.face = countFace('com') < 3;
    }
    state.items.push(it);
    saveItems();
    cacheImgs([it.front, it.back, it.media, it.full]);
    return true;
  }

  async function cacheImgs(urls) {
    if (!('caches' in window)) return;
    try {
      const c = await caches.open('ludo-covers');
      await Promise.all(urls.filter(Boolean).map(async (u) => {
        if (await c.match(u)) return;
        const res = await fetch(u, { mode: 'no-cors' });
        await c.put(u, res);
      }).map((p) => p.catch(() => {})));
    } catch (e) { /* sin caché: las imágenes se verán con conexión */ }
  }

  let lastResults = [];
  function addHTML() {
    const a = state.add; const coll = collOf(a.coll);
    const isMovie = coll.id === 'mov'; const isComic = coll.id === 'com';
    const canScan = 'BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    return `<div class="layer sheet" role="dialog" aria-modal="true" aria-label="Añadir a la colección">
      <div class="layer-head"><h2>Añadir a la estantería</h2><button class="icon-btn" data-act="closeLayer" aria-label="Cerrar">${I.close}</button></div>
      <div class="body">
        <div class="modes" role="group" aria-label="Dónde añadirlo"><button data-act="addWish" data-id="0" aria-pressed="${!a.wish}">Lo tengo</button><button data-act="addWish" data-id="1" aria-pressed="${!!a.wish}">${I.heart}Lo quiero</button></div>
        <div class="pills" role="group" aria-label="Colección">${visibleColls().map((c) => `<button data-act="addColl" data-id="${c.id}" aria-pressed="${c.id === coll.id}">${esc(c.name)}</button>`).join('')}</div>
        ${isMovie ? `<div class="pills" role="group" aria-label="Formato">${['dvd', 'bluray'].map((f) => `<button data-act="addFmt" data-id="${f}" aria-pressed="${a.fmt === f}">${PLAT[f].short}</button>`).join('')}</div>` : ''}
        ${isComic ? `<div class="pills" role="group" aria-label="Formato">${['tomo', 'grapa'].map((f) => `<button data-act="addCfmt" data-id="${f}" aria-pressed="${(a.cfmt || 'tomo') === f}">${PLAT[f].short}</button>`).join('')}</div>` : ''}
        <label class="search">${I.search}<span class="sr">Título</span>
          <input id="q" type="search" autocomplete="off" enterkeyhint="search" placeholder="${isMovie ? 'Título de la película…' : isComic ? 'Título, autor o ISBN…' : 'Título del juego…'}" value="${esc(a.q || '')}">
          <button class="icon-btn clear-q ${a.q ? '' : 'hidden'}" id="clearQ" data-act="clearQ" aria-label="Borrar la búsqueda" style="width:40px;height:40px">${I.close}</button>
          ${canScan ? `<button class="icon-btn" data-act="scan" aria-label="Escanear código de barras" style="width:40px;height:40px">${I.scan}</button>` : ''}</label>
        <div class="hint" id="hint">${isMovie ? 'Títulos y carteles en español. Tú eliges el formato: DVD o Blu-ray.' : isComic ? `Busca en Open Library${canScan ? ' o escanea el ISBN de la contraportada' : ''}. Lo que no esté, lo añades a mano.` : `Busca entre todos los juegos de ${esc(coll.plats.map((p) => PLAT[p].short).join(' y '))}.`}</div>
        <div class="results scroll" id="results"></div>
      </div></div>`;
  }

  function resultsHTML(list, isMovie, plat) {
    lastResults = list;
    return list.map((r, i) => {
      const p = isMovie ? plat : r.plat;
      const owned = state.items.find((m) => m.plat === p && String(m.ref) === String(r.ref));
      const thumb = r.front ? `<img src="${esc(r.front)}" alt="" loading="lazy">`
        : r.tdb ? `<img alt="" data-cands="${esc(tdbCands(r, K_THUMB, tdbLangs(r.region).slice(0, 2)).join('|'))}">` : '<div class="noimg"></div>';
      if (r.wiki) {
        const coll = collOf(state.add.coll);
        return `<div class="result">${thumb}<div class="info"><b>${esc(r.title)}</b><small>${esc(r.desc)}</small></div>
          <span class="wiki-picks">${coll.plats.map((pl) => `<button class="btn btn-ghost" data-act="pickWiki" data-i="${i}" data-plat="${pl}">${esc(PLAT[pl].short)}</button>`).join('')}</span></div>`;
      }
      const meta = isMovie || r.comic ? esc(r.desc) : `${esc(PLAT[r.plat].short)}${r.year ? ' · ' + esc(r.year) : ''}${r.region ? ' · ' + esc(REGION_NAME[r.region] || r.region) : ''}`;
      return `<button class="result ${owned ? 'owned' : ''}" data-act="pick" data-i="${i}">${thumb}
        <div class="info"><b>${esc(r.title)}</b><small>${meta}</small></div>
        <span class="state">${owned ? (owned.wish ? 'En tus deseos' : 'En tu estantería') : 'Añadir'}</span></button>`;
    }).join('');
  }

  function syncClear() {
    const q = document.getElementById('q'); const b = document.getElementById('clearQ');
    if (q && b) b.classList.toggle('hidden', !q.value);
  }
  let searchSeq = 0;
  async function runSearch() {
    const a = state.add; if (!a) return;
    const q = (document.getElementById('q') || {}).value || '';
    a.q = q;
    const coll = collOf(a.coll); const isMovie = coll.id === 'mov';
    const $res = document.getElementById('results'); const $hint = document.getElementById('hint');
    const seq = ++searchSeq;
    if (coll.id === 'com') {
      if (norm(q).length < 2) { $res.innerHTML = manualBtn(); lastResults = []; return; }
      $hint.textContent = 'Buscando en Open Library…';
      try {
        const list = await searchComics(q);
        if (seq !== searchSeq || !state.add) return;
        $res.innerHTML = resultsHTML(list, true, a.cfmt || 'tomo') + manualBtn();
        $hint.textContent = list.length ? 'Toca el tuyo. Si no es tu edición exacta, añádelo a mano.' : 'No aparece en Open Library. Añádelo a mano.';
      } catch (e) { if (seq === searchSeq) { $res.innerHTML = manualBtn(); $hint.textContent = 'No he podido conectar con Open Library. Puedes añadirlo a mano.'; } }
      return;
    }
    if (norm(q).length < 2) { $res.innerHTML = ''; lastResults = []; return; }
    $hint.textContent = 'Buscando…';
    try {
      const list = isMovie ? await searchMovies(q) : await searchGames(coll, q);
      if (seq !== searchSeq || !state.add) return;
      $res.innerHTML = resultsHTML(list, isMovie, a.fmt) + (isMovie ? '' : `<button class="btn btn-ghost wiki-more" data-act="wikiGames">¿No aparece? Buscarlo en Wikipedia</button>`);
      hydrateThumbs($res);
      $hint.textContent = list.length ? 'Toca el tuyo para ponerlo en la estantería.' : 'No está en el catálogo. Prueba con menos palabras, en inglés, o búscalo en Wikipedia.';
    } catch (e) {
      if (seq !== searchSeq) return;
      $hint.textContent = isMovie ? 'No he podido conectar con Wikipedia. ¿Tienes conexión?' : 'No he podido cargar el catálogo de juegos. ¿Tienes conexión?';
    }
  }
  const runSearchSoon = debounce(runSearch, 250);

  function openAdd(collId) {
    state.add = { coll: collId || state.tab, fmt: (state.add && state.add.fmt) || 'bluray', q: '', wish: state.mode === 'wish' };
    state.layer = 'add';
    $layers.innerHTML = addHTML();
    const q = document.getElementById('q');
    q.addEventListener('input', () => { syncClear(); runSearchSoon(); });
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); q.blur(); } });
    setTimeout(() => q.focus(), 60);
    const coll = collOf(state.add.coll);
    if (coll.id === 'com') { const r = document.getElementById('results'); if (r) r.innerHTML = manualBtn(); return; }
    if (coll.id !== 'mov') coll.plats.forEach((p) => loadPlat(p).catch(() => {}));
  }

  function rerenderAdd() {
    const q = state.add.q;
    $layers.innerHTML = addHTML();
    const $q = document.getElementById('q');
    $q.addEventListener('input', () => { syncClear(); runSearchSoon(); });
    $q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); $q.blur(); } });
    if (q || state.add.coll === 'com') runSearch();
  }

  // ---------- Cómics: Open Library (sin claves) y alta a mano ----------
  const OL = 'https://openlibrary.org';
  const olCover = (id, size) => `https://covers.openlibrary.org/b/id/${id}-${size || 'L'}.jpg`;
  const isbnOf = (q) => { const x = String(q).replace(/[-\s]/g, '').toUpperCase(); return /^(97[89]\d{10}|\d{9}[\dX])$/.test(x) ? x : null; };
  const yearOf = (s) => { const m = String(s || '').match(/\b(1[89]\d\d|20\d\d)\b/); return m ? Number(m[1]) : null; };
  // Las colecciones de quiosco suelen registrar «DC Comics» como título y la obra como subtítulo
  const GENERIC_T = /^(dc comics|marvel|marvel comics|colecci[oó]n|novelas? gr[aá]ficas?|vertigo|sagas? dc|universos? dc|h[eé]roes y villanos)/i;
  function comicFrom(title, subtitle) {
    title = String(title || '').trim(); subtitle = String(subtitle || '').trim();
    if (subtitle && GENERIC_T.test(title)) return { title: subtitle, series: title };
    if (subtitle && (title + subtitle).length < 70) return { title: `${title}: ${subtitle}` };
    return { title };
  }
  async function isbnLookup(isbn) {
    const j = await fetch(`${OL}/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`).then((r) => r.json());
    const d = j[`ISBN:${isbn}`]; if (!d) return null;
    const t = comicFrom(d.title, d.subtitle);
    const front = d.cover ? (d.cover.large || d.cover.medium) : null;
    return Object.assign({ comic: true, ref: 'isbn:' + isbn, isbn, year: yearOf(d.publish_date),
      front: front ? front.replace(/^http:/, 'https:') : null,
      authors: (d.authors || []).map((a) => a.name).slice(0, 4).join(', '),
      publisher: ((d.publishers || [])[0] || {}).name || '' }, t);
  }
  async function searchComics(q) {
    const isbn = isbnOf(q);
    if (isbn) { const r = await isbnLookup(isbn); return r ? [Object.assign(r, { desc: [r.publisher, r.year, 'ISBN ' + isbn].filter(Boolean).join(' · ') })] : []; }
    const f = 'key,title,subtitle,author_name,publisher,first_publish_year,cover_i,language';
    const get = (extra) => fetch(`${OL}/search.json?` + new URLSearchParams(Object.assign({ q, limit: '14', fields: f }, extra))).then((r) => r.json()).then((j) => j.docs || []).catch(() => []);
    const [es, all] = await Promise.all([get({ language: 'spa', lang: 'es' }), get({ lang: 'es' })]);
    const seen = new Set(); const out = [];
    es.concat(all).forEach((d) => {
      if (seen.has(d.key)) return; seen.add(d.key);
      const t = comicFrom(d.title, d.subtitle);
      const pubs = d.publisher || [];
      const spa = (d.language || []).includes('spa');
      out.push(Object.assign({ comic: true, ref: 'olw:' + String(d.key).split('/').pop(), year: d.first_publish_year || null,
        front: d.cover_i ? olCover(d.cover_i) : null,
        authors: (d.author_name || []).slice(0, 3).join(', '),
        publisher: spa ? (pubs.find((x) => /ecc|norma|planeta|salvat|panini|dolmen|astiberri|ponent|reservoir|ediciones|editorial|zinco|forum|toutain|glénat|glenat|nuevo|aleta/i.test(x)) || pubs[0] || '') : '',
        desc: [(d.author_name || [])[0], d.first_publish_year, spa ? 'en español' : 'otra edición'].filter(Boolean).join(' · ') }, t));
    });
    return out.slice(0, 20);
  }
  const manualBtn = () => `<button class="btn btn-ghost wiki-more" data-act="manual">${I.plus}Añadirlo a mano</button>`;

  // Alta (o edición) a mano: grapas, ediciones antiguas y lo que no esté en Open Library
  let manual = null;
  function manualHTML(src) {
    const v = (k) => esc(src && src[k] != null ? String(src[k]) : '');
    const fmt = manual.cfmt;
    return `<div class="layer-head"><h2>${manual.edit ? 'Editar datos' : 'Añadir a mano'}</h2><button class="icon-btn" data-act="closeSub" aria-label="Cerrar">${I.close}</button></div>
      <div class="body scroll mform">
        <div class="pills" role="group" aria-label="Formato">${['tomo', 'grapa'].map((f) => `<button data-act="mFmt" data-id="${f}" aria-pressed="${fmt === f}">${PLAT[f].short}</button>`).join('')}</div>
        <div class="field"><label for="mTitle">Título</label><input id="mTitle" maxlength="160" value="${v('title')}" placeholder="Por ejemplo: Transmetropolitan"></div>
        <div class="vgrid"><div class="field"><label for="mSeries">Colección o serie</label><input id="mSeries" maxlength="120" value="${v('series')}" placeholder="Opcional"></div>
          <div class="field"><label for="mNum">Número</label><input id="mNum" maxlength="12" inputmode="decimal" value="${v('num')}" placeholder="Opcional"></div></div>
        <div class="vgrid"><div class="field"><label for="mPub">Editorial</label><input id="mPub" maxlength="80" value="${v('publisher')}" placeholder="Norma, ECC…"></div>
          <div class="field"><label for="mYear">Año</label><input id="mYear" maxlength="4" inputmode="numeric" value="${v('year')}"></div></div>
        <div class="field"><label for="mAuth">Autores</label><input id="mAuth" maxlength="160" value="${v('authors')}" placeholder="Guion y dibujo"></div>
        <h4 class="vh">Portada</h4>
        <div id="mCovers" class="mcovers">${coversHTML()}</div>
        <button class="btn btn-ghost" data-act="mCoverFind">${I.search}Buscar portadas con este título</button>
        <button class="btn btn-amber" data-act="mSave" style="height:50px">${manual.edit ? 'Guardar' : 'Añadir a la estantería'}</button></div>`;
  }
  function coversHTML() {
    const tile = (u, label) => `<button class="mc" data-act="mCoverPick" ${u ? `data-u="${esc(u)}"` : ''} aria-pressed="${(manual.cover || null) === (u || null)}" aria-label="${esc(label)}">${u ? `<img src="${esc(u.startsWith('blob:') ? u : u.replace(/-L\.jpg$/, '-M.jpg'))}" alt="" loading="lazy">` : '<span>Sin portada<br><small>diseño propio</small></span>'}</button>`;
    const shot = `<button class="mc shot" data-act="mPhoto" aria-label="Hacer una foto a la portada">${I.camera}<span>Hacer foto</span></button>`;
    return shot + tile(null, 'Sin portada') + (manual.cover && !manual.covers.includes(manual.cover) ? tile(manual.cover, manual.cover === manual.blobUrl ? 'Tu foto' : 'Portada actual') : '') + manual.covers.map((u) => tile(u, 'Portada')).join('');
  }
  function openManual(edit) {
    const a = state.add || {};
    const q = (document.getElementById('q') || {}).value || '';
    const isbn = isbnOf(q);
    manual = { edit: edit ? edit.uid : null, cfmt: edit ? edit.plat : (a.cfmt || 'tomo'), cover: edit ? edit.front || null : null, covers: [], isbn: edit ? edit.isbn : isbn, blob: null, blobUrl: null };
    openSub(manualHTML(edit || { title: isbn ? '' : q }), 'sheet');
    const t = document.getElementById('mTitle'); if (t && !edit) setTimeout(() => t.focus(), 60);
  }
  async function findManualCovers() {
    const title = ((document.getElementById('mTitle') || {}).value || '').trim();
    const series = ((document.getElementById('mSeries') || {}).value || '').trim();
    const box = document.getElementById('mCovers'); if (!box) return;
    if (title.length < 2) { toast('Escribe primero el título'); return; }
    box.insertAdjacentHTML('beforeend', '<p class="hint" id="mcWait">Buscando portadas…</p>');
    try {
      const q = series && !norm(title).includes(norm(series)) ? `${series} ${title}` : title;
      const run = (qq) => fetch(`${OL}/search.json?` + new URLSearchParams({ q: qq, limit: '24', fields: 'cover_i' })).then((r) => r.json()).then((j) => (j.docs || []).map((d) => d.cover_i).filter(Boolean));
      let ids = await run(q); if (ids.length < 3 && q !== title) ids = ids.concat(await run(title));
      manual.covers = [...new Set(ids)].slice(0, 18).map((id) => olCover(id));
      box.innerHTML = coversHTML();
      if (!manual.covers.length) box.insertAdjacentHTML('beforeend', '<p class="hint">No he encontrado portadas. Quedará con un diseño propio.</p>');
    } catch (e) { const w = document.getElementById('mcWait'); if (w) w.textContent = 'Sin conexión con Open Library.'; }
  }
  function saveManual() {
    const val = (id) => ((document.getElementById(id) || {}).value || '').trim();
    const title = val('mTitle'); if (!title) { toast('Falta el título'); return; }
    const data = { title: title.slice(0, 160), series: val('mSeries'), num: val('mNum'), publisher: val('mPub'), year: Number(val('mYear')) || null, authors: val('mAuth') };
    const snapS = snapshot();
    if (manual.edit) {
      const it = state.items.find((x) => x.uid === manual.edit); if (!it) return;
      if (it.title !== data.title || (it.series || '') !== data.series) delete it.cinfo;
      const usePhoto = manual.blob && manual.cover === manual.blobUrl;
      if (!usePhoto && manual.cover !== it.front) dropPhoto(it);
      Object.assign(it, data, { plat: manual.cfmt });
      if (!usePhoto && !it.photo) it.front = manual.cover || null;
      if (usePhoto) setPhoto(it, manual.blob).then(() => { rerenderDetail(); render(); });
      saveItems(); state.detail.item = it; closeSub(); closeSub(); rerenderDetail(); render();
      if (!it.cinfo) loadComicData(it);
      setTimeout(() => toastUndo('Datos guardados', snapS), 0); return;
    }
    const usePhoto = manual.blob && manual.cover === manual.blobUrl;
    const r = Object.assign({ ref: manual.isbn ? 'isbn:' + manual.isbn : 'm:' + uid(), isbn: manual.isbn || '', front: usePhoto ? null : manual.cover }, data);
    const wish = !!(state.add && state.add.wish);
    if (addItem(r, 'comic', manual.cfmt, wish)) {
      if (usePhoto) { const it = state.items.find((x) => x.ref === r.ref && x.plat === manual.cfmt); if (it) setPhoto(it, manual.blob).then(() => render()); }
      closeSub();
      state.tab = 'com'; LS.set('ludo.tab', 'com'); state.mode = wish ? 'wish' : 'mine'; state.friendId = null; render();
      toastUndo(`${title} añadido a tu estantería`, snapS);
    } else toast('Ya lo tienes en la estantería');
  }

  // ---------- Escáner de códigos de barras ----------
  let scanStream = null; let scanTimer = null;
  function stopScanner() {
    clearInterval(scanTimer); scanTimer = null;
    if (scanStream) { scanStream.getTracks().forEach((t) => t.stop()); scanStream = null; }
  }
  function cleanTitle(t) {
    return String(t || '')
      .replace(/\(.*?\)|\[.*?\]/g, ' ')
      .replace(/\b(nintendo switch 2|nintendo switch|switch 2|switch|nintendo 3ds|3ds|nintendo ds|nds|playstation ?[45]|ps ?[45]|sony|blu-?ray|dvd|4k|uhd|ultra hd|pal|esp|espa[ñn]a|spanish|import|videojuego|video game|game|juego|físico|standard edition|edición est[aá]ndar)\b/gi, ' ')
      .replace(/\s[-–|:,]\s*$/, '').replace(/\s+/g, ' ').trim();
  }
  function guessColl(t) {
    const s = String(t || '').toLowerCase();
    if (/blu-?ray|dvd|película|movie|film/.test(s)) return 'mov';
    if (/playstation|\bps ?[45]\b/.test(s)) return 'ps';
    if (/\b3ds\b|nintendo ds|\bnds\b/.test(s)) return 'nin';
    if (/switch/.test(s)) return 'sw';
    return null;
  }
  async function openScanner() {
    if (!('BarcodeDetector' in window)) { toast('Tu navegador no puede leer códigos. Escribe el título.'); return; }
    const back = state.add ? Object.assign({}, state.add) : { coll: state.tab, fmt: 'bluray', q: '' };
    state.layer = 'scan';
    $layers.innerHTML = `<div class="layer scanner" role="dialog" aria-modal="true" aria-label="Escanear código de barras">
      <video id="cam" playsinline muted></video><div class="frame" aria-hidden="true"></div>
      <div class="msg" id="scanMsg">Apunta al código de barras de la caja</div>
      <button class="icon-btn close" data-act="scanCancel" aria-label="Cancelar">${I.close}</button></div>`;
    let detector;
    try {
      detector = new window.BarcodeDetector({ formats: ['ean_13', 'upc_a', 'ean_8', 'upc_e'] });
      scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch (e) {
      stopScanner(); state.add = back; openAddWith(back); toast('No tengo permiso para usar la cámara'); return;
    }
    const video = document.getElementById('cam');
    if (!video) { stopScanner(); return; }
    video.srcObject = scanStream; await video.play().catch(() => {});
    let busy = false;
    scanTimer = setInterval(async () => {
      if (busy || !scanStream) return; busy = true;
      try {
        const codes = await detector.detect(video);
        if (codes && codes.length) {
          const code = codes[0].rawValue; stopScanner();
          if (navigator.vibrate) navigator.vibrate(60);
          const msg = document.getElementById('scanMsg'); if (msg) msg.textContent = `Código ${code}: buscando…`;
          await lookupBarcode(code, back);
        }
      } catch (e) { /* seguimos intentando */ }
      busy = false;
    }, 280);
  }
  function openAddWith(a) {
    state.add = a; state.layer = 'add';
    rerenderAdd();
  }
  async function lookupBarcode(code, back) {
    const isbn = isbnOf(code);
    if (isbn && (/^97[89]/.test(isbn) || back.coll === 'com')) {
      const a = Object.assign({}, back, { coll: 'com', q: isbn });
      openAddWith(a);
      return;
    }
    if (back.coll === 'com') { openAddWith(Object.assign({}, back, { q: '' })); toast('Ese código no es un ISBN. Añádelo a mano.'); return; }
    let title = null;
    try {
      const r = await fetch('https://api.upcitemdb.com/prod/trial/lookup?upc=' + encodeURIComponent(code));
      if (r.ok) { const j = await r.json(); title = j.items && j.items[0] && j.items[0].title; }
    } catch (e) { /* sin respuesta */ }
    const a = Object.assign({}, back);
    if (title) {
      const g = guessColl(title); if (g) a.coll = g;
      if (/blu-?ray/i.test(title)) a.fmt = 'bluray'; else if (/dvd/i.test(title)) a.fmt = 'dvd';
      a.q = cleanTitle(title) || title;
      openAddWith(a);
      toast('Lo he encontrado: revisa que sea tu edición');
    } else {
      a.q = '';
      openAddWith(a);
      toast('No reconozco ese código. Escribe el título, porfa.');
    }
  }

  // ---------- Compartir ----------
  const b64url = (bytes) => { let s = ''; bytes.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64url = (s) => { const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(bin, (c) => c.charCodeAt(0)); };
  async function streamBytes(bytes, Stream) {
    const res = new Response(new Blob([bytes]).stream().pipeThrough(new Stream('deflate-raw')));
    return new Uint8Array(await res.arrayBuffer());
  }
  const WIKI = 'https://upload.wikimedia.org/wikipedia/';
  const SHORT = [['~', WIKI], ['^', 'https://art.gametdb.com/'], ['*', 'https://image.tmdb.org/t/p/'], ['!', 'https://images.launchbox-app.com/'], ['@', 'https://covers.openlibrary.org/b/id/']];
  const shortU = (u) => { if (!u || String(u).startsWith('blob:')) return ''; const m = SHORT.find(([, p]) => u.startsWith(p)); return m ? m[0] + u.slice(m[1].length) : u; };
  const longU = (u) => { if (typeof u !== 'string' || !u) return null; const m = SHORT.find(([k]) => u[0] === k); return safeImg(m ? m[1] + u.slice(1) : u); };
  async function encodeShare() {
    const payload = {
      v: 1, n: state.name || 'Un amigo',
      i: state.items.map((it) => {
        const w = it.wish ? 1 : 0; const g = itemGenres(it); const dy = [it.seen ? 1 : 0, it.rating || 0];
        if (it.kind === 'game' && typeof it.ref === 'number') return [0, it.plat, it.ref, it.face ? 1 : 0, w, g, ...dy];
        if (it.kind === 'game') return [2, it.plat, String(it.ref), it.title, it.year || 0, shortU(it.front), shortU(it.full), shortU(it.media), it.face ? 1 : 0, shortU(it.back), w, g, ...dy, shortU(it.spine)];
        if (it.kind === 'comic') return [3, it.plat, it.title, it.year || 0, shortU(it.front), it.face ? 1 : 0, String(it.ref), w, g, ...dy, it.series || '', it.num || '', it.publisher || '', it.authors || '', it.isbn || ''];
        return [1, it.plat, it.title, it.year || 0, shortU(it.front), it.face ? 1 : 0, String(it.tmdbRef || it.ref), w, g, ...dy];
      })
    };
    const raw = new TextEncoder().encode(JSON.stringify(payload));
    if ('CompressionStream' in window) return 'd' + b64url(await streamBytes(raw, window.CompressionStream));
    return 'j' + b64url(raw);
  }
  const clampR = (n) => Math.max(0, Math.min(5, Math.round(Number(n) || 0)));
  const cleanG = (g) => (Array.isArray(g) ? g.filter((x) => typeof x === 'string').map((x) => x.slice(0, 24)).slice(0, 8) : null);
  async function decodeShare(s) {
    let bytes = unb64url(s.slice(1));
    if (s[0] === 'd') bytes = await streamBytes(bytes, window.DecompressionStream);
    const p = JSON.parse(new TextDecoder().decode(bytes));
    if (!p || p.v !== 1 || !Array.isArray(p.i)) throw new Error('enlace no válido');
    const name = String(p.n || 'Un amigo').slice(0, 40);
    const list = p.i.slice(0, 5000);
    const items = [];
    const plats = [...new Set(list.filter((x) => x[0] === 0 && PLAT[x[1]]).map((x) => x[1]))];
    await Promise.all(plats.map((pl) => loadPlat(pl).catch(() => null)));
    for (const x of list) {
      if (!Array.isArray(x) || !PLAT[x[1]]) continue;
      if (x[0] === 0) {
        let g = null; try { g = await findGame(x[1], x[2]); } catch (e) { g = null; }
        if (g) items.push(Object.assign({ uid: uid(), kind: 'game', face: !!x[3] }, g, { wish: !!x[4], genres: cleanG(x[5]) || g.genres || [], seen: !!x[6], rating: clampR(x[7]) }));
      } else if (x[0] === 1 && PLAT[x[1]].coll === 'mov') {
        items.push({ uid: uid(), kind: 'movie', plat: x[1], ref: String(x[6] || x[2]).slice(0, 200), title: String(x[2]).slice(0, 200), year: Number(x[3]) || null, front: longU(x[4]), back: null, media: null, full: null, face: !!x[5], wish: !!x[7], genres: cleanG(x[8]) || [], seen: !!x[9], rating: clampR(x[10]) });
      } else if (x[0] === 3 && PLAT[x[1]] && PLAT[x[1]].coll === 'com') {
        const st = (v, n) => String(v || '').slice(0, n);
        items.push({ uid: uid(), kind: 'comic', plat: x[1], ref: st(x[6], 200), title: st(x[2], 160), year: Number(x[3]) || null, front: longU(x[4]), back: null, media: null, full: null, face: !!x[5], wish: !!x[7], genres: cleanG(x[8]) || [], seen: !!x[9], rating: clampR(x[10]),
          series: st(x[11], 120), num: st(x[12], 12), publisher: st(x[13], 80), authors: st(x[14], 160), isbn: st(x[15], 13) });
      } else if (x[0] === 2 && PLAT[x[1]].coll !== 'mov' && PLAT[x[1]].coll !== 'com') {
        items.push({ uid: uid(), kind: 'game', plat: x[1], ref: String(x[2]).slice(0, 200), title: String(x[3]).slice(0, 200), year: Number(x[4]) || null, front: longU(x[5]), full: longU(x[6]), media: longU(x[7]), back: longU(x[9]), face: !!x[8], wish: !!x[10], genres: cleanG(x[11]) || [], seen: !!x[12], rating: clampR(x[13]), spine: longU(x[14]) });
      }
    }
    return { name, items };
  }
  function shareHTML() {
    return `<div class="layer sheet" role="dialog" aria-modal="true" aria-label="Compartir mi estantería">
      <div class="layer-head"><h2>Compartir mi estantería</h2><button class="icon-btn" data-act="closeLayer" aria-label="Cerrar">${I.close}</button></div>
      <div class="body scroll">
        <div class="field"><label for="myName">Tu nombre (así te verán tus amigos)</label><input id="myName" maxlength="40" value="${esc(state.name)}" placeholder="Por ejemplo, Juanjo"></div>
        <div class="card"><h3>Cómo funciona</h3><p>Se crea un enlace con tu colección dentro. Quien lo abra verá tu estantería con sus portadas y la guardará en su pestaña de Amigos. Las imágenes no viajan en el enlace: cada móvil las descarga por su cuenta.</p>
        <p>Es una foto del momento: cuando añadas juegos nuevos, vuelve a mandarlo.</p></div>
        <button class="btn btn-amber" data-act="doShare" style="height:52px">${I.share}Compartir enlace</button>
        <p class="hint" style="text-align:center">${plural(state.items.length, ['caja', 'cajas'])} en tu estantería</p>
      </div></div>`;
  }
  async function doShare() {
    const nameInput = document.getElementById('myName');
    state.name = (nameInput && nameInput.value.trim()) || state.name; LS.set('ludo.name', state.name);
    if (!state.name) { toast('Pon tu nombre para que sepan de quién es'); nameInput && nameInput.focus(); return; }
    if (!state.items.length) { toast('Tu estantería está vacía todavía'); return; }
    const data = await encodeShare();
    const url = `${location.origin}${location.pathname}#amigo=${data}`;
    const text = `Mira mi estantería en Ludoteca (${plural(state.items.length, ['caja', 'cajas'])})`;
    try {
      if (navigator.share) { await navigator.share({ title: `Ludoteca de ${state.name}`, text, url }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); toast('Enlace copiado. Pégalo en WhatsApp o donde quieras.'); }
    catch (e) { prompt('Copia este enlace:', url); }
  }
  async function receiveFromHash() {
    const m = location.hash.match(/amigo=([A-Za-z0-9_-]+)/);
    if (!m) return;
    history.replaceState(null, '', location.pathname + location.search);
    try {
      const { name, items } = await decodeShare(m[1]);
      await Promise.all(items.filter((i) => String(i.ref).startsWith('t:') && !i.front && !i.full).slice(0, 60).map(async (i) => {
        const g = await findGame(i.plat, i.ref).catch(() => null); if (g) { const r = await resolveTdb(g); Object.assign(i, { front: r.front, back: r.back, full: r.full, media: r.media }); }
      }));
      const id = norm(name) || uid();
      const prev = state.friends.findIndex((f) => f.id === id);
      const entry = { id, name, items, received: Date.now() };
      if (prev >= 0) state.friends[prev] = entry; else state.friends.push(entry);
      saveFriends();
      state.mode = 'friends'; state.friendId = id;
      const firstColl = orderedColls().find((c) => items.some((i) => PLAT[i.plat].coll === c.id));
      if (firstColl) state.tab = firstColl.id;
      render();
      toast(`Estantería de ${name} guardada en Amigos`);
    } catch (e) {
      toast('Ese enlace de estantería no funciona. Pide que te lo manden otra vez.');
    }
  }

  // ---------- Ajustes ----------
  function orderListHTML() {
    const o = orderedColls(); const h = hiddenColls();
    return o.map((c, i) => `<div class="order-row ${h.includes(c.id) ? 'off' : ''}"><span class="o-name">${esc(c.name)}</span>
      <button class="icon-btn sm" data-act="ordMove" data-id="${c.id}" data-d="-1" aria-label="Subir ${esc(c.name)}" ${i === 0 ? 'disabled' : ''}>${I.up}</button>
      <button class="icon-btn sm" data-act="ordMove" data-id="${c.id}" data-d="1" aria-label="Bajar ${esc(c.name)}" ${i === o.length - 1 ? 'disabled' : ''}>${I.down}</button>
      <label class="o-show"><input type="checkbox" data-act="ordShow" data-id="${c.id}" ${h.includes(c.id) ? '' : 'checked'}><span>Ver</span></label></div>`).join('');
  }
  function settingsHTML() {
    return `<div class="layer sheet" role="dialog" aria-modal="true" aria-label="Ajustes">
      <div class="layer-head"><h2>Ajustes</h2><button class="icon-btn" data-act="closeLayer" aria-label="Cerrar">${I.close}</button></div>
      <div class="body scroll">
        ${installPrompt ? `<div class="card"><h3>Instalar en el móvil</h3><p>Ludoteca se abrirá como una app más, a pantalla completa y sin conexión.</p><button class="btn btn-amber" data-act="install">${I.download}Instalar Ludoteca</button></div>` : ''}
        <div class="card"><h3>Cómo se ve</h3><p>La estantería con lomos, o tus portadas en grande, una detrás de otra.</p>
          <div class="pills" role="group" aria-label="Vista">${[['shelf', 'Estantería'], ['feed', 'Carrusel de portadas']].map(([v, n]) => `<button data-act="setView" data-id="${v}" aria-pressed="${viewMode() === v}">${n}</button>`).join('')}</div></div>
        <div class="card"><h3>Tus estanterías</h3><p>Ponlas en el orden que prefieras y oculta las que no uses. Cada persona lo elige en su móvil.</p>
          <div class="order-list" id="orderList">${orderListHTML()}</div></div>
        <div class="card"><h3>Copia de seguridad</h3><p>Tu colección vive en este móvil. Al guardar se abre el menú de compartir: elige Google Drive, tu correo o un chat contigo mismo. Para recuperarla, elige ese archivo.</p>
          <p>${lastBackup() ? `Última copia: ${esc(fmtDate(lastBackup()))}.` : 'Todavía no has guardado ninguna copia.'}</p>
          <div class="row"><button class="btn btn-ghost" data-act="export">${I.download}Guardar</button><button class="btn btn-ghost" data-act="import">Recuperar</button></div>
          <input type="file" id="importFile" accept="application/json,text/plain,.json,.txt" class="hidden"></div>
        <div class="card"><h3>De dónde salen las imágenes</h3><p>Nintendo: <a href="https://www.gametdb.com" target="_blank" rel="noopener">GameTDB</a>. PlayStation y resto de juegos: <a href="https://gamesdb.launchbox-app.com" target="_blank" rel="noopener">LaunchBox Games Database</a>${CATALOG_DATE ? ` (catálogo del ${esc(CATALOG_DATE)})` : ''}. Juegos que faltan: Wikipedia.</p>
          <p>Películas y series: <a href="https://www.themoviedb.org" target="_blank" rel="noopener">TMDB</a>. Este producto usa la API de TMDB pero no está respaldado ni certificado por TMDB.</p>
          <p>Ludoteca es un proyecto personal sin ánimo de lucro.</p></div>
      </div></div>`;
  }
  // Copia de seguridad: se abre el menú de compartir del móvil (Google Drive, correo,
  // WhatsApp…) sin cuentas. Si el navegador no puede, se descarga el archivo.
  const DAY = 86400000;
  const lastBackup = () => Number(LS.get('ludo.lastBackup', 0)) || 0;
  function backupDue() {
    const own = state.items.length;
    return own >= 5 && Date.now() - lastBackup() > 30 * DAY && Date.now() - (Number(LS.get('ludo.backupNag', 0)) || 0) > 3 * DAY;
  }
  const blobToData = (b) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ok(null); r.readAsDataURL(b); });
  async function exportBackup() {
    const photos = {};
    for (const it of state.items.filter((i) => i.photo)) { try { const b = await Photos.get(it.photo); if (b) photos[it.photo] = await blobToData(b); } catch (e) { /* sigue */ } }
    const data = JSON.stringify({ app: 'ludoteca', v: 1, saved: Date.now(), name: state.name, items: state.items, friends: state.friends, photos }, itemReplacer);
    const name = `ludoteca-copia-${new Date().toISOString().slice(0, 10)}.txt`;
    const file = new File([data], name, { type: 'text/plain' });
    const done = () => { LS.set('ludo.lastBackup', Date.now()); if (state.layer === 'settings') $layers.innerHTML = settingsHTML(); if (!state.layer) render(); };
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: 'Copia de Ludoteca', text: 'Copia de seguridad de mi colección de Ludoteca' }); done(); toast('Copia guardada'); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    done(); toast('Copia descargada en tu móvil');
  }
  function comicFields(i) {
    if (i.kind !== 'comic') return {};
    const st = (v, n) => (v ? String(v).slice(0, n) : undefined);
    return { series: st(i.series, 120), num: st(i.num, 12), publisher: st(i.publisher, 80), authors: st(i.authors, 160), isbn: st(i.isbn, 13) };
  }
  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const j = JSON.parse(reader.result);
        if (j.app !== 'ludoteca' || !Array.isArray(j.items)) throw new Error('x');
        const clean = j.items.filter((i) => i && PLAT[i.plat] && i.title).map((i) => ({
          uid: String(i.uid || uid()), kind: ['movie', 'comic'].includes(i.kind) ? i.kind : 'game', plat: i.plat, ref: i.ref, title: String(i.title), ...comicFields(i),
          year: i.year || null, front: safeImg(i.front), back: safeImg(i.back), media: safeImg(i.media), full: safeImg(i.full), spine: safeImg(i.spine), spinev: Number(i.spinev) || 0, face: !!i.face, wish: !!i.wish, genres: cleanG(i.genres) || undefined, imgv: Number(i.imgv) || 0, added: i.added || Date.now(), seen: !!i.seen, seenAt: Number(i.seenAt) || undefined, rating: clampR(i.rating), tmdbRef: typeof i.tmdbRef === 'string' && i.tmdbRef.startsWith('tmdb:') ? i.tmdbRef.slice(0, 40) : undefined,
          paid: isNum(i.paid) ? i.paid : undefined, value: isNum(i.value) ? i.value : undefined, valueAt: Number(i.valueAt) || undefined,
          paidAt: typeof i.paidAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(i.paidAt) ? i.paidAt : undefined,
          photo: typeof i.photo === 'string' && j.photos && typeof j.photos[i.photo] === 'string' ? i.photo.slice(0, 60) : undefined
        }));
        state.items = clean; saveItems();
        if (j.photos) (async () => {
          for (const it of clean.filter((x) => x.photo)) {
            const d = j.photos[it.photo];
            if (!/^data:image\/(jpeg|png|webp);base64,/.test(d)) { delete it.photo; continue; }
            try { const b = await fetch(d).then((r) => r.blob()); await Photos.put(it.photo, b); applyPhoto(it, it.photo, b); } catch (e) { delete it.photo; }
          }
          saveItems(); render();
        })();
        if (Array.isArray(j.friends)) {
          state.friends = j.friends.filter((f) => f && f.id && Array.isArray(f.items)).map((f) => ({
            id: String(f.id), name: String(f.name || 'Amigo').slice(0, 40), received: Number(f.received) || Date.now(),
            items: f.items.filter((i) => i && PLAT[i.plat] && i.title).map((i) => ({
              uid: String(i.uid || uid()), kind: ['movie', 'comic'].includes(i.kind) ? i.kind : 'game', plat: i.plat, ref: i.ref, title: String(i.title), ...comicFields(i),
              year: i.year || null, front: safeImg(i.front), back: safeImg(i.back), media: safeImg(i.media), full: safeImg(i.full), face: !!i.face, wish: !!i.wish, genres: cleanG(i.genres) || [], seen: !!i.seen, rating: clampR(i.rating)
            }))
          }));
          saveFriends();
        }
        if (j.name) { state.name = String(j.name).slice(0, 40); LS.set('ludo.name', state.name); }
        closeLayer(); render(); toast(`Copia recuperada: ${plural(clean.length, ['caja', 'cajas'])}`);
        cacheImgs(clean.flatMap((i) => [i.front, i.back, i.media]));
      } catch (e) { toast('Ese archivo no es una copia de Ludoteca'); }
    };
    reader.readAsText(file);
  }

  // ---------- Eventos ----------
  $app.addEventListener('click', async (e) => {
    // El "click" que el navegador lanza al terminar de deslizar no es un toque de verdad
    if (suppressClick && performance.now() - suppressClick < 300 && !e.target.closest('#scrubTip')) { suppressClick = 0; return; }
    suppressClick = 0;
    const el = e.target.closest('[data-act]');
    if (picked && (!el || (el.dataset.act !== 'open' && el.dataset.act !== 'openPicked'))) clearPick();
    if (!el) return;
    const act = el.dataset.act; const id = el.dataset.id;
    switch (act) {
      case 'tab': state.tab = id; LS.set('ludo.tab', id); state.filter.q = ''; state.searchOpen = false; state.filter.genre = ''; render(); $content.scrollTop = 0; break;
      case 'mode': state.mode = id; state.filter.q = ''; state.searchOpen = false; state.filter.genre = ''; render(); $content.scrollTop = 0; break;
      case 'open': {
        const it = shownItems().find((x) => x.uid === el.dataset.uid); if (!it) break;
        if (el.classList.contains('spine') && picked !== it.uid) {
          clearPick(); el.classList.add('picked'); picked = it.uid; showTip(el, null, false);
          if (navigator.vibrate) navigator.vibrate(6);
          break;
        }
        clearPick(); openDetail(it, !!state.friendId);
        break;
      }
      case 'openPicked': {
        const it = shownItems().find((x) => x.uid === el.dataset.uid);
        clearPick(); if (it) openDetail(it, !!state.friendId);
        break;
      }
      case 'view': setView(id); break;
      case 'closeLayer': closeLayer(); break;
      case 'toggleFace': {
        const it = state.detail && state.items.find((x) => x.uid === state.detail.item.uid);
        if (it) { it.face = !it.face; saveItems(); state.detail.item = it; rerenderDetail(); render(); }
        break;
      }
      case 'remove': {
        const u = state.detail.item.uid; const was = state.detail.item; const snap = snapshot();
        state.items = state.items.filter((x) => x.uid !== u); saveItems();
        closeLayer(); render(); toastUndo(was.wish ? `${was.title} quitado de tus deseos` : `${was.title} quitado de tu estantería`, snap);
        break;
      }
      case 'undo': {
        if (!undoSnap) break;
        state.items = undoSnap; undoSnap = null; saveItems(); $toast.innerHTML = '';
        if (state.detail) {
          const it = state.items.find((x) => x.uid === state.detail.item.uid);
          if (it) { state.detail.item = it; rerenderDetail(); } else if (state.layer === 'detail') closeLayer();
        }
        if (state.add) runSearch();
        render(); toast('Deshecho');
        break;
      }
      case 'copyToMine':
      case 'copyToWish': {
        const it = state.detail.item; const w = act === 'copyToWish';
        const snapC = snapshot();
        if (addItem(it, it.kind, it.plat, w)) { toastUndo(w ? 'Añadido a tus deseos' : 'Añadido a tu estantería', snapC); rerenderDetail(); }
        else toast('Ya lo tienes apuntado');
        break;
      }
      case 'gotIt': {
        const it = state.items.find((x) => x.uid === state.detail.item.uid); if (!it) break;
        const snapG = snapshot();
        it.wish = false; it.added = Date.now(); it.face = countFace(PLAT[it.plat].coll) < 4; saveItems();
        closeLayer(); state.mode = 'mine'; render(); toastUndo(`¡${it.title} ya está en tu estantería!`, snapG);
        break;
      }
      case 'viewer': openViewer(); break;
      case 'ficha': if (!$layers.querySelector('.sub.ficha')) openFicha(); break;
      case 'seenToggle': {
        const it = state.items.find((x) => x.uid === state.detail.item.uid); if (!it) break;
        it.seen = !it.seen; if (it.seen && !it.seenAt) it.seenAt = Date.now(); saveItems(); state.detail.item = it; refreshFicha();
        break;
      }
      case 'rate': {
        const it = state.items.find((x) => x.uid === state.detail.item.uid); if (!it) break;
        const n = Number(el.dataset.n); it.rating = it.rating === n ? 0 : n;
        if (it.rating && !it.seen) { it.seen = true; it.seenAt = it.seenAt || Date.now(); }
        saveItems(); state.detail.item = it; refreshFicha();
        break;
      }
      case 'synMore': { const p = document.getElementById('syn'); if (p) p.classList.add('open'); el.remove(); break; }
      case 'sagaWish': addMissingSaga(); break;
      case 'person': openPerson(Number(id), el.dataset.name, el.dataset.role); break;
      case 'personWish': {
        const m = personList[Number(el.dataset.i)]; if (!m || !state.detail) break;
        const snap = snapshot();
        if (addItem(m, 'movie', state.detail.item.kind === 'movie' ? state.detail.item.plat : 'bluray', true)) {
          el.outerHTML = '<span class="state">En deseos</span>'; render(); toastUndo(`${m.title} apuntada en tus deseos`, snap);
        }
        break;
      }
      case 'altImages': openAlt(); break;
      case 'altPick': pickAlt(Number(el.dataset.i)); break;
      case 'closeSub': closeSub(); break;
      case 'editGenres': openGenres(); break;
      case 'gToggle': { const g = el.dataset.id; gSel = gSel.includes(g) ? gSel.filter((x) => x !== g) : gSel.concat(g); el.setAttribute('aria-pressed', String(gSel.includes(g))); break; }
      case 'gAdd': {
        const inp = document.getElementById('gNew'); const v = (inp && inp.value || '').trim().slice(0, 24);
        if (v) { const nice = v[0].toUpperCase() + v.slice(1); if (!gSel.includes(nice)) gSel.push(nice); refreshGenres(); }
        break;
      }
      case 'gSave': {
        const it = state.items.find((x) => x.uid === state.detail.item.uid); if (!it) break;
        const snapS = snapshot(); it.genres = gSel.slice(0, 8); saveItems(); setTimeout(() => toastUndo('Géneros guardados', snapS), 0); state.detail.item = it; closeSub(); rerenderDetail(); render();
        break;
      }
      case 'addWish': state.add.wish = id === '1'; state.add.q = (document.getElementById('q') || {}).value || ''; rerenderAdd(); break;
      case 'friendWish': state.friendWish = id === '1'; state.filter.genre = ''; state.filter.notMine = false; render(); break;
      case 'genre': state.filter.genre = id; state.filter.notMine = false; render(); break;
      case 'openSearch': { state.searchOpen = true; render(); const q = document.getElementById('shelfQ'); if (q) q.focus(); break; }
      case 'closeSearch': state.searchOpen = false; state.filter.q = ''; render(); break;
      case 'value': openValue(); break;
      case 'vSave': saveValue(); break;
      case 'vClear': saveValue(true); break;
      case 'notMine': state.filter.notMine = !state.filter.notMine; render(); break;
      case 'stats': state.layer = 'stats'; $layers.innerHTML = statsHTML(); break;
      case 'add': openAdd(state.tab); break;
      case 'addColl': state.add.coll = id; state.add.q = (document.getElementById('q') || {}).value || ''; rerenderAdd(); break;
      case 'addCfmt': state.add.cfmt = id; state.add.q = (document.getElementById('q') || {}).value || ''; rerenderAdd(); break;
      case 'manual': openManual(); break;
      case 'photo': photoForDetail(); break;
      case 'photoDel': { const it = state.items.find((x) => x.uid === state.detail.item.uid); if (it) { dropPhoto(it); saveItems(); state.detail.item = it; closeSub(); rerenderDetail(); render(); toast('Vuelve la portada del catálogo'); } break; }
      case 'cropSave': cropSave(); break;
      case 'cropAgain': { const c = crop; if (!c) break; crop = null; URL.revokeObjectURL(c.url); closeSub(); pickPhoto(c.aspect, c.done); break; }
      case 'mPhoto': pickPhoto(PLAT[manual.cfmt].w / PLAT[manual.cfmt].h, (blob) => { manual.blob = blob; if (manual.blobUrl) URL.revokeObjectURL(manual.blobUrl); manual.blobUrl = URL.createObjectURL(blob); manual.cover = manual.blobUrl; const b = document.getElementById('mCovers'); if (b) b.innerHTML = coversHTML(); }); break;
      case 'setView': LS.set('ludo.view', id); document.querySelectorAll('[data-act="setView"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id))); break;
      case 'mFmt': manual.cfmt = id; el.parentNode.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === el))); break;
      case 'mCoverFind': findManualCovers(); break;
      case 'mCoverPick': manual.cover = el.dataset.u || null; document.querySelectorAll('#mCovers .mc').forEach((b) => b.setAttribute('aria-pressed', String(b === el))); break;
      case 'mSave': saveManual(); break;
      case 'comicEdit': openManual(state.detail.item); break;
      case 'addFmt': state.add.fmt = id; state.add.q = (document.getElementById('q') || {}).value || ''; rerenderAdd(); break;
      case 'pick': {
        let r = lastResults[Number(el.dataset.i)]; if (!r) break;
        const isMovie = state.add.coll === 'mov'; const isComic = state.add.coll === 'com';
        const plat = isMovie ? state.add.fmt : isComic ? (state.add.cfmt || 'tomo') : r.plat;
        if (state.items.find((m) => m.plat === plat && String(m.ref) === String(r.ref))) { toast('Ya lo tienes en la estantería'); break; }
        if (r.tdb && !r.front && !r.full) {
          el.querySelector('.state').textContent = 'Buscando…';
          r = await resolveTdb(r);
          if (!state.add) break;
        }
        const wish = !!state.add.wish; const snapA = snapshot();
        if (addItem(r, isMovie ? 'movie' : isComic ? 'comic' : 'game', plat, wish)) {
          el.classList.add('owned'); el.querySelector('.state').textContent = wish ? 'En tus deseos' : 'En tu estantería';
          state.tab = PLAT[plat].coll; LS.set('ludo.tab', state.tab); state.mode = wish ? 'wish' : 'mine'; state.friendId = null; render();
          toastUndo(wish ? `${r.title} añadido a tus deseos` : `${r.title} añadido a tu estantería`, snapA);
        } else toast('Ya lo tienes en la estantería');
        break;
      }
      case 'wikiGames': {
        const q = (document.getElementById('q') || {}).value || '';
        const $res = document.getElementById('results'); const $hint = document.getElementById('hint');
        $hint.textContent = 'Buscando en Wikipedia…';
        try {
          const list = (await searchWikiGames(q)).map((r) => Object.assign(r, { wiki: true, ref: 'w:' + r.ref }));
          if (!state.add) break;
          $res.innerHTML = resultsHTML(list, false, null);
          $hint.textContent = list.length ? 'Elige la consola de tu edición. Solo trae portada, sin contraportada.' : 'Tampoco aparece en Wikipedia. Prueba con el título en inglés.';
        } catch (err) { $hint.textContent = 'No he podido conectar con Wikipedia.'; }
        break;
      }
      case 'pickWiki': {
        const r = lastResults[Number(el.dataset.i)]; const plat = el.dataset.plat; if (!r || !PLAT[plat]) break;
        const wishW = !!state.add.wish; const snapW = snapshot();
        if (addItem(r, 'game', plat, wishW)) {
          el.closest('.result').classList.add('owned');
          state.tab = PLAT[plat].coll; LS.set('ludo.tab', state.tab); state.mode = wishW ? 'wish' : 'mine'; state.friendId = null; render();
          toastUndo(`${r.title} añadido`, snapW);
        } else toast('Ya lo tienes en la estantería');
        break;
      }
      case 'clearQ': {
        const q = document.getElementById('q'); if (!q) break;
        q.value = ''; if (state.add) state.add.q = ''; searchSeq += 1;
        const $res = document.getElementById('results'); if ($res) $res.innerHTML = '';
        syncClear(); q.focus();
        break;
      }
      case 'scan': openScanner(); break;
      case 'scanCancel': stopScanner(); openAddWith(state.add || { coll: state.tab, fmt: 'bluray', q: '' }); break;
      case 'share': state.layer = 'share'; $layers.innerHTML = shareHTML(); break;
      case 'doShare': doShare(); break;
      case 'settings': state.layer = 'settings'; $layers.innerHTML = settingsHTML(); break;
      case 'export': exportBackup(); break;
      case 'nagLater': LS.set('ludo.backupNag', Date.now()); render(); break;
      case 'ordMove': {
        const o = collOrder(); const i = o.indexOf(id); const j = i + Number(el.dataset.d);
        if (i < 0 || j < 0 || j >= o.length) break;
        [o[i], o[j]] = [o[j], o[i]]; LS.set('ludo.order', o);
        document.getElementById('orderList').innerHTML = orderListHTML(); render();
        const again = document.querySelector(`[data-act="ordMove"][data-id="${id}"][data-d="${el.dataset.d}"]`); if (again && !again.disabled) again.focus();
        break;
      }
      case 'ordShow': {
        let h = hiddenColls();
        h = el.checked ? h.filter((x) => x !== id) : h.concat(id);
        if (h.length >= COLLS.length) { el.checked = true; toast('Tiene que quedar al menos una estantería'); break; }
        LS.set('ludo.hidden', h); document.getElementById('orderList').innerHTML = orderListHTML(); render();
        break;
      }
      case 'import': { const f = document.getElementById('importFile'); f.onchange = () => f.files[0] && importBackup(f.files[0]); f.click(); break; }
      case 'install': if (installPrompt) { installPrompt.prompt(); installPrompt = null; closeLayer(); } break;
      case 'openFriend': state.friendId = id; state.friendWish = false; state.filter = Object.assign(state.filter, { q: '', genre: '', notMine: false }); { const f = currentFriend(); const c = f && orderedColls().find((cc) => f.items.some((i) => PLAT[i.plat].coll === cc.id)); if (c) state.tab = c.id; } render(); $content.scrollTop = 0; break;
      case 'closeFriend': state.friendId = null; state.mode = 'friends'; render(); break;
      case 'removeFriend': {
        if (el.dataset.armed) { state.friends = state.friends.filter((f) => f.id !== id); saveFriends(); render(); }
        else { el.dataset.armed = '1'; el.style.background = '#b3261e'; el.setAttribute('aria-label', 'Toca otra vez para quitar'); toast('Toca otra vez la papelera para quitarlo'); }
        break;
      }
      default: break;
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; if ($layers.querySelector('.sub')) closeSub(); else if (state.layer) closeLayer(); });
  let lastW = window.innerWidth;
  window.addEventListener('resize', debounce(() => {
    // El teclado del móvil solo cambia el alto: no repintamos, o se cerraría al escribir
    if (window.innerWidth === lastW) return;
    lastW = window.innerWidth;
    const a = document.activeElement; if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
    render(); if (state.layer === 'detail') rerenderDetail();
  }, 200));
  window.addEventListener('hashchange', receiveFromHash);
  $content.addEventListener('scroll', () => { if (picked) clearPick(); }, { passive: true });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });

  // ---------- Arranque ----------
  async function boot() {
    try {
      const r = await fetch('data/index.json', { cache: 'no-cache' });
      if (r.ok) { const j = await r.json(); if (j.imgBase) IMG_BASE = new URL(j.imgBase, location.href).href; CATALOG_DATE = j.updated || ''; }
    } catch (e) { /* sin conexión: usamos lo guardado */ }
    render();
    loadPhotos();
    receiveFromHash();
    setTimeout(upgradeItems, 800);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }
  boot();
})();
