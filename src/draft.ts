/* Salvage-cache draft: pick one of three offers between waves. */
import { S } from './state';
import { CARDS, RELICS } from './data';
import { $ } from './utils';
import { openModal, closeModal } from './modals';
import { toast, hud } from './hud';
import { Snd } from './audio';
import type { DraftOffer } from './types';

export function rollOffers(): DraftOffer[] {
  var pool: DraftOffer[] = [], i;
  for (i = 0; i < CARDS.length; i++) pool.push({ kind: 'rank', id: CARDS[i].id, rar: 0 });
  for (i = 0; i < RELICS.length; i++) {
    if (!S.relics[RELICS[i].id]) pool.push({ kind: 'relic', id: RELICS[i].id, rar: RELICS[i].rar });
  }
  var w: Record<number, number> = { 0: 5, 1: 3, 2: 2 }, out: DraftOffer[] = [];
  while (out.length < 3 && pool.length) {
    var tot = 0;
    pool.forEach(function (p) { tot += w[p.rar]; });
    var roll = Math.random() * tot, acc = 0;
    for (i = 0; i < pool.length; i++) {
      acc += w[pool[i].rar];
      if (roll <= acc) { out.push(pool.splice(i, 1)[0]); break; }
    }
  }
  return out;
}

export function openDraft(): void {
  S.draftOffers = rollOffers();
  var h = '';
  for (var i = 0; i < S.draftOffers.length; i++) {
    var o = S.draftOffers[i], name, desc, rn = ['COMMON', 'ADVANCED', 'PROTOTYPE'][o.rar];
    if (o.kind === 'rank') {
      var c = CARDS.filter(function (x) { return x.id === o.id; })[0];
      name = c.name + ' Mk.' + (S.ranks[o.id] + 2);
      desc = 'Permanent +5% damage & output for every ' + c.name + ' unit, current and future.';
    } else {
      var r = RELICS.filter(function (x) { return x.id === o.id; })[0];
      name = r.name;
      desc = r.desc;
    }
    h += '<div class="offer" data-off="' + i + '"><span class="rar r' + o.rar + '">' + rn + '</span><b>' + name + '</b><p>' + desc + '</p><div class="pick">▸ INSTALL</div></div>';
  }
  $('offers').innerHTML = h;
  var nodes = $('offers').children;
  for (i = 0; i < nodes.length; i++) {
    (function (n: HTMLElement) {
      n.addEventListener('pointerdown', function () { chooseDraft(+n.dataset.off!); });
    })(nodes[i] as HTMLElement);
  }
  openModal('draftModal');
  Snd.play('draft');
}

export function chooseDraft(i: number): void {
  var o = S.draftOffers[i];
  if (!o) return;
  if (o.kind === 'rank') {
    S.ranks[o.id]++;
    toast(CARDS.filter(function (c) { return c.id === o.id; })[0].name + ' BLUEPRINT → Mk.' + (S.ranks[o.id] + 1));
  } else {
    S.relics[o.id] = true;
    if (o.id === 'cap') S.gridMax += 8;
    if (o.id === 'plating') { S.coreMax += 6; S.core += 6; }
    toast(RELICS.filter(function (r) { return r.id === o.id; })[0].name + ' INSTALLED');
  }
  Snd.play('upgrade');
  closeModal('draftModal');
  hud(true);
}
