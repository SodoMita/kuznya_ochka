/* The circuit deck — a real Slay-the-Spire style card engine.
   Draw pile → hand → discard pile, with an exhaust pile per sector.
   Boards (tower cards) are consumed on deploy and cycle back through the
   discard; subroutines are one-shot skills; firmware powers always exhaust.
   EXHAUST = out for the rest of the sector · ETHEREAL = exhausts if still
   unplayed when the turn ends · RETAIN = survives the turn redraw · INNATE =
   guaranteed in the sector's opening hand · CONSUME = torn from the deck
   permanently. A "turn" is one full fabrication-window + wave cycle. */
import { S } from './state';
import { DECK_CARDS, CARDS, STARTER_DECK, MODULES } from './data';
import type { CardInst, DeckCardDef, Card, ModuleDef, Enemy, Cost, Tower } from './types';
import { canAfford, spend, gainRes, usedGrid, gridCap, boardCostMult, towerMhp } from './economy';
import { burst, float } from './fx';
import { Snd } from './audio';
import { killEnemy } from './enemies';

export const HAND_CAP = 10;

let uidC = 1;

const DEFS: Record<string, DeckCardDef> = {};
DECK_CARDS.forEach(function (d) { DEFS[d.id] = d; });

const MODDEFS: Record<string, ModuleDef> = {};
MODULES.forEach(function (m) { MODDEFS[m.id] = m; });

export function defOf(ci: CardInst): DeckCardDef {
  return DEFS[ci.id];
}

export function defById(id: string): DeckCardDef {
  return DEFS[id];
}

/** The module definition behind a module id (e.g. 'flame'). */
export function modById(id: string): ModuleDef {
  return MODDEFS[id];
}

function shuffleInPlace<T>(a: T[]): T[] {
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1)), t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/** Optional hand auto-sort: boards → skills → powers → modules → curses. */
const KIND_ORDER: Record<string, number> = { board: 0, skill: 1, power: 2, module: 3, curse: 4 };
function sortHand(): void {
  if (!S.settings.handSort) return;
  S.hand.sort(function (a, b) {
    var da = defOf(a), db = defOf(b);
    var k = (KIND_ORDER[da.kind] - KIND_ORDER[db.kind]);
    return k !== 0 ? k : (da.name < db.name ? -1 : da.name > db.name ? 1 : 0);
  });
}

/** Build the run's starting 11-card deck. Call once at boot. */
export function initRunDeck(): void {
  S.deck = STARTER_DECK.map(function (id) { return { uid: uidC++, id: id }; });
}

/** Add a freshly-won copy of a card to the run deck (goes to the discard
    pile so it cycles into play next reshuffle). */
export function addCardToDeck(id: string): CardInst {
  var ci = { uid: uidC++, id: id };
  S.deck.push(ci);
  S.discardPile.push(ci);
  return ci;
}

/** Cards drawn at each turn start (Autoloader firmware adds +1 each). */
export function handSize(): number {
  return Math.min(HAND_CAP, 5 + (S.powers.power_loader || 0));
}

/** Deploying into a sector: every owned card returns to the draw pile,
    firmware resets, and the opening hand is dealt (innate cards first). */
export function sectorShuffle(): void {
  S.powers = {};
  S.hand = [];
  S.discardPile = [];
  S.exhaustPile = [];
  S.drawPile = shuffleInPlace(S.deck.slice());
  S.selCard = null;
  S.overcharge = false;
  S.mulliganUsed = false;
  S.undoStack = [];
  /* innate cards jump to the opening hand */
  for (var i = S.drawPile.length - 1; i >= 0 && S.hand.length < handSize(); i--) {
    if (defOf(S.drawPile[i]).innate) S.hand.push(S.drawPile.splice(i, 1)[0]);
  }
  drawCards(handSize() - S.hand.length);
  sortHand();
}

/** Draw n cards; reshuffles the discard pile when the draw pile runs dry. */
export function drawCards(n: number): number {
  var drawn = 0;
  for (var i = 0; i < n; i++) {
    if (S.hand.length >= HAND_CAP) break;
    if (!S.drawPile.length) {
      if (!S.discardPile.length) break;
      S.drawPile = shuffleInPlace(S.discardPile);
      S.discardPile = [];
    }
    S.hand.push(S.drawPile.pop()!);
    drawn++;
  }
  if (S.settings.handSort) sortHand();
  return drawn;
}

/** Turn start (wave cleared → new fabrication window): ETHEREAL cards
    still in hand exhaust, the rest discard except RETAIN cards, then
    draw back up to hand size. Returns how many ethereal cards burned. */
export function startTurn(): number {
  var eth = 0, cp = corePt();
  for (var i = S.hand.length - 1; i >= 0; i--) {
    var d = defOf(S.hand[i]);
    /* Curses punish only if they survive in hand until the natural redraw.
       Deliberately discarding one with a subroutine avoids its trigger. */
    var scrubbed = d.kind === 'curse' && !!S.powers.power_scrubber;
    if (!scrubbed && d.id === 'curse_rust') {
      S.res.fe = Math.max(0, S.res.fe - 8);
      float(cp.x, cp.y - 18, 'RUST DEBT −8Fe', '#e5484d');
    } else if (!scrubbed && d.id === 'curse_breach') {
      S.core = Math.max(0, S.core - 1);
      float(cp.x, cp.y - 18, 'HULL BREACH −1 CORE', '#e5484d');
    }
    if (scrubbed || d.ethereal) { S.exhaustPile.push(S.hand.splice(i, 1)[0]); if (d.ethereal) eth++; }
    else if (!d.retain) S.discardPile.push(S.hand.splice(i, 1)[0]);
  }
  if (S.powers.power_broker) {
    var stipend = 12 * S.powers.power_broker;
    gainRes({ fe: stipend, cu: 0, si: 0 }, cp.x, cp.y - 8);
  }
  if (S.powers.power_failsafe && S.core < S.coreMax) {
    var repair = 2 * S.powers.power_failsafe;
    S.core = Math.min(S.coreMax, S.core + repair);
    float(cp.x, cp.y - 24, 'FAILSAFE +' + repair + ' CORE', '#3ec9b0');
  }
  drawCards(handSize() - S.hand.length);
  S.selCard = null;
  return eth;
}

/** Move a played card out of the hand into the right pile. */
export function resolveAfterPlay(handIdx: number): void {
  var ci = S.hand.splice(handIdx, 1)[0];
  if (!ci) return;
  var d = defOf(ci);
  if (d.consume) S.deck = S.deck.filter(function (c) { return c !== ci; });
  else if (d.exhaust) S.exhaustPile.push(ci);
  else S.discardPile.push(ci);
  if (S.selCard != null) {
    if (S.selCard === handIdx) S.selCard = null;
    else if (S.selCard > handIdx) S.selCard--;
  }
}

/** The tower blueprint behind the currently selected hand card (or null
    when nothing is selected / the selection is not a board). */
export function selBoard(): Card | null {
  if (S.selCard == null) return null;
  var ci = S.hand[S.selCard];
  if (!ci) return null;
  var d = defOf(ci);
  if (d.kind !== 'board' || d.tower == null) return null;
  return CARDS[d.tower];
}

/** The upgrade module behind the currently selected hand card (or null when
    nothing is selected / the selection is not a module card). */
export function selModule(): ModuleDef | null {
  if (S.selCard == null) return null;
  var ci = S.hand[S.selCard];
  if (!ci) return null;
  var d = defOf(ci);
  if (d.kind !== 'module' || !d.module) return null;
  return modById(d.module);
}

/** Targeted skills resolve on a unit you tap AFTER selecting the card. */
export function isTargetedSkill(d: DeckCardDef): boolean {
  return d.id === 'skill_recal';
}

/** The targeted-skill def behind the selected hand card (or null). */
export function selTargetedSkill(): DeckCardDef | null {
  if (S.selCard == null) return null;
  var ci = S.hand[S.selCard];
  if (!ci) return null;
  var d = defOf(ci);
  return isTargetedSkill(d) ? d : null;
}

/** Effective matter cost of a board (BLUEPRINT EFFICIENCY discount). */
export function effCost(c: Cost): Cost {
  var m = boardCostMult();
  if (m === 1) return c;
  return { fe: Math.ceil(c.fe * m), cu: Math.ceil(c.cu * m), si: Math.ceil(c.si * m) };
}

export function canPlayDef(d: DeckCardDef): { ok: boolean; why?: string } {
  if (d.kind === 'curse') return { ok: false, why: 'CURSES CANNOT BE PLAYED — DISCARD OR PURGE IT' };
  var cost = d.kind === 'board' ? effCost(d.cost) : d.cost;
  if (!canAfford(cost)) return { ok: false, why: 'INSUFFICIENT MATTER' };
  if (d.kind === 'board') {
    var c = CARDS[d.tower!];
    if (usedGrid() + c.draw > gridCap()) return { ok: false, why: 'GRID CAPACITY EXCEEDED' };
  }
  if (d.id === 'skill_weld' && S.core >= S.coreMax) return { ok: false, why: 'CORE AT FULL INTEGRITY' };
  if ((d.id === 'skill_recycle' || d.id === 'skill_clone') && !S.discardPile.length) return { ok: false, why: 'DISCARD PILE EMPTY' };
  if (d.id === 'skill_defrag' && !S.exhaustPile.length) return { ok: false, why: 'EXHAUST PILE EMPTY' };
  if ((d.id === 'skill_purge' || d.id === 'skill_quarantine') &&
      !S.hand.some(function (ci) { return defOf(ci).kind === 'curse'; })) {
    return { ok: false, why: 'NO CURSE IN HAND' };
  }
  if (d.id === 'skill_wreck' && !S.towers.length) return { ok: false, why: 'NO DEPLOYED UNITS' };
  if (d.id === 'skill_patch' && !S.towers.some(function (t) { return t.hp < t.mhp; })) {
    return { ok: false, why: 'UNITS AT FULL INTEGRITY' };
  }
  return { ok: true };
}

function corePt(): { x: number; y: number } {
  var cp = S.nodes[S.coreIdx];
  return cp ? { x: cp.px, y: cp.py } : { x: 0, y: 0 };
}

/** Play a non-board card from the hand (skills fire instantly, firmware
    installs). Boards are handled by battlefield placement instead. */
export function playCard(handIdx: number): { ok: boolean; msg: string } {
  var ci = S.hand[handIdx];
  if (!ci) return { ok: false, msg: 'NO CARD' };
  var d = defOf(ci);
  if (d.kind === 'board') return { ok: false, msg: 'SELECT A FOUNDATION TO DEPLOY' };
  if (d.kind === 'module') return { ok: false, msg: 'SELECT A COMPATIBLE UNIT TO INSTALL' };
  if (isTargetedSkill(d)) return { ok: false, msg: 'SELECT A UNIT TO RECALIBRATE' };
  var chk = canPlayDef(d);
  if (!chk.ok) return { ok: false, msg: chk.why! };
  spend(d.cost);
  var cp = corePt(), i;

  if (d.kind === 'power') {
    S.powers[d.id] = (S.powers[d.id] || 0) + 1;
    if (d.id === 'power_sub') S.gridMax += 4;
    if (d.id === 'power_shield') {
      for (i = 0; i < S.towers.length; i++) {
        var st = S.towers[i];
        st.mhp = towerMhp(st);
        st.hp = Math.min(st.hp + 5, st.mhp);
      }
    }
    S.rings.push({ x: cp.x, y: cp.y, r: 6, max: 52, col: '#ffd23f' });
    float(cp.x, cp.y - 18, d.name + ' INSTALLED', '#ffd23f');
    resolveAfterPlay(handIdx);
    Snd.play('upgrade');
    return { ok: true, msg: d.name + ' — FIRMWARE INSTALLED (EXHAUSTED)' };
  }

  var msg = d.name;
  switch (d.id) {
    case 'skill_scrap':
      gainRes({ fe: 26, cu: 10, si: 4 }, cp.x, cp.y - 10);
      msg += ' — +26Fe +10Cu +4Si';
      break;
    case 'skill_hotswap': {
      var got = drawCards(2);
      msg += ' — DREW ' + got + (got === 1 ? ' CARD' : ' CARDS');
      break;
    }
    case 'skill_weld':
      S.core = Math.min(S.coreMax, S.core + 4);
      float(cp.x, cp.y - 16, '+4 CORE', '#3ec9b0');
      S.rings.push({ x: cp.x, y: cp.y, r: 4, max: 36, col: '#3ec9b0' });
      Snd.play('weld');
      msg += ' — +4 CORE (EXHAUSTED)';
      break;
    case 'skill_overdrive':
      S.ability.surge.until = Math.max(S.ability.surge.until, S.time + 8);
      S.stat.surges++;
      S.shake = Math.max(S.shake, 3);
      S.rings.push({ x: cp.x, y: cp.y, r: 6, max: 60, col: '#ffd23f' });
      Snd.play('surge');
      msg += ' — +50% RATE FOR 8s';
      break;
    case 'skill_emp': {
      var hit = 0;
      for (i = 0; i < S.enemies.length; i++) {
        var e = S.enemies[i];
        if (e.dead) continue;
        e.hp -= e.mhp * .12;
        e.flash = .08;
        hit++;
        if (e.hp <= 0) killEnemy(e, false);
      }
      S.shake = Math.max(S.shake, 4);
      S.rings.push({ x: cp.x, y: cp.y, r: 8, max: 90, col: '#6fd7e8' });
      Snd.play('arc');
      msg += hit ? ' — ZAPPED ' + hit + ' HOSTILES' : ' — NO HOSTILES IN THE FIELD';
      break;
    }
    case 'skill_recall': {
      var pulled = 0;
      for (i = 0; i < S.enemies.length; i++) {
        var en = S.enemies[i];
        if (en.dead) continue;
        en.d = Math.max(-14, en.d - 70);
        pulled++;
      }
      S.rings.push({ x: cp.x, y: cp.y, r: 8, max: 70, col: '#7fa8d9' });
      Snd.play('beam');
      msg += pulled ? ' — DRAGGED ' + pulled + ' HOSTILES BACK' : ' — NOTHING TO RECALL (EXHAUSTED)';
      break;
    }
    case 'skill_refit':
      for (i = 0; i < S.towers.length; i++) {
        var t = S.towers[i];
        t.lvl++;
        burst(t.x, t.y, '#ffd23f', 8);
      }
      Snd.play('upgrade');
      msg += ' — ' + S.towers.length + ' UNITS REFIT +1 LEVEL';
      break;
    case 'skill_graft':
      S.coreMax += 5;
      S.core += 5;
      float(cp.x, cp.y - 16, '+5 MAX CORE', '#3ec9b0');
      Snd.play('weld');
      msg += ' — +5 MAX CORE (CONSUMED FROM DECK)';
      break;
    case 'skill_filter': {
      var filtered = 0;
      for (i = S.hand.length - 1; i >= 0 && filtered < 3; i--) {
        if (S.hand[i] === ci) continue;
        S.discardPile.push(S.hand.splice(i, 1)[0]);
        filtered++;
      }
      var replaced = drawCards(filtered);
      msg += ' — DISCARDED ' + filtered + ' · DREW ' + replaced;
      break;
    }
    case 'skill_smelter': {
      var melted = 0;
      for (i = S.hand.length - 1; i >= 0; i--) {
        if (S.hand[i] === ci) continue;
        S.discardPile.push(S.hand.splice(i, 1)[0]);
        melted++;
      }
      if (melted) gainRes({ fe: melted * 8, cu: 0, si: 0 }, cp.x, cp.y - 10);
      msg += ' — MELTED ' + melted + ' CARD' + (melted === 1 ? '' : 'S') + ' FOR ' + (melted * 8) + 'Fe';
      break;
    }
    case 'skill_recycle': {
      var reclaimed = S.discardPile.pop();
      if (reclaimed) S.hand.push(reclaimed);
      msg += reclaimed ? ' — ' + defOf(reclaimed).name + ' RETURNED TO HAND' : ' — DISCARD PILE EMPTY';
      break;
    }
    case 'skill_coldboot': {
      var recycled = S.discardPile.length;
      S.drawPile = shuffleInPlace(S.drawPile.concat(S.discardPile));
      S.discardPile = [];
      var bootDraw = drawCards(2);
      msg += ' — RECYCLED ' + recycled + ' · DREW ' + bootDraw;
      break;
    }
    case 'skill_purge': {
      var cursed: CardInst[] = [];
      S.hand = S.hand.filter(function (card) {
        if (defOf(card).kind === 'curse') { cursed.push(card); return false; }
        return true;
      });
      var curseUids: Record<number, boolean> = {};
      cursed.forEach(function (card) { curseUids[card.uid] = true; });
      S.deck = S.deck.filter(function (card) { return !curseUids[card.uid]; });
      var purgeDraw = drawCards(cursed.length);
      msg += ' — PURGED ' + cursed.length + ' CURSE' + (cursed.length === 1 ? '' : 'S') + ' · DREW ' + purgeDraw;
      break;
    }
    case 'skill_corrupt': {
      gainRes({ fe: 70, cu: 28, si: 12 }, cp.x, cp.y - 10);
      var curses = ['curse_jam', 'curse_rust', 'curse_breach'];
      var curse = addCardToDeck(curses[Math.floor(Math.random() * curses.length)]);
      msg += ' — CACHE OPENED · ' + defOf(curse).name + ' ADDED TO DECK';
      break;
    }
    case 'skill_capacitor':
      S.gridMax += 3;
      S.rings.push({ x: cp.x, y: cp.y, r: 5, max: 44, col: '#6fd7e8' });
      msg += ' — +3 GRID THIS SECTOR';
      break;
    case 'skill_barrage': {
      var shredded = 0;
      for (i = 0; i < S.enemies.length; i++) {
        var target = S.enemies[i];
        if (target.dead) continue;
        target.hp -= 35;
        target.flash = .08;
        shredded++;
        if (target.hp <= 0) killEnemy(target, false);
      }
      S.shake = Math.max(S.shake, 5);
      S.rings.push({ x: cp.x, y: cp.y, r: 8, max: 82, col: '#e0854e' });
      msg += ' — HIT ' + shredded + ' HOSTILES';
      break;
    }
    case 'skill_mulligan': {
      var sorted = 0;
      for (i = S.hand.length - 1; i >= 0; i--) {
        if (S.hand[i] === ci) continue;
        S.discardPile.push(S.hand.splice(i, 1)[0]);
        sorted++;
      }
      var sortDraw = drawCards(Math.min(5, sorted));
      msg += ' — DISCARDED ' + sorted + ' · DREW ' + sortDraw;
      break;
    }
    case 'skill_defrag': {
      var restored = S.exhaustPile.pop();
      if (restored) S.hand.push(restored);
      msg += restored ? ' — RESTORED ' + defOf(restored).name : ' — EXHAUST PILE EMPTY';
      break;
    }
    case 'skill_clone': {
      var source = S.discardPile[S.discardPile.length - 1];
      if (source) {
        var clone = addCardToDeck(source.id);
        S.discardPile.pop();
        S.hand.push(clone);
        msg += ' — PERMANENT ' + defOf(clone).name + ' COPY FABRICATED';
      }
      break;
    }
    case 'skill_triage': {
      var beforeCore = S.core;
      S.core = Math.min(S.coreMax, S.core + 2);
      var triageDraw = drawCards(1);
      float(cp.x, cp.y - 16, '+' + (S.core - beforeCore) + ' CORE', '#3ec9b0');
      msg += ' — +' + (S.core - beforeCore) + ' CORE · DREW ' + triageDraw;
      break;
    }
    case 'skill_delete': {
      var strongest = null as typeof S.enemies[number] | null;
      for (i = 0; i < S.enemies.length; i++) {
        if (!S.enemies[i].dead && (!strongest || S.enemies[i].hp > strongest.hp)) strongest = S.enemies[i];
      }
      if (strongest) {
        strongest.hp -= 120;
        strongest.flash = .12;
        if (strongest.hp <= 0) killEnemy(strongest, false);
      }
      S.shake = Math.max(S.shake, 4);
      msg += strongest ? ' — STRONGEST HOSTILE HIT FOR 120' : ' — NO HOSTILE TARGET';
      break;
    }
    case 'skill_quarantine': {
      var isolated = 0;
      for (i = S.hand.length - 1; i >= 0; i--) {
        if (defOf(S.hand[i]).kind !== 'curse') continue;
        S.exhaustPile.push(S.hand.splice(i, 1)[0]);
        isolated++;
      }
      if (isolated) gainRes({ fe: isolated * 12, cu: 0, si: 0 }, cp.x, cp.y - 10);
      msg += ' — QUARANTINED ' + isolated + ' · +' + (isolated * 12) + 'Fe';
      break;
    }
    case 'skill_siphon': {
      var living = S.enemies.filter(function (enemy) { return !enemy.dead; }).length;
      var siphoned = Math.min(45, living * 3);
      if (siphoned) gainRes({ fe: siphoned, cu: 0, si: 0 }, cp.x, cp.y - 10);
      msg += ' — DRAINED ' + living + ' HOSTILES · +' + siphoned + 'Fe';
      break;
    }
    case 'skill_gridloan':
      S.gridMax += 7;
      addCardToDeck('curse_rust');
      msg += ' — +7 GRID · RUST DEBT ADDED TO DECK';
      break;
    case 'skill_artillery': {
      var targets: Enemy[] = [];
      for (i = 0; i < S.enemies.length; i++) {
        if (!S.enemies[i].dead) targets.push(S.enemies[i]);
      }
      var hits = 0;
      for (i = 0; i < 3 && targets.length; i++) {
        var pick = targets.splice(Math.floor(Math.random() * targets.length), 1)[0];
        pick.hp -= 45;
        pick.flash = .08;
        S.shots.push({ x: cp.x, y: cp.y - 30, tx: pick.x, ty: pick.y, life: .18, col: '#c9a6e0', kind: 3 });
        hits++;
        if (pick.hp <= 0) killEnemy(pick, false);
      }
      S.shake = Math.max(S.shake, 4);
      Snd.play('boom', true);
      msg += hits ? ' — ' + hits + ' SHELL' + (hits > 1 ? 'S' : '') + ' ON TARGET' : ' — NO HOSTILES TO STRIKE (EXHAUSTED)';
      break;
    }
    case 'skill_deepfreeze':
      for (i = 0; i < S.enemies.length; i++) {
        var fe = S.enemies[i];
        if (!fe.dead) fe.slowT = Math.max(fe.slowT, 6);
      }
      S.rings.push({ x: cp.x, y: cp.y, r: 8, max: 80, col: '#8fd8ff' });
      Snd.play('weld');
      msg += ' — ALL HOSTILES SLOWED 60% FOR 6s';
      break;
    case 'skill_gravity': {
      var gripped = 0;
      for (i = 0; i < S.enemies.length; i++) {
        var gv = S.enemies[i];
        if (gv.dead) continue;
        gv.d = Math.max(-14, gv.d - 70);
        gv.gravT = 3;
        gripped++;
      }
      S.rings.push({ x: cp.x, y: cp.y, r: 8, max: 88, col: '#b18cd9' });
      Snd.play('beam');
      msg += gripped ? ' — ' + gripped + ' HOSTILES DRAGGED & SLOWED 3s' : ' — NOTHING IN THE FIELD (EXHAUSTED)';
      break;
    }
    case 'skill_nano': {
      var corroded = 0;
      for (i = 0; i < S.enemies.length; i++) {
        var no = S.enemies[i];
        if (no.dead) continue;
        no.burn = Math.max(no.burn, 7.5);
        no.burnT = Math.max(no.burnT, 4);
        corroded++;
      }
      S.rings.push({ x: cp.x, y: cp.y, r: 8, max: 70, col: '#7ac98a' });
      Snd.play('beam');
      msg += corroded ? ' — NANO SWARM DEVOURING ' + corroded + ' HOSTILES' : ' — NOTHING TO CORRODE (EXHAUSTED)';
      break;
    }
    case 'skill_breaker': {
      var stunned = 0;
      for (i = 0; i < S.enemies.length; i++) {
        var br = S.enemies[i];
        if (br.dead) continue;
        br.stun = 2;
        br.flash = .12;
        stunned++;
      }
      S.rings.push({ x: cp.x, y: cp.y, r: 8, max: 76, col: '#ffd23f' });
      Snd.play('arc');
      msg += stunned ? ' — ' + stunned + ' HOSTILES STUNNED 2s' : ' — NOTHING TO STUN (EXHAUSTED)';
      break;
    }
    case 'skill_ore':
      gainRes({ fe: 40, cu: 20, si: 0 }, cp.x, cp.y - 10);
      msg += ' — +40Fe +20Cu';
      break;
    case 'skill_patch': {
      var patched = 0;
      for (i = 0; i < S.towers.length; i++) {
        var pt = S.towers[i];
        if (pt.hp < pt.mhp) {
          pt.hp = pt.mhp;
          patched++;
          burst(pt.x, pt.y, '#3ec9b0', 5);
        }
      }
      Snd.play('weld');
      msg += ' — ' + patched + ' UNIT' + (patched === 1 ? '' : 'S') + ' RESTORED TO FULL INTEGRITY';
      break;
    }
    case 'skill_bond': {
      var pay = 6 * S.wave;
      gainRes({ fe: pay, cu: 0, si: 0 }, cp.x, cp.y - 10);
      msg += ' — BOND PAID +' + pay + 'Fe';
      break;
    }
    case 'skill_wreck': {
      var weak = S.towers[0];
      for (i = 1; i < S.towers.length; i++) {
        var wc = S.towers[i];
        if (wc.lvl < weak.lvl || (wc.lvl === weak.lvl && wc.hp < weak.hp)) weak = wc;
      }
      var refund: Cost = { fe: weak.inv.fe, cu: weak.inv.cu, si: weak.inv.si };
      S.towers = S.towers.filter(function (x) { return x !== weak; });
      S.beams = S.beams.filter(function (b) { return b.tw !== weak; });
      if (S.selTower === weak) S.selTower = null;
      gainRes(refund, weak.x, weak.y);
      burst(weak.x, weak.y, '#8fa0a6', 12);
      Snd.play('boom', true);
      msg += ' — ' + CARDS[weak.i].name + ' SCRAPPED · FULL REFUND';
      break;
    }
    case 'skill_assembly': {
      var boards: CardInst[] = [];
      for (i = S.drawPile.length - 1; i >= 0 && boards.length < 2; i--) {
        if (defOf(S.drawPile[i]).kind === 'board') {
          boards.push(S.drawPile.splice(i, 1)[0]);
        }
      }
      boards.forEach(function (b) { if (S.hand.length < HAND_CAP) S.hand.push(b); else S.discardPile.push(b); });
      Snd.play('draft');
      msg += ' — ' + boards.length + ' BOARD' + (boards.length === 1 ? '' : 'S') + ' FABRICATED TO HAND';
      break;
    }
    case 'skill_overcharge':
      S.overcharge = true;
      S.rings.push({ x: cp.x, y: cp.y, r: 5, max: 40, col: '#ffd23f' });
      Snd.play('upgrade');
      msg += ' — NEXT BOARD PRINTS AT LEVEL 2';
      break;
    default:
      break;
  }
  /* Hand-control cards may have shifted their own index. Resolve the physical
     card instance, never whichever card happens to occupy the old slot. */
  var playedIdx = S.hand.indexOf(ci);
  if (playedIdx >= 0) resolveAfterPlay(playedIdx);
  if (d.id !== 'skill_weld' && d.id !== 'skill_graft') Snd.play('ui');
  return { ok: true, msg: msg };
}

/** Firmware multipliers consulted by the sim. */
export function powerDmgMult(): number {
  var mult = 1 + .1 * (S.powers.power_lathe || 0);
  if (S.core < S.coreMax * .5) mult += .15 * (S.powers.power_armature || 0);
  return mult;
}

export function powerFoundryMult(): number {
  return 1 + .25 * (S.powers.power_reserve || 0);
}

export function powerRangeMult(): number {
  return 1 + .15 * (S.powers.power_scope || 0);
}

export function powerRateMult(): number {
  return 1 + .12 * (S.powers.power_feedback || 0);
}

/** Toss the selected hand card into the discard pile (ETHEREAL cards burn
    into the exhaust pile instead). Returns a toast message, or '' if nothing
    was selected. */
export function discardSelCard(): string {
  if (S.selCard == null) return '';
  var ci = S.hand[S.selCard];
  if (!ci) { S.selCard = null; return ''; }
  var d = defOf(ci);
  S.hand.splice(S.selCard, 1);
  if (d.ethereal) S.exhaustPile.push(ci);
  else S.discardPile.push(ci);
  S.selCard = null;
  return d.name + (d.ethereal ? ' — BURNED (ETHEREAL)' : ' → DISCARD PILE');
}

/** Tear the selected hand card out of the deck permanently for a 50% matter
    refund. Returns a toast message, or '' if nothing was selected. */
export function recycleSelCard(): string {
  if (S.selCard == null) return '';
  var ci = S.hand[S.selCard];
  if (!ci) { S.selCard = null; return ''; }
  var d = defOf(ci);
  S.hand.splice(S.selCard, 1);
  S.deck = S.deck.filter(function (c) { return c !== ci; });
  var cp = corePt();
  var refund: Cost = {
    fe: Math.ceil(d.cost.fe * .5),
    cu: Math.ceil(d.cost.cu * .5),
    si: Math.ceil(d.cost.si * .5)
  };
  var bits: string[] = [];
  if (refund.fe) bits.push('+' + refund.fe + 'Fe');
  if (refund.cu) bits.push('+' + refund.cu + 'Cu');
  if (refund.si) bits.push('+' + refund.si + 'Si');
  if (bits.length) gainRes(refund, cp.x, cp.y - 12);
  S.selCard = null;
  return d.name + ' TORN FROM DECK' + (bits.length ? ' · ' + bits.join(' ') : '');
}

/** Apply the selected RECALIBRATE card to a unit (+1 level, free, exhausts). */
export function castRecalibrate(t: Tower): string {
  if (S.selCard == null) return 'SELECT RECALIBRATE FIRST';
  var d = defOf(S.hand[S.selCard]);
  if (!isTargetedSkill(d)) return 'SELECT RECALIBRATE FIRST';
  if (!canAfford(d.cost)) return 'INSUFFICIENT MATTER';
  spend(d.cost);
  t.lvl++;
  resolveAfterPlay(S.selCard);
  burst(t.x, t.y, '#ffd23f', 8);
  Snd.play('upgrade');
  return d.name + ' — ' + CARDS[t.i].name + ' +1 LEVEL';
}

/** One free mulligan per sector: redraw the whole hand once. */
export function freeMulligan(): string {
  if (S.mulliganUsed) return 'MULLIGAN ALREADY USED THIS SECTOR';
  if (S.phase !== 'build') return 'MULLIGAN ONLY IN THE FABRICATION WINDOW';
  S.mulliganUsed = true;
  var tossed = 0;
  for (var i = S.hand.length - 1; i >= 0; i--) {
    var d = defOf(S.hand[i]);
    if (d.ethereal) S.exhaustPile.push(S.hand.splice(i, 1)[0]);
    else S.discardPile.push(S.hand.splice(i, 1)[0]);
    tossed++;
  }
  var got = drawCards(handSize());
  S.selCard = null;
  Snd.play('draft');
  return 'MULLIGAN — TOSSED ' + tossed + ' · DREW ' + got;
}
