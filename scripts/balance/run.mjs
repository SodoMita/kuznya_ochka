/* Balance verification entry point.

   1. extract_constants.mjs — asserts the model still matches src/*.ts
   2. model.py              — discharges the SMT proof obligations in Z3

   Z3 is a dev-only dependency and is NOT part of the shipped game (the game
   is still a single dependency-free index.html). If z3-solver isn't
   importable we say exactly how to install it and exit non-zero, rather than
   silently "passing".
*/
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const here = path.join(root, 'scripts', 'balance');

/* 1 ─ constants must still describe the game ------------------------------ */
const drift = spawnSync(process.execPath, [path.join(here, 'extract_constants.mjs')],
  { stdio: 'inherit' });
if (drift.status !== 0) process.exit(drift.status ?? 1);

/* 2 ─ locate a python that can import z3 ---------------------------------- */
const candidates = [
  process.env.BALANCE_PYTHON,
  path.join(root, '.venv', 'bin', 'python'),
  path.join(path.dirname(root), '.solverenv', 'bin', 'python'),
  path.join(process.env.HOME || '', '.solverenv', 'bin', 'python'),
  'python3'
].filter(Boolean);

let py = null;
for (const c of candidates) {
  if (c !== 'python3' && !existsSync(c)) continue;
  const probe = spawnSync(c, ['-c', 'import z3'], { stdio: 'ignore' });
  if (probe.status === 0) { py = c; break; }
}

if (!py) {
  console.error('\nBALANCE PROOF SKIPPED — no Python with z3-solver found.\n');
  console.error('  python3 -m venv .venv && .venv/bin/pip install z3-solver');
  console.error('  npm run balance\n');
  console.error('(Or point BALANCE_PYTHON at an interpreter that has z3.)');
  console.error('Z3 is a dev-only dependency; the shipped game remains a single static HTML.');
  process.exit(1);
}

/* 3 ─ discharge the proof obligations ------------------------------------- */
const proof = spawnSync(py, [path.join(here, 'model.py')], { stdio: 'inherit' });
if (proof.status !== 0) process.exit(proof.status ?? 1);

/* 4 ─ prove the transcription is faithful to the running game ------------- */
const cross = spawnSync(process.execPath, [path.join(here, 'crosscheck.mjs')],
  { stdio: 'inherit' });
process.exit(cross.status ?? 1);
