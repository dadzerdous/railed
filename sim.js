(function (g) {
  'use strict';
  const TF = g.TF;
  const { WATER, PLAIN, FOREST, HILL, DIRS } = TF;

  TF.YEAR_SECS = 60;
  const GROW = 0.34, GROW_OFF = 0.025, IMMIG = 0.45;
  TF.STAGES = ['Hamlet', 'Village', 'Town', 'Hold'];
  TF.IND = {
    depot:  { label: 'Trading port', silver: 7, timber: 0, rune: 0, cap: 1.20 },
    mill:   { label: 'Forge',        silver: 3, timber: 2, rune: 0, cap: 1.15 },
    mine:   { label: 'Silver mine',  silver: 9, timber: 0, rune: 0, cap: 1.10 },
    lumber: { label: 'Timber camp',  silver: 1, timber: 5, rune: 0, cap: 1.00 },
    farm:   { label: 'Farmstead',    silver: 2, timber: 1, rune: 0, cap: 0.95 },
  };
  TF.NODE = {
    timber: { label: 'Ancient Grove', icon: 'T', silver: 0, timber: 3, rune: 0 },
    silver: { label: 'Silver Vein',   icon: 'S', silver: 4, timber: 0, rune: 0 },
    rune:   { label: 'Rune Spring',   icon: 'R', silver: 0, timber: 0, rune: 1.25 },
  };

  function lotsFor(s) { return Math.min(s.v.lots.length, Math.floor(s.pop / 4.5)); }
  function key(x,y){ return x + ',' + y; }
  function hash(seed, x, y) { return TF.hash ? TF.hash(seed, x, y) : Math.abs(((x * 73856093) ^ (y * 19349663) ^ String(seed).length * 83492791)); }

  function makeNodes(st) {
    const w = st.world, out = [], used = new Set();
    for (const s of st.vs) used.add(key(s.v.x,s.v.y));
    const hq = st.vs[w.hq].v;
    const wanted = { timber: 9, silver: 8, rune: 6 };
    const kinds = ['timber','silver','rune'];
    for (let y=2;y<w.H-2;y++) for(let x=2;x<w.W-2;x++) {
      const i=y*w.W+x;
      if (w.type[i]===WATER || used.has(key(x,y))) continue;
      const d=Math.abs(x-hq.x)+Math.abs(y-hq.y);
      if (d<3) continue;
      const h=hash(st.seed,x,y)>>>0;
      if ((h % 97) > 8) continue;
      const kind=kinds[h%3];
      if (wanted[kind] <= 0) continue;
      out.push({x,y,kind,connected:false}); used.add(key(x,y)); wanted[kind]--;
    }
    // Guarantee one useful early node of each kind near HQ if procedural placement missed the opening area.
    for (let k=0;k<3;k++) {
      const kind=kinds[k];
      if (out.some(n=>n.kind===kind && Math.abs(n.x-hq.x)+Math.abs(n.y-hq.y)<=10)) continue;
      outer: for(let r=4;r<=10;r++) for(let dy=-r;dy<=r;dy++) for(let dx=-r;dx<=r;dx++) {
        if(Math.abs(dx)+Math.abs(dy)!==r) continue;
        const x=hq.x+dx,y=hq.y+dy; if(x<1||y<1||x>=w.W-1||y>=w.H-1) continue;
        const i=y*w.W+x; if(w.type[i]===WATER||used.has(key(x,y))) continue;
        out.push({x,y,kind,connected:false}); used.add(key(x,y)); break outer;
      }
    }
    return out;
  }

  TF.newState = function (seed, withTerrain) {
    const world = TF.generate(seed), N = world.W * world.H;
    const st = {
      seed, world, terrain: withTerrain ? TF.buildTerrain(world) : null,
      t: 850.0, speed: 1, paused: true,
      silver: 90, timber: 70, rune: 8,
      net: new Uint8Array(N), wmask: new Uint8Array(N), linked: new Uint8Array(N), wireTiles: 0, lotSet: new Set(),
      vs: world.villages.map(v => ({ v, pop: v.pop0, conn: false, stage: TF.stageOf(v.pop0), shown: 0, born: [], connT: null })),
      nodes: [], nodeMap: new Map(),
      items: [], dirty: true, sel: -1, mode: 'survey', plan: null, hover: null, wireStart: null, draft: null,
      pulses: [], pulseTimer: 2, flash: {}, rate: { silver:0, timber:0, rune:0 }, events: [], now: 0,
    };
    for (const s of st.vs) { s.shown = lotsFor(s); for (let k=0;k<s.shown;k++) s.born[k]=-99; for(const l of s.v.lots) st.lotSet.add(l.y*world.W+l.x); }
    TF.connectVillage(st, st.vs[world.hq], true);
    st.nodes = makeNodes(st); for(const n of st.nodes) st.nodeMap.set(key(n.x,n.y),n);
    st.linked = TF.linkedSet(st); TF.updateNodes(st);
    return st;
  };

  TF.connectVillage = function(st,s,silent){ s.conn=true; s.connT=st.t; st.net[s.v.y*st.world.W+s.v.x]=1; st.dirty=true; if(!silent) st.events.push({type:'connected',s}); };
  TF.villageNear = function(st,x,y,r){ for(let k=0;k<st.vs.length;k++){const v=st.vs[k].v;if(Math.max(Math.abs(v.x-x),Math.abs(v.y-y))<=r)return k;}return -1; };
  TF.nodeAt = function(st,x,y){ return st.nodeMap.get(key(x,y)) || null; };

  function addEdges(mask,W,path){ for(let k=1;k<path.length;k++){const [x,y]=path[k],[px,py]=path[k-1];const d=DIRS.findIndex(([dx,dy])=>px+dx===x&&py+dy===y);if(d<0)continue;mask[py*W+px]|=1<<d;mask[y*W+x]|=1<<((d+2)%4);} }
  TF.linkedSet=function(st,extraPath){const w=st.world,W=w.W,N=W*w.H;let mask=st.wmask;if(extraPath){mask=st.wmask.slice();addEdges(mask,W,extraPath);}const hq=st.vs[w.hq].v,s0=hq.y*W+hq.x;const seen=new Uint8Array(N);seen[s0]=1;const q=[s0];for(let qi=0;qi<q.length;qi++){const i=q[qi],m=mask[i],x=i%W,y=(i-x)/W;for(let d=0;d<4;d++)if(m&(1<<d)){const nx=x+DIRS[d][0],ny=y+DIRS[d][1];if(nx<0||ny<0||nx>=W||ny>=w.H)continue;const ni=ny*W+nx;if(!seen[ni]){seen[ni]=1;q.push(ni);}}}return seen;};
  TF.updateNodes=function(st){const W=st.world.W;for(const n of st.nodes){const on=!!st.linked[n.y*W+n.x];if(on&&!n.connected){n.connected=true;st.events.push({type:'node',node:n});}}};
  TF.updateLinks=function(st){const W=st.world.W;st.linked=TF.linkedSet(st);for(const s of st.vs)if(!s.conn&&st.linked[s.v.y*W+s.v.x])TF.connectVillage(st,s);TF.updateNodes(st);};

  // Manual path costs. Water is deliberately expensive in Rune Power: magic bends the land where timber cannot.
  TF.tileResourceCost=function(st,x,y,fx,fy){const w=st.world,i=y*w.W+x,t=w.type[i];let timber=1,silver=1,rune=0;if(t===FOREST){timber=3;silver=1;}else if(t===HILL){timber=2;silver=3;rune=0.5;}else if(t===WATER){timber=3;silver=4;rune=3;}if(st.lotSet.has(i))silver+=2;if(fx!==undefined){const dh=Math.abs(w.h[i]-w.h[fy*w.W+fx]);silver+=dh;}return{timber,silver,rune};};

  TF.makeManualPlan=function(st,path){const w=st.world,W=w.W;const base={valid:false,path:path?path.slice():[],cost:{silver:0,timber:0,rune:0},tiles:0,opens:[],nodes:[],reason:''};if(!path||path.length<2)return Object.assign(base,{reason:'Place at least one more runestone.'});const [sx,sy]=path[0];if(!st.linked[sy*W+sx])return Object.assign(base,{reason:'Your path must begin on the connected rune network.'});const seen=new Set([key(sx,sy)]);for(let k=1;k<path.length;k++){const [x,y]=path[k],[px,py]=path[k-1];if(x<0||y<0||x>=W||y>=w.H)return Object.assign(base,{reason:'Outside Midgard.'});if(Math.abs(x-px)+Math.abs(y-py)!==1)return Object.assign(base,{reason:'Runestones must touch edge-to-edge.'});if(seen.has(key(x,y)))return Object.assign(base,{reason:'The path cannot cross itself.'});seen.add(key(x,y));const i=y*W+x;if(!st.net[i]){const c=TF.tileResourceCost(st,x,y,px,py);base.cost.silver+=c.silver;base.cost.timber+=c.timber;base.cost.rune+=c.rune;base.tiles++;}const n=TF.nodeAt(st,x,y);if(n&&!n.connected&&!base.nodes.includes(n))base.nodes.push(n);}base.cost.silver=Math.ceil(base.cost.silver);base.cost.timber=Math.ceil(base.cost.timber);base.cost.rune=Math.ceil(base.cost.rune*10)/10;const after=TF.linkedSet(st,path);st.vs.forEach((s,i)=>{if(!s.conn&&after[s.v.y*W+s.v.x])base.opens.push(i);});base.valid=true;return base;};

  TF.canAfford=function(st,p){return st.silver>=p.cost.silver&&st.timber>=p.cost.timber&&st.rune>=p.cost.rune;};
  TF.buildPlan=function(st,p){if(!p||!p.valid||!TF.canAfford(st,p))return false;st.silver-=p.cost.silver;st.timber-=p.cost.timber;st.rune-=p.cost.rune;const W=st.world.W;for(const [x,y]of p.path){const i=y*W+x;if(!st.net[i]){st.net[i]=1;st.wireTiles++;}}addEdges(st.wmask,W,p.path);st.dirty=true;TF.updateLinks(st);st.events.push({type:'built',plan:p});return true;};

  TF.wirePath=function(st,a,b){const w=st.world,W=w.W,start=a.v.y*W+a.v.x,goal=b.v.y*W+b.v.x,prev=new Int32Array(W*w.H).fill(-2);prev[start]=-1;const q=[start];for(let qi=0;qi<q.length;qi++){const i=q[qi];if(i===goal)break;const m=st.wmask[i],x=i%W,y=(i-x)/W;for(let d=0;d<4;d++)if(m&(1<<d)){const ni=(y+DIRS[d][1])*W+(x+DIRS[d][0]);if(prev[ni]===-2){prev[ni]=i;q.push(ni);}}}if(prev[goal]===-2)return null;const path=[];for(let c=goal;c>=0;c=prev[c])path.push([c%W,Math.floor(c/W)]);return path.reverse();};
  TF.launchPulse=function(st,a,b){const conn=st.vs.filter(s=>s.conn);if(conn.length<2)return;if(!a)a=b&&b!==conn[0]?st.vs[st.world.hq]:conn[Math.floor(Math.random()*conn.length)];if(!b||b===a){do{b=conn[Math.floor(Math.random()*conn.length)];}while(b===a);}const path=TF.wirePath(st,a,b);if(path&&path.length>1)st.pulses.push({path,pos:0,speed:7+Math.random()*3,from:a,to:b});};
  TF.dispatchText=function(p){return{head:'THE RUNES STIR',text:p.from.v.name+' whispers across the old paths to '+p.to.v.name+'.'};};

  TF.step=function(st,dtReal){st.now+=dtReal;const n=st.vs.filter(s=>s.conn).length;const dy=st.paused?0:dtReal*st.speed/TF.YEAR_SECS;let rs=0,rt=0,rr=0;for(const s of st.vs){const ind=TF.IND[s.v.industry];const cap=(s.conn?130+28*Math.min(n-1,9):40)*ind.cap;if(dy>0)s.pop+=(s.conn?GROW:GROW_OFF)*s.pop*Math.max(0,1-s.pop/cap)*dy+(s.conn?IMMIG*dy:0);if(s.conn&&!s.v.isHQ){const scale=.75+Math.min(1.5,s.pop/100);rs+=ind.silver*scale;rt+=ind.timber*scale;rr+=ind.rune*scale;}const ns=TF.stageOf(s.pop);if(ns!==s.stage){if(ns>s.stage&&s.conn)st.events.push({type:'stage',s,stage:ns});s.stage=ns;st.dirty=true;}const want=lotsFor(s);if(want>s.shown){for(let k=s.shown;k<want;k++)s.born[k]=st.now;s.shown=want;st.dirty=true;}}
    for(const node of st.nodes)if(node.connected){const d=TF.NODE[node.kind];rs+=d.silver;rt+=d.timber;rr+=d.rune;}
    st.rate={silver:rs,timber:rt,rune:rr};if(dy>0){st.silver+=rs*12*dy;st.timber+=rt*12*dy;st.rune+=rr*12*dy;}st.t+=dy;
    if(!st.paused){st.pulseTimer-=dtReal*st.speed;if(st.pulseTimer<=0&&n>=2){TF.launchPulse(st);st.pulseTimer=3.2/(1+.3*n)+Math.random()*1.2;}}
    for(const p of st.pulses)p.pos+=dtReal*(st.paused?0:st.speed)*p.speed*.5;for(let i=st.pulses.length-1;i>=0;i--){const p=st.pulses[i];if(p.pos>=p.path.length-1){st.flash[p.to.v.id]=st.now;st.events.push({type:'dispatch',p});st.pulses.splice(i,1);}}
  };
})(typeof window!=='undefined'?window:globalThis);
