/* Economy: resources, costs, salvage, grid, capture zone, score. */
import { S } from './state';
import { RKEYS, CARDS, SECTORS } from './data';
import type { Cost, Tower } from './types';
import { float } from './fx';
import { award } from './hud';
import { fmtF } from './utils';

/** Hull fraction at which harvesters may capture (Deep Scan widens it). */
export function capZone(): number {
  return S.relics.scan ? .36 : .30;
}

/** Effective grid capacity (Fusion Tap adds +1 per Foundry). */
export function gridCap(): number {
  var g = S.gridMax;
  if (S.relics.fusion) {
    for (var i = 0; i < S.towers.length; i++) {
      if (CARDS[S.towers[i].i].id === 'foundry') g += 1;
    }
  }
  return g;
}

export function sector() {
  return SECTORS[S.sector % SECTORS.length];
}

export function canAfford(c: Cost): boolean {
  return RKEYS.every(function (k) { return S.res[k] >= (c[k] || 0); });
}

export function spend(c: Cost): void {
  RKEYS.forEach(function (k) { S.res[k] -= (c[k] || 0); });
}

export function usedGrid(): number {
  var g = 0;
  S.towers.forEach(function (t) { g += CARDS[t.i].draw + .3 * (t.lvl - 1); });
  return g;
}

/** Salvage multiplier: SCAVENGER PROTOCOL relic + SCAVENGER DRONE firmware. */
export function scavMult(): number {
  var m = S.relics.scav ? 1.12 : 1;
  if (S.powers.power_drone) m *= 1.12;
  return m;
}

/** Circuit-board matter discount (BLUEPRINT EFFICIENCY firmware). */
export function boardCostMult(): number {
  return S.powers.power_efficiency ? .9 : 1;
}

/** Tower integrity: 20 + 10 per level, boosted by relics/firmware. */
export function towerMhp(t: Tower): number {
  var m = 20 + 10 * (t.lvl - 1);
  if (S.relics.bulwark) m *= 1.4;
  if (S.powers.power_shield) m *= 1.25;
  return Math.round(m);
}

export function gainRes(b: Cost, x?: number, y?: number): void {
  RKEYS.forEach(function (k) { S.res[k] += (b[k] || 0); });
  S.stat.salvaged += (b.fe || 0) + (b.cu || 0) + (b.si || 0);
  if (x !== undefined && y !== undefined) {
    var bits: string[] = [];
    if (b.fe >= .5) bits.push('+' + fmtF(b.fe) + 'Fe');
    if (b.cu >= .5) bits.push('+' + fmtF(b.cu) + 'Cu');
    if (b.si >= .3) bits.push('+' + fmtF(b.si) + 'Si');
    if (bits.length) float(x, y, bits.join(' '), '#e0b184');
  }
}

export function upCost(t: Tower): Cost {
  var b = CARDS[t.i].cost, m = .75 * Math.pow(1.28, t.lvl - 1);
  return { fe: Math.ceil(b.fe * m), cu: Math.ceil(b.cu * m), si: Math.ceil(b.si * m) };
}

export function costStr(c: Cost): string {
  return '<span class="fe">' + c.fe + 'Fe</span><span class="cu">' + c.cu + 'Cu</span><span class="si">' + c.si + 'Si</span>';
}

/* ---- score ---- */
export function addScore(n: number): void {
  S.score += n;
  if (S.score > S.best) S.best = S.score;
  if (S.score >= 10000) award('score10k');
}

/** Score popup near a position. */
export function scoreFloat(x: number, y: number, n: number): void {
  float(x, y - 20, '+' + n + ' SCORE', '#ffd23f');
}
