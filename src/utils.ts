/* Small shared helpers — no game state, no DOM dependencies beyond $(). */

export function $(id: string): HTMLElement {
  return document.getElementById(id)!;
}

/** Deterministic PRNG (mulberry32) — seeds all procedural generation. */
export function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(v: number, a: number, b: number): number {
  return v < a ? a : v > b ? b : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function fmt(n: number): string {
  return n >= 10000 ? (n / 1000).toFixed(1) + 'k' : Math.floor(n) + '';
}

/** Compact fixed-point formatting for floats on the battlefield: trims the
    meaningless ".0" from integer values. */
export function fmtF(n: number, digits?: number): string {
  var d = digits === undefined ? 1 : digits;
  var s = n.toFixed(d);
  if (s.indexOf('.') >= 0) s = s.replace(/\.?0+$/, '');
  return s;
}

export function hexA(h: string, a: number): string {
  var r = parseInt(h.slice(1, 3), 16),
      g = parseInt(h.slice(3, 5), 16),
      b = parseInt(h.slice(5, 7), 16);
  return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
}

export function pad2(n: number): string {
  return (n < 10 ? '0' : '') + n;
}

/** Lighten (amt > 0) or darken (amt < 0) a #rrggbb color by `amt` 0..1. */
export function shade(h: string, amt: number): string {
  var r = parseInt(h.slice(1, 3), 16),
      g = parseInt(h.slice(3, 5), 16),
      b = parseInt(h.slice(5, 7), 16),
      t = amt < 0 ? 0 : 255,
      p = amt < 0 ? -amt : amt;
  r = Math.round((t - r) * p + r);
  g = Math.round((t - g) * p + g);
  b = Math.round((t - b) * p + b);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

/** Same as shade() but returns an rgba() string with explicit alpha. */
export function shadeA(h: string, amt: number, a: number): string {
  return shade(h, amt).replace('rgb(', 'rgba(').replace(')', ',' + a + ')');
}

/** localStorage with graceful fallbacks (file://, jsdom, disabled storage). */
const mem: Record<string, string> = {};
export function storeGet(key: string): string | null {
  try {
    var v = window.localStorage.getItem(key);
    return v === null ? (key in mem ? mem[key] : null) : v;
  } catch (e) {
    return key in mem ? mem[key] : null;
  }
}
export function storeSet(key: string, val: string): void {
  try { window.localStorage.setItem(key, val); } catch (e) { /* fall through */ }
  mem[key] = val;
}
export function storeDel(key: string): void {
  try { window.localStorage.removeItem(key); } catch (e) { /* fall through */ }
  delete mem[key];
}

/** A deterministic date seed for the DAILY challenge (UTC yyyymmdd). */
export function dailySeed(): number {
  var d = new Date();
  var n = (d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate());
  return (n * 2654435761) >>> 0;
}
