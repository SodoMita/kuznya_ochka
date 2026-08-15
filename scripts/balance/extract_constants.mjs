/* Bind the formal balance model to the real game source.

   A proof about constants that have drifted from the code proves nothing.
   This script re-reads the balance-critical numbers straight out of src/*.ts
   and asserts they still match the values hard-coded in model.py. If someone
   retunes the economy without updating the model, this fails loudly.

   Run: node scripts/balance/extract_constants.mjs
*/
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const read = (p) => readFileSync(path.join(root, p), 'utf8');

const src = {
  economy: read('src/economy.ts'),
  enemies: read('src/enemies.ts'),
  towers: read('src/towers.ts'),
  input: read('src/input.ts'),
  deck: read('src/deck.ts'),
  data: read('src/data.ts'),
  sim: read('src/sim.ts')
};
const model = read('scripts/balance/model.py');

const failures = [];
const checks = [];

/** Assert a regex matches `file` and that capture group 1 equals `expected`. */
function grab(name, file, re, expected) {
  const m = src[file].match(re);
  if (!m) {
    failures.push(`${name}: pattern not found in src/${file}.ts — ${re}`);
    return;
  }
  const got = m[1];
  checks.push([name, got, expected]);
  if (got !== expected) {
    failures.push(`${name}: source has ${got}, model assumes ${expected}`);
  }
}

/** Assert the model file literally contains a constant definition. */
function modelHas(name, re) {
  if (!re.test(model)) failures.push(`${name}: model.py missing/changed constant — ${re}`);
}

/* ── upgrade cost: .75 * 1.28^(lvl-1) ───────────────────────────────────── */
grab('upCost base',        'economy', /var b = CARDS\[t\.i\]\.cost, m = \.(\d+) \* Math\.pow\(/, '75');
grab('upCost growth',      'economy', /m = \.75 \* Math\.pow\(([\d.]+),/, '1.28');

/* ── tower scaling ──────────────────────────────────────────────────────── */
grab('damage growth',      'towers',  /c\.dmg \* Math\.pow\(([\d.]+), L\)/, '1.16');
grab('rate growth',        'towers',  /c\.rate \* Math\.pow\(([\d.]+), L\)/, '1.05');
grab('range per level',    'towers',  /c\.range \* \(1 \+ \.(\d+) \* L\)/, '04');
grab('foundry base fe',    'towers',  /return \{ fe: \.(\d+) \* m/, '34');
grab('foundry growth',     'towers',  /Math\.pow\(([\d.]+), t\.lvl - 1\)/, '1.13');

/* ── wave HP: (34 + 11w) * 1.058^(w-1) ──────────────────────────────────── */
grab('wave linear a',      'enemies', /return \((\d+) \+ 11 \* w\)/, '34');
grab('wave linear b',      'enemies', /return \(34 \+ (\d+) \* w\)/, '11');
grab('wave growth',        'enemies', /Math\.pow\(([\d.]+), w - 1\)/, '1.058');

/* ── bounty ─────────────────────────────────────────────────────────────── */
grab('bounty fe',          'enemies', /fe: e\.mhp \* \.(\d+) \* rw/, '032');
grab('bounty cu',          'enemies', /cu: e\.mhp \* \.(\d+) \* rw/, '011');
grab('bounty si',          'enemies', /si: e\.mhp \* \.(\d+) \* rw/, '0045');
grab('capture mult',       'enemies', /mult = captured \? ([\d.]+) :/, '2.5');
grab('capture grid',       'enemies', /S\.gridMax \+= S\.relics\.magnet \? \.9 : \.(\d+);/, '4');
grab('streak cap',         'enemies', /Math\.min\(S\.relics\.tithe \? 40 : (\d+),/, '25');
grab('tithe cap',          'enemies', /Math\.min\(S\.relics\.tithe \? (\d+) :/, '40');
grab('grid per wave',      'enemies', /S\.gridMax \+= (\d+);/, '2');

/* ── recycle rates ──────────────────────────────────────────────────────── */
grab('tower recycle',      'input',   /var rm = \.(\d+) \+ \(S\.relics\.harvester/, '7');
grab('card recycle',       'deck',    /fe: Math\.ceil\(d\.cost\.fe \* \.(\d+)\)/, '5');

/* ── grid ───────────────────────────────────────────────────────────────── */
grab('grid per level',     'economy', /draw \+ \.(\d+) \* \(t\.lvl - 1\)/, '3');

/* ── early launch ───────────────────────────────────────────────────────── */
grab('early fe',           'enemies', /S\.buildT \* \(S\.relics\.ledger \? ([\d.]+) :/, '1.6');
grab('early fe base',      'enemies', /S\.relics\.ledger \? 1\.6 : \.(\d+)\)/, '8');

/* ── expansion content ──────────────────────────────────────────────────── */
grab('needle dmg',       'data',    /id: 'needle'[^\n]*dmg: (\d+), rate: ([\d.]+)/, '7');
grab('needle rate',      'data',    /id: 'needle'[^\n]*dmg: \d+, rate: ([\d.]+)/, '4.2');
grab('vulcan dmg',       'data',    /id: 'vulcan'[^\n]*dmg: (\d+), rate: (\d+)/, '4');
grab('vulcan rate',      'data',    /id: 'vulcan'[^\n]*dmg: \d+, rate: (\d+)/, '9');
grab('pulse dmg',        'data',    /id: 'pulse'[^\n]*dmg: (\d+), rate: ([\d.]+)/, '30');
grab('pulse rate',       'data',    /id: 'pulse'[^\n]*dmg: \d+, rate: ([\d.]+)/, '.33');
grab('shrieker hp',      'data',    /shrieker: \{ hp: \.(\d+),/, '8');
grab('jammer hp',        'data',    /jammer: \{ hp: ([\d.]+),/, '1.5');
grab('overlord hp',      'data',    /overlord: \{ hp: (\d+),/, '30');
grab('hp jitter',        'enemies', /\(0\.9 \+ jr\(\) \* \.(\d+)\)/, '2');
grab('veteran hp',       'enemies', /if \(vet\) hp \*= ([\d.]+)/, '1.6');
grab('tough perk hp',    'enemies', /perk === 'tough'\) hp \*= ([\d.]+)/, '1.25');
grab('jammer rate',      'sim',     /var jamRate = t\.jam \? \.(\d+) :/, '25');
grab('meteor damage',    'sim',     /var mdmg = victim\.mhp \* \.(\d+)/, '15');
grab('meteor interval',  'sim',     /S\.meteorT = ([\d.]+)/, '1.6');
grab('meteor stray hit', 'sim',     /damageTower\(clip, (\d+),/, '1');
grab('scav relic',       'economy', /S\.relics\.scav \? ([\d.]+) :/, '1.12');
grab('scav drone',       'economy', /S\.powers\.power_drone\) m \*= ([\d.]+)/, '1.12');
grab('efficiency',       'economy', /S\.powers\.power_efficiency \? \.(\d+) :/, '9');
grab('shield grid',      'economy', /S\.powers\.power_shield\) m \*= ([\d.]+)/, '1.25');
grab('armored mounts',   'economy', /S\.relics\.bulwark\) m \*= ([\d.]+)/, '1.4');
grab('repulsor field',   'sim',     /S\.powers\.power_repulsor \? \.(\d+) :/, '92');
grab('homing rig',       'towers',  /S\.powers\.power_seek\) range \*= ([\d.]+)/, '1.2');
grab('borehead gatlings','towers',  /S\.relics\.drill\) rate \*= ([\d.]+)/, '1.15');
grab('pulse catalyst',   'towers',  /S\.relics\.catalyst\) rate \*= ([\d.]+)/, '1.2');
grab('grid reclaimer',   'towers',  /\.7 \+ \(S\.relics\.harvester \? \.(\d+) :/, '1');
grab('ore vein fe',      'deck',    /case 'skill_ore':[\s\S]*?gainRes\(\{ fe: (\d+), cu: (\d+)/, '40');
grab('ore vein cu',      'deck',    /case 'skill_ore':[\s\S]*?gainRes\(\{ fe: \d+, cu: (\d+)/, '20');
grab('salvage bond',     'deck',    /var pay = (\d+) \* S\.wave/, '6');
grab('overcharge cost',  'data',    /id: 'skill_overcharge'[^\n]*si: (\d+)/, '10');

/* ── the model must still declare the matching constants ────────────────── */
modelHas('UP_BASE',      /UP_BASE\s*=\s*Fraction\(75, 100\)/);
modelHas('UP_GROWTH',    /UP_GROWTH\s*=\s*Fraction\(128, 100\)/);
modelHas('DMG_GROWTH',   /DMG_GROWTH\s*=\s*Fraction\(116, 100\)/);
modelHas('RATE_GROWTH',  /RATE_GROWTH\s*=\s*Fraction\(105, 100\)/);
modelHas('RECYCLE_RATE', /RECYCLE_RATE\s*=\s*Fraction\(70, 100\)/);
modelHas('CARD_RECYCLE', /CARD_RECYCLE\s*=\s*Fraction\(50, 100\)/);
modelHas('WAVE_GROWTH',  /WAVE_GROWTH\s*=\s*Fraction\(1058, 1000\)/);
modelHas('BOUNTY_FE',    /BOUNTY_FE\s*=\s*Fraction\(32, 1000\)/);
modelHas('CAPTURE_MULT', /CAPTURE_MULT\s*=\s*Fraction\(25, 10\)/);
modelHas('GRID_PER_LVL', /GRID_PER_LVL\s*=\s*Fraction\(30, 100\)/);
modelHas('FOUNDRY_FE',   /FOUNDRY_FE\s*=\s*Fraction\(34, 100\)/);
modelHas('VULCAN_DMG',   /VULCAN_DMG, VULCAN_RATE, VULCAN_COST = Fraction\(4\), Fraction\(9\), Fraction\(52\)/);
modelHas('PULSE_DMG',    /PULSE_DMG, PULSE_RATE, PULSE_COST\s*=\s*Fraction\(30\), Fraction\(33, 100\), Fraction\(64\)/);
modelHas('NEEDLE_DMG',   /NEEDLE_DMG, NEEDLE_RATE, NEEDLE_COST = Fraction\(7\), Fraction\(42, 10\), Fraction\(34\)/);
modelHas('JAM_RATE',     /JAM_RATE = Fraction\(25, 100\)/);
modelHas('METEOR_DMG',   /METEOR_DMG = Fraction\(15, 100\)/);
modelHas('SCAV_DRONE',   /SCAV_RELIC, SCAV_DRONE = Fraction\(112, 100\), Fraction\(112, 100\)/);
modelHas('HARVESTER_RECYCLE', /HARVESTER_RECYCLE = Fraction\(80, 100\)/);
modelHas('OVERCHARGE_SAVE',   /OVERCHARGE_SAVE = Fraction\(75, 100\)/);

if (failures.length) {
  console.error('CONSTANT DRIFT DETECTED — the balance proof no longer describes the game:\n');
  failures.forEach((f) => console.error('  · ' + f));
  console.error('\nUpdate scripts/balance/model.py to match the new tuning, then re-run the proof.');
  process.exit(1);
}

console.log(`CONSTANTS VERIFIED ✓ (${checks.length} balance constants in src/*.ts match model.py)`);
