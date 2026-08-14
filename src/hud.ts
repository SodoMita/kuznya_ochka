/* DOM HUD: resource chips, phase bar, blueprint cards, unit panel, toasts. */
import { S } from './state';
import { $, fmt, pad2 } from './utils';
import { CARDS, GLYPHS, TGT_LABEL, HAZNAMES, MEDALS } from './data';
import { costStr, sector, canAfford, usedGrid, upCost, gridCap } from './economy';
import { stats, foundryOut, nextWaveStr } from './towers';
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
  if (S.selCard != null && !canAfford(CARDS[S.selCard].cost)) renderCards();
}

export function renderCards(): void {
  var h = '';
  for (var i = 0; i < CARDS.length; i++) {
    var c = CARDS[i];
    h += '<div class="card' + (i === S.selCard ? ' sel' : '') + (canAfford(c.cost) ? '' : ' broke') + '" data-card="' + i + '" style="color:' + c.col + '">' +
      '<div class="hd">' + GLYPHS[c.id] + '<strong style="color:var(--ink)">' + c.name + '</strong><span class="key">' + (i + 1) + '</span></div>' +
      '<p>' + c.desc + '</p><div class="cst">' + costStr(c.cost) + '</div>' +
      (S.ranks[c.id] ? '<span class="rank">Mk.' + (S.ranks[c.id] + 1) + '</span>' : '') + '</div>';
  }
  $('cards').innerHTML = h;
  var nodes = $('cards').children;
  for (i = 0; i < nodes.length; i++) {
    (function (n: HTMLElement) {
      n.addEventListener('pointerdown', function (ev) {
        ev.stopPropagation();
        S.selCard = +n.dataset.card!;
        S.selTower = null;
        Snd.init();
        Snd.play('ui');
        hud(true);
      });
    })(nodes[i] as HTMLElement);
  }
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
