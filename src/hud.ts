/* DOM HUD: resource chips, phase bar, the card hand, unit panel, toasts. */
import { S } from './state';
import { $, fmt, pad2 } from './utils';
import { CARDS, GLYPHS, KIND_LABEL, KIND_COL, TGT_LABEL, TGT_TIPS, HAZNAMES, MEDALS, MEDAL_TIPS, RELICS, ETYPES, DECK_CARDS } from './data';
import { sector, canAfford, usedGrid, upCost, gridCap } from './economy';
import { stats, foundryOut, nextWaveStr, wavePreview, hasMod, supplyAt } from './towers';
import { defOf, defById, canPlayDef, playCard, handSize, HAND_CAP, modById, selModule, isTargetedSkill, selTargetedSkill, freeMulligan } from './deck';
import type { CardInst, DeckCardDef, Cost, RunRecord, ToastItem } from './types';
import { openModal } from './modals';
import { Snd } from './audio';

/* ---- toast queue — up to 3 pending, shown one at a time ---- */
let toastTimer: number | undefined = undefined;
let toastBusy = false;
const toastQueue: string[] = [];

export function toast(msg: string): void {
  toastQueue.push(msg);
  if (toastQueue.length > 3) toastQueue.splice(0, toastQueue.length - 3);
  pumpToast();
}

function pumpToast(): void {
  if (toastBusy || !toastQueue.length) return;
  toastBusy = true;
  var msg = toastQueue.shift()!;
  var e = $('toast');
  e.textContent = msg;
  e.classList.add('show');
  var dur = Math.min(3000, 1200 + msg.length * 14);
  toastTimer = window.setTimeout(function () {
    e.classList.remove('show');
    toastBusy = false;
    window.setTimeout(pumpToast, 130);
  }, dur);
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
  if (m) { toast('COMMENDATION · ' + m[1]); Snd.play('medal'); S.notif++; }
}

/* last-seen values for change pulses */
let lastFe = '', lastCu = '', lastSi = '', lastW = '', lastCore = '', lastScore = '';

function pulse(el: HTMLElement): void {
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
}

export function hud(force?: boolean): void {
  if (force) { renderCards(); renderUnit(); }
  var fe = fmt(S.res.fe), cu = fmt(S.res.cu), si = fmt(S.res.si);
  if (fe !== lastFe) { $('vFe').textContent = fe; pulse($('vFe').parentElement!); lastFe = fe; }
  if (cu !== lastCu) { $('vCu').textContent = cu; pulse($('vCu').parentElement!); lastCu = cu; }
  if (si !== lastSi) { $('vSi').textContent = si; pulse($('vSi').parentElement!); lastSi = si; }
  var wstr = usedGrid().toFixed(1) + '/' + Math.floor(gridCap() * 10) / 10;
  if (wstr !== lastW) {
    $('vW').textContent = wstr;
    $('vW').parentElement!.classList.toggle('warn', usedGrid() >= gridCap() * .9);
    lastW = wstr;
  }
  if (S.core + '' !== lastCore) {
    $('vCore').textContent = S.core + '';
    $('vCore').parentElement!.classList.toggle('danger', S.core <= S.coreMax * .35);
    lastCore = S.core + '';
  }
  var scoreStr = fmt(S.score);
  if (scoreStr !== lastScore) {
    $('vScore').textContent = scoreStr;
    $('vScore').parentElement!.setAttribute('title', 'BEST ' + fmt(S.best));
    pulse($('vScore').parentElement!);
    lastScore = scoreStr;
  }
  $('vWave').textContent = S.wave + '/12' + (S.wave > 12 ? ' ∞' : '');
  var pb = $('phaseBig'), ps = $('phaseSub');
  if (S.phase === 'build') {
    pb.textContent = 'FABRICATION';
    pb.className = '';
    var pv = wavePreview();
    ps.textContent = 'window ' + Math.max(0, S.buildT).toFixed(1) + 's — build, refine, prepare · ' + pv.lines.join(' · ');
    $('startSub').textContent = nextWaveStr() + ' · ' + Math.max(0, S.buildT).toFixed(1) + 's · ' + '★'.repeat(pv.threat) + '☆'.repeat(5 - pv.threat);
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
  $('spdVal').classList.toggle('turbo', S.speed >= 100);
  $('modeBtn').textContent = 'DOCTRINE: ' + S.mode.toUpperCase();
  $('modeBtn').classList.toggle('on', S.mode === 'capture');
  $('pauseBtn').textContent = S.paused ? '▶ RESUME' : '❚❚ PAUSE';
  /* objective chip */
  var oc = $('objChip');
  if (S.objective) {
    oc.style.display = 'block';
    oc.textContent = (S.objective.done ? '✓ ' : '◇ ') + S.objective.name + ' — ' + S.objective.desc;
    oc.classList.toggle('done', S.objective.done);
  } else {
    oc.style.display = 'none';
  }
  /* mulligan button — first fabrication window of the sector only */
  var mb = $('mulliganBtn');
  mb.style.display = (S.phase === 'build' && S.wave === 0 && !S.mulliganUsed && !S.modalOpen) ? 'inline-block' : 'none';
  /* field ability bar */
  var sg = S.ability.surge, wl = S.ability.weld;
  $('surgeCd').textContent = S.time < sg.until ? 'ACTIVE ' + Math.ceil(sg.until - S.time) + 's' :
    (S.time < sg.cd ? 'RECHARGE ' + Math.ceil(sg.cd - S.time) + 's' : 'READY · 40Fe');
  $('abilSurge').classList.toggle('cooling', S.time < sg.cd && S.time >= sg.until);
  $('abilSurge').classList.toggle('ready', S.time >= sg.cd && S.res.fe >= 40);
  $('abilSurge').classList.toggle('poor', S.time >= sg.cd && S.res.fe < 40);
  $('weldCd').textContent = S.core >= S.coreMax ? 'CORE FULL' :
    (S.time < wl.cd ? 'RECHARGE ' + Math.ceil(wl.cd - S.time) + 's' : 'READY · 30Fe 15Cu');
  $('abilWeld').classList.toggle('cooling', S.time < wl.cd);
  $('abilWeld').classList.toggle('ready', S.time >= wl.cd && S.core < S.coreMax);
  $('abilWeld').classList.toggle('poor', S.time >= wl.cd && (S.res.fe < 30 || S.res.cu < 15));
  var sec = sector();
  $('sectorName').textContent = 'SECTOR ' + pad2(S.sector + 1) + ' · ' + sec.name + (S.speed >= 100 ? ' · TURBO' : '');
  var dom = 'Fe';
  if (sec.mix.cu > sec.mix.fe && sec.mix.cu >= sec.mix.si) dom = 'Cu';
  if (sec.mix.si > sec.mix.fe && sec.mix.si > sec.mix.cu) dom = 'Si';
  $('sectorMix').textContent = 'SALVAGE ' + dom + '-HEAVY · ' + HAZNAMES[sec.haz];
  /* card-management buttons light up only while a card is selected */
  var hasSel = S.selCard != null;
  $('discardCard').classList.toggle('on', hasSel);
  $('recycleCard').classList.toggle('on', hasSel);
  /* medals badge */
  $('medBtn').classList.toggle('new', S.notif > 0);
  $('medBtn').setAttribute('title', 'Commendations — ' + Object.keys(S.medals).length + '/' + MEDALS.length + ' earned');
  /* re-render the hand when any card's playability or cost shortfall flips */
  var sig = handSignature();
  if (sig !== handSig) { handSig = sig; renderCards(); }
  renderUnit();
}

let handSig = '';

function handSignature(): string {
  return S.hand.map(function (ci) {
    var d = defOf(ci);
    return (canPlayDef(d).ok ? '1' : '0') +
      (S.res.fe >= d.cost.fe ? '' : 'f') + (S.res.cu >= d.cost.cu ? '' : 'c') + (S.res.si >= d.cost.si ? '' : 's');
  }).join('|') + '·' + S.hand.length + '·' + S.selCard + '·' + S.selTower;
}

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
    var col = d.kind === 'board' ? CARDS[d.tower!].col : d.kind === 'module' ? modById(d.module!).col : KIND_COL[d.kind];
    var chk = canPlayDef(d);
    var glyph = d.kind === 'board' ? GLYPHS[CARDS[d.tower!].id] : d.kind === 'module' ? GLYPHS.mod : (GLYPHS['k_' + d.kind] || '');
    var rankTag = d.kind === 'board' && S.ranks[CARDS[d.tower!].id] ? '<span class="rank">Mk.' + (S.ranks[CARDS[d.tower!].id] + 1) + '</span>' : '';
    var isNew = !seenUids[ci.uid];
    if (isNew) dealt++;
    h += '<div class="card' + (i === S.selCard ? ' sel' : '') + (chk.ok ? ' runnable' : ' broke') + (isNew ? ' deal' : '') +
      '" data-card="' + i + '" style="color:' + col + (isNew ? ';animation-delay:' + ((dealt - 1) * 45) + 'ms' : '') + '"' +
      (chk.ok ? '' : ' title="' + chk.why + '"') + '>' +
      '<div class="kind"><i>' + KIND_LABEL[d.kind] + '</i></div>' +
      (i < 9 ? '<span class="key">' + (i + 1) + '</span>' : '') +
      '<div class="hd"><strong>' + d.name + '</strong></div>' +
      '<div class="icon"><i>' + glyph + '</i></div>' +
      '<p title="' + d.desc + '">' + d.desc + '</p>' +
      '<div class="tags">' + tagStr(d) + '</div>' +
      '<div class="cst">' + costHtml(d.cost) + '</div>' + rankTag +
      '<div class="play">' + (d.kind === 'board' ? '▸ TAP FIELD TO PRINT' : d.kind === 'curse' ? 'UNPLAYABLE' : d.kind === 'module' ? '▸ TAP A UNIT TO INSTALL' : isTargetedSkill(d) ? '▸ TAP A UNIT TO CAST' : '▸ TAP AGAIN TO RUN') + '</div>' +
      '</div>';
  }
  if (!S.hand.length) {
    h = '<div id="handEmpty">HAND EMPTY — NEW CARDS DEALT NEXT FABRICATION WINDOW · [D] LEDGER</div>';
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
    if (d.kind === 'board' || d.kind === 'module' || isTargetedSkill(d)) { S.selCard = null; hud(true); return; }  /* toggle off */
    var res = playHandCard(i);
    if (!res) return;
  } else {
    S.selCard = i;
    if (d.kind !== 'module' && !isTargetedSkill(d)) S.selTower = null;   /* keep the unit selected for targeted cards */
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
  var col = d.kind === 'board' ? CARDS[d.tower!].col : d.kind === 'module' ? modById(d.module!).col : KIND_COL[d.kind];
  var flags: string[] = [];
  if (d.exhaust) flags.push('EXH');
  if (d.ethereal) flags.push('ETH');
  if (d.retain) flags.push('RET');
  if (d.innate) flags.push('INN');
  if (d.consume) flags.push('CON');
  return '<span class="mini" style="color:' + col + '" title="' + d.name + ' — ' + d.desc + '"><b>' + d.name + '</b>' +
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
  var kinds: Record<string, number> = { board: 0, skill: 0, power: 0, module: 0, curse: 0 };
  S.deck.forEach(function (ci) { kinds[defOf(ci).kind]++; });
  var summary = 'boards ' + kinds.board + ' · skills ' + kinds.skill + ' · firmware ' + kinds.power +
    ' · modules ' + kinds.module + ' · corruptions ' + kinds.curse +
    (S.exhaustPile.length ? ' · exhausted cards return next sector' : '');
  $('deckList').innerHTML =
    pileSection('HAND', S.hand) +
    pileSection('DRAW PILE', S.drawPile) +
    pileSection('DISCARD PILE', S.discardPile) +
    pileSection('EXHAUSTED THIS SECTOR', S.exhaustPile) +
    pileSection('FULL DECK', S.deck) +
    '<div><h4>COMPOSITION</h4><div class="pileRow"><span class="mini" style="color:var(--dim)"><b>LEDGER</b><i>' + summary + '</i></span></div></div>';
  openModal('deckModal');
  Snd.play('ui');
}

let unitSig = '';
export function renderUnit(): void {
  var t = S.selTower;
  var has = !!(t && S.towers.indexOf(t) >= 0);
  var md = selModule();
  var rk = selTargetedSkill();
  /* cheap change-signature — skips all DOM writes while the panel is static
     (renderUnit runs on every HUD tick; this keeps 60Hz free of layout churn) */
  var sig = (t && has) ?
    t.i + '|' + t.lvl + '|' + t.hp.toFixed(1) + '|' + t.mhp + '|' + t.kills + '|' + t.caps + '|' +
    t.dealt.toFixed(0) + '|' + t.tgt + '|' + t.mods.join(',') + '|' + t.inv.fe + ',' + t.inv.cu + ',' + t.inv.si +
    '|' + S.towers.length + '|' + (S.ranks[CARDS[t.i].id] || 0) :
    '-|' + (md ? md.id : '') + '|' + (rk ? rk.id : '');
  sig += '|' + (md ? md.id : '') + '|' + (rk ? rk.id + canAfford(rk.cost) : '') + '|' + S.towers.length;
  if (t && has) {
    var stS = stats(t);
    sig += '|' + (stS.dmg * stS.rate).toFixed(1) + '|' + stS.range.toFixed(0) + '|' + stS.stars;
    sig += '|' + upCost(t).fe + ',' + upCost(t).cu + ',' + upCost(t).si;
  }
  if (sig === unitSig) return;
  unitSig = sig;
  $('tgtRow').style.display = has ? 'grid' : 'none';
  $('sellAllBtn').style.display = has ? '' : 'none';
  $('upAllBtn').style.display = has ? '' : 'none';
  if (!t || !has) {
    $('unitHead').textContent = 'NO UNIT SELECTED';
    $('unitStats').textContent = md ? 'MODULE READY — SELECT A COMPATIBLE UNIT TO INSTALL' :
      rk ? 'RECALIBRATE READY — TAP A UNIT TO +1 LEVEL' : 'tap near a unit — nearest one is grabbed · tap again to release';
    $('unitMods').innerHTML = '';
    $('modBtn').style.display = 'none';
    $('recalBtn').style.display = 'none';
    $('upCost').textContent = '—';
    $('recVal').textContent = '—';
    return;
  }
  var c = CARDS[t.i], st = stats(t), uc = upCost(t);
  /* installed modules + INSTALL button state */
  var modHtml = t.mods.map(function (id) {
    var m = modById(id);
    return '<em style="color:' + m.col + '" title="' + m.desc + '">' + m.name + '</em>';
  }).join(' · ');
  $('unitMods').innerHTML = t.mods.length ? '<b>MODS</b> ' + modHtml : '';
  var compat = !!(md && md.forIds.indexOf(c.id) >= 0);
  var dup = !!(md && hasMod(t, md.id));
  $('modBtn').style.display = md ? 'block' : 'none';
  $('modBtn').classList.toggle('on', compat);
  $('modBtn').classList.toggle('broke', !compat || dup);
  if (md) {
    ($('modBtn').querySelector('span') as HTMLElement).textContent =
      compat ? (dup ? 'MODULE INSTALLED' : 'INSTALL ' + md.name.toUpperCase()) : (md.name.toUpperCase() + ' ×');
    ($('modBtn').querySelector('small') as HTMLElement).textContent =
      compat && !dup ? '▸ tap field unit or press here' : compat ? 'one per unit' : 'needs ' + md.forIds.join('/').toUpperCase();
  } else {
    ($('modBtn').querySelector('span') as HTMLElement).textContent = 'INSTALL MODULE';
    ($('modBtn').querySelector('small') as HTMLElement).textContent = '—';
  }
  /* RECALIBRATE targeted-skill button */
  $('recalBtn').style.display = rk ? 'block' : 'none';
  if (rk) {
    ($('recalBtn').querySelector('span') as HTMLElement).textContent = 'RECALIBRATE ' + c.name.toUpperCase();
    ($('recalBtn').querySelector('small') as HTMLElement).textContent =
      canAfford(rk.cost) ? '▸ tap field unit or press here' : 'INSUFFICIENT MATTER';
  }
  $('unitHead').textContent = c.name + ' · L' + t.lvl + (S.ranks[c.id] ? ' Mk.' + (S.ranks[c.id] + 1) : '') +
    (st.stars ? ' · ' + '★'.repeat(Math.min(st.stars, 5)) + (st.stars > 5 ? '+' + (st.stars - 5) : '') : '');
  var extra = ' · int ' + Math.ceil(t.hp) + '/' + t.mhp +
    (t.kills ? ' · ' + t.kills + ' kills' : '') +
    (t.caps ? ' · ' + t.caps + ' caps' : '') +
    (t.dealt >= 100 ? ' · dealt ' + fmt(t.dealt) : '');
  if (c.id === 'foundry') {
    var o = foundryOut(t);
    $('unitStats').textContent = 'refines ' + o.fe.toFixed(2) + 'Fe ' + o.cu.toFixed(2) + 'Cu ' + o.si.toFixed(2) + 'Si /s · aura +8% rate' + extra;
  } else if (c.id === 'aegis') {
    var slowPct = Math.round(Math.min(50, (hasMod(t, 'cryo') ? 45 : 30) + 2 * (t.lvl - 1)));
    $('unitStats').textContent = 'slow field ' + slowPct + '% · rng ' + Math.round(st.range) +
      (hasMod(t, 'static') ? ' · zaps ' + (2 + .5 * (t.lvl - 1)).toFixed(1) + '/s' : '') +
      ' · grid ' + (c.draw + .3 * (t.lvl - 1)).toFixed(1) + extra;
  } else if (c.id === 'pulse') {
    $('unitStats').textContent = 'blast ' + Math.round(st.dmg) + ' · every ' + (1 / st.rate).toFixed(1) + 's · rng ' + Math.round(st.range) +
      ' · grid ' + (c.draw + .3 * (t.lvl - 1)).toFixed(1) + extra;
  } else {
    $('unitStats').textContent = 'dps ' + (st.dmg * st.rate).toFixed(1) + ' · rng ' + Math.round(st.range) + ' · grid ' + (c.draw + .3 * (t.lvl - 1)).toFixed(1) + ' · tgt ' + TGT_LABEL[t.tgt] + extra;
  }
  var bs = $('tgtRow').children;
  for (var k = 0; k < bs.length; k++) {
    var be = bs[k] as HTMLElement;
    be.classList.toggle('on', be.dataset.tgt === t.tgt);
    be.setAttribute('title', TGT_TIPS[be.dataset.tgt!] || '');
  }
  $('upCost').textContent = uc.fe + 'Fe ' + uc.cu + 'Cu ' + uc.si + 'Si';
  $('recVal').textContent = '+' + Math.floor(t.inv.fe * .7) + 'Fe +' + Math.floor(t.inv.cu * .7) + 'Cu +' + Math.floor(t.inv.si * .7) + 'Si';
  /* sell-all / upgrade-all */
  var same = S.towers.filter(function (x) { return x.i === t!.i; });
  ($('sellAllBtn').querySelector('span') as HTMLElement).textContent = 'SELL ALL ' + c.name.toUpperCase() + ' ×' + same.length;
  ($('sellAllBtn').querySelector('small') as HTMLElement).textContent = same.length > 1 ? '70% invested matter back' : 'single unit — use RECYCLE';
  ($('upAllBtn').querySelector('span') as HTMLElement).textContent = 'UPGRADE ALL ×' + same.length;
  ($('upAllBtn').querySelector('small') as HTMLElement).textContent = 'one level each, while affordable';
}

/* ---- medals gallery ---- */
export function openMedals(): void {
  S.notif = 0;
  var got = 0;
  var h = MEDALS.map(function (m) {
    var own = !!S.medals[m[0]];
    if (own) got++;
    return '<div class="medal' + (own ? ' own' : '') + '" title="' + (MEDAL_TIPS[m[0]] || '') + '"><b>' + m[1] + '</b><i>' +
      (own ? 'EARNED' : (MEDAL_TIPS[m[0]] || '—')) + '</i></div>';
  }).join('');
  $('medalList').innerHTML = h;
  $('medalCount').textContent = got + '/' + MEDALS.length + ' COMMENDATIONS';
  openModal('medalsModal');
  Snd.play('ui');
}

/* ---- run archive: history / relics / codex ---- */
export function openStats(): void {
  renderHistoryTab();
  openModal('statsModal');
  Snd.play('ui');
}

function renderHistoryTab(): void {
  var rows = S.history.length ?
    S.history.map(function (r: RunRecord) {
      return '<tr><td>' + (r.win ? '✓ CLEARED' : '✕ LOST') + '</td><td>SEED ' + r.seed + '</td><td>wave ' + r.wave + '</td><td>score ' + fmt(r.score) + '</td><td>' + r.kills + ' kills</td><td>' + r.date + '</td></tr>';
    }).join('') :
    '<tr><td colspan="6">NO RUNS RECORDED YET — GO BREAK SOMETHING</td></tr>';
  $('histBody').innerHTML = rows;
  var secs = Object.keys(S.cleared).length;
  $('histInfo').innerHTML =
    'CURRENT RUN · seed <b style="color:var(--amber)">' + S.seed + '</b> · wave ' + S.wave +
    ' · score <b style="color:var(--gold)">' + fmt(S.score) + '</b> (best ' + fmt(S.best) + ')' +
    ' · sectors ' + secs + '/14 · kills ' + S.stat.kills + ' · captures ' + S.stat.captures +
    ' · leaks ' + S.stat.leaks + ' · towers lost ' + S.stat.towerLoss + ' · salvaged ' + fmt(S.stat.salvaged);
}

function renderRelicsTab(): void {
  var owned = RELICS.filter(function (r) { return S.relics[r.id]; });
  var h = owned.length ?
    owned.map(function (r) {
      return '<span class="mini" style="color:#ffa02f" title="' + r.desc + '"><b>' + r.name + '</b><i>RELIC</i></span>';
    }).join('') : '<span class="pileEmpty">NO RELICS INSTALLED</span>';
  $('relicList').innerHTML = h + '<p style="margin-top:8px">' + owned.length + '/' + RELICS.length +
    ' recovered. Relics drop from salvage drafts and slain ANNIHILATORS.</p>';
}

function renderCodexTab(): void {
  var ch = CARDS.map(function (c, idx) {
    var boardDef: DeckCardDef | null = null;
    for (var k = 0; k < DECK_CARDS.length; k++) {
      if (DECK_CARDS[k].kind === 'board' && DECK_CARDS[k].tower === idx) { boardDef = DECK_CARDS[k]; break; }
    }
    var owned = boardDef ? S.deck.filter(function (x) { return x.id === boardDef!.id; }).length : 0;
    var dps = c.dmg && c.rate ? Math.round(c.dmg * c.rate) : 0;
    var rank = S.ranks[c.id] || 0;
    var stat = dps ? 'DPS ' + dps : c.id === 'aegis' ? 'SLOW 30%' : c.id === 'foundry' ? 'REFINERY' : c.id === 'pulse' ? 'BLAST' : '—';
    return '<span class="mini" style="color:' + c.col + '" title="' + c.desc + '">' + GLYPHS[c.id] + '<b>' + c.name + '</b>' +
      '<i>Mk.' + (rank + 1) + ' · ' + stat +
      (owned ? ' · deck ×' + owned : '') + '</i></span>';
  }).join('');
  var eh = Object.keys(ETYPES).map(function (k) {
    var e = ETYPES[k];
    return '<span class="mini" style="color:' + e.col + '"><b>' + k.toUpperCase() + '</b><i>HP×' + e.hp + ' · SPD ' + e.sp +
      (e.armor ? ' · ARM ' + Math.round(e.armor * 100) + '%' : '') + (e.regen ? ' · REGEN' : '') + ' · leaks ' + e.dmg + '</i></span>';
  }).join('');
  $('codexTowers').innerHTML = ch;
  $('codexEnemies').innerHTML = eh;
}

export function statsTab(tab: string): void {
  Array.prototype.forEach.call($('statsTabs').children, function (b: HTMLElement) {
    b.classList.toggle('on', b.dataset.tab === tab);
  });
  $('tabHistory').style.display = tab === 'history' ? 'block' : 'none';
  $('tabRelics').style.display = tab === 'relics' ? 'block' : 'none';
  $('tabCodex').style.display = tab === 'codex' ? 'block' : 'none';
  if (tab === 'history') renderHistoryTab();
  if (tab === 'relics') renderRelicsTab();
  if (tab === 'codex') renderCodexTab();
}

/* ---- settings ---- */
export function openSettings(): void {
  var st = S.settings;
  ($('setVol') as HTMLInputElement).value = String(Math.round(st.vol * 10));
  ($('setShake') as HTMLInputElement).checked = st.shake;
  ($('setPart') as HTMLInputElement).value = String(st.particles);
  ($('setScan') as HTMLInputElement).checked = st.scanlines;
  ($('setAuto') as HTMLInputElement).checked = st.autopause;
  ($('setScale') as HTMLInputElement).value = String(st.uiScale);
  ($('setConfirm') as HTMLInputElement).checked = st.confirmRecycle;
  ($('setCB') as HTMLInputElement).checked = st.colorblind;
  ($('setHC') as HTMLInputElement).checked = st.contrast;
  ($('setDmg') as HTMLInputElement).checked = st.dmgNumbers;
  ($('setSort') as HTMLInputElement).checked = st.handSort;
  $('setSeed').textContent = 'CURRENT SEED ' + S.seed + ' · BEST SCORE ' + fmt(S.best);
  openModal('settingsModal');
  Snd.play('ui');
}

export function applySettingsBody(): void {
  var b = document.body;
  b.classList.toggle('cb', S.settings.colorblind);
  b.classList.toggle('hc', S.settings.contrast);
  b.classList.toggle('noline', !S.settings.scanlines);
  b.style.fontSize = (100 * S.settings.uiScale) + '%';
}
