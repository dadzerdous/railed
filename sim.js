(function (g) {
  'use strict';
  const TF = g.TF;
  const { WATER, PLAIN, FOREST, HILL, DIRS } = TF;

  TF.YEAR_SECS = 60;
  // Tuning. Growth is per year; income is dollars per resident per month.
  const START_FUNDS = 500, GROW = 0.46, GROW_OFF = 0.03, IMMIG = 0.6, INCOME = 0.10;
  TF.INCOME = INCOME;
  TF.IND = {
    depot: { label: 'Rail depot', cap: 1.2, tr: 1.35 },
    mill: { label: 'Mill', cap: 1.15, tr: 1.15 },
    mine: { label: 'Coal mine', cap: 1.1, tr: 1.2 },
    lumber: { label: 'Lumber camp', cap: 1.0, tr: 1.05 },
    farm: { label: 'Farm country', cap: 0.9, tr: 0.9 },
  };
  const TILE = { plain: 11, forest: 22, hill: 32, water: 80, rail: 4.5, lot: 16 };

  const MSG = {
    depot: ['HOLD NO. 4 FOR CONNECTION AT {to}.', 'SEND TWO FREIGHT CARS TO {to} ON MORNING TRAIN.', 'TRACK CLEAR TO {to}. ENGINE ON TIME.'],
    mill: ['FLOUR STEADY. SHIPPING FIFTY BARRELS TO {to}.', 'WATER LOW AT THE RACE. GRIST DELAYED FOR {to}.', 'SAWN BOARDS READY FOR {to}. SEND WAGONS.'],
    mine: ['COAL OUT OF THE DRIFT. FORTY TONS FOR {to}.', 'NEED TIMBERS FROM {to} BY SATURDAY.', 'PRICE OF COAL UP A DIME AT {to}?'],
    lumber: ['LOGS ON THE BANK. RAFT TO {to} AT HIGH WATER.', 'SEND AXES AND A CREW FROM {to}.', 'SHINGLES FOR {to} LOADED TODAY.'],
    farm: ['WHEAT PRICE FIRM. SELL AT {to}.', 'BUTTER AND EGGS FOR {to} MARKET DAY.', 'NEED A SMITH AT {to} FOR THE HARVEST.'],
  };

  function lotsFor(s) { return Math.min(s.v.lots.length, Math.floor(s.pop / 4.5)); }

  TF.newState = function (seed, withTerrain) {
    const world = TF.generate(seed), N = world.W * world.H;
    const st = {
      seed, world, terrain: withTerrain ? TF.buildTerrain(world) : null,
      t: 1850.0, speed: 1, paused: true, funds: START_FUNDS,
      net: new Uint8Array(N), wmask: new Uint8Array(N), linked: new Uint8Array(N), wireTiles: 0, lotSet: new Set(),
      vs: world.villages.map(v => ({ v, pop: v.pop0, conn: false, stage: TF.stageOf(v.pop0), shown: 0, born: [], connT: null })),
      items: [], dirty: true, sel: -1, mode: 'survey', plan: null, hover: null, wireStart: null,
      pulses: [], pulseTimer: 2, flash: {}, rate: { rev: 0, cost: 0, net: 0 }, events: [], now: 0,
    };
    for (const s of st.vs) { s.shown = lotsFor(s); for (let k = 0; k < s.shown; k++) s.born[k] = -99; for (const l of s.v.lots) st.lotSet.add(l.y * world.W + l.x); }
    TF.connectVillage(st, st.vs[world.hq], true);
    st.linked = TF.linkedSet(st);
    return st;
  };

  TF.connectVillage = function (st, s, silent) {
    s.conn = true; s.connT = st.t;
    st.net[s.v.y * st.world.W + s.v.x] = 1;
    st.dirty = true;
    if (!silent) st.events.push({ type: 'connected', s });
  };

  TF.tileCost = function (st, x, y, fx, fy) {
    const w = st.world, i = y * w.W + x;
    let c = w.type[i] === WATER ? TILE.water : w.type[i] === FOREST ? TILE.forest : w.type[i] === HILL ? TILE.hill : TILE.plain;
    if (w.rail[i] && w.type[i] !== WATER) c = TILE.rail;
    if (st.lotSet.has(i)) c += TILE.lot;
    if (fx !== undefined) c += Math.abs(w.h[i] - w.h[fy * w.W + fx]) * 4.5;
    return c;
  };

  TF.villageNear = function (st, x, y, r) {
    for (let k = 0; k < st.vs.length; k++) { const v = st.vs[k].v; if (Math.max(Math.abs(v.x - x), Math.abs(v.y - y)) <= r) return k; }
    return -1;
  };

  // Tiles near a village snap to its centre.
  TF.snap = function (st, x, y) {
    const vi = TF.villageNear(st, x, y, 2);
    return vi >= 0 ? { x: st.vs[vi].v.x, y: st.vs[vi].v.y, village: vi } : { x, y, village: -1 };
  };

  function addEdges(mask, W, path) {
    for (let k = 1; k < path.length; k++) {
      const [x, y] = path[k], [px, py] = path[k - 1];
      const d = DIRS.findIndex(([dx, dy]) => px + dx === x && py + dy === y);
      mask[py * W + px] |= 1 << d; mask[y * W + x] |= 1 << ((d + 2) % 4);
    }
  }

  // Tiles reachable from the home office along wire, optionally including a path not yet built.
  TF.linkedSet = function (st, extraPath) {
    const w = st.world, W = w.W, N = W * w.H;
    let mask = st.wmask;
    if (extraPath) { mask = st.wmask.slice(); addEdges(mask, W, extraPath); }
    const hq = st.vs[w.hq].v, s0 = hq.y * W + hq.x;
    const seen = new Uint8Array(N); seen[s0] = 1;
    const q = [s0];
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi], m = mask[i], x = i % W, y = (i - x) / W;
      for (let d = 0; d < 4; d++) if (m & (1 << d)) {
        const ni = (y + DIRS[d][1]) * W + (x + DIRS[d][0]);
        if (!seen[ni]) { seen[ni] = 1; q.push(ni); }
      }
    }
    return seen;
  };

  TF.updateLinks = function (st) {
    const W = st.world.W;
    st.linked = TF.linkedSet(st);
    for (const s of st.vs) if (!s.conn && st.linked[s.v.y * W + s.v.x]) TF.connectVillage(st, s);
  };

  // A run of wire from (sx,sy) to (tx,ty). Either end may be any land tile.
  TF.makePlan = function (st, sx, sy, tx, ty) {
    const w = st.world, W = w.W;
    const a = TF.snap(st, sx, sy), b = TF.snap(st, tx, ty);
    const base = { start: [a.x, a.y], target: [b.x, b.y], from: a.village, village: b.village, valid: false, path: null, cost: 0, opens: [], tiles: 0, water: 0, joined: false };
    if (w.type[a.y * W + a.x] === WATER || w.type[b.y * W + b.x] === WATER) return Object.assign(base, { reason: "A pole can't stand in the river." });
    if (a.x === b.x && a.y === b.y) return Object.assign(base, { reason: 'Pick a different end point.' });
    const path = TF.route({
      W, H: w.H, sources: [[a.x, a.y]], turn: 1.2,
      isTarget: (x, y) => x === b.x && y === b.y,
      cost: (x, y, fx, fy) => st.net[y * W + x] ? 0.4 : TF.tileCost(st, x, y, fx, fy),
    });
    if (!path) return Object.assign(base, { reason: 'No route to that spot.' });
    let cost = 0, tiles = 0, water = 0;
    for (let k = 1; k < path.length; k++) {
      const [x, y] = path[k], [fx, fy] = path[k - 1], i = y * W + x;
      if (!st.net[i]) { cost += TF.tileCost(st, x, y, fx, fy); tiles++; if (w.type[i] === WATER) water++; }
    }
    if (!st.net[a.y * W + a.x]) { cost += TF.tileCost(st, a.x, a.y); tiles++; }
    // already wired along the whole way?
    let newEdges = false;
    for (let k = 1; k < path.length; k++) {
      const [x, y] = path[k], [px, py] = path[k - 1];
      const d = DIRS.findIndex(([dx, dy]) => px + dx === x && py + dy === y);
      if (!(st.wmask[py * W + px] & (1 << d))) { newEdges = true; break; }
    }
    if (!newEdges) return Object.assign(base, { reason: 'That run is already wired.' });
    const after = TF.linkedSet(st, path);
    const opens = [];
    st.vs.forEach((s, i) => { if (!s.conn && after[s.v.y * W + s.v.x]) opens.push(i); });
    return Object.assign(base, { valid: true, path, cost: Math.round(cost), opens, tiles, water, joined: !!after[a.y * W + a.x] });
  };

  TF.buildPlan = function (st, p) {
    if (!p || !p.valid) return false;
    if (st.funds < p.cost) return false;
    const W = st.world.W;
    st.funds -= p.cost;
    for (const [x, y] of p.path) { const i = y * W + x; if (!st.net[i]) { st.net[i] = 1; st.wireTiles++; } }
    addEdges(st.wmask, W, p.path);
    st.dirty = true;
    TF.updateLinks(st);
    st.events.push({ type: 'built', plan: p });
    if (p.opens.length) TF.launchPulse(st, null, st.vs[p.opens[p.opens.length - 1]]);
    return true;
  };

  // path along built wire between two connected villages
  TF.wirePath = function (st, a, b) {
    const w = st.world, W = w.W;
    const start = a.v.y * W + a.v.x, goal = b.v.y * W + b.v.x;
    const prev = new Int32Array(w.W * w.H).fill(-2);
    prev[start] = -1; const q = [start];
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi]; if (i === goal) break;
      const m = st.wmask[i], x = i % W, y = (i - x) / W;
      for (let d = 0; d < 4; d++) if (m & (1 << d)) {
        const ni = (y + DIRS[d][1]) * W + (x + DIRS[d][0]);
        if (prev[ni] === -2) { prev[ni] = i; q.push(ni); }
      }
    }
    if (prev[goal] === -2) return null;
    const path = []; for (let c = goal; c >= 0; c = prev[c]) path.push([c % W, Math.floor(c / W)]);
    return path.reverse();
  };

  TF.launchPulse = function (st, a, b) {
    const conn = st.vs.filter(s => s.conn);
    if (conn.length < 2) return;
    if (!a) a = b && b !== conn[0] ? st.vs[st.world.hq] : conn[Math.floor(Math.random() * conn.length)];
    if (!b || b === a) { do { b = conn[Math.floor(Math.random() * conn.length)]; } while (b === a); }
    const path = TF.wirePath(st, a, b);
    if (path && path.length > 1) st.pulses.push({ path, pos: 0, speed: 7 + Math.random() * 3, from: a, to: b });
  };

  TF.dispatchText = function (p) {
    const list = MSG[p.from.v.industry] || MSG.farm;
    const t = list[Math.floor(Math.random() * list.length)].replace('{to}', p.to.v.name.toUpperCase());
    return { head: p.from.v.name.toUpperCase() + ' TO ' + p.to.v.name.toUpperCase(), text: t };
  };

  // Monthly telegraph income a village brings in.
  TF.villageIncome = function (st, s) {
    if (!s.conn) return 0;
    const n = st.vs.filter(x => x.conn).length;
    return s.pop * INCOME * TF.IND[s.v.industry].tr * (1 + 0.09 * Math.min(n - 1, 10));
  };

  TF.step = function (st, dtReal) {
    st.now += dtReal;
    const n = st.vs.filter(s => s.conn).length;
    let rev = 0;
    const dy = st.paused ? 0 : dtReal * st.speed / TF.YEAR_SECS;
    for (const s of st.vs) {
      const ind = TF.IND[s.v.industry];
      const cap = (s.conn ? 140 + 32 * Math.min(n - 1, 9) : 40) * ind.cap * (s.v.onRail ? 1.2 : 1);
      if (dy > 0) s.pop += (s.conn ? GROW : GROW_OFF) * s.pop * Math.max(0, 1 - s.pop / cap) * dy + (s.conn ? IMMIG * dy : 0);
      rev += TF.villageIncome(st, s) * 12;
      const ns = TF.stageOf(s.pop);
      if (ns !== s.stage) { if (ns > s.stage && s.conn) st.events.push({ type: 'stage', s, stage: ns }); s.stage = ns; st.dirty = true; }
      const want = lotsFor(s);
      if (want > s.shown) { for (let k = s.shown; k < want; k++) s.born[k] = st.now; s.shown = want; st.dirty = true; }
    }
    st.rate = { rev, cost: 0, net: rev };
    st.funds += st.rate.net * dy;
    st.t += dy;
    // pulses
    if (!st.paused) {
      st.pulseTimer -= dtReal * st.speed;
      if (st.pulseTimer <= 0 && n >= 2) { TF.launchPulse(st); st.pulseTimer = 3.2 / (1 + 0.3 * n) + Math.random() * 1.2; }
    }
    for (const p of st.pulses) p.pos += dtReal * (st.paused ? 0 : st.speed) * p.speed * 0.5;
    for (let i = st.pulses.length - 1; i >= 0; i--) {
      const p = st.pulses[i];
      if (p.pos >= p.path.length - 1) { st.flash[p.to.v.id] = st.now; st.events.push({ type: 'dispatch', p }); st.pulses.splice(i, 1); }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
