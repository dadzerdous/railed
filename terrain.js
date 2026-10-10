(function (g) {
  'use strict';
  const TF = g.TF;
  const { WATER, PLAIN, FOREST, HILL, DIRS } = TF;

  const TW = 48, TH = 24, LV = 6, TOP = 72;
  TF.TW = TW; TF.TH = TH; TF.LV = LV;
  TF.PXW = (TF.W + TF.H) * TW / 2;
  TF.PXH = (TF.W + TF.H) * TH / 2 + TOP + 44;

  // screen-space (world pixel) centre of a tile's top face at level h
  TF.proj = function (x, y, h) {
    return [(x - y) * TW / 2 + TF.H * TW / 2, (x + y) * TH / 2 - h * LV + TOP];
  };

  const rgb = (c, f) => 'rgb(' + Math.min(255, Math.round(c[0] * f)) + ',' + Math.min(255, Math.round(c[1] * f)) + ',' + Math.min(255, Math.round(c[2] * f)) + ')';
  TF.rgb = rgb;
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  function poly(ctx, pts, fill) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = fill; ctx.lineWidth = 1; ctx.stroke();
  }
  TF.poly = poly;

  const C = {
    plain: [150, 176, 88], forest: [104, 144, 78], hillLo: [156, 152, 102], hillHi: [170, 162, 146],
    water: [72, 124, 158], shallow: [102, 156, 182], soil: [128, 98, 66], rock: [118, 108, 94], wsoil: [56, 98, 128],
  };

  function pine(ctx, px, py, s, v) {
    ctx.fillStyle = 'rgb(86,62,42)'; ctx.fillRect(px - 1, py - 3 * s, 2, 3 * s);
    const g1 = [52 + v * 16, 98 + v * 18, 60], g2 = [40 + v * 14, 80 + v * 14, 52];
    for (let k = 0; k < 2; k++) {
      const by = py - (2.5 + k * 5.5) * s, w = (6.2 - k * 1.8) * s, ap = by - 9 * s;
      poly(ctx, [[px, ap], [px - w, by], [px, by + 1.5 * s]], rgb(g1, 1.1));
      poly(ctx, [[px, ap], [px + w, by], [px, by + 1.5 * s]], rgb(g2, 0.95));
    }
  }

  TF.buildTerrain = function (w) {
    const cv = document.createElement('canvas');
    cv.width = TF.PXW; cv.height = TF.PXH;
    const ctx = cv.getContext('2d');
    const W = w.W, H = w.H, h = w.h, type = w.type;
    const hAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? -2 : h[y * W + x];
    const tAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? -1 : type[y * W + x];

    for (let s = 0; s < W + H - 1; s++) {
      for (let x = Math.max(0, s - H + 1); x <= Math.min(W - 1, s); x++) {
        const y = s - x, i = y * W + x, t = type[i], lv = h[i];
        const [cx, cy] = TF.proj(x, y, lv);
        const a = TW / 2, b = TH / 2;
        const T = [cx, cy - b], R = [cx + a, cy], B = [cx, cy + b], L = [cx - a, cy];
        const hv = TF.hash2(x, y, 7);

        // side faces
        const dl = lv - hAt(x, y + 1), dr = lv - hAt(x + 1, y);
        const edgeL = y + 1 >= H, edgeR = x + 1 >= W;
        let side = t === WATER ? C.wsoil : (t === HILL ? C.rock : C.soil);
        if (dl > 0) {
          const sc = (!edgeL && tAt(x, y + 1) === WATER) ? [96, 82, 58] : side;
          poly(ctx, [L, B, [B[0], B[1] + dl * LV], [L[0], L[1] + dl * LV]], rgb(sc, 0.96 - hv * 0.05));
        }
        if (dr > 0) {
          const sc = (!edgeR && tAt(x + 1, y) === WATER) ? [96, 82, 58] : side;
          poly(ctx, [B, R, [R[0], R[1] + dr * LV], [B[0], B[1] + dr * LV]], rgb(sc, 0.78 - hv * 0.05));
        }

        // top face as two facets
        let base, f = 0.93 + hv * 0.12;
        const dxh = hAt(x + 1, y) - hAt(x - 1, y), dyh = hAt(x, y + 1) - hAt(x, y - 1);
        if (t === WATER) {
          let shallow = false;
          for (const [dx, dy] of DIRS) if (tAt(x + dx, y + dy) > 0) shallow = true;
          base = shallow ? C.shallow : C.water; f = 0.95 + hv * 0.08;
        } else {
          f *= 1 + 0.03 * Math.max(-3, Math.min(3, dxh + dyh));
          if (t === PLAIN) base = C.plain;
          else if (t === FOREST) base = C.forest;
          else base = mix(C.hillLo, C.hillHi, Math.max(0, Math.min(1, (lv - 3) / 3)));
        }
        poly(ctx, [L, T, B], rgb(base, f * 1.025));
        poly(ctx, [T, R, B], rgb(base, f * 0.975));

        if (t === WATER && hv < 0.4) {
          ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1;
          const ox = (hv - 0.2) * 20;
          ctx.beginPath(); ctx.moveTo(cx - 7 + ox, cy - 1); ctx.lineTo(cx + 1 + ox, cy - 1); ctx.moveTo(cx - 2 + ox, cy + 3); ctx.lineTo(cx + 6 + ox, cy + 3); ctx.stroke();
        }

        // railroad
        const rm = w.railMask[i];
        if (rm) {
          const lift = t === WATER ? 3 : 0.5;
          const segs = [];
          for (let d = 0; d < 4; d++) if (rm & (1 << d)) {
            const nl = hAt(x + DIRS[d][0], y + DIRS[d][1]);
            const dyo = -(nl - lv) * LV / 2;
            const vx = [a / 2, -a / 2, -a / 2, a / 2][d], vy = [b / 2, b / 2, -b / 2, -b / 2][d];
            segs.push([cx + vx, cy + vy + dyo - lift]);
          }
          const draw = (col, wd, dash) => {
            ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.setLineDash(dash || []);
            ctx.beginPath();
            for (const sg of segs) { ctx.moveTo(cx, cy - lift); ctx.lineTo(sg[0], sg[1]); }
            ctx.stroke(); ctx.setLineDash([]);
          };
          if (t === WATER) { draw('rgba(60,44,30,0.9)', 7); }
          draw('rgb(122,108,92)', 5.5);
          draw('rgb(70,52,38)', 4.5, [1.6, 2.6]);
          draw('rgb(214,208,196)', 1.1);
        }

        // decorations
        if (t === FOREST && !rm) {
          const n = 2 + Math.floor(hv * 2.2), pts = [];
          for (let k = 0; k < n; k++) pts.push([cx + (TF.hash2(x, y, 11 + k) - 0.5) * 22, cy + (TF.hash2(x, y, 31 + k) - 0.5) * 10 + 3, TF.hash2(x, y, 51 + k)]);
          pts.sort((p, q) => p[1] - q[1]);
          for (const p of pts) pine(ctx, p[0], p[1], 1.0 + p[2] * 0.35, p[2]);
        } else if (t === HILL && lv >= 4 && hv > 0.45) {
          const rx = cx + (hv - 0.7) * 20, ry = cy + 1;
          poly(ctx, [[rx - 5, ry + 2], [rx - 1, ry - 6], [rx + 3, ry - 3], [rx + 6, ry + 2]], 'rgb(150,144,132)');
          poly(ctx, [[rx - 1, ry - 6], [rx + 3, ry - 3], [rx + 6, ry + 2], [rx + 1, ry + 2]], 'rgb(118,112,102)');
        }
      }
    }
    return cv;
  };
})(typeof window !== 'undefined' ? window : globalThis);
                                    
