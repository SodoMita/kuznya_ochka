/* Static game data: cards, relics, enemy archetypes, sector templates, speeds. */
import type { Card, Relic, EnemyTypeDef, SectorDef } from './types';

export const RKEYS = ['fe', 'cu', 'si'] as const;

export const GLYPHS: Record<string, string> = {
  needle: '<svg viewBox="0 0 16 16"><path d="M8 1v8M8 9l-3 4h6l-3-4zM3 15h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  arc: '<svg viewBox="0 0 16 16"><path d="M9 1L4 8h3l-1 7 6-9H8l1-5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  harvest: '<svg viewBox="0 0 16 16"><path d="M3 3v6a5 5 0 0 0 10 0V3M8 6v9M5 15h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  foundry: '<svg viewBox="0 0 16 16"><path d="M2 14V7l4 2V7l4 2V4h3v10H2zM11 1v2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  rail: '<svg viewBox="0 0 16 16"><path d="M1 13L13 3M13 3l2-2M13 3v3M10 6v3M3 15h7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  aegis: '<svg viewBox="0 0 16 16"><path d="M8 1l6 3v4c0 3.5-2.7 6-6 7-3.3-1-6-3.5-6-7V4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="8" cy="7.5" r="1.6" fill="currentColor"/></svg>'
};

export const CARDS: Card[] = [
  { id: 'needle', name: 'NEEDLE', desc: 'rapid kinetic sentry', cost: { fe: 24, cu: 8, si: 2 }, dmg: 7, rate: 4.2, range: 92, draw: 1, col: '#d9e2b0' },
  { id: 'arc', name: 'ARC COIL', desc: 'chains past armor', cost: { fe: 16, cu: 22, si: 8 }, dmg: 26, rate: 1.15, range: 84, draw: 2, col: '#6fd7e8' },
  { id: 'harvest', name: 'HARVESTER', desc: 'tractor-beam captor', cost: { fe: 30, cu: 12, si: 7 }, dmg: 12, rate: 1.7, range: 78, draw: 2, col: '#3ec9b0' },
  { id: 'foundry', name: 'FOUNDRY', desc: 'refines matter, feeds nearby units +8%', cost: { fe: 40, cu: 10, si: 10 }, dmg: 0, rate: 0, range: 92, draw: 1, col: '#e0854e' },
  { id: 'rail', name: 'RAIL', desc: 'long-range sniper, punches 80% of armor', cost: { fe: 20, cu: 12, si: 26 }, dmg: 60, rate: .5, range: 150, draw: 3, col: '#ffd23f' },
  { id: 'aegis', name: 'AEGIS', desc: 'slow field 30% — no guns, pure drag', cost: { fe: 12, cu: 26, si: 6 }, dmg: 0, rate: 0, range: 70, draw: 1, col: '#7fd8c8' }
];

export const RELICS: Relic[] = [
  { id: 'cap', name: 'CAPACITOR BANK', desc: '+8 grid capacity, immediately', rar: 1 },
  { id: 'scav', name: 'SCAVENGER PROTOCOL', desc: '+12% salvage from every source', rar: 1 },
  { id: 'clock', name: 'OVERCLOCK FIRMWARE', desc: '+10% global fire rate', rar: 2 },
  { id: 'cryo', name: 'CRYO COOLANT', desc: '+12% turret range', rar: 1 },
  { id: 'metal', name: 'METALLURGY', desc: '+18% foundry output', rar: 1 },
  { id: 'tread', name: 'TRACTION TREADS', desc: 'beam slow 45% → 62%', rar: 2 },
  { id: 'magnet', name: 'SALVAGE MAGNETS', desc: '+0.5 extra grid per capture', rar: 2 },
  { id: 'plating', name: 'EMERGENCY PLATING', desc: '+6 core integrity, immediately', rar: 1 },
  { id: 'tungsten', name: 'TUNGSTEN ROUNDS', desc: '+10% turret damage', rar: 2 },
  { id: 'repair', name: 'FIELD REPAIR', desc: '+1 core integrity each wave cleared', rar: 2 },
  { id: 'scan', name: 'DEEP SCAN', desc: 'capture zone widened 30% → 36% hull', rar: 1 },
  { id: 'lace', name: 'NANITE LACE', desc: 'tractor beams channel 25% faster', rar: 2 },
  { id: 'fusion', name: 'FUSION TAP', desc: '+1 grid capacity per Foundry', rar: 2 },
  { id: 'ledger', name: 'SALVAGE LEDGER', desc: 'early-launch bonus doubled', rar: 1 },
  { id: 'twin', name: 'TWIN FEED', desc: 'Needle fire rate +20%', rar: 1 },
  { id: 'lattice', name: 'ARC LATTICE', desc: 'arc chains to one extra target', rar: 2 },
  { id: 'tithe', name: 'SCRAP TITHE', desc: 'streak salvage cap +25% → +40%', rar: 2 },
  { id: 'lens', name: 'ORBITAL LENS', desc: 'Rail range +25%', rar: 1 }
];

export const ETYPES: Record<string, EnemyTypeDef> = {
  scrap: { hp: 1, sp: 1, dmg: 1, armor: 0, reward: 1, size: 6, col: '#c9714a' },
  plated: { hp: 2, sp: .78, dmg: 2, armor: .25, reward: 1.7, size: 8, col: '#8d9aa5' },
  swarm: { hp: .45, sp: 1.5, dmg: 1, armor: 0, reward: .5, size: 4, col: '#d8a24a' },
  regen: { hp: 1.3, sp: .95, dmg: 1, armor: 0, reward: 1.3, regen: .012, size: 6, col: '#7ac98a' },
  titan: { hp: 14, sp: .5, dmg: 5, armor: .3, reward: 8, size: 13, col: '#e5484d' },
  gilded: { hp: .8, sp: 1.35, dmg: 1, armor: 0, reward: 3, size: 5, col: '#ffd23f' },
  phase: { hp: 1.1, sp: .9, dmg: 1, armor: 0, reward: 1.2, size: 6, col: '#7fa8d9' },
  carrier: { hp: 6, sp: .65, dmg: 3, armor: .1, reward: 4, size: 11, col: '#a58a6a' },
  dread: { hp: 22, sp: .45, dmg: 6, armor: .35, regen: .008, reward: 12, size: 15, col: '#8a2a30' }
};

export const SECTORS: SectorDef[] = [
  { name: 'RUST BASIN', mix: { fe: 1.25, cu: .9, si: .8 }, tint: '#241b16', grid: '#33261f', path: '#4a382c', haz: 0 },
  { name: 'COPPERBACK RIDGE', mix: { fe: .85, cu: 1.4, si: .75 }, tint: '#1d2019', grid: '#2b3024', path: '#464a33', haz: 1 },
  { name: 'SILICA FLATS', mix: { fe: .8, cu: .85, si: 1.5 }, tint: '#171d22', grid: '#243039', path: '#3a4a55', haz: 2 },
  { name: "GRINDER'S DELTA", mix: { fe: 1.05, cu: 1.05, si: .95 }, tint: '#221818', grid: '#332424', path: '#4d3535', haz: 5 },
  { name: 'MAGNA TRENCH', mix: { fe: 1.1, cu: .95, si: 1.1 }, tint: '#191a22', grid: '#272a37', path: '#3d4155', haz: 3 },
  { name: 'VAULT MERIDIAN', mix: { fe: .9, cu: 1.15, si: 1.05 }, tint: '#221f14', grid: '#33301f', path: '#57513a', haz: 4, gild: 2.2 }
];

export const HAZNAMES = ['PLATED HEAVY', 'SWARM DENSE', 'REGEN CELLS', 'PHASE SHIFTERS', 'GILDED VEINS', 'CARRIER BELT'];
export const HAZCODE = ['PL', 'SW', 'RG', 'PH', 'GL', 'CR'];

export const MEDALS: [string, string][] = [
  ['firstcap', 'FIRST RECLAMATION'],
  ['cap25', 'SALVAGE BARON'],
  ['titancap', 'DAVID PROTOCOL'],
  ['k200', 'SCRAPSTORM'],
  ['streak20', 'CHAIN REACTION'],
  ['sector3', 'PATHFINDER'],
  ['dreadkill', 'KINGSLAYER'],
  ['gild5', 'GOLD RUSH'],
  ['surge10', 'OVERDRIVER'],
  ['calib', 'MASTERWORK']
];

export const EVENTS: { id: string; name: string }[] = [
  { id: 'ion', name: 'ION STORM' },
  { id: 'grav', name: 'GRAV SHEAR' },
  { id: 'rust', name: 'RUST WIND' }
];

export const SPEEDS = [1, 2, 4, 8, 16, 32, 64, 100];

export const TGTS = ['first', 'last', 'strong', 'weak', 'near', 'far'];

export const TGT_LABEL: Record<string, string> = {
  first: '1ST', last: 'LST', strong: 'MAX', weak: 'MIN', near: 'NEAR', far: 'FAR'
};
