/* The fixed-60Hz simulation step — identical at 1× and 100×. */
import { S } from './state';
import { CARDS } from './data';
import type { Tower, Enemy, TowerStats } from './types';
import { stats, foundryOut, pickTarget, hasMod } from './towers';
import { spawnEnemy, killEnemy, leak, launchWave, endWave } from './enemies';
import { pointOnPoly } from './sectors';
import { capZone } from './economy';
import { burst } from './fx';
import { award } from './hud';
import { Snd } from './audio';

export function fixedUpdate(dt: number): void {
  if (S.paused || S.over || S.modalOpen) return;
  S.time += dt;

  /* fabrication window — real-time, foundries live */
  if (S.phase === 'build') {
    S.buildT -= dt;
    if (S.buildT <= 0) launchWave();
  }

  if (S.phase === 'wave' && S.spawnQ.length) {
    S.spawnT -= dt;
    while (S.spawnT <= 0 && S.spawnQ.length) {
      spawnEnemy(S.spawnQ.shift()!);
      S.spawnT += S.spawnInt;
    }
  }

  var i, j, t: Tower, e: Enemy, s: TowerStats;

  /* foundries refine between waves and during combat */
  for (i = 0; i < S.towers.length; i++) {
    t = S.towers[i];
    if (CARDS[t.i].id === 'foundry') {
      var o = foundryOut(t);
      S.res.fe += o.fe * dt;
      S.res.cu += o.cu * dt;
      S.res.si += o.si * dt;
      if (Math.random() < dt * 3) {
        S.parts.push({
          x: t.x + 4, y: t.y - 8,
          vx: (Math.random() - .5) * 4, vy: -8 - Math.random() * 6,
          life: .9, col: '#5a6a70', grav: -2
        });
      }
    }
  }

  /* cache stats once per tick — keeps 100× cheap */
  for (i = 0; i < S.towers.length; i++) S.towers[i]._st = stats(S.towers[i]);

  /* reset slows, capture beams claim + slow */
  for (i = 0; i < S.enemies.length; i++) {
    var en0 = S.enemies[i];
    en0.slow = 0;
    en0.bm = 0;
    en0.frozen = !!(S.event && S.event.id === 'frost');
    if (en0.slowT > 0) {
      en0.slowT -= dt;
      en0.slow = Math.max(en0.slow, .6);
    }
  }
  var slowAmt = S.relics.tread ? .72 : .55;
  for (i = S.beams.length - 1; i >= 0; i--) {
    var bm = S.beams[i];
    t = bm.tw;
    e = bm.en;
    var st = t._st!,
        gone = e.dead || e.hp / e.mhp > capZone() + .10 || Math.hypot(e.x - t.x, e.y - t.y) > st.range + 10;
    if (gone) { S.beams.splice(i, 1); continue; }
    e.slow = Math.max(e.slow, slowAmt);
    e.bm = 1;
    var rasp = .35 * (hasMod(t, 'grasp') ? 1.25 : 1);
    e.hp -= st.dmg * st.rate * rasp * dt;   /* beam rasp — 35% of harvester DPS */
    bm.t += dt / ((S.relics.lace ? .64 : .85) / (hasMod(t, 'grasp') ? 1.6 : 1));
    if (e.hp <= 0) { killEnemy(e, true); S.beams.splice(i, 1); continue; }
    if (bm.t >= 1) { killEnemy(e, true); S.beams.splice(i, 1); }
  }

  /* towers fire */
  for (i = 0; i < S.towers.length; i++) {
    t = S.towers[i];
    var c = CARDS[t.i];
    if (c.id === 'foundry') continue;
    t.cool -= dt;
    if (t.flash > 0) t.flash -= dt;
    if ((t.selF || 0) > 0) t.selF = (t.selF || 0) - dt * 3;
    s = t._st!;
    /* aegis: no guns — project a slow field every tick (stacks with beams via max) */
    if (c.id === 'aegis') {
      var as = Math.min(.5, (hasMod(t, 'cryo') ? .45 : .30) + .02 * (t.lvl - 1));
      var zap = hasMod(t, 'static') ? (2 + .5 * (t.lvl - 1)) : 0;
      for (j = 0; j < S.enemies.length; j++) {
        e = S.enemies[j];
        if (!e.dead && Math.hypot(e.x - t.x, e.y - t.y) <= s.range) {
          e.slow = Math.max(e.slow, as);
          if (zap) {
            e.hp -= zap * dt;
            e.flash = Math.max(e.flash, .05);
          }
        }
      }
      continue;
    }
    var inR = pickTarget(t, s);
    if (!inR) continue;
    t.ang = Math.atan2(inR.y - t.y, inR.x - t.x);
    if (t.cool > 0) continue;
    t.cool = 1 / s.rate;
    t.flash = .06;
    if (c.id === 'harvest' && S.mode === 'capture') {
      if (!S.beams.some(function (b) { return b.en === inR; })) {
        S.beams.push({ tw: t, en: inR, t: 0 });
        Snd.play('beam', true);
      }
      continue;
    }
    /* mortar: lobbed shell with area splash */
    if (c.id === 'mortar') {
      var splR = 34 * (S.relics.flak ? 1.4 : 1) * (hasMod(t, 'frag') ? 1.5 : 1);
      var splDmg = s.dmg * .6 * (hasMod(t, 'frag') ? 1.25 : 1);
      inR.hp -= s.dmg * (1 - inR.armor);
      inR.flash = .05;
      S.shots.push({ x: t.x, y: t.y, tx: inR.x, ty: inR.y, life: .16, col: c.col, kind: 3 });
      for (j = 0; j < S.enemies.length; j++) {
        var e3 = S.enemies[j];
        if (e3.dead || e3 === inR) continue;
        if (Math.hypot(e3.x - inR.x, e3.y - inR.y) <= splR) {
          e3.hp -= splDmg * (1 - e3.armor * .5);
          e3.flash = .06;
          if (e3.hp <= 0) killEnemy(e3, false);
        }
      }
      burst(inR.x, inR.y, '#c9a6e0', 8);
      Snd.play('boom', true);
      if (inR.hp <= 0) killEnemy(inR, false);
      continue;
    }
    var dmg = s.dmg * (1 - inR.armor * (c.id === 'arc' ? .35 : c.id === 'rail' ? (hasMod(t, 'railcoil') ? 0 : .2) : (c.id === 'needle' && hasMod(t, 'hollow') ? .4 : 1)));
    inR.hp -= dmg;
    inR.flash = .05;
    S.shots.push({
      x: t.x, y: t.y, tx: inR.x, ty: inR.y,
      life: c.id === 'rail' ? .12 : .07,
      col: c.col,
      kind: c.id === 'arc' ? 1 : (c.id === 'rail' ? 2 : 0)
    });
    /* flamethrower head: needle shots ignite — 40% of the shot burns 2.5s */
    if (c.id === 'needle' && hasMod(t, 'flame')) {
      inR.burn = Math.max(inR.burn, dmg * .4 / 2.5);
      inR.burnT = 2.5;
    }
    if (c.id === 'arc') {
      Snd.play('arc', true);
      var chained = 0;
      var chainMax = 2 + (S.relics.lattice ? 1 : 0) + (S.relics.shock ? 1 : 0) + (S.powers.power_reactor || 0) + (hasMod(t, 'tesla') ? 2 : 0);
      var chainRng = hasMod(t, 'tesla') ? 64 : 46;
      var falloff = hasMod(t, 'tesla') ? 1 : .36;
      for (j = 0; j < S.enemies.length && chained < chainMax; j++) {
        var e2 = S.enemies[j];
        if (e2 === inR || e2.dead) continue;
        if (Math.hypot(e2.x - inR.x, e2.y - inR.y) < chainRng) {
          e2.hp -= dmg * falloff;
          e2.flash = .05;
          chained++;
          S.shots.push({ x: inR.x, y: inR.y, tx: e2.x, ty: e2.y, life: .09, col: '#bdeef7', kind: 1 });
          if (e2.hp <= 0) killEnemy(e2, false);
        }
      }
    } else Snd.play(c.id === 'rail' ? 'rail' : 'shoot', true);
    if (inR.hp <= 0) killEnemy(inR, false);
  }

  /* movement — each enemy follows its own route from its spawn gate to the CORE */
  for (i = S.enemies.length - 1; i >= 0; i--) {
    e = S.enemies[i];
    if (e.dead) { S.enemies.splice(i, 1); continue; }
    if (e.flash > 0) e.flash -= dt;
    if (e.regen) e.hp = Math.min(e.mhp, e.hp + e.mhp * e.regen * dt);
    /* burn DoT from flamethrower modules */
    if (e.burnT > 0) {
      e.burnT -= dt;
      e.hp -= e.burn * dt;
      e.flash = Math.max(e.flash, .04);
      if (e.hp <= 0) {
        S.stat.burnKills++;
        if (S.stat.burnKills >= 10) award('burn10');
        killEnemy(e, false);
        continue;
      }
    }
    if (e.type === 'phase') {
      e.ph = (e.ph || 0) + dt;
      if (e.ph >= 2.5) {
        e.ph = 0;
        e.d += 36;
        S.rings.push({ x: e.x, y: e.y, r: 2, max: 16, col: '#7fa8d9' });
      }
    }
    var slowTot = Math.min(.9, e.slow + (e.frozen ? .1 : 0));
    e.d += e.sp * (1 - slowTot) * (S.event && S.event.id === 'grav' ? .85 : 1) * dt;
    var p = pointOnPoly(e.routePx, e.routeLen, e.d);
    e.x = p.x;
    e.y = p.y;
    e.ang = p.ang;
    if (e.d >= e.routeLen) leak(e);
  }

  if (S.phase === 'wave' && !S.spawnQ.length && !S.enemies.length) endWave();

  /* fx decay in sim-time so 100× stays coherent */
  for (i = S.parts.length - 1; i >= 0; i--) {
    var pt = S.parts[i];
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vy += (pt.grav || 60) * dt;
    if (pt.life <= 0) S.parts.splice(i, 1);
  }
  for (i = S.floats.length - 1; i >= 0; i--) {
    var f = S.floats[i];
    f.t -= dt;
    f.y -= 16 * dt;
    if (f.t <= 0) S.floats.splice(i, 1);
  }
  for (i = S.rings.length - 1; i >= 0; i--) {
    var rg = S.rings[i];
    rg.r += 60 * dt;
    if (rg.r >= rg.max) S.rings.splice(i, 1);
  }
  for (i = S.shots.length - 1; i >= 0; i--) {
    S.shots[i].life -= dt;
    if (S.shots[i].life <= 0) S.shots.splice(i, 1);
  }
  S.shake = Math.max(0, S.shake - dt * 14);
}
