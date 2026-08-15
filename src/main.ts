/* Boot, resize handling, and the fixed-timestep game loop. */
import './input';   /* attach all listeners before boot */
import { S } from './state';
import { cv, ctx, W, H, dpr, oldW, oldH, setView, commitSize } from './view';
import { clamp } from './utils';
import { CARDS } from './data';
import { genWorld } from './world';
import { genSector, buildGraphPx, repathEnemies, routePolyline, pointOnPoly } from './sectors';
import { initRunDeck, sectorShuffle } from './deck';
import { hud, toast, applySettingsBody } from './hud';
import { draw } from './render';
import { fixedUpdate } from './sim';
import { spawnEnemy } from './enemies';
import { towerMhp, scavMult, boardCostMult } from './economy';
import { effCost } from './deck';
import { loadSettings, loadRun, loadHistory, loadBest, hasSave, saveRun, clearSave } from './persist';

/* deterministic test/debug hook — lets the verification harnesses exercise
   every blueprint and hostile class without random drafts */
(window as any).__FZ = {
  get S() { return S; },
  debugDeploy: function (i: number, x: number, y: number) {
    var mhp = towerMhp({ i: i, lvl: 1 } as any);
    S.towers.push({
      x: x, y: y, i: i, lvl: 1, cool: 0, ang: -Math.PI / 2, flash: 0, slow: 0,
      tgt: 'first', inv: { fe: CARDS[i].cost.fe, cu: CARDS[i].cost.cu, si: CARDS[i].cost.si },
      mods: [], hp: mhp, mhp: mhp, kills: 0, caps: 0, dealt: 0, dropT: .1, jam: 0
    });
  },
  debugSpawn: function (type: string) { spawnEnemy(type); },
  /* formula hooks the balance crosscheck proves against */
  effCost: effCost,
  boardCostMult: boardCostMult,
  scavMult: scavMult,
  towerMhp: towerMhp,
  saveRun: saveRun,
  loadRun: loadRun,
  clearSave: clearSave
};

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

/* ---- settings & persisted run ---- */
var st = loadSettings();
if (st) S.settings = st;
applySettingsBody();
loadHistory();
loadBest();

var resumed = false;
if (hasSave()) {
  resumed = loadRun();
}
if (!resumed || !S.deck.length) { initRunDeck(); sectorShuffle(); }
if (!S.nodes.length) { resize(); genSector(); }
/* restored enemies: rebuild their pixel routes on the fresh terrain */
if (S.pendingEnemies) {
  S.pendingEnemies.forEach(function (pd) {
    var rp = routePolyline(pd.route);
    var p = pointOnPoly(rp.pts, rp.len, Math.max(0, pd.d));
    S.enemies.push({
      type: pd.type, d: Math.min(pd.d, rp.len), hp: pd.hp, mhp: pd.mhp, sp: pd.sp,
      armor: pd.armor, reward: pd.reward, size: pd.size, col: pd.col, regen: pd.regen,
      slow: 0, slowT: pd.slowT, frozen: false, flash: 0, burn: pd.burn, burnT: pd.burnT,
      beamT: -1, stun: pd.stun, gravT: pd.gravT, vet: pd.vet, perk: pd.perk, bossT: 0,
      x: p.x, y: p.y, ang: p.ang, dead: false, route: pd.route, routePx: rp.pts, routeLen: rp.len
    });
  });
  S.pendingEnemies = null;
  if (S.phase === 'wave' && !S.enemies.length && !S.spawnQ.length) S.phase = 'build';
}
/* restored towers: project unit coords once the real viewport is known */
if (S.pendingTowers) {
  S.towers = S.pendingTowers.map(function (pt) {
    var mhp = towerMhp({ i: pt.i, lvl: pt.lvl } as any);
    return {
      x: clamp(pt.x * W, 14, W - 14), y: clamp(pt.y * H, 14, H - 14),
      i: pt.i, lvl: pt.lvl, cool: 0, ang: -Math.PI / 2, flash: 0, slow: 0,
      tgt: pt.tgt, inv: { fe: pt.inv.fe, cu: pt.inv.cu, si: pt.inv.si }, mods: pt.mods.slice(),
      hp: Math.min(pt.hp, mhp), mhp: mhp, kills: pt.kills, caps: pt.caps, dealt: pt.dealt,
      dropT: 0, jam: 0
    };
  });
  S.pendingTowers = null;
}
if (resumed) toast('RUN RESUMED — SEED ' + S.seed + ' · WAVE ' + S.wave);

addEventListener('resize', function () { resize(); });
addEventListener('orientationchange', function () { setTimeout(resize, 120); });

/* auto-pause when the tab loses focus */
document.addEventListener('visibilitychange', function () {
  if (document.hidden && S.settings.autopause && !S.over && !S.modalOpen) {
    S.paused = true;
    hud(true);
  }
});

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
