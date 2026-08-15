/* All user input: pointer on the battlefield, deck buttons, hotkeys. */
import { S } from './state';
import { cv, wcv } from './view';
import { SPEEDS, TGTS, RKEYS } from './data';
import { $ } from './utils';
import { canPlace, placeTower, installModule } from './towers';
import { launchWave } from './enemies';
import { hud, renderUnit, toast, award, playHandCard, openDeckModal } from './hud';
import { defOf, selBoard, isTargetedSkill, castRecalibrate, discardSelCard, recycleSelCard } from './deck';
import { canAfford, spend, usedGrid, gainRes, upCost, gridCap } from './economy';
import { burst, float } from './fx';
import { openMap, pickWorld } from './worldmap';
import { openModal } from './modals';
import { Snd } from './audio';
import type { Tower, GhostState } from './types';

function canvasPos(ev: PointerEvent | TouchEvent): { x: number; y: number } {
  var r = cv.getBoundingClientRect();
  var p = 'touches' in ev ? ev.touches[0] : ev;
  return { x: p.clientX - r.left, y: p.clientY - r.top };
}

function towerNear(p: { x: number; y: number }, r: number): Tower | null {
  var best: Tower | null = null, bd = r;
  for (var i = 0; i < S.towers.length; i++) {
    var t = S.towers[i], d = Math.hypot(t.x - p.x, t.y - p.y);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}

function nearestValid(x: number, y: number): { x: number; y: number } | null {
  if (canPlace(x, y)) return { x: x, y: y };
  for (var r = 10; r <= 72; r += 8) {
    var steps = Math.max(10, Math.round(r * .8));
    for (var k = 0; k < steps; k++) {
      var a = k / steps * 6.2831, nx = x + Math.cos(a) * r, ny = y + Math.sin(a) * r;
      if (canPlace(nx, ny)) return { x: nx, y: ny };
    }
  }
  return null;
}

function updGhost(p: { x: number; y: number }): GhostState | null {
  if (!p) return null;
  if (!selBoard()) return { x: p.x, y: p.y, sx: null, sy: null };
  var sn = nearestValid(p.x, p.y);
  return { x: p.x, y: p.y, sx: sn ? sn.x : null, sy: sn ? sn.y : null };
}

var placing = false;

cv.addEventListener('pointerdown', function (ev) {
  ev.preventDefault();
  Snd.init();
  var p = canvasPos(ev), hit = towerNear(p, 30);
  if (hit && S.selCard != null) {
    var sd = defOf(S.hand[S.selCard]);
    /* a selected MODULE card bolts onto the tapped unit */
    if (sd.kind === 'module') {
      installModule(hit);
      S.ghost = updGhost(p);
      return;
    }
    /* a targeted skill (RECALIBRATE) resolves on the tapped unit */
    if (isTargetedSkill(sd)) {
      var msg = castRecalibrate(hit);
      if (msg === 'SELECT RECALIBRATE FIRST' || msg === 'INSUFFICIENT MATTER') Snd.play('error');
      toast(msg);
      hud(true);
      S.ghost = updGhost(p);
      return;
    }
  }
  if (hit) {
    if (S.selTower === hit) { S.selTower = null; }               /* tap again to release */
    else { S.selTower = hit; S.selCard = null; hit.selF = 1; Snd.play('ui'); }
    hud(true);
    placing = false;
    S.ghost = updGhost(p);
    return;
  }
  placing = true;
  if (!selBoard() && !towerNear(p, 48)) { S.selTower = null; hud(true); } /* stray taps near a unit never deselect */
  S.ghost = updGhost(p);
});

cv.addEventListener('pointermove', function (ev) {
  S.ghost = updGhost(canvasPos(ev));
});

cv.addEventListener('pointerleave', function () {
  S.ghost = null;
  placing = false;
});

cv.addEventListener('pointerup', function (ev) {
  ev.preventDefault();
  var wasPlacing = placing;
  placing = false;
  var p = canvasPos(ev), hit = towerNear(p, 18);
  if (hit) {
    if (S.selTower !== hit) { S.selTower = hit; hit.selF = 1; Snd.play('ui'); }
    S.selCard = null;
    hud(true);
    S.ghost = updGhost(p);
    return;
  }
  if (wasPlacing && selBoard()) {
    var g = updGhost(p);
    S.ghost = g;
    if (g && g.sx != null) placeTower(g.sx!, g.sy!);
    else { toast('NO VALID FOUNDATION NEARBY'); Snd.play('error'); }
  }
});

cv.addEventListener('pointercancel', function () {
  placing = false;
  S.ghost = null;
});

cv.addEventListener('contextmenu', function (ev) {
  ev.preventDefault();
  if (S.selCard != null || S.selTower) {
    S.selCard = null;
    S.selTower = null;
    S.ghost = null;
    hud(true);
  }
});

wcv.addEventListener('pointerdown', function (ev) {
  Snd.init();
  pickWorld(ev);
});

$('startBtn').addEventListener('pointerdown', function () {
  Snd.init();
  launchWave();
});

$('modeBtn').addEventListener('pointerdown', function () {
  Snd.init();
  S.mode = S.mode === 'loot' ? 'capture' : 'loot';
  Snd.play('ui');
  toast('DOCTRINE: ' + S.mode.toUpperCase() +
    (S.mode === 'capture' ? ' — harvesters beam targets under 30%, allies hold fire' : ' — harvesters fire for salvage'));
  hud(true);
});

$('pauseBtn').addEventListener('pointerdown', function () {
  Snd.init();
  S.paused = !S.paused;
  Snd.play('ui');
});

$('upBtn').addEventListener('pointerdown', function () {
  Snd.init();
  const t = S.selTower;
  if (!t || S.towers.indexOf(t) < 0) { Snd.play('error'); return; }
  var uc = upCost(t);
  if (!canAfford(uc)) { toast('INSUFFICIENT MATTER'); Snd.play('error'); return; }
  if (usedGrid() + .3 > gridCap()) { toast('GRID CAPACITY EXCEEDED'); Snd.play('error'); return; }
  spend(uc);
  RKEYS.forEach(function (k) { t.inv[k] += uc[k]; });
  t.lvl++;
  if (t.lvl >= 10) award('calib');
  burst(t.x, t.y, '#ffd84a', 10);
  S.screenFlash = { col: '#ffd84a', a: 0.04 };
  Snd.play('upgrade');
  hud(true);
});

$('recBtn').addEventListener('pointerdown', function () {
  Snd.init();
  const t = S.selTower;
  if (!t || S.towers.indexOf(t) < 0) return;
  gainRes({ fe: t.inv.fe * .7, cu: t.inv.cu * .7, si: t.inv.si * .7 }, t.x, t.y);
  S.towers = S.towers.filter(function (x) { return x !== t; });
  S.beams = S.beams.filter(function (b) { return b.tw !== t; });
  S.selTower = null;
  burst(t.x, t.y, '#8fa0a6', 10);
  Snd.play('boom', true);
  toast('70% MATTER RECOVERED');
  hud(true);
});

$('modBtn').addEventListener('pointerdown', function () {
  Snd.init();
  const t = S.selTower;
  if (!t || S.towers.indexOf(t) < 0) { Snd.play('error'); return; }
  installModule(t);
});

$('recalBtn').addEventListener('pointerdown', function () {
  Snd.init();
  const t = S.selTower;
  if (!t || S.towers.indexOf(t) < 0) { Snd.play('error'); return; }
  var msg = castRecalibrate(t);
  if (msg === 'SELECT RECALIBRATE FIRST' || msg === 'INSUFFICIENT MATTER') Snd.play('error');
  toast(msg);
  hud(true);
});

/* hand-card management: DISCARD / RECYCLE the selected card */
$('discardCard').addEventListener('pointerdown', function () {
  Snd.init();
  var msg = discardSelCard();
  if (!msg) { toast('SELECT A CARD FIRST'); Snd.play('error'); return; }
  toast(msg);
  Snd.play('ui');
  hud(true);
});

$('recycleCard').addEventListener('pointerdown', function () {
  Snd.init();
  var msg = recycleSelCard();
  if (!msg) { toast('SELECT A CARD FIRST'); Snd.play('error'); return; }
  toast(msg);
  Snd.play('upgrade');
  hud(true);
});

Array.prototype.forEach.call($('tgtRow').children, function (b: Element) {
  b.addEventListener('pointerdown', function (ev) {
    ev.stopPropagation();
    Snd.init();
    const t = S.selTower;
    if (!t || S.towers.indexOf(t) < 0) { Snd.play('error'); return; }
    t.tgt = (b as HTMLElement).dataset.tgt!;
    Snd.play('ui');
    renderUnit();
  });
});

function setSpeed(v: number): void {
  S.speed = v;
  Snd.play('ui');
  hud(true);
}

$('spdUp').addEventListener('pointerdown', function () {
  Snd.init();
  var i = SPEEDS.indexOf(S.speed);
  setSpeed(SPEEDS[Math.min(SPEEDS.length - 1, i + 1)]);
});

$('spdDn').addEventListener('pointerdown', function () {
  Snd.init();
  var i = SPEEDS.indexOf(S.speed);
  setSpeed(SPEEDS[Math.max(0, i - 1)]);
});

$('spdVal').addEventListener('pointerdown', function () {
  Snd.init();
  setSpeed(S.speed === 100 ? 1 : 100);
});

$('mapBtn').addEventListener('pointerdown', function () {
  Snd.init();
  openMap();
});

$('helpBtn').addEventListener('pointerdown', function () {
  Snd.init();
  openModal('helpModal');
});

$('sndBtn').addEventListener('pointerdown', function () {
  Snd.init();
  Snd.muted = !Snd.muted;
  $('sndBtn').style.opacity = Snd.muted ? '.4' : '1';
  toast(Snd.muted ? 'AUDIO OFFLINE' : 'AUDIO ONLINE');
});

/* field abilities */
$('abilSurge').addEventListener('pointerdown', function (ev) {
  ev.stopPropagation();
  Snd.init();
  var a = S.ability.surge;
  if (S.time < a.until || S.time < a.cd) { Snd.play('error'); return; }
  if (S.res.fe < 40) { toast('SURGE NEEDS 40Fe'); Snd.play('error'); return; }
  S.res.fe -= 40;
  a.cd = S.time + 45;
  a.until = S.time + 8;
  S.stat.surges++;
  if (S.stat.surges >= 10) award('surge10');
  S.shake = Math.max(S.shake, 3);
  S.screenFlash = { col: '#ffd84a', a: 0.1 };
  var cp = S.nodes[S.coreIdx];
  S.rings.push({ x: cp.px, y: cp.py, r: 6, max: 60, col: '#ffd84a' });
  S.gridPulse = { x: cp.px, y: cp.py, col: '#ffd84a', a: 0.2, r: 10 };
  toast('OVERDRIVE ENGAGED — +50% RATE');
  Snd.play('surge');
  hud(true);
});

$('abilWeld').addEventListener('pointerdown', function (ev) {
  ev.stopPropagation();
  Snd.init();
  var a = S.ability.weld;
  if (S.time < a.cd) { Snd.play('error'); return; }
  if (S.core >= S.coreMax) { toast('CORE AT FULL INTEGRITY'); Snd.play('error'); return; }
  if (S.res.fe < 30 || S.res.cu < 15) { toast('WELD NEEDS 30Fe 15Cu'); Snd.play('error'); return; }
  S.res.fe -= 30;
  S.res.cu -= 15;
  a.cd = S.time + 60;
  S.core = Math.min(S.coreMax, S.core + 3);
  S.screenFlash = { col: '#3edcb0', a: 0.06 };
  var cp = S.nodes[S.coreIdx];
  float(cp.px, cp.py - 16, '+3 CORE', '#3edcb0');
  S.rings.push({ x: cp.px, y: cp.py, r: 4, max: 36, col: '#3edcb0' });
  Snd.play('weld');
  hud(true);
});

/* pile buttons open the circuit ledger */
['pileDraw', 'pileDisc', 'pileExh'].forEach(function (id) {
  $(id).addEventListener('pointerdown', function () {
    Snd.init();
    openDeckModal();
  });
});

addEventListener('keydown', function (ev) {
  Snd.init();
  if (ev.key >= '1' && ev.key <= '9') {
    var hi = +ev.key - 1;
    if (!S.hand[hi]) { Snd.play('error'); return; }
    var d = defOf(S.hand[hi]);
    if (S.selCard === hi && d.kind !== 'board' && d.kind !== 'module' && !isTargetedSkill(d)) {
      playHandCard(hi);            /* second press runs the subroutine */
    } else {
      S.selCard = hi;
      if (d.kind !== 'module' && !isTargetedSkill(d)) S.selTower = null;   /* keep unit for targeted cards */
      Snd.play('ui');
    }
    hud(true);
  }
  else if (ev.key === 'd' || ev.key === 'D') openDeckModal();
  else if (ev.code === 'Space') { ev.preventDefault(); launchWave(); }
  else if (ev.key === 'm' || ev.key === 'M') $('modeBtn').click();
  else if (ev.key === 'p' || ev.key === 'P') $('pauseBtn').click();
  else if (ev.key === '+' || ev.key === '=') $('spdUp').click();
  else if (ev.key === '-') $('spdDn').click();
  else if (ev.key === 'u' || ev.key === 'U') $('upBtn').click();
  else if (ev.key === 'x' || ev.key === 'X') $('recBtn').click();
  else if (ev.key === 't' || ev.key === 'T') {
    var t2 = S.selTower;
    if (t2 && S.towers.indexOf(t2) >= 0) {
      t2.tgt = TGTS[(TGTS.indexOf(t2.tgt) + 1) % TGTS.length];
      Snd.play('ui');
      renderUnit();
    }
  }
  else if (ev.key === 'e' || ev.key === 'E') {
    if (S.towers.length) {
      var ix = S.selTower ? S.towers.indexOf(S.selTower) : -1;
      S.selTower = S.towers[(ix + 1) % S.towers.length];
      S.selCard = null;
      Snd.play('ui');
      hud(true);
    }
  }
  else if (ev.key === 'Escape') {
    S.selCard = null;
    S.selTower = null;
    hud(true);
  }
});
