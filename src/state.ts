/* Central mutable game state. Everything else reads/writes S. */
import type {
  Tower, Enemy, Shot, Beam, Part, FloatTxt, Ring, Mote, Spot, WorldNode,
  DraftOffer, GhostState, RouteNode, WeatherEvent, AbilityState, StreakState,
  Ember, CardInst, Settings, SectorObjective, RunRecord, Confirm, ToastItem
} from './types';

export interface GameState {
  seed: number;
  sectorGen: number;      // bumped on every genSector(); invalidates baked render layers
  sector: number;
  wave: number;
  phase: 'build' | 'wave';
  buildT: number;
  buildMax: number;
  core: number;
  coreMax: number;
  gridMax: number;
  res: { fe: number; cu: number; si: number };
  towers: Tower[];
  enemies: Enemy[];
  shots: Shot[];
  beams: Beam[];
  parts: Part[];
  floats: FloatTxt[];
  rings: Ring[];
  motes: Mote[];
  ranks: Record<string, number>;
  relics: Record<string, boolean>;
  deck: CardInst[];            // every card owned this run
  drawPile: CardInst[];        // face-down pile (top = last element)
  hand: CardInst[];            // cards currently playable
  discardPile: CardInst[];     // played/discarded, reshuffles into draw
  exhaustPile: CardInst[];     // out for the rest of the sector
  powers: Record<string, number>; // installed firmware (per sector)
  speed: number;
  paused: boolean;
  over: boolean;
  victoryShown: boolean;
  modalOpen: boolean;
  selCard: number | null;   // index into S.hand (a live card instance)
  selTower: Tower | null;
  mode: 'loot' | 'capture';
  ghost: GhostState | null;
  spawnQ: string[];
  spawnT: number;
  time: number;
  shake: number;
  stat: { kills: number; captures: number; leaks: number; waves: number; salvaged: number; gilds: number; surges: number; burnKills: number; towerLoss: number; maxTowers: number; byType: Record<string, number> };
  streak: StreakState;
  medals: Record<string, boolean>;
  ability: AbilityState;
  event: WeatherEvent | null;
  /* screen FX */
  screenFlash: { col: string; a: number };
  gridPulse: { x: number; y: number; col: string; a: number; r: number } | null;
  embers: Ember[];
  cleared: Record<number, boolean>;
  nodes: RouteNode[];         // route-network nodes (unit + pixel coords)
  edges: [number, number][];  // undirected edges between node indices
  edgeLen: number[];          // pixel length per edge (parallel to edges)
  edgeMap: Map<number, number>; // canonical (a*n+b) edge key → edge index
  spawns: number[];           // node indices of spawn gates
  coreIdx: number;            // node index of the CORE
  spawnIdx: number;           // round-robin counter across spawn gates
  spots: Spot[];
  spawnInt: number;
  worldNodes: WorldNode[];
  worldEdges: number[][];
  draftOffers: DraftOffer[];
  worldPick: number;
  endWin?: boolean;
  /* ---- meta systems (run management, score, persistence) ---- */
  settings: Settings;
  score: number;
  best: number;
  history: RunRecord[];
  historySaved: boolean;      // guards one history entry per run
  objective: SectorObjective | null;
  mulliganUsed: boolean;
  undoStack: { t: Tower; ci: CardInst; from: 'discard' | 'exhaust' }[];
  overcharge: boolean;        // next deployed board this turn prints at +1 level
  inspect: Enemy | null;
  inspectT: number;
  pendingConfirm: Confirm | null;
  toastQ: ToastItem[];
  notif: number;              // unseen medals, badge counter
  meteorT: number;            // METEOR SHOWER strike timer
  endStatsShown: boolean;
  scorch: { x: number; y: number; seed: number }[];  // baked kill-site scorch marks (per sector)
  pendingEnemies: Enemy[] | null;                    // saved enemies awaiting route rebuild after resume
  pendingTowers: { x: number; y: number; i: number; lvl: number; tgt: string; inv: { fe: number; cu: number; si: number }; mods: string[]; hp: number; kills: number; caps: number; dealt: number }[] | null;  // saved towers awaiting viewport projection after resume
}

/** A brand-new run state for a given seed. */
export function freshState(seed: number): GameState {
  return {
    seed: seed >>> 0,
    sectorGen: 0,
    sector: 0,
    wave: 0,
    phase: 'build',
    buildT: 18,
    buildMax: 18,
    core: 20,
    coreMax: 20,
    gridMax: 10,
    res: { fe: 120, cu: 65, si: 36 },
    towers: [],
    enemies: [],
    shots: [],
    beams: [],
    parts: [],
    floats: [],
    rings: [],
    motes: [],
    ranks: { needle: 0, arc: 0, harvest: 0, foundry: 0 },
    relics: {},
    deck: [],
    drawPile: [],
    hand: [],
    discardPile: [],
    exhaustPile: [],
    powers: {},
    speed: 1,
    paused: false,
    over: false,
    victoryShown: false,
    modalOpen: false,
    selCard: null,
    selTower: null,
    mode: 'loot',
    ghost: null,
    spawnQ: [],
    spawnT: 0,
    time: 0,
    shake: 0,
    stat: { kills: 0, captures: 0, leaks: 0, waves: 0, salvaged: 0, gilds: 0, surges: 0, burnKills: 0, towerLoss: 0, maxTowers: 0, byType: {} },
    streak: { n: 0, t: 0 },
    medals: {},
    ability: { surge: { cd: 0, until: 0 }, weld: { cd: 0 } },
    event: null,
    screenFlash: { col: '', a: 0 },
    gridPulse: null,
    embers: [],
    cleared: {},
    nodes: [],
    edges: [],
    edgeLen: [],
    edgeMap: new Map<number, number>(),
    spawns: [],
    coreIdx: 0,
    spawnIdx: 0,
    spots: [],
    spawnInt: .6,
    worldNodes: [],
    worldEdges: [],
    draftOffers: [],
    worldPick: -1,
    settings: {
      vol: 1, shake: true, particles: 1, scanlines: true, autopause: true,
      uiScale: 1, confirmRecycle: false, colorblind: false, contrast: false,
      dmgNumbers: true, handSort: false
    },
    score: 0,
    best: 0,
    history: [],
    historySaved: false,
    objective: null,
    mulliganUsed: false,
    undoStack: [],
    overcharge: false,
    inspect: null,
    inspectT: 0,
    pendingConfirm: null,
    toastQ: [],
    notif: 0,
    meteorT: 0,
    endStatsShown: false,
    scorch: [],
    pendingEnemies: null,
    pendingTowers: null
  };
}

export const S: GameState = freshState((Date.now() ^ 0x5f3a9) >>> 0);
