/* The fixed-60Hz simulation step — identical at 1× and 100×. */
import { S } from './state';
import { CARDS, ETYPES } from './data';
import type { Tower, Enemy, TowerStats } from './types';
import { stats, foundryOut, pickTarget, hasMod, damageTower } from './towers';
import { spawnEnemy, killEnemy, leak, launchWave, endWave } from './enemies';
import { pointOnPoly } from './sectors';
import { capZone } from './economy';
import { burst, float } from './fx';
import { award } from './hud';
import { Snd } from './audio';

/** True while a JAMMER hostile is inside 70px of the tower. */
function jammed(t: Tower): boolean {
  for (var i = 0; i < S.enemies.length; i++) {
    var e = S.enemies[i];
    if (e.dead || e.type !== 'jammer') continue;
    if (Math.hypot(e.x - t.x, e.y - t.y) <= 70) return true;
  }
  return false;
}

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

  /* cache stats once per tick — keeps 100× cheap; drop-in anim + self-heal */
  for (i = 0; i < S.towers.length; i++) {
    t = S.towers[i];
    t._st = stats(t);
    if (t.dropT > 0) t.dropT -= dt;
    if (S.relics.anvil && t.hp < t.mhp) t.hp = Math.min(t.mhp, t.hp + dt);
    t.jam = jammed(t) ? 1 : 0;
  }

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
    if (en0.gravT > 0) {
      en0.gravT -= dt;
      en0.slow = Math.max(en0.slow, .4);
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
    var raspDmg = st.dmg * st.rate * rasp * dt;
    e.hp -= raspDmg;   /* beam rasp — 35% of harvester DPS */
    t.dealt += raspDmg;
    bm.t += dt / ((S.relics.lace ? .64 : .85) / (hasMod(t, 'grasp') ? 1.6 : 1));
    if (e.hp <= 0) { killEnemy(e, true, t); S.beams.splice(i, 1); continue; }
    if (bm.t >= 1) { killEnemy(e, true, t); S.beams.splice(i, 1); }
  }

  /* METEOR SHOWER weather: periodic strikes on hostiles */
  if (S.event && S.event.id === 'meteor' && S.phase === 'wave') {
    S.meteorT -= dt;
    if (S.meteorT <= 0) {
      S.meteorT = 1.6;
      var alive: Enemy[] = [];
      for (i = 0; i < S.enemies.length; i++) if (!S.enemies[i].dead) alive.push(S.enemies[i]);
      if (alive.length) {
        var victim = alive[Math.floor(Math.random() * alive.length)];
        var mdmg = victim.mhp * .15;
        victim.hp -= mdmg;
        victim.flash = .1;
        S.shots.push({ x: victim.x + 40, y: -12, tx: victim.x, ty: victim.y, life: .42, col: '#ffb83a', kind: 4 });
        S.rings.push({ x: victim.x, y: victim.y, r: 3, max: 22, col: '#ffb83a' });
        burst(victim.x, victim.y, '#ffb83a', 10);
        Snd.play('boom', true);
        if (victim.hp <= 0) killEnemy(victim, false);
        /* 10% risk of a stray impact clipping your own units */
        if (S.towers.length && Math.random() < .1) {
          var clip = S.towers[Math.floor(Math.random() * S.towers.length)];
          damageTower(clip, 1, '#ffb83a');
        }
      }
    }
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
    var jamRate = t.jam ? .25 : 1;
    /* aegis: no guns — project a slow field every tick (stacks with beams via max) */
    if (c.id === 'aegis') {
      var as = Math.min(.5, (hasMod(t, 'cryo') ? .45 : .30) + .02 * (t.lvl - 1));
      if (t.jam) as *= .5;
      var zap = hasMod(t, 'static') ? (2 + .5 * (t.lvl - 1)) : 0;
      for (j = 0; j < S.enemies.length; j++) {
        e = S.enemies[j];
        if (!e.dead && Math.hypot(e.x - t.x, e.y - t.y) <= s.range) {
          e.slow = Math.max(e.slow, as);
          if (zap) {
            var zd = zap * dt;
            e.hp -= zd;
            t.dealt += zd;
            e.flash = Math.max(e.flash, .05);
            if (e.hp <= 0) killEnemy(e, false, t);
          }
        }
      }
      continue;
    }
    /* pulse core: periodic radial blast — no barrel, no target needed */
    if (c.id === 'pulse') {
      if (t.cool > 0) continue;
      var inBlast = false;
      for (j = 0; j < S.enemies.length; j++) {
        if (!S.enemies[j].dead && Math.hypot(S.enemies[j].x - t.x, S.enemies[j].y - t.y) <= s.range) { inBlast = true; break; }
      }
      if (!inBlast) continue;
      t.cool = 1 / s.rate;
      t.flash = .12;
      for (j = 0; j < S.enemies.length; j++) {
        e = S.enemies[j];
        if (e.dead || Math.hypot(e.x - t.x, e.y - t.y) > s.range) continue;
        var pdmg = s.dmg * (1 - e.armor * .5);
        e.hp -= pdmg;
        t.dealt += pdmg;
        e.flash = .06;
        if (e.hp <= 0) killEnemy(e, false, t);
      }
      S.rings.push({ x: t.x, y: t.y, r: 4, max: s.range, col: '#b18cd9' });
      S.screenFlash = { col: '#b18cd9', a: .04 };
      Snd.play('boom', true);
      continue;
    }
    var inR = pickTarget(t, s);
    if (!inR) continue;
    t.ang = Math.atan2(inR.y - t.y, inR.x - t.x);
    if (t.cool > 0) continue;
    t.cool = 1 / (s.rate * jamRate);
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
      var dirDmg = s.dmg * (1 - inR.armor);
      inR.hp -= dirDmg;
      t.dealt += dirDmg;
      inR.flash = .05;
      S.shots.push({ x: t.x, y: t.y, tx: inR.x, ty: inR.y, life: .16, col: c.col, kind: 3 });
      for (j = 0; j < S.enemies.length; j++) {
        var e3 = S.enemies[j];
        if (e3.dead || e3 === inR) continue;
        if (Math.hypot(e3.x - inR.x, e3.y - inR.y) <= splR) {
          var spd = splDmg * (1 - e3.armor * .5);
          e3.hp -= spd;
          t.dealt += spd;
          e3.flash = .06;
          if (e3.hp <= 0) killEnemy(e3, false, t);
        }
      }
      burst(inR.x, inR.y, '#c9a6e0', 8);
      Snd.play('boom', true);
      if (inR.hp <= 0) killEnemy(inR, false, t);
      continue;
    }
    var dmg = s.dmg * (1 - inR.armor * (c.id === 'arc' ? .35 : c.id === 'rail' ? (hasMod(t, 'railcoil') ? 0 : .2) : ((c.id === 'needle' && hasMod(t, 'hollow')) || (c.id === 'vulcan' && hasMod(t, 'tungsten')) ? .4 : 1)));
    inR.hp -= dmg;
    t.dealt += dmg;
    inR.flash = .05;
    if (S.settings.dmgNumbers && dmg >= 1) {
      float(inR.x + (Math.random() - .5) * 10, inR.y - inR.size - 4, Math.round(dmg) + '', '#f0ece4');
    }
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
          var chd = dmg * falloff;
          e2.hp -= chd;
          t.dealt += chd;
          e2.flash = .05;
          chained++;
          S.shots.push({ x: inR.x, y: inR.y, tx: e2.x, ty: e2.y, life: .09, col: '#bdeef7', kind: 1 });
          if (e2.hp <= 0) killEnemy(e2, false, t);
        }
      }
    } else Snd.play(c.id === 'rail' ? 'rail' : 'shoot', true);
    if (inR.hp <= 0) killEnemy(inR, false, t);
  }

  /* overlord bosses birth escorts while they march */
  for (i = 0; i < S.enemies.length; i++) {
    e = S.enemies[i];
    if (e.dead || e.type !== 'overlord') continue;
    e.bossT = (e.bossT || 0) - dt;
    if (e.bossT <= 0) {
      e.bossT = 5;
      if (S.enemies.length < 60) {
        for (var k2 = 0; k2 < 2; k2++) {
          spawnEnemy('scrap');
          var sc = S.enemies[S.enemies.length - 1];
          sc.route = e.route.slice();
          sc.routePx = e.routePx;
          sc.routeLen = e.routeLen;
          sc.d = Math.max(0, e.d - 6);
          var sp2 = pointOnPoly(sc.routePx, sc.routeLen, sc.d);
          sc.x = sp2.x;
          sc.y = sp2.y;
          sc.ang = sp2.ang;
        }
        S.rings.push({ x: e.x, y: e.y, r: 6, max: 26, col: '#ff3b47' });
      }
    }
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
    if (e.type === 'phase' && e.stun <= 0) {
      e.ph = (e.ph || 0) + dt;
      if (e.ph >= 2.5) {
        e.ph = 0;
        e.d += 36;
        S.rings.push({ x: e.x, y: e.y, r: 2, max: 16, col: '#7fa8d9' });
      }
    }
    if (e.stun > 0) {
      e.stun -= dt;
      continue;   /* circuit-breaker stun: frozen in place */
    }
    var slowTot = Math.min(.9, e.slow + (e.frozen ? .1 : 0));
    var repMult = S.powers.power_repulsor ? .92 : 1;
    e.d += e.sp * (1 - slowTot) * (S.event && S.event.id === 'grav' ? .85 : 1) * repMult * dt;
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
  S.inspectT = Math.max(0, S.inspectT - dt);
}
