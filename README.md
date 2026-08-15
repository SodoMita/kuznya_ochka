# КУЗНЯ//ОЧКА — FORGE//ZERO

Robot card tower defense ("forge of points"). The whole game ships as a **single static `index.html`** —
open it in any browser and play. No server, no build step required to play.

You fight with a real **deck of cards**, drawn Slay-the-Spire style: circuit **boards** are consumed
to print towers, **subroutines** are one-shot skills, **firmware** powers install sector-wide mods and
exhaust. Each fabrication window is a turn — the hand is discarded (except RETAIN cards) and redrawn;
the discard pile reshuffles into the draw pile when it runs dry. Salvage caches add new cards to the deck.
Hand-control subroutines can actively discard and redraw cards, reclaim cards from discard, or recycle the
whole pile. Risky black-box cards can also add persistent, unplayable **corruption/curse** cards; CLEAN ROOM
is the deck's dedicated curse-removal tool.

> **This build packs 100 big + 100 small improvements** on top of the base game —
> new meta systems (score, save/resume, run archive, medals gallery, settings, objectives),
> new content (2 blueprints, 13 deck cards, 3 hostile classes, a boss, 5 relics, 2 weathers,
> a 6th map archetype, 2 sectors) and a long tail of polish. Every single one is catalogued in
> [`IMPROVEMENTS.md`](./IMPROVEMENTS.md).

## Source layout

The game logic is written in **TypeScript**, split by concern under `src/`:

| File | Responsibility |
| --- | --- |
| `main.ts` | boot, resize handling, fixed-60Hz game loop, save/resume, auto-pause, test hook |
| `types.ts` | shared data structures |
| `utils.ts` | DOM `$`, PRNG, math, formatting, color shading (`shade`/`shadeA`), safe localStorage |
| `data.ts` | tower blueprints, the circuit-deck card pool, relics, enemy archetypes, sector templates, speeds, objectives |
| `deck.ts` | **Slay-the-Spire style card engine**: draw/hand/discard/exhaust piles, hand recycling, curses, keywords (exhaust, ethereal, retain, innate, consume), card play resolution, mulligan |
| `state.ts` | central mutable game state `S` + `freshState()` run factory |
| `view.ts` | canvas bindings + viewport bookkeeping |
| `audio.ts` | Web Audio synth (zero external assets) |
| `world.ts` | procedural world-route graph |
| `sectors.ts` | **route-network generation**: 6 archetypes (grid, radial, river, web, loops, **spiral**), graph post-processing (connectivity, crossings), foundations, pathfinding |
| `economy.ts` | resources, costs, salvage, grid, **score** |
| `towers.ts` | unit stats, targeting, placement, **integrity + veterancy + sell-all/upgrade-all** |
| `enemies.ts` | wave composition, spawning, kills, leaks, sector clears, **objectives** |
| `sim.ts` | the fixed-60Hz simulation step |
| `fx.ts` | particles, floating text, rings |
| `render.ts` | battlefield canvas rendering + baked static layers (roads/grid/scorch) |
| `hud.ts` | DOM HUD: chips, phase bar, cards, unit panel, toasts, medals/archive/settings modals |
| `draft.ts` | salvage-cache draft offers (with a SKIP option) |
| `modals.ts` | modal open/close plumbing + generic confirm dialogs |
| `worldmap.ts` | world-route canvas + travel |
| `reset.ts` | sector deployment/rebuild + new-run flow |
| `persist.ts` | **run auto-save/resume, settings, history, best score** |
| `end.ts` | victory / defeat screens (score, seed, history) |
| `input.ts` | pointer, deck buttons, hotkeys |
| `index.template.html` | the HTML/CSS shell (contains the `//__BUNDLE_JS__` marker) |

## Build

```sh
npm install
npm run build      # typecheck (tsc) + bundle (esbuild) → index.html
```

The build inlines the bundled JavaScript into `src/index.template.html` and writes
`index.html` — the only file you need to ship. The HTML/CSS shell is byte-identical
to the pre-split single-file version; only the script body comes from the TS sources.

## Scripts

```sh
npm run build       # typecheck + bundle into index.html
npm run typecheck   # tsc --noEmit only
npm run serve       # static server (http://0.0.0.0:4173) for previewing
npm test            # headless jsdom smoke test of the built index.html
npm run gencheck    # generator quality check: 400 seeds, asserts crossings/loops/spawns
npm run rendercheck # render harness: drives many game states, asserts no NaN coords,
                    # balanced save/restore and well-formed gradients across ~3M canvas ops
npm run balance     # formal balance proof (Z3): 16 theorems (economy + expansion
                    # content) + constant-drift guard + live-game crosscheck
                    # [needs z3-solver, dev-only]
npm run verify      # build + test + rendercheck + gencheck + balance
```

### Hard constraints this build holds to

| Constraint | How it is enforced |
| --- | --- |
| Ships as **one HTML file**, no fetches | `index.html` is fully self-contained: no `<link>`, no `<script src>`, no `@import`, no `fetch`/XHR/WebSocket. Verified booting from `file://` with all network APIs throwing. |
| **Fast** | Static road/grid/scorch layers are baked and blitted; gradients cached; no `shadowBlur` anywhere. Sim+draw costs ~0.15 ms/frame (≈1% of a 60 Hz budget) under battle load. |
| **Proven balanced** | `npm run balance` — see `scripts/balance/`. |
| **No raster images** | Zero image files in the repo and zero `data:image` URIs; every visual is canvas vector drawing, CSS, or inline SVG. |

## Feature set

A 55-card pool spanning boards, subroutines, firmware, modules and corruptions, with discard/recycle,
exhaust recovery, permanent cloning, curse trade-offs and multiple deck-cleaning strategies.
**Nine blueprints** (NEEDLE · ARC COIL · HARVESTER · FOUNDRY · RAIL · AEGIS · MORTAR · **VULCAN** ·
**PULSE CORE**), **thirteen hostile classes** (scrap · plated · swarm · regen · gilded · phase · reaver ·
titan · carrier · dread · **shrieker** · **jammer** · **annihilator**), **twenty-six relics**, two field
abilities (**SURGE** +50% rate for 8s, **WELD** +3 core + unit repair splash), **seven weather events**
(ION STORM / GRAV SHEAR / RUST WIND / SOLAR FLARE / HARD FROST / **METEOR SHOWER** / **SILICON RAIN**),
scrap-streak salvage chains, veteran elites (with perks), calibration stars every 5 levels, and **fifteen
commendation medals**. Every 5th wave is a RUSH, every 8th a TITAN, every 12th an ASSAULT led by a DREAD,
and every 24th a **SIEGE** led by an ANNIHILATOR.

**Upgrade modules** are a fourth card kind: **MODULE** cards bolt a permanent improvement onto
one deployed unit (one per unit per kind, exhausted after use). Thirteen modules — FLAMETHROWER
HEAD (Needle ignites hosts), HOLLOW-POINT AMMO (Needle armor punch), TESLA FRAME (Arc chains
harder), HYDRAULIC GRASP (Harvester captures faster), SMELTER BELLY (Foundry output + aura
damage), RAILGUN COIL (Rail ignores armor), FRAG SHELLS (Mortar splash), CRYO GRID (Aegis slows
harder), STATIC GRID (Aegis zaps), RANGEFINDER SCOPE (+35% range), OVERVOLT CAPACITOR (+20%
rate), **TUNGSTEN BARRELS** (Vulcan rate + armor punch) and **RESONANCE CHAMBER** (Pulse radius
+ damage). Install by tapping a unit with the module selected, or via the INSTALL button in the
unit panel.

**Targeted skills** (RECALIBRATE: selected unit +1 level, free) resolve the same way —
select the card, then tap the unit. **Card management:** with any card selected, the
**✕ DISCARD** and **♻ RECYCLE** buttons in the pile bar toss the card into the discard
pile (ethereal cards burn instead) or tear it out of the deck permanently for a 50%
matter refund.

**Unit integrity & veterancy.** Every deployed unit carries its own hull (20 + 10/level):
shrieker blasts and stray meteors chew it away, WELD / FIELD PATCH repair it, and zero integrity
scraps the unit for a 50% refund. Units also track kills — every 10 kills earns +2% damage
(V1–V5, max +10%).

**Sector objectives.** Each sector rolls a bonus objective (sealed hull · capture quota ·
blitz launch · no unit losses) paid in grid, matter and score; it's pinned in the top-right chip.

**Run meta.** Score everywhere (kills, captures, waves, streaks, medals, objectives); runs
auto-save and resume after a refresh; a run archive records the last 10 runs, relic ledger and
a blueprint/hostile codex; the settings modal persists volume, shake, particle density,
scanlines, auto-pause, UI scale, confirm-recycle, colorblind mode, high contrast, damage
numbers and hand sorting; DAILY SEED and REROLL start fresh runs from the settings menu.

## Procedural level generation

Each sector is a small **route network** (a connected graph), not a single path:

- **Six archetypes** chosen by seed — jittered **grids** (cell loops, diagonal X-crossings),
  **radial webs** (ring + spokes + chords across the ring), **winding rivers** (a wavy spine
  with cut-back chords and a side gate), **organic webs** (nearest-neighbor + random chords),
  **roundabout switchbacks** (a chain of tight multi-loop cells with off-ramp links), and
  **spirals** (an Archimedean arm whose chords cross back over every turn).
- **1–3 spawn gates** per sector; every wave's enemies round-robin across the gates, so attacks
  converge on the CORE from several directions (swarms sometimes take jittered near-shortest
  routes and wander the scenic loops).
- **Loops and crossings** are first-class: the graph post-processor guarantees connectivity,
  and the generator asserts at least one proper road crossing per map.
- Foundations are placed clear of every road and junction; the fallback pass loosens the margin
  if the strict pass starves.

Verify with `npm run gencheck` (400 seeds, currently 100% crossings / 100% loops / 100% multi-spawn).

## Balance verification

The game is **formally verified in Z3/SMT** rather than only playtested — see
`scripts/balance/README.md`. Sixteen theorems are discharged over the whole
parameter domain using exact rational arithmetic:

- **Economy (T1–T10):** no money pump, no upgrade-then-recycle pump,
  upgrade efficiency decays monotonically, wave HP strictly increases, a fixed
  build eventually loses, bounty can't fund runaway growth, capture is better
  but bounded, grid caps board state, early-launch is priced, foundry payback
  is positive and finite.
- **Expansion content (T11–T16):** VULCAN/PULSE CORE pool parity vs NEEDLE at
  every level, added hostile classes stay inside a constant multiple of the
  wave-HP formula, ANNIHILATOR regen < on-curve NEEDLE DPS, JAMMER penalty is
  bounded and its host always killable, METEOR SHOWER can never solo the game,
  every new multiplier is capped, and the matter-printing cards are one-shot
  bounded injections with no pump loop.

A constant-extractor re-reads every balance-critical number straight from
`src/*.ts` and fails the build if the proof drifts from the game; a crosscheck
drives the shipped build in jsdom to confirm the live formulas match the model.

## Rendering

The battlefield is drawn on a single 2D canvas at a fixed 60Hz. Presentation is layered:

- **Baked static layers.** The road network (seven stroke passes), the survey grid and the
  kill-site **scorch decals** are static for a given sector + viewport: each is rendered once
  into an offscreen canvas and blitted per frame. They are keyed on `S.sectorGen`
  (bumped by `genSector()`) plus size/DPR, so regenerating or resizing a sector invalidates them.
  (The old background skyscraper silhouettes were removed — their flat, billboarded perspective
  read wrong against the isometric-leaning battlefield, and the sector-tinted gradient + forge
  haze carry the depth on their own.)
- **Cached gradients.** Gradients resolve against the transform in effect when they are *used*,
  so any gradient with constant local coordinates (tower chassis, core housing, spawn gates) is
  built once via `lgrad()`/`rgrad()` and reused, keeping the loop allocation-free.
- **Live passes only for motion:** flow chevrons, embers, weather overlays, projectiles,
  particles, beams, floating text and the phase/danger overlays.

Net result: the richer art is *cheaper* per frame than the flat version it replaced
(~630 vs ~652 canvas ops/frame under battle load).

## Controls

`1-4` draft picks · `1-9` hand cards · `SPACE` launch · `M` salvage doctrine · `T` targeting ·
`E` cycle units · `P` pause · `+/-` speed · `U` upgrade · `X` recycle · `Z` undo placement ·
`C` copy doctrine to sister units · `R` retreat · `D` circuit ledger · `ESC`/`RMB` deselect /
close modal · drag &amp; release to deploy — invalid spots snap to the nearest foundation.
Tap a hostile to pin its readout. ⇄ MULLIGAN redraws the opening hand once per sector.
