/* Canvas rendering of the battlefield. Pure draw — mutates visuals only. */
import { S } from './state';
import { ctx, W, H } from './view';
import { CARDS, TGT_LABEL } from './data';
import { hexA, clamp } from './utils';
import { sector, canAfford, usedGrid, gridCap, capZone } from './economy';
import { stats } from './towers';
import { selBoard } from './deck';
import type { Tower, Enemy, SectorDef } from './types';

/* ── Glow helpers ── */
function glowCircle(x: number, y: number, r: number, col: string, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = col;
  ctx.shadowBlur = r * 0.6;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 7);
  ctx.fill();
  ctx.restore();
}

function glowLine(x1: number, y1: number, x2: number, y2: number, col: string, w: number, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = col;
  ctx.shadowBlur = w * 3;
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

/* ── Scanline overlay (subtle CRT feel) ── */
function drawScanlines(): void {
  ctx.save();
  ctx.globalAlpha = 0.03;
  ctx.fillStyle = '#000';
  for (var y = 0; y < H; y += 3) {
    ctx.fillRect(0, y, W, 1);
  }
  ctx.restore();
}

export function draw(): void {
  var sec = sector(), i;
  ctx.fillStyle = sec.tint;
  ctx.fillRect(0, 0, W, H);

  /* gradient atmospheric depth */
  var atmo = ctx.createLinearGradient(0, 0, 0, H);
  atmo.addColorStop(0, 'rgba(10,14,20,.3)');
  atmo.addColorStop(0.5, 'rgba(0,0,0,0)');
  atmo.addColorStop(1, 'rgba(8,6,4,.25)');
  ctx.fillStyle = atmo;
  ctx.fillRect(0, 0, W, H);

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
    ctx.globalAlpha = m.a * .3;
    ctx.fillStyle = '#d4c8b0';
    ctx.shadowColor = '#d4c8b0';
    ctx.shadowBlur = m.r * 2;
    ctx.fillRect(m.x, m.y, m.r, m.r);
  }
  ctx.shadowBlur = 0;
  ctx.restore();

  /* ruined skyline */
  for (i = 0; i < S.sky.length; i++) {
    var sk = S.sky[i];
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.fillRect(sk.x * W, H - sk.h * H, sk.w * W + 1, sk.h * H);
    /* subtle edge highlight on buildings */
    ctx.fillStyle = 'rgba(255,255,255,.03)';
    ctx.fillRect(sk.x * W, H - sk.h * H, sk.w * W + 1, 1);
    if (sk.ant) {
      var antPulse = (Math.sin(S.time * 2 + i * 2) + 1) / 2;
      ctx.fillStyle = hexA('#f04a50', .2 + .5 * antPulse);
      ctx.shadowColor = '#f04a50';
      ctx.shadowBlur = 6;
      ctx.fillRect(sk.x * W + sk.w * W * .5, H - sk.h * H - 3, 2, 3);
      ctx.shadowBlur = 0;
    }
  }
  /* rising forge embers */
  for (i = 0; i < S.embers.length; i++) {
    var em = S.embers[i];
    em.y -= em.vy * .016;
    em.x += Math.sin(S.time * 2 + em.ph) * .25;
    if (em.y < -2) { em.y = H; em.x = Math.random() * W; }
    ctx.globalAlpha = .2 + .15 * Math.sin(S.time * 5 + em.ph);
    ctx.fillStyle = '#e8c090';
    ctx.shadowColor = '#e8c090';
    ctx.shadowBlur = 4;
    ctx.fillRect(em.x, em.y, 1.5, 2.5);
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;

  /* grid — subtle neon lines */
  ctx.strokeStyle = sec.grid;
  ctx.globalAlpha = .35;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (var gx = 0; gx < W; gx += 26) { ctx.moveTo(gx, 0); ctx.lineTo(gx, H); }
  for (var gy = 0; gy < H; gy += 26) { ctx.moveTo(0, gy); ctx.lineTo(W, gy); }
  ctx.stroke();
  ctx.globalAlpha = 1;

  /* shake */
  ctx.save();
  if (S.shake > 0) ctx.translate((Math.random() - .5) * S.shake, (Math.random() - .5) * S.shake);

  /* build pads — subtle dotted squares */
  var ghostBoard = selBoard();
  ctx.globalAlpha = ghostBoard ? .5 : .12;
  ctx.strokeStyle = '#8fa0a6';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  for (i = 0; i < S.spots.length; i++) {
    var sp = S.spots[i];
    ctx.strokeRect(sp.px - 4, sp.py - 4, 8, 8);
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  drawPath(sec);
  drawCore();
  drawSpawn();

  /* ghost preview — snaps to nearest valid foundation */
  if (S.ghost && ghostBoard && !S.modalOpen) {
    var c = ghostBoard,
        gpx = S.ghost.sx != null ? S.ghost.sx : S.ghost.x,
        gpy = S.ghost.sy != null ? S.ghost.sy : S.ghost.y;
    var posOk = S.ghost.sx != null, afford = canAfford(c.cost) && usedGrid() + c.draw <= gridCap();
    var gcol = !posOk ? '#f04a50' : (afford ? '#3edcb0' : '#ffb83a');
    if (posOk && (Math.abs(gpx - S.ghost.x) > 3 || Math.abs(gpy - S.ghost.y) > 3)) {
      ctx.strokeStyle = 'rgba(143,160,166,.45)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(S.ghost.x, S.ghost.y);
      ctx.lineTo(gpx, gpy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeRect(S.ghost.x - 3, S.ghost.y - 3, 6, 6);
    }
    ctx.globalAlpha = .5;
    ctx.fillStyle = posOk && afford ? c.col : gcol;
    ctx.shadowColor = gcol;
    ctx.shadowBlur = 10;
    ctx.fillRect(gpx - 8, gpy - 8, 16, 16);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = .35;
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

  /* aegis slow fields */
  for (i = 0; i < S.towers.length; i++) {
    if (CARDS[S.towers[i].i].id === 'aegis') {
      var at = S.towers[i], ar = (at._st || stats(at)).range, ap = (Math.sin(S.time * 3 + at.x) + 1) / 2;
      /* inner glow */
      var aegisGrad = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, ar);
      aegisGrad.addColorStop(0, 'rgba(62,220,176,.08)');
      aegisGrad.addColorStop(0.6, 'rgba(62,220,176,.03)');
      aegisGrad.addColorStop(1, 'rgba(62,220,176,0)');
      ctx.fillStyle = aegisGrad;
      ctx.beginPath();
      ctx.arc(at.x, at.y, ar, 0, 7);
      ctx.fill();
      ctx.strokeStyle = hexA('#3edcb0', .15 + .12 * ap);
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
    ctx.strokeStyle = 'rgba(62,220,176,.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    ctx.lineDashOffset = -S.time * 20;
    ctx.beginPath();
    ctx.arc(lt.x, lt.y, st2.range, 0, 7);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    var lbl = lc.name + ' L' + lt.lvl + (lc.id === 'foundry' ? '' : ' · ' + TGT_LABEL[lt.tgt]);
    ctx.font = '600 8px "JetBrains Mono",ui-monospace,Menlo,monospace';
    var tw = ctx.measureText(lbl).width, lx = clamp(lt.x, tw / 2 + 5, W - tw / 2 - 5), ly = lt.y - 27;
    /* tag background with glow */
    ctx.fillStyle = 'rgba(10,15,17,.9)';
    ctx.fillRect(lx - tw / 2 - 5, ly - 9, tw + 10, 14);
    ctx.strokeStyle = 'rgba(62,220,176,.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(lx - tw / 2 - 5, ly - 9, tw + 10, 14);
    ctx.fillStyle = '#3edcb0';
    ctx.textAlign = 'center';
    ctx.fillText(lbl, lx, ly + 1);
    ctx.textAlign = 'left';
  }

  /* beams — capture beams with glow trail */
  for (i = 0; i < S.beams.length; i++) {
    var bm = S.beams[i];
    ctx.strokeStyle = '#3edcb0';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#3edcb0';
    ctx.shadowBlur = 8;
    ctx.setLineDash([3, 4]);
    ctx.lineDashOffset = -S.time * 40;
    ctx.beginPath();
    ctx.moveTo(bm.tw.x, bm.tw.y);
    ctx.lineTo(bm.en.x, bm.en.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.shadowBlur = 0;
    /* capture ring */
    ctx.strokeStyle = '#3edcb0';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#3edcb0';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(bm.en.x, bm.en.y, bm.en.size + 5, -Math.PI / 2, -Math.PI / 2 + bm.t * 6.283);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  /* enemies */
  for (i = 0; i < S.enemies.length; i++) drawEnemy(S.enemies[i]);

  /* shots — with neon trails */
  for (i = 0; i < S.shots.length; i++) {
    var sh = S.shots[i];
    ctx.globalAlpha = Math.min(1, sh.life * 12);
    ctx.strokeStyle = sh.col;
    ctx.shadowColor = sh.col;
    ctx.shadowBlur = sh.kind === 2 ? 10 : (sh.kind === 1 ? 6 : 4);
    ctx.lineWidth = sh.kind === 2 ? 3 : (sh.kind === 1 ? 2 : 1.5);
    ctx.beginPath();
    if (sh.kind === 1) {
      var mx = (sh.x + sh.tx) / 2 + (Math.random() - .5) * 10, my = (sh.y + sh.ty) / 2 + (Math.random() - .5) * 10;
      ctx.moveTo(sh.x, sh.y);
      ctx.lineTo(mx, my);
      ctx.lineTo(sh.tx, sh.ty);
    } else {
      ctx.moveTo(sh.x, sh.y);
      ctx.lineTo(sh.tx, sh.ty);
    }
    ctx.stroke();
    if (sh.kind === 2) {   /* rail bolt: hot white core */
      ctx.strokeStyle = '#fffbe8';
      ctx.shadowColor = '#fffbe8';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;

  /* particles (additive sparks with glow) */
  ctx.globalCompositeOperation = 'lighter';
  for (i = 0; i < S.parts.length; i++) {
    var pt = S.parts[i];
    ctx.globalAlpha = Math.max(0, Math.min(1, pt.life * 2));
    ctx.fillStyle = pt.col;
    ctx.shadowColor = pt.col;
    ctx.shadowBlur = 4;
    ctx.fillRect(pt.x - 1.5, pt.y - 1.5, 3, 3);
  }
  ctx.shadowBlur = 0;
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  /* rings — expanding shockwaves */
  for (i = 0; i < S.rings.length; i++) {
    var rg = S.rings[i];
    ctx.globalAlpha = 1 - rg.r / rg.max;
    ctx.strokeStyle = rg.col;
    ctx.shadowColor = rg.col;
    ctx.shadowBlur = 6;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(rg.x, rg.y, rg.r, 0, 7);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;

  /* floats — damage numbers with shadow */
  ctx.font = '700 9px "JetBrains Mono",ui-monospace,Menlo,monospace';
  ctx.textAlign = 'center';
  for (i = 0; i < S.floats.length; i++) {
    var f = S.floats[i];
    ctx.globalAlpha = Math.min(1, f.t * 2);
    ctx.fillStyle = '#000';
    ctx.fillText(f.txt, f.x + 1, f.y + 1);
    ctx.fillStyle = f.col;
    ctx.shadowColor = f.col;
    ctx.shadowBlur = 4;
    ctx.fillText(f.txt, f.x, f.y);
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
  ctx.restore();

  /* vignette — deeper, more cinematic */
  var vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.max(W, H) * .72);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(0.7, 'rgba(0,0,0,.15)');
  vg.addColorStop(1, 'rgba(0,0,0,.5)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  /* scanlines for CRT atmosphere */
  drawScanlines();

  if (S.time < S.ability.surge.until) {
    ctx.fillStyle = 'rgba(255,216,74,.06)';
    ctx.fillRect(0, 0, W, H);
  }

  if (S.paused) {
    ctx.fillStyle = 'rgba(8,12,16,.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f0ece4';
    ctx.font = '700 28px "Space Grotesk",Impact,sans-serif';
    ctx.shadowColor = '#f0ece4';
    ctx.shadowBlur = 20;
    ctx.fillText('PAUSED', W / 2, H / 2);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
  }
}

function drawPath(sec: SectorDef): void {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#0d1012';
  ctx.lineWidth = 27;
  strokeEdges();
  ctx.strokeStyle = sec.path;
  ctx.lineWidth = 21;
  strokeEdges();
  ctx.strokeStyle = '#0d1012';
  ctx.lineWidth = 15;
  strokeEdges();
  ctx.strokeStyle = hexA(sec.path, 1);
  ctx.globalAlpha = .45;
  ctx.lineWidth = 11;
  strokeEdges();
  ctx.globalAlpha = 1;
  /* neon edge lines */
  ctx.strokeStyle = '#c8bfa8';
  ctx.globalAlpha = .3;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 9]);
  ctx.lineDashOffset = -S.time * 26;
  strokeEdges();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.globalAlpha = 1;
  /* junction hubs */
  ctx.fillStyle = '#0d1012';
  for (const n of S.nodes) {
    if (n.kind === 'junc') ctx.fillRect(n.px - 3.5, n.py - 3.5, 7, 7);
  }
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
    ctx.save();
    ctx.translate(p.px, p.py);
    ctx.rotate(spawnDir(si));
    ctx.fillStyle = '#1a2226';
    ctx.strokeStyle = '#8fa0a6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-8, -9);
    ctx.lineTo(4, -9);
    ctx.lineTo(4, 9);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    var pulse = (Math.sin(S.time * 4) + 1) / 2;
    ctx.strokeStyle = hexA('#f04a50', .35 + pulse * .6);
    ctx.shadowColor = '#f04a50';
    ctx.shadowBlur = 8;
    for (var k = 0; k < 2; k++) {
      ctx.beginPath();
      ctx.moveTo(-3 + k * 5, -5);
      ctx.lineTo(1 + k * 5, 0);
      ctx.lineTo(-3 + k * 5, 5);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }
}

function drawCore(): void {
  var p = S.nodes[S.coreIdx], pulse = (Math.sin(S.time * 3) + 1) / 2;
  ctx.save();
  ctx.translate(p.px, p.py);
  /* outer glow ring */
  ctx.strokeStyle = hexA('#3edcb0', .15 + pulse * .25);
  ctx.shadowColor = '#3edcb0';
  ctx.shadowBlur = 14;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 17 + pulse * 3, 0, 7);
  ctx.stroke();
  ctx.shadowBlur = 0;
  /* core body */
  ctx.fillStyle = '#141c20';
  ctx.strokeStyle = '#3edcb0';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#3edcb0';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, 7);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  /* health arc */
  var frac = Math.max(0, S.core / S.coreMax);
  ctx.strokeStyle = frac > .4 ? '#3edcb0' : '#f04a50';
  ctx.shadowColor = frac > .4 ? '#3edcb0' : '#f04a50';
  ctx.shadowBlur = 6;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, 10, -Math.PI / 2, -Math.PI / 2 + frac * 6.283);
  ctx.stroke();
  ctx.shadowBlur = 0;
  /* number */
  ctx.fillStyle = '#f0ece4';
  ctx.font = '700 8px "JetBrains Mono",ui-monospace,monospace';
  ctx.textAlign = 'center';
  ctx.fillText(S.core + '', 0, 3);
  ctx.textAlign = 'left';
  ctx.restore();
}

function drawTower(t: Tower): void {
  var c = CARDS[t.i], sel = t === S.selTower;
  ctx.save();
  ctx.translate(t.x, t.y);
  if (sel) {
    var pu = (Math.sin(S.time * 5) + 1) / 2;
    ctx.globalAlpha = .1 + .08 * pu;
    ctx.fillStyle = '#3edcb0';
    ctx.shadowColor = '#3edcb0';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(0, 0, 17 + pu * 3, 0, 7);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
  if (CARDS[t.i].id === 'foundry') {
    var glow = (Math.sin(S.time * 5 + t.x) + 1) / 2;
    ctx.fillStyle = '#1d262b';
    ctx.strokeStyle = sel ? '#3edcb0' : '#3a4a52';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-9, -8, 18, 16);
    ctx.strokeRect(-9, -8, 18, 16);
    /* hot glow on foundry core */
    ctx.fillStyle = hexA('#e8854a', .5 + glow * .5);
    ctx.shadowColor = '#e8854a';
    ctx.shadowBlur = 6;
    ctx.fillRect(-4, -3, 8, 8);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#3a4a52';
    ctx.fillRect(3, -12, 4, 5);
    ctx.fillStyle = hexA('#e8854a', .6 + glow * .4);
    ctx.shadowColor = '#e8854a';
    ctx.shadowBlur = 4;
    ctx.fillRect(-9, 8, 18, 2);
    ctx.shadowBlur = 0;
  } else if (c.id === 'aegis') {
    ctx.fillStyle = '#1d262b';
    ctx.strokeStyle = sel ? '#3edcb0' : '#3a4a52';
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
    ctx.save();
    ctx.rotate(S.time * 1.5);
    ctx.fillStyle = '#3edcb0';
    ctx.shadowColor = '#3edcb0';
    ctx.shadowBlur = 8;
    ctx.fillRect(-3.5, -3.5, 7, 7);
    ctx.shadowBlur = 0;
    ctx.restore();
    var pu3 = (Math.sin(S.time * 4) + 1) / 2;
    ctx.strokeStyle = hexA('#3edcb0', .2 + .3 * pu3);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 11 + pu3 * 3, 0, 7);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#1d262b';
    ctx.strokeStyle = sel ? '#3edcb0' : '#3a4a52';
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
    ctx.rotate(t.ang);
    ctx.fillStyle = '#2c3940';
    ctx.fillRect(-4, -4, 8, 8);
    ctx.fillStyle = c.col;
    ctx.shadowColor = c.col;
    ctx.shadowBlur = 3;
    if (c.id === 'arc') {
      ctx.fillRect(2, -1.5, 10, 3);
      ctx.fillRect(9, -3.5, 2, 7);
    } else if (c.id === 'harvest') {
      ctx.strokeStyle = c.col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(8, 0, 4, -1.2, 1.2);
      ctx.stroke();
      ctx.fillRect(1, -1.5, 7, 3);
    } else if (c.id === 'rail') {
      ctx.fillRect(1, -1.2, 15, 2.4);
      ctx.fillRect(12, -2.6, 2, 5.2);
      ctx.fillStyle = '#8a6a20';
      ctx.shadowColor = '#8a6a20';
      ctx.fillRect(-6, -3, 5, 6);
    } else {
      ctx.fillRect(2, -1, 11, 2);
    }
    ctx.shadowBlur = 0;
    if (t.flash > 0) {
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#fff';
      ctx.shadowBlur = 10;
      ctx.globalAlpha = t.flash * 12;
      ctx.beginPath();
      ctx.arc(14, 0, 3.5, 0, 7);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }
  }
  if (sel) {
    var pu2 = (Math.sin(S.time * 5) + 1) / 2;
    ctx.strokeStyle = '#3edcb0';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = .5 + .45 * pu2;
    ctx.shadowColor = '#3edcb0';
    ctx.shadowBlur = 4;
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
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
  ctx.rotate(0);
  ctx.restore();
  var sf = t.selF || 0;
  if (sf > 0) {
    ctx.globalAlpha = sf * .4;
    ctx.fillStyle = '#f0ece4';
    ctx.fillRect(t.x - 9, t.y - 9, 18, 18);
    ctx.globalAlpha = 1;
  }
  /* level pips */
  var pips = Math.min(5, t.lvl - 1);
  if (pips > 0) {
    ctx.fillStyle = '#ffd84a';
    ctx.shadowColor = '#ffd84a';
    ctx.shadowBlur = 3;
    for (var k = 0; k < pips; k++) ctx.fillRect(t.x - 8 + k * 4, t.y + 11, 2.5, 2.5);
    ctx.shadowBlur = 0;
  }
  if (t.lvl > 6) {
    ctx.fillStyle = '#ffd84a';
    ctx.font = '600 7px "JetBrains Mono",monospace';
    ctx.fillText('L' + t.lvl, t.x + 4, t.y + 17);
  }
  /* targeting doctrine badge */
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
  /* surge overdrive frame */
  if (S.time < S.ability.surge.until) {
    var sg2 = (Math.sin(S.time * 8) + 1) / 2;
    ctx.strokeStyle = hexA('#ffd84a', .25 + .3 * sg2);
    ctx.shadowColor = '#ffd84a';
    ctx.shadowBlur = 6;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(t.x - 10.5, t.y - 10.5, 21, 21);
    ctx.shadowBlur = 0;
  }
}

function drawEnemy(e: Enemy): void {
  ctx.save();
  ctx.translate(e.x, e.y);
  var capT = e.hp / e.mhp <= capZone();
  ctx.rotate(e.ang || 0);
  ctx.fillStyle = e.col;
  ctx.shadowColor = e.col;
  ctx.shadowBlur = 3;
  if (e.type === 'plated') {
    ctx.fillRect(-e.size, -e.size * .7, e.size * 2, e.size * 1.4);
    ctx.fillStyle = '#5f6d78';
    ctx.fillRect(-e.size, -e.size * .7, e.size * 2, 2.5);
    ctx.fillRect(-e.size, e.size * .45, e.size * 2, 2.5);
  } else if (e.type === 'swarm') {
    ctx.beginPath();
    ctx.moveTo(e.size, 0);
    ctx.lineTo(-e.size, -e.size * .8);
    ctx.lineTo(-e.size * .4, 0);
    ctx.lineTo(-e.size, e.size * .8);
    ctx.closePath();
    ctx.fill();
  } else if (e.type === 'titan') {
    ctx.fillRect(-e.size, -e.size, e.size * 2, e.size * 2);
    ctx.strokeStyle = '#7c282c';
    ctx.lineWidth = 2;
    ctx.strokeRect(-e.size + 2, -e.size + 2, e.size * 2 - 4, e.size * 2 - 4);
    ctx.fillStyle = '#ffd84a';
    ctx.shadowColor = '#ffd84a';
    ctx.shadowBlur = 6;
    ctx.fillRect(-2, -2, 4, 4);
  } else if (e.type === 'dread') {
    ctx.fillRect(-e.size, -e.size, e.size * 2, e.size * 2);
    ctx.strokeStyle = '#4d1418';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(-e.size + 2, -e.size + 2, e.size * 2 - 4, e.size * 2 - 4);
    ctx.strokeRect(-e.size + 5, -e.size + 5, e.size * 2 - 10, e.size * 2 - 10);
    ctx.fillStyle = hexA('#ffd84a', .5 + Math.sin(S.time * 5) * .4);
    ctx.shadowColor = '#ffd84a';
    ctx.shadowBlur = 8;
    ctx.fillRect(-2.5, -2.5, 5, 5);
  } else if (e.type === 'carrier') {
    ctx.fillRect(-e.size, -e.size * .6, e.size * 2, e.size * 1.2);
    ctx.fillStyle = '#6e5a44';
    ctx.fillRect(-e.size + 2, -e.size * .6 - 3, 5, 3);
    ctx.fillRect(2, -e.size * .6 - 3, 5, 3);
    ctx.fillRect(-4, e.size * .6, 8, 3);
  } else if (e.type === 'gilded') {
    var gp = (Math.sin(S.time * 7 + e.d * .1) + 1) / 2;
    ctx.save();
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-e.size * .75, -e.size * .75, e.size * 1.5, e.size * 1.5);
    ctx.restore();
    ctx.strokeStyle = hexA('#ffd84a', .2 + .4 * gp);
    ctx.shadowColor = '#ffd84a';
    ctx.shadowBlur = 8;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, e.size + 2 + gp * 2.5, 0, 7);
    ctx.stroke();
  } else if (e.type === 'phase') {
    ctx.fillRect(-e.size, -e.size * .6, e.size * 2, e.size * 1.2);
    ctx.fillStyle = '#141a24';
    ctx.fillRect(-e.size + 2, -e.size * .6 + 2, e.size * 2 - 4, 2.5);
    if ((e.ph || 0) > 1.9) {
      ctx.strokeStyle = hexA('#cfe0f5', ((e.ph || 0) - 1.9) * 1.4);
      ctx.shadowColor = '#cfe0f5';
      ctx.shadowBlur = 8;
      ctx.lineWidth = 1;
      ctx.strokeRect(-e.size - 2.5, -e.size * .6 - 2.5, e.size * 2 + 5, e.size * 1.2 + 5);
    }
  } else if (e.type === 'regen') {
    ctx.beginPath();
    ctx.arc(0, 0, e.size, 0, 7);
    ctx.fill();
    ctx.fillStyle = hexA('#b8f0c4', .45 + Math.sin(S.time * 6) * .4);
    ctx.shadowColor = '#b8f0c4';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(0, 0, e.size * .45, 0, 7);
    ctx.fill();
  } else {
    ctx.fillRect(-e.size, -e.size * .75, e.size * 2, e.size * 1.5);
    ctx.fillStyle = '#8a4a30';
    ctx.fillRect(-e.size, e.size * .4, e.size * 2, 2);
  }
  ctx.shadowBlur = 0;
  if (e.flash > 0) {
    ctx.globalAlpha = e.flash * 14;
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 8;
    ctx.fillRect(-e.size, -e.size, e.size * 2, e.size * 2);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
  ctx.rotate(-(e.ang || 0));
  /* capture-eligible marker */
  if (capT && S.mode === 'capture') {
    ctx.strokeStyle = '#3edcb0';
    ctx.globalAlpha = .55 + Math.sin(S.time * 8) * .3;
    ctx.shadowColor = '#3edcb0';
    ctx.shadowBlur = 6;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.arc(0, 0, e.size + 4, 0, 7);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  }
  /* slowed / veteran frames */
  if (e.slow > 0) {
    ctx.strokeStyle = 'rgba(62,220,176,.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-e.size - 2, -e.size - 2, e.size * 2 + 4, e.size * 2 + 4);
  }
  if (e.vet) {
    ctx.strokeStyle = '#ffd84a';
    ctx.shadowColor = '#ffd84a';
    ctx.shadowBlur = 4;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-e.size - 1, -e.size - 1, e.size * 2 + 2, e.size * 2 + 2);
    ctx.shadowBlur = 0;
  }
  /* hp bar */
  var w2 = e.size * 2;
  ctx.fillStyle = '#0d1012';
  ctx.fillRect(-w2 / 2, -e.size - 7, w2, 2.5);
  var hpCol = capT ? '#3edcb0' : (e.hp / e.mhp > .5 ? '#c9714a' : '#f04a50');
  ctx.fillStyle = hpCol;
  ctx.fillRect(-w2 / 2, -e.size - 7, w2 * Math.max(0, e.hp / e.mhp), 2.5);
  if (S.mode === 'capture') {
    var cz = capZone();
    ctx.fillStyle = 'rgba(62,220,176,.25)';
    ctx.fillRect(-w2 / 2, -e.size - 7, w2 * cz, 2.5);
    ctx.fillStyle = '#3edcb0';
    ctx.fillRect(-w2 / 2 + w2 * cz, -e.size - 8.5, 1, 5.5);
  }
  ctx.restore();
}
