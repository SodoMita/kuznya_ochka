/* World route canvas: draw the 12-sector graph and handle travel picks. */
import { S } from './state';
import { wcv, wctx, dpr } from './view';
import { SECTORS, HAZNAMES, HAZCODE, HAZCOL } from './data';
import { pad2, $, hexA } from './utils';
import { nodeOpen } from './world';
import { resetSector } from './reset';
import { openModal, closeModal } from './modals';
import { Snd } from './audio';

let hoverIdx = -1;

export function drawWorld(hover?: number): void {
  if (hover !== undefined) hoverIdx = hover;
  var r = wcv.getBoundingClientRect(), dw = r.width, dh = r.height;
  if (!dw || !dh) return;
  wcv.width = Math.max(1, dw * dpr);
  wcv.height = Math.max(1, dh * dpr);
  wctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  wctx.clearRect(0, 0, dw, dh);
  /* deep-space backdrop with a soft central glow */
  var bg = wctx.createRadialGradient(dw / 2, dh / 2, 10, dw / 2, dh / 2, Math.max(dw, dh) * .7);
  bg.addColorStop(0, '#141d22');
  bg.addColorStop(1, '#090d10');
  wctx.fillStyle = bg;
  wctx.fillRect(0, 0, dw, dh);
  /* faint survey grid */
  wctx.strokeStyle = 'rgba(62,201,176,.05)';
  wctx.lineWidth = 1;
  wctx.beginPath();
  for (var gx = 0; gx < dw; gx += 28) { wctx.moveTo(gx + .5, 0); wctx.lineTo(gx + .5, dh); }
  for (var gy = 0; gy < dh; gy += 28) { wctx.moveTo(0, gy + .5); wctx.lineTo(dw, gy + .5); }
  wctx.stroke();

  var i, n;
  wctx.lineWidth = 1.5;
  for (i = 0; i < S.worldEdges.length; i++) {
    var a = S.worldNodes[S.worldEdges[i][0]], b = S.worldNodes[S.worldEdges[i][1]];
    var open = S.cleared[a.idx];
    var ax = a.x * dw, ay = a.y * dh, bx = b.x * dw, by = b.y * dh;
    if (open) {                       /* live route: glowing solid link + flow */
      wctx.strokeStyle = 'rgba(62,201,176,.14)';
      wctx.lineWidth = 4;
      wctx.beginPath();
      wctx.moveTo(ax, ay);
      wctx.lineTo(bx, by);
      wctx.stroke();
      wctx.strokeStyle = '#3ec9b0';
      wctx.lineWidth = 1.5;
      wctx.setLineDash([]);
    } else {                          /* locked route: dashed and dim */
      wctx.strokeStyle = '#223038';
      wctx.lineWidth = 1.5;
      wctx.setLineDash([3, 4]);
    }
    wctx.beginPath();
    wctx.moveTo(ax, ay);
    wctx.lineTo(bx, by);
    wctx.stroke();
    if (open) {
      /* marching dash along live routes */
      wctx.strokeStyle = 'rgba(62,220,176,.6)';
      wctx.lineWidth = 2;
      wctx.setLineDash([2, 10]);
      wctx.lineDashOffset = -(performance.now() / 40 % 12);
      wctx.beginPath();
      wctx.moveTo(ax, ay);
      wctx.lineTo(bx, by);
      wctx.stroke();
      wctx.setLineDash([]);
      wctx.lineDashOffset = 0;
    }
  }

  for (i = 0; i < S.worldNodes.length; i++) {
    n = S.worldNodes[i];
    var nx = n.x * dw, ny = n.y * dh, sec = SECTORS[n.idx % SECTORS.length];
    var isCur = n.idx === S.sector, done = !!S.cleared[n.idx], open = nodeOpen(i);
    var col = done ? '#3ec9b0' : (open ? '#f0ece4' : '#3a4a52');
    var tt = S.time;                    /* deterministic, unlike performance.now */
    wctx.save();
    wctx.translate(nx, ny);
    /* halo marks sectors you can actually deploy to */
    if (open && !done) {
      var hg = wctx.createRadialGradient(0, 0, 3, 0, 0, 20);
      hg.addColorStop(0, 'rgba(233,228,214,.13)');
      hg.addColorStop(1, 'rgba(233,228,214,0)');
      wctx.fillStyle = hg;
      wctx.fillRect(-20, -20, 40, 40);
    }
    if (done) {
      var cg = wctx.createRadialGradient(0, 0, 3, 0, 0, 20);
      cg.addColorStop(0, 'rgba(62,201,176,.16)');
      cg.addColorStop(1, 'rgba(62,201,176,0)');
      wctx.fillStyle = cg;
      wctx.fillRect(-20, -20, 40, 40);
    }
    if (hoverIdx === i) {
      wctx.strokeStyle = hexA('#ffa02f', .7);
      wctx.lineWidth = 1.5;
      wctx.beginPath();
      wctx.arc(0, 0, 16, 0, 7);
      wctx.stroke();
    }
    if (isCur) {
      wctx.strokeStyle = '#ffb83a';
      wctx.lineWidth = 2;
      wctx.beginPath();
      wctx.arc(0, 0, 14, tt * 2, tt * 2 + 4.7);
      wctx.stroke();
    }
    wctx.rotate(Math.PI / 4);
    var sz = sec.haz === 0 ? 7 : 8;
    wctx.fillStyle = done ? 'rgba(62,220,176,.12)' : '#1a2226';
    wctx.strokeStyle = col;
    wctx.lineWidth = 1.5;
    wctx.fillRect(-sz, -sz, sz * 2, sz * 2);
    wctx.strokeRect(-sz, -sz, sz * 2, sz * 2);
    /* inner bevel on the diamond */
    wctx.strokeStyle = 'rgba(255,255,255,.07)';
    wctx.lineWidth = 1;
    wctx.strokeRect(-sz + 2, -sz + 2, sz * 2 - 4, sz * 2 - 4);
    wctx.rotate(-Math.PI / 4);
    wctx.fillStyle = col;
    wctx.font = '700 8px "JetBrains Mono",ui-monospace,Menlo,monospace';
    wctx.textAlign = 'center';
    wctx.fillText(pad2(n.idx + 1), 0, 3);
    /* mix bars — salvage gauges with dark tracks behind them */
    var mix = sec.mix, tot = mix.fe + mix.cu + mix.si;
    var mcol = ['#c9714a', '#ffa02f', '#9fb6c9'], mval = [mix.fe, mix.cu, mix.si];
    for (var mb = 0; mb < 3; mb++) {
      var myy = 12 + mb * 3;
      wctx.fillStyle = 'rgba(0,0,0,.45)';
      wctx.fillRect(-9, myy, 18, 2);
      wctx.fillStyle = mcol[mb];
      wctx.fillRect(-9, myy, 18 * mval[mb] / tot, 2);
    }
    /* cleared tick */
    if (done) {
      wctx.strokeStyle = '#3ec9b0';
      wctx.lineWidth = 1.5;
      wctx.beginPath();
      wctx.moveTo(-13, -9);
      wctx.lineTo(-10.5, -6.5);
      wctx.lineTo(-6, -12);
      wctx.stroke();
    }
    wctx.fillStyle = HAZCOL[sec.haz] || '#697a80';
    wctx.fillText(HAZCODE[sec.haz] || '?', 14, -8);
    wctx.restore();
  }
  wctx.textAlign = 'left';
}

export function pickWorld(ev: { clientX: number; clientY: number }): void {
  var r = wcv.getBoundingClientRect(), x = ev.clientX - r.left, y = ev.clientY - r.top;
  var best = -1, bd = 20;
  for (var i = 0; i < S.worldNodes.length; i++) {
    var n = S.worldNodes[i];
    var d = Math.hypot(x - n.x * r.width, y - n.y * r.height);
    if (d < bd) { bd = d; best = i; }
  }
  if (best < 0) return;
  var idx = S.worldNodes[best].idx, sec = SECTORS[idx % SECTORS.length];
  if (!nodeOpen(best)) {
    $('nodeInfo').textContent = 'SECTOR ' + pad2(idx + 1) + ' — route locked. Clear a linked sector first.';
    Snd.play('error');
    return;
  }
  var wavesCleared = S.cleared[idx] ? ' · cleared (waves escalate on revisit)' : ' · 12 waves to clear';
  $('nodeInfo').textContent = 'SECTOR ' + pad2(idx + 1) + ' · ' + sec.name + ' · ' + HAZNAMES[sec.haz] +
    wavesCleared + ' · click again to deploy';
  Snd.play('ui');
  if (S.worldPick === idx) {
    closeModal('mapModal');
    resetSector(idx);
    return;
  }
  S.worldPick = idx;
}

export function openMap(): void {
  S.worldPick = -1;
  hoverIdx = -1;
  openModal('mapModal');
  requestAnimationFrame(function () { requestAnimationFrame(function () { drawWorld(-1); }); });
}
