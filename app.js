(() => {
  const P = window.PORTFOLIO;
  const $ = (s, el = document) => el.querySelector(s);
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null) el.append(k.nodeType ? k : document.createTextNode(k));
    return el;
  };

  // Clip label colour for each bin
  const LABEL = {
    'DTC Ads': '--c-dtc', 'Social Media Trends': '--c-trends', 'Educational Talks': '--c-talks', 'Travel': '--c-travel',
    'Unboxing': '--c-unbox', 'Events': '--c-events', 'Food': '--c-food', 'Short Films': '--c-films',
    'Music & Brand Films': '--c-brand', 'LED Loops': '--c-led', 'Graphic Design': '--c-gfx'
  };
  const labelVar = cat => `--label: var(${LABEL[cat] || '--ink'})`;
  const driveThumb = (id, w = 480) => `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;
  const byId = Object.fromEntries(P.items.filter(i => i.id).map(i => [i.id, i]));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Image with a graceful fallback: if Drive can't give a thumbnail, show the title on the label colour
  function thumbImg(src, title) {
    const img = h('img', { src, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => img.replaceWith(h('span', { class: 'ph', 'aria-hidden': 'true' })));
    return img;
  }

  /* ---------------- Player ---------------- */
  const player = $('#player'), stage = $('#playerStage');
  let list = [], idx = 0, lastFocus = null;

  function embedFor(item) {
    switch (item.type) {
      case 'drive': return h('iframe', { src: `https://drive.google.com/file/d/${item.id}/preview`, allow: 'autoplay; fullscreen', allowfullscreen: true, title: item.title });
      case 'youtube': return h('iframe', { src: `https://www.youtube-nocookie.com/embed/${item.id}?autoplay=1&rel=0`, allow: 'autoplay; encrypted-media; fullscreen; picture-in-picture', allowfullscreen: true, title: item.title });
      case 'facebook': return h('iframe', { src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(item.url)}&show_text=false&autoplay=true&width=1280`, allow: 'autoplay; encrypted-media; fullscreen; picture-in-picture', allowfullscreen: true, title: item.title });
      case 'image': return h('img', { src: driveThumb(item.id, 2000), alt: item.title, referrerpolicy: 'no-referrer' });
      case 'shot': return h('img', { src: item.src, alt: `${item.title}, ${item.views} views` });
    }
  }
  function show() {
    const item = list[idx];
    const vertical = item.group === 'reels';
    stage.className = 'player-stage' + (vertical ? ' vertical' : item.type === 'image' ? ' portrait' : '');
    stage.replaceChildren(embedFor(item));
    player.style.cssText = labelVar(item.cat);
    $('#playerTitle').textContent = item.title + (item.year ? ` (${item.year})` : '');
    $('#playerCat').textContent = [item.cat, item.sub].filter(Boolean).join(' / ');
    $('#playerCount').textContent = `${idx + 1} of ${list.length}`;
    $('#prevBtn').disabled = $('#nextBtn').disabled = list.length < 2;
  }
  function openPlayer(items, i) {
    list = items; idx = i; lastFocus = document.activeElement;
    player.hidden = false; document.body.style.overflow = 'hidden';
    show(); $('.player-head [data-close]').focus();
    heroPause(true);
  }
  function closePlayer() {
    player.hidden = true; stage.replaceChildren(); document.body.style.overflow = '';
    lastFocus?.focus(); heroPause(false);
  }
  const step = d => { idx = (idx + d + list.length) % list.length; show(); };
  player.addEventListener('click', e => { if (e.target.closest('[data-close]')) closePlayer(); });
  $('#prevBtn').onclick = () => step(-1);
  $('#nextBtn').onclick = () => step(1);
  document.addEventListener('keydown', e => {
    if (player.hidden) return;
    if (e.key === 'Escape') closePlayer();
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'Tab') { // keep focus inside the player
      const f = [...player.querySelectorAll('button, iframe')].filter(x => !x.disabled);
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
    }
  });
  let touchX = null;
  player.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  player.addEventListener('touchend', e => {
    if (touchX == null) return;
    const dx = e.changedTouches[0].clientX - touchX; touchX = null;
    if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1);
  });

  /* ---------------- Hero: monitor + timeline ---------------- */
  const heroItems = P.hero.map(c => ({ ...byId[c.id], heroType: c.type })).filter(x => x.id);
  const track = $('#track'), playhead = $('#playhead'), frame = $('#monitorFrame'), bg = $('#monitorBg');
  const CLIP_SECONDS = 4, FPS = 25;
  heroItems.forEach((it, i) => {
    const thumbs = h('span', { class: 'clip-thumbs', 'aria-hidden': 'true' },
      Array.from({ length: 5 }, () => h('img', { src: driveThumb(it.id, 200), alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: e => e.target.remove() })));
    track.append(h('button', {
      class: 'clip', role: 'listitem', style: `${labelVar(it.cat)}; animation-delay: ${0.9 + i * 0.07}s`,
      'aria-label': `${it.heroType}: ${it.title}`, onclick: () => openPlayer(heroItems, i)
    }, thumbs, h('span', { class: 'clip-name' }, it.heroType)));
  });

  let active = -1;
  function setActive(i) {
    if (i === active) return; active = i;
    const it = heroItems[i];
    [...track.children].forEach((c, k) => c.classList.toggle('active', k === i));
    frame.classList.add('swap');
    const next = new Image(); next.referrerPolicy = 'no-referrer';
    next.onload = next.onerror = () => {
      if (next.naturalWidth) { frame.src = next.src; frame.classList.remove('swap'); bg.style.backgroundImage = `url("${next.src}")`; }
    };
    next.src = driveThumb(it.id, 720);
    $('#monitorTitle').textContent = `${it.heroType} · ${it.title}`;
  }
  $('#monitorPlay').onclick = () => openPlayer(heroItems, Math.max(active, 0));

  const total = heroItems.length * CLIP_SECONDS * 1000;
  let t0 = null, elapsed = 0, paused = false, raf = 0;
  const pad = n => String(n).padStart(2, '0');
  function tick(now) {
    if (t0 == null) t0 = now - elapsed;
    elapsed = (now - t0) % total;
    const p = elapsed / total;
    playhead.style.transform = `translateX(${p * track.clientWidth}px)`;
    setActive(Math.min(heroItems.length - 1, Math.floor(p * heroItems.length)));
    const secs = elapsed / 1000;
    $('#timecode').textContent = `00:00:${pad(Math.floor(secs))}:${pad(Math.floor((secs % 1) * FPS))}`;
    raf = requestAnimationFrame(tick);
  }
  function heroPause(on) {
    paused = on; cancelAnimationFrame(raf); t0 = null;
    if (!on && !reduceMotion && !document.hidden) raf = requestAnimationFrame(tick);
  }
  setActive(0);
  if (reduceMotion) {
    // Static: no sweep. Hovering a clip shows it on the monitor instead.
    [...track.children].forEach((c, i) => c.addEventListener('mouseenter', () => setActive(i)));
  } else {
    setTimeout(() => !paused && heroPause(false), 1300); // start after the gate opens
    // Hovering a clip parks the playhead on it
    [...track.children].forEach((c, i) => {
      c.addEventListener('mouseenter', () => { heroPause(true); elapsed = (i + 0.5) * CLIP_SECONDS * 1000; playhead.style.transform = `translateX(${(i + .5) / heroItems.length * track.clientWidth}px)`; setActive(i); });
      c.addEventListener('mouseleave', () => player.hidden && heroPause(false));
    });
  }
  document.addEventListener('visibilitychange', () => player.hidden && heroPause(document.hidden));

  /* ---------------- Reels: bins + grid ---------------- */
  const reels = P.items.filter(i => i.group === 'reels');
  const cats = [...new Set(reels.map(r => r.cat))];
  const MOST = 'Most viewed';
  const viewNum = v => parseFloat(v) * (/k/i.test(v) ? 1e3 : /m/i.test(v) ? 1e6 : 1);
  const mostViewed = reels.filter(r => r.views).sort((a, b) => viewNum(b.views) - viewNum(a.views));
  let curCat = 'All', curSub = null, expanded = false;
  const PAGE = 18;

  function card(item, i, items) {
    return h('li', { class: 'card', style: `${labelVar(item.cat)}; animation-delay: ${Math.min(i, 12) * 25}ms` },
      h('button', { onclick: () => openPlayer(items, i), 'aria-label': `Play ${item.title}` },
        h('div', { class: 'thumb' },
          thumbImg(item.type === 'shot' ? item.src : driveThumb(item.id), item.title),
          item.views ? h('span', { class: 'badge' }, `${item.views} views`) : null),
        h('p', { class: 'card-title' }, item.title),
        h('p', { class: 'card-sub' }, [curCat === 'All' || curCat === MOST ? item.cat : null, item.sub].filter(Boolean).join(' / ') || null)));
  }
  function renderGrid() {
    let items = curCat === 'All' ? reels : curCat === MOST ? mostViewed : reels.filter(r => r.cat === curCat);
    if (curSub) items = items.filter(r => r.sub === curSub);
    const shown = expanded ? items : items.slice(0, PAGE);
    $('#grid').replaceChildren(...shown.map((it, i) => card(it, i, items)));
    const more = $('#showMore');
    more.hidden = items.length <= PAGE || expanded;
    more.textContent = `Show all ${items.length} reels`;
    // sub-bins for categories that have them
    const subs = [...new Set(reels.filter(r => r.cat === curCat && r.sub).map(r => r.sub))];
    $('#subbins').replaceChildren(...(subs.length ? ['All', ...subs] : []).map(s =>
      h('button', { class: 'subbin', style: labelVar(curCat), 'aria-pressed': String((curSub || 'All') === s),
        onclick: () => { curSub = s === 'All' ? null : s; expanded = false; renderGrid(); } }, s)));
  }
  function renderBins() {
    $('#bins').replaceChildren(...['All', ...(mostViewed.length ? [MOST] : []), ...cats].map(c => {
      const plain = c === 'All' || c === MOST;
      const n = c === 'All' ? reels.length : c === MOST ? mostViewed.length : reels.filter(r => r.cat === c).length;
      return h('button', { class: 'bin' + (c === MOST ? ' bin-views' : ''), role: 'tab', 'aria-selected': String(c === curCat), style: plain ? null : labelVar(c),
        onclick: () => { curCat = c; curSub = null; expanded = false; renderBins(); renderGrid(); } },
        c === MOST ? h('span', { class: 'eye', 'aria-hidden': 'true' }) : plain ? null : h('span', { class: 'sw', 'aria-hidden': 'true' }),
        c, h('span', { class: 'n' }, n));
    }));
  }
  $('#showMore').onclick = () => { expanded = true; renderGrid(); };
  // Hero stat: combined views of the reels that have counts
  if (mostViewed.length) {
    const total = mostViewed.reduce((s, r) => s + viewNum(r.views), 0);
    const fmt = n => n >= 1e6 ? (Math.floor(n / 1e5) / 10) + 'M' : Math.round(n / 1e3) + 'K';
    const stat = $('#heroStat');
    stat.replaceChildren(h('strong', {}, fmt(total) + '+ views'), ` across my top ${mostViewed.length} reels`);
    stat.hidden = false;
    stat.onclick = () => { curCat = MOST; curSub = null; expanded = false; renderBins(); renderGrid(); };
  }
  renderBins(); renderGrid();

  /* ---------------- Films ---------------- */
  const films = P.items.filter(i => i.group === 'films');
  $('#filmList').replaceChildren(...films.map((f, i) => {
    const img = h('img', { src: `https://i.ytimg.com/vi/${f.id}/maxresdefault.jpg`, alt: '', loading: 'lazy' });
    img.addEventListener('load', () => { if (img.naturalWidth < 200) img.src = `https://i.ytimg.com/vi/${f.id}/hqdefault.jpg`; }, { once: true });
    return h('li', { class: 'film' },
      h('button', { onclick: () => openPlayer(films, i), 'aria-label': `Play ${f.title}` },
        h('div', { class: 'frame' }, img),
        h('div', { class: 'film-meta' }, h('p', { class: 'film-title' }, f.title), h('span', { class: 'film-year' }, f.year))));
  }));

  /* ---------------- Series ---------------- */
  $('#seriesChannel').href = P.series.channel;
  $('#seriesStart').onclick = () => {
    $('#seriesPlayer').replaceChildren(h('iframe', {
      src: `https://www.youtube-nocookie.com/embed/videoseries?list=${P.series.playlist}&autoplay=1&rel=0`,
      allow: 'autoplay; encrypted-media; fullscreen; picture-in-picture', allowfullscreen: true, title: P.series.title
    }));
  };

  /* ---------------- Brand, LED, graphics ---------------- */
  const brand = P.items.filter(i => i.cat === 'Music & Brand Films');
  $('#brandList').replaceChildren(...brand.map((b, i) => h('li', { style: labelVar(b.cat) },
    h('button', { onclick: () => openPlayer(brand, i), 'aria-label': `Play ${b.title}` },
      h('div', { class: 'thumb' }, h('div', { class: 'titlecard' },
        h('strong', {}, b.title.split(' — ')[0]),
        h('span', {}, [b.title.split(' — ')[1], b.year].filter(Boolean).join(', ') || 'Director and DP')))))));
  const wide = (cat, el) => {
    const items = P.items.filter(i => i.cat === cat);
    $(el).replaceChildren(...items.map((it, i) => h('li', { style: labelVar(cat) },
      h('button', { onclick: () => openPlayer(items, i), 'aria-label': `Open ${it.title}` },
        h('div', { class: 'thumb' }, thumbImg(driveThumb(it.id, 640), it.title)),
        h('p', { class: 'card-title' }, it.title)))));
  };
  wide('LED Loops', '#ledList');

  /* ---------------- Design gallery ---------------- */
  const gfx = P.items.filter(i => i.group === 'graphics');
  const gSubs = [...new Set(gfx.map(g => g.sub).filter(Boolean))];
  let gSub = null, gExpanded = false;
  const GPAGE = 12;
  function renderGallery() {
    const items = gSub ? gfx.filter(g => g.sub === gSub) : gfx;
    const shown = gExpanded ? items : items.slice(0, GPAGE);
    $('#gallery').replaceChildren(...shown.map((it, i) => h('li', { class: 'card', style: `${labelVar(it.cat)}; animation-delay: ${Math.min(i, 12) * 25}ms` },
      h('button', { onclick: () => openPlayer(items, i), 'aria-label': `Open ${it.title}` },
        h('div', { class: 'thumb tile' }, thumbImg(driveThumb(it.id, 600), it.title))))));
    $('#gfxMore').hidden = items.length <= GPAGE || gExpanded;
    $('#gfxMore').textContent = `Show all ${items.length} designs`;
    $('#gfxBins').replaceChildren(...['All', ...gSubs].map(s => {
      const n = s === 'All' ? gfx.length : gfx.filter(g => g.sub === s).length;
      return h('button', { class: 'bin', role: 'tab', 'aria-selected': String((gSub || 'All') === s),
        onclick: () => { gSub = s === 'All' ? null : s; gExpanded = false; renderGallery(); } }, s, h('span', { class: 'n' }, n));
    }));
  }
  $('#gfxMore').onclick = () => { gExpanded = true; renderGallery(); };
  renderGallery();

  /* ---------------- Footer + header ---------------- */
  const resumeUrl = P.resume ? `https://drive.google.com/file/d/${P.resume}/view` : null;
  if (resumeUrl) $('#resumeLink').href = resumeUrl; else $('#resumeLink').remove();
  $('#footLinks').replaceChildren(...[
    P.contact?.email ? h('a', { href: `mailto:${P.contact.email}` }, P.contact.email) : null,
    P.contact?.phone ? h('a', { href: `tel:${P.contact.phone.replace(/\s/g, '')}` }, P.contact.phone) : null,
    resumeUrl ? h('a', { href: resumeUrl, target: '_blank', rel: 'noopener' }, 'View résumé') : null,
    h('a', { href: P.series.channel, target: '_blank', rel: 'noopener' }, 'YouTube')
  ].filter(Boolean));
  // Links like /#design: jump to the section once the content above it has been built
  if (location.hash.length > 1) {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) requestAnimationFrame(() => target.scrollIntoView({ behavior: 'instant', block: 'start' }));
  }
  const top = $('.top');
  addEventListener('scroll', () => top.classList.toggle('scrolled', scrollY > 10), { passive: true });
})();
