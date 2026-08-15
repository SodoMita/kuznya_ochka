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
import type { CardInst, DeckCardDef, Card, ModuleDef, Enemy } from './types';
import { canAfford, spend, gainRes, usedGrid, gridCap } from './economy';
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
  var eth = 0;
  for (var i = S.hand.length - 1; i >= 0; i--) {
    var d = defOf(S.hand[i]);
    if (d.ethereal) { S.exhaustPile.push(S.hand.splice(i, 1)[0]); eth++; }
    else if (!d.retain) S.discardPile.push(S.hand.splice(i, 1)[0]);
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

export function canPlayDef(d: DeckCardDef): { ok: boolean; why?: string } {
  if (!canAfford(d.cost)) return { ok: false, why: 'INSUFFICIENT MATTER' };
  if (d.kind === 'board') {
    var c = CARDS[d.tower!];
    if (usedGrid() + c.draw > gridCap()) return { ok: false, why: 'GRID CAPACITY EXCEEDED' };
  }
  if (d.id === 'skill_weld' && S.core >= S.coreMax) return { ok: false, why: 'CORE AT FULL INTEGRITY' };
  if (d.id === 'skill_recal' && (!S.selTower || S.towers.indexOf(S.selTower) < 0)) {
    return { ok: false, why: 'SELECT A UNIT TO RECALIBRATE' };
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
    case 'skill_barrage': {
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
    case 'skill_recal':
      var rt = S.selTower!;
      rt.lvl++;
      burst(rt.x, rt.y, '#ffd23f', 8);
      Snd.play('upgrade');
      msg += ' — ' + CARDS[rt.i].name + ' +1 LEVEL';
      break;
    default:
      break;
  }
  resolveAfterPlay(handIdx);
  if (d.id !== 'skill_weld' && d.id !== 'skill_graft') Snd.play('ui');
  return { ok: true, msg: msg };
}

/** Firmware multipliers consulted by the sim. */
export function powerDmgMult(): number {
  return 1 + .1 * (S.powers.power_lathe || 0);
}

export function powerFoundryMult(): number {
  return 1 + .25 * (S.powers.power_reserve || 0);
}
