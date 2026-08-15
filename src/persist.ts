/* Run persistence: auto-save/resume, settings, run history, best score.
   Everything is scoped to localStorage (or an in-memory fallback) — the game
   still ships as one self-contained HTML file with no network of any kind. */
import { S } from './state';
import { storeGet, storeSet } from './utils';
import { towerMhp } from './economy';
import { W, H } from './view';
import type { Enemy, Tower, Settings } from './types';

const SAVE_KEY = 'fz_save_v2';
const SET_KEY = 'fz_set_v2';
const HIST_KEY = 'fz_hist_v2';
const BEST_KEY = 'fz_best_v2';

/* ---- settings ---- */
export function loadSettings(): Settings | null {
  var raw = storeGet(SET_KEY);
  if (!raw) return null;
  try {
    var st = JSON.parse(raw);
    if (st && typeof st === 'object' && typeof st.vol === 'number') return st as Settings;
  } catch (e) { /* corrupted — fall back to defaults */ }
  return null;
}

export function saveSettings(): void {
  try { storeSet(SET_KEY, JSON.stringify(S.settings)); } catch (e) { /* ignore */ }
}

/* ---- run save/resume ---- */
interface SaveShape {
  v: number;
  seed: number;
  sector: number;
  wave: number;
  phase: string;
  buildT: number;
  buildMax: number;
  core: number;
  coreMax: number;
  gridMax: number;
  res: { fe: number; cu: number; si: number };
  time: number;
  speed: number;
  mode: string;
  savedW: number;
  towers: { x: number; y: number; i: number; lvl: number; tgt: string; inv: { fe: number; cu: number; si: number }; mods: string[]; hp: number; kills: number; caps: number; dealt: number }[];
  enemies: { type: string; d: number; hp: number; mhp: number; sp: number; armor: number; reward: number; size: number; col: string; regen: number; slowT: number; vet?: boolean; perk?: string; burn: number; burnT: number; stun: number; gravT: number; route: number[] }[];
  deck: { uid: number; id: string }[];
  drawPile: { uid: number; id: string }[];
  hand: { uid: number; id: string }[];
  discardPile: { uid: number; id: string }[];
  exhaustPile: { uid: number; id: string }[];
  ranks: Record<string, number>;
  relics: Record<string, boolean>;
  medals: Record<string, boolean>;
  stat: typeof S.stat;
  streak: { n: number; t: number };
  cleared: Record<number, boolean>;
  ability: { surge: { cd: number; until: number }; weld: { cd: number } };
  score: number;
  historySaved: boolean;
  mulliganUsed: boolean;
  overcharge: boolean;
  objective: { id: string; name: string; desc: string; done: boolean; track: number } | null;
  spawnIdx: number;
  waveCount: number;
}

export function saveRun(): void {
  if (S.over && !S.endWin) return;
  var towers = S.towers.map(function (t: Tower) {
    return {
      /* unit coords so saves survive viewport changes */
      x: t.x / Math.max(1, W), y: t.y / Math.max(1, H), i: t.i, lvl: t.lvl, tgt: t.tgt,
      inv: { fe: t.inv.fe, cu: t.inv.cu, si: t.inv.si },
      mods: t.mods.slice(), hp: t.hp, kills: t.kills, caps: t.caps, dealt: t.dealt
    };
  });
  var enemies = S.enemies.map(function (e: Enemy) {
    return {
      type: e.type, d: e.d, hp: e.hp, mhp: e.mhp, sp: e.sp, armor: e.armor,
      reward: e.reward, size: e.size, col: e.col, regen: e.regen, slowT: e.slowT,
      vet: e.vet, perk: e.perk, burn: e.burn, burnT: e.burnT, stun: e.stun, gravT: e.gravT,
      route: e.route.slice()
    };
  });
  var shape: SaveShape = {
    v: 2,
    seed: S.seed,
    sector: S.sector,
    wave: S.wave,
    phase: S.phase,
    buildT: S.buildT,
    buildMax: S.buildMax,
    core: S.core,
    coreMax: S.coreMax,
    gridMax: S.gridMax,
    res: { fe: S.res.fe, cu: S.res.cu, si: S.res.si },
    time: S.time,
    speed: S.speed,
    mode: S.mode,
    savedW: 0,
    towers: towers,
    enemies: enemies,
    deck: S.deck.map(function (c) { return { uid: c.uid, id: c.id }; }),
    drawPile: S.drawPile.map(function (c) { return { uid: c.uid, id: c.id }; }),
    hand: S.hand.map(function (c) { return { uid: c.uid, id: c.id }; }),
    discardPile: S.discardPile.map(function (c) { return { uid: c.uid, id: c.id }; }),
    exhaustPile: S.exhaustPile.map(function (c) { return { uid: c.uid, id: c.id }; }),
    ranks: S.ranks,
    relics: S.relics,
    medals: S.medals,
    stat: S.stat,
    streak: { n: S.streak.n, t: S.streak.t },
    cleared: S.cleared,
    ability: S.ability,
    score: S.score,
    historySaved: S.historySaved,
    mulliganUsed: S.mulliganUsed,
    overcharge: S.overcharge,
    objective: S.objective ? { id: S.objective.id, name: S.objective.name, desc: S.objective.desc, done: S.objective.done, track: S.objective.track } : null,
    spawnIdx: S.spawnIdx,
    waveCount: 0
  };
  shape.waveCount = S.stat.waves;
  shape.savedW = 1; /* marker for readability */
  try { storeSet(SAVE_KEY, JSON.stringify(shape)); } catch (e) { /* ignore */ }
}

export function hasSave(): boolean {
  return !!storeGet(SAVE_KEY);
}

export function clearSave(): void {
  try { window.localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}

/** Restore a saved run into S. Returns true when a save existed. */
export function loadRun(): boolean {
  var raw = storeGet(SAVE_KEY);
  if (!raw) return false;
  try {
    var sh = JSON.parse(raw) as SaveShape;
    if (!sh || sh.v !== 2 || typeof sh.seed !== 'number') return false;
    S.seed = sh.seed >>> 0;
    S.sector = sh.sector;
    S.wave = sh.wave;
    S.phase = sh.phase === 'wave' ? 'wave' : 'build';
    S.buildT = sh.buildT;
    S.buildMax = sh.buildMax;
    S.core = sh.core;
    S.coreMax = sh.coreMax;
    S.gridMax = sh.gridMax;
    S.res = { fe: sh.res.fe, cu: sh.res.cu, si: sh.res.si };
    S.time = sh.time || 0;
    S.speed = sh.speed || 1;
    S.mode = sh.mode === 'capture' ? 'capture' : 'loot';
    S.deck = sh.deck.map(function (c) { return { uid: c.uid, id: c.id }; });
    S.drawPile = sh.drawPile.map(function (c) { return { uid: c.uid, id: c.id }; });
    S.hand = sh.hand.map(function (c) { return { uid: c.uid, id: c.id }; });
    S.discardPile = sh.discardPile.map(function (c) { return { uid: c.uid, id: c.id }; });
    S.exhaustPile = sh.exhaustPile.map(function (c) { return { uid: c.uid, id: c.id }; });
    S.ranks = sh.ranks || {};
    S.relics = sh.relics || {};
    S.medals = sh.medals || {};
    S.stat = sh.stat || S.stat;
    S.streak = sh.streak || { n: 0, t: 0 };
    S.cleared = sh.cleared || {};
    S.ability = sh.ability || { surge: { cd: 0, until: 0 }, weld: { cd: 0 } };
    S.score = sh.score || 0;
    S.historySaved = !!sh.historySaved;
    S.mulliganUsed = !!sh.mulliganUsed;
    S.overcharge = !!sh.overcharge;
    S.objective = sh.objective || null;
    S.spawnIdx = sh.spawnIdx || 0;
    S.enemies = [];          /* saved hostiles flow back via pendingEnemies */
    /* towers — stored as unit coords, re-projected to the current viewport */
    S.towers = sh.towers.map(function (t) {
      var mhp = towerMhp({ i: t.i, lvl: t.lvl } as Tower);
      return {
        x: t.x * W, y: t.y * H, i: t.i, lvl: t.lvl, cool: 0, ang: -Math.PI / 2, flash: 0, slow: 0,
        tgt: t.tgt, inv: { fe: t.inv.fe, cu: t.inv.cu, si: t.inv.si }, mods: t.mods.slice(),
        hp: Math.min(t.hp, mhp), mhp: mhp, kills: t.kills, caps: t.caps, dealt: t.dealt,
        dropT: 0, jam: 0
      } as Tower;
    });
    /* enemies — routes rebuilt from ids once the graph regenerates */
    S.pendingEnemies = sh.enemies as unknown as Enemy[];
    return true;
  } catch (e) {
    return false;
  }
}

/* ---- history & best ---- */
export function loadHistory(): void {
  var raw = storeGet(HIST_KEY);
  if (!raw) return;
  try {
    var h = JSON.parse(raw);
    if (Array.isArray(h)) S.history = h.slice(0, 10);
  } catch (e) { /* ignore */ }
}

export function saveHistory(): void {
  try { storeSet(HIST_KEY, JSON.stringify(S.history.slice(0, 10))); } catch (e) { /* ignore */ }
}

export function loadBest(): void {
  var raw = storeGet(BEST_KEY);
  if (raw) {
    var n = parseInt(raw, 10);
    if (!isNaN(n) && n > 0) S.best = n;
  }
}

export function saveBest(): void {
  try { storeSet(BEST_KEY, String(S.best)); } catch (e) { /* ignore */ }
}
