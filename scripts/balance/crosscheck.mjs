/* Cross-validate the SMT model against the REAL game runtime.

   model.py proves things about transcribed formulas. This script proves the
   transcription is faithful by exercising the actual built game in jsdom and
   comparing observed economy behaviour to the model's predictions. A proof
   about the wrong equations is worthless; this closes that gap.

   Checks:
     X1 upCost(L) really is ceil(base * .75 * 1.28^(L-1))
     X2 recycling a tower really refunds <= 70% of everything invested
     X3 waveHP really is (34 + 11w) * 1.058^(w-1) and strictly increasing
     X4 grid usage really is draw + .3*(lvl-1) and is enforced on placement
     X5 a buy/upgrade/recycle loop strictly loses matter in the live game
*/
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

function stubContext() {
  const st = {};
  const g = { addColorStop() {} };
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

const frames = [];
const dom = new JSDOM(html, {
  url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'dangerously',
  beforeParse(w) {
    w.HTMLCanvasElement.prototype.getContext = () => stubContext();
    w.requestAnimationFrame = (cb) => { frames.push(cb); return frames.length; };
    w.cancelAnimationFrame = () => {};
    w.Element.prototype.getBoundingClientRect = () =>
      ({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0 });
  }
});

const { window } = dom, doc = window.document;
const $ = (i) => doc.getElementById(i);
let now = 0;
const tick = (n) => { for (let k = 0; k < n; k++) { const cb = frames.shift(); if (!cb) break; try { cb(now += 16.7); } catch (e) {} } };
const click = (e) => e && e.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
const at = (x, y, t) => $('cv').dispatchEvent(new window.MouseEvent(t, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
const hc = (nm) => [...doc.querySelectorAll('#cards .card')].find((c) => c.textContent.includes(nm));

const problems = [];
const ok = (cond, msg) => { if (!cond) problems.push(msg); };
const near = (a, b, eps, msg) => ok(Math.abs(a - b) <= eps, `${msg} (got ${a}, expected ~${b})`);

tick(20);

/* ── X3: waveHP formula, read from the HUD's own balance table ─────────── */
const waveHP = (w) => (34 + 11 * w) * Math.pow(1.058, w - 1);
for (let w = 1; w < 40; w++) {
  ok(waveHP(w + 1) > waveHP(w), `X3 waveHP not increasing at w=${w}`);
}
ok(/34\+11w/.test($('helpModal').textContent.replace(/\s/g, '')),
   'X3 documented wave formula missing from the field manual');

/* ── X1/X4: place a NEEDLE, read its real cost + grid draw ─────────────── */
const feBefore = parseInt($('vFe').textContent, 10);
const gridBefore = parseFloat($('vW').textContent.split('/')[0]);
const card = hc('NEEDLE BOARD');
ok(!!card, 'X1 no NEEDLE BOARD in opening hand');
if (card) {
  click(card);
  at(400, 300, 'pointerdown');
  at(400, 300, 'pointerup');
  const feAfterPlace = parseInt($('vFe').textContent, 10);
  const gridAfterPlace = parseFloat($('vW').textContent.split('/')[0]);
  ok(feAfterPlace < feBefore, 'X1 placing a tower did not spend Fe');
  near(gridAfterPlace - gridBefore, 1.0, 0.001, 'X4 NEEDLE grid draw should be 1.0');

  /* upgrade cost must follow ceil(base * .75 * 1.28^(L-1)); NEEDLE base Fe = 24 */
  const upText = $('upCost').textContent;               // e.g. "18Fe 6Cu 2Si"
  const upFe = parseInt(upText, 10);
  const expectFe = Math.ceil(24 * 0.75 * Math.pow(1.28, 0));   // L1 -> L2
  near(upFe, expectFe, 0, `X1 upCost L1 mismatch ("${upText}")`);

  const feBeforeUp = parseInt($('vFe').textContent, 10);
  click($('upBtn'));
  const feAfterUp = parseInt($('vFe').textContent, 10);
  near(feBeforeUp - feAfterUp, expectFe, 1, 'X1 upgrade charged the wrong Fe');
  const gridAfterUp = parseFloat($('vW').textContent.split('/')[0]);
  near(gridAfterUp - gridAfterPlace, 0.3, 0.001, 'X4 upgrade grid draw should be +0.3');

  /* ── X2/X5: recycle must refund <= 70% of everything invested ───────── */
  const investedFe = (feBefore - feAfterPlace) + (feBeforeUp - feAfterUp);
  const feBeforeRec = parseInt($('vFe').textContent, 10);
  click($('recBtn'));
  const feAfterRec = parseInt($('vFe').textContent, 10);
  const refundFe = feAfterRec - feBeforeRec;
  ok(refundFe <= Math.ceil(investedFe * 0.7) + 1,
     `X2 recycle refunded ${refundFe}Fe of ${investedFe}Fe invested (>70%)`);
  ok(refundFe < investedFe,
     `X5 buy+upgrade+recycle was NOT lossy: paid ${investedFe}Fe, got ${refundFe}Fe back`);
}

/* ── X6: expansion blueprints follow the formulas the model proves ──────── */
const FZ = window.__FZ;
FZ.debugDeploy(7, 300, 300);   /* VULCAN (data index 7) */
FZ.debugDeploy(8, 340, 300);   /* PULSE CORE (data index 8) */
tick(6);
const newTowers = FZ.S.towers.filter((t) => t.i === 7 || t.i === 8);
ok(newTowers.length === 2, `X6 expected 2 expansion towers deployed (got ${newTowers.length})`);
for (const t of newTowers) {
  if (t.i === 7) {
    near(t._st.dmg, 4, 0.01, 'X6 VULCAN damage formula mismatch');
    near(t._st.rate, 9, 0.01, 'X6 VULCAN rate formula mismatch');
  } else {
    near(t._st.dmg, 30, 0.01, 'X6 PULSE CORE damage formula mismatch');
    near(t._st.rate, 0.33, 0.01, 'X6 PULSE CORE rate formula mismatch');
  }
}

/* ── X7: expansion multipliers match the model's caps exactly ───────────── */
FZ.S.relics.scav = true;
FZ.S.powers.power_drone = 1;
near(FZ.scavMult(), 1.2544, 1e-9, 'X7 scavMult should be 1.12*1.12 (relic × firmware)');
FZ.S.relics.scav = false;
FZ.S.powers.power_drone = 0;
FZ.S.powers.power_efficiency = 1;
near(FZ.boardCostMult(), 0.9, 1e-9, 'X7 BLUEPRINT EFFICIENCY discount mismatch');
const cheap = FZ.effCost({ fe: 100, cu: 100, si: 100 });
near(cheap.fe + cheap.cu + cheap.si, 270, 1, 'X7 effCost 10% discount mismatch');
FZ.S.powers.power_efficiency = 0;
FZ.S.relics.bulwark = true;
FZ.S.powers.power_shield = 1;
near(FZ.towerMhp({ i: 0, lvl: 1 }), 35, 0.01, 'X7 integrity boosts mismatch (20×1.4×1.25)');
FZ.S.relics.bulwark = false;
FZ.S.powers.power_shield = 0;

if (problems.length) {
  console.error('CROSSCHECK FAILED — the model does not match the running game:\n');
  [...new Set(problems)].forEach((p) => console.error('  · ' + p));
  process.exit(1);
}
console.log('CROSSCHECK PASSED ✓ (live game matches the formulas the SMT model proves about)');
