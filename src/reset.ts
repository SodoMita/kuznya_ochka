/* Deploying into a sector: reset local state and regenerate terrain.
   Also: starting a brand-new run (seed reroll / daily / fresh start). */
import { S, freshState } from './state';
import { SECTORS, OBJECTIVES } from './data';
import { pad2, mulberry32 } from './utils';
import { genSector } from './sectors';
import { genWorld } from './world';
import { initRunDeck, sectorShuffle } from './deck';
import { banner, hud, toast } from './hud';
import { Snd } from './audio';
import { clearSave, loadHistory, loadBest, saveSettings } from './persist';

function rollObjective(): void {
  var r = mulberry32((S.seed + S.sector * 131) >>> 0);
  var o = OBJECTIVES[Math.floor(r() * OBJECTIVES.length)];
  S.objective = { id: o.id, name: o.name, desc: o.desc, done: false, track: 0 };
}

export function resetSector(idx: number): void {
  S.sector = idx;
  S.wave = 0;
  S.phase = 'build';
  S.buildMax = 18;
  S.buildT = 18;
  S.coreMax = 20 + (S.relics.plating ? 6 : 0);
  S.core = S.coreMax;
  S.gridMax = 10 + (S.relics.cap ? 8 : 0);
  /* starting matter scales gently with route depth */
  S.res = { fe: 120 + idx * 6, cu: 65 + idx * 4, si: 36 + idx * 2 };
  S.towers = [];
  S.enemies = [];
  S.shots = [];
  S.beams = [];
  S.parts = [];
  S.floats = [];
  S.rings = [];
  S.spawnQ = [];
  S.spawnT = 0;
  S.over = false;
  S.selTower = null;
  S.selCard = null;
  S.event = null;
  S.ghost = null;
  S.inspect = null;
  S.streak = { n: 0, t: 0 };
  S.screenFlash = { col: '', a: 0 };
  S.gridPulse = null;
  S.scorch = [];
  S.undoStack = [];
  S.overcharge = false;
  S.ability = { surge: { cd: 0, until: 0 }, weld: { cd: 0 } };
  rollObjective();
  sectorShuffle();          /* fresh draw pile + opening hand for the sector */
  genSector();
  banner('SECTOR ' + pad2(idx + 1), SECTORS[idx % SECTORS.length].name + ' — DEPLOYED' +
    (S.objective ? ' · OBJECTIVE: ' + S.objective.name : ''));
  Snd.play('wave');
  hud(true);
}

/** Wipe the run and start fresh with the given seed. */
export function startNewRun(seed: number): void {
  var st = S.settings;
  var fresh = freshState(seed);
  Object.keys(fresh).forEach(function (k) {
    (S as any)[k] = (fresh as any)[k];
  });
  S.settings = st;           /* player preferences survive the reroll */
  clearSave();
  loadHistory();
  loadBest();
  saveSettings();
  initRunDeck();
  genWorld();
  genSector();
  hud(true);
  toast('NEW RUN — SEED ' + S.seed);
  Snd.play('draft');
}
