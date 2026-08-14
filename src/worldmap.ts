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
  wctx.fillStyle = '#0e1417';
  wctx.fillRect(0, 0, dw, dh);
  var i, n;
  wctx.strokeStyle = '#223038';
  wctx.lineWidth = 1.5;
  for (i = 0; i < S.worldEdges.length; i++) {
    var a = S.worldNodes[S.worldEdges[i][0]], b = S.worldNodes[S.worldEdges[i][1]];
    var open = S.cleared[a.idx];
    wctx.strokeStyle = open ? '#3ec9b0' : '#223038';
    wctx.setLineDash(open ? [] : [3, 4]);
    wctx.beginPath();
    wctx.moveTo(a.x * dw, a.y * dh);
    wctx.lineTo(b.x * dw, b.y * dh);
    wctx.stroke();
  }
  wctx.setLineDash([]);
  for (i = 0; i < S.worldNodes.length; i++) {
    n = S.worldNodes[i];
    var nx = n.x * dw, ny = n.y * dh, sec = SECTORS[n.idx % SECTORS.length];
    var isCur = n.idx === S.sector, done = !!S.cleared[n.idx], open = nodeOpen(i);
    var col = done ? '#3ec9b0' : (open ? '#e9e4d6' : '#3a4a52');
    var tt = performance.now() / 1000;
    wctx.save();
    wctx.translate(nx, ny);
    if (isCur) {
      wctx.strokeStyle = '#ffa02f';
      wctx.lineWidth = 2;
      wctx.beginPath();
      wctx.arc(0, 0, 13, tt * 2, tt * 2 + 4.7);
      wctx.stroke();
    }
    wctx.rotate(Math.PI / 4);
    var sz = sec.haz === 0 ? 7 : 8;
    wctx.fillStyle = done ? '#173a34' : '#1a2226';
    wctx.strokeStyle = col;
    wctx.lineWidth = 1.5;
    wctx.fillRect(-sz, -sz, sz * 2, sz * 2);
    wctx.strokeRect(-sz, -sz, sz * 2, sz * 2);
    wctx.rotate(-Math.PI / 4);
    wctx.fillStyle = col;
    wctx.font = 'bold 8px ui-monospace,Menlo,monospace';
    wctx.textAlign = 'center';
    wctx.fillText(pad2(n.idx + 1), 0, 3);
    /* mix bars */
    var mix = sec.mix, tot = mix.fe + mix.cu + mix.si;
    wctx.fillStyle = '#c9714a';
    wctx.fillRect(-9, 12, 18 * mix.fe / tot, 2);
    wctx.fillStyle = '#ffa02f';
    wctx.fillRect(-9, 15, 18 * mix.cu / tot, 2);
    wctx.fillStyle = '#9fb6c9';
    wctx.fillRect(-9, 18, 18 * mix.si / tot, 2);
    wctx.fillStyle = '#697a80';
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
