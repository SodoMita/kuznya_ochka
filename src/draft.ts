/* Salvage-cache draft: pick one of three offers between waves (or skip).
   Offers mix NEW CARDS for the circuit deck (the StS card reward),
   blueprint rank-ups, and relics. */
import { S } from './state';
import { CARDS, DECK_CARDS, RELICS, KIND_LABEL, KIND_COL, GLYPHS } from './data';
import { $ } from './utils';
import { openModal, closeModal } from './modals';
import { toast, hud, award } from './hud';
import { addCardToDeck, defById } from './deck';
import { Snd } from './audio';
import { saveRun } from './persist';
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
  if (S.over) return;
  S.draftOffers = rollOffers();
  var h = '';
  for (var i = 0; i < S.draftOffers.length; i++) {
    var o = S.draftOffers[i], name, desc, pick = '▸ INSTALL', rn = ['COMMON', 'ADVANCED', 'PROTOTYPE'][o.rar];
    var col = '', ribbon = '', glyph = '', tags = '';
    if (o.kind === 'card') {
      var d = defById(o.id);
      var flags: string[] = [];
      if (d.innate) flags.push('<em class="tag-inn">INNATE</em>');
      if (d.retain) flags.push('<em class="tag-ret">RETAIN</em>');
      if (d.ethereal) flags.push('<em class="tag-eth">ETHEREAL</em>');
      if (d.exhaust) flags.push('<em class="tag-ex">EXHAUST</em>');
      if (d.consume) flags.push('<em class="tag-con">CONSUME</em>');
      col = d.kind === 'board' ? CARDS[d.tower!].col : KIND_COL[d.kind];
      ribbon = '<span class="okind">' + KIND_LABEL[d.kind] + '</span>';
      glyph = d.kind === 'board' ? GLYPHS[CARDS[d.tower!].id] : (GLYPHS['k_' + d.kind] || '');
      tags = flags.length ? '<div class="tags">' + flags.join('') + '</div>' : '';
      var owned = S.deck.filter(function (c) { return c.id === o.id; }).length;
      name = d.name + (owned ? ' <u class="owned">×' + owned + ' OWNED</u>' : '');
      desc = d.desc + '. Added to your circuit deck.' + (owned ? ' You already field ' + owned + ' copies.' : '');
      pick = '▸ ADD TO DECK';
    } else if (o.kind === 'rank') {
      var c = CARDS.filter(function (x) { return x.id === o.id; })[0];
      col = c.col;
      ribbon = '<span class="okind">BLUEPRINT UPGRADE</span>';
      glyph = GLYPHS[c.id];
      name = c.name + ' Mk.' + (S.ranks[o.id] + 2);
      desc = 'Permanent +5% damage & output for every ' + c.name + ' unit, current and future. Now Mk.' + (S.ranks[o.id] + 2) + '.';
    } else {
      var r = RELICS.filter(function (x) { return x.id === o.id; })[0];
      col = '#ffa02f';
      ribbon = '<span class="okind">RELIC</span>';
      name = r.name;
      desc = r.desc;
    }
    h += '<div class="offer" data-off="' + i + '" style="color:' + col + '">' + ribbon +
      '<span class="rar r' + o.rar + '">' + rn + '</span><b>' + (glyph || '') + name + '</b><p>' + desc + '</p>' + tags +
      '<div class="pick">' + pick + ' <kbd>' + (i + 1) + '</kbd></div></div>';
  }
  /* the fourth offer: skip for scrap */
  h += '<div class="offer skip" data-off="3" style="color:#8c9da4"><span class="okind">FIELD SCRAP</span>' +
    '<b>SKIP</b><p>Decline the cache. The fabrication rig sweeps the debris: gain 15 Fe immediately.</p>' +
    '<div class="pick">▸ TAKE SCRAP <kbd>4</kbd></div></div>';
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
  if (i === 3) {  /* skip — salvage scrap */
    S.res.fe += 15;
    toast('CACHE DECLINED — +15Fe SCRAP');
    Snd.play('ui');
    closeModal('draftModal');
    hud(true);
    saveRun();
    return;
  }
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
    var owned = RELICS.filter(function (r) { return S.relics[r.id]; }).length;
    if (owned >= 5) award('relic5');
    toast(RELICS.filter(function (r) { return r.id === o.id; })[0].name + ' INSTALLED');
  }
  Snd.play('upgrade');
  closeModal('draftModal');
  hud(true);
  saveRun();
}
