/* Procedural route-network generation.

   Every sector is a small graph (nodes + undirected edges) with one CORE and
   1–3 spawn gates. Five archetypes — grid, radial, river, web, loops — are
   picked by seed, so sectors get real shape variety: loops, crossings and
   multiple sources instead of a single zig-zag. Enemies pathfind from a spawn
   gate to the CORE (shortest path, occasionally jittered so swarms wander
   scenic loops). Foundations keep a safe distance from every road.
*/
import { S } from './state';
import { W, H } from './view';
import { clamp, mulberry32 } from './utils';
import type { RouteNode, PathPoint, Spot } from './types';

const NM = 0.1;                       // node margin (unit space)
const SPOT_PATH_GAP = 0.085;          // min distance spots keep from any road
const SPOT_PATH_GAP_LOOSE = 0.07;     // relaxed gap used by the fallback pass
const SPOT_SPACING = 0.09;
const MAX_SPOTS = 22;
const MIN_SPOTS = 14;
const CORE_MIN_DIST = 0.42;           // min spawn→core route length (unit)

interface WU { x: number; y: number }
interface GenResult {
  nodes: RouteNode[];
  edges: [number, number][];
  core: number;
  spawnCands: number[];   // candidates, ordered by preference
  forced?: number[];      // must-be spawns (e.g. river side gate)
}

function dist(a: WU, b: WU): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function jittered(r: () => number, amt: number): number {
  return (r() - .5) * 2 * amt;
}

/** Distance from a point to a unit-space segment. */
function segDist(px: number, py: number, a: WU, b: WU): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = clamp(((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(px - a.x - dx * t, py - a.y - dy * t);
}

function ccw(a: WU, b: WU, c: WU): number {
  return (c.x - a.x) * (b.y - a.y) - (b.x - a.x) * (c.y - a.y);
}

/** Proper crossing (interior intersection, not shared endpoints). */
function properCross(a: WU, b: WU, c: WU, d: WU): boolean {
  const EPS = 1e-6;
  const d1 = ccw(a, b, c), d2 = ccw(a, b, d), d3 = ccw(c, d, a), d4 = ccw(c, d, b);
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) &&
         ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS));
}

/* ---------------- archetypes ---------------- */

/** Jittered lattice with neighbor edges + occasional diagonal pairs → loops (cells) and X crossings. */
function genGrid(r: () => number): GenResult {
  const landscape = W >= H;
  const cols = landscape ? 5 : 3, rows = landscape ? 3 : 4;
  const nodes: RouteNode[] = [];
  for (let c = 0; c < cols; c++) {
    for (let rw = 0; rw < rows; rw++) {
      nodes.push({
        x: clamp(.08 + (c + .5) / cols * .84 + jittered(r, .035), .1, .9),
        y: clamp(.12 + (rw + .5) / rows * .76 + jittered(r, .035), .1, .9),
        px: 0, py: 0, kind: 'junc'
      });
    }
  }
  const id = (c: number, rw: number) => rw * cols + c;
  const edges: [number, number][] = [];
  for (let c = 0; c < cols; c++) {
    for (let rw = 0; rw < rows; rw++) {
      if (c < cols - 1 && r() < .92) edges.push([id(c, rw), id(c + 1, rw)]);
      if (rw < rows - 1 && r() < .92) edges.push([id(c, rw), id(c, rw + 1)]);
      if (c < cols - 1 && rw < rows - 1 && r() < .34) {
        edges.push([id(c, rw), id(c + 1, rw + 1)]);
        if (r() < .6) edges.push([id(c + 1, rw), id(c, rw + 1)]);   // the crossing diagonal
      }
    }
  }
  const core = id(cols - 1, Math.floor(rows / 2));
  const spawnCands: number[] = [];
  for (let rw = 0; rw < rows; rw++) spawnCands.push(id(0, rw));
  return { nodes, edges, core, spawnCands };
}

/** Center hub + ring: the ring is a big loop, spokes form triangles, chords cut across the ring → crossings. */
function genRadial(r: () => number): GenResult {
  const landscape = W >= H;
  const rx = landscape ? .36 : .27, ry = landscape ? .27 : .36;
  const cx = .5 + jittered(r, .04), cy = .5 + jittered(r, .04);
  const n = 8 + Math.floor(r() * 2);
  const nodes: RouteNode[] = [{ x: cx, y: cy, px: 0, py: 0, kind: 'junc' }];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 - Math.PI / 2;
    nodes.push({
      x: clamp(cx + Math.cos(a) * rx + jittered(r, .02), .1, .9),
      y: clamp(cy + Math.sin(a) * ry + jittered(r, .02), .1, .9),
      px: 0, py: 0, kind: 'junc'
    });
  }
  const edges: [number, number][] = [];
  for (let i = 1; i <= n; i++) edges.push([i, (i % n) + 1]);       // ring
  for (let i = 1; i <= n; i++) edges.push([0, i]);                  // spokes
  for (let k = 0; k < 2; k++) {                                     // long chords → crossings
    const i = 1 + Math.floor(r() * n);
    const j = ((i + 2 + Math.floor(r() * (n - 3))) % n) + 1;
    if (i !== j) edges.push([i, j]);
  }
  let core = 1, bd = -1;
  for (let i = 1; i <= n; i++) {
    if (nodes[i].y - cy > bd) { bd = nodes[i].y - cy; core = i; }
  }
  const spawnCands: number[] = [];
  for (let i = 1; i <= n; i++) if (nodes[i].y < cy) spawnCands.push(i);
  return { nodes, edges, core, spawnCands };
}

/** Winding spine + chords that cut back across it (loops & crossings) + a side gate. */
function genRiver(r: () => number): GenResult {
  const landscape = W >= H;
  const n = 8;
  const nodes: RouteNode[] = [];
  const y0 = .2 + r() * .6;
  const amp = .16 + r() * .12;
  const freq = 2 + Math.floor(r() * 2);
  const ph = r() * 6.28;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    let x: number, y: number;
    if (landscape) {
      x = .08 + t * .84;
      y = y0 + Math.sin(ph + t * freq * Math.PI) * amp;
      if (i > 0 && Math.abs(y - nodes[i - 1].y) < .2) {
        y = clamp(nodes[i - 1].y + (i % 2 ? .24 : -.24) + jittered(r, .05), .1, .9);
      }
    } else {
      y = .08 + t * .84;
      x = y0 + Math.sin(ph + t * freq * Math.PI) * amp;
      if (i > 0 && Math.abs(x - nodes[i - 1].x) < .2) {
        x = clamp(nodes[i - 1].x + (i % 2 ? .24 : -.24) + jittered(r, .05), .1, .9);
      }
    }
    nodes.push({ x: clamp(x, .08, .92), y: clamp(y, .1, .9), px: 0, py: 0, kind: 'junc' });
  }
  const edges: [number, number][] = [];
  for (let i = 0; i < n - 1; i++) edges.push([i, i + 1]);
  for (let i = 0; i < n - 4; i += 2) if (r() < .85) edges.push([i, i + 3]);  // chords across the river
  /* side gate: a branch node off the middle, two connections → small loop + second source */
  const mid = Math.floor(n / 2);
  const side = nodes.length;
  nodes.push({
    x: clamp(nodes[mid].x + (r() < .5 ? .17 : -.17), .1, .9),
    y: clamp(nodes[mid].y + (landscape ? .15 : -.15) + jittered(r, .03), .1, .9),
    px: 0, py: 0, kind: 'spawn'
  });
  edges.push([side, mid], [side, Math.min(mid + 2, n - 1)]);
  const spawnCands = [0, side];
  return { nodes, edges, core: n - 1, spawnCands, forced: [side] };
}

/** A chain of tight roundabouts strung together — long, multi-loop switchbacks
    with off-ramps between cells. */
function genLoops(r: () => number): GenResult {
  const landscape = W >= H;
  const cells = 4 + Math.floor(r() * 2);
  const nodes: RouteNode[] = [];
  const edges: [number, number][] = [];
  const gx0 = .06, gx1 = .94;
  const span = gx1 - gx0;
  const cw = span / cells;
  for (let c = 0; c < cells; c++) {
    const cx = gx0 + cw * (c + .5) + jittered(r, .02);
    const cy = landscape ? .5 + jittered(r, .12) : .5 + jittered(r, .12);
    const base = nodes.length;
    const rx = landscape ? cw * .34 : .18 + r() * .08;
    const ry = landscape ? .16 + r() * .1 : cw * .34;
    const m = 5 + Math.floor(r() * 3);   /* 5–7 points per roundabout */
    for (let k = 0; k < m; k++) {
      const a = k / m * Math.PI * 2 - Math.PI / 2;
      nodes.push({
        x: clamp(cx + Math.cos(a) * rx + jittered(r, .015), .06, .94),
        y: clamp(cy + Math.sin(a) * ry + jittered(r, .015), .1, .9),
        px: 0, py: 0, kind: 'junc'
      });
    }
    for (let k = 0; k < m; k++) edges.push([base + k, base + ((k + 1) % m)]);
    if (c > 0) {
      const prev = base - 1;
      /* two off-ramps link this roundabout to the previous one → real loops */
      edges.push([prev, base], [prev - 2, base + 1]);
    }
  }
  const last = nodes.length - 1;
  let core = 0;
  for (let i = 1; i < nodes.length; i++) {
    if (nodes[i].x > nodes[core].x) core = i;
  }
  const spawnCands: number[] = [];
  for (let i = 0; i < nodes.length; i++) if (nodes[i].x < nodes[core].x - .12) spawnCands.push(i);
  if (!spawnCands.length) spawnCands.push(0, 1);
  return { nodes, edges, core, spawnCands };
}

/** Random scatter with 2-nearest-neighbor edges + random chords → organic loops & crossings. */
function genWeb(r: () => number): GenResult {
  const landscape = W >= H;
  const n = 12;
  const nodes: RouteNode[] = [];
  for (let i = 0; i < n; i++) {
    nodes.push({
      x: clamp(.08 + r() * .84, .1, .9),
      y: clamp(.1 + r() * .8, .1, .9),
      px: 0, py: 0, kind: 'junc'
    });
  }
  const have = new Set<string>();
  const key = (a: number, b: number) => a < b ? a + '-' + b : b + '-' + a;
  const edges: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const order = nodes
      .map((_, j) => j)
      .sort((a, b) => dist(nodes[a], nodes[i]) - dist(nodes[b], nodes[i]));
    for (let k = 1; k <= 2; k++) {
      const j = order[k];
      if (j === undefined || have.has(key(i, j))) continue;
      have.add(key(i, j));
      edges.push([i, j]);
    }
  }
  const extra = Math.floor(n * .7);
  for (let k = 0; k < extra; k++) {
    const a = Math.floor(r() * n), b = Math.floor(r() * n);
    if (a !== b && !have.has(key(a, b))) {
      have.add(key(a, b));
      edges.push([a, b]);
    }
  }
  const anchor: WU = landscape ? { x: .8, y: .5 } : { x: .5, y: .8 };
  let core = 0;
  for (let i = 1; i < n; i++) if (dist(nodes[i], anchor) < dist(nodes[core], anchor)) core = i;
  const spawnCands = nodes
    .map((_, i) => i)
    .filter(i => i !== core)
    .sort((a, b) => dist(nodes[b], nodes[core]) - dist(nodes[a], nodes[core]))
    .slice(0, 3);
  return { nodes, edges, core, spawnCands };
}

/* ---------------- post-processing ---------------- */

function dedupe(edges: [number, number][]): void {
  const seen = new Set<string>();
  for (let i = edges.length - 1; i >= 0; i--) {
    const a = edges[i][0], b = edges[i][1];
    const k = a < b ? a + '-' + b : b + '-' + a;
    if (a === b || seen.has(k)) edges.splice(i, 1);
    else seen.add(k);
  }
}

/** Union-find connectivity; add nearest-pair edges until everything is one component. */
function connectComponents(nodes: RouteNode[], edges: [number, number][]): void {
  const n = nodes.length;
  const par = new Array(n).fill(0).map((_, i) => i);
  const find = (x: number): number => (par[x] === x ? x : (par[x] = find(par[x])));
  for (const [a, b] of edges) par[find(a)] = find(b);
  while (true) {
    const roots = new Set<number>();
    for (let i = 0; i < n; i++) roots.add(find(i));
    if (roots.size <= 1) break;
    const rs = [...roots];
    let best: [number, number] = [0, 0], bd = Infinity;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (find(i) === find(j)) continue;
        const d = dist(nodes[i], nodes[j]);
        if (d < bd) { bd = d; best = [i, j]; }
      }
    }
    edges.push(best);
    par[find(best[0])] = find(best[1]);
  }
}

function countCrossings(nodes: RouteNode[], edges: [number, number][]): number {
  let c = 0;
  for (let i = 0; i < edges.length; i++) {
    const a = nodes[edges[i][0]], b = nodes[edges[i][1]];
    for (let j = i + 1; j < edges.length; j++) {
      const c2 = nodes[edges[j][0]], d = nodes[edges[j][1]];
      if (properCross(a, b, c2, d)) c++;
    }
  }
  return c;
}

/** If a map somehow has zero crossings, throw in a couple of long random chords. */
function addCrossingEdges(r: () => number, nodes: RouteNode[], edges: [number, number][]): void {
  const n = nodes.length;
  const have = new Set(edges.map(e => e[0] < e[1] ? e[0] + '-' + e[1] : e[1] + '-' + e[0]));
  let added = 0;
  for (let tries = 0; tries < 30 && added < 2; tries++) {
    const a = Math.floor(r() * n), b = Math.floor(r() * n);
    if (a === b || have.has(a + '-' + b)) continue;
    const A = nodes[a], B = nodes[b];
    let crosses = 0, bad = false;
    for (const [x, y] of edges) {
      if (properCross(A, B, nodes[x], nodes[y])) crosses++;
      if (crosses > 4) { bad = true; break; }
    }
    if (crosses >= 1 && !bad) {
      have.add(a + '-' + b);
      edges.push([a, b]);
      added++;
    }
  }
}

/** Dijkstra in unit space from `from`; returns distances to all nodes. */
function graphDists(nodes: RouteNode[], edges: [number, number][], from: number): number[] {
  const n = nodes.length;
  const dist = new Array(n).fill(Infinity);
  const done = new Array(n).fill(false);
  dist[from] = 0;
  for (let k = 0; k < n; k++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity) break;
    done[u] = true;
    for (const [a, b] of edges) {
      const v = a === u ? b : b === u ? a : -1;
      if (v < 0 || done[v]) continue;
      const w = Math.hypot(nodes[u].x - nodes[v].x, nodes[u].y - nodes[v].y);
      if (dist[u] + w < dist[v]) dist[v] = dist[u] + w;
    }
  }
  return dist;
}

function assemble(r: () => number, gen: (r: () => number) => GenResult) {
  const g = gen(r);
  dedupe(g.edges);
  connectComponents(g.nodes, g.edges);
  if (countCrossings(g.nodes, g.edges) === 0) addCrossingEdges(r, g.nodes, g.edges);

  /* pick spawn gates: the farthest candidates from the CORE, but never trivial routes */
  const dists = graphDists(g.nodes, g.edges, g.core);
  let spawns = g.spawnCands
    .filter(i => dists[i] >= CORE_MIN_DIST)
    .sort((a, b) => dists[b] - dists[a])
    .slice(0, 3);
  if (g.forced) for (const f of g.forced) if (!spawns.includes(f)) spawns.push(f);
  if (!spawns.length) spawns = g.spawnCands.slice(0, Math.min(2, g.spawnCands.length));

  g.nodes.forEach(n => (n.kind = 'junc'));
  g.nodes[g.core].kind = 'core';
  spawns.forEach(i => (g.nodes[i].kind = 'spawn'));
  return { nodes: g.nodes, edges: g.edges, spawns, core: g.core };
}

/* ---------------- public API ---------------- */

export function genSector(): void {
  const r = mulberry32((S.seed + S.sector * 7919) >>> 0);
  const gens: ((r: () => number) => GenResult)[] = [genGrid, genRadial, genRiver, genWeb, genLoops];
  const g = assemble(r, gens[Math.floor(r() * gens.length)]);
  S.nodes = g.nodes;
  S.edges = g.edges;
  S.spawns = g.spawns;
  S.coreIdx = g.core;
  S.spawnIdx = 0;
  genSpots(r);
  buildGraphPx();
  S.motes = [];
  for (let i = 0; i < 34; i++) {
    S.motes.push({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - .5) * 6, vy: (Math.random() - .5) * 4,
      r: Math.random() * 1.6 + .4, a: Math.random() * .5
    });
  }
  /* drifting forge embers */
  S.embers = [];
  for (let i = 0; i < 14; i++) {
    S.embers.push({ x: Math.random() * W, y: Math.random() * H, vy: 6 + Math.random() * 12, ph: Math.random() * 6.28 });
  }
  /* ruined skyline silhouette — seeded per sector */
  S.sky = [];
  const sr = mulberry32((S.seed + S.sector * 104729) >>> 0);
  let skx = -.02;
  while (skx < 1.02) {
    const skw = .04 + sr() * .08;
    S.sky.push({ x: skx, w: skw, h: .05 + sr() * .17, ant: sr() < .35 });
    skx += skw + sr() * .04;
  }
}

/** Place build foundations clear of every road and node. Falls back to a looser gap if the strict pass starves. */
function genSpots(r: () => number): void {
  S.spots = [];
  for (let pass = 0; pass < 2 && S.spots.length < MIN_SPOTS; pass++) {
    const gap = pass === 0 ? SPOT_PATH_GAP : SPOT_PATH_GAP_LOOSE;
    const attempts = pass === 0 ? 90 : 180;
    if (pass === 1) S.spots = [];
    for (let i = 0; i < attempts && S.spots.length < MAX_SPOTS; i++) {
      const sx = .06 + r() * .88, sy = .08 + r() * .84;
      let ok = true;
      for (const [a, b] of S.edges) {
        if (segDist(sx, sy, S.nodes[a], S.nodes[b]) < gap) { ok = false; break; }
      }
      if (ok) {
        for (const n of S.nodes) {
          if (Math.hypot(n.x - sx, n.y - sy) < gap + .02) { ok = false; break; }
        }
      }
      if (ok) {
        for (const sp of S.spots) {
          if (Math.hypot(sp.x - sx, sp.y - sy) < SPOT_SPACING) { ok = false; break; }
        }
      }
      if (ok) S.spots.push({ x: sx, y: sy, px: 0, py: 0 });
    }
  }
}

/** Project the unit-space graph into pixels; cache edge lengths and a lookup. */
export function buildGraphPx(): void {
  for (const n of S.nodes) { n.px = n.x * W; n.py = n.y * H; }
  S.edgeLen = S.edges.map(([a, b]) =>
    Math.hypot(S.nodes[a].px - S.nodes[b].px, S.nodes[a].py - S.nodes[b].py));
  S.edgeMap = new Map<number, number>();
  const n = S.nodes.length;
  S.edges.forEach(([a, b], i) => {
    const aa = Math.min(a, b), bb = Math.max(a, b);
    S.edgeMap.set(aa * n + bb, i);
  });
}

/** Pixel distance from a point to the nearest road segment. */
export function distToRoutePx(x: number, y: number): number {
  let best = 1e9;
  for (const [a, b] of S.edges) {
    const A = S.nodes[a], B = S.nodes[b];
    const dx = B.px - A.px, dy = B.py - A.py;
    const t = clamp(((x - A.px) * dx + (y - A.py) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    const d = Math.hypot(x - A.px - dx * t, y - A.py - dy * t);
    if (d < best) best = d;
  }
  return best;
}

/** Shortest node route from → to; pass a jitter fn for near-shortest scenic alternates (loops!). */
export function shortestRoute(from: number, to: number, jitter?: () => number): number[] {
  const n = S.nodes.length;
  const dist = new Array(n).fill(Infinity);
  const prev = new Array(n).fill(-1);
  const done = new Array(n).fill(false);
  dist[from] = 0;
  for (let k = 0; k < n; k++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity) break;
    done[u] = true;
    if (u === to) break;
    for (const [a, b] of S.edges) {
      const v = a === u ? b : b === u ? a : -1;
      if (v < 0 || done[v]) continue;
      const aa = Math.min(u, v), bb = Math.max(u, v);
      const ei = S.edgeMap.get(aa * n + bb);
      if (ei === undefined) continue;
      let w = S.edgeLen[ei];
      if (jitter) w *= .85 + jitter() * .5;
      if (dist[u] + w < dist[v]) { dist[v] = dist[u] + w; prev[v] = u; }
    }
  }
  const out: number[] = [];
  let cur = to;
  while (cur !== -1) { out.push(cur); cur = prev[cur]; }
  out.reverse();
  return out.length > 1 ? out : [from, to];
}

/** Build the pixel polyline for a node route. */
export function routePolyline(route: number[]): { pts: PathPoint[]; len: number } {
  const pts: PathPoint[] = [];
  const n = S.nodes.length;
  let len = 0;
  for (let i = 0; i < route.length; i++) {
    const node = S.nodes[route[i]];
    pts.push({ x: node.px, y: node.py, s: len });
    if (i > 0) {
      const aa = Math.min(route[i - 1], route[i]), bb = Math.max(route[i - 1], route[i]);
      const ei = S.edgeMap.get(aa * n + bb);
      len += ei !== undefined ? S.edgeLen[ei] : 0;
      pts[i].s = len;
    }
  }
  return { pts, len };
}

/** Position + heading at distance d along a route polyline. */
export function pointOnPoly(pts: PathPoint[], len: number, d: number): { x: number; y: number; ang: number } {
  d = clamp(d, 0, len);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (d <= b.s) {
      const t = (d - a.s) / ((b.s - a.s) || 1);
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        ang: Math.atan2(b.y - a.y, b.x - a.x)
      };
    }
  }
  const L = pts[pts.length - 1];
  return { x: L.x, y: L.y, ang: 0 };
}

/** Rebuild every live enemy's route polyline after the viewport changed. */
export function repathEnemies(): void {
  for (const e of S.enemies) {
    const r = routePolyline(e.route);
    e.routePx = r.pts;
    e.routeLen = r.len;
  }
}
