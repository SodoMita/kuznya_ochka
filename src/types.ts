/* Shared data structures for FORGE//ZERO — no logic here, only shapes. */

export interface Cost {
  fe: number;
  cu: number;
  si: number;
}

export interface Card {
  id: string;
  name: string;
  desc: string;
  cost: Cost;
  dmg: number;
  rate: number;
  range: number;
  draw: number;
  col: string;
}

export type DeckCardKind = 'board' | 'skill' | 'power' | 'curse';

/** A Slay-the-Spire style card definition. Boards deploy towers, skills fire
    one-shot effects, powers install sector-wide modifiers, curses are dead draws. */
export interface DeckCardDef {
  id: string;
  name: string;
  kind: DeckCardKind;
  desc: string;
  cost: Cost;           // matter cost to play (boards: the build cost)
  rar: number;          // 0 common · 1 uncommon · 2 rare
  tower?: number;       // boards only: index into CARDS
  exhaust?: boolean;    // removed for the rest of the sector after play
  ethereal?: boolean;   // exhausts if still in hand when the turn ends
  innate?: boolean;     // guaranteed in the opening hand
  retain?: boolean;     // not discarded when the turn ends
  consume?: boolean;    // removed from the deck permanently after play
}

/** A physical copy of a card in one of the piles. */
export interface CardInst {
  uid: number;
  id: string;
}

export interface Relic {
  id: string;
  name: string;
  desc: string;
  rar: number;
}

export interface EnemyTypeDef {
  hp: number;
  sp: number;
  dmg: number;
  armor: number;
  reward: number;
  size: number;
  col: string;
  regen?: number;
}

export interface SectorMix {
  fe: number;
  cu: number;
  si: number;
}

export interface SectorDef {
  name: string;
  mix: SectorMix;
  tint: string;
  grid: string;
  path: string;
  haz: number;
  gild?: number;        // gilded-enemy weight bonus
}

export interface Tower {
  x: number;
  y: number;
  i: number;            // index into CARDS
  lvl: number;
  cool: number;
  ang: number;
  flash: number;
  tgt: string;          // targeting doctrine id (TGTS)
  inv: Cost;            // total invested matter (for recycling)
  selF?: number;        // selection flash decay
  _st?: TowerStats;     // per-tick cached stats (set by sim)
}

export interface TowerStats {
  dmg: number;
  rate: number;
  range: number;
  stars: number;        // calibration stars (every 5 levels)
}

export interface Enemy {
  type: string;
  d: number;            // distance travelled along the path (px)
  hp: number;
  mhp: number;
  sp: number;
  armor: number;
  reward: number;
  size: number;
  col: string;
  regen: number;
  slow: number;
  flash: number;
  beamT: number;
  x: number;
  y: number;
  ang: number;
  dead: boolean;
  bm?: number;          // 1 while being capture-beamed
  vet?: boolean;        // veteran elite: +60% hull, +70% bounty, gold frame
  ph?: number;          // phase-shifter blink timer
  route: number[];      // node-id sequence from a spawn gate to the core
  routePx: PathPoint[]; // pixel polyline of that route (rebuilt on resize)
  routeLen: number;     // total pixel length of routePx
}

export interface Shot {
  x: number;
  y: number;
  tx: number;
  ty: number;
  life: number;
  col: string;
  kind: number;         // 0 = tracer, 1 = chain arc
}

export interface Beam {
  tw: Tower;
  en: Enemy;
  t: number;            // 0..1 capture progress
}

export interface Part {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  col: string;
  grav: number;
}

export interface FloatTxt {
  x: number;
  y: number;
  txt: string;
  col: string;
  t: number;
}

export interface Ring {
  x: number;
  y: number;
  r: number;
  max: number;
  col: string;
}

export interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  a: number;
}

export interface Spot {
  x: number;
  y: number;
  px: number;           // pixel coords, set by buildPathPx()
  py: number;
}

export interface PathPoint {
  x: number;
  y: number;
  s: number;            // cumulative arc length at this point
}

export type RouteKind = 'spawn' | 'core' | 'junc';

/** A node in the sector route network (unit space + cached pixel coords). */
export interface RouteNode {
  x: number;            // 0..1 unit coords
  y: number;
  px: number;           // pixel coords, set by buildGraphPx()
  py: number;
  kind: RouteKind;
}

export interface WorldNode {
  idx: number;
  layer: number;
  x: number;            // 0..1 layout coords
  y: number;
}

export interface DraftOffer {
  kind: 'rank' | 'relic' | 'card';
  id: string;
  rar: number;
}

export interface WeatherEvent {
  id: string;
  name: string;
}

export interface AbilityState {
  surge: { cd: number; until: number };
  weld: { cd: number };
}

export interface StreakState {
  n: number;            // current kill-streak count
  t: number;            // timestamp of last kill
}

export interface SkyBuilding {
  x: number;            // 0..1 horizontal position
  w: number;            // width (unit)
  h: number;            // height (unit)
  ant: boolean;         // has a blinking antenna light
}

export interface Ember {
  x: number;
  y: number;
  vy: number;
  ph: number;
}

export interface GhostState {
  x: number;
  y: number;
  sx: number | null;    // snapped foundation, if any
  sy: number | null;
}
