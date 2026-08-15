/* Waves: composition, spawning, kills, leaks, sector-clear rewards. */
import { S } from './state';
import { ETYPES, EVENTS } from './data';
import type { Enemy, Cost } from './types';
import { sector, gainRes, scavMult } from './economy';
import { burst, ringBurst, sparks, debris, float, bigFloat, shockwave, shake } from './fx';
import { banner, hud, award } from './hud';
import { Snd } from './audio';
import { openDraft } from './draft';
import { startTurn } from './deck';
import { showEnd } from './end';
import { shortestRoute, routePolyline, pointOnPoly } from './sectors';
import { W, H } from './view';
import { clamp, mulberry32, pad2 } from './utils';

export function waveHP(w: number): number {
  return (34 + 11 * w) * Math.pow(1.058, w - 1);
}

export function waveTag(w: number): string {
  return w % 12 === 0 ? 'ASSAULT' : w % 8 === 0 ? 'TITAN' : w % 5 === 0 ? 'RUSH' : '';
}

export function compFor(w: number): string[] {
  var r = mulberry32((S.seed * 31 + w * 101 + S.sector * 7) >>> 0);
  var types = ['scrap'], wts = [10];
  if (w >= 3) { types.push('plated'); wts.push(2.5 + w * .25); }
  if (w >= 5) { types.push('swarm'); wts.push(2 + w * .2); }
  if (w >= 9) { types.push('regen'); wts.push(2.2); }
  if (w >= 4) { types.push('gilded'); wts.push(.55 + (sector().gild || .3)); }
  if (w >= 7) { types.push('phase'); wts.push(1.1 + w * .08); }
  if (w >= 11) { types.push('carrier'); wts.push(1.1); }
  if (w >= 6) { types.push('reaver'); wts.push(.6 + w * .05 + (sector().reaver || 0)); }
  var haz = sector().haz;
  if (haz === 0 && w >= 3) wts[types.indexOf('plated')] *= 2;
  if (haz === 1 && w >= 5) wts[types.indexOf('swarm')] *= 2;
  if (haz === 2 && w >= 9) wts[types.indexOf('regen')] *= 2;
  if (haz === 3 && w >= 7) wts[types.indexOf('phase')] *= 2;
  if (haz === 4 && w >= 4) wts[types.indexOf('gilded')] *= 3;
  if (haz === 5 && w >= 11) wts[types.indexOf('carrier')] *= 2;
  if (haz === 6 && w >= 6) wts[types.indexOf('reaver')] *= 3;
  var tot = 0;
  wts.forEach(function (x) { tot += x; });
  var out: string[] = [], n = 7 + Math.floor(1.35 * w), i;
  for (i = 0; i < n; i++) {
    var roll = r() * tot, acc = 0, pick = 'scrap';
    for (var j = 0; j < types.length; j++) {
      acc += wts[j];
      if (roll <= acc) { pick = types[j]; break; }
    }
    out.push(pick);
  }
  if (w % 8 === 0) {
    var tn = 1 + Math.floor(w / 16);
    for (i = 0; i < tn; i++) out.push('titan');
  }
  if (w % 12 === 0) out.push('dread');
  return out;
}

export function spawnEnemy(type: string): void {
  var e = ETYPES[type];
  var gate = S.spawns[S.spawnIdx % S.spawns.length];
  S.spawnIdx++;
  var route = shortestRoute(gate, S.coreIdx, type === 'swarm' ? Math.random : undefined);
  var rp = routePolyline(route);
  var diag = Math.hypot(W, H);
  var spScale = clamp(rp.len / (diag * .85), .7, 1.5);
  var hp = waveHP(S.wave) * e.hp * (0.9 + mulberry32((S.time * 1000 | 0) ^ type.length ^ S.enemies.length)() * .2);
  var vet = type !== 'titan' && type !== 'dread' && Math.random() < Math.min(.25, .03 + S.wave * .008);
  if (vet) hp *= 1.6;
  S.enemies.push({
    type: type,
    vet: vet,
    d: -14,
    hp: hp,
    mhp: hp,
    sp: (26 + .5 * S.wave) * e.sp * spScale,
    armor: e.armor,
    reward: e.reward * (vet ? 1.7 : 1),
    size: e.size + (vet ? 2 : 0),
    col: e.col,
    regen: e.regen || 0,
    slow: 0,
    slowT: 0,
    frozen: false,
    flash: 0,
    burn: 0,
    burnT: 0,
    beamT: -1,
    x: rp.pts[0].x,
    y: rp.pts[0].y,
    ang: 0,
    dead: false,
    route: route,
    routePx: rp.pts,
    routeLen: rp.len
  });
}

export function launchWave(): void {
  if (S.phase !== 'build' || S.over) return;
  if (S.buildT > 4) {
    var bonus = S.buildT * (S.relics.ledger ? 1.6 : .8);
    S.res.fe += bonus;
    var core = S.nodes[S.coreIdx];
    float(core.px, core.py - 14, '+' + bonus.toFixed(0) + 'Fe EARLY CALL', '#ffd84a');
  }
  S.wave++;
  S.phase = 'wave';
  S.spawnQ = compFor(S.wave);
  S.spawnT = .4;
  S.spawnInt = Math.max(.28, .62 - S.wave * .012);
  var tag = waveTag(S.wave);
  if (tag === 'RUSH') S.spawnInt *= .5;
  var er = mulberry32((S.seed ^ (S.wave * 0x9E3779b9)) >>> 0);
  S.event = er() < .4 ? EVENTS[Math.floor(er() * EVENTS.length)] : null;
  /* wave-start visual pulse */
  var cp = S.nodes[S.coreIdx];
  shockwave(cp.px, cp.py, '#ffb83a', 50);
  shake(2);
  S.screenFlash = { col: '#ffb83a', a: 0.08 };
  S.gridPulse = { x: cp.px, y: cp.py, col: '#ffb83a', a: 0.25, r: 10 };
  banner('WAVE ' + pad2(S.wave),
    (tag ? tag + ' · ' : '') + (S.event ? S.event.name + ' · ' : '') +
    'HOSTILES INBOUND · ' + S.spawnQ.length + ' CONTACTS');
  Snd.play('wave');
  hud(true);
}

export function endWave(): void {
  S.phase = 'build';
  S.buildMax = Math.max(8, 18 - S.wave * .35);
  S.buildT = S.buildMax;
  S.event = null;
  S.gridMax += 2;
  S.stat.waves++;
  /* wave-clear visual pulse */
  var cp2 = S.nodes[S.coreIdx];
  shockwave(cp2.px, cp2.py, '#3edcb0', 40);
  S.screenFlash = { col: '#3edcb0', a: 0.05 };
  var eth = startTurn();
  if (eth) float(S.nodes[S.coreIdx].px, S.nodes[S.coreIdx].py - 26, eth + ' ETHEREAL CARD' + (eth > 1 ? 'S' : '') + ' EXHAUSTED', '#b88ce0');
  if (S.core <= 0) { S.core = 0; S.over = true; hud(true); showEnd(false); return; }
  if (S.relics.repair) S.core = Math.min(S.coreMax, S.core + 1);
  if (S.wave % 12 === 0 && !S.cleared[S.sector]) {
    S.cleared[S.sector] = true;
    gainRes({ fe: 80 + S.wave * 6, cu: 30 + S.wave * 2, si: 12 + S.wave });
    /* sector clear — big dramatic FX */
    shockwave(cp2.px, cp2.py, '#3edcb0', 80);
    ringBurst(cp2.px, cp2.py, '#3edcb0', 24, 60);
    shake(5);
    S.screenFlash = { col: '#3edcb0', a: 0.15 };
    banner('SECTOR CLEARED', 'ROUTE NETWORK EXPANDED');
    Snd.play('fanfare');
    if (Object.keys(S.cleared).length >= 3) award('sector3');
    if (Object.keys(S.cleared).length >= 12 && !S.victoryShown) {
      S.victoryShown = true;
      setTimeout(function () { showEnd(true); }, 900);
    }
  }
  if (S.wave % 2 === 0) openDraft();
  hud(true);
}

export function killEnemy(e: Enemy, captured: boolean): void {
  if (e.dead) return;
  e.dead = true;
  var mix = sector().mix, sc = scavMult(), mult = captured ? 2.5 : 1;
  var now = S.time;
  if (now - S.streak.t < 2.2) S.streak.n++;
  else S.streak.n = 1;
  S.streak.t = now;
  if (S.streak.n >= 20) award('streak20');
  if (S.streak.n >= 10 && S.streak.n % 10 === 0) {
    bigFloat(e.x, e.y - 18, 'STREAK ×' + S.streak.n, '#ffd84a');
    Snd.play('draft');
  }
  var rw = (e.reward || 1) * (1 + Math.min(S.relics.tithe ? 40 : 25, S.streak.n) * .01);
  var b: Cost = {
    fe: e.mhp * .032 * rw * mix.fe * sc * mult,
    cu: e.mhp * .011 * rw * mix.cu * sc * mult,
    si: e.mhp * .0045 * rw * mix.si * sc * mult
  };
  if (captured) {
    if (e.type === 'titan') b.si += 1 + (S.relics.shrine ? 4 : 0);
    S.gridMax += S.relics.magnet ? .9 : .4;
    S.stat.captures++;
    /* capture — teal shockwave + spark shower */
    S.screenFlash = { col: '#3edcb0', a: 0.06 };
    shockwave(e.x, e.y, '#3edcb0', 36);
    ringBurst(e.x, e.y, '#3edcb0', 12, 35);
    sparks(e.x, e.y, '#3edcb0', 8);
    float(e.x, e.y - 10, 'CAPTURED ×2.5', '#3edcb0');
    Snd.play('capture');
    award('firstcap');
    if (S.stat.captures >= 25) award('cap25');
    if (e.type === 'titan') award('titancap');
    if (e.type === 'gilded') {
      S.stat.gilds++;
      if (S.stat.gilds >= 5) award('gild5');
    }
  } else {
    S.stat.kills++;
    if (S.stat.kills >= 200) award('k200');
    if (e.type === 'dread') award('dreadkill');
    if (e.type === 'dread' || e.type === 'titan') {
      shake(5);
      S.screenFlash = { col: '#f04a50', a: 0.06 };
      shockwave(e.x, e.y, '#f04a50', 50);
      debris(e.x, e.y, '#8a4a30', 12);
      sparks(e.x, e.y, '#ffb83a', 10);
      ringBurst(e.x, e.y, '#f04a50', 16, 45);
    } else if (e.type === 'gilded') {
      /* gilded death — golden shower */
      S.screenFlash = { col: '#ffd84a', a: 0.04 };
      ringBurst(e.x, e.y, '#ffd84a', 14, 40);
      sparks(e.x, e.y, '#ffd84a', 12);
      shockwave(e.x, e.y, '#ffd84a', 28);
    } else if (e.type === 'carrier') {
      /* carrier explodes into swarmlets */
      debris(e.x, e.y, '#a58a6a', 10);
      shockwave(e.x, e.y, '#a58a6a', 32);
      shake(3);
    } else if (e.type === 'plated') {
      /* plated — armor shrapnel */
      debris(e.x, e.y, '#5f6d78', 8);
      sparks(e.x, e.y, '#8d9aa5', 6);
    } else {
      /* standard kill */
      burst(e.x, e.y, e.col, 8);
    }
    /* carriers split into three swarmlets where they die */
    if (e.type === 'carrier') {
      for (var ci = 0; ci < 3; ci++) {
        spawnEnemy('swarm');
        var sw2 = S.enemies[S.enemies.length - 1];
        sw2.route = e.route.slice();
        sw2.routePx = e.routePx;
        sw2.routeLen = e.routeLen;
        sw2.d = Math.max(0, e.d - 8 - ci * 10);
        var p2 = pointOnPoly(sw2.routePx, sw2.routeLen, sw2.d);
        sw2.x = p2.x;
        sw2.y = p2.y;
        sw2.ang = p2.ang;
      }
    }
  }
  gainRes(b, e.x, e.y);
  Snd.play('boom', true);
}

export function leak(e: Enemy): void {
  e.dead = true;
  S.core -= ETYPES[e.type].dmg;
  S.stat.leaks++;
  shake(6);
  S.screenFlash = { col: '#f04a50', a: 0.12 };
  /* leak — red shockwave + debris spray */
  shockwave(e.x, e.y, '#f04a50', 40);
  ringBurst(e.x, e.y, '#f04a50', 10, 30);
  sparks(e.x, e.y, '#f04a50', 8);
  float(e.x, e.y - 12, '-' + ETYPES[e.type].dmg + ' CORE', '#f04a50');
  Snd.play('leak');
  if (S.core <= 0) { S.core = 0; S.over = true; showEnd(false); }
  hud(true);
}
