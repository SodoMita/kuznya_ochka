/* DOM HUD: resource chips, phase bar, the card hand, unit panel, toasts. */
import { S } from './state';
import { $, fmt, pad2 } from './utils';
import { CARDS, GLYPHS, KIND_LABEL, TGT_LABEL, HAZNAMES, MEDALS } from './data';
import { sector, canAfford, usedGrid, upCost, gridCap } from './economy';
import { stats, foundryOut, nextWaveStr } from './towers';
import { defOf, canPlayDef, playCard, handSize, HAND_CAP } from './deck';
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
  /* re-render the hand when any card's playability flips */
  var sig = S.hand.map(function (ci) { return canPlayDef(defOf(ci)).ok ? '1' : '0'; }).join('') + '·' + S.hand.length + '·' + S.selCard;
  if (sig !== handSig) { handSig = sig; renderCards(); }
}

let handSig = '';

const KIND_COL: Record<string, string> = { board: '#9fb6c9', skill: '#3ec9b0', power: '#ffd23f' };

function tagStr(d: DeckCardDef): string {
  var t = '';
  if (d.innate) t += '<em class="tag-inn">INNATE</em>';
  if (d.retain) t += '<em class="tag-ret">RETAIN</em>';
  if (d.ethereal) t += '<em class="tag-eth">ETHEREAL</em>';
  if (d.exhaust) t += '<em class="tag-ex">EXHAUST</em>';
  if (d.consume) t += '<em class="tag-con">CONSUME</em>';
  return t;
}

function costHtml(c: Cost): string {
  if (!c.fe && !c.cu && !c.si) return '<span class="free">NO MATTER COST</span>';
  var h = '';
  if (c.fe) h += '<span class="fe">' + c.fe + 'Fe</span>';
  if (c.cu) h += '<span class="cu">' + c.cu + 'Cu</span>';
  if (c.si) h += '<span class="si">' + c.si + 'Si</span>';
  return h;
}

/** Render the current HAND — real card instances, not a static shop. */
export function renderCards(): void {
  handSig = S.hand.map(function (ci) { return canPlayDef(defOf(ci)).ok ? '1' : '0'; }).join('') + '·' + S.hand.length + '·' + S.selCard;
  var h = '';
  for (var i = 0; i < S.hand.length; i++) {
    var ci = S.hand[i], d = defOf(ci);
    var col = d.kind === 'board' ? CARDS[d.tower!].col : KIND_COL[d.kind];
    var ok = canPlayDef(d).ok;
    var glyph = d.kind === 'board' ? GLYPHS[CARDS[d.tower!].id] : '';
    var rankTag = d.kind === 'board' && S.ranks[CARDS[d.tower!].id] ? '<span class="rank">Mk.' + (S.ranks[CARDS[d.tower!].id] + 1) + '</span>' : '';
    h += '<div class="card' + (i === S.selCard ? ' sel' : '') + (ok ? ' runnable' : ' broke') + '" data-card="' + i + '" style="color:' + col + '">' +
      '<div class="kind"><i>' + KIND_LABEL[d.kind] + '</i></div>' +
      '<div class="hd">' + glyph + '<strong>' + d.name + '</strong>' + (i < 9 ? '<span class="key">' + (i + 1) + '</span>' : '') + '</div>' +
      '<p>' + d.desc + '</p>' +
      '<div class="tags">' + tagStr(d) + '</div>' +
      '<div class="cst">' + costHtml(d.cost) + '</div>' + rankTag +
      '<div class="play">' + (d.kind === 'board' ? '▸ TAP FIELD TO PRINT' : '▸ TAP AGAIN TO RUN') + '</div>' +
      '</div>';
  }
  if (!S.hand.length) {
    h = '<div style="align-self:center;margin:auto;font-size:8px;letter-spacing:2px;color:var(--dim)">HAND EMPTY — NEW CARDS DEALT NEXT FABRICATION WINDOW</div>';
  }
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

function renderPiles(): void {
  $('vDraw').textContent = S.drawPile.length + '';
  $('vDisc').textContent = S.discardPile.length + '';
  $('vExh').textContent = S.exhaustPile.length + '';
  $('pileInfo').textContent = 'HAND ' + S.hand.length + '/' + HAND_CAP + ' · DRAW ' + handSize() + '/TURN · DECK ' + S.deck.length;
}

function miniCard(ci: CardInst): string {
  var d = defOf(ci);
  var col = d.kind === 'board' ? CARDS[d.tower!].col : KIND_COL[d.kind];
  var flags: string[] = [];
  if (d.exhaust) flags.push('EXH');
  if (d.ethereal) flags.push('ETH');
  if (d.retain) flags.push('RET');
  if (d.innate) flags.push('INN');
  if (d.consume) flags.push('CON');
  return '<span class="mini" style="color:' + col + '"><b>' + d.name + '</b><i>' + KIND_LABEL[d.kind] + (flags.length ? ' · ' + flags.join('/') : '') + '</i></span>';
}

function pileSection(title: string, list: CardInst[], sortForPrivacy?: boolean): string {
  var shown = list.slice();
  /* draw pile is shown alphabetically — its true order stays hidden, like StS */
  if (sortForPrivacy) shown.sort(function (a, b) { return defOf(a).name < defOf(b).name ? -1 : 1; });
  return '<div><h4>' + title + ' <span>· ' + list.length + '</span></h4><div class="pileRow">' +
    (shown.length ? shown.map(miniCard).join('') : '<span style="font-size:8px;color:var(--dim);letter-spacing:1px">EMPTY</span>') +
    '</div></div>';
}

/** The circuit ledger: full contents of every pile. */
export function openDeckModal(): void {
  $('deckList').innerHTML =
    pileSection('HAND', S.hand) +
    pileSection('DRAW PILE (ORDER HIDDEN)', S.drawPile, true) +
    pileSection('DISCARD PILE', S.discardPile) +
    pileSection('EXHAUSTED THIS SECTOR', S.exhaustPile) +
    pileSection('FULL DECK', S.deck, true);
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
