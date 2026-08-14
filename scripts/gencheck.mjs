/* Generator quality check — runs the real sector generator in jsdom across
   many seeds and asserts the route networks actually have the variety we want:
   crossings, cycles (loops), multiple spawn gates and enough foundations.

   Run with: npm run gencheck   (after npm install)
*/
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tmp = mkdtempSync(path.join(tmpdir(), 'gencheck-'));

const harness = `
import { S } from './state';
import { setView } from './view';
import { genSector } from './sectors';
import { shortestRoute, routePolyline } from './sectors';

function ccw(a,b,c){return (c.x-a.x)*(b.y-a.y)-(b.x-a.x)*(c.y-a.y)}
function cross(a,b,c,d){const EPS=1e-6;
  const d1=ccw(a,b,c),d2=ccw(a,b,d),d3=ccw(c,d,a),d4=ccw(c,d,b);
  return ((d1>EPS&&d2<-EPS)||(d1<-EPS&&d2>EPS))&&((d3>EPS&&d4<-EPS)||(d3<-EPS&&d4>EPS))}

const out = { seeds: [], totals: { n: 0, e: 0, spots: 0, spawns: 0, crossings: 0, cycles: 0, badRoutes: 0 } };
const SEEDS = 400;
for (let seed = 1; seed <= SEEDS; seed++) {
  S.seed = seed;
  S.sector = 0;
  setView(800, 500, 1);
  genSector();
  let crossings = 0;
  for (let i = 0; i < S.edges.length; i++) {
    const a = S.nodes[S.edges[i][0]], b = S.nodes[S.edges[i][1]];
    for (let j = i + 1; j < S.edges.length; j++) {
      const c = S.nodes[S.edges[j][0]], d = S.nodes[S.edges[j][1]];
      if (cross(a, b, c, d)) crossings++;
    }
  }
  const cycles = S.edges.length - S.nodes.length + 1; // cyclomatic number (graph is connected)
  let badRoutes = 0;
  for (const sp of S.spawns) {
    const route = shortestRoute(sp, S.coreIdx);
    const rp = routePolyline(route);
    if (route.length < 2 || rp.len <= 0 || rp.pts[route.length - 1].x !== S.nodes[S.coreIdx].px) badRoutes++;
  }
  out.seeds.push({ n: S.nodes.length, e: S.edges.length, sp: S.spawns.length, spots: S.spots.length, crossings, cycles, badRoutes });
  out.totals.n += S.nodes.length;
  out.totals.e += S.edges.length;
  out.totals.spots += S.spots.length;
  out.totals.spawns += S.spawns.length;
  out.totals.crossings += crossings;
  out.totals.cycles += cycles;
  out.totals.badRoutes += badRoutes;
}
(globalThis as any).__GENCHECK__ = out;
`;

const result = await build({
  stdin: {
    contents: harness,
    resolveDir: path.join(root, 'src'),
    loader: 'ts'
  },
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  write: false,
  logLevel: 'silent'
});
const code = result.outputFiles[0].text;

const dom = new JSDOM('<!DOCTYPE html><html><body><canvas id="cv"></canvas><canvas id="worldCv"></canvas></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
  runScripts: 'dangerously',
  beforeParse(window) {
    window.HTMLCanvasElement.prototype.getContext = () => ({
      getContext: undefined
    });
  }
});
dom.window.eval(code);
const out = dom.window.__GENCHECK__;

const seeds = out.seeds;
const avg = (k) => seeds.reduce((s, x) => s + x[k], 0) / seeds.length;
const pct = (k, pred) => seeds.filter(pred).length / seeds.length * 100;
const withCross = seeds.filter(s => s.crossings > 0).length;
const withLoop = seeds.filter(s => s.cycles >= 1).length;
const withMultiSpawn = seeds.filter(s => s.sp >= 2).length;
const withSpots = seeds.filter(s => s.spots >= 14).length;

console.log(`seeds: ${seeds.length}`);
console.log(`avg nodes: ${avg('n').toFixed(1)} · avg edges: ${avg('e').toFixed(1)} · avg crossings: ${avg('crossings').toFixed(1)} · avg cycles: ${avg('cycles').toFixed(1)}`);
console.log(`avg spawns: ${avg('sp').toFixed(2)} · avg spots: ${avg('spots').toFixed(1)}`);
console.log(`maps with ≥1 crossing: ${withCross} (${(withCross / seeds.length * 100).toFixed(0)}%)`);
console.log(`maps with ≥1 loop:    ${withLoop} (${(withLoop / seeds.length * 100).toFixed(0)}%)`);
console.log(`maps with ≥2 spawns:  ${withMultiSpawn} (${(withMultiSpawn / seeds.length * 100).toFixed(0)}%)`);
console.log(`maps with ≥14 spots:  ${withSpots} (${(withSpots / seeds.length * 100).toFixed(0)}%)`);
console.log(`broken routes: ${out.totals.badRoutes}`);

const fail = [];
if (withCross / seeds.length < .85) fail.push('crossings < 85%');
if (withLoop / seeds.length < .95) fail.push('loops < 95%');
if (withMultiSpawn / seeds.length < .9) fail.push('multi-spawn < 90%');
if (withSpots / seeds.length < .9) fail.push('spots < 90%');
if (out.totals.badRoutes > 0) fail.push('broken routes exist');
if (fail.length) {
  console.error('GENCHECK FAILED: ' + fail.join(', '));
  process.exit(1);
}
console.log('GENCHECK PASSED ✓');
