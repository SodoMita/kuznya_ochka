/* Enforce the project's hard shipping constraints.

   These are not style preferences — they are requirements the build must not
   regress. Run: npm run constraints

     C1  The game ships as ONE self-contained HTML file with no network
         fetches of any kind (no <link>, <script src>, @import, url(http…),
         fetch/XHR/WebSocket/EventSource/sendBeacon/importScripts).
     C2  It boots and plays from a file:// origin with network APIs disabled.
     C3  No raster images anywhere: not in the repo, not as data: URIs, not
         loaded at runtime.
     C4  No known per-draw performance traps in the render path
         (ctx.shadowBlur / filter), and static layers stay baked.
*/
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { JSDOM, ResourceLoader } from 'jsdom';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const html = readFileSync(path.join(root, 'index.html'), 'utf8');
const fail = [];
const note = [];

/* ── C1: single file, zero external references ──────────────────────────── */
const externals = [
  [/<link\b[^>]*>/gi, '<link> element'],
  [/<script\b[^>]*\bsrc\s*=/gi, '<script src>'],
  [/@import\b/gi, 'CSS @import'],
  [/url\(\s*['"]?https?:/gi, 'CSS url(http…)'],
  [/\bfetch\s*\(/g, 'fetch()'],
  [/\bXMLHttpRequest\b/g, 'XMLHttpRequest'],
  [/\bWebSocket\b/g, 'WebSocket'],
  [/\bEventSource\b/g, 'EventSource'],
  [/navigator\.sendBeacon/g, 'sendBeacon'],
  [/\bimportScripts\s*\(/g, 'importScripts()'],
  [/<iframe\b/gi, '<iframe>']
];
for (const [re, label] of externals) {
  const m = html.match(re);
  if (m) fail.push(`C1 external/network reference found: ${label} ×${m.length}`);
}
/* any absolute URL at all (svg xmlns is namespace-only and never fetched) */
for (const u of new Set(html.match(/https?:\/\/[^\s"'<>)]+/g) || [])) {
  if (u.startsWith('http://www.w3.org/')) continue;   // SVG/XML namespace URI
  fail.push(`C1 absolute URL in shipped file: ${u}`);
}
note.push(`single-file size: ${(html.length / 1024).toFixed(1)} kB`);

/* ── C3: no raster images ───────────────────────────────────────────────── */
const RASTER = /\.(png|jpe?g|gif|webp|bmp|ico|avif|tiff?)$/i;
const SKIP = new Set(['node_modules', '.git', '.venv', 'dist', 'build']);
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (RASTER.test(name)) fail.push(`C3 raster image in repo: ${path.relative(root, p)}`);
  }
})(root);
const dataImgs = html.match(/data:image\/(png|jpe?g|gif|webp|bmp|avif)/gi);
if (dataImgs) fail.push(`C3 embedded raster data URI ×${dataImgs.length}`);
if (/new Image\s*\(/.test(html)) fail.push('C3 runtime Image() raster load');

/* ── C4: no per-draw perf traps ─────────────────────────────────────────── */
for (const [re, label] of [[/\.shadowBlur\s*=/g, 'ctx.shadowBlur'], [/ctx\.filter\s*=/g, 'ctx.filter']]) {
  const m = html.match(re);
  if (m) fail.push(`C4 expensive per-draw canvas op: ${label} ×${m.length}`);
}
for (const fn of ['bakeRoads', 'bakeGrid', 'bakeSky']) {
  if (!html.includes(fn)) fail.push(`C4 static-layer bake missing: ${fn}()`);
}

/* ── C2: boots offline from file:// ─────────────────────────────────────── */
class NoNet extends ResourceLoader {
  fetch(url) { fail.push(`C2 runtime network fetch attempted: ${url}`); return null; }
}
const frames = [];
const errs = [];
function stub() {
  const st = {}; const g = { addColorStop() {} };
  return new Proxy(st, {
    get(t, p) {
      if (p === 'canvas') return { width: 800, height: 600 };
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => g;
      if (typeof p === 'symbol') return undefined;
      if (p in st && typeof st[p] !== 'function') return st[p];
      return () => {};
    },
    set(t, p, v) { st[p] = v; return true; }
  });
}
const dom = new JSDOM(html, {
  url: 'file:///game/index.html', pretendToBeVisual: true, runScripts: 'dangerously',
  resources: new NoNet(),
  beforeParse(w) {
    w.HTMLCanvasElement.prototype.getContext = () => stub();
    w.requestAnimationFrame = (cb) => { frames.push(cb); return frames.length; };
    w.cancelAnimationFrame = () => {};
    w.fetch = () => { throw new Error('fetch used'); };
    w.XMLHttpRequest = function () { throw new Error('XHR used'); };
    w.WebSocket = function () { throw new Error('WebSocket used'); };
    w.Element.prototype.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0 });
  }
});
let t = 0;
for (let i = 0; i < 120; i++) { const cb = frames.shift(); if (!cb) break; try { cb(t += 16.7); } catch (e) { errs.push(e); } }
if (errs.length) fail.push(`C2 offline boot threw: ${String(errs[0]).slice(0, 120)}`);
const hand = dom.window.document.querySelectorAll('#cards .card').length;
if (hand !== 5) fail.push(`C2 offline boot did not deal a 5-card hand (got ${hand})`);

/* ── report ─────────────────────────────────────────────────────────────── */
if (fail.length) {
  console.error('CONSTRAINT CHECK FAILED:\n');
  [...new Set(fail)].forEach((f) => console.error('  · ' + f));
  process.exit(1);
}
console.log('CONSTRAINTS PASSED ✓');
console.log('  C1 single self-contained HTML, zero external/network references');
console.log('  C2 boots and plays from file:// with network APIs disabled');
console.log('  C3 no raster images (repo, data URIs, or runtime loads)');
console.log('  C4 no shadowBlur/filter per-draw traps; static layers baked');
note.forEach((n) => console.log('  · ' + n));
