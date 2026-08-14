/* Battlefield FX: particles, floating text, expanding rings. */
import { S } from './state';

export function burst(x: number, y: number, col: string, n: number): void {
  if (S.parts.length > 240) return;
  for (var i = 0; i < n; i++) {
    S.parts.push({
      x: x,
      y: y,
      vx: (Math.random() - .5) * 90,
      vy: (Math.random() - .5) * 90 - 20,
      life: .4 + Math.random() * .4,
      col: col,
      grav: 90
    });
  }
}

export function float(x: number, y: number, txt: string, col: string): void {
  S.floats.push({ x: x, y: y, txt: txt, col: col, t: 1.1 });
}
