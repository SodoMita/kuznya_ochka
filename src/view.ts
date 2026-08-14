/* Canvas bindings + viewport bookkeeping. */
import { $ } from './utils';

export let W = 320;
export let H = 240;
export let dpr = 1;
export let oldW = 320;
export let oldH = 240;

export const cv = $('cv') as HTMLCanvasElement;
export const ctx = cv.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;

export const wcv = $('worldCv') as HTMLCanvasElement;
export const wctx = wcv.getContext('2d') as CanvasRenderingContext2D;

/** Update the logical viewport size (device pixels are handled by caller). */
export function setView(w: number, h: number, d: number): void {
  W = w;
  H = h;
  dpr = d;
}

/** Remember the current size as the "previous" one for scaling. */
export function commitSize(): void {
  oldW = W;
  oldH = H;
}
