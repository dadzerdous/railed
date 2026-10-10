(function () {
  'use strict';
  const TF = window.TF;
  const $ = (id) => document.getElementById(id);
  const canvas = $('c'), ctx = canvas.getContext('2d');
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US');
  const START_SEED = 'allegheny';

  let st = null, dpr = 1, vw = 0, vh = 0, last = 0;
  const cam = { x: 0, y: 0, z: 0.85 };
  let hoverKey = '', introOpen = true, wasPaused = true, lastCard = 0;

  // ---------- setup ----------
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = canvas.clientWidth; vh = canvas.clientHeight;
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
  }
  function clampCam() {
    cam.x = Math.max(0, Math.min(TF.PXW, cam.x));
    cam.y = Math.max(60, Math.min(TF.PXH - 40, cam.y));
  }
  function centerOn(s) {
    const w = st.world, [x, y] = TF.proj(s.v.x, s.v.y, w.h[s.v.y * w.W + s.v.x]);
    cam.x = x; cam.y = y - 10; clampCam();
  }
  function newGame(seed) {
    st = TF.newState(seed, true);
    cam.z = vw < 700 ? 0.62 : 0.9;
    centerOn(st.vs[st.world.hq]);
    setMode('survey'); closeCard(); setPlan(null);
    $('seed').value = seed;
  }

  // ---------- picking ----------
  function toWorld(sx, sy) { return [(sx - vw / 2) / cam.z + cam.x, (sy - vh / 2) / cam.z + cam.y]; }
  function pickTile(wx, wy) {
    const w = st.world, W = w.W, H = w.H;
    const u = (wx - H * TF.TW / 2) * 2 / TF.TW, v = (wy - 64 + 2 * TF.LV) * 2 / TF.TH;
    const gx = Math.round((u + v) / 2), gy = Math.round((v - u) / 2);
    let best = null;
    for (let y = gy - 5; y <= gy + 5; y++) for (let x = gx - 5; x <= gx + 5; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const [cx, cy] = TF.proj(x, y, w.h[y * W + x]);
      if (Math.abs(wx - cx) / (TF.TW / 2) + Math.abs(wy - cy) / (TF.TH / 2) <= 1) {
        if (!best || x + y > best.x + best.y) best = { x, y };
      }
    }
    return best;
  }

  // ---------- modes, plan, card ----------
  function setMode(m) {
    st.mode = m;
    $('mSurvey').classList.toggle('on', m === 'survey');
    $('mWire').classList.toggle('on', m === 'wire');
    canvas.classList.toggle('wire', m === 'wire');
    st.wireStart = null; st.plan = null; st.hover = null; hoverKey = '';
    if (m === 'wire') closeCard();
    refreshPlan();
  }
  function setStart(s) { st.wireStart = s; st.plan = null; hoverKey = ''; refreshPlan(); }
  function setPlan(p) { st.plan = p; refreshPlan(); }
  const put = (id, text, cls) => {
    const el = $(id);
    if (el.textContent !== text) el.textContent = text;
    if (cls !== undefined && el.className !== cls) el.className = cls;
  };
  const placeName = (i) => i >= 0 ? st.vs[i].v.name : 'open ground';
  function refreshPlan() {
    const p = st.plan, el = $('plan');
    if (st.mode !== 'wire') { el.hidden = true; return; }
    el.hidden = false;
    $('pclear').hidden = !st.wireStart;
    if (!p) {
      $('pgo').hidden = true;
      if (!st.wireStart) {
        put('pt', 'Where does the line start?');
        put('pd', 'Tap an office, a pole or open ground. Your home office is a good place to begin.', 'd');
      } else {
        const sv = TF.snap(st, st.wireStart.x, st.wireStart.y).village;
        put('pt', 'Starting at ' + placeName(sv));
        put('pd', 'Now tap where it should end. The route is planned for you.', 'd');
      }
      return;
    }
    if (!p.valid) {
      put('pt', 'Cannot build that');
      put('pd', p.reason, 'd bad'); $('pgo').hidden = true; return;
    }
    put('pt', placeName(p.from) + ' to ' + placeName(p.village));
    const bits = [p.tiles + (p.tiles === 1 ? ' pole' : ' poles')];
    if (p.water) bits.push(p.water + (p.water > 1 ? ' river crossings' : ' river crossing'));
    if (p.opens.length) bits.push(p.opens.length > 1 ? p.opens.length + ' new offices' : 'opens an office');
    else if (!p.joined) bits.push('not joined to the home office yet');
    put('pd', bits.join(' · '), 'd');
    const go = $('pgo'); go.hidden = false;
    const short = p.cost - st.funds;
    go.disabled = short > 0;
    const label = short > 0 ? 'Need ' + fmt(short) + ' more' : 'Build · ' + fmt(p.cost);
    if (go.textContent !== label) go.textContent = label;
  }
  function selectVillage(i) { st.sel = i; $('card').hidden = false; refreshCard(true); }
  function closeCard() { st.sel = -1; $('card').hidden = true; }
  function refreshCard() {
    if (st.sel < 0) return;
    const s = st.vs[st.sel], v = s.v, ind = TF.IND[v.industry];
    $('cn').textContent = v.name;
    $('cs').textContent = (v.isHQ ? 'Home office · ' : '') + TF.STAGES[s.stage];
    const month = TF.villageIncome(st, s);
    const rows = [
      ['Population', Math.round(s.pop).toLocaleString('en-US')],
      ['Trade', ind.label],
      ['Railroad', v.onRail ? 'Yes' : 'No'],
      ['Telegraph', s.conn ? 'Open since ' + Math.floor(s.connT) : 'No office'],
      ['Income', s.conn ? fmt(month) + ' / month' : '—'],
    ];
    const html = rows.map(r => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join('');
    if ($('cd').innerHTML !== html) $('cd').innerHTML = html;
    $('cgo').hidden = false;
  }

  // ---------- toast and ticker ----------
  let toastT = 0, tickT = 0;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200); }
  function tick(d) { const t = $('ticker'); t.innerHTML = '<i>' + d.head + '</i>&nbsp; ' + d.text; t.classList.add('on'); clearTimeout(tickT); tickT = setTimeout(() => t.classList.remove('on'), 6500); }
  function handleEvents() {
    for (const e of st.events.splice(0)) {
      if (e.type === 'connected') toast(e.s.v.name + ' is on the line. Office open.');
      else if (e.type === 'built') { /* covered by connected toast or HUD */ if (!e.plan.opens.length) toast('Line built · ' + fmt(e.plan.cost)); }
      else if (e.type === 'stage') toast(e.s.v.name + ' has grown into a ' + TF.STAGES[e.stage].toLowerCase() + '.');
      else if (e.type === 'dispatch') tick(TF.dispatchText(e.p));
    }
  }

  // ---------- input ----------
  const ptrs = new Map();
  let pinchD = 0;
  function zoomAt(sx, sy, f) {
    const [wx, wy] = toWorld(sx, sy);
    cam.z = Math.max(0.35, Math.min(1.9, cam.z * f));
    cam.x = wx - (sx - vw / 2) / cam.z; cam.y = wy - (sy - vh / 2) / cam.z; clampCam();
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (introOpen) return;
    canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, type: e.pointerType });
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse' && st && st.mode === 'wire' && !introOpen) hoverAt(e.clientX, e.clientY);
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (!p.moved && Math.hypot(p.x - p.sx, p.y - p.sy) > 6) p.moved = true;
    if (ptrs.size === 1 && p.moved) { cam.x -= dx / cam.z; cam.y -= dy / cam.z; clampCam(); }
    else if (ptrs.size === 2) {
      p.moved = true;
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchD > 0 && d > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinchD);
      pinchD = d;
    }
  });
  const endPtr = (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    ptrs.delete(e.pointerId); pinchD = 0;
    if (e.type === 'pointerup' && !p.moved && ptrs.size === 0) clickAt(e.clientX, e.clientY, p.type);
  };
  canvas.addEventListener('pointerup', endPtr);
  canvas.addEventListener('pointercancel', endPtr);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (!introOpen) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

  function hoverAt(sx, sy) {
    const [wx, wy] = toWorld(sx, sy), t = pickTile(wx, wy);
    st.hover = t;
    const key = t ? t.x + ',' + t.y : '';
    if (key === hoverKey) return;
    hoverKey = key;
    // With no start chosen there is nothing to preview yet; the hovered tile is just highlighted.
    const s = st.wireStart;
    setPlan(t && s ? TF.makePlan(st, s.x, s.y, t.x, t.y) : null);
  }
  function clickAt(sx, sy, type) {
    const [wx, wy] = toWorld(sx, sy), t = pickTile(wx, wy);
    if (st.mode === 'survey') {
      if (!t) { closeCard(); return; }
      const vi = TF.villageNear(st, t.x, t.y, 2);
      if (vi >= 0) selectVillage(vi); else closeCard();
      return;
    }
    if (!t) return;
    const sn = TF.snap(st, t.x, t.y), W = st.world.W;
    st.hover = t;
    // first tap: choose where the line starts
    if (!st.wireStart) {
      if (st.world.type[sn.y * W + sn.x] === 0) { toast("A pole can't stand in the river."); return; }
      setStart({ x: sn.x, y: sn.y });
      return;
    }
    // tapping the start again lets you pick a different one
    if (sn.x === st.wireStart.x && sn.y === st.wireStart.y) { setStart(null); return; }
    const p = TF.makePlan(st, st.wireStart.x, st.wireStart.y, sn.x, sn.y);
    const same = st.plan && st.plan.valid && st.plan.target[0] === p.target[0] && st.plan.target[1] === p.target[1];
    if (type === 'mouse' || same) { setPlan(p); doBuild(); } else setPlan(p);
  }
  function doBuild() {
    const p = st.plan;
    if (!p) return;
    if (!p.valid) { toast(p.reason); return; }
    if (st.funds < p.cost) { toast('Not enough funds. Need ' + fmt(p.cost - st.funds) + ' more.'); return; }
    TF.buildPlan(st, p);
    // keep going: the end of this run becomes the start of the next one
    setStart({ x: p.target[0], y: p.target[1] });
  }

  // ---------- buttons ----------
  $('mSurvey').onclick = () => setMode('survey');
  $('mWire').onclick = () => setMode('wire');
  $('mHome').onclick = () => { setMode('survey'); centerOn(st.vs[st.world.hq]); selectVillage(st.world.hq); };
  $('cardx').onclick = closeCard;
  $('cgo').onclick = () => { const s = st.vs[st.sel], x = s.v.x, y = s.v.y; setMode('wire'); setStart({ x, y }); };
  $('pgo').onclick = doBuild;
  $('pclear').onclick = () => setStart(null);
  canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); if (st && st.mode === 'wire') setStart(null); });
  document.querySelectorAll('.speed button').forEach(b => b.onclick = () => setSpeed(+b.dataset.s));
  function setSpeed(s) { if (introOpen) return; if (s === 0) st.paused = !st.paused; else { st.paused = false; st.speed = s; } }
  function openIntro() { introOpen = true; wasPaused = st.paused; st.paused = true; $('intro').hidden = false; }
  function closeIntro() { introOpen = false; $('intro').hidden = true; st.paused = false; }
  $('mHelp').onclick = () => { if (introOpen) closeIntro(); else openIntro(); };
  $('begin').onclick = closeIntro;
  $('newmap').onclick = () => {
    const raw = $('seed').value.trim();
    const cur = st && st.seed;
    newGame(raw && raw !== cur ? raw : Math.random().toString(36).slice(2, 7));
  };
  $('seed').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') $('newmap').click(); });
  window.addEventListener('keydown', (e) => {
    if (introOpen) return;
    if (e.code === 'Space') { e.preventDefault(); setSpeed(0); }
    else if (e.key === '1') setSpeed(1); else if (e.key === '2') setSpeed(2); else if (e.key === '3') setSpeed(4);
    else if (e.key === 'w' || e.key === 'W') setMode('wire'); else if (e.key === 's' || e.key === 'S') setMode('survey');
    else if (e.key === 'Escape') { if (st.mode === 'wire' && st.wireStart) setStart(null); else { setPlan(null); closeCard(); } }
    else if (e.key === 'Enter' && st.plan) doBuild();
  });
  window.addEventListener('resize', resize);

  // ---------- drawing and HUD ----------
  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const bg = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.7);
    bg.addColorStop(0, '#1b232a'); bg.addColorStop(1, '#0e1215');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const z = cam.z * dpr;
    ctx.setTransform(z, 0, 0, z, (vw / 2 - cam.x * cam.z) * dpr, (vh / 2 - cam.y * cam.z) * dpr);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(st.terrain, 0, 0);
    TF.drawScene(ctx, st, st.now);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    TF.drawLabels(ctx, st, cam, vw, vh, st.now);
  }
  const hudCache = {};
  function setText(id, v, cls) { const el = $(id); if (hudCache[id] !== v) { el.textContent = v; hudCache[id] = v; } if (cls !== undefined && el.className !== cls) el.className = cls; }
  function hud() {
    const yr = Math.floor(st.t), mo = Math.min(11, Math.floor((st.t - yr) * 12));
    const dl = MONTHS[mo] + ' ' + yr;
    if (hudCache.date !== dl) { $('date').firstChild.nodeValue = dl; hudCache.date = dl; }
    setText('funds', fmt(st.funds));
    setText('net', '+' + fmt(st.rate.net / 12));
    setText('conn', st.vs.filter(s => s.conn).length + ' / ' + st.vs.length);
    for (const b of document.querySelectorAll('.speed button')) {
      const s = +b.dataset.s;
      b.classList.toggle('on', s === 0 ? st.paused : (!st.paused && st.speed === s));
    }
    if (st.plan) refreshPlan();
    if (st.sel >= 0 && st.now - lastCard > 0.25) { lastCard = st.now; refreshCard(); }
  }
  function frame(ts) {
    const dt = Math.min(0.1, (ts - last) / 1000); last = ts;
    TF.step(st, dt);
    handleEvents(); draw(); hud();
    requestAnimationFrame(frame);
  }

  resize();
  if (document.fonts && document.fonts.load) { document.fonts.load('600 13px "Barlow Semi Condensed"'); document.fonts.load('26px "Old Standard TT"'); }
  newGame(START_SEED);
  requestAnimationFrame((t) => { last = t; frame(t); });
})();
