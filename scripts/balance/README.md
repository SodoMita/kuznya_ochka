# Formal balance verification

The game's economy is verified with an **SMT model in Z3** rather than by
playtesting or random simulation alone.

## Why a solver and not simulation

The properties that matter are *universally quantified*:

> "There is **no** sequence of legal actions that produces unbounded matter."

Simulation samples the state space; it can only ever say "we didn't find a
problem in the runs we tried". Z3 searches for a counterexample across the
whole continuous domain at once. When it reports `unsat` on the negation of a
property, that property is **proved** for every value in the modelled range.

## Layout

| File | Role |
| --- | --- |
| `model.py` | The 16 proof obligations (exact rational arithmetic, no floats) |
| `extract_constants.mjs` | Re-reads the balance constants out of `src/*.ts` and fails if they drift from the model |
| `crosscheck.mjs` | Drives the **built game** in jsdom and asserts observed costs/refunds/grid match the modelled formulas |
| `run.mjs` | Runs all three in order (`npm run balance`) |

The three layers answer three different questions:

1. *Are the equations sound?* → `model.py`
2. *Are they still the game's equations?* → `extract_constants.mjs`
3. *Does the shipped build actually behave that way?* → `crosscheck.mjs`

## Theorems

| # | Property | Guards against |
| --- | --- | --- |
| T1 | Placing then recycling always loses matter | Money pump |
| T2 | The full buy→upgrade→recycle chain is lossy at every level 1–40 | Money pump via upgrades |
| T3 | Damage-per-matter strictly decreases with level and stays > 0 | Infinite value ladder / soft-lock |
| T4 | `waveHP(w+1) > waveHP(w)` for all w | Difficulty inversion |
| T5 | No constant DPS clears every wave to the derived horizon | "Build once, idle forever" |
| T6 | One wave's bounty (max streak, capture, richest mix) buys < 50 matched upgrades | Runaway snowball |
| T7 | Capture beats killing but yields < 1.0 grid | Self-funding free towers |
| T8 | Tower count is bounded by grid capacity | Unbounded spam |
| T9 | Early-launch Fe never beats sustained foundry output | Rushing strictly dominating |
| T10 | Foundry payback is positive and finite at every level | Free money / dead building |
| T11 | VULCAN sits at 0.80× NEEDLE per matter and PULSE CORE (10 simultaneous targets) ≤ 2.5×, at every level | Dominant / useless blueprint |
| T12 | Added hostile classes fit a constant multiple of waveHP; ANNIHILATOR regen < on-curve NEEDLE DPS | Out-of-curve spawns, unkillable bosses |
| T13 | Jammed fire rate is a fixed positive fraction and a veteran JAMMER dies to one jammed on-curve NEEDLE inside a wave window | Unbounded/free penalty, perma-jam walls |
| T14 | A meteor strike takes 15% of a hostile's hull and stray clips deal 1 integrity | Weather solo-carrying or griefing |
| T15 | Every new multiplier is capped; salvage stacks to 1.2544; best-case recycle is 80% | Expansion multiplier loops |
| T16 | ORE VEIN / SALVAGE BOND / OVERCHARGE are one-shot bounded injections | Matter-printing pumps |

## Exact arithmetic

Every constant is a `Fraction`, converted with `Q(num, den)`. Nothing is a
float, so results are not subject to rounding artefacts — `1.058` is exactly
`1058/1000`, not the nearest double.

## A real bug this caught

T5 originally used a 60-wave horizon. Z3 returned `sat` with
`dps = 162, window = 119.5` — a fixed build that clears wave 60 (19 320 HP) and
dies at wave 61 (20 765 HP). The *game* was fine; the *model* was wrong,
because the horizon has to exceed the point where the exponential passes the
largest admissible constant budget. The horizon is now derived from
`max_dps * max_window` instead of guessed. This is exactly the class of error
that eyeballing a spreadsheet misses.

## Setup

Z3 is a **dev-only** dependency. The shipped game is still a single
dependency-free `index.html` with no network access.

```sh
python3 -m venv .venv
.venv/bin/pip install z3-solver
npm run balance
```

`run.mjs` also looks for `$BALANCE_PYTHON` and `~/.solverenv/bin/python`. If no
interpreter with `z3` is found it exits non-zero with install instructions
rather than silently passing.
