/* Victory / defeat overlay and its buttons. */
import { S } from './state';
import { $, fmt, pad2 } from './utils';
import { MEDALS } from './data';
import { openModal, closeModal } from './modals';
import { openMap } from './worldmap';
import { resetSector } from './reset';
import { hud } from './hud';

export function showEnd(win: boolean): void {
  S.over = true;
  S.endWin = !!win;
  $('endTitle').textContent = win ? 'FRONT SECURED' : 'CORE OFFLINE';
  $('endTitle').style.color = win ? '#3ec9b0' : '#e5484d';
  $('endSub').textContent = win ? 'ALL 12 SECTORS CLEARED' : 'SECTOR ' + pad2(S.sector + 1) + ' LOST';
  $('endStats').innerHTML =
    'waves survived <b style="color:var(--amber)">' + S.stat.waves + '</b> · kills <b style="color:var(--copper)">' + S.stat.kills +
    '</b> · captures <b style="color:var(--teal)">' + S.stat.captures + '</b> · leaks <b style="color:var(--red)">' + S.stat.leaks +
    '</b> · matter salvaged <b style="color:var(--gold)">' + fmt(S.stat.salvaged) + '</b>' +
    '<br>commendations: <b style="color:var(--teal)">' +
    (MEDALS.filter(function (m) { return S.medals[m[0]]; }).map(function (m) { return m[1]; }).join(' · ') || 'none yet') +
    '</b><br><br>' +
    (win ? 'The salvage front is yours. Rebuild and push an endless escalation, or open the route network.'
         : 'Rebuild keeps your circuit deck, blueprint ranks, relics and cleared routes. Matter resets; exhausted cards return.');
  $('endRebuild').textContent = win ? 'ENDLESS ESCALATION' : 'REBUILD SECTOR';
  openModal('endModal');
}

$('endRebuild').addEventListener('pointerdown', function () {
  closeModal('endModal');
  if (S.endWin) { S.over = false; hud(true); return; } /* endless escalation: resume in place */
  S.over = false;
  resetSector(S.sector);
});

$('endMap').addEventListener('pointerdown', function () {
  closeModal('endModal');
  openMap();
});
