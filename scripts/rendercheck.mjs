/* Render smoke check for the BUILT index.html.

   The regular smoke test stubs the 2D context with a permissive Proxy, so a
   malformed draw call (bad gradient, NaN coordinate, missing save/restore)
   passes silently. This harness instead uses a *recording* context that:

     - asserts every drawing call receives finite numbers,
     - asserts save()/restore() stay balanced across a frame,
     - asserts gradient color stops are well-formed,
     - drives the game through many states (build phase, live waves, capture
       doctrine, pause, surge, low core, modals) and renders hundreds of frames.

   Run with: npm run rendercheck   (after npm run build)
*/
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const problems = [];
let depth = 0;
let maxDepth = 0;
let calls = 0;

/* Methods whose arguments must all be finite numbers. */
const NUMERIC = new Set([
  'fillRect', 'strokeRect', 'clearRect', 'moveTo', 'lineTo', 'arc', 'ellipse',
  'translate', 'rotate', 'scale', 'quadraticCurveTo', 'bezierCurveTo', 'rect',
  'createLinearGradient', 'createRadialGradient', 'arcTo'
]);

function checkNums(name, args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (typeof a === 'number' && !Number.isFinite(a)) {
      problems.push(`${name}() arg[${i}] is ${a}`);
      return;
    }
  }
}

function makeGradient(kind, args) {
  checkNums(kind, args);
  return {
    addColorStop(off, col) {
      if (!Number.isFinite(off) || off < 0 || off > 1) {
        problems.push(`${kind} addColorStop offset ${off}`);
      }
      if (typeof col !== 'string' || !col || col.indexOf('NaN') >= 0 || col === 'rgba(,,,)') {
        problems.push(`${kind} addColorStop color "${col}"`);
      }
    }
  };
}

function stubContext() {
  const state = {};
  const handler = {
    get(t, prop) {
      if (prop === 'canvas') return { width: 800, height: 600 };
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'createLinearGradient') return (...a) => makeGradient('createLinearGradient', a);
      if (prop === 'createRadialGradient') return (...a) => makeGradient('createRadialGradient', a);
      if (prop === 'createPattern') return () => null;
      if (typeof prop === 'symbol') return undefined;
      if (prop in state && typeof state[prop] !== 'function') return state[prop];
      return (...args) => {
        calls++;
        if (prop === 'save') { depth++; if (depth > maxDepth) maxDepth = depth; }
        else if (prop === 'restore') {
          depth--;
          if (depth < 0) problems.push('restore() without matching save()');
        } else if (NUMERIC.has(prop)) checkNums(prop, args);
        else if (prop === 'setLineDash') {
          if (!Array.isArray(args[0])) problems.push('setLineDash needs an array');
        }
        return undefined;
      };
    },
    set(t, prop, value) {
      /* style assignments must never be undefined/NaN-bearing strings */
      if ((prop === 'fillStyle' || prop === 'strokeStyle')) {
        if (value === undefined || value === null) {
          problems.push(`${prop} set to ${value}`);
        } else if (typeof value === 'string' && (value.indexOf('NaN') >= 0 || value.indexOf('undefined') >= 0)) {
          problems.push(`${prop} = "${value}"`);
        }
      }
      if ((prop === 'lineWidth' || prop === 'globalAlpha') && !Number.isFinite(value)) {
        problems.push(`${prop} = ${value}`);
      }
      if (prop === 'globalAlpha' && Number.isFinite(value) && (value < 0 || value > 1)) {
        problems.push(`globalAlpha out of range: ${value}`);
      }
      state[prop] = value;
      return true;
    }
  };
  return new Proxy(state, handler);
}

const frames = [];
const errors = [];

const dom = new JSDOM(html, {
  url: 'http://localhost/',
  pretendToBeVisual: true,
  runScripts: 'dangerously',
  beforeParse(window) {
    window.HTMLCanvasElement.prototype.getContext = function () { return stubContext(); };
    window.requestAnimationFrame = (cb) => { frames.push(cb); return frames.length; };
    window.cancelAnimationFrame = () => {};
    window.Element.prototype.getBoundingClientRect = function () {
      return { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0 };
    };
  }
});

const { window } = dom;
const doc = window.document;
const $ = (id) => doc.getElementById(id);

let now = performance.now();
function tick(n) {
  for (let k = 0; k < n; k++) {
    const cb = frames.shift();
    if (!cb) break;
    const before = depth;
    try { cb(now += 1000 / 60); } catch (e) { errors.push(e); }
    if (depth !== before) {
      problems.push(`unbalanced save/restore in a frame (depth ${before} -> ${depth})`);
      depth = before;
    }
  }
}

function click(el) {
  if (!el) return;
  el.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
}
function pointerAt(x, y, type) {
  $('cv').dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
}
function handCard(name) {
  return [...doc.querySelectorAll('#cards .card')].find((c) => c.textContent.indexOf(name) >= 0) || null;
}
function deployAt(name, x, y) {
  const c = handCard(name);
  if (!c) return false;
  click(c);
  pointerAt(x, y, 'pointerdown');
  pointerAt(x, y, 'pointerup');
  return true;
}

/* --- build phase idles --- */
tick(90);

/* --- deploy a spread of unit types so every tower renderer runs --- */
deployAt('NEEDLE BOARD', 380, 300);
deployAt('FOUNDRY BOARD', 250, 200);
deployAt('ARC COIL BOARD', 500, 260);
deployAt('HARVESTER BOARD', 300, 380);
deployAt('AEGIS BOARD', 560, 380);
deployAt('RAIL BOARD', 620, 220);
tick(60);

/* --- pad ghost preview: hold a board and hover the field --- */
const board = handCard('BOARD');
if (board) {
  click(board);
  pointerAt(430, 320, 'pointermove');
  tick(30);
  pointerAt(431, 321, 'pointerup');
}

/* --- select a unit so the range ring, label and target badges draw --- */
pointerAt(380, 300, 'pointerdown');
pointerAt(380, 300, 'pointerup');
tick(30);

/* --- capture doctrine exercises beams + capture zone overlays --- */
click($('modeBtn'));
tick(20);

/* --- surge overlay --- */
click($('abilSurge'));
tick(40);

/* --- paused overlay --- */
click($('pauseBtn'));
tick(20);
click($('pauseBtn'));

/* --- run many waves at high speed: enemies, shots, particles, deaths, leaks --- */
click($('spdUp'));
click($('spdUp'));
click($('startBtn'));
for (let w = 0; w < 40; w++) {
  tick(120);
  if ($('phaseBig').textContent === 'FABRICATION') click($('startBtn'));
}

/* --- world map render --- */
click($('mapBtn'));
tick(6);

/* --- report --- */
if (errors.length) {
  console.error('EXCEPTIONS DURING RENDER:');
  errors.slice(0, 5).forEach((e) => console.error('  ' + (e && e.stack ? e.stack.split('\n')[0] : e)));
  process.exit(1);
}
const uniq = [...new Set(problems)];
if (uniq.length) {
  console.error(`RENDER CHECK FAILED — ${uniq.length} distinct issue(s):`);
  uniq.slice(0, 20).forEach((p) => console.error('  · ' + p));
  process.exit(1);
}

console.log(`RENDER CHECK PASSED ✓ (${calls.toLocaleString()} canvas ops, max save-depth ${maxDepth}, wave ${$('vWave').textContent}, no NaN/unbalanced state)`);
process.exit(0);
