/* Deploying into a sector: reset local state and regenerate terrain. */
import { S } from './state';
import { SECTORS } from './data';
import { pad2 } from './utils';
import { genSector } from './sectors';
import { sectorShuffle } from './deck';
import { banner, hud } from './hud';
import { Snd } from './audio';

export function resetSector(idx: number): void {
  S.sector = idx;
  S.wave = 0;
  S.phase = 'build';
  S.buildMax = 18;
  S.buildT = 18;
  S.coreMax = 20 + (S.relics.plating ? 6 : 0);
  S.core = S.coreMax;
  S.gridMax = 10 + (S.relics.cap ? 8 : 0);
  S.res = { fe: 120 + idx * 6, cu: 65, si: 36 };
  S.towers = [];
  S.enemies = [];
  S.shots = [];
  S.beams = [];
  S.parts = [];
  S.floats = [];
  S.rings = [];
  S.spawnQ = [];
  S.over = false;
  S.selTower = null;
  S.selCard = null;
  S.event = null;
  S.ability = { surge: { cd: 0, until: 0 }, weld: { cd: 0 } };
  sectorShuffle();          /* fresh draw pile + opening hand for the sector */
  genSector();
  banner('SECTOR ' + pad2(idx + 1), SECTORS[idx % SECTORS.length].name + ' — DEPLOYED');
  Snd.play('wave');
  hud(true);
}
