(function (g) {
  'use strict';
  const TF = g.TF;
  const { TW, TH, LV, DIRS, poly, rgb } = TF;

  const WALLS = [[226, 214, 186], [206, 190, 156], [158, 76, 54], [150, 140, 126], [196, 150, 84], [232, 226, 210]];
  const ROOFS = [[88, 94, 104], [124, 90, 62], [140, 70, 52], [76, 82, 90]];
  const up = (p, d) => [p[0], p[1] - d];
  const mid = (p, q, d) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2 - d];

  function house(ctx, cx, cy, s, wh, rh, wall, roof, axis) {
    const a = TW / 2 * s, b = TH / 2 * s;
    const T = [cx, cy - b], R = [cx + a, cy], B = [cx, cy + b], L = [cx - a, cy];
    poly(ctx, [L, B, up(B, wh), up(L, wh)], rgb(wall, 1.0));
    poly(ctx, [B, R, up(R, wh), up(B, wh)], rgb(wall, 0.76));
    if (axis === 0) {
      const r0 = mid(L, T, wh + rh), r1 = mid(R, B, wh + rh);
      poly(ctx, [r0, r1, up(R, wh), up(T, wh)], rgb(roof, 0.8));
      poly(ctx, [r0, r1, up(B, wh), up(L, wh)], rgb(roof, 1.1));
      poly(ctx, [up(R, wh), up(B, wh), r1], rgb(wall, 0.76));
    } else {
      const r0 = mid(T, R, wh + rh), r1 = mid(B, L, wh + rh);
      poly(ctx, [r0, r1, up(L, wh), up(T, wh)], rgb(roof, 1.1));
      poly(ctx, [r0, r1, up(B, wh), up(R, wh)], rgb(roof, 0.8));
      poly(ctx, [up(L, wh), up(B, wh), r1], rgb(wall, 1.0));
    }
  }

  function pole(ctx, cx, cy) {
    ctx.fillStyle='rgb(55,50,68)'; ctx.strokeStyle='rgb(148,112,205)'; ctx.lineWidth=1.4;
    ctx.beginPath(); ctx.moveTo(cx-4,cy); ctx.lineTo(cx-2,cy-18); ctx.lineTo(cx+3,cy-20); ctx.lineTo(cx+5,cy); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle='rgb(201,168,255)'; ctx.lineWidth=1.2; ctx.beginPath(); ctx.moveTo(cx,cy-16); ctx.lineTo(cx+2,cy-11); ctx.lineTo(cx-1,cy-7); ctx.stroke();
  }

  function wire(ctx, x1, y1, x2, y2) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + 2.6;
    ctx.beginPath(); ctx.moveTo(x1, y1 - 13); ctx.quadraticCurveTo(mx, my - 13, x2, y2 - 13);
    ctx.strokeStyle = 'rgba(168,112,255,0.22)'; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = 'rgba(205,176,255,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
  }

  function office(ctx, cx, cy, big, t) {
    const s = big ? 0.86 : 0.7;
    house(ctx, cx, cy, s, big ? 16 : 13, 7, [168, 82, 58], [74, 80, 90], 0);
    // chimney
    ctx.fillStyle = 'rgb(110,60,44)'; ctx.fillRect(cx + 6, cy - 30, 4, 9);
    // mast with pennant
    const top = cy - (big ? 54 : 46);
    ctx.strokeStyle = 'rgb(52,40,30)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(cx - 8, cy - 14); ctx.lineTo(cx - 8, top); ctx.stroke();
    const wv = Math.sin(t * 4) * 1.6;
    poly(ctx, [[cx - 8, top], [cx + 4, top + 3 + wv], [cx - 8, top + 7]], 'rgb(200,64,44)');
    // lit window
    ctx.fillStyle = 'rgb(255,214,120)'; ctx.fillRect(cx + 4, cy - 9, 3, 4); ctx.fillRect(cx - 5, cy - 6, 3, 4);
  }

  function stake(ctx, cx, cy, t) {
    ctx.strokeStyle = 'rgb(70,50,34)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - 22); ctx.stroke();
    const wv = Math.sin(t * 3) * 1.2;
    poly(ctx, [[cx, cy - 22], [cx + 9, cy - 19 + wv], [cx, cy - 16]], 'rgb(214,170,70)');
    poly(ctx, [[cx - 9, cy + 1], [cx, cy - 7], [cx + 9, cy + 1], [cx, cy + 5]], 'rgba(60,44,30,0.55)');
  }

  TF.stageOf = function (pop) { return pop < 30 ? 0 : pop < 90 ? 1 : pop < 240 ? 2 : 3; };
  TF.STAGES = ['Hamlet', 'Village', 'Town', 'Hold'];

  TF.rebuildItems = function (st) {
    const w = st.world, items = [];
    for (let i = 0; i < st.net.length; i++) if (st.net[i]) items.push({ k: 1, x: i % w.W, y: Math.floor(i / w.W) });
    for (const n of (st.nodes || [])) items.push({ k: 3, n, x:n.x, y:n.y });
    for (const s of st.vs) {
      for (let li = 0; li < s.shown; li++) items.push({ k: 0, s, li, x: s.v.lots[li].x, y: s.v.lots[li].y });
      items.push({ k: 2, s, x: s.v.x, y: s.v.y });
    }
    for (const it of items) it.d = it.x + it.y;
    items.sort((p, q) => p.d - q.d || p.k - q.k || p.x - q.x);
    st.items = items; st.dirty = false;
  };

  const ease = (u) => { u = Math.max(0, Math.min(1, u)); return 1 - Math.pow(1 - u, 3) * (1 + 1.4 * (1 - u)); };

  TF.drawScene = function (ctx, st, now) {
    if (st.dirty) TF.rebuildItems(st);
    const w = st.world, W = w.W;
    for (const it of st.items) {
      const i = it.y * W + it.x, lv = w.h[i];
      const [cx, cy] = TF.proj(it.x, it.y, lv);
      if (it.k === 0) {
        const s = it.s, lot = s.v.lots[it.li];
        const u = ease((now - (s.born[it.li] || -99)) / 0.7);
        if (u <= 0) continue;
        const stage = s.stage;
        poly(ctx, [[cx - 22 * u, cy], [cx, cy - 11 * u], [cx + 22 * u, cy], [cx, cy + 11 * u]], 'rgba(196,168,118,0.78)');
        const r = lot.r;
        const wall = WALLS[Math.floor(r * 97) % WALLS.length], roof = ROOFS[Math.floor(r * 53) % ROOFS.length];
        const dc = Math.abs(it.x - s.v.x) + Math.abs(it.y - s.v.y);
        const tall = dc < 4 ? 1 + stage * 0.5 : 1 + stage * 0.2;
        house(ctx, cx, cy, (0.46 + r * 0.16) * (0.4 + 0.6 * u), (7 + r * 5) * tall * u, (4 + r * 3) * u, wall, roof, r > 0.5 ? 1 : 0);
      } else if (it.k === 1) {
        pole(ctx, cx, cy);
        const m = st.wmask[i];
        for (const d of [2, 3]) if (m & (1 << d)) {
          const nx = it.x + DIRS[d][0], ny = it.y + DIRS[d][1];
          const [ox, oy] = TF.proj(nx, ny, w.h[ny * W + nx]);
          wire(ctx, cx, cy, ox, oy);
        }
      } else if (it.k === 3) {
        const n=it.n, def=TF.NODE[n.kind];
        const glow=n.connected?0.9:0.45;
        ctx.save(); ctx.translate(cx,cy-7);
        ctx.fillStyle=n.kind==='timber'?'rgba(70,130,80,'+glow+')':n.kind==='silver'?'rgba(190,200,210,'+glow+')':'rgba(150,90,230,'+glow+')';
        ctx.strokeStyle=n.connected?'rgb(226,205,255)':'rgba(235,230,220,.7)'; ctx.lineWidth=n.connected?2:1;
        ctx.beginPath(); ctx.arc(0,0,n.kind==='rune'?7:6,0,6.2832); ctx.fill(); ctx.stroke();
        ctx.fillStyle='rgb(30,25,35)'; ctx.font='700 9px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(def.icon,0,.5); ctx.restore();
      } else {
        const s = it.s;
        if (s.conn) office(ctx, cx, cy, s.v.isHQ || s.stage >= 2, now); else stake(ctx, cx, cy, now);
      }
    }
    // signal pulses
    for (const p of st.pulses) {
      const f = Math.min(p.pos, p.path.length - 1.001), k = Math.floor(f), u = f - k;
      const A = p.path[k], B = p.path[k + 1];
      const pa = TF.proj(A[0], A[1], w.h[A[1] * W + A[0]]), pb = TF.proj(B[0], B[1], w.h[B[1] * W + B[0]]);
      const x = pa[0] + (pb[0] - pa[0]) * u, y = pa[1] + (pb[1] - pa[1]) * u - 13;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, 9);
      gr.addColorStop(0, 'rgba(255,236,160,0.95)'); gr.addColorStop(1, 'rgba(255,200,90,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.2832); ctx.fill();
    }
    // selection ring
    if (st.sel >= 0) {
      const v = st.vs[st.sel].v, [cx, cy] = TF.proj(v.x, v.y, w.h[v.y * W + v.x]);
      ctx.save(); ctx.setLineDash([7, 6]); ctx.lineDashOffset = -now * 12;
      ctx.strokeStyle = 'rgb(240,196,110)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx, cy, TW * 2.6, TH * 2.6, 0, 0, 6.2832); ctx.stroke(); ctx.restore();
    }
    // hover tile and planned route
    if (st.mode === 'wire') {
      if (st.hover) {
        const [cx, cy] = TF.proj(st.hover.x, st.hover.y, w.h[st.hover.y * W + st.hover.x]);
        ctx.strokeStyle = 'rgba(255,240,200,0.9)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx - TW / 2, cy); ctx.lineTo(cx, cy - TH / 2); ctx.lineTo(cx + TW / 2, cy); ctx.lineTo(cx, cy + TH / 2); ctx.closePath(); ctx.stroke();
      }
      if (st.wireStart) {
        const [sx, sy] = TF.proj(st.wireStart.x, st.wireStart.y, w.h[st.wireStart.y * W + st.wireStart.x]);
        const pulse = 1 + Math.sin(now * 5) * 0.12;
        ctx.save();
        ctx.strokeStyle = 'rgb(246,206,120)'; ctx.lineWidth = 2;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.ellipse(sx, sy, 24 * pulse, 12 * pulse, 0, 0, 6.2832); ctx.stroke();
        ctx.fillStyle = 'rgba(246,206,120,0.3)'; ctx.fill();
        ctx.strokeStyle = 'rgb(40,28,18)'; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - 44); ctx.stroke();
        poly(ctx, [[sx, sy - 44], [sx + 16, sy - 38], [sx, sy - 32]], 'rgb(246,206,120)');
        ctx.restore();
      }
      const p = st.plan;
      if (p && p.path) {
        const ok = p.valid && TF.canAfford(st,p);
        ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.beginPath();
        p.path.forEach(([x, y], k) => { const [cx, cy] = TF.proj(x, y, w.h[y * W + x]); if (k) ctx.lineTo(cx, cy - 2); else ctx.moveTo(cx, cy - 2); });
        ctx.strokeStyle = 'rgba(20,16,12,0.55)'; ctx.lineWidth = 7; ctx.stroke();
        ctx.setLineDash([9, 6]); ctx.lineDashOffset = -now * 18;
        ctx.strokeStyle = ok ? 'rgb(190,135,255)' : 'rgb(222,110,76)'; ctx.lineWidth = 3.4; ctx.stroke();
        ctx.restore();
        const e = p.path[p.path.length - 1], [ex, ey] = TF.proj(e[0], e[1], w.h[e[1] * W + e[0]]);
        ctx.fillStyle = ok ? 'rgb(210,175,255)' : 'rgb(222,110,76)';
        ctx.beginPath(); ctx.arc(ex, ey - 2, 5, 0, 6.2832); ctx.fill();
      }
    }
  };

  // screen-space labels, drawn with an identity transform
  TF.drawLabels = function (ctx, st, cam, vw, vh, now) {
    ctx.save();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    for (const s of st.vs) {
      const v = s.v, [wx, wy] = TF.proj(v.x, v.y, st.world.h[v.y * st.world.W + v.x]);
      const sx = (wx - cam.x) * cam.z + vw / 2, sy = (wy - cam.y) * cam.z + vh / 2 - (58 + s.stage * 7) * cam.z;
      if (sx < -140 || sx > vw + 140 || sy < -40 || sy > vh + 40) continue;
      const small = cam.z < 0.55;
      const name = v.name, pop = String(Math.round(s.pop));
      ctx.font = '600 ' + (small ? 11 : 13) + 'px "Barlow Semi Condensed", system-ui, sans-serif';
      const tw = ctx.measureText(name).width, pw = ctx.measureText(pop).width;
      const padX = 8, dot = 12, bw = padX + dot + tw + 8 + pw + padX, bh = small ? 20 : 24;
      const x0 = sx - bw / 2, y0 = sy - bh / 2;
      const hot = st.flash[s.v.id] && now - st.flash[s.v.id] < 1.2;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x0, y0, bw, bh, 4); else ctx.rect(x0, y0, bw, bh);
      ctx.fillStyle = 'rgba(18,22,26,0.86)'; ctx.fill();
      ctx.strokeStyle = hot ? 'rgb(255,226,150)' : (s.conn ? 'rgba(211,160,74,0.8)' : 'rgba(150,160,168,0.55)'); ctx.lineWidth = hot ? 2 : 1; ctx.stroke();
      ctx.beginPath(); ctx.arc(x0 + padX + 3, sy, 3.4, 0, 6.2832);
      if (s.conn) { ctx.fillStyle = 'rgb(240,196,110)'; ctx.fill(); } else { ctx.strokeStyle = 'rgb(170,176,180)'; ctx.lineWidth = 1.3; ctx.stroke(); }
      ctx.fillStyle = 'rgb(236,227,205)'; ctx.fillText(name, x0 + padX + dot, sy + 0.5);
      ctx.fillStyle = s.conn ? 'rgb(240,196,110)' : 'rgb(170,176,180)'; ctx.fillText(pop, x0 + padX + dot + tw + 8, sy + 0.5);
    }
    ctx.restore();
  };
})(typeof window !== 'undefined' ? window : globalThis);
               
