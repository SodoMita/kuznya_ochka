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

export type DeckCardKind = 'board' | 'skill' | 'power' | 'curse' | 'module';

/** A Slay-the-Spire style card definition. Boards deploy towers, skills fire
    one-shot effects, powers install sector-wide modifiers, curses are dead
    draws, modules bolt an upgrade onto a deployed unit. */
export interface DeckCardDef {
  id: string;
  name: string;
  kind: DeckCardKind;
  desc: string;
  cost: Cost;           // matter cost to play (boards: the build cost)
  rar: number;          // 0 common · 1 uncommon · 2 rare
  tower?: number;       // boards only: index into CARDS
  module?: string;      // modules only: id into MODULES
  exhaust?: boolean;    // removed for the rest of the sector after play
  ethereal?: boolean;   // exhausts if still in hand when the turn ends
  innate?: boolean;     // guaranteed in the opening hand
  retain?: boolean;     // not discarded when the turn ends
  consume?: boolean;    // removed from the deck permanently after play
}

/** A per-unit upgrade module — bolted onto one deployed tower by a MODULE card.
    `forIds` lists which tower blueprints accept it (one module of a kind per unit). */
export interface ModuleDef {
  id: string;
  name: string;
  forIds: string[];     // compatible tower ids (CARDS[].id)
  desc: string;         // effect summary shown on the card / panel
  cost: Cost;           // matter cost to bolt on
  rar: number;          // 0 common · 1 uncommon · 2 rare
  col: string;          // accent color
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
  explode?: number;     // shrieker: tower-damage burst radius in px
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
  reaver?: number;      // reaver-enemy weight bonus
}

export interface Tower {
  x: number;
  y: number;
  i: number;            // index into CARDS
  lvl: number;
  cool: number;
  ang: number;
  flash: number;
  slow: number;         // active deepfreeze slow (0..0.6)
  tgt: string;          // targeting doctrine id (TGTS)
  inv: Cost;            // total invested matter (for recycling)
  mods: string[];       // installed module ids (one of each kind per unit)
  selF?: number;        // selection flash decay
  _st?: TowerStats;     // per-tick cached stats (set by sim)
  /* integrity system */
  hp: number;           // current tower integrity
  mhp: number;          // max integrity (20 + 10/level)
  /* veterancy + combat ledger */
  kills: number;        // hostiles destroyed
  caps: number;         // hostiles captured
  dealt: number;        // total damage dealt
  dropT: number;        // placement drop-in animation timer (seconds)
  jam: number;          // 1 while jammed by an enemy jammer aura
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
  slowT: number;        // seconds of deepfreeze slow remaining
  frozen: boolean;      // HARD FROST weather: extra +10% slow
  flash: number;
  burn: number;         // active burn DoT (dps from flamethrower modules)
  burnT: number;        // seconds of burn remaining
  beamT: number;
  stun: number;         // seconds of circuit-breaker stun remaining
  gravT: number;        // seconds of gravity-well 40% slow remaining
  x: number;
  y: number;
  ang: number;
  dead: boolean;
  bm?: number;          // 1 while being capture-beamed
  vet?: boolean;        // veteran elite: +60% hull, +70% bounty, gold frame
  perk?: string;        // veteran perk: 'fast' | 'tough' | 'regen'
  ph?: number;          // phase-shifter blink timer
  bossT?: number;       // overlord: seconds until the next scrap spawn
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
  kind: number;         // 0 = tracer, 1 = chain arc, 2 = rail, 3 = lobbed shell, 4 = meteor
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

/** Player-tunable settings, persisted between sessions. */
export interface Settings {
  vol: number;            // master volume 0..1
  shake: boolean;         // screen shake on/off
  particles: number;      // 0 low · 1 normal · 2 high
  scanlines: boolean;     // CRT scanline overlay
  autopause: boolean;     // pause when the tab loses focus
  uiScale: number;        // 1 · 1.15 · 1.3
  confirmRecycle: boolean;// confirm before permanently recycling
  colorblind: boolean;    // colorblind-friendly palette + shapes
  contrast: boolean;      // high-contrast theme
  dmgNumbers: boolean;    // floating damage numbers
  handSort: boolean;      // auto-sort hand (boards first)
}

/** A per-sector bonus objective with a one-time reward. */
export interface SectorObjective {
  id: string;
  name: string;
  desc: string;
  done: boolean;
  track: number;          // generic progress counter
}

/** One recorded run for the history ledger. */
export interface RunRecord {
  seed: number;
  win: boolean;
  sector: number;
  wave: number;
  score: number;
  kills: number;
  captures: number;
  date: string;
}

/** A pending confirm dialog. */
export interface Confirm {
  title: string;
  msg: string;
  okLabel: string;
  danger: boolean;
  onOk: () => void;
}

/** A queued toast message. */
export interface ToastItem {
  msg: string;
  kind: string;           // '' | 'warn' | 'good' | 'medal'
}
