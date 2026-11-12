'use strict';
/* Ludoteca – colección de juegos y películas en una estantería de madera.
   Todo funciona en el navegador: la colección se guarda en el propio móvil. */
(function () {
  // ---------- Plataformas y colecciones ----------
  const PLAT = {
    ds:      { label: 'NINTENDO DS',       short: 'DS',       coll: 'nin', caseColor: '#1d1d1f', bandText: '#f2f2f2', w: 96,  h: 106, sw: 15, depth: 0.12, media: 'cart' },
    '3ds':   { label: 'NINTENDO 3DS',      short: '3DS',      coll: 'nin', caseColor: '#ececec', bandText: '#a3121c', w: 96,  h: 106, sw: 15, depth: 0.12, media: 'cart' },
    switch:  { label: 'NINTENDO SWITCH',   short: 'Switch',   coll: 'sw',  caseColor: '#d4101b', bandText: '#ffffff', w: 84,  h: 138, sw: 14, depth: 0.1, media: 'cart' },
    switch2: { label: 'NINTENDO SWITCH 2', short: 'Switch 2', coll: 'sw',  caseColor: '#d4101b', bandText: '#ffffff', w: 84,  h: 138, sw: 14, depth: 0.1, media: 'cart' },
    ps4:     { label: 'PS4',               short: 'PS4',      coll: 'ps',  caseColor: '#1a3f8f', bandText: '#ffffff', w: 100, h: 124, sw: 16, depth: 0.1, media: 'disc' },
    ps5:     { label: 'PS5',               short: 'PS5',      coll: 'ps',  caseColor: '#2257b8', bandText: '#ffffff', w: 100, h: 124, sw: 16, depth: 0.1, media: 'disc' },
    dvd:     { label: 'DVD',               short: 'DVD',      coll: 'mov', caseColor: '#141414', bandText: '#dddddd', w: 90,  h: 128, sw: 15, depth: 0.1, media: 'disc' },
    bluray:  { label: 'BLU-RAY',           short: 'Blu-ray',  coll: 'mov', caseColor: '#1560bd', bandText: '#ffffff', w: 98,  h: 120, sw: 13, depth: 0.09, media: 'disc' }
  };
  const COLLS = [
    { id: 'nin', name: 'DS · 3DS',    full: 'Nintendo DS y 3DS',          plats: ['ds', '3ds'],         noun: ['juego', 'juegos'] },
    { id: 'sw',  name: 'Switch',      full: 'Nintendo Switch y Switch 2', plats: ['switch', 'switch2'], noun: ['juego', 'juegos'] },
    { id: 'ps',  name: 'PlayStation', full: 'PlayStation 4 y 5',          plats: ['ps4', 'ps5'],        noun: ['juego', 'juegos'] },
    { id: 'mov', name: 'Películas',   full: 'DVD y Blu-ray',              plats: ['dvd', 'bluray'],     noun: ['película', 'películas'] }
  ];
  const collOf = (id) => COLLS.find((c) => c.id === id) || COLLS[1];
  const ALLOWED_IMG = ['https://images.launchbox-app.com/', 'https://upload.wikimedia.org/', 'https://art.gametdb.com/', 'https://image.tmdb.org/'];
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
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>'
  };

  // ---------- Estado ----------
  const state = {
    items: LS.get('ludo.items', []),
    friends: LS.get('ludo.friends', []),
    name: LS.get('ludo.name', ''),
    tab: LS.get('ludo.tab', 'sw'),
    mode: 'mine',          // 'mine' | 'friends'
    friendId: null,        // estantería de amigo abierta
    detail: null,          // { item, view, readOnly }
    add: null,             // { coll, fmt }
    layer: null            // 'detail' | 'add' | 'share' | 'settings' | 'scan'
  };
  const saveItems = () => LS.set('ludo.items', state.items);
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

  // ---------- Vista principal ----------
  function currentFriend() { return state.friendId ? state.friends.find((f) => f.id === state.friendId) : null; }
  function shownItems() { const f = currentFriend(); return f ? f.items : state.items; }

  function render() {
    const friend = currentFriend();
    const items = shownItems();
    const coll = collOf(state.tab);
    const counts = Object.fromEntries(COLLS.map((c) => [c.id, items.filter((i) => PLAT[i.plat] && PLAT[i.plat].coll === c.id).length]));
    const tabs = `<nav class="tabs" role="tablist" aria-label="Colecciones">${COLLS.map((c) =>
      `<button role="tab" data-act="tab" data-id="${c.id}" aria-selected="${c.id === coll.id}">${esc(c.name)}<span class="n">${counts[c.id]}</span></button>`).join('')}</nav>`;

    if (friend) {
      $top.innerHTML = `<div class="friend-banner"><button class="icon-btn" data-act="closeFriend" aria-label="Volver a mis amigos">${I.back}</button>
        <div><div class="kicker">Estantería de</div><div class="who">${esc(friend.name)}</div></div>
        <div style="flex:1"></div><div class="when">Recibida el ${esc(fmtDate(friend.received))}</div></div>${tabs}`;
    } else {
      $top.innerHTML = `<div class="top-row"><div><div class="kicker">Mi colección</div><h1 class="brand">Ludoteca</h1></div>
        <div class="top-actions"><button class="icon-btn" data-act="share" aria-label="Compartir mi estantería">${I.share}</button>
        <button class="icon-btn" data-act="settings" aria-label="Ajustes">${I.gear}</button></div></div>
        <div class="modes" role="group" aria-label="Qué estanterías ver"><button data-act="mode" data-id="mine" aria-pressed="${state.mode === 'mine'}">Mi estantería</button>
        <button data-act="mode" data-id="friends" aria-pressed="${state.mode === 'friends'}">Amigos${state.friends.length ? ` · ${state.friends.length}` : ''}</button></div>
        ${state.mode === 'mine' ? tabs : '<div style="height:12px"></div>'}`;
    }

    if (!friend && state.mode === 'friends') {
      renderFriends();
    } else {
      renderShelf(items, coll, !!friend);
    }

    if (friend) {
      $dock.innerHTML = `<span>Solo lectura · toca una caja para verla</span><button class="btn btn-ghost" data-act="closeFriend">Cerrar</button>`;
    } else if (state.mode === 'friends') {
      $dock.innerHTML = `<span>Enséñales la tuya</span><button class="btn btn-amber" data-act="share">${I.share}Compartir</button>`;
    } else {
      $dock.innerHTML = `<span>${items.length ? 'Toca un lomo para sacarlo' : 'Empieza tu colección'}</span><button class="btn btn-amber" data-act="add" aria-label="Añadir a la colección">${I.plus}Añadir</button>`;
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
  function coverInner(it) {
    if (!it.front && it.full) return fullPart(it, '100%');
    return it.front
      ? `<img src="${esc(it.front)}" alt="" loading="lazy" decoding="async">`
      : `<div style="position:absolute;inset:0;display:flex;align-items:flex-end;padding:8px;background:${colorFor(it.title)};font:800 11px/1.05 var(--serif);color:#fff">${esc(it.title)}</div>`;
  }

  function itemHTML(it, tilt) {
    const p = PLAT[it.plat];
    const label = esc(`${it.title}, ${p.short}`);
    if (it.face) {
      return `<button class="item front" data-act="open" data-uid="${esc(it.uid)}" aria-label="${label}">
        <div class="case" style="width:${p.w}px;height:${p.h}px;background:${p.caseColor}">
          <div class="cover">${coverInner(it)}</div></div></button>`;
    }
    const art = it.full ? `background-image:url('${cssUrl(it.full)}');background-size:auto 100%;background-position:50% 0`
      : it.front ? `background-image:url('${cssUrl(it.front)}')` : `background:${colorFor(it.title)}`;
    return `<button class="item spine" data-act="open" data-uid="${esc(it.uid)}" aria-label="${label}" style="transform:rotate(${tilt}deg)">
      <div class="body" style="width:${p.sw}px;height:${p.h}px;background:${p.caseColor}">
        <div style="height:14px;flex:none"></div><div class="art" style="${art}"><span>${esc(it.title)}</span></div><div style="height:16px;flex:none"></div>
      </div></button>`;
  }

  function renderShelf(items, coll, readOnly) {
    const list = items.filter((i) => PLAT[i.plat] && PLAT[i.plat].coll === coll.id).sort(byTitle);
    const head = `<div class="wall-head"><h2>${esc(coll.full)}</h2><span>${plural(list.length, coll.noun)}</span></div>`;
    if (!list.length) {
      const msg = readOnly
        ? `<div class="empty"><h3>Balda vacía</h3><p>Todavía no tiene nada en esta estantería.</p></div>`
        : `<div class="empty"><h3>Esta balda está vacía</h3><p>Busca por título y la caja aparecerá aquí con su portada y su contraportada.</p><button class="btn btn-amber" data-act="add">${I.plus}Añadir el primero</button></div>`;
      $content.innerHTML = head + `<div class="shelf"><div class="shelf-row" style="min-height:60px"></div><div class="plank"></div><div class="plank-under"></div></div>` + msg;
      return;
    }
    const max = shelfWidth();
    const rows = pack(list, max);
    $content.innerHTML = head + rows.map((r) => {
      const last = r.items[r.items.length - 1];
      return `<div class="shelf"><div class="shelf-row">${r.items.map((it) =>
        itemHTML(it, it === last && !it.face && max - r.w > 40 ? 9 : 0)).join('')}</div><div class="plank"></div><div class="plank-under"></div></div>`;
    }).join('');
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
      const by = COLLS.map((c) => [c, f.items.filter((i) => PLAT[i.plat].coll === c.id).length]).filter((x) => x[1]);
      const covers = f.items.filter((i) => i.front).slice(0, 3).map((i) => `<img src="${esc(i.front)}" alt="" loading="lazy">`).join('');
      return `<div class="friend"><button class="open" data-act="openFriend" data-id="${esc(f.id)}">
        <b>${esc(f.name)}</b><small>${by.map(([c, n]) => `${esc(c.name)} ${n}`).join(' · ') || 'Estantería vacía'}</small>
        <small>Actualizada el ${esc(fmtDate(f.received))}</small></button>
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

  function plainBack(p) {
    return `<div class="plain-back"><div class="pb-mold"></div><div class="pb-note">Contraportada no disponible en el catálogo</div></div>`;
  }

  function genericDisc(it, p, size) {
    return `<div class="gdisc" style="width:${size}px;height:${size}px" role="img" aria-label="Disco">
      <span class="gd-t">${esc(it.title)}</span><span class="gd-p">${esc(p.short)}</span><i class="gd-hole"></i></div>`;
  }
  function discEl(it, p, size) {
    if (it.media) return `<img class="disc-img" src="${esc(it.media)}" alt="Disco de ${esc(it.title)}" style="width:${size}px;height:${size}px">`;
    return genericDisc(it, p, size);
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
    const frontInner = (it.front ? `<img class="art" src="${esc(it.front)}" alt="Portada de ${esc(it.title)}" draggable="false">` : it.full ? fullPart(it, '100%') : `<div class="art noart" style="background:${colorFor(it.title)}"><span>${esc(it.title)}</span></div>`) + '<i class="gloss"></i>';
    const backInner = (it.back ? `<img class="art" src="${esc(it.back)}" alt="Contraportada de ${esc(it.title)}" draggable="false">` : it.full ? fullPart(it, '0%') : plainBack(p)) + '<i class="gloss"></i>';
    const spineInner = `<div class="sp-art" style="${artBg(it)}"></div><span class="sp-t">${esc(it.title)}</span>`;
    const box = [
      face('bf-front', W, H, `translateZ(${D / 2}px)`, frontInner),
      face('bf-back', W, H, `rotateY(180deg) translateZ(${D / 2}px)`, backInner),
      face('bf-spine', D, H, `rotateY(-90deg) translateZ(${W / 2}px)`, spineInner),
      face('bf-edge', D, H, `rotateY(90deg) translateZ(${W / 2}px)`, ''),
      face('bf-cap', W, D, `rotateX(90deg) translateZ(${H / 2}px)`, ''),
      face('bf-cap', W, D, `rotateX(-90deg) translateZ(${H / 2}px)`, '')
    ].join('');

    const parts = insideParts(it, p, W, H);
    const sc = Math.min(1, (vw - 28) / (2 * W));
    const views = [['front', 'Portada'], ['back', 'Contraportada'], ['inside', 'Por dentro']];

    let actions;
    if (d.readOnly) {
      actions = ownedSame(it)
        ? `<div class="row"><button class="btn btn-ghost" disabled>Tú también lo tienes</button></div>`
        : `<div class="row"><button class="btn btn-amber" data-act="copyToMine">${I.plus}Lo tengo yo también</button></div>`;
    } else {
      actions = `<div class="row"><button class="btn btn-amber" data-act="toggleFace">${I.flip}${it.face ? 'Guardar de lado' : 'Poner de frente'}</button>
        <button class="btn btn-danger" data-act="remove" style="flex:0 0 auto" aria-label="Quitar de mi colección">${I.trash}</button></div>`;
    }

    return `<div class="layer detail" role="dialog" aria-modal="true" aria-label="${esc(it.title)}">
      <div class="layer-head"><div style="display:flex;flex-direction:column;gap:6px;min-width:0">
        <span class="chip" style="background:${p.caseColor};color:${p.bandText}">${p.label}</span>
        <h2>${esc(it.title)}${it.year ? ` <span style="font-weight:600;font-size:16px;color:var(--soft)">${esc(it.year)}</span>` : ''}</h2></div>
        <button class="icon-btn" data-act="closeLayer" aria-label="Devolver a la estantería">${I.close}</button></div>
      <div class="stage" id="stage" style="${caseVar}">
        <div class="scene ${d.view === 'inside' ? 'hidden' : ''}" id="scene">
          <div class="floor" style="width:${Math.round(W * 1.1)}px;top:${Math.round(H / 2 + 8)}px;left:${-Math.round(W * 0.55)}px"></div>
          <div class="box anim" id="box">${box}</div>
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
      <div class="controls"><div class="seg" role="group" aria-label="Vista">${views.map(([id, n]) =>
        `<button data-act="view" data-id="${id}" aria-pressed="${d.view === id}">${n}</button>`).join('')}</div>${actions}</div></div>`;
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
      fx.drag = { x: e.clientX, y: e.clientY, rx: fx.rx, ry: fx.ry, t: performance.now(), vx: 0, lx: e.clientX };
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', (e) => {
      if (!fx.drag) return;
      const dx = e.clientX - fx.drag.x; const dy = e.clientY - fx.drag.y;
      const now = performance.now();
      fx.drag.vx = (e.clientX - fx.drag.lx) / Math.max(1, now - fx.drag.t); fx.drag.lx = e.clientX; fx.drag.t = now;
      fx.ry = fx.drag.ry + dx * 0.55;
      fx.rx = Math.max(-35, Math.min(35, fx.drag.rx - dy * 0.35));
      if (Math.abs(dx) > 6 && !fx.moved) { fx.moved = true; const h = document.getElementById('dragHint'); if (h) h.style.opacity = '0'; }
      applyBox();
    });
    const end = () => {
      if (!fx.drag) return;
      const box = document.getElementById('box');
      const fling = fx.drag.vx * 110; // pequeño impulso al soltar
      fx.drag = null;
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
  }

  function rerenderDetail() {
    const v = state.detail.view;
    $layers.innerHTML = detailHTML();
    bindStage();
    const box = document.getElementById('box'); if (box) { box.classList.remove('anim'); applyBox(); }
    if (v === 'inside') document.getElementById('opened').classList.add('open');
  }

  function closeLayer() {
    stopScanner();
    state.layer = null; state.detail = null; state.add = null;
    $layers.innerHTML = '';
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
      return { plat, ref: g[0], title: g[1], year: g[2] || null, front: null, back: null, media: null, full: null, region: g[7] || 'WW', tdb: g[0].slice(2) };
    }
    return { plat, ref: g[0], title: g[1], year: g[2] || null, front: imgUrl(g[3]), back: imgUrl(g[4]), media: imgUrl(g[5]), full: null };
  }

  // ---------- Imágenes de GameTDB (se buscan al añadir) ----------
  const TDB_SYS = { ds: 'ds', '3ds': '3ds', switch: 'switch', switch2: 'switch2' };
  const K_FRONT = [['coverHQ', 'jpg'], ['coverM', 'png'], ['cover', 'png'], ['coverM', 'jpg'], ['cover', 'jpg']];
  const K_THUMB = [['cover', 'png'], ['coverM', 'png'], ['cover', 'jpg'], ['coverHQ', 'jpg']];
  const K_FULL = [['coverfullHQ', 'jpg'], ['coverfull', 'jpg'], ['coverfullM', 'jpg'], ['coverfull', 'png']];
  const K_MEDIA = [['cart', 'png'], ['cartHQ', 'png'], ['disc', 'png']];
  function tdbLangs(reg) {
    return ({ ES: ['ES', 'EN', 'US'], EU: ['EN', 'ES', 'US'], WW: ['ES', 'EN', 'US'], US: ['US', 'EN'], JP: ['JA', 'EN'], DE: ['DE', 'EN'], FR: ['FR', 'EN'], IT: ['IT', 'EN'], NL: ['NL', 'EN'], AU: ['AU', 'EN'], KR: ['KO', 'EN'] })[reg] || ['EN', 'ES', 'US'];
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
    const [front, full, media] = await Promise.all([firstOk(tdbCands(r, K_FRONT)), firstOk(tdbCands(r, K_FULL), true), firstOk(tdbCands(r, K_MEDIA))]);
    return Object.assign({}, r, { front, full, media });
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
        front: m.poster_path ? 'https://image.tmdb.org/t/p/w500' + m.poster_path : null, back: null, media: null
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
  function countFace(collId) { return state.items.filter((i) => PLAT[i.plat].coll === collId && i.face).length; }

  function addItem(r, kind, plat) {
    if (state.items.find((m) => m.kind === kind && m.plat === plat && String(m.ref) === String(r.ref))) return false;
    const it = {
      uid: uid(), kind, plat, ref: r.ref, title: r.title, year: r.year || null,
      front: r.front || null, back: r.back || null, media: r.media || null, full: r.full || null,
      face: countFace(PLAT[plat].coll) < 4, added: Date.now()
    };
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
    const isMovie = coll.id === 'mov';
    const canScan = 'BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    return `<div class="layer sheet" role="dialog" aria-modal="true" aria-label="Añadir a la colección">
      <div class="layer-head"><h2>Añadir a la estantería</h2><button class="icon-btn" data-act="closeLayer" aria-label="Cerrar">${I.close}</button></div>
      <div class="body">
        <div class="pills" role="group" aria-label="Colección">${COLLS.map((c) => `<button data-act="addColl" data-id="${c.id}" aria-pressed="${c.id === coll.id}">${esc(c.name)}</button>`).join('')}</div>
        ${isMovie ? `<div class="pills" role="group" aria-label="Formato">${['dvd', 'bluray'].map((f) => `<button data-act="addFmt" data-id="${f}" aria-pressed="${a.fmt === f}">${PLAT[f].short}</button>`).join('')}</div>` : ''}
        <label class="search">${I.search}<span class="sr">Título</span>
          <input id="q" type="search" autocomplete="off" enterkeyhint="search" placeholder="${isMovie ? 'Título de la película…' : 'Título del juego…'}" value="${esc(a.q || '')}">
          ${canScan ? `<button class="icon-btn" data-act="scan" aria-label="Escanear código de barras" style="width:40px;height:40px">${I.scan}</button>` : ''}</label>
        <div class="hint" id="hint">${isMovie ? 'Títulos y carteles en español. Tú eliges el formato: DVD o Blu-ray.' : `Busca entre todos los juegos de ${esc(coll.plats.map((p) => PLAT[p].short).join(' y '))}.`}</div>
        <div class="results scroll" id="results"></div>
      </div></div>`;
  }

  function resultsHTML(list, isMovie, plat) {
    lastResults = list;
    return list.map((r, i) => {
      const p = isMovie ? plat : r.plat;
      const owned = state.items.find((m) => m.plat === p && String(m.ref) === String(r.ref) && m.kind === (isMovie ? 'movie' : 'game'));
      const thumb = r.front ? `<img src="${esc(r.front)}" alt="" loading="lazy">`
        : r.tdb ? `<img alt="" data-cands="${esc(tdbCands(r, K_THUMB, tdbLangs(r.region).slice(0, 2)).join('|'))}">` : '<div class="noimg"></div>';
      if (r.wiki) {
        const coll = collOf(state.add.coll);
        return `<div class="result">${thumb}<div class="info"><b>${esc(r.title)}</b><small>${esc(r.desc)}</small></div>
          <span class="wiki-picks">${coll.plats.map((pl) => `<button class="btn btn-ghost" data-act="pickWiki" data-i="${i}" data-plat="${pl}">${esc(PLAT[pl].short)}</button>`).join('')}</span></div>`;
      }
      const meta = isMovie ? esc(r.desc) : `${esc(PLAT[r.plat].short)}${r.year ? ' · ' + esc(r.year) : ''}${r.region ? ' · ' + esc(REGION_NAME[r.region] || r.region) : ''}`;
      return `<button class="result ${owned ? 'owned' : ''}" data-act="pick" data-i="${i}">${thumb}
        <div class="info"><b>${esc(r.title)}</b><small>${meta}</small></div>
        <span class="state">${owned ? 'En tu estantería' : 'Añadir'}</span></button>`;
    }).join('');
  }

  let searchSeq = 0;
  async function runSearch() {
    const a = state.add; if (!a) return;
    const q = (document.getElementById('q') || {}).value || '';
    a.q = q;
    const coll = collOf(a.coll); const isMovie = coll.id === 'mov';
    const $res = document.getElementById('results'); const $hint = document.getElementById('hint');
    const seq = ++searchSeq;
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
    state.add = { coll: collId || state.tab, fmt: (state.add && state.add.fmt) || 'bluray', q: '' };
    state.layer = 'add';
    $layers.innerHTML = addHTML();
    const q = document.getElementById('q');
    q.addEventListener('input', runSearchSoon);
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); q.blur(); } });
    setTimeout(() => q.focus(), 60);
    const coll = collOf(state.add.coll);
    if (coll.id !== 'mov') coll.plats.forEach((p) => loadPlat(p).catch(() => {}));
  }

  function rerenderAdd() {
    const q = state.add.q;
    $layers.innerHTML = addHTML();
    const $q = document.getElementById('q');
    $q.addEventListener('input', runSearchSoon);
    $q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runSearch(); $q.blur(); } });
    if (q) runSearch();
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
  const SHORT = [['~', WIKI], ['^', 'https://art.gametdb.com/'], ['*', 'https://image.tmdb.org/t/p/'], ['!', 'https://images.launchbox-app.com/']];
  const shortU = (u) => { if (!u) return ''; const m = SHORT.find(([, p]) => u.startsWith(p)); return m ? m[0] + u.slice(m[1].length) : u; };
  const longU = (u) => { if (typeof u !== 'string' || !u) return null; const m = SHORT.find(([k]) => u[0] === k); return safeImg(m ? m[1] + u.slice(1) : u); };
  async function encodeShare() {
    const payload = {
      v: 1, n: state.name || 'Un amigo',
      i: state.items.map((it) => {
        if (it.kind === 'game' && typeof it.ref === 'number') return [0, it.plat, it.ref, it.face ? 1 : 0];
        if (it.kind === 'game') return [2, it.plat, String(it.ref), it.title, it.year || 0, shortU(it.front), shortU(it.full), shortU(it.media), it.face ? 1 : 0, shortU(it.back)];
        return [1, it.plat, it.title, it.year || 0, shortU(it.front), it.face ? 1 : 0, String(it.ref)];
      })
    };
    const raw = new TextEncoder().encode(JSON.stringify(payload));
    if ('CompressionStream' in window) return 'd' + b64url(await streamBytes(raw, window.CompressionStream));
    return 'j' + b64url(raw);
  }
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
        if (g) items.push(Object.assign({ uid: uid(), kind: 'game', face: !!x[3] }, g));
      } else if (x[0] === 1 && PLAT[x[1]].coll === 'mov') {
        items.push({ uid: uid(), kind: 'movie', plat: x[1], ref: String(x[6] || x[2]).slice(0, 200), title: String(x[2]).slice(0, 200), year: Number(x[3]) || null, front: longU(x[4]), back: null, media: null, full: null, face: !!x[5] });
      } else if (x[0] === 2 && PLAT[x[1]].coll !== 'mov') {
        items.push({ uid: uid(), kind: 'game', plat: x[1], ref: String(x[2]).slice(0, 200), title: String(x[3]).slice(0, 200), year: Number(x[4]) || null, front: longU(x[5]), full: longU(x[6]), media: longU(x[7]), back: longU(x[9]), face: !!x[8] });
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
      const id = norm(name) || uid();
      const prev = state.friends.findIndex((f) => f.id === id);
      const entry = { id, name, items, received: Date.now() };
      if (prev >= 0) state.friends[prev] = entry; else state.friends.push(entry);
      saveFriends();
      state.mode = 'friends'; state.friendId = id;
      const firstColl = COLLS.find((c) => items.some((i) => PLAT[i.plat].coll === c.id));
      if (firstColl) state.tab = firstColl.id;
      render();
      toast(`Estantería de ${name} guardada en Amigos`);
    } catch (e) {
      toast('Ese enlace de estantería no funciona. Pide que te lo manden otra vez.');
    }
  }

  // ---------- Ajustes ----------
  function settingsHTML() {
    return `<div class="layer sheet" role="dialog" aria-modal="true" aria-label="Ajustes">
      <div class="layer-head"><h2>Ajustes</h2><button class="icon-btn" data-act="closeLayer" aria-label="Cerrar">${I.close}</button></div>
      <div class="body scroll">
        ${installPrompt ? `<div class="card"><h3>Instalar en el móvil</h3><p>Ludoteca se abrirá como una app más, a pantalla completa y sin conexión.</p><button class="btn btn-amber" data-act="install">${I.download}Instalar Ludoteca</button></div>` : ''}
        <div class="card"><h3>Copia de seguridad</h3><p>Tu colección vive en este móvil. Guarda una copia por si cambias de teléfono o borras los datos del navegador.</p>
          <div class="row"><button class="btn btn-ghost" data-act="export">${I.download}Guardar</button><button class="btn btn-ghost" data-act="import">Recuperar</button></div>
          <input type="file" id="importFile" accept="application/json,.json" class="hidden"></div>
        <div class="card"><h3>De dónde salen las imágenes</h3><p>Nintendo: <a href="https://www.gametdb.com" target="_blank" rel="noopener">GameTDB</a>. PlayStation y resto de juegos: <a href="https://gamesdb.launchbox-app.com" target="_blank" rel="noopener">LaunchBox Games Database</a>${CATALOG_DATE ? ` (catálogo del ${esc(CATALOG_DATE)})` : ''}. Juegos que faltan: Wikipedia.</p>
          <p>Películas y series: <a href="https://www.themoviedb.org" target="_blank" rel="noopener">TMDB</a>. Este producto usa la API de TMDB pero no está respaldado ni certificado por TMDB.</p>
          <p>Ludoteca es un proyecto personal sin ánimo de lucro.</p></div>
      </div></div>`;
  }
  function exportBackup() {
    const blob = new Blob([JSON.stringify({ app: 'ludoteca', v: 1, name: state.name, items: state.items, friends: state.friends }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `ludoteca-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const j = JSON.parse(reader.result);
        if (j.app !== 'ludoteca' || !Array.isArray(j.items)) throw new Error('x');
        const clean = j.items.filter((i) => i && PLAT[i.plat] && i.title).map((i) => ({
          uid: String(i.uid || uid()), kind: i.kind === 'movie' ? 'movie' : 'game', plat: i.plat, ref: i.ref, title: String(i.title),
          year: i.year || null, front: safeImg(i.front), back: safeImg(i.back), media: safeImg(i.media), full: safeImg(i.full), face: !!i.face, added: i.added || Date.now()
        }));
        state.items = clean; saveItems();
        if (Array.isArray(j.friends)) {
          state.friends = j.friends.filter((f) => f && f.id && Array.isArray(f.items)).map((f) => ({
            id: String(f.id), name: String(f.name || 'Amigo').slice(0, 40), received: Number(f.received) || Date.now(),
            items: f.items.filter((i) => i && PLAT[i.plat] && i.title).map((i) => ({
              uid: String(i.uid || uid()), kind: i.kind === 'movie' ? 'movie' : 'game', plat: i.plat, ref: i.ref, title: String(i.title),
              year: i.year || null, front: safeImg(i.front), back: safeImg(i.back), media: safeImg(i.media), full: safeImg(i.full), face: !!i.face
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
  let removeArmed = false;
  $app.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const act = el.dataset.act; const id = el.dataset.id;
    switch (act) {
      case 'tab': state.tab = id; LS.set('ludo.tab', id); render(); $content.scrollTop = 0; break;
      case 'mode': state.mode = id; render(); break;
      case 'open': {
        const it = shownItems().find((x) => x.uid === el.dataset.uid);
        if (it) { removeArmed = false; openDetail(it, !!state.friendId); }
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
        if (!removeArmed) { removeArmed = true; el.classList.add('armed'); el.innerHTML = 'Toca otra vez para quitar'; el.style.flex = '1'; break; }
        const u = state.detail.item.uid;
        state.items = state.items.filter((x) => x.uid !== u); saveItems();
        closeLayer(); render(); toast('Quitado de tu estantería');
        break;
      }
      case 'copyToMine': {
        const it = state.detail.item;
        if (addItem(it, it.kind, it.plat)) { toast('Añadido a tu estantería'); rerenderDetail(); }
        break;
      }
      case 'add': openAdd(state.tab); break;
      case 'addColl': state.add.coll = id; state.add.q = (document.getElementById('q') || {}).value || ''; rerenderAdd(); break;
      case 'addFmt': state.add.fmt = id; state.add.q = (document.getElementById('q') || {}).value || ''; rerenderAdd(); break;
      case 'pick': {
        let r = lastResults[Number(el.dataset.i)]; if (!r) break;
        const isMovie = state.add.coll === 'mov';
        const plat = isMovie ? state.add.fmt : r.plat;
        if (state.items.find((m) => m.plat === plat && String(m.ref) === String(r.ref))) { toast('Ya lo tienes en la estantería'); break; }
        if (r.tdb && !r.front && !r.full) {
          el.querySelector('.state').textContent = 'Buscando…';
          r = await resolveTdb(r);
          if (!state.add) break;
        }
        if (addItem(r, isMovie ? 'movie' : 'game', plat)) {
          el.classList.add('owned'); el.querySelector('.state').textContent = 'En tu estantería';
          state.tab = PLAT[plat].coll; LS.set('ludo.tab', state.tab); state.mode = 'mine'; state.friendId = null; render();
          toast(`${r.title} ya está en tu estantería`);
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
        if (addItem(r, 'game', plat)) {
          el.closest('.result').classList.add('owned');
          state.tab = PLAT[plat].coll; LS.set('ludo.tab', state.tab); state.mode = 'mine'; state.friendId = null; render();
          toast(`${r.title} ya está en tu estantería`);
        } else toast('Ya lo tienes en la estantería');
        break;
      }
      case 'scan': openScanner(); break;
      case 'scanCancel': stopScanner(); openAddWith(state.add || { coll: state.tab, fmt: 'bluray', q: '' }); break;
      case 'share': state.layer = 'share'; $layers.innerHTML = shareHTML(); break;
      case 'doShare': doShare(); break;
      case 'settings': state.layer = 'settings'; $layers.innerHTML = settingsHTML(); break;
      case 'export': exportBackup(); break;
      case 'import': { const f = document.getElementById('importFile'); f.onchange = () => f.files[0] && importBackup(f.files[0]); f.click(); break; }
      case 'install': if (installPrompt) { installPrompt.prompt(); installPrompt = null; closeLayer(); } break;
      case 'openFriend': state.friendId = id; { const f = currentFriend(); const c = f && COLLS.find((cc) => f.items.some((i) => PLAT[i.plat].coll === cc.id)); if (c) state.tab = c.id; } render(); $content.scrollTop = 0; break;
      case 'closeFriend': state.friendId = null; state.mode = 'friends'; render(); break;
      case 'removeFriend': {
        if (el.dataset.armed) { state.friends = state.friends.filter((f) => f.id !== id); saveFriends(); render(); }
        else { el.dataset.armed = '1'; el.style.background = '#b3261e'; el.setAttribute('aria-label', 'Toca otra vez para quitar'); toast('Toca otra vez la papelera para quitarlo'); }
        break;
      }
      default: break;
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.layer) closeLayer(); });
  window.addEventListener('resize', debounce(() => { render(); if (state.layer === 'detail') rerenderDetail(); }, 200));
  window.addEventListener('hashchange', receiveFromHash);
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; });

  // ---------- Arranque ----------
  async function boot() {
    try {
      const r = await fetch('data/index.json', { cache: 'no-cache' });
      if (r.ok) { const j = await r.json(); if (j.imgBase) IMG_BASE = new URL(j.imgBase, location.href).href; CATALOG_DATE = j.updated || ''; }
    } catch (e) { /* sin conexión: usamos lo guardado */ }
    render();
    receiveFromHash();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  }
  boot();
})();
