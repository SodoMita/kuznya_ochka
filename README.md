# kuznya_ochka — FORGE//ZERO

Robot card tower defense ("forge of points"). The whole game ships as a **single static `index.html`** —
open it in any browser and play. No server, no build step required to play.

## Source layout

The game logic is written in **TypeScript**, split by concern under `src/`:

| File | Responsibility |
| --- | --- |
| `main.ts` | boot, resize handling, fixed-60Hz game loop |
| `types.ts` | shared data structures |
| `utils.ts` | DOM `$`, PRNG, math, formatting |
| `data.ts` | cards, relics, enemy archetypes, sector templates, speeds |
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
| `render.ts` | battlefield canvas rendering |
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
```

## Feature set

Six blueprints (NEEDLE · ARC COIL · HARVESTER · FOUNDRY · RAIL · AEGIS), nine hostile
classes (scrap · plated · swarm · regen · gilded · phase · titan · carrier · dread), eighteen
relics, two field abilities (**SURGE** +50% rate for 8s, **WELD** +3 core), weather events
(ION STORM / GRAV SHEAR / RUST WIND), scrap-streak salvage chains, veteran elites, calibration
stars every 5 levels, and ten commendation medals. Every 5th wave is a RUSH, every 12th an
ASSAULT led by a DREAD.

## Procedural level generation

Each sector is a small **route network** (a connected graph), not a single path:

- **Four archetypes** chosen by seed — jittered **grids** (cell loops, diagonal X-crossings),
  **radial webs** (ring + spokes + chords across the ring), **winding rivers** (a wavy spine
  with cut-back chords and a side gate), and **organic webs** (nearest-neighbor + random chords).
- **1–3 spawn gates** per sector; every wave's enemies round-robin across the gates, so attacks
  converge on the CORE from several directions (swarms sometimes take jittered near-shortest
  routes and wander the scenic loops).
- **Loops and crossings** are first-class: the graph post-processor guarantees connectivity,
  and the generator asserts at least one proper road crossing per map.
- Foundations are placed clear of every road and junction; the fallback pass loosens the margin
  if the strict pass starves.

Verify with `npm run gencheck` (400 seeds, currently 100% crossings / 100% loops / 100% multi-spawn).

## Controls

`1-4` blueprints · `SPACE` launch · `M` salvage doctrine · `T` targeting · `E` cycle units ·
`P` pause · `+/-` speed · `U` upgrade · `X` recycle · `ESC`/`RMB` deselect ·
drag &amp; release to deploy — invalid spots snap to the nearest foundation.
