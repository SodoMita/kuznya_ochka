/* Waves: composition, spawning, kills, leaks, sector-clear rewards. */
import { S } from './state';
import { ETYPES, EVENTS } from './data';
import type { Enemy, Cost } from './types';
import { sector, gainRes, scavMult } from './economy';
import { burst, float } from './fx';
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
  var haz = sector().haz;
  if (haz === 0 && w >= 3) wts[types.indexOf('plated')] *= 2;
  if (haz === 1 && w >= 5) wts[types.indexOf('swarm')] *= 2;
  if (haz === 2 && w >= 9) wts[types.indexOf('regen')] *= 2;
  if (haz === 3 && w >= 7) wts[types.indexOf('phase')] *= 2;
  if (haz === 4 && w >= 4) wts[types.indexOf('gilded')] *= 3;
  if (haz === 5 && w >= 11) wts[types.indexOf('carrier')] *= 2;
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
  /* pick a spawn gate: round-robin so every gate feeds each wave */
  var gate = S.spawns[S.spawnIdx % S.spawns.length];
  S.spawnIdx++;
  var route = shortestRoute(gate, S.coreIdx, type === 'swarm' ? Math.random : undefined);
  var rp = routePolyline(route);
  /* normalize speed so short routes don't turn into instant leaks (and long
     scenic routes don't crawl): same time-to-CORE as the old zig-zag maps */
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
    flash: 0,
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
    float(core.px, core.py - 14, '+' + bonus.toFixed(0) + 'Fe EARLY CALL', '#ffd23f');
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
  /* new turn: ethereal cards burn, non-retain hand discards, redraw */
  var eth = startTurn();
  if (eth) float(S.nodes[S.coreIdx].px, S.nodes[S.coreIdx].py - 26, eth + ' ETHEREAL CARD' + (eth > 1 ? 'S' : '') + ' EXHAUSTED', '#b18cd9');
  if (S.relics.repair) S.core = Math.min(S.coreMax, S.core + 1);
  if (S.wave % 12 === 0 && !S.cleared[S.sector]) {
    S.cleared[S.sector] = true;
    gainRes({ fe: 80 + S.wave * 6, cu: 30 + S.wave * 2, si: 12 + S.wave });
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
  /* scrap streak: consecutive kills inside 2.2s chain a salvage bonus */
  var now = S.time;
  if (now - S.streak.t < 2.2) S.streak.n++;
  else S.streak.n = 1;
  S.streak.t = now;
  if (S.streak.n >= 20) award('streak20');
  if (S.streak.n >= 10 && S.streak.n % 10 === 0) {
    float(e.x, e.y - 16, 'STREAK ×' + S.streak.n, '#ffd23f');
    Snd.play('draft');
  }
  var rw = (e.reward || 1) * (1 + Math.min(S.relics.tithe ? 40 : 25, S.streak.n) * .01);
  var b: Cost = {
    fe: e.mhp * .032 * rw * mix.fe * sc * mult,
    cu: e.mhp * .011 * rw * mix.cu * sc * mult,
    si: e.mhp * .0045 * rw * mix.si * sc * mult
  };
  if (captured) {
    if (e.type === 'titan') b.si += 1;
    S.gridMax += S.relics.magnet ? .9 : .4;
    S.stat.captures++;
    S.rings.push({ x: e.x, y: e.y, r: 4, max: 34, col: '#3ec9b0' });
    float(e.x, e.y - 10, 'CAPTURED ×2.5', '#3ec9b0');
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
      S.shake = Math.min(9, S.shake + 4);
      S.rings.push({ x: e.x, y: e.y, r: 6, max: 44, col: '#e5484d' });
    }
    /* carriers split into three swarmlets where they die (capture denies it) */
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
  burst(e.x, e.y, captured ? '#3ec9b0' : '#e0854e', captured ? 14 : 7);
  Snd.play('boom', true);
}

export function leak(e: Enemy): void {
  e.dead = true;
  S.core -= ETYPES[e.type].dmg;
  S.stat.leaks++;
  S.shake = Math.min(9, S.shake + 5);
  S.rings.push({ x: e.x, y: e.y, r: 4, max: 30, col: '#e5484d' });
  Snd.play('leak');
  if (S.core <= 0) { S.core = 0; S.over = true; showEnd(false); }
  hud(true);
}
