/* Static game data: cards, relics, enemy archetypes, sector templates, speeds. */
import type { Card, DeckCardDef, Relic, EnemyTypeDef, SectorDef } from './types';

export const RKEYS = ['fe', 'cu', 'si'] as const;

export const GLYPHS: Record<string, string> = {
  needle: '<svg viewBox="0 0 16 16"><path d="M8 1v8M8 9l-3 4h6l-3-4zM3 15h10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  arc: '<svg viewBox="0 0 16 16"><path d="M9 1L4 8h3l-1 7 6-9H8l1-5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  harvest: '<svg viewBox="0 0 16 16"><path d="M3 3v6a5 5 0 0 0 10 0V3M8 6v9M5 15h6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  foundry: '<svg viewBox="0 0 16 16"><path d="M2 14V7l4 2V7l4 2V4h3v10H2zM11 1v2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  rail: '<svg viewBox="0 0 16 16"><path d="M1 13L13 3M13 3l2-2M13 3v3M10 6v3M3 15h7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  aegis: '<svg viewBox="0 0 16 16"><path d="M8 1l6 3v4c0 3.5-2.7 6-6 7-3.3-1-6-3.5-6-7V4z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="8" cy="7.5" r="1.6" fill="currentColor"/></svg>',
  /* generic card-kind schematics — subroutine / firmware / corruption */
  k_skill: '<svg viewBox="0 0 16 16"><path d="M5 4L2 8l3 4M11 4l3 4-3 4M9.5 3l-3 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  k_power: '<svg viewBox="0 0 16 16"><rect x="4" y="4" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M6 1v3M10 1v3M6 12v3M10 12v3M1 6h3M1 10h3M12 6h3M12 10h3" stroke="currentColor" stroke-width="1.2"/></svg>',
  k_curse: '<svg viewBox="0 0 16 16"><path d="M8 2v6M8 11v.5M2.5 13.5L8 2l5.5 11.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>'
};

export const CARDS: Card[] = [
  { id: 'needle', name: 'NEEDLE', desc: 'rapid kinetic sentry', cost: { fe: 24, cu: 8, si: 2 }, dmg: 7, rate: 4.2, range: 92, draw: 1, col: '#d9e2b0' },
  { id: 'arc', name: 'ARC COIL', desc: 'chains past armor', cost: { fe: 16, cu: 22, si: 8 }, dmg: 26, rate: 1.15, range: 84, draw: 2, col: '#6fd7e8' },
  { id: 'harvest', name: 'HARVESTER', desc: 'tractor-beam captor', cost: { fe: 30, cu: 12, si: 7 }, dmg: 12, rate: 1.7, range: 78, draw: 2, col: '#3ec9b0' },
  { id: 'foundry', name: 'FOUNDRY', desc: 'refines matter, feeds nearby units +8%', cost: { fe: 40, cu: 10, si: 10 }, dmg: 0, rate: 0, range: 92, draw: 1, col: '#e0854e' },
  { id: 'rail', name: 'RAIL', desc: 'long-range sniper, punches 80% of armor', cost: { fe: 20, cu: 12, si: 26 }, dmg: 60, rate: .5, range: 150, draw: 3, col: '#ffd23f' },
  { id: 'aegis', name: 'AEGIS', desc: 'slow field 30% — no guns, pure drag', cost: { fe: 12, cu: 26, si: 6 }, dmg: 0, rate: 0, range: 70, draw: 1, col: '#7fd8c8' }
];

/* ---- the circuit deck: StS-style cards --------------------------------- */
/* boards deploy the printed unit and cycle back through the discard pile;
   subroutines are one-shot effects; firmware installs a sector-wide mod and
   always exhausts. EXHAUST = out for the rest of the sector. ETHEREAL =
   exhausts if still unplayed when the turn ends. RETAIN = survives the redraw.
   INNATE = guaranteed in the opening hand. CONSUME = torn from the deck
   permanently after play. */
export const DECK_CARDS: DeckCardDef[] = [
  /* circuit boards — the only way to deploy units */
  { id: 'board_needle', name: 'NEEDLE BOARD', kind: 'board', tower: 0, desc: 'print a NEEDLE — rapid kinetic sentry', cost: CARDS[0].cost, rar: 0, innate: true },
  { id: 'board_arc', name: 'ARC BOARD', kind: 'board', tower: 1, desc: 'print an ARC COIL — chains past armor', cost: CARDS[1].cost, rar: 0 },
  { id: 'board_harvest', name: 'HARVEST BOARD', kind: 'board', tower: 2, desc: 'print a HARVESTER — tractor-beam captor', cost: CARDS[2].cost, rar: 0 },
  { id: 'board_foundry', name: 'FOUNDRY BOARD', kind: 'board', tower: 3, desc: 'print a FOUNDRY — refines matter, feeds allies', cost: CARDS[3].cost, rar: 0, innate: true },
  { id: 'board_rail', name: 'RAIL BOARD', kind: 'board', tower: 4, desc: 'print a RAIL — long-range armor-piercing sniper', cost: CARDS[4].cost, rar: 2, exhaust: true },
  { id: 'board_aegis', name: 'AEGIS BOARD', kind: 'board', tower: 5, desc: 'print an AEGIS — 30% slow field, pure drag', cost: CARDS[5].cost, rar: 1 },
  /* subroutines — one-shot skills */
  { id: 'skill_scrap', name: 'SCRAP INFUSION', kind: 'skill', desc: 'gain 26 Fe · 10 Cu · 4 Si', cost: { fe: 0, cu: 0, si: 0 }, rar: 0 },
  { id: 'skill_hotswap', name: 'HOTSWAP', kind: 'skill', desc: 'draw 2 cards', cost: { fe: 0, cu: 0, si: 0 }, rar: 0 },
  { id: 'skill_weld', name: 'PATCH WELD', kind: 'skill', desc: 'restore 4 core integrity', cost: { fe: 10, cu: 0, si: 0 }, rar: 0, exhaust: true },
  { id: 'skill_overdrive', name: 'OVERDRIVE PULSE', kind: 'skill', desc: 'all units +50% fire rate for 8s', cost: { fe: 0, cu: 15, si: 0 }, rar: 1, retain: true },
  { id: 'skill_emp', name: 'EMP BURST', kind: 'skill', desc: 'zap every hostile for 12% max hull', cost: { fe: 0, cu: 12, si: 6 }, rar: 1, ethereal: true },
  { id: 'skill_recall', name: 'MAGNET RECALL', kind: 'skill', desc: 'drag every hostile 70px back along its route', cost: { fe: 0, cu: 8, si: 0 }, rar: 1, exhaust: true },
  { id: 'skill_refit', name: 'MASS REFIT', kind: 'skill', desc: 'every deployed unit gains +1 level, free', cost: { fe: 0, cu: 0, si: 20 }, rar: 2, exhaust: true },
  { id: 'skill_graft', name: 'CORE GRAFT', kind: 'skill', desc: '+5 max core integrity, permanently', cost: { fe: 25, cu: 0, si: 10 }, rar: 2, exhaust: true, consume: true },
  /* hand control — discard weak hands and recycle useful circuits */
  { id: 'skill_filter', name: 'PACKET FILTER', kind: 'skill', desc: 'discard the 3 rightmost other cards, then draw that many', cost: { fe: 0, cu: 4, si: 0 }, rar: 0 },
  { id: 'skill_smelter', name: 'HAND SMELTER', kind: 'skill', desc: 'discard every other card · gain 8 Fe for each', cost: { fe: 0, cu: 0, si: 0 }, rar: 1, exhaust: true },
  { id: 'skill_recycle', name: 'RECLAIM CIRCUIT', kind: 'skill', desc: 'return the newest card in the discard pile to your hand', cost: { fe: 5, cu: 0, si: 2 }, rar: 0, exhaust: true },
  { id: 'skill_coldboot', name: 'COLD BOOT', kind: 'skill', desc: 'shuffle the discard pile into the draw pile, then draw 2', cost: { fe: 0, cu: 7, si: 3 }, rar: 1, exhaust: true },
  { id: 'skill_purge', name: 'CLEAN ROOM', kind: 'skill', desc: 'permanently purge every curse in hand, then draw that many', cost: { fe: 12, cu: 0, si: 6 }, rar: 1, exhaust: true },
  { id: 'skill_corrupt', name: 'BLACK-BOX CACHE', kind: 'skill', desc: 'gain 70 Fe · 28 Cu · 12 Si, but add a permanent curse', cost: { fe: 0, cu: 0, si: 0 }, rar: 2, exhaust: true },
  { id: 'skill_capacitor', name: 'CAPACITOR DUMP', kind: 'skill', desc: 'gain 3 grid capacity this sector', cost: { fe: 0, cu: 10, si: 4 }, rar: 1, exhaust: true },
  { id: 'skill_barrage', name: 'SHRAPNEL BARRAGE', kind: 'skill', desc: 'deal 35 hull damage to every hostile', cost: { fe: 18, cu: 4, si: 0 }, rar: 1, exhaust: true },
  { id: 'skill_mulligan', name: 'EMERGENCY SORT', kind: 'skill', desc: 'discard every other card, then draw up to 5', cost: { fe: 0, cu: 3, si: 0 }, rar: 0, exhaust: true },
  { id: 'skill_defrag', name: 'DEFRAGMENT', kind: 'skill', desc: 'return the newest exhausted card to your hand', cost: { fe: 8, cu: 5, si: 4 }, rar: 2, exhaust: true },
  { id: 'skill_clone', name: 'CLONE VAT', kind: 'skill', desc: 'permanently copy the newest discarded card · consume', cost: { fe: 20, cu: 8, si: 12 }, rar: 2, consume: true },
  { id: 'skill_triage', name: 'FIELD TRIAGE', kind: 'skill', desc: 'restore 2 core integrity, then draw 1', cost: { fe: 6, cu: 0, si: 0 }, rar: 0 },
  { id: 'skill_delete', name: 'PRIORITY DELETE', kind: 'skill', desc: 'deal 120 hull damage to the strongest hostile', cost: { fe: 12, cu: 6, si: 5 }, rar: 1, exhaust: true },
  { id: 'skill_quarantine', name: 'QUARANTINE', kind: 'skill', desc: 'exhaust every curse in hand this sector · gain 12 Fe each', cost: { fe: 0, cu: 5, si: 0 }, rar: 0, exhaust: true },
  { id: 'skill_siphon', name: 'ORE SIPHON', kind: 'skill', desc: 'gain 3 Fe per living hostile, up to 45 Fe', cost: { fe: 0, cu: 4, si: 0 }, rar: 0 },
  { id: 'skill_gridloan', name: 'GRID LOAN', kind: 'skill', desc: '+7 grid this sector, but add a permanent RUST DEBT', cost: { fe: 0, cu: 0, si: 0 }, rar: 1, exhaust: true },
  /* firmware — sector-wide powers, always exhaust */
  { id: 'power_lathe', name: 'TUNGSTEN LATHE', kind: 'power', desc: '+10% unit damage this sector', cost: { fe: 20, cu: 0, si: 8 }, rar: 1, exhaust: true },
  { id: 'power_sub', name: 'SUBSTATION', kind: 'power', desc: '+4 grid capacity this sector', cost: { fe: 0, cu: 18, si: 0 }, rar: 0, exhaust: true },
  { id: 'power_reserve', name: 'DEEP RESERVES', kind: 'power', desc: 'foundries +25% output this sector', cost: { fe: 15, cu: 10, si: 0 }, rar: 1, exhaust: true },
  { id: 'power_loader', name: 'AUTOLOADER', kind: 'power', desc: 'draw +1 card per turn this sector', cost: { fe: 0, cu: 0, si: 14 }, rar: 2, exhaust: true },
  { id: 'power_armature', name: 'REACTIVE ARMATURE', kind: 'power', desc: '+15% unit damage while core is below half integrity', cost: { fe: 10, cu: 12, si: 4 }, rar: 1, exhaust: true },
  { id: 'power_broker', name: 'SCRAP BROKER', kind: 'power', desc: 'gain 12 Fe at the start of each new turn', cost: { fe: 0, cu: 14, si: 5 }, rar: 1, exhaust: true },
  { id: 'power_scope', name: 'VECTOR SCOPE', kind: 'power', desc: '+15% unit range this sector', cost: { fe: 12, cu: 0, si: 9 }, rar: 1, exhaust: true },
  { id: 'power_feedback', name: 'FEEDBACK CLOCK', kind: 'power', desc: '+12% unit fire rate this sector', cost: { fe: 0, cu: 16, si: 6 }, rar: 2, exhaust: true },
  { id: 'power_failsafe', name: 'CORE FAILSAFE', kind: 'power', desc: 'restore 2 core at the start of each new turn', cost: { fe: 14, cu: 5, si: 0 }, rar: 1, exhaust: true },
  { id: 'power_scrubber', name: 'ERROR SCRUBBER', kind: 'power', desc: 'curses exhaust harmlessly at turn end this sector', cost: { fe: 8, cu: 8, si: 8 }, rar: 2, exhaust: true },
  /* curses — dead draws acquired by risky technology; never offered directly */
  { id: 'curse_jam', name: 'SIGNAL JAM', kind: 'curse', desc: 'unplayable · clogs your hand until discarded', cost: { fe: 0, cu: 0, si: 0 }, rar: 0 },
  { id: 'curse_rust', name: 'RUST DEBT', kind: 'curse', desc: 'unplayable · lose 8 Fe when left in hand at turn end', cost: { fe: 0, cu: 0, si: 0 }, rar: 0 },
  { id: 'curse_breach', name: 'HULL BREACH', kind: 'curse', desc: 'unplayable · lose 1 core when left in hand at turn end', cost: { fe: 0, cu: 0, si: 0 }, rar: 0 }
];

/** The run starts with this 10-card deck. */
export const STARTER_DECK: string[] = [
  'board_needle', 'board_needle', 'board_needle',
  'board_arc', 'board_harvest', 'board_foundry',
  'skill_scrap', 'skill_scrap', 'skill_hotswap', 'skill_weld'
];

export const KIND_LABEL: Record<string, string> = {
  board: 'CIRCUIT BOARD', skill: 'SUBROUTINE', power: 'FIRMWARE', curse: 'CORRUPTION'
};

/** Accent color per card kind (boards use their tower's color instead). */
export const KIND_COL: Record<string, string> = { board: '#9fb6c9', skill: '#3ec9b0', power: '#ffd23f', curse: '#b18cd9' };

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
