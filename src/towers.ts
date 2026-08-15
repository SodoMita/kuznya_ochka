/* Units: stat scaling, targeting, placement, upgrade modules, integrity. */
import { S } from './state';
import { CARDS, RKEYS } from './data';
import type { Tower, TowerStats, Enemy, Cost, Card } from './types';
import { W, H } from './view';
import { distToRoutePx } from './sectors';
import { canAfford, spend, usedGrid, capZone, gridCap, upCost, towerMhp, gainRes } from './economy';
import { burst, debris, dust, float } from './fx';
import { toast, hud, award } from './hud';
import { Snd } from './audio';
import { compFor } from './enemies';
import { selBoard, selModule, defOf, resolveAfterPlay, powerDmgMult, powerFoundryMult, powerRangeMult, powerRateMult, effCost } from './deck';

export function supplyAt(t: Tower): number {
  var n = 0;
  S.towers.forEach(function (o) {
    if (o !== t && CARDS[o.i].id === 'foundry' && Math.hypot(o.x - t.x, o.y - t.y) <= 92) n++;
  });
  return 1 + .08 * Math.min(3, n);
}

/** Whether a unit carries a given module. */
export function hasMod(t: Tower, id: string): boolean {
  return t.mods.indexOf(id) >= 0;
}

/** Damage bonus from nearby SMELTER BELLY foundries (+8% each, max +24%). */
export function foundryDmgBoost(t: Tower): number {
  var n = 0;
  S.towers.forEach(function (o) {
    if (o !== t && CARDS[o.i].id === 'foundry' && hasMod(o, 'smelter') && Math.hypot(o.x - t.x, o.y - t.y) <= 92) n++;
  });
  return 1 + .08 * Math.min(3, n);
}

/** Veterancy: +2% damage per 10 kills, capped at +10%. */
export function vetMult(t: Tower): number {
  return 1 + .02 * Math.min(5, Math.floor((t.kills || 0) / 10));
}

export function stats(t: Tower): TowerStats {
  var c = CARDS[t.i], L = t.lvl - 1, rank = Math.pow(1.05, S.ranks[c.id] || 0);
  var sm = Math.pow(1.05, Math.floor(L / 5)); /* calibration stars */
  var dmg = c.dmg * Math.pow(1.16, L) * rank * sm * (S.relics.tungsten ? 1.1 : 1) * powerDmgMult() * vetMult(t);
  var rate = c.rate * Math.pow(1.05, L) * sm * (S.relics.clock ? 1.1 : 1) * supplyAt(t) * powerRateMult();
  if (c.id === 'needle' && S.relics.twin) rate *= 1.2;
  if (c.id === 'vulcan' && S.relics.drill) rate *= 1.15;
  if (S.time < S.ability.surge.until) rate *= 1.5;
  if (c.id === 'arc' && S.event && S.event.id === 'ion') dmg *= 1.4;
  if (c.id === 'arc' && S.relics.shock) dmg *= 1.15;
  if (S.event && S.event.id === 'solar') dmg *= 1.15;
  /* upgrade modules */
  if (hasMod(t, 'overvolt')) rate *= 1.2;
  if (hasMod(t, 'railcoil')) dmg *= 1.25;
  if (hasMod(t, 'tungsten')) rate *= 1.25;
  if (hasMod(t, 'resonance')) dmg *= 1.2;
  if (c.id === 'pulse' && S.relics.catalyst) rate *= 1.2;
  if (c.id !== 'foundry' && c.id !== 'aegis') dmg *= foundryDmgBoost(t);
  var range = c.range * (1 + .04 * L) * (S.relics.cryo ? 1.12 : 1) * powerRangeMult();
  if (c.id === 'rail' && S.relics.lens) range *= 1.25;
  if (hasMod(t, 'scope')) range *= 1.35;
  if (hasMod(t, 'cryo')) range *= 1.25;
  if (hasMod(t, 'resonance')) range *= 1.45;
  if (S.powers.power_seek) range *= 1.2;
  /* integrity bookkeeping: upgrades & powers heal the delta into new max hp */
  var mhp = towerMhp(t);
  if (mhp > t.mhp) t.hp += mhp - t.mhp;
  t.mhp = mhp;
  t.hp = Math.min(t.hp, t.mhp);
  return { dmg: dmg, rate: rate, range: range, stars: Math.floor(L / 5) };
}

export function foundryOut(t: Tower): Cost {
  var m = Math.pow(1.13, t.lvl - 1) * Math.pow(1.05, S.ranks.foundry) * (S.relics.metal ? 1.18 : 1) * powerFoundryMult();
  if (S.event && S.event.id === 'rust') m *= 1.4;
  if (hasMod(t, 'smelter')) m *= 1.6;
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

/** Next-wave preview: composition strings for the coming 2 waves + a 1-5 threat rating. */
export function wavePreview(): { lines: string[]; threat: number } {
  var out: string[] = [];
  for (var w = S.wave + 1; w <= S.wave + 2; w++) {
    var comp = compFor(w), cnt: Record<string, number> = {}, order: string[] = [];
    comp.forEach(function (tp) {
      if (cnt[tp] === undefined) { cnt[tp] = 0; order.push(tp); }
      cnt[tp]++;
    });
    out.push('W' + (w < 10 ? '0' : '') + w + ' ▸ ' + order.map(function (tp) { return cnt[tp] + '×' + tp.toUpperCase(); }).join(' '));
  }
  /* threat rating: wave 1 ≈ ★, wave 12+ ≈ ★★★★★ */
  var threat = Math.min(5, Math.max(1, Math.round((S.wave + 1) / 3)));
  return { lines: out, threat: threat };
}

export function canPlace(x: number, y: number): boolean {
  if (x < 14 || y < 14 || x > W - 14 || y > H - 14) return false;
  if (distToRoutePx(x, y) < 25) return false;
  for (var i = 0; i < S.towers.length; i++) {
    if (Math.hypot(S.towers[i].x - x, S.towers[i].y - y) < 24) return false;
  }
  return true;
}

/** The blueprint behind a deployed unit. */
export function towerCard(t: Tower): Card {
  return CARDS[t.i];
}

/** The current slow magnitude of a unit (deepfreeze/overclock field). */
export function towerSlow(t: Tower): number {
  return t.slow;
}

/** Play the selected circuit-board card from the hand: consumes the card
    (→ discard/exhaust pile) and prints the unit on the field. */
export function placeTower(x: number, y: number): void {
  var c = selBoard();
  if (!c || S.selCard == null) { toast('SELECT A CIRCUIT BOARD FIRST'); Snd.play('error'); return; }
  var handIdx = S.selCard;
  var d = defOf(S.hand[handIdx]);
  var cost = effCost(d.cost);
  if (!canAfford(cost)) { toast('INSUFFICIENT MATTER'); Snd.play('error'); return; }
  if (usedGrid() + c.draw > gridCap()) { toast('GRID CAPACITY EXCEEDED'); Snd.play('error'); return; }
  if (!canPlace(x, y)) { toast('FOUNDATION BLOCKED'); Snd.play('error'); return; }
  spend(cost);
  var lvl = 1, bonus = '';
  if (S.overcharge) { lvl = 2; S.overcharge = false; bonus = ' · OVERCHARGED L2'; }
  var mhp = towerMhp({ i: d.tower!, lvl: lvl } as Tower);
  var t: Tower = {
    x: x, y: y, i: d.tower!, lvl: lvl, cool: 0, ang: -Math.PI / 2, flash: 0, slow: 0,
    tgt: 'first', inv: { fe: cost.fe, cu: cost.cu, si: cost.si }, mods: [],
    hp: mhp, mhp: mhp, kills: 0, caps: 0, dealt: 0, dropT: .28, jam: 0
  };
  S.towers.push(t);
  S.selTower = t;
  var ci = S.hand[handIdx];
  var pile: 'discard' | 'exhaust' = d.exhaust ? 'exhaust' : 'discard';
  resolveAfterPlay(handIdx);
  /* undo support: one step back during the fabrication window */
  if (S.phase === 'build') S.undoStack.push({ t: t, ci: ci, from: pile });
  /* QoL: chain-deploy — auto-select another copy of the same board
     (the freshly printed unit stays selected in the unit panel) */
  for (var k = 0; k < S.hand.length; k++) {
    if (S.hand[k].id === d.id) { S.selCard = k; break; }
  }
  S.stat.maxTowers = Math.max(S.stat.maxTowers, S.towers.length);
  if (S.towers.length >= 10) award('tower10');
  toast(d.name + (d.consume ? ' — CONSUMED FROM DECK' : d.exhaust ? ' — EXHAUSTED THIS SECTOR' : ' → DISCARD PILE') + bonus);
  burst(x, y, '#8fa0a6', 8);
  dust(x, y);
  Snd.play('place');
  hud(true);
}

/** Bolt the selected MODULE card onto a deployed unit (handled by field taps
    and the unit-panel INSTALL button). Enforces blueprint compatibility, one
    module of a kind per unit, and matter cost. */
export function installModule(t: Tower): void {
  var md = selModule();
  if (!md || S.selCard == null) { toast('SELECT A MODULE CARD FIRST'); Snd.play('error'); return; }
  if (S.towers.indexOf(t) < 0) { toast('UNIT OFFLINE'); Snd.play('error'); return; }
  var handIdx = S.selCard;
  var d = defOf(S.hand[handIdx]);
  var c = CARDS[t.i];
  if (md.forIds.indexOf(c.id) < 0) {
    toast('INCOMPATIBLE — ' + md.name + ' FITS ' + md.forIds.join('/').toUpperCase());
    Snd.play('error');
    return;
  }
  if (hasMod(t, md.id)) { toast(c.name + ' ALREADY HAS ' + md.name); Snd.play('error'); return; }
  if (!canAfford(d.cost)) { toast('INSUFFICIENT MATTER'); Snd.play('error'); return; }
  spend(d.cost);
  RKEYS.forEach(function (k) { t.inv[k] += d.cost[k]; });
  t.mods.push(md.id);
  resolveAfterPlay(handIdx);
  /* QoL: chain-install — auto-select another copy of the same module card */
  for (var k = 0; k < S.hand.length; k++) {
    if (S.hand[k].id === d.id) { S.selCard = k; break; }
  }
  S.selTower = t;
  burst(t.x, t.y, md.col, 10);
  toast(md.name + ' → ' + c.name + (d.exhaust ? ' (EXHAUSTED THIS SECTOR)' : ''));
  Snd.play('upgrade');
  hud(true);
}

/** Damage a tower's integrity; destroys it (50% refund) at zero. */
export function damageTower(t: Tower, dmg: number, col: string): void {
  if (S.towers.indexOf(t) < 0) return;
  t.hp -= dmg;
  if (S.settings.dmgNumbers) float(t.x, t.y - 14, '-' + dmg + ' INTEGRITY', col);
  if (t.hp <= 0) {
    var refund: Cost = {
      fe: Math.floor(t.inv.fe * .5),
      cu: Math.floor(t.inv.cu * .5),
      si: Math.floor(t.inv.si * .5)
    };
    S.towers = S.towers.filter(function (x) { return x !== t; });
    S.beams = S.beams.filter(function (b) { return b.tw !== t; });
    S.undoStack = S.undoStack.filter(function (u) { return u.t !== t; });
    if (S.selTower === t) S.selTower = null;
    S.stat.towerLoss++;
    if (S.objective && S.objective.id === 'nofall') S.objective.track++;
    gainRes(refund, t.x, t.y);
    debris(t.x, t.y, '#8fa0a6', 14);
    S.rings.push({ x: t.x, y: t.y, r: 4, max: 40, col: '#f04a50' });
    toast(CARDS[t.i].name + ' DESTROYED — 50% MATTER RECOVERED');
    Snd.play('boom', true);
    hud(true);
  }
}

/** Undo the most recent tower placement: full refund, card back to hand. */
export function undoPlace(): string {
  if (!S.undoStack.length) return 'NOTHING TO UNDO';
  var u = S.undoStack.pop()!;
  if (S.towers.indexOf(u.t) < 0) return 'NOTHING TO UNDO';
  S.towers = S.towers.filter(function (x) { return x !== u.t; });
  S.beams = S.beams.filter(function (b) { return b.tw !== u.t; });
  if (S.selTower === u.t) S.selTower = null;
  var pile = u.from === 'exhaust' ? S.exhaustPile : S.discardPile;
  var idx = pile.indexOf(u.ci);
  if (idx >= 0) pile.splice(idx, 1);
  if (S.hand.length < 10) S.hand.push(u.ci);
  else S.discardPile.push(u.ci);
  gainRes(u.t.inv, u.t.x, u.t.y);
  burst(u.t.x, u.t.y, '#8fa0a6', 8);
  Snd.play('ui');
  return CARDS[u.t.i].name + ' UNDONE — FULL REFUND';
}

/** Sell every deployed unit of the selected blueprint. */
export function sellAllOf(i: number): string {
  var matches = S.towers.filter(function (t) { return t.i === i; });
  if (!matches.length) return 'NO ' + CARDS[i].name + ' UNITS DEPLOYED';
  var total: Cost = { fe: 0, cu: 0, si: 0 };
  matches.forEach(function (t) {
    var mult = .7 + (S.relics.harvester ? .1 : 0);
    total.fe += Math.floor(t.inv.fe * mult);
    total.cu += Math.floor(t.inv.cu * mult);
    total.si += Math.floor(t.inv.si * mult);
  });
  S.towers = S.towers.filter(function (t) { return t.i !== i; });
  S.beams = S.beams.filter(function (b) { return S.towers.indexOf(b.tw) >= 0; });
  S.undoStack = S.undoStack.filter(function (u) { return S.towers.indexOf(u.t) >= 0; });
  S.selTower = null;
  gainRes(total, W / 2, H / 2);
  Snd.play('boom', true);
  return matches.length + '× ' + CARDS[i].name + ' SCRAPPED — MATTER RECOVERED';
}

/** Upgrade every deployed unit of the selected blueprint by one level. */
export function upgradeAllOf(i: number): string {
  var matches = S.towers.filter(function (t) { return t.i === i; });
  if (!matches.length) return 'NO ' + CARDS[i].name + ' UNITS DEPLOYED';
  var done = 0, spentAny = false;
  for (var k = 0; k < matches.length; k++) {
    var t = matches[k];
    var uc = upCost(t);
    if (!canAfford(uc)) break;
    if (usedGrid() + .3 > gridCap()) break;
    spend(uc);
    RKEYS.forEach(function (key) { t.inv[key] += uc[key]; });
    t.lvl++;
    done++;
    spentAny = true;
  }
  if (!spentAny) return 'INSUFFICIENT MATTER FOR ' + CARDS[i].name + ' UPGRADES';
  Snd.play('upgrade');
  if (done === 1) burst(matches[0].x, matches[0].y, '#ffd84a', 8);
  return done + '× ' + CARDS[i].name + ' UPGRADED +1 LEVEL';
}
