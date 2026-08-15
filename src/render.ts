/* Canvas rendering of the battlefield. Pure draw — mutates visuals only. */
import { S } from './state';
import { ctx, W, H, dpr } from './view';
import { CARDS, TGT_LABEL } from './data';
import { hexA, clamp, shade, shadeA } from './utils';
import { sector, canAfford, usedGrid, gridCap, capZone } from './economy';
import { stats } from './towers';
import { selBoard, modById } from './deck';
import type { Tower, Enemy, SectorDef } from './types';

/* ---- gradient caches ----
   Canvas gradients are resolved against the transform in effect when they are
   *used*, so any gradient whose coordinates are constant in local space can be
   built once and reused every frame. That keeps the 60Hz loop allocation-free. */
let bgKey = '';
let bgGrad: CanvasGradient | null = null;
let hzKey = '';
let hzGrad: CanvasGradient | null = null;
let vgKey = '';
let vgGrad: CanvasGradient | null = null;

/* local-space gradients: built lazily on first use, then reused forever */
const LG: Record<string, CanvasGradient> = {};

function lgrad(key: string, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): CanvasGradient {
  var g = LG[key];
  if (!g) {
    g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    LG[key] = g;
  }
  return g;
}

function rgrad(key: string, x0: number, y0: number, r0: number, x1: number, y1: number, r1: number, stops: [number, string][]): CanvasGradient {
  var g = LG[key];
  if (!g) {
    g = ctx.createRadialGradient(x0, y0, r0, x1, y1, r1);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    LG[key] = g;
  }
  return g;
}

function bgFill(sec: SectorDef): CanvasGradient {
  var key = sec.tint + '|' + W + '|' + H;
  if (key !== bgKey || !bgGrad) {
    bgKey = key;
    var g = ctx.createLinearGradient(0, 0, W * .35, H);
    g.addColorStop(0, shade(sec.tint, .13));   /* lit from the upper-left */
    g.addColorStop(.55, sec.tint);
    g.addColorStop(1, shade(sec.tint, -.42));  /* ground falls into shadow */
    bgGrad = g;
  }
  return bgGrad;
}

/* Survey grid layer: minor lines every 26px, brighter majors every 4th. */
let gridCv: HTMLCanvasElement | null = null;
let gridKey = '';

function bakeGrid(sec: SectorDef): void {
  var key = sec.grid + '|' + W + '|' + H + '|' + dpr + '|' + S.sectorGen;
  if (key === gridKey && gridCv) return;
  gridKey = key;
  if (!gridCv) gridCv = document.createElement('canvas');
  gridCv.width = Math.max(1, Math.round(W * dpr));
  gridCv.height = Math.max(1, Math.round(H * dpr));
  var c = gridCv.getContext('2d');
  if (!c) { gridCv = null; return; }
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, H);
  c.lineWidth = 1;
  c.strokeStyle = sec.grid;
  c.globalAlpha = .34;
  c.beginPath();
  for (var gx = 0; gx < W; gx += 26) { c.moveTo(gx + .5, 0); c.lineTo(gx + .5, H); }
  for (var gy = 0; gy < H; gy += 26) { c.moveTo(0, gy + .5); c.lineTo(W, gy + .5); }
  c.stroke();
  c.strokeStyle = shade(sec.grid, .22);
  c.globalAlpha = .4;
  c.beginPath();
  for (var gx2 = 0, gi = 0; gx2 < W; gx2 += 26, gi++) {
    if (gi % 4) continue;
    c.moveTo(gx2 + .5, 0);
    c.lineTo(gx2 + .5, H);
  }
  for (var gy2 = 0, gj = 0; gy2 < H; gy2 += 26, gj++) {
    if (gj % 4) continue;
    c.moveTo(0, gy2 + .5);
    c.lineTo(W, gy2 + .5);
  }
  c.stroke();
  c.globalAlpha = 1;
}

/* Ruined-skyline layer: silhouettes, rim light, lit windows and antenna masts.
   Static for a sector + viewport, so it is baked once. */
let skyCv: HTMLCanvasElement | null = null;
let skyKey = '';

function bakeSky(sec: SectorDef): void {
  var key = sec.path + '|' + W + '|' + H + '|' + dpr + '|' + S.sectorGen;
  if (key === skyKey && skyCv) return;
  skyKey = key;
  if (!skyCv) skyCv = document.createElement('canvas');
  skyCv.width = Math.max(1, Math.round(W * dpr));
  skyCv.height = Math.max(1, Math.round(H * dpr));
  var c = skyCv.getContext('2d');
  if (!c) { skyCv = null; return; }
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, H);
  /* far haze layer */
  for (var i = 0; i < S.sky.length; i++) {
    var skf = S.sky[i];
    var fh = skf.h * H * .62, fx = skf.x * W + W * .012;
    c.fillStyle = 'rgba(0,0,0,.13)';
    c.fillRect(fx, H - fh, skf.w * W * .8 + 1, fh);
  }
  /* near solid layer */
  for (var j = 0; j < S.sky.length; j++) {
    var sk = S.sky[j];
    var bx = sk.x * W, bw = sk.w * W + 1, bh = sk.h * H, by = H - bh;
    c.fillStyle = 'rgba(0,0,0,.30)';
    c.fillRect(bx, by, bw, bh);
    /* rim light on the left edge separates overlapping towers */
    c.fillStyle = shadeA(sec.path, .3, .16);
    c.fillRect(bx, by, 1, bh);
    /* a couple of lit windows per building — deterministic from index */
    if (bw > 9 && bh > 14) {
      var wc = ((j * 7) % 3) + 1;
      for (var wI = 0; wI < wc; wI++) {
        var wy = by + 5 + ((j * 13 + wI * 29) % Math.max(1, Math.floor(bh - 10)));
        var wx = bx + 2 + ((j * 5 + wI * 11) % Math.max(1, Math.floor(bw - 5)));
        c.fillStyle = hexA('#ffb45e', .14);
        c.fillRect(wx, wy, 1.5, 2);
      }
    }
    if (sk.ant) {
      c.fillStyle = 'rgba(0,0,0,.30)';
      c.fillRect(bx + bw * .5 - .5, by - 5, 1, 5);              /* mast */
    }
  }
}

export function draw(): void {
  var sec = sector(), i;
  ctx.fillStyle = bgFill(sec);
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  /* horizon glow — a warm forge haze sitting behind the ruins */
  var hzk = sec.path + '|' + H;
  if (hzk !== hzKey || !hzGrad) {
    hzKey = hzk;
    hzGrad = ctx.createLinearGradient(0, H * .52, 0, H);
    hzGrad.addColorStop(0, 'rgba(0,0,0,0)');
    hzGrad.addColorStop(1, shadeA(sec.path, .35, .28));
  }
  ctx.fillStyle = hzGrad;
  ctx.fillRect(0, H * .52, W, H * .48);

  /* drifting smog motes — ambient, real-time */
  ctx.save();
  for (i = 0; i < S.motes.length; i++) {
    var m = S.motes[i];
    m.x += m.vx * .016;
    m.y += m.vy * .016;
    if (m.x < 0) m.x = W;
    if (m.x > W) m.x = 0;
    if (m.y < 0) m.y = H;
    if (m.y > H) m.y = 0;
    ctx.globalAlpha = m.a * .25;
    ctx.fillStyle = '#d4c8b0';
    ctx.fillRect(m.x, m.y, m.r, m.r);
  }
  ctx.restore();

  /* ruined skyline — static silhouette blitted from a baked layer, with only
     the blinking antenna beacons drawn live on top */
  bakeSky(sec);
  if (skyCv) ctx.drawImage(skyCv, 0, 0, W, H);
  for (i = 0; i < S.sky.length; i++) {
    var skb = S.sky[i];
    if (!skb.ant) continue;
    var bx2 = skb.x * W, bw2 = skb.w * W + 1, by2 = H - skb.h * H;
    var apu = (Math.sin(S.time * 2 + i * 2) + 1) / 2;
    ctx.fillStyle = hexA('#e5484d', .25 + .5 * apu);
    ctx.fillRect(bx2 + bw2 * .5 - 1, by2 - 7, 2, 3);
    if (apu > .6) {                                            /* soft beacon halo */
      ctx.fillStyle = hexA('#e5484d', (apu - .6) * .22);
      ctx.fillRect(bx2 + bw2 * .5 - 3.5, by2 - 9, 7, 7);
    }
  }

  /* rising forge embers — with glow */
  for (i = 0; i < S.embers.length; i++) {
    var em = S.embers[i];
    em.y -= em.vy * .016;
    em.x += Math.sin(S.time * 2 + em.ph) * .3;
    if (em.y < -2) { em.y = H; em.x = Math.random() * W; }
    ctx.globalAlpha = .18 + .14 * Math.sin(S.time * 5 + em.ph);
    ctx.fillStyle = '#e8c090';
    ctx.fillRect(em.x, em.y, 1.5, 2.5);
  }
  ctx.globalAlpha = 1;

  /* survey grid — static per sector, so it is baked once and blitted */
  bakeGrid(sec);
  if (gridCv) ctx.drawImage(gridCv, 0, 0, W, H);

  /* grid pulse — expanding circle of light across grid lines */
  if (S.gridPulse && S.gridPulse.a > 0) {
    var gp = S.gridPulse;
    gp.r += 180 * (1 / 60);
    gp.a -= 0.8 * (1 / 60);
    if (gp.a < 0) { gp.a = 0; S.gridPulse = null; }
    else {
      ctx.save();
      ctx.globalAlpha = gp.a;
      ctx.strokeStyle = gp.col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(gp.x, gp.y, gp.r, 0, 7);
      ctx.stroke();
      ctx.restore();
    }
  }

  /* shake */
  ctx.save();
  if (S.shake > 0) {
    var sx = (Math.random() - .5) * S.shake;
    var sy = (Math.random() - .5) * S.shake;
    ctx.translate(sx, sy);
  }

  /* build pads — bracket corners, and they breathe while a board is held */
  var ghostBoard = selBoard();
  var padPulse = ghostBoard ? .45 + .3 * ((Math.sin(S.time * 4) + 1) / 2) : .16;
  ctx.globalAlpha = padPulse;
  ctx.strokeStyle = ghostBoard ? '#3ec9b0' : '#8fa0a6';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  for (i = 0; i < S.spots.length; i++) {
    var sp = S.spots[i];
    if (ghostBoard) {
      ctx.fillStyle = 'rgba(62,201,176,.07)';
      ctx.fillRect(sp.px - 5, sp.py - 5, 10, 10);
    }
    /* corner brackets read cleaner than a full box at small sizes */
    var q = 5, a2 = 2.2;
    ctx.beginPath();
    ctx.moveTo(sp.px - q, sp.py - q + a2); ctx.lineTo(sp.px - q, sp.py - q); ctx.lineTo(sp.px - q + a2, sp.py - q);
    ctx.moveTo(sp.px + q - a2, sp.py - q); ctx.lineTo(sp.px + q, sp.py - q); ctx.lineTo(sp.px + q, sp.py - q + a2);
    ctx.moveTo(sp.px + q, sp.py + q - a2); ctx.lineTo(sp.px + q, sp.py + q); ctx.lineTo(sp.px + q - a2, sp.py + q);
    ctx.moveTo(sp.px - q + a2, sp.py + q); ctx.lineTo(sp.px - q, sp.py + q); ctx.lineTo(sp.px - q, sp.py + q - a2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  drawPath(sec);
  drawCore();
  drawSpawn();

  /* ghost preview */
  if (S.ghost && ghostBoard && !S.modalOpen) {
    var c = ghostBoard,
        gpx = S.ghost.sx != null ? S.ghost.sx : S.ghost.x,
        gpy = S.ghost.sy != null ? S.ghost.sy : S.ghost.y;
    var posOk = S.ghost.sx != null, afford = canAfford(c.cost) && usedGrid() + c.draw <= gridCap();
    var gcol = !posOk ? '#f04a50' : (afford ? '#3edcb0' : '#ffb83a');
    if (posOk && (Math.abs(gpx - S.ghost.x) > 3 || Math.abs(gpy - S.ghost.y) > 3)) {
      ctx.strokeStyle = 'rgba(143,160,166,.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(S.ghost.x, S.ghost.y);
      ctx.lineTo(gpx, gpy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeRect(S.ghost.x - 3, S.ghost.y - 3, 6, 6);
    }
    ctx.globalAlpha = .45;
    ctx.fillStyle = posOk && afford ? c.col : gcol;
    ctx.fillRect(gpx - 8, gpy - 8, 16, 16);
    ctx.globalAlpha = .3;
    ctx.strokeStyle = gcol;
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = -S.time * 20;
    ctx.beginPath();
    ctx.arc(gpx, gpy, c.range, 0, 7);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.globalAlpha = 1;
  }

  /* towers */
  for (i = 0; i < S.towers.length; i++) drawTower(S.towers[i]);

  /* aegis slow fields — radial gradient instead of flat fill */
  for (i = 0; i < S.towers.length; i++) {
    if (CARDS[S.towers[i].i].id === 'aegis') {
      var at = S.towers[i], ar = (at._st || stats(at)).range, ap = (Math.sin(S.time * 3 + at.x) + 1) / 2;
      var aegisGrad = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, ar);
      aegisGrad.addColorStop(0, 'rgba(62,220,176,.07)');
      aegisGrad.addColorStop(0.5, 'rgba(62,220,176,.03)');
      aegisGrad.addColorStop(1, 'rgba(62,220,176,0)');
      ctx.fillStyle = aegisGrad;
      ctx.beginPath();
      ctx.arc(at.x, at.y, ar, 0, 7);
      ctx.fill();
      ctx.strokeStyle = hexA('#3edcb0', .12 + .1 * ap);
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -S.time * 14;
      ctx.beginPath();
      ctx.arc(at.x, at.y, ar, 0, 7);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }
  }

  /* selected range + ID tag */
  if (S.selTower && S.towers.indexOf(S.selTower) >= 0) {
    var st2 = stats(S.selTower), lt = S.selTower, lc = CARDS[lt.i];
    ctx.strokeStyle = 'rgba(62,220,176,.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.lineDashOffset = -S.time * 20;
    ctx.beginPath();
    ctx.arc(lt.x, lt.y, st2.range, 0, 7);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    /* range fill */
    ctx.fillStyle = 'rgba(62,220,176,.02)';
    ctx.beginPath();
    ctx.arc(lt.x, lt.y, st2.range, 0, 7);
    ctx.fill();
    var lbl = lc.name + ' L' + lt.lvl + (lc.id === 'foundry' ? '' : ' · ' + TGT_LABEL[lt.tgt]);
    ctx.font = '600 8px "JetBrains Mono",ui-monospace,Menlo,monospace';
    var tw = ctx.measureText(lbl).width, lx = clamp(lt.x, tw / 2 + 6, W - tw / 2 - 6), ly = lt.y - 28;
    /* tag bg with gradient */
    var tagGrad = ctx.createLinearGradient(lx - tw / 2 - 6, ly - 9, lx + tw / 2 + 6, ly + 6);
    tagGrad.addColorStop(0, 'rgba(10,18,22,.92)');
    tagGrad.addColorStop(1, 'rgba(14,22,28,.92)');
    ctx.fillStyle = tagGrad;
    ctx.fillRect(lx - tw / 2 - 6, ly - 9, tw + 12, 15);
    ctx.strokeStyle = 'rgba(62,220,176,.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(lx - tw / 2 - 6, ly - 9, tw + 12, 15);
    ctx.fillStyle = '#3edcb0';
    ctx.textAlign = 'center';
    ctx.fillText(lbl, lx, ly + 1);
    ctx.textAlign = 'left';
  }

  /* tractor beams — glowing channel + capture progress arc */
  for (i = 0; i < S.beams.length; i++) {
    var bm = S.beams[i];
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(62,201,176,.22)';      /* soft outer channel */
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(bm.tw.x, bm.tw.y);
    ctx.lineTo(bm.en.x, bm.en.y);
    ctx.stroke();
    ctx.strokeStyle = '#3ec9b0';                   /* travelling energy dashes */
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 4]);
    ctx.lineDashOffset = -S.time * 40;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.globalCompositeOperation = 'source-over';
    /* progress ring around the victim */
    ctx.strokeStyle = 'rgba(0,0,0,.5)';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(bm.en.x, bm.en.y, bm.en.size + 5, 0, 7);
    ctx.stroke();
    ctx.strokeStyle = '#3ec9b0';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(bm.en.x, bm.en.y, bm.en.size + 5, -Math.PI / 2, -Math.PI / 2 + bm.t * 6.283);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  /* enemies — with motion trails */
  for (i = 0; i < S.enemies.length; i++) drawEnemy(S.enemies[i]);

  /* shots — additive so overlapping fire blooms instead of muddying */
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (i = 0; i < S.shots.length; i++) {
    var sh = S.shots[i];
    var sa = Math.min(1, sh.life * 12);
    if (sh.kind === 1) {
      /* arc lightning: jagged multi-segment bolt with a soft outer glow */
      var jx = (Math.random() - .5) * 10, jy = (Math.random() - .5) * 10;
      var mx = (sh.x + sh.tx) / 2 + jx, my = (sh.y + sh.ty) / 2 + jy;
      ctx.globalAlpha = sa * .3;
      ctx.strokeStyle = sh.col;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(sh.x, sh.y);
      ctx.lineTo(mx, my);
      ctx.lineTo(sh.tx, sh.ty);
      ctx.stroke();
      ctx.globalAlpha = sa;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = '#f2fbff';
      ctx.lineWidth = .8;
      ctx.stroke();
    } else if (sh.kind === 3) {
      /* lobbed mortar shell: curved arc with a soft trail */
      var cxq = (sh.x + sh.tx) / 2, cyq = Math.min(sh.y, sh.ty) - 14;
      ctx.globalAlpha = sa * .3;
      ctx.strokeStyle = sh.col;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(sh.x, sh.y);
      ctx.quadraticCurveTo(cxq, cyq, sh.tx, sh.ty);
      ctx.stroke();
      ctx.globalAlpha = sa;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (sh.kind === 2) {
      /* rail bolt: wide colored bloom wrapping a hot white core */
      ctx.globalAlpha = sa * .28;
      ctx.strokeStyle = sh.col;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(sh.x, sh.y);
      ctx.lineTo(sh.tx, sh.ty);
      ctx.stroke();
      ctx.globalAlpha = sa;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = '#fffbe8';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    } else {
      ctx.globalAlpha = sa * .3;
      ctx.strokeStyle = sh.col;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(sh.x, sh.y);
      ctx.lineTo(sh.tx, sh.ty);
      ctx.stroke();
      ctx.globalAlpha = sa;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  ctx.lineCap = 'butt';
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  /* particles — additive sparks that shrink as they die */
  ctx.globalCompositeOperation = 'lighter';
  for (i = 0; i < S.parts.length; i++) {
    var pt = S.parts[i];
    var pl = Math.max(0, Math.min(1, pt.life * 2));
    var ps = .8 + pl * 1.9;
    ctx.globalAlpha = pl;
    ctx.fillStyle = pt.col;
    ctx.fillRect(pt.x - ps / 2, pt.y - ps / 2, ps, ps);
    if (pl > .65) {                       /* hot core while fresh */
      ctx.globalAlpha = (pl - .65) * 1.6;
      ctx.fillStyle = '#fff';
      ctx.fillRect(pt.x - .5, pt.y - .5, 1, 1);
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  /* rings — additive shockwaves that thin out as they expand */
  ctx.globalCompositeOperation = 'lighter';
  for (i = 0; i < S.rings.length; i++) {
    var rg = S.rings[i];
    var rf = rg.r / rg.max;
    ctx.globalAlpha = (1 - rf) * .9;
    ctx.strokeStyle = rg.col;
    ctx.lineWidth = 2.4 * (1 - rf) + .4;
    ctx.beginPath();
    ctx.arc(rg.x, rg.y, rg.r, 0, 7);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  /* floats — outlined so numbers stay legible over any terrain */
  ctx.font = 'bold 10px ui-monospace,Menlo,monospace';
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  for (i = 0; i < S.floats.length; i++) {
    var f = S.floats[i];
    /* fade in fast, drift out slow */
    ctx.globalAlpha = Math.min(1, f.t * 2.2);
    ctx.strokeStyle = 'rgba(0,0,0,.85)';
    ctx.lineWidth = 3;
    ctx.strokeText(f.txt, f.x, f.y);
    ctx.fillStyle = f.col;
    ctx.fillText(f.txt, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
  ctx.restore();

  /* vignette */
  var vgk = W + 'x' + H;
  if (vgk !== vgKey || !vgGrad) {
    vgKey = vgk;
    vgGrad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.max(W, H) * .75);
    vgGrad.addColorStop(0, 'rgba(0,0,0,0)');
    vgGrad.addColorStop(1, 'rgba(0,0,0,.42)');
  }
  ctx.fillStyle = vgGrad;
  ctx.fillRect(0, 0, W, H);

  /* SURGE overdrive: warm wash + pulsing gold frame around the viewport */
  if (S.time < S.ability.surge.until) {
    var sgp = (Math.sin(S.time * 8) + 1) / 2;
    ctx.fillStyle = 'rgba(255,210,63,.05)';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = hexA('#ffd23f', .2 + sgp * .2);
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
  }

  /* low-core danger vignette — pulses red as the core nears failure */
  var cf = S.core / S.coreMax;
  if (cf <= .35 && !S.over) {
    var dv = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.max(W, H) * .7);
    var dvA = (.16 + .1 * ((Math.sin(S.time * 4) + 1) / 2)) * (1 - cf / .35);
    dv.addColorStop(0, 'rgba(229,72,77,0)');
    dv.addColorStop(1, hexA('#e5484d', dvA));
    ctx.fillStyle = dv;
    ctx.fillRect(0, 0, W, H);
  }

  if (S.paused) {
    ctx.fillStyle = 'rgba(8,12,14,.62)';
    ctx.fillRect(0, 0, W, H);
    /* pause bars + label */
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(234,229,216,.9)';
    ctx.fillRect(W / 2 - 13, H / 2 - 34, 8, 24);
    ctx.fillRect(W / 2 + 5, H / 2 - 34, 8, 24);
    ctx.font = '30px Impact,Haettenschweiler,sans-serif';
    ctx.fillStyle = '#eae5d8';
    ctx.fillText('PAUSED', W / 2, H / 2 + 12);
    ctx.font = 'bold 9px ui-monospace,Menlo,monospace';
    ctx.fillStyle = '#8c9da4';
    ctx.fillText('PRESS [P] TO RESUME', W / 2, H / 2 + 30);
    ctx.textAlign = 'left';
  }
}

/* The road network is static for a given sector + viewport, but it takes seven
   stroke passes to build. Bake those into an offscreen layer and blit it each
   frame; only the animated flow dashes are drawn live on top. */
let roadCv: HTMLCanvasElement | null = null;
let roadKey = '';

function bakeRoads(sec: SectorDef): void {
  var key = sec.path + '|' + W + '|' + H + '|' + dpr + '|' + S.sectorGen;
  if (key === roadKey && roadCv) return;
  roadKey = key;
  if (!roadCv) roadCv = document.createElement('canvas');
  roadCv.width = Math.max(1, Math.round(W * dpr));
  roadCv.height = Math.max(1, Math.round(H * dpr));
  var c = roadCv.getContext('2d');
  if (!c) { roadCv = null; return; }
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, W, H);
  c.lineJoin = 'round';
  c.lineCap = 'round';

  function edges(): void {
    c!.beginPath();
    for (const [a, b] of S.edges) {
      c!.moveTo(S.nodes[a].px, S.nodes[a].py);
      c!.lineTo(S.nodes[b].px, S.nodes[b].py);
    }
    c!.stroke();
  }

  /* 1. dropped shadow, offset down-right so roads sit *in* the ground */
  c.save();
  c.translate(1.5, 2);
  c.strokeStyle = 'rgba(0,0,0,.42)';
  c.lineWidth = 27;
  edges();
  c.restore();

  /* 2. graded shoulder / curb */
  c.strokeStyle = shade(sec.path, -.55);
  c.lineWidth = 26;
  edges();

  /* 3. asphalt bed with a lit upper edge */
  c.strokeStyle = shade(sec.path, .06);
  c.lineWidth = 21;
  edges();
  c.strokeStyle = shade(sec.path, -.3);
  c.lineWidth = 17;
  edges();

  /* 4. worn wheel ruts either side of the centre line */
  c.strokeStyle = shadeA(sec.path, .18, .5);
  c.lineWidth = 4.5;
  c.save();
  c.translate(0, -3.5);
  edges();
  c.translate(0, 7);
  edges();
  c.restore();

  /* 5. hot edge highlight — catches the sector's key light */
  c.strokeStyle = shadeA(sec.path, .5, .16);
  c.lineWidth = 1;
  c.save();
  c.translate(0, -10);
  edges();
  c.restore();

  /* 6. junction hubs: plated pads where roads meet */
  for (const n of S.nodes) {
    if (n.kind !== 'junc') continue;
    c.fillStyle = shade(sec.path, -.5);
    c.fillRect(n.px - 5, n.py - 5, 10, 10);
    c.strokeStyle = shadeA(sec.path, .28, .55);
    c.lineWidth = 1;
    c.strokeRect(n.px - 5.5, n.py - 5.5, 11, 11);
    c.fillStyle = shadeA(sec.path, .4, .35);
    c.fillRect(n.px - 1.5, n.py - 1.5, 3, 3);
  }
}

function drawPath(sec: SectorDef): void {
  bakeRoads(sec);
  if (roadCv) ctx.drawImage(roadCv, 0, 0, W, H);

  /* animated flow chevrons showing the direction of march — the only live pass */
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(200,191,168,.42)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 8]);
  ctx.lineDashOffset = -S.time * 26;
  strokeEdges();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

function strokeEdges(): void {
  ctx.beginPath();
  for (const [a, b] of S.edges) {
    ctx.moveTo(S.nodes[a].px, S.nodes[a].py);
    ctx.lineTo(S.nodes[b].px, S.nodes[b].py);
  }
  ctx.stroke();
}

function spawnDir(idx: number): number {
  for (const [a, b] of S.edges) {
    if (a === idx) return Math.atan2(S.nodes[b].py - S.nodes[a].py, S.nodes[b].px - S.nodes[a].px);
    if (b === idx) return Math.atan2(S.nodes[a].py - S.nodes[b].py, S.nodes[a].px - S.nodes[b].px);
  }
  return 0;
}

function drawSpawn(): void {
  for (const si of S.spawns) {
    const p = S.nodes[si];
    var pulse = (Math.sin(S.time * 4) + 1) / 2;
    /* threat glow stays axis-aligned so it isn't squashed by the gate rotation */
    ctx.save();
    ctx.translate(p.px, p.py);
    ctx.globalAlpha = .6 + pulse * .4;
    ctx.fillStyle = rgrad('gateglow', 0, 0, 2, 0, 0, 26,
      [[0, 'rgba(229,72,77,.26)'], [1, 'rgba(229,72,77,0)']]);
    ctx.fillRect(-26, -26, 52, 52);
    ctx.globalAlpha = 1;
    ctx.restore();

    ctx.save();
    ctx.translate(p.px, p.py);
    ctx.rotate(spawnDir(si));

    /* buttressed gate housing */
    ctx.fillStyle = lgrad('gate', 0, -10, 0, 10, [[0, '#26313a'], [1, '#121a1e']]);
    ctx.strokeStyle = '#93a4ab';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-9, -10);
    ctx.lineTo(4, -10);
    ctx.lineTo(6, -6);
    ctx.lineTo(6, 6);
    ctx.lineTo(4, 10);
    ctx.lineTo(-9, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    /* dark maw the hostiles pour out of */
    ctx.fillStyle = '#080b0d';
    ctx.fillRect(-6, -6.5, 8, 13);
    ctx.fillStyle = hexA('#e5484d', .12 + pulse * .2);
    ctx.fillRect(-6, -6.5, 8, 13);

    /* warning chevrons */
    ctx.strokeStyle = hexA('#e5484d', .45 + pulse * .55);
    ctx.lineWidth = 1.5;
    for (var k = 0; k < 2; k++) {
      ctx.beginPath();
      ctx.moveTo(-3.5 + k * 5, -5);
      ctx.lineTo(.5 + k * 5, 0);
      ctx.lineTo(-3.5 + k * 5, 5);
      ctx.stroke();
    }
    /* hazard stripes on the top and bottom lintel */
    ctx.fillStyle = hexA('#e5484d', .5);
    for (var s2 = 0; s2 < 4; s2++) {
      ctx.fillRect(-8 + s2 * 3.4, -10, 1.6, 1.6);
      ctx.fillRect(-8 + s2 * 3.4, 8.4, 1.6, 1.6);
    }
    ctx.restore();
  }
}

function drawCore(): void {
  var p = S.nodes[S.coreIdx], pulse = (Math.sin(S.time * 3) + 1) / 2;
  var frac = Math.max(0, S.core / S.coreMax);
  var hot = frac > .4, key = hot ? '#3ec9b0' : '#e5484d';
  /* damaged cores beat faster and harder */
  var urg = hot ? 1 : 2.2;
  var beat = (Math.sin(S.time * 3 * urg) + 1) / 2;

  ctx.save();
  ctx.translate(p.px, p.py);

  /* ground glow pool */
  ctx.globalAlpha = .7 + beat * .3;
  ctx.fillStyle = hot
    ? rgrad('corepoolT', 0, 0, 4, 0, 0, 34, [[0, 'rgba(62,201,176,.24)'], [1, 'rgba(62,201,176,0)']])
    : rgrad('corepoolR', 0, 0, 4, 0, 0, 34, [[0, 'rgba(229,72,77,.24)'], [1, 'rgba(229,72,77,0)']]);
  ctx.fillRect(-34, -34, 68, 68);
  ctx.globalAlpha = 1;

  /* outer expanding ping */
  ctx.strokeStyle = hexA(key, .3 * (1 - beat));
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 17 + beat * 9, 0, 7);
  ctx.stroke();

  /* slowly counter-rotating containment ring */
  ctx.save();
  ctx.rotate(-S.time * .55);
  ctx.strokeStyle = hexA(key, .45);
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 7]);
  ctx.beginPath();
  ctx.arc(0, 0, 19, 0, 7);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  /* hex housing */
  ctx.beginPath();
  for (var k = 0; k < 6; k++) {
    var a = k * Math.PI / 3 - Math.PI / 2, hx = Math.cos(a) * 14, hy = Math.sin(a) * 14;
    if (k) ctx.lineTo(hx, hy); else ctx.moveTo(hx, hy);
  }
  ctx.closePath();
  ctx.fillStyle = lgrad('corebody', 0, -14, 0, 14, [[0, '#20303a'], [1, '#0f1619']]);
  ctx.fill();
  ctx.strokeStyle = hexA(key, .85);
  ctx.lineWidth = 2;
  ctx.stroke();

  /* integrity arc */
  ctx.strokeStyle = key;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, 10, -Math.PI / 2, -Math.PI / 2 + frac * 6.283);
  ctx.stroke();
  ctx.lineCap = 'butt';

  /* molten centre */
  ctx.fillStyle = hexA(key, .2 + pulse * .22);
  ctx.beginPath();
  ctx.arc(0, 0, 6.5, 0, 7);
  ctx.fill();

  /* readout */
  ctx.fillStyle = '#05090a';
  ctx.font = 'bold 9px ui-monospace,Menlo,monospace';
  ctx.textAlign = 'center';
  ctx.fillText(S.core + '', 0, 4);
  ctx.fillStyle = '#eae5d8';
  ctx.fillText(S.core + '', 0, 3.2);
  ctx.textAlign = 'left';
  ctx.restore();
}

function drawTower(t: Tower): void {
  var c = CARDS[t.i], sel = t === S.selTower;
  /* contact shadow — grounds the unit on the terrain */
  ctx.fillStyle = 'rgba(0,0,0,.34)';
  ctx.beginPath();
  ctx.ellipse(t.x + 1.5, t.y + 8, 11, 4, 0, 0, 7);
  ctx.fill();
  ctx.save();
  ctx.translate(t.x, t.y);
  if (sel) {
    var pu = (Math.sin(S.time * 5) + 1) / 2;
    /* selection halo */
    ctx.globalAlpha = .08 + .06 * pu;
    ctx.fillStyle = '#3edcb0';
    ctx.beginPath();
    ctx.arc(0, 0, 17 + pu * 3, 0, 7);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  if (CARDS[t.i].id === 'foundry') {
    var glow = (Math.sin(S.time * 5 + t.x) + 1) / 2;
    /* furnace heat spill on the ground */
    ctx.globalAlpha = .6 + glow * .4;
    ctx.fillStyle = rgrad('foundryheat', 0, 2, 2, 0, 2, 20,
      [[0, 'rgba(224,133,78,.22)'], [1, 'rgba(224,133,78,0)']]);
    ctx.fillRect(-20, -18, 40, 40);
    ctx.globalAlpha = 1;
    /* chimney behind the housing */
    ctx.fillStyle = '#2b373e';
    ctx.fillRect(3, -13, 4.5, 6);
    ctx.fillStyle = '#1b2429';
    ctx.fillRect(3, -13, 4.5, 1.5);
    /* smoke puff rising from the stack */
    ctx.fillStyle = hexA('#c8bfa8', .07 + glow * .05);
    ctx.beginPath();
    ctx.arc(5.2, -16 - glow * 3, 2.6 + glow, 0, 7);
    ctx.fill();
    /* brick housing */
    ctx.fillStyle = lgrad('foundry', 0, -8, 0, 8, [[0, '#28343b'], [1, '#151d21']]);
    ctx.strokeStyle = sel ? '#3ec9b0' : '#43555e';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-9, -8, 18, 16);
    ctx.strokeRect(-9, -8, 18, 16);
    /* glowing crucible door */
    ctx.fillStyle = hexA('#e0854e', .45 + glow * .5);
    ctx.fillRect(-4, -3, 8, 8);
    ctx.fillStyle = hexA('#ffd6a5', .3 + glow * .45);
    ctx.fillRect(-2.5, -1.5, 5, 5);
    /* hot slag line at the base */
    ctx.fillStyle = hexA('#e0854e', .75 + glow * .25);
    ctx.fillRect(-9, 8, 18, 2);
    /* smoke particles hint */
    ctx.fillStyle = hexA('#5a6a70', .15 + glow * .1);
    ctx.fillRect(-2 + Math.sin(S.time * 3) * 2, -14, 3, 3);
  } else if (c.id === 'aegis') {
    /* rotating slow-field emitter: no turret body, no barrel */
    ctx.fillStyle = lgrad('aegis', 0, -9, 0, 10, [[0, '#28343b'], [1, '#141c20']]);
    ctx.strokeStyle = sel ? '#3ec9b0' : '#43555e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(8, -4);
    ctx.lineTo(8, 5);
    ctx.lineTo(0, 10);
    ctx.lineTo(-8, 5);
    ctx.lineTo(-8, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    /* counter-rotating emitter cage */
    ctx.save();
    ctx.rotate(-S.time * .9);
    ctx.strokeStyle = hexA('#3ec9b0', .4);
    ctx.lineWidth = 1;
    ctx.strokeRect(-5.5, -5.5, 11, 11);
    ctx.restore();
    ctx.save();
    ctx.rotate(S.time * 1.5);
    ctx.fillStyle = '#3edcb0';
    ctx.fillRect(-3.5, -3.5, 7, 7);
    ctx.fillStyle = hexA('#d6fff5', .75);
    ctx.fillRect(-1.5, -1.5, 3, 3);
    ctx.restore();
    var pu3 = (Math.sin(S.time * 4) + 1) / 2;
    ctx.strokeStyle = hexA('#3edcb0', .18 + .25 * pu3);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 11 + pu3 * 3, 0, 7);
    ctx.stroke();
  } else {
    /* armoured base plate with a top-lit metal gradient */
    ctx.fillStyle = lgrad('tbase', 0, -9, 0, 9, [[0, '#2b373f'], [.55, '#1c262b'], [1, '#131a1e']]);
    ctx.strokeStyle = sel ? '#3ec9b0' : '#43555e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-9, -9);
    ctx.lineTo(9, -9);
    ctx.lineTo(9, 6);
    ctx.lineTo(5, 9);
    ctx.lineTo(-5, 9);
    ctx.lineTo(-9, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    /* corner rivets */
    ctx.fillStyle = 'rgba(255,255,255,.13)';
    ctx.fillRect(-7.5, -7.5, 1.5, 1.5);
    ctx.fillRect(6, -7.5, 1.5, 1.5);
    /* faint type-colored status LED on the hull */
    ctx.fillStyle = hexA(c.col, .55);
    ctx.fillRect(-1, -8.5, 2, 1.5);

    ctx.rotate(t.ang);
    /* turret ring + housing */
    ctx.fillStyle = '#0e1517';
    ctx.beginPath();
    ctx.arc(0, 0, 5.4, 0, 7);
    ctx.fill();
    ctx.fillStyle = lgrad('tturret', 0, -4, 0, 4, [[0, '#3b4a52'], [1, '#222d33']]);
    ctx.fillRect(-4, -4, 8, 8);
    ctx.strokeStyle = 'rgba(255,255,255,.09)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-3.5, -3.5, 7, 7);

    ctx.fillStyle = c.col;
    if (c.id === 'arc') {
      ctx.fillRect(2, -1.5, 10, 3);
      ctx.fillRect(9, -3.5, 2, 7);
      ctx.fillStyle = hexA(c.col, .35);          /* coil bloom */
      ctx.fillRect(10.5, -4.5, 2, 9);
    } else if (c.id === 'harvest') {
      ctx.strokeStyle = c.col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(8, 0, 4, -1.2, 1.2);
      ctx.stroke();
      ctx.fillRect(1, -1.5, 7, 3);
      ctx.fillStyle = hexA(c.col, .4);           /* tractor dish glow */
      ctx.beginPath();
      ctx.arc(8, 0, 2, 0, 7);
      ctx.fill();
    } else if (c.id === 'rail') {
      ctx.fillRect(1, -1.2, 15, 2.4);
      ctx.fillRect(12, -2.6, 2, 5.2);
      ctx.fillStyle = 'rgba(255,255,255,.18)';   /* rail highlight */
      ctx.fillRect(1, -1.2, 15, .8);
      ctx.fillStyle = '#8a6a20';                 /* capacitor block */
      ctx.fillRect(-6, -3, 5, 6);
      ctx.fillStyle = hexA('#ffd23f', .3 + .25 * ((Math.sin(S.time * 4 + t.x) + 1) / 2));
      ctx.fillRect(-5, -2, 3, 4);
    } else if (c.id === 'mortar') {
      ctx.fillStyle = c.col;
      ctx.fillRect(-5, -2.5, 9, 5);
      ctx.fillRect(2, -2.6, 11, 2.2);
      ctx.fillStyle = '#8f6bb8';
      ctx.fillRect(11, -3, 2, 3);
    } else {
      ctx.fillRect(2, -1, 11, 2);
      ctx.fillStyle = 'rgba(255,255,255,.16)';
      ctx.fillRect(2, -1, 11, .7);
    }
    if (t.flash > 0) {
      /* muzzle flash: hot core + colored bloom + recoil-lit barrel */
      ctx.globalAlpha = Math.min(1, t.flash * 12);
      ctx.fillStyle = hexA(c.col, .55);
      ctx.beginPath();
      ctx.arc(14, 0, 6, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(14, 0, 3, 0, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  if (sel) {
    var pu2 = (Math.sin(S.time * 5) + 1) / 2;
    ctx.strokeStyle = '#3edcb0';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = .45 + .45 * pu2;
    ctx.beginPath();
    ctx.moveTo(-12, -6);
    ctx.lineTo(-12, -12);
    ctx.lineTo(-6, -12);
    ctx.moveTo(6, -12);
    ctx.lineTo(12, -12);
    ctx.lineTo(12, -6);
    ctx.moveTo(12, 6);
    ctx.lineTo(12, 12);
    ctx.lineTo(6, 12);
    ctx.moveTo(-6, 12);
    ctx.lineTo(-12, 12);
    ctx.lineTo(-12, 6);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.rotate(0);
  ctx.restore();
  var sf = t.selF || 0;
  if (sf > 0) {
    ctx.globalAlpha = sf * .35;
    ctx.fillStyle = '#f0ece4';
    ctx.fillRect(t.x - 9, t.y - 9, 18, 18);
    ctx.globalAlpha = 1;
  }
  /* level pips */
  var pips = Math.min(5, t.lvl - 1);
  if (pips > 0) {
    ctx.fillStyle = '#ffd84a';
    for (var k = 0; k < pips; k++) ctx.fillRect(t.x - 8 + k * 4, t.y + 11, 2.5, 2.5);
  }
  if (t.lvl > 6) {
    ctx.fillStyle = '#ffd84a';
    ctx.font = '600 7px "JetBrains Mono",monospace';
    ctx.fillText('L' + t.lvl, t.x + 4, t.y + 17);
  }
  /* targeting badge */
  if (c.id !== 'foundry' && c.id !== 'aegis') {
    ctx.font = '700 6px "JetBrains Mono",ui-monospace,Menlo,monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = t.tgt === 'first' ? '#5c6d73' : '#3edcb0';
    ctx.fillText(TGT_LABEL[t.tgt], t.x, t.y - 13);
    ctx.textAlign = 'left';
  }
  /* calibration stars */
  var stx = Math.floor((t.lvl - 1) / 5);
  if (stx > 0) {
    ctx.font = '700 7px "JetBrains Mono",monospace';
    ctx.fillStyle = '#ffd84a';
    ctx.textAlign = 'center';
    ctx.fillText('★'.repeat(Math.min(stx, 4)) + (stx > 4 ? stx : ''), t.x, t.y + 23);
    ctx.textAlign = 'left';
  }
  /* installed module badges — colored dots above the unit */
  if (t.mods.length) {
    var rowW = t.mods.length * 5 - 1;
    for (var mk = 0; mk < t.mods.length; mk++) {
      var mc = modById(t.mods[mk]).col;
      ctx.fillStyle = mc;
      ctx.strokeStyle = '#0d1012';
      ctx.lineWidth = .5;
      var mx = t.x - rowW / 2 + mk * 5;
      ctx.fillRect(mx, t.y - 21, 3, 3);
      ctx.strokeRect(mx, t.y - 21, 3, 3);
    }
  }
  /* surge overdrive frame */
  if (S.time < S.ability.surge.until) {
    var sg2 = (Math.sin(S.time * 8) + 1) / 2;
    ctx.strokeStyle = hexA('#ffd84a', .2 + .25 * sg2);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(t.x - 10.5, t.y - 10.5, 21, 21);
  }
}

function drawEnemy(e: Enemy): void {
  /* contact shadow under the chassis */
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath();
  ctx.ellipse(e.x + 1, e.y + e.size * .85, e.size * 1.05, e.size * .42, 0, 0, 7);
  ctx.fill();
  ctx.save();
  ctx.translate(e.x, e.y);
  var capT = e.hp / e.mhp <= capZone();
  ctx.rotate(e.ang || 0);
  ctx.fillStyle = e.col;

  if (e.type === 'plated') {
    ctx.fillRect(-e.size, -e.size * .7, e.size * 2, e.size * 1.4);
    ctx.fillStyle = '#5f6d78';
    ctx.fillRect(-e.size, -e.size * .7, e.size * 2, 2.5);
    ctx.fillRect(-e.size, e.size * .45, e.size * 2, 2.5);
    ctx.fillStyle = 'rgba(255,255,255,.14)';       /* top-lit armour edge */
    ctx.fillRect(-e.size, -e.size * .7, e.size * 2, 1);
    ctx.fillStyle = 'rgba(0,0,0,.28)';             /* plate seam */
    ctx.fillRect(-1, -e.size * .7, 1, e.size * 1.4);
  } else if (e.type === 'swarm') {
    ctx.beginPath();
    ctx.moveTo(e.size, 0);
    ctx.lineTo(-e.size, -e.size * .8);
    ctx.lineTo(-e.size * .4, 0);
    ctx.lineTo(-e.size, e.size * .8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = hexA('#ffe0b0', .5);           /* thruster spark at the tail */
    ctx.fillRect(-e.size - 1.5, -.6, 1.5, 1.2);
  } else if (e.type === 'titan') {
    ctx.fillRect(-e.size, -e.size, e.size * 2, e.size * 2);
    ctx.strokeStyle = '#7c282c';
    ctx.lineWidth = 2;
    ctx.strokeRect(-e.size + 2, -e.size + 2, e.size * 2 - 4, e.size * 2 - 4);
    ctx.fillStyle = 'rgba(255,255,255,.1)';        /* lit top face */
    ctx.fillRect(-e.size, -e.size, e.size * 2, 1.5);
    var tp = (Math.sin(S.time * 4 + e.d * .05) + 1) / 2;
    ctx.fillStyle = hexA('#ffd23f', .6 + tp * .4); /* pulsing reactor eye */
    ctx.fillRect(-2, -2, 4, 4);
  } else if (e.type === 'dread') {
    /* menace aura — scaled to the unit radius so one cached gradient serves all dreads */
    ctx.save();
    ctx.scale(e.size, e.size);
    ctx.fillStyle = rgrad('dreadaura', 0, 0, .5, 0, 0, 2.6,
      [[0, 'rgba(229,72,77,.2)'], [1, 'rgba(229,72,77,0)']]);
    ctx.fillRect(-2.6, -2.6, 5.2, 5.2);
    ctx.restore();
    ctx.fillStyle = e.col;
    ctx.fillRect(-e.size, -e.size, e.size * 2, e.size * 2);
    ctx.strokeStyle = '#4d1418';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(-e.size + 2, -e.size + 2, e.size * 2 - 4, e.size * 2 - 4);
    ctx.strokeRect(-e.size + 5, -e.size + 5, e.size * 2 - 10, e.size * 2 - 10);
    /* shoulder spikes */
    ctx.fillStyle = '#4d1418';
    ctx.beginPath();
    ctx.moveTo(-e.size, -e.size);
    ctx.lineTo(-e.size - 3, -e.size - 3);
    ctx.lineTo(-e.size + 2, -e.size);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(e.size, -e.size);
    ctx.lineTo(e.size + 3, -e.size - 3);
    ctx.lineTo(e.size - 2, -e.size);
    ctx.closePath();
    ctx.fill();
    var dp = .55 + Math.sin(S.time * 5) * .4;
    ctx.fillStyle = hexA('#ffd23f', dp);
    ctx.fillRect(-2.5, -2.5, 5, 5);
    ctx.fillStyle = hexA('#fff6d0', dp * .7);
    ctx.fillRect(-1, -1, 2, 2);
  } else if (e.type === 'carrier') {
    ctx.fillRect(-e.size, -e.size * .6, e.size * 2, e.size * 1.2);
    ctx.fillStyle = '#6e5a44';
    ctx.fillRect(-e.size + 2, -e.size * .6 - 3, 5, 3);
    ctx.fillRect(2, -e.size * .6 - 3, 5, 3);
    ctx.fillRect(-4, e.size * .6, 8, 3);
    /* cargo bay light */
    ctx.fillStyle = hexA('#ffb83a', .2 + Math.sin(S.time * 4) * .1);
    ctx.fillRect(-3, -2, 6, 4);
  } else if (e.type === 'gilded') {
    var gp = (Math.sin(S.time * 7 + e.d * .1) + 1) / 2;
    ctx.save();
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-e.size * .75, -e.size * .75, e.size * 1.5, e.size * 1.5);
    ctx.restore();
    /* golden aura */
    ctx.strokeStyle = hexA('#ffd84a', .15 + .35 * gp);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, e.size + 2 + gp * 3, 0, 7);
    ctx.stroke();
  } else if (e.type === 'phase') {
    ctx.fillRect(-e.size, -e.size * .6, e.size * 2, e.size * 1.2);
    ctx.fillStyle = '#141a24';
    ctx.fillRect(-e.size + 2, -e.size * .6 + 2, e.size * 2 - 4, 2.5);
    if ((e.ph || 0) > 1.9) {
      ctx.strokeStyle = hexA('#cfe0f5', ((e.ph || 0) - 1.9) * 1.4);
      ctx.lineWidth = 1;
      ctx.strokeRect(-e.size - 2.5, -e.size * .6 - 2.5, e.size * 2 + 5, e.size * 1.2 + 5);
    }
  } else if (e.type === 'regen') {
    ctx.beginPath();
    ctx.arc(0, 0, e.size, 0, 7);
    ctx.fill();
    var rp = .5 + Math.sin(S.time * 6) * .4;
    /* knitting halo shows it is actively rebuilding */
    ctx.strokeStyle = hexA('#7ac98a', .18 + rp * .22);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, e.size + 1.5 + rp * 1.5, 0, 7);
    ctx.stroke();
    ctx.fillStyle = hexA('#b8f0c4', rp);
    ctx.beginPath();
    ctx.arc(0, 0, e.size * .45, 0, 7);
    ctx.fill();
  } else if (e.type === 'reaver') {
    ctx.fillRect(-e.size, -e.size * .7, e.size * 2, e.size * 1.4);
    ctx.strokeStyle = '#5f7a3a';
    ctx.lineWidth = 2;
    ctx.strokeRect(-e.size + 1.5, -e.size * .7 + 1.5, e.size * 2 - 3, e.size * 1.4 - 3);
    ctx.fillStyle = '#2f4a1e';
    ctx.fillRect(-e.size + 3, -e.size * .7 + 3, e.size * 2 - 6, e.size * 1.4 - 6);
  } else {
    /* scraplet — basic enemy with subtle detail */
    ctx.fillRect(-e.size, -e.size * .75, e.size * 2, e.size * 1.5);
    ctx.fillStyle = 'rgba(255,255,255,.12)';       /* lit upper hull */
    ctx.fillRect(-e.size, -e.size * .75, e.size * 2, 1);
    ctx.fillStyle = '#8a4a30';                     /* tread band */
    ctx.fillRect(-e.size, e.size * .4, e.size * 2, 2);
    /* eye dot */
    ctx.fillStyle = hexA('#ffb83a', .3);
    ctx.fillRect(e.size * .3, -e.size * .3, 1.5, 1.5);
  }

  if (e.flash > 0) {
    ctx.globalAlpha = e.flash * 14;
    ctx.fillStyle = '#fff';
    ctx.fillRect(-e.size, -e.size, e.size * 2, e.size * 2);
    ctx.globalAlpha = 1;
  }
  /* burn DoT glow from flamethrower modules */
  if (e.burnT > 0) {
    var bf = (Math.sin(S.time * 14 + e.d * .1) + 1) / 2;
    ctx.fillStyle = hexA('#ff8a3d', .28 + .28 * bf);
    ctx.beginPath();
    ctx.arc(0, 0, e.size + 3, 0, 7);
    ctx.fill();
  }
  ctx.rotate(-(e.ang || 0));

  /* capture-eligible marker */
  if (capT && S.mode === 'capture') {
    ctx.strokeStyle = '#3edcb0';
    ctx.globalAlpha = .5 + Math.sin(S.time * 8) * .3;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.arc(0, 0, e.size + 4, 0, 7);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  /* slowed frame */
  if (e.slow > 0) {
    ctx.strokeStyle = 'rgba(62,220,176,.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-e.size - 2, -e.size - 2, e.size * 2 + 4, e.size * 2 + 4);
  }
  if (e.frozen) {
    ctx.strokeStyle = hexA('#8fd8ff', .5 + Math.sin(S.time * 8) * .3);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-e.size - 2.5, -e.size - 2.5, e.size * 2 + 5, e.size * 2 + 5);
  }
  if (e.vet) {
    ctx.strokeStyle = '#ffd84a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-e.size - 1, -e.size - 1, e.size * 2 + 2, e.size * 2 + 2);
  }
  /* hp bar — framed, with a capture-zone overlay in capture doctrine */
  var w2 = Math.max(12, e.size * 2), bh2 = 3, byy = -e.size - 8;
  var frac2 = Math.max(0, e.hp / e.mhp);
  ctx.fillStyle = 'rgba(0,0,0,.62)';
  ctx.fillRect(-w2 / 2 - 1, byy - 1, w2 + 2, bh2 + 2);
  ctx.fillStyle = '#151b1e';
  ctx.fillRect(-w2 / 2, byy, w2, bh2);
  var hcol = capT ? '#3ec9b0' : (frac2 > .5 ? '#c9714a' : '#e5484d');
  ctx.fillStyle = hcol;
  ctx.fillRect(-w2 / 2, byy, w2 * frac2, bh2);
  ctx.fillStyle = 'rgba(255,255,255,.22)';         /* gloss on the fill */
  ctx.fillRect(-w2 / 2, byy, w2 * frac2, 1);
  if (S.mode === 'capture') {
    var cz = capZone();
    ctx.fillStyle = 'rgba(62,201,176,.22)';
    ctx.fillRect(-w2 / 2, byy, w2 * cz, bh2);
    ctx.fillStyle = '#3ec9b0';
    ctx.fillRect(-w2 / 2 + w2 * cz, byy - 1.5, 1, bh2 + 3);
  }
  ctx.restore();
}
