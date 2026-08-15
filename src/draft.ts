/* Salvage-cache draft: pick one of three offers between waves.
   Offers mix NEW CARDS for the circuit deck (the StS card reward),
   blueprint rank-ups, and relics. */
import { S } from './state';
import { CARDS, DECK_CARDS, RELICS, KIND_LABEL } from './data';
import { $ } from './utils';
import { openModal, closeModal } from './modals';
import { toast, hud } from './hud';
import { addCardToDeck, defById } from './deck';
import { Snd } from './audio';
import type { DraftOffer } from './types';

export function rollOffers(): DraftOffer[] {
  var pool: DraftOffer[] = [], i;
  /* new copies of cards for the deck — the core StS reward */
  for (i = 0; i < DECK_CARDS.length; i++) {
    var dc = DECK_CARDS[i];
    if (dc.kind === 'curse') continue;       /* curses come from risky card effects, never rewards */
    var owned = S.deck.filter(function (c) { return c.id === dc.id; }).length;
    if (owned < 4) {                       /* soft cap keeps the pool varied */
      pool.push({ kind: 'card', id: dc.id, rar: dc.rar });
      if (dc.rar === 0) pool.push({ kind: 'card', id: dc.id, rar: dc.rar });
    }
  }
  for (i = 0; i < CARDS.length; i++) pool.push({ kind: 'rank', id: CARDS[i].id, rar: 1 });
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
      if (roll <= acc) {
        var picked = pool.splice(i, 1)[0];
        /* purge duplicates of the same offer from the pool */
        pool = pool.filter(function (p) { return !(p.kind === picked.kind && p.id === picked.id); });
        out.push(picked);
        break;
      }
    }
  }
  return out;
}

export function openDraft(): void {
  S.draftOffers = rollOffers();
  var h = '';
  for (var i = 0; i < S.draftOffers.length; i++) {
    var o = S.draftOffers[i], name, desc, pick = '▸ INSTALL', rn = ['COMMON', 'ADVANCED', 'PROTOTYPE'][o.rar];
    if (o.kind === 'card') {
      var d = defById(o.id);
      var flags: string[] = [];
      if (d.exhaust) flags.push('EXHAUST');
      if (d.ethereal) flags.push('ETHEREAL');
      if (d.retain) flags.push('RETAIN');
      if (d.innate) flags.push('INNATE');
      if (d.consume) flags.push('CONSUME');
      name = d.name;
      desc = KIND_LABEL[d.kind] + (flags.length ? ' · ' + flags.join(' · ') : '') + ' — ' + d.desc + '. Added to your circuit deck.';
      pick = '▸ ADD TO DECK';
    } else if (o.kind === 'rank') {
      var c = CARDS.filter(function (x) { return x.id === o.id; })[0];
      name = c.name + ' Mk.' + (S.ranks[o.id] + 2);
      desc = 'Permanent +5% damage & output for every ' + c.name + ' unit, current and future.';
    } else {
      var r = RELICS.filter(function (x) { return x.id === o.id; })[0];
      name = r.name;
      desc = r.desc;
    }
    h += '<div class="offer" data-off="' + i + '"><span class="rar r' + o.rar + '">' + rn + '</span><b>' + name + '</b><p>' + desc + '</p><div class="pick">' + pick + '</div></div>';
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
  if (o.kind === 'card') {
    addCardToDeck(o.id);
    toast(defById(o.id).name + ' → CIRCUIT DECK (' + S.deck.length + ' CARDS)');
  } else if (o.kind === 'rank') {
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
