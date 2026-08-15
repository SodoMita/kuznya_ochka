/* DOM HUD: resource chips, phase bar, the card hand, unit panel, toasts. */
import { S } from './state';
import { $, fmt, pad2 } from './utils';
import { CARDS, GLYPHS, KIND_LABEL, TGT_LABEL, HAZNAMES, MEDALS } from './data';
import { sector, canAfford, usedGrid, upCost, gridCap } from './economy';
import { stats, foundryOut, nextWaveStr } from './towers';
import { defOf, defById, canPlayDef, playCard, handSize, HAND_CAP } from './deck';
import type { CardInst, DeckCardDef, Cost } from './types';
import { openModal } from './modals';
import { Snd } from './audio';

let toastTimer: number | undefined = undefined;

export function toast(msg: string): void {
  var e = $('toast');
  e.textContent = msg;
  e.classList.add('show');
  if (toastTimer !== undefined) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(function () { e.classList.remove('show'); }, 1400);
}

export function banner(a: string, b: string): void {
  var e = $('banner');
  e.innerHTML = a + '<small>' + b + '</small>';
  e.classList.remove('show');
  void e.offsetWidth;
  e.classList.add('show');
}

/** Award a one-time commendation medal (no-op if already earned). */
export function award(id: string): void {
  if (S.medals[id]) return;
  S.medals[id] = true;
  var m = MEDALS.filter(function (x) { return x[0] === id; })[0];
  if (m) { toast('COMMENDATION · ' + m[1]); Snd.play('draft'); }
}

export function hud(force?: boolean): void {
  if (force) { renderCards(); renderUnit(); }
  $('vFe').textContent = fmt(S.res.fe);
  $('vCu').textContent = fmt(S.res.cu);
  $('vSi').textContent = fmt(S.res.si);
  $('vW').textContent = usedGrid().toFixed(1) + '/' + Math.floor(gridCap() * 10) / 10;
  $('vCore').textContent = S.core + '';
  $('vWave').textContent = S.wave + '/12' + (S.wave > 12 ? ' ∞' : '');
  var pb = $('phaseBig'), ps = $('phaseSub');
  if (S.phase === 'build') {
    pb.textContent = 'FABRICATION';
    pb.className = '';
    ps.textContent = 'window ' + Math.max(0, S.buildT).toFixed(1) + 's — build, refine, prepare';
    $('startSub').textContent = nextWaveStr() + ' · ' + Math.max(0, S.buildT).toFixed(1) + 's';
    $('startBtn').classList.remove('armed');
    $('startBtn').classList.toggle('hot', S.buildT < 5);
    ($('startBtn').firstChild as Text).textContent = 'START WAVE';
    $('timefill').style.width = (S.buildT / S.buildMax * 100) + '%';
    $('timefill').classList.toggle('low', S.buildT < 5);
  } else {
    pb.textContent = 'WAVE ' + pad2(S.wave);
    pb.className = 'war';
    ps.textContent = 'hostiles ' + (S.enemies.length + S.spawnQ.length) + ' · doctrine ' + S.mode.toUpperCase() +
      (S.streak.n >= 5 && S.time - S.streak.t < 2.2 ? ' · streak ×' + S.streak.n : '') +
      (S.event ? ' · ' + S.event.name : '');
    $('startBtn').classList.add('armed');
    $('startBtn').classList.remove('hot');
    ($('startBtn').firstChild as Text).textContent = 'WAVE ACTIVE';
    $('startSub').textContent = 'doctrine: ' + S.mode.toUpperCase();
    $('timefill').style.width = '100%';
    $('timefill').classList.remove('low');
  }
  $('spdVal').textContent = S.speed + '×';
  $('modeBtn').textContent = 'DOCTRINE: ' + S.mode.toUpperCase();
  $('modeBtn').classList.toggle('on', S.mode === 'capture');
  /* field ability bar */
  var sg = S.ability.surge, wl = S.ability.weld;
  $('surgeCd').textContent = S.time < sg.until ? 'ACTIVE ' + Math.ceil(sg.until - S.time) + 's' :
    (S.time < sg.cd ? 'RECHARGE ' + Math.ceil(sg.cd - S.time) + 's' : 'READY · 40Fe');
  $('abilSurge').classList.toggle('cooling', S.time < sg.cd && S.time >= sg.until);
  $('abilSurge').classList.toggle('ready', S.time >= sg.cd);
  $('weldCd').textContent = S.core >= S.coreMax ? 'CORE FULL' :
    (S.time < wl.cd ? 'RECHARGE ' + Math.ceil(wl.cd - S.time) + 's' : 'READY · 30Fe 15Cu');
  $('abilWeld').classList.toggle('cooling', S.time < wl.cd);
  $('abilWeld').classList.toggle('ready', S.time >= wl.cd && S.core < S.coreMax);
  var sec = sector();
  $('sectorName').textContent = 'SECTOR ' + pad2(S.sector + 1) + ' · ' + sec.name;
  var dom = 'Fe';
  if (sec.mix.cu > sec.mix.fe && sec.mix.cu >= sec.mix.si) dom = 'Cu';
  if (sec.mix.si > sec.mix.fe && sec.mix.si > sec.mix.cu) dom = 'Si';
  $('sectorMix').textContent = 'SALVAGE ' + dom + '-HEAVY · ' + HAZNAMES[sec.haz];
  /* re-render the hand when any card's playability or cost shortfall flips */
  var sig = handSignature();
  if (sig !== handSig) { handSig = sig; renderCards(); }
}

let handSig = '';

function handSignature(): string {
  return S.hand.map(function (ci) {
    var d = defOf(ci);
    return (canPlayDef(d).ok ? '1' : '0') +
      (S.res.fe >= d.cost.fe ? '' : 'f') + (S.res.cu >= d.cost.cu ? '' : 'c') + (S.res.si >= d.cost.si ? '' : 's');
  }).join('|') + '·' + S.hand.length + '·' + S.selCard;
}

const KIND_COL: Record<string, string> = { board: '#9fb6c9', skill: '#3ec9b0', power: '#ffd23f' };

const TAG_TIP: Record<string, string> = {
  INNATE: 'guaranteed in the sector\u2019s opening hand',
  RETAIN: 'not discarded when the turn ends',
  ETHEREAL: 'exhausts if still unplayed when the turn ends',
  EXHAUST: 'removed for the rest of the sector after play',
  CONSUME: 'torn from the deck permanently after play'
};

function tagStr(d: DeckCardDef): string {
  var t = '';
  function tag(cls: string, name: string): string {
    return '<em class="' + cls + '" title="' + name + ': ' + TAG_TIP[name] + '">' + name + '</em>';
  }
  if (d.innate) t += tag('tag-inn', 'INNATE');
  if (d.retain) t += tag('tag-ret', 'RETAIN');
  if (d.ethereal) t += tag('tag-eth', 'ETHEREAL');
  if (d.exhaust) t += tag('tag-ex', 'EXHAUST');
  if (d.consume) t += tag('tag-con', 'CONSUME');
  return t;
}

/** Cost footer — resources you can't cover are flagged red. */
function costHtml(c: Cost): string {
  if (!c.fe && !c.cu && !c.si) return '<span class="free">NO MATTER COST</span>';
  var h = '';
  if (c.fe) h += '<span class="' + (S.res.fe >= c.fe ? 'fe' : 'lack') + '">' + c.fe + 'Fe</span>';
  if (c.cu) h += '<span class="' + (S.res.cu >= c.cu ? 'cu' : 'lack') + '">' + c.cu + 'Cu</span>';
  if (c.si) h += '<span class="' + (S.res.si >= c.si ? 'si' : 'lack') + '">' + c.si + 'Si</span>';
  return h;
}

/* uids rendered last time — cards not in this set get the deal animation */
let seenUids: Record<number, boolean> = {};

/** Render the current HAND — real card instances, not a static shop. */
export function renderCards(): void {
  handSig = handSignature();
  var h = '', dealt = 0;
  for (var i = 0; i < S.hand.length; i++) {
    var ci = S.hand[i], d = defOf(ci);
    var col = d.kind === 'board' ? CARDS[d.tower!].col : KIND_COL[d.kind];
    var chk = canPlayDef(d);
    var glyph = d.kind === 'board' ? GLYPHS[CARDS[d.tower!].id] : '';
    var rankTag = d.kind === 'board' && S.ranks[CARDS[d.tower!].id] ? '<span class="rank">Mk.' + (S.ranks[CARDS[d.tower!].id] + 1) + '</span>' : '';
    var isNew = !seenUids[ci.uid];
    if (isNew) dealt++;
    h += '<div class="card' + (i === S.selCard ? ' sel' : '') + (chk.ok ? ' runnable' : ' broke') + (isNew ? ' deal' : '') +
      '" data-card="' + i + '" style="color:' + col + (isNew ? ';animation-delay:' + ((dealt - 1) * 45) + 'ms' : '') + '"' +
      (chk.ok ? '' : ' title="' + chk.why + '"') + '>' +
      '<div class="kind"><i>' + KIND_LABEL[d.kind] + '</i></div>' +
      '<div class="hd">' + glyph + '<strong>' + d.name + '</strong>' + (i < 9 ? '<span class="key">' + (i + 1) + '</span>' : '') + '</div>' +
      '<p>' + d.desc + '</p>' +
      '<div class="tags">' + tagStr(d) + '</div>' +
      '<div class="cst">' + costHtml(d.cost) + '</div>' + rankTag +
      '<div class="play">' + (d.kind === 'board' ? '▸ TAP FIELD TO PRINT' : '▸ TAP AGAIN TO RUN') + '</div>' +
      '</div>';
  }
  if (!S.hand.length) {
    h = '<div id="handEmpty">HAND EMPTY — NEW CARDS DEALT NEXT FABRICATION WINDOW</div>';
  }
  seenUids = {};
  S.hand.forEach(function (ci2) { seenUids[ci2.uid] = true; });
  $('cards').innerHTML = h;
  var nodes = $('cards').querySelectorAll('.card');
  for (i = 0; i < nodes.length; i++) {
    (function (n: HTMLElement) {
      n.addEventListener('pointerdown', function (ev) {
        ev.stopPropagation();
        Snd.init();
        cardTap(+n.dataset.card!);
      });
    })(nodes[i] as HTMLElement);
  }
  /* keep the selected card in view on narrow screens */
  var selEl = $('cards').querySelector('.card.sel');
  if (selEl && (selEl as any).scrollIntoView) {
    try { (selEl as any).scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* jsdom */ }
  }
  renderPiles();
}

/** Tap logic: first tap selects; second tap runs a subroutine/firmware.
    Boards stay selected — they resolve on battlefield placement. */
function cardTap(i: number): void {
  var ci = S.hand[i];
  if (!ci) return;
  var d = defOf(ci);
  if (S.selCard === i) {
    if (d.kind === 'board') { S.selCard = null; hud(true); return; }  /* toggle off */
    var res = playHandCard(i);
    if (!res) return;
  } else {
    S.selCard = i;
    S.selTower = null;
    Snd.play('ui');
  }
  hud(true);
}

/** Run a non-board card immediately. Returns true if it resolved. */
export function playHandCard(i: number): boolean {
  var r = playCard(i);
  if (!r.ok) { toast(r.msg); Snd.play('error'); return false; }
  toast(r.msg);
  return true;
}

/** Update a pile counter; flash the button briefly when the count changes. */
function setPile(btnId: string, valId: string, n: number): void {
  var v = $(valId);
  if (v.textContent !== n + '') {
    v.textContent = n + '';
    var b = $(btnId);
    b.classList.remove('tick');
    void (b as HTMLElement).offsetWidth;
    b.classList.add('tick');
  }
}

function renderPiles(): void {
  setPile('pileDraw', 'vDraw', S.drawPile.length);
  setPile('pileDisc', 'vDisc', S.discardPile.length);
  setPile('pileExh', 'vExh', S.exhaustPile.length);
  $('pileInfo').textContent = 'HAND ' + S.hand.length + '/' + HAND_CAP + ' · DRAW ' + handSize() + '/TURN · DECK ' + S.deck.length;
}

function miniCard(d: DeckCardDef, n: number): string {
  var col = d.kind === 'board' ? CARDS[d.tower!].col : KIND_COL[d.kind];
  var flags: string[] = [];
  if (d.exhaust) flags.push('EXH');
  if (d.ethereal) flags.push('ETH');
  if (d.retain) flags.push('RET');
  if (d.innate) flags.push('INN');
  if (d.consume) flags.push('CON');
  return '<span class="mini" style="color:' + col + '" title="' + d.desc + '"><b>' + d.name + '</b>' +
    (n > 1 ? '<u>×' + n + '</u>' : '') +
    '<i>' + KIND_LABEL[d.kind] + (flags.length ? ' · ' + flags.join('/') : '') + '</i></span>';
}

/** Piles are shown grouped by card with a ×N count — order stays hidden, like StS. */
function pileSection(title: string, list: CardInst[]): string {
  var cnt: Record<string, number> = {}, order: string[] = [];
  list.forEach(function (ci) {
    if (cnt[ci.id] === undefined) { cnt[ci.id] = 0; order.push(ci.id); }
    cnt[ci.id]++;
  });
  order.sort(function (a, b) { return defById(a).name < defById(b).name ? -1 : 1; });
  return '<div><h4>' + title + ' <span>· ' + list.length + (list.length === 1 ? ' CARD' : ' CARDS') + '</span></h4><div class="pileRow">' +
    (order.length ? order.map(function (id) { return miniCard(defById(id), cnt[id]); }).join('') : '<span class="pileEmpty">EMPTY</span>') +
    '</div></div>';
}

/** The circuit ledger: full contents of every pile. */
export function openDeckModal(): void {
  $('deckList').innerHTML =
    pileSection('HAND', S.hand) +
    pileSection('DRAW PILE', S.drawPile) +
    pileSection('DISCARD PILE', S.discardPile) +
    pileSection('EXHAUSTED THIS SECTOR', S.exhaustPile) +
    pileSection('FULL DECK', S.deck);
  openModal('deckModal');
  Snd.play('ui');
}

export function renderUnit(): void {
  var t = S.selTower;
  var has = !!(t && S.towers.indexOf(t) >= 0);
  $('tgtRow').style.display = has ? 'grid' : 'none';
  if (!t || !has) {
    $('unitHead').textContent = 'NO UNIT SELECTED';
    $('unitStats').textContent = 'tap near a unit — nearest one is grabbed · tap again to release';
    $('upCost').textContent = '—';
    $('recVal').textContent = '—';
    return;
  }
  var c = CARDS[t.i], st = stats(t), uc = upCost(t);
  $('unitHead').textContent = c.name + ' · L' + t.lvl + (S.ranks[c.id] ? ' Mk.' + (S.ranks[c.id] + 1) : '') +
    (st.stars ? ' · ' + '★'.repeat(Math.min(st.stars, 5)) + (st.stars > 5 ? '+' + (st.stars - 5) : '') : '');
  if (c.id === 'foundry') {
    var o = foundryOut(t);
    $('unitStats').textContent = 'refines ' + o.fe.toFixed(2) + 'Fe ' + o.cu.toFixed(2) + 'Cu ' + o.si.toFixed(2) + 'Si /s · aura +8% rate';
  } else if (c.id === 'aegis') {
    $('unitStats').textContent = 'slow field ' + Math.round(Math.min(50, 30 + 2 * (t.lvl - 1))) + '% · rng ' + Math.round(st.range) + ' · grid ' + (c.draw + .3 * (t.lvl - 1)).toFixed(1);
  } else {
    $('unitStats').textContent = 'dps ' + (st.dmg * st.rate).toFixed(1) + ' · rng ' + Math.round(st.range) + ' · grid ' + (c.draw + .3 * (t.lvl - 1)).toFixed(1) + ' · tgt ' + TGT_LABEL[t.tgt];
  }
  var bs = $('tgtRow').children;
  for (var k = 0; k < bs.length; k++) (bs[k] as HTMLElement).classList.toggle('on', (bs[k] as HTMLElement).dataset.tgt === t.tgt);
  $('upCost').textContent = uc.fe + 'Fe ' + uc.cu + 'Cu ' + uc.si + 'Si';
  $('recVal').textContent = '+' + Math.floor(t.inv.fe * .7) + 'Fe +' + Math.floor(t.inv.cu * .7) + 'Cu +' + Math.floor(t.inv.si * .7) + 'Si';
}
