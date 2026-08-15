/* Boot, resize handling, and the fixed-timestep game loop. */
import './input';   /* attach all listeners before boot */
import { S } from './state';
import { cv, ctx, W, H, dpr, oldW, oldH, setView, commitSize } from './view';
import { clamp } from './utils';
import { genWorld } from './world';
import { genSector, buildGraphPx, repathEnemies } from './sectors';
import { initRunDeck, sectorShuffle } from './deck';
import { hud } from './hud';
import { draw } from './render';
import { fixedUpdate } from './sim';

function resize(): void {
  var r = cv.parentElement!.getBoundingClientRect();
  var d = Math.min(window.devicePixelRatio || 1, 2);
  setView(Math.max(200, r.width), Math.max(160, r.height), d);
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (S.nodes.length) {
    var rx = W / oldW, ry = H / oldH;
    S.towers.forEach(function (t) {
      t.x = clamp(t.x * rx, 14, W - 14);
      t.y = clamp(t.y * ry, 14, H - 14);
    });
    buildGraphPx();
    repathEnemies();
  }
  commitSize();
}

if (!S.deck.length) { initRunDeck(); sectorShuffle(); }
if (!S.nodes.length) { resize(); genSector(); }
addEventListener('resize', function () { resize(); });
addEventListener('orientationchange', function () { setTimeout(resize, 120); });

var last = performance.now(), acc = 0, DT = 1 / 60, hudT = 0;

function frame(now: number): void {
  var real = Math.min(.1, (now - last) / 1000);
  last = now;
  acc += real * S.speed;
  var loops = 0;
  while (acc >= DT && loops < 400) { fixedUpdate(DT); acc -= DT; loops++; }
  if (loops >= 400) acc = 0;
  draw();
  hudT += real;
  if (hudT > .2) { hudT = 0; hud(false); }
  requestAnimationFrame(frame);
}

genWorld();
genSector();
resize();
hud(true);
requestAnimationFrame(frame);
