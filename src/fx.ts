/* Battlefield FX: particles, floating text, expanding rings, trails, debris, screen flash. */
import { S } from './state';
import type { Part } from './types';

/** Particle budget by settings.particles (0 low · 1 normal · 2 high). */
function cap(): number {
  return S.settings.particles === 0 ? 120 : S.settings.particles === 2 ? 600 : 300;
}

/** Explosive burst — directional debris spray */
export function burst(x: number, y: number, col: string, n: number): void {
  if (S.parts.length > cap()) return;
  for (var i = 0; i < n; i++) {
    var a = Math.random() * 6.283, sp = 30 + Math.random() * 80;
    S.parts.push({
      x: x + (Math.random() - .5) * 6,
      y: y + (Math.random() - .5) * 6,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp - 15,
      life: .3 + Math.random() * .45,
      col: col,
      grav: 80
    });
  }
}

/** Ring burst — radial particles in a circle */
export function ringBurst(x: number, y: number, col: string, n: number, speed: number): void {
  if (S.parts.length > cap()) return;
  for (var i = 0; i < n; i++) {
    var a = (i / n) * 6.283;
    S.parts.push({
      x: x, y: y,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life: .35 + Math.random() * .25,
      col: col,
      grav: 0
    });
  }
}

/** Spark shower — upward biased sparks */
export function sparks(x: number, y: number, col: string, n: number): void {
  if (S.parts.length > cap()) return;
  for (var i = 0; i < n; i++) {
    S.parts.push({
      x: x + (Math.random() - .5) * 8,
      y: y + (Math.random() - .5) * 4,
      vx: (Math.random() - .5) * 40,
      vy: -30 - Math.random() * 60,
      life: .2 + Math.random() * .35,
      col: col,
      grav: 40
    });
  }
}

/** Debris chunks — heavy, slow-falling fragments */
export function debris(x: number, y: number, col: string, n: number): void {
  if (S.parts.length > cap()) return;
  for (var i = 0; i < n; i++) {
    S.parts.push({
      x: x + (Math.random() - .5) * 10,
      y: y + (Math.random() - .5) * 10,
      vx: (Math.random() - .5) * 50,
      vy: (Math.random() - .5) * 50 - 20,
      life: .5 + Math.random() * .5,
      col: col,
      grav: 120
    });
  }
}

/** Floating damage/status text */
export function float(x: number, y: number, txt: string, col: string): void {
  if (S.floats.length > 80) S.floats.shift();
  S.floats.push({ x: x, y: y, txt: txt, col: col, t: 1.1 });
}

/** Big float — larger, slower */
export function bigFloat(x: number, y: number, txt: string, col: string): void {
  if (S.floats.length > 80) S.floats.shift();
  S.floats.push({ x: x, y: y, txt: txt, col: col, t: 1.6 });
}

/** Shockwave ring (already exists via S.rings, this is a convenience) */
export function shockwave(x: number, y: number, col: string, maxR: number): void {
  S.rings.push({ x: x, y: y, r: 3, max: maxR, col: col });
}

/** Screen shake impulse — respects the shake setting. */
export function shake(amount: number): void {
  if (!S.settings.shake) return;
  S.shake = Math.min(10, S.shake + amount);
}

/** Dust puff — soft ground burst for placements. */
export function dust(x: number, y: number): void {
  if (S.parts.length > cap()) return;
  for (var i = 0; i < 6; i++) {
    var a = Math.random() * 6.283;
    S.parts.push({
      x: x, y: y + 4,
      vx: Math.cos(a) * (8 + Math.random() * 14),
      vy: -6 - Math.random() * 10,
      life: .4 + Math.random() * .3,
      col: '#8f9aa0',
      grav: 26
    });
  }
}
