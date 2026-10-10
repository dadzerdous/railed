(function (g) {
  'use strict';
  const TF = g.TF;
  const { WATER, PLAIN, FOREST, HILL, DIRS } = TF;

  const NAMES = ['Ashford Run', 'Brannock Ford', 'Cedar Hollow', 'Dunmore Mills', 'Elk Crossing',
    'Fallow Creek', "Harlan's Landing", 'Ironwood', 'Kettle Run', 'Laurel Gap', 'Millstone',
    "Nolan's Forge", 'Pike Bend', 'Quarry Hill', 'Rowan Springs', 'Slate Hollow'];

  TF.generate = function (seed) {
    const W = TF.W, H = TF.H, N = W * H;
    const rand = TF.mulberry32(TF.hashSeed(seed));
    const nz = TF.makeNoise(rand);
    const idx = (x, y) => y * W + x;
    const inb = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

    // ---- elevation ----
    const e = new Float32Array(N);
    let mn = 1e9, mx = -1e9;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = nz.fbm(x / 22 + 3.7, y / 22 + 9.1, 4) * 0.78 + nz.fbm(x / 8 + 21, y / 8 + 4, 2) * 0.22;
      e[idx(x, y)] = v; if (v < mn) mn = v; if (v > mx) mx = v;
    }
    for (let i = 0; i < N; i++) e[i] = (e[i] - mn) / (mx - mn);

    // ---- rivers ----
    const river = new Uint8Array(N);
    function carve(id, sx, sy, tx, ty, stopOnOther, widenFrom) {
      let x = sx, y = sy, lastDir = 0;
      const seen = new Uint8Array(N);
      for (let step = 0; step < 700; step++) {
        const i = idx(x, y);
        seen[i] = 1;
        if (!river[i]) river[i] = id;
        if (widenFrom !== undefined && step >= widenFrom) {
          const wx = lastDir % 2 === 0 ? x : x + 1, wy = lastDir % 2 === 0 ? y + 1 : y;
          if (inb(wx, wy) && !river[idx(wx, wy)]) river[idx(wx, wy)] = id;
        }
        if (step > 4 && (x === 0 || y === 0 || x === W - 1 || y === H - 1)) break;
        let best = -1, bs = 1e9;
        for (let k = 0; k < 4; k++) {
          const nx = x + DIRS[k][0], ny = y + DIRS[k][1];
          if (!inb(nx, ny) || seen[idx(nx, ny)]) continue;
          const sc = e[idx(nx, ny)] * 3 + Math.hypot(nx - tx, ny - ty) * 0.22 + rand() * 0.35;
          if (sc < bs) { bs = sc; best = k; }
        }
        if (best < 0) break;
        lastDir = best; x += DIRS[best][0]; y += DIRS[best][1];
        if (stopOnOther) { const r = river[idx(x, y)]; if (r && r !== id) break; }
      }
    }
    {
      let sx = 0, sy = Math.floor(10 + rand() * 20), tx = W - 1, ty = Math.floor(34 + rand() * 20);
      if (rand() < 0.5) { [sx, sy] = [sy, sx]; [tx, ty] = [ty, tx]; }
      carve(1, sx, sy, tx, ty, false, 30);
    }
    const nTrib = rand() < 0.65 ? 2 : 1;
    for (let t = 0; t < nTrib; t++) {
      let bx = -1, by = -1, be = -1;
      for (let k = 0; k < 80; k++) {
        const x = 4 + Math.floor(rand() * (W - 8)), y = 4 + Math.floor(rand() * (H - 8));
        if (river[idx(x, y)]) continue;
        let near = 99;
        for (let i = 0; i < N; i++) if (river[i]) { const d = Math.abs((i % W) - x) + Math.abs(Math.floor(i / W) - y); if (d < near) near = d; }
        if (near < 10) continue;
        if (e[idx(x, y)] > be) { be = e[idx(x, y)]; bx = x; by = y; }
      }
      if (bx < 0) continue;
      let tx = 0, ty = 0, nd = 1e9;
      for (let i = 0; i < N; i++) if (river[i]) { const d = Math.hypot((i % W) - bx, Math.floor(i / W) - by); if (d < nd) { nd = d; tx = i % W; ty = Math.floor(i / W); } }
      carve(2 + t, bx, by, tx, ty, true);
    }

    // distance to water (manhattan, capped)
    const wd = new Uint8Array(N).fill(9);
    const q = [];
    for (let i = 0; i < N; i++) if (river[i]) { wd[i] = 0; q.push(i); }
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi], x = i % W, y = (i - x) / W;
      if (wd[i] >= 6) continue;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (inb(nx, ny) && wd[idx(nx, ny)] > wd[i] + 1) { wd[idx(nx, ny)] = wd[i] + 1; q.push(idx(nx, ny)); }
      }
    }

    // ---- heights and terrain types ----
    const h = new Int8Array(N), type = new Uint8Array(N);
    const sorted = Array.from(e).sort((a, b) => a - b);
    const hillCut = sorted[Math.floor(N * 0.84)];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (river[i]) { h[i] = 0; type[i] = WATER; continue; }
      let lv = 1 + Math.round(Math.pow(e[i], 1.2) * 5.2);
      if (wd[i] === 1) lv = Math.min(lv, 2); else if (wd[i] === 2) lv = Math.min(lv, 3);
      h[i] = lv;
      const m = nz.fbm(x / 9 + 40, y / 9 + 90, 3);
      type[i] = (e[i] >= hillCut && lv >= 3) ? HILL : (m > 0.55 ? FOREST : PLAIN);
    }
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = idx(x, y);
        if (type[i] === WATER) continue;
        let mnL = 99;
        for (const [dx, dy] of DIRS) { const nx = x + dx, ny = y + dy; if (inb(nx, ny) && type[idx(nx, ny)] !== WATER) mnL = Math.min(mnL, h[idx(nx, ny)]); }
        if (mnL < 99 && h[i] > mnL + 2) h[i] = mnL + 2;
      }
    }

    // ---- villages ----
    const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    const plainCount = (cx, cy, r) => { let c = 0; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = cx + dx, y = cy + dy; if (inb(x, y) && type[idx(x, y)] === PLAIN) c++; } return c; };
    const nearWater = (cx, cy, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = cx + dx, y = cy + dy; if (inb(x, y) && type[idx(x, y)] === WATER) return true; } return false; };
    const flat = (cx, cy) => { const c = h[idx(cx, cy)]; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (Math.abs(h[idx(cx + dx, cy + dy)] - c) > 1) return false; return true; };

    let chosen = [];
    for (const minPlain of [46, 38, 30, 24]) {
      const cands = [];
      for (let y = 8; y <= 55; y++) for (let x = 8; x <= 55; x++) {
        if (type[idx(x, y)] !== PLAIN || nearWater(x, y, 1) || !flat(x, y)) continue;
        const pc = plainCount(x, y, 5);
        if (pc < minPlain) continue;
        cands.push({ x, y, s: pc + (nearWater(x, y, 4) ? 10 : 0) + rand() * 16 });
      }
      cands.sort((a, b) => b.s - a.s);
      for (let minD = 13; minD >= 7; minD--) {
        chosen = [];
        for (const c of cands) {
          if (chosen.every(o => cheb(o, c) >= minD)) chosen.push(c);
          if (chosen.length === 10) break;
        }
        if (chosen.length >= 10) break;
      }
      if (chosen.length >= 10) break;
    }

    const names = NAMES.slice();
    for (let i = names.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [names[i], names[j]] = [names[j], names[i]]; }
    const villages = chosen.map((c, i) => ({ id: i, name: names[i], x: c.x, y: c.y, onRail: false, isHQ: false, industry: 'farm', lots: [], pop0: 8 + Math.floor(rand() * 14) }));
    let hq = 0, bd = 1e9;
    villages.forEach((v, i) => { const d = Math.hypot(v.x - 32, v.y - 32); if (d < bd) { bd = d; hq = i; } });
    villages[hq].isHQ = true; villages[hq].pop0 = 85;

    // ---- railroad ----
    const rail = new Uint8Array(N), railMask = new Uint8Array(N);
    const railCost = (x, y, fx, fy) => {
      const i = idx(x, y);
      let c = type[i] === WATER ? 11 : type[i] === FOREST ? 2.3 : type[i] === HILL ? 4 : 1;
      c += Math.abs(h[i] - h[idx(fx, fy)]) * 1.4;
      if (rail[i]) c = 0.3;
      return c;
    };
    const onLine = [hq], rest = villages.map((v, i) => i).filter(i => i !== hq);
    while (onLine.length < 6 && rest.length) {
      let bi = -1, bj = -1, bdist = 1e9;
      for (const a of onLine) for (const b of rest) { const d = Math.hypot(villages[a].x - villages[b].x, villages[a].y - villages[b].y); if (d < bdist) { bdist = d; bi = a; bj = b; } }
      const A = villages[bi], B = villages[bj];
      const path = TF.route({ W, H, sources: [[A.x, A.y]], isTarget: (x, y) => x === B.x && y === B.y, cost: railCost, turn: 0.9 });
      if (path) {
        for (let k = 0; k < path.length; k++) {
          const [x, y] = path[k]; rail[idx(x, y)] = 1;
          if (k > 0) {
            const [px, py] = path[k - 1];
            const d = DIRS.findIndex(([dx, dy]) => px + dx === x && py + dy === y);
            railMask[idx(px, py)] |= 1 << d; railMask[idx(x, y)] |= 1 << ((d + 2) % 4);
          }
        }
        villages[bj].onRail = true; villages[bi].onRail = true;
      }
      onLine.push(bj); rest.splice(rest.indexOf(bj), 1);
    }

    // ---- lots and industry ----
    const taken = new Set();
    for (const v of villages) {
      const cand = [];
      for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
        const x = v.x + dx, y = v.y + dy;
        if (!inb(x, y) || (dx === 0 && dy === 0)) continue;
        const i = idx(x, y);
        if (type[i] !== PLAIN || rail[i] || taken.has(i)) continue;
        cand.push({ x, y, d: dx * dx + dy * dy + rand() * 3.2 });
      }
      cand.sort((a, b) => a.d - b.d);
      v.lots = cand.slice(0, 70).map(c => { taken.add(idx(c.x, c.y)); return { x: c.x, y: c.y, r: rand() }; });
      let forest = 0, hill = 0;
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) { const x = v.x + dx, y = v.y + dy; if (!inb(x, y)) continue; if (type[idx(x, y)] === FOREST) forest++; if (type[idx(x, y)] === HILL) hill++; }
      v.industry = v.onRail ? 'depot' : nearWater(v.x, v.y, 4) ? 'mill' : hill >= 6 ? 'mine' : forest >= 20 ? 'lumber' : 'farm';
    }

    let maxH = 0; for (let i = 0; i < N; i++) if (h[i] > maxH) maxH = h[i];
    return { seed, W, H, e, h, type, river, rail, railMask, villages, hq, maxH };
  };
})(typeof window !== 'undefined' ? window : globalThis);
