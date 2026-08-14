/* Headless smoke test for the BUILT index.html:
   - boots the game inside jsdom with a canvas stub,
   - asserts the HUD initialized,
   - launches a wave, runs simulated frames, and asserts no exceptions.

   Run with: npm test   (after npm run build)
*/
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function stubContext() {
  const grad = { addColorStop() {} };
  const target = {};
  return new Proxy(target, {
    get(t, prop) {
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => grad;
      if (prop === 'canvas') return {};
      if (typeof prop === 'symbol') return undefined;
      const existing = t[prop];
      return existing !== undefined ? existing : () => {};
    },
    set(t, prop, value) { t[prop] = value; return true; }
  });
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
    /* give every element a sane layout rect so pointer math works */
    window.Element.prototype.getBoundingClientRect = function () {
      return { left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0 };
    };
  }
});

const { window } = dom;
const doc = window.document;
const $ = (id) => doc.getElementById(id);

/* Virtual frame clock: advance ~16.7ms per frame so the sim actually steps. */
let now = performance.now();
function tick(n) {
  for (let k = 0; k < n; k++) {
    const cb = frames.shift();
    if (!cb) break;
    try { cb(now += 1000 / 60); } catch (e) { errors.push(e); }
  }
}

function click(el) {
  el.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
}

function pointerAt(x, y, type) {
  const cv = $('cv');
  cv.dispatchEvent(new window.MouseEvent(type, {
    bubbles: true, cancelable: true, clientX: x, clientY: y
  }));
}

function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT FAILED: ' + msg);
}

/* --- boot --- */
assert(doc.querySelectorAll('.card').length === 6, '6 blueprint cards rendered');
assert($('vFe').textContent === '120', 'initial iron = 120 (got ' + $('vFe').textContent + ')');
assert($('vCore').textContent === '20', 'initial core = 20');
assert($('phaseBig').textContent === 'FABRICATION', 'starts in fabrication phase');
assert(!!$('abilSurge') && !!$('abilWeld'), 'field ability bar present');
assert($('surgeCd').textContent.indexOf('READY') >= 0, 'surge starts ready');

/* --- simulate a few idle frames --- */
tick(30);
assert(errors.length === 0, 'no errors during idle frames: ' + errors.map(String).join(' | '));

/* --- place a NEEDLE at the canvas center, upgrade, recycle --- */
pointerAt(400, 300, 'pointerdown');
pointerAt(400, 300, 'pointerup');
assert($('unitHead').textContent.indexOf('NEEDLE') >= 0, 'needle placed & selected (got ' + $('unitHead').textContent + ')');
const gridAfterPlace = $('vW').textContent;
click($('upBtn'));
assert($('unitHead').textContent.indexOf('L2') >= 0, 'needle upgraded to L2');
assert($('vW').textContent !== gridAfterPlace, 'grid usage changed after upgrade');
click($('recBtn'));
assert($('unitHead').textContent.indexOf('NO UNIT') >= 0, 'recycle deselects unit');

/* --- place an AEGIS (card 6) — slow field shown in unit panel --- */
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '6', bubbles: true }));
pointerAt(400, 300, 'pointerdown');
pointerAt(400, 300, 'pointerup');
assert($('unitHead').textContent.indexOf('AEGIS') >= 0, 'aegis placed (got ' + $('unitHead').textContent + ')');
assert($('unitStats').textContent.indexOf('slow field 30%') >= 0, 'aegis slow field stat shown');

/* --- place a RAIL (card 5) — sniper stats shown --- */
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: '5', bubbles: true }));
pointerAt(600, 150, 'pointerdown');
pointerAt(600, 150, 'pointerup');
if ($('unitHead').textContent.indexOf('RAIL') >= 0) {
  assert($('unitStats').textContent.indexOf('rng 150') >= 0 || $('unitStats').textContent.indexOf('rng 1') >= 0, 'rail long range shown: ' + $('unitStats').textContent);
}
pointerAt(800, 20, 'pointerup'); // harmless stray click

/* --- launch wave 1 --- */
click($('startBtn'));
assert($('phaseBig').textContent === 'WAVE 01', 'wave 1 active (got ' + $('phaseBig').textContent + ')');

/* --- run ~5 seconds of simulation (speed 1) --- */
tick(300);
assert(errors.length === 0, 'no errors during wave: ' + errors.map(String).join(' | '));
assert($('vWave').textContent.startsWith('1/12'), 'HUD reports wave 1 (got ' + $('vWave').textContent + ')');

/* --- toggle doctrine, pause, speed, help modal --- */
click($('modeBtn'));
assert($('modeBtn').textContent.indexOf('CAPTURE') >= 0, 'doctrine switched to CAPTURE');

/* --- surge ability: activates, drains 40 Fe, then goes on cooldown --- */
const feBefore = parseInt($('vFe').textContent, 10);
click($('abilSurge'));
assert(errors.length === 0, 'no errors during surge: ' + errors.map(String).join(' | '));
assert(parseInt($('vFe').textContent, 10) === feBefore - 40, 'surge costs 40 Fe');
assert($('surgeCd').textContent.indexOf('ACTIVE') >= 0, 'surge active after use');
click($('pauseBtn'));
tick(10);
assert(errors.length === 0, 'no errors while paused: ' + errors.map(String).join(' | '));
click($('pauseBtn'));
click($('spdUp'));
assert($('spdVal').textContent === '2×', 'speed bumped to 2×');
click($('helpBtn'));
assert($('helpModal').classList.contains('open'), 'help modal opens');
doc.querySelector('[data-close="helpModal"]').dispatchEvent(
  new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true })
);
assert(!$('helpModal').classList.contains('open'), 'help modal closes');

/* --- drain wave 1 (enemies leak with no towers) and wait for the build window --- */
let sawFabrication = false;
for (let s = 0; s < 90 && !sawFabrication; s++) {
  tick(60);
  sawFabrication = $('phaseBig').textContent === 'FABRICATION';
}
assert(errors.length === 0, 'no errors while draining wave 1: ' + errors.map(String).join(' | '));
assert(sawFabrication, 'back to fabrication between waves (got ' + $('phaseBig').textContent + ')');

console.log('SMOKE TEST PASSED ✓ (boot, wave 1, doctrine/pause/speed/modals, wave drain)');
process.exit(0);
