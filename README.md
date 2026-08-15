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

## Source layout

The game logic is written in **TypeScript**, split by concern under `src/`:

| File | Responsibility |
| --- | --- |
| `main.ts` | boot, resize handling, fixed-60Hz game loop |
| `types.ts` | shared data structures |
| `utils.ts` | DOM `$`, PRNG, math, formatting, color shading (`shade`/`shadeA`) |
| `data.ts` | tower blueprints, the circuit-deck card pool, relics, enemy archetypes, sector templates, speeds |
| `deck.ts` | **Slay-the-Spire style card engine**: draw/hand/discard/exhaust piles, hand recycling, curses, keywords (exhaust, ethereal, retain, innate, consume), card play resolution |
| `state.ts` | central mutable game state `S` |
| `view.ts` | canvas bindings + viewport bookkeeping |
| `audio.ts` | Web Audio synth (zero external assets) |
| `world.ts` | procedural world-route graph |
| `sectors.ts` | **route-network generation**: 4 archetypes (grid, radial, river, web), graph post-processing (connectivity, crossings), foundations, pathfinding |
| `economy.ts` | resources, costs, salvage, grid |
| `towers.ts` | unit stats, targeting, placement |
| `enemies.ts` | wave composition, spawning, kills, leaks, sector clears |
| `sim.ts` | the fixed-60Hz simulation step |
| `fx.ts` | particles, floating text, rings |
| `render.ts` | battlefield canvas rendering + baked static layers (roads/grid/skyline) |
| `hud.ts` | DOM HUD: chips, phase bar, cards, unit panel, toasts |
| `draft.ts` | salvage-cache draft offers |
| `modals.ts` | modal open/close plumbing |
| `worldmap.ts` | world-route canvas + travel |
| `reset.ts` | sector deployment/rebuild |
| `end.ts` | victory / defeat screens |
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
npm run balance     # formal balance proof (Z3): 10 economy theorems + constant-drift
                    # guard + live-game crosscheck   [needs z3-solver, dev-only]
npm run verify      # build + test + rendercheck + gencheck + balance
```

### Hard constraints this build holds to

| Constraint | How it is enforced |
| --- | --- |
| Ships as **one HTML file**, no fetches | `index.html` is fully self-contained: no `<link>`, no `<script src>`, no `@import`, no `fetch`/XHR/WebSocket. Verified booting from `file://` with all network APIs throwing. |
| **Fast** | Static road/grid/skyline layers are baked and blitted; gradients cached; no `shadowBlur` anywhere. Sim+draw costs ~0.15 ms/frame (≈1% of a 60 Hz budget) under battle load. |
| **Proven balanced** | `npm run balance` — see `scripts/balance/`. |
| **No raster images** | Zero image files in the repo and zero `data:image` URIs; every visual is canvas vector drawing, CSS, or inline SVG. |

## Feature set

<<<<<<< HEAD
A 43-card pool spanning boards, subroutines, firmware and corruptions, with discard/recycle,
exhaust recovery, permanent cloning, curse trade-offs and multiple deck-cleaning strategies.
Six blueprints (NEEDLE · ARC COIL · HARVESTER · FOUNDRY · RAIL · AEGIS), nine hostile
classes (scrap · plated · swarm · regen · gilded · phase · titan · carrier · dread), eighteen
relics, two field abilities (**SURGE** +50% rate for 8s, **WELD** +3 core), weather events
(ION STORM / GRAV SHEAR / RUST WIND), scrap-streak salvage chains, veteran elites, calibration
stars every 5 levels, and ten commendation medals. Every 5th wave is a RUSH, every 12th an
ASSAULT led by a DREAD.
=======
Seven blueprints (NEEDLE · ARC COIL · HARVESTER · FOUNDRY · RAIL · AEGIS · MORTAR), ten hostile
classes (scrap · plated · swarm · regen · gilded · phase · reaver · titan · carrier · dread),
twenty-one relics, two field abilities (**SURGE** +50% rate for 8s, **WELD** +3 core), weather
events (ION STORM / GRAV SHEAR / RUST WIND / SOLAR FLARE / HARD FROST), scrap-streak salvage
chains, veteran elites, calibration stars every 5 levels, and eleven commendation medals. Every
5th wave is a RUSH, every 12th an ASSAULT led by a DREAD.

**Upgrade modules** are a fourth card kind: **MODULE** cards bolt a permanent improvement onto
one deployed unit (one per unit per kind, exhausted after use). Eleven modules — FLAMETHROWER
HEAD (Needle ignites hosts), HOLLOW-POINT AMMO (Needle armor punch), TESLA FRAME (Arc chains
harder), HYDRAULIC GRASP (Harvester captures faster), SMELTER BELLY (Foundry output + aura
damage), RAILGUN COIL (Rail ignores armor), FRAG SHELLS (Mortar splash), CRYO GRID (Aegis slows
harder), STATIC GRID (Aegis zaps), RANGEFINDER SCOPE (+35% range) and OVERVOLT CAPACITOR (+20%
rate). Install by tapping a unit with the module selected, or via the INSTALL button in the
unit panel.

**Targeted skills** (RECALIBRATE: selected unit +1 level, free) resolve the same way —
select the card, then tap the unit. **Card management:** with any card selected, the
**✕ DISCARD** and **♻ RECYCLE** buttons in the pile bar toss the card into the discard
pile (ethereal cards burn instead) or tear it out of the deck permanently for a 50%
matter refund.

**MORTAR** is a seventh blueprint: lobbed shells that deal 60% area splash within 34px (halved
armor), making it the swarm answer. **REAVERS** are a tenth hostile class — heavy 50%-armor
linebreakers that roll from wave 6 and dominate the new REAVER SLAG sector. A fifth map
archetype (**roundabout switchbacks**) joins the generator's grid/radial/river/web set.
>>>>>>> origin/arena/01a0045e-kuznya-ochka

## Procedural level generation

Each sector is a small **route network** (a connected graph), not a single path:

- **Five archetypes** chosen by seed — jittered **grids** (cell loops, diagonal X-crossings),
  **radial webs** (ring + spokes + chords across the ring), **winding rivers** (a wavy spine
  with cut-back chords and a side gate), **organic webs** (nearest-neighbor + random chords),
  and **roundabout switchbacks** (a chain of tight multi-loop cells with off-ramp links).
- **1–3 spawn gates** per sector; every wave's enemies round-robin across the gates, so attacks
  converge on the CORE from several directions (swarms sometimes take jittered near-shortest
  routes and wander the scenic loops).
- **Loops and crossings** are first-class: the graph post-processor guarantees connectivity,
  and the generator asserts at least one proper road crossing per map.
- Foundations are placed clear of every road and junction; the fallback pass loosens the margin
  if the strict pass starves.

Verify with `npm run gencheck` (400 seeds, currently 100% crossings / 100% loops / 100% multi-spawn).

## Balance verification

The economy is **formally verified in Z3** rather than only playtested — see
`scripts/balance/README.md`. Ten theorems (no money pump, no runaway snowball,
monotone difficulty, grid-bounded board state, …) are discharged over the whole
parameter domain using exact rational arithmetic. A constant-extractor keeps
the model pinned to `src/*.ts`, and a crosscheck drives the built game to
confirm the shipped build really obeys the proven formulas.

## Rendering

The battlefield is drawn on a single 2D canvas at a fixed 60Hz. Presentation is layered:

- **Baked static layers.** The road network (seven stroke passes), the survey grid and the
  ruined skyline are static for a given sector + viewport, so each is rendered once into an
  offscreen canvas and blitted per frame. They are keyed on `S.sectorGen` (bumped by
  `genSector()`) plus size/DPR, so regenerating or resizing a sector invalidates them.
- **Cached gradients.** Gradients resolve against the transform in effect when they are *used*,
  so any gradient with constant local coordinates (tower chassis, core housing, spawn gates) is
  built once via `lgrad()`/`rgrad()` and reused, keeping the loop allocation-free.
- **Live passes only for motion:** flow chevrons, beacons, embers, projectiles, particles,
  beams, floating text and the phase/danger overlays.

Net result: the richer art is *cheaper* per frame than the flat version it replaced
(~630 vs ~652 canvas ops/frame under battle load).

## Controls

`1-4` blueprints · `SPACE` launch · `M` salvage doctrine · `T` targeting · `E` cycle units ·
`P` pause · `+/-` speed · `U` upgrade · `X` recycle · `ESC`/`RMB` deselect ·
drag &amp; release to deploy — invalid spots snap to the nearest foundation.
