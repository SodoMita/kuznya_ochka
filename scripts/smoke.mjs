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

/* helper: find a hand card element whose name contains `name` */
function handCard(name) {
  const cards = [...doc.querySelectorAll('#cards .card')];
  return cards.find((c) => c.textContent.indexOf(name) >= 0) || null;
}

/* --- boot: opening hand dealt from the starter circuit deck --- */
assert(doc.querySelectorAll('#cards .card').length === 5, '5-card opening hand rendered (got ' + doc.querySelectorAll('#cards .card').length + ')');
assert(!!handCard('NEEDLE BOARD'), 'innate NEEDLE BOARD in opening hand');
assert(!!handCard('FOUNDRY BOARD'), 'innate FOUNDRY BOARD in opening hand');
assert(!!handCard('FLAMETHROWER HEAD'), 'innate FLAMETHROWER HEAD module in opening hand');
assert($('vDraw').textContent === '6', 'draw pile holds the other 6 cards (got ' + $('vDraw').textContent + ')');
assert($('vDisc').textContent === '0', 'discard pile empty at boot');
assert($('vExh').textContent === '0', 'exhaust pile empty at boot');
assert($('vFe').textContent === '120', 'initial iron = 120 (got ' + $('vFe').textContent + ')');
assert($('vCore').textContent === '20', 'initial core = 20');
assert($('phaseBig').textContent === 'FABRICATION', 'starts in fabrication phase');
assert(!!$('abilSurge') && !!$('abilWeld'), 'field ability bar present');
assert($('surgeCd').textContent.indexOf('READY') >= 0, 'surge starts ready');

/* --- simulate a few idle frames --- */
tick(30);
assert(errors.length === 0, 'no errors during idle frames: ' + errors.map(String).join(' | '));

/* --- play a NEEDLE BOARD: select the card, tap the field, board discards --- */
click(handCard('NEEDLE BOARD'));
pointerAt(400, 300, 'pointerdown');
pointerAt(400, 300, 'pointerup');
assert($('unitHead').textContent.indexOf('NEEDLE') >= 0, 'needle printed & selected (got ' + $('unitHead').textContent + ')');
assert($('vDisc').textContent === '1', 'played board went to the discard pile (got ' + $('vDisc').textContent + ')');
const gridAfterPlace = $('vW').textContent;
click($('upBtn'));
assert($('unitHead').textContent.indexOf('L2') >= 0, 'needle upgraded to L2');
assert($('vW').textContent !== gridAfterPlace, 'grid usage changed after upgrade');

/* --- install the FLAMETHROWER HEAD module onto the selected needle --- */
const flame = handCard('FLAMETHROWER HEAD');
assert(!!flame, 'flamethrower module card in hand');
const feBeforeMod = parseInt($('vFe').textContent, 10);
click(flame);                        /* select the module card (unit stays selected) */
assert($('modBtn').style.display !== 'none', 'INSTALL button appears for the selected unit');
assert($('unitMods').textContent === '', 'unit has no modules yet');
click($('modBtn'));                  /* bolt the module on */
assert($('unitMods').textContent.indexOf('FLAMETHROWER HEAD') >= 0, 'flamethrower installed (got ' + $('unitMods').textContent + ')');
assert(parseInt($('vFe').textContent, 10) === feBeforeMod - 14, 'module cost 14 Fe deducted (got ' + $('vFe').textContent + ')');
assert($('vExh').textContent === '1', 'module card exhausted after install (got ' + $('vExh').textContent + ')');
click($('recBtn'));
assert($('unitHead').textContent.indexOf('NO UNIT') >= 0, 'recycle deselects unit');

/* --- play SCRAP INFUSION if drawn: double-tap runs the subroutine --- */
const scrap = handCard('SCRAP INFUSION');
if (scrap) {
  const feBefore0 = parseInt($('vFe').textContent, 10);
  click(scrap);                       /* select */
  click(handCard('SCRAP INFUSION')); /* run */
  assert(parseInt($('vFe').textContent, 10) === feBefore0 + 26, 'scrap infusion granted +26 Fe');
}

/* --- deploy a FOUNDRY BOARD too --- */
click(handCard('FOUNDRY BOARD'));
pointerAt(600, 150, 'pointerdown');
pointerAt(600, 150, 'pointerup');
assert($('unitHead').textContent.indexOf('FOUNDRY') >= 0, 'foundry printed (got ' + $('unitHead').textContent + ')');
pointerAt(800, 20, 'pointerup'); // harmless stray click

/* --- circuit ledger modal --- */
click($('pileDraw'));
assert($('deckModal').classList.contains('open'), 'circuit ledger opens from pile bar');
doc.querySelector('[data-close="deckModal"]').dispatchEvent(
  new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true })
);
assert(!$('deckModal').classList.contains('open'), 'circuit ledger closes');

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
assert($('helpModal').textContent.indexOf('Mortar') >= 0, 'help manual documents the MORTAR blueprint');
assert($('helpModal').textContent.indexOf('REAVER') >= 0, 'help manual documents the REAVER class');
assert($('helpModal').textContent.indexOf('SOLAR FLARE') >= 0, 'help manual documents new weather events');
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

/* --- new turn: hand redrawn back to 5 cards --- */
const handAfterTurn = doc.querySelectorAll('#cards .card').length;
assert(handAfterTurn === 5, 'new turn deals a fresh 5-card hand (got ' + handAfterTurn + ')');

console.log('SMOKE TEST PASSED ✓ (boot, deck piles, board deploy, module install, subroutines, wave 1, doctrine/pause/speed/modals, turn redraw)');
process.exit(0);
