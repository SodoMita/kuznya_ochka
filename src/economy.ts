/* Economy: resources, costs, salvage, grid, capture zone. */
import { S } from './state';
import { RKEYS, CARDS, SECTORS } from './data';
import type { Cost, Tower } from './types';
import { float } from './fx';

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

export function scavMult(): number {
  return S.relics.scav ? 1.12 : 1;
}

export function gainRes(b: Cost, x?: number, y?: number): void {
  RKEYS.forEach(function (k) { S.res[k] += (b[k] || 0); });
  S.stat.salvaged += (b.fe || 0) + (b.cu || 0) + (b.si || 0);
  if (x !== undefined && y !== undefined) {
    var bits: string[] = [];
    if (b.fe >= .5) bits.push('+' + b.fe.toFixed(1) + 'Fe');
    if (b.cu >= .5) bits.push('+' + b.cu.toFixed(1) + 'Cu');
    if (b.si >= .3) bits.push('+' + b.si.toFixed(1) + 'Si');
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
