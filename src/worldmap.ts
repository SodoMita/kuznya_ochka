/* World route canvas: draw the 12-sector graph and handle travel picks. */
import { S } from './state';
import { wcv, wctx, dpr } from './view';
import { SECTORS, HAZNAMES, HAZCODE } from './data';
import { pad2, $ } from './utils';
import { nodeOpen } from './world';
import { resetSector } from './reset';
import { openModal, closeModal } from './modals';
import { Snd } from './audio';

export function drawWorld(): void {
  var r = wcv.getBoundingClientRect(), dw = r.width, dh = r.height;
  wcv.width = Math.max(1, dw * dpr);
  wcv.height = Math.max(1, dh * dpr);
  wctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  wctx.clearRect(0, 0, dw, dh);
  wctx.fillStyle = '#0a1014';
  wctx.fillRect(0, 0, dw, dh);

  /* subtle background grid */
  wctx.strokeStyle = 'rgba(42,56,66,.2)';
  wctx.lineWidth = 0.5;
  wctx.beginPath();
  for (var gx = 0; gx < dw; gx += 20) { wctx.moveTo(gx, 0); wctx.lineTo(gx, dh); }
  for (var gy = 0; gy < dh; gy += 20) { wctx.moveTo(0, gy); wctx.lineTo(dw, gy); }
  wctx.stroke();

  var i, n;
  for (i = 0; i < S.worldEdges.length; i++) {
    var a = S.worldNodes[S.worldEdges[i][0]], b = S.worldNodes[S.worldEdges[i][1]];
    var isOpen = S.cleared[a.idx];
    wctx.strokeStyle = isOpen ? '#3edcb0' : '#1e2c36';
    wctx.shadowColor = isOpen ? '#3edcb0' : 'transparent';
    wctx.shadowBlur = isOpen ? 8 : 0;
    wctx.setLineDash(isOpen ? [] : [3, 5]);
    wctx.lineWidth = isOpen ? 1.5 : 1;
    wctx.beginPath();
    wctx.moveTo(a.x * dw, a.y * dh);
    wctx.lineTo(b.x * dw, b.y * dh);
    wctx.stroke();
  }
  wctx.setLineDash([]);
  wctx.shadowBlur = 0;

  for (i = 0; i < S.worldNodes.length; i++) {
    n = S.worldNodes[i];
    var nx = n.x * dw, ny = n.y * dh, sec = SECTORS[n.idx % SECTORS.length];
    var isCur = n.idx === S.sector, done = !!S.cleared[n.idx], open = nodeOpen(i);
    var col = done ? '#3edcb0' : (open ? '#f0ece4' : '#3a4a52');
    var tt = performance.now() / 1000;
    wctx.save();
    wctx.translate(nx, ny);
    if (isCur) {
      wctx.strokeStyle = '#ffb83a';
      wctx.shadowColor = '#ffb83a';
      wctx.shadowBlur = 10;
      wctx.lineWidth = 2;
      wctx.beginPath();
      wctx.arc(0, 0, 14, tt * 2, tt * 2 + 4.7);
      wctx.stroke();
      wctx.shadowBlur = 0;
    }
    wctx.rotate(Math.PI / 4);
    var sz = sec.haz === 0 ? 7 : 8;
    wctx.fillStyle = done ? 'rgba(62,220,176,.12)' : '#1a2226';
    wctx.strokeStyle = col;
    wctx.shadowColor = col;
    wctx.shadowBlur = done || open ? 6 : 0;
    wctx.lineWidth = 1.5;
    wctx.fillRect(-sz, -sz, sz * 2, sz * 2);
    wctx.strokeRect(-sz, -sz, sz * 2, sz * 2);
    wctx.shadowBlur = 0;
    wctx.rotate(-Math.PI / 4);
    wctx.fillStyle = col;
    wctx.font = '700 8px "JetBrains Mono",ui-monospace,Menlo,monospace';
    wctx.textAlign = 'center';
    wctx.fillText(pad2(n.idx + 1), 0, 3);
    /* mix bars */
    var mix = sec.mix, tot = mix.fe + mix.cu + mix.si;
    wctx.fillStyle = '#e8854a';
    wctx.fillRect(-9, 12, 18 * mix.fe / tot, 2);
    wctx.fillStyle = '#ffb83a';
    wctx.fillRect(-9, 15, 18 * mix.cu / tot, 2);
    wctx.fillStyle = '#8ab8d8';
    wctx.fillRect(-9, 18, 18 * mix.si / tot, 2);
    wctx.fillStyle = '#5a6f7a';
    wctx.font = '600 7px "JetBrains Mono",ui-monospace,monospace';
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
  $('nodeInfo').textContent = 'SECTOR ' + pad2(idx + 1) + ' · ' + sec.name + ' · ' + HAZNAMES[sec.haz] + ' · click again to deploy';
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
  openModal('mapModal');
  requestAnimationFrame(function () { requestAnimationFrame(drawWorld); });
}
