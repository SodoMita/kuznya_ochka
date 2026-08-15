/* The circuit deck — a real Slay-the-Spire style card engine.
   Draw pile → hand → discard pile, with an exhaust pile per sector.
   Boards (tower cards) are consumed on deploy and cycle back through the
   discard; subroutines are one-shot skills; firmware powers always exhaust.
   EXHAUST = out for the rest of the sector · ETHEREAL = exhausts if still
   unplayed when the turn ends · RETAIN = survives the turn redraw · INNATE =
   guaranteed in the sector's opening hand · CONSUME = torn from the deck
   permanently. A "turn" is one full fabrication-window + wave cycle. */
import { S } from './state';
import { DECK_CARDS, CARDS, STARTER_DECK } from './data';
import type { CardInst, DeckCardDef, Card } from './types';
import { canAfford, spend, gainRes, usedGrid, gridCap } from './economy';
import { burst, float } from './fx';
import { Snd } from './audio';
import { killEnemy } from './enemies';

export const HAND_CAP = 10;

let uidC = 1;

const DEFS: Record<string, DeckCardDef> = {};
DECK_CARDS.forEach(function (d) { DEFS[d.id] = d; });

export function defOf(ci: CardInst): DeckCardDef {
  return DEFS[ci.id];
}

export function defById(id: string): DeckCardDef {
  return DEFS[id];
}

function shuffleInPlace<T>(a: T[]): T[] {
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1)), t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/** Build the run's starting 10-card deck. Call once at boot. */
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
  /* innate cards jump to the opening hand */
  for (var i = S.drawPile.length - 1; i >= 0 && S.hand.length < handSize(); i--) {
    if (defOf(S.drawPile[i]).innate) S.hand.push(S.drawPile.splice(i, 1)[0]);
  }
  drawCards(handSize() - S.hand.length);
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

export function canPlayDef(d: DeckCardDef): { ok: boolean; why?: string } {
  if (d.kind === 'curse') return { ok: false, why: 'CURSES CANNOT BE PLAYED — DISCARD OR PURGE IT' };
  if (!canAfford(d.cost)) return { ok: false, why: 'INSUFFICIENT MATTER' };
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
  var chk = canPlayDef(d);
  if (!chk.ok) return { ok: false, msg: chk.why! };
  spend(d.cost);
  var cp = corePt(), i;

  if (d.kind === 'power') {
    S.powers[d.id] = (S.powers[d.id] || 0) + 1;
    if (d.id === 'power_sub') S.gridMax += 4;
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
