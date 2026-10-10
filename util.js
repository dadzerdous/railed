(function (g) {
  'use strict';
  const TF = (g.TF = g.TF || {});

  TF.WATER = 0; TF.PLAIN = 1; TF.FOREST = 2; TF.HILL = 3;
  TF.W = 64; TF.H = 64;
  // dir index: 0 = +x, 1 = +y, 2 = -x, 3 = -y
  TF.DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

  TF.mulberry32 = function (a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  TF.hashSeed = function (s) {
    let h = 2166136261 >>> 0;
    s = String(s);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };

  // deterministic per-tile hash in [0,1)
  TF.hash2 = function (x, y, s) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul((s | 0) + 1, 1103515245)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };

  TF.makeNoise = function (rand) {
    const N = 256;
    const lat = new Float32Array(N * N);
    for (let i = 0; i < lat.length; i++) lat[i] = rand();
    const v = (ix, iy) => lat[((iy & 255) << 8) | (ix & 255)];
    function noise(x, y) {
      const x0 = Math.floor(x), y0 = Math.floor(y);
      const fx = x - x0, fy = y - y0;
      const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const a = v(x0, y0), b = v(x0 + 1, y0), c = v(x0, y0 + 1), d = v(x0 + 1, y0 + 1);
      return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
    function fbm(x, y, oct) {
      let amp = 1, f = 1, sum = 0, norm = 0;
      for (let o = 0; o < oct; o++) { sum += amp * noise(x * f, y * f); norm += amp; amp *= 0.5; f *= 2; }
      return sum / norm;
    }
    return { noise, fbm };
  };

  class Heap {
    constructor() { this.d = []; this.s = []; }
    get size() { return this.d.length; }
    push(d, s) {
      let i = this.d.length;
      this.d.push(d); this.s.push(s);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (this.d[p] <= d) break;
        this.d[i] = this.d[p]; this.s[i] = this.s[p]; i = p;
      }
      this.d[i] = d; this.s[i] = s;
    }
    pop() {
      const rd = this.d[0], rs = this.s[0];
      const ld = this.d.pop(), ls = this.s.pop();
      const n = this.d.length;
      if (n > 0) {
        let i = 0;
        for (;;) {
          let c = 2 * i + 1;
          if (c >= n) break;
          if (c + 1 < n && this.d[c + 1] < this.d[c]) c++;
          if (this.d[c] >= ld) break;
          this.d[i] = this.d[c]; this.s[i] = this.s[c]; i = c;
        }
        this.d[i] = ld; this.s[i] = ls;
      }
      return [rd, rs];
    }
  }
  TF.Heap = Heap;

  // Multi-source Dijkstra on a 4-connected grid with a turn penalty.
  // o: { W, H, sources:[[x,y]], isTarget(x,y), cost(x,y,fromX,fromY), turn }
  TF.route = function (o) {
    const W = o.W, H = o.H, turn = o.turn || 0;
    const S = W * H * 5;
    const dist = new Float64Array(S).fill(Infinity);
    const prev = new Int32Array(S).fill(-1);
    const hp = new Heap();
    for (const [x, y] of o.sources) {
      const s = (y * W + x) * 5 + 4;
      dist[s] = 0; hp.push(0, s);
    }
    while (hp.size) {
      const [d, s] = hp.pop();
      if (d > dist[s]) continue;
      const dir = s % 5, t = (s - dir) / 5, x = t % W, y = (t - x) / W;
      if (o.isTarget(x, y)) {
        const path = [];
        let c = s;
        while (c >= 0) {
          const cd = c % 5, ct = (c - cd) / 5, cx = ct % W;
          path.push([cx, (ct - cx) / W]);
          c = prev[c];
        }
        return path.reverse();
      }
      for (let k = 0; k < 4; k++) {
        const nx = x + TF.DIRS[k][0], ny = y + TF.DIRS[k][1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const c = o.cost(nx, ny, x, y);
        if (c === Infinity) continue;
        const nd = d + c + ((dir !== 4 && dir !== k) ? turn : 0);
        const ns = (ny * W + nx) * 5 + k;
        if (nd < dist[ns]) { dist[ns] = nd; prev[ns] = s; hp.push(nd, ns); }
      }
    }
    return null;
  };
})(typeof window !== 'undefined' ? window : globalThis);
