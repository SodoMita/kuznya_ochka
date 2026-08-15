/* Units: stat scaling, targeting, placement. */
import { S } from './state';
import { CARDS } from './data';
import type { Tower, TowerStats, Enemy, Cost } from './types';
import { W, H } from './view';
import { distToRoutePx } from './sectors';
import { canAfford, spend, usedGrid, capZone, gridCap } from './economy';
import { burst } from './fx';
import { toast, hud } from './hud';
import { Snd } from './audio';
import { compFor } from './enemies';
import { selBoard, defOf, resolveAfterPlay, powerDmgMult, powerFoundryMult, powerRangeMult, powerRateMult } from './deck';

export function supplyAt(t: Tower): number {
  var n = 0;
  S.towers.forEach(function (o) {
    if (o !== t && CARDS[o.i].id === 'foundry' && Math.hypot(o.x - t.x, o.y - t.y) <= 92) n++;
  });
  return 1 + .08 * Math.min(3, n);
}

export function stats(t: Tower): TowerStats {
  var c = CARDS[t.i], L = t.lvl - 1, rank = Math.pow(1.05, S.ranks[c.id] || 0);
  var sm = Math.pow(1.05, Math.floor(L / 5)); /* calibration stars */
  var dmg = c.dmg * Math.pow(1.16, L) * rank * sm * (S.relics.tungsten ? 1.1 : 1) * powerDmgMult();
  var rate = c.rate * Math.pow(1.05, L) * sm * (S.relics.clock ? 1.1 : 1) * supplyAt(t) * powerRateMult();
  if (c.id === 'needle' && S.relics.twin) rate *= 1.2;
  if (S.time < S.ability.surge.until) rate *= 1.5;
  if (c.id === 'arc' && S.event && S.event.id === 'ion') dmg *= 1.4;
  var range = c.range * (1 + .04 * L) * (S.relics.cryo ? 1.12 : 1) * powerRangeMult();
  if (c.id === 'rail' && S.relics.lens) range *= 1.25;
  return { dmg: dmg, rate: rate, range: range, stars: Math.floor(L / 5) };
}

export function foundryOut(t: Tower): Cost {
  var m = Math.pow(1.13, t.lvl - 1) * Math.pow(1.05, S.ranks.foundry) * (S.relics.metal ? 1.18 : 1) * powerFoundryMult();
  if (S.event && S.event.id === 'rust') m *= 1.4;
  return { fe: .34 * m, cu: .12 * m, si: .05 * m };
}

export function pickTarget(t: Tower, st: TowerStats): Enemy | null {
  var c = CARDS[t.i], list: Enemy[] = [], j, e: Enemy;
  for (j = 0; j < S.enemies.length; j++) {
    e = S.enemies[j];
    if (e.dead) continue;
    if (Math.hypot(e.x - t.x, e.y - t.y) > st.range) continue;
    if (c.id === 'harvest' && S.mode === 'capture' && e.hp / e.mhp > capZone()) continue;
    list.push(e);
  }
  if (!list.length) return null;
  /* coordinated salvage: don't shred a target an ally is already beaming */
  var pool = list.length > 1 ? list.filter(function (q) { return !q.bm; }) : list;
  if (!pool.length) pool = list;
  var best = pool[0], k;
  for (k = 1; k < pool.length; k++) {
    e = pool[k];
    switch (t.tgt) {
      case 'last': if (e.d < best.d) best = e; break;
      case 'strong': if (e.hp > best.hp) best = e; break;
      case 'weak': if (e.hp < best.hp) best = e; break;
      case 'near': if (Math.hypot(e.x - t.x, e.y - t.y) < Math.hypot(best.x - t.x, best.y - t.y)) best = e; break;
      case 'far': if (Math.hypot(e.x - t.x, e.y - t.y) > Math.hypot(best.x - t.x, best.y - t.y)) best = e; break;
      default: if (e.d > best.d) best = e;
    }
  }
  return best;
}

export function nextWaveStr(): string {
  var comp = compFor(S.wave + 1), cnt: Record<string, number> = {}, order: string[] = [];
  comp.forEach(function (tp) {
    if (cnt[tp] === undefined) { cnt[tp] = 0; order.push(tp); }
    cnt[tp]++;
  });
  return 'NEXT ▸ ' + order.map(function (tp) { return cnt[tp] + '×' + tp.toUpperCase(); }).join(' ');
}

export function canPlace(x: number, y: number): boolean {
  if (x < 14 || y < 14 || x > W - 14 || y > H - 14) return false;
  if (distToRoutePx(x, y) < 25) return false;
  for (var i = 0; i < S.towers.length; i++) {
    if (Math.hypot(S.towers[i].x - x, S.towers[i].y - y) < 24) return false;
  }
  return true;
}

/** Play the selected circuit-board card from the hand: consumes the card
    (→ discard/exhaust pile) and prints the unit on the field. */
export function placeTower(x: number, y: number): void {
  var c = selBoard();
  if (!c || S.selCard == null) { toast('SELECT A CIRCUIT BOARD FIRST'); Snd.play('error'); return; }
  var handIdx = S.selCard;
  var d = defOf(S.hand[handIdx]);
  if (!canAfford(d.cost)) { toast('INSUFFICIENT MATTER'); Snd.play('error'); return; }
  if (usedGrid() + c.draw > gridCap()) { toast('GRID CAPACITY EXCEEDED'); Snd.play('error'); return; }
  if (!canPlace(x, y)) { toast('FOUNDATION BLOCKED'); Snd.play('error'); return; }
  spend(d.cost);
  var t: Tower = {
    x: x, y: y, i: d.tower!, lvl: 1, cool: 0, ang: -Math.PI / 2, flash: 0,
    tgt: 'first', inv: { fe: d.cost.fe, cu: d.cost.cu, si: d.cost.si }
  };
  S.towers.push(t);
  S.selTower = t;
  resolveAfterPlay(handIdx);
  /* QoL: chain-deploy — auto-select another copy of the same board
     (the freshly printed unit stays selected in the unit panel) */
  for (var k = 0; k < S.hand.length; k++) {
    if (S.hand[k].id === d.id) { S.selCard = k; break; }
  }
  toast(d.name + (d.consume ? ' — CONSUMED FROM DECK' : d.exhaust ? ' — EXHAUSTED THIS SECTOR' : ' → DISCARD PILE'));
  burst(x, y, '#8fa0a6', 8);
  Snd.play('place');
  hud(true);
}
