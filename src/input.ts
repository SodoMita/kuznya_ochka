/* All user input: pointer on the battlefield, deck buttons, hotkeys. */
import { S } from './state';
import { cv, wcv } from './view';
import { SPEEDS, TGTS, RKEYS, CARDS } from './data';
import { $, dailySeed } from './utils';
import { canPlace, placeTower, installModule, undoPlace, sellAllOf, upgradeAllOf, towerCard } from './towers';
import { launchWave } from './enemies';
import { hud, renderUnit, toast, award, playHandCard, openDeckModal, openMedals, openStats, openSettings, applySettingsBody, statsTab } from './hud';
import { chooseDraft } from './draft';
import { defOf, selBoard, isTargetedSkill, castRecalibrate, discardSelCard, recycleSelCard, freeMulligan } from './deck';
import { canAfford, spend, usedGrid, gainRes, upCost, gridCap } from './economy';
import { burst, float } from './fx';
import { openMap, pickWorld, drawWorld } from './worldmap';
import { openModal, closeModal, closeTopModal, askConfirm, confirmYes, confirmNo } from './modals';
import { Snd } from './audio';
import { startNewRun } from './reset';
import { saveSettings, clearSave } from './persist';
import type { Tower, GhostState, Enemy } from './types';

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

function enemyNear(p: { x: number; y: number }, r: number): Enemy | null {
  var best: Enemy | null = null, bd = r;
  for (var i = 0; i < S.enemies.length; i++) {
    var e = S.enemies[i];
    if (e.dead) continue;
    var d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < bd) { bd = d; best = e; }
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
  /* no card selected + no tower → tapping a hostile pins its readout */
  if (S.selCard == null) {
    var enHit = enemyNear(p, 14);
    if (enHit) {
      S.inspect = enHit === S.inspect ? null : enHit;
      S.inspectT = 2.5;
      Snd.play('ui');
      return;
    }
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

wcv.addEventListener('pointermove', function (ev) {
  var r = wcv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
  var hover = -1, bd = 14;
  for (var i = 0; i < S.worldNodes.length; i++) {
    var n = S.worldNodes[i];
    var d = Math.hypot(x - n.x * r.width, y - n.y * r.height);
    if (d < bd) { bd = d; hover = i; }
  }
  if (hover >= 0) drawWorld(hover);
});

wcv.addEventListener('pointerleave', function () {
  drawWorld(-1);
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
  hud(true);
});

$('mulliganBtn').addEventListener('pointerdown', function () {
  Snd.init();
  toast(freeMulligan());
  hud(true);
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
  var doRecycle = function () {
    gainRes({ fe: t.inv.fe * .7, cu: t.inv.cu * .7, si: t.inv.si * .7 }, t.x, t.y);
    S.towers = S.towers.filter(function (x) { return x !== t; });
    S.beams = S.beams.filter(function (b) { return b.tw !== t; });
    S.undoStack = S.undoStack.filter(function (u) { return u.t !== t; });
    S.selTower = null;
    burst(t.x, t.y, '#8fa0a6', 10);
    Snd.play('boom', true);
    toast('70% MATTER RECOVERED');
    hud(true);
  };
  if (S.settings.confirmRecycle) {
    askConfirm('RECYCLE ' + towerCard(t).name + ' L' + t.lvl + '?', 'The unit is dismantled for 70% of invested matter. Modules and upgrades are lost.', 'RECYCLE', true, doRecycle);
  } else {
    doRecycle();
  }
});

$('sellAllBtn').addEventListener('pointerdown', function () {
  Snd.init();
  const t = S.selTower;
  if (!t || S.towers.indexOf(t) < 0) { Snd.play('error'); return; }
  var n = S.towers.filter(function (x) { return x.i === t!.i; }).length;
  if (n <= 1) { toast('ONLY ONE DEPLOYED — USE RECYCLE'); Snd.play('error'); return; }
  var i = t.i;
  askConfirm('SCRAP ' + n + '× ' + CARDS[i].name + '?', 'All deployed copies are dismantled for 70% of invested matter. Units, modules and upgrades are lost.', 'SCRAP ALL', true, function () {
    toast(sellAllOf(i));
    hud(true);
  });
});

$('upAllBtn').addEventListener('pointerdown', function () {
  Snd.init();
  const t = S.selTower;
  if (!t || S.towers.indexOf(t) < 0) { Snd.play('error'); return; }
  toast(upgradeAllOf(t.i));
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
  if (S.selCard == null) { toast('SELECT A CARD FIRST'); Snd.play('error'); return; }
  var doTear = function () {
    var msg = recycleSelCard();
    if (!msg) { toast('SELECT A CARD FIRST'); Snd.play('error'); return; }
    toast(msg);
    Snd.play('upgrade');
    hud(true);
  };
  if (S.settings.confirmRecycle) {
    var ci = S.hand[S.selCard];
    var nm = ci ? defOf(ci).name : 'CARD';
    askConfirm('TEAR ' + nm + ' FROM THE DECK?', 'Permanent removal — the card is gone for the whole run. You get a 50% matter refund.', 'TEAR IT OUT', true, doTear);
  } else {
    doTear();
  }
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

$('medBtn').addEventListener('pointerdown', function () {
  Snd.init();
  openMedals();
});

$('statBtn').addEventListener('pointerdown', function () {
  Snd.init();
  openStats();
});

$('setBtn').addEventListener('pointerdown', function () {
  Snd.init();
  openSettings();
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
  /* WELD also splashes repair onto every deployed unit */
  var weldedUnits = 0;
  S.towers.forEach(function (t) {
    if (t.hp < t.mhp) { t.hp = Math.min(t.mhp, t.hp + 4); weldedUnits++; }
  });
  S.screenFlash = { col: '#3edcb0', a: 0.06 };
  var cp = S.nodes[S.coreIdx];
  float(cp.px, cp.py - 16, '+3 CORE' + (weldedUnits ? ' · +4 INT ×' + weldedUnits : ''), '#3ec9b0');
  S.rings.push({ x: cp.x, y: cp.py, r: 4, max: 36, col: '#3ec9b0' });
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

/* settings modal controls */
function bindSetting(elId: string, fn: (v: string) => void): void {
  var el = $(elId);
  if (!el) return;
  el.addEventListener('input', function () {
    fn((el as HTMLInputElement).value);
    saveSettings();
    applySettingsBody();
    hud(true);
  });
  el.addEventListener('change', function () {
    fn((el as HTMLInputElement).value);
    saveSettings();
    applySettingsBody();
    hud(true);
  });
}
bindSetting('setVol', function (v) {
  S.settings.vol = Math.max(0, Math.min(1, +v / 10));
  if (Snd.g) Snd.g.gain.value = .14 * S.settings.vol;
});
bindSetting('setShake', function (v) { S.settings.shake = v === 'on'; });
bindSetting('setPart', function (v) { S.settings.particles = Math.max(0, Math.min(2, +v)); });
bindSetting('setScan', function (v) { S.settings.scanlines = v === 'on'; });
bindSetting('setAuto', function (v) { S.settings.autopause = v === 'on'; });
bindSetting('setScale', function (v) { S.settings.uiScale = +v; });
bindSetting('setConfirm', function (v) { S.settings.confirmRecycle = v === 'on'; });
bindSetting('setCB', function (v) { S.settings.colorblind = v === 'on'; });
bindSetting('setHC', function (v) { S.settings.contrast = v === 'on'; });
bindSetting('setDmg', function (v) { S.settings.dmgNumbers = v === 'on'; });
bindSetting('setSort', function (v) { S.settings.handSort = v === 'on'; });

$('setDaily').addEventListener('pointerdown', function () {
  Snd.init();
  askConfirm('START DAILY SEED?', 'Abandon the current run and deploy on the deterministic daily route. Deck, ranks and relics reset.', 'DAILY RUN', false, function () {
    closeModal('settingsModal');
    startNewRun(dailySeed());
  });
});

$('setReroll').addEventListener('pointerdown', function () {
  Snd.init();
  askConfirm('ABANDON CURRENT RUN?', 'A fresh route is generated with a new random seed. All progress is lost.', 'REROLL SEED', true, function () {
    closeModal('settingsModal');
    startNewRun(((Date.now() ^ 0x5f3a9) >>> 0));
  });
});

$('confirmOk').addEventListener('pointerdown', function () {
  Snd.init();
  confirmYes();
});
$('confirmNo').addEventListener('pointerdown', function () {
  Snd.init();
  confirmNo();
});

Array.prototype.forEach.call($('statsTabs').children, function (b: Element) {
  b.addEventListener('pointerdown', function () {
    Snd.init();
    statsTab((b as HTMLElement).dataset.tab!);
  });
});

$('retreatBtn').addEventListener('pointerdown', function () {
  Snd.init();
  askConfirm('RETREAT TO THE ROUTE NETWORK?', 'Sector progress is lost (waves replay from 1) — your circuit deck, ranks, relics and cleared routes are kept.', 'RETREAT', true, function () {
    closeModal('mapModal');
    openMap();
    toast('RETREATED — SECTOR PROGRESS DISCARDED');
  });
});

/* ESC + keyboard map: draft modals get their own handlers in draft.ts */
function typingFocus(): boolean {
  var el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  var tag = (el.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select';
}

addEventListener('keydown', function (ev) {
  Snd.init();
  if (ev.key === 'Escape') {
    if (S.modalOpen) { closeTopModal(); return; }
    S.selCard = null;
    S.selTower = null;
    hud(true);
    return;
  }
  if (S.modalOpen) {
    /* draft modal: 1-4 picks, ESC handled above */
    if (ev.key >= '1' && ev.key <= '4' && $('draftModal').classList.contains('open')) {
      chooseDraft(+ev.key - 1);
    }
    return;
  }
  if (typingFocus()) return;
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
  else if (ev.key === 'z' || ev.key === 'Z') { toast(undoPlace()); hud(true); }
  else if (ev.key === 'c' || ev.key === 'C') {
    var tc = S.selTower;
    if (tc && S.towers.indexOf(tc) >= 0) {
      var n = 0;
      S.towers.forEach(function (o) {
        if (o !== tc && CARDS[o.i].id === CARDS[tc!.i].id) { o.tgt = tc!.tgt; n++; }
      });
      toast(n ? 'DOCTRINE COPIED TO ' + n + ' ' + CARDS[tc.i].name + ' UNIT' + (n > 1 ? 'S' : '') : 'NO SISTER UNITS TO COPY TO');
      Snd.play('ui');
      hud(true);
    }
  }
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
  else if (ev.key === 'r' || ev.key === 'R') {
    askConfirm('RETREAT TO THE ROUTE NETWORK?', 'Sector progress is lost — deck, ranks, relics and cleared routes are kept.', 'RETREAT', true, function () {
      openMap();
    });
  }
});
