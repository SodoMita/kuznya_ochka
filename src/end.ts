/* Victory / defeat overlay and its buttons. */
import { S } from './state';
import { $, fmt, pad2 } from './utils';
import { MEDALS, RELICS } from './data';
import { openModal, closeModal } from './modals';
import { openMap } from './worldmap';
import { resetSector } from './reset';
import { hud } from './hud';
import { clearSave, saveHistory, saveBest } from './persist';

export function showEnd(win: boolean): void {
  if (S.endStatsShown && S.over) return;
  S.over = true;
  S.endWin = !!win;
  S.endStatsShown = true;
  clearSave();
  /* record the run */
  if (!S.historySaved) {
    S.historySaved = true;
    var d = new Date();
    S.history.unshift({
      seed: S.seed,
      win: win,
      sector: S.sector,
      wave: S.wave,
      score: S.score,
      kills: S.stat.kills,
      captures: S.stat.captures,
      date: (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())
    });
    S.history = S.history.slice(0, 10);
    saveHistory();
  }
  saveBest();
  $('endTitle').textContent = win ? 'FRONT SECURED' : 'CORE OFFLINE';
  $('endTitle').style.color = win ? '#3ec9b0' : '#e5484d';
  $('endSub').textContent = win ? 'ALL 14 SECTORS CLEARED' : 'SECTOR ' + pad2(S.sector + 1) + ' LOST';
  var relicCount = RELICS.filter(function (r) { return S.relics[r.id]; }).length;
  $('endStats').innerHTML =
    'seed <b style="color:var(--amber)">' + S.seed + '</b> · score <b style="color:var(--gold)">' + fmt(S.score) + '</b> (best ' + fmt(S.best) + ')' +
    '<br>waves survived <b style="color:var(--amber)">' + S.stat.waves + '</b> · kills <b style="color:var(--copper)">' + S.stat.kills +
    '</b> · captures <b style="color:var(--teal)">' + S.stat.captures + '</b> · leaks <b style="color:var(--red)">' + S.stat.leaks +
    '</b> · matter salvaged <b style="color:var(--gold)">' + fmt(S.stat.salvaged) + '</b> · relics ' + relicCount +
    '<br>commendations: <b style="color:var(--teal)">' +
    (MEDALS.filter(function (m) { return S.medals[m[0]]; }).map(function (m) { return m[1]; }).join(' · ') || 'none yet') +
    '</b><br><br>' +
    (win ? 'The salvage front is yours. Rebuild and push an endless escalation, or open the route network.'
         : 'Rebuild keeps your circuit deck, blueprint ranks, relics and cleared routes. Matter resets; exhausted cards return.');
  $('endRebuild').textContent = win ? 'ENDLESS ESCALATION' : 'REBUILD SECTOR';
  openModal('endModal');
  hud(true);
}

$('endRebuild').addEventListener('pointerdown', function () {
  closeModal('endModal');
  if (S.endWin) { S.over = false; S.endStatsShown = false; hud(true); return; } /* endless escalation: resume in place */
  S.over = false;
  S.endStatsShown = false;
  resetSector(S.sector);
});

$('endMap').addEventListener('pointerdown', function () {
  closeModal('endModal');
  openMap();
});
