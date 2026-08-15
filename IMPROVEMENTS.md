# FORGE//ZERO — 100 big + 100 small improvements

Every entry below is a real, shipped change in this build.

- **BIG (B001–B100)** = new systems, new content, or a visible mechanic change
  (a feature a player can point at).
- **SMALL (S001–S100)** = micro-fixes, polish, clarity and hardening — one line to one
  function of code each, but each one independently verifiable in the diff.

All changes keep the hard constraints intact (single self-contained HTML, no network, no
raster images, baked render layers, formal-balance constant pins). Verified by
`npm run build && npm test && npm run rendercheck && npm run gencheck && npm run constraints`.

---

## BIG — 100

### Run meta, persistence & progression (B001–B016)

| # | Improvement | What it does |
| --- | --- | --- |
| B001 | Seed control | Runs are seeded and reproducible; the seed is shown in the settings modal and the end screen. |
| B002 | Auto-save & resume | The run serializes to localStorage on wave launch, wave clear, drafts and deploys; booting restores it (unit-coordinate towers survive viewport changes). |
| B003 | Run history ledger | The last 10 runs (seed, outcome, wave, score, kills, date) are recorded and browsable in the archive modal. |
| B004 | Score system | Kills, captures, waves, streaks, medals and objectives feed a live score chip; the best score persists. |
| B005 | Endless escalation | After all 12 sectors fall, victory offers endless escalation with waves compounding forever. |
| B006 | Medals gallery | A dedicated modal shows all 15 commendations, earned and unearned, with per-medal criteria tooltips. |
| B007 | Relic ledger | The archive lists every owned relic with its description and the full collection count. |
| B008 | Blueprint & hostile codex | Every blueprint (with current rank, DPS and deck count) and every hostile class (with stats) is documented in-game. |
| B009 | Settings modal | One panel for volume, shake, particles, scanlines, auto-pause, UI scale, confirm-recycle, colorblind, contrast, damage numbers and hand sorting — all persisted. |
| B010 | Daily seed | A deterministic UTC-date seed lets everyone race the same route. |
| B011 | New-run flow | REROLL and DAILY confirm dialogs abandon the current run safely and regenerate the whole campaign. |
| B012 | Score medal | OVERCLOCKED commendation at 10,000 score. |
| B013 | New medals | HOARDER (5 relics), UNBREACHABLE (no-leak sector), IRON FOREST (10 units at once) round the set to 15. |
| B014 | Sector bonus objectives | Every sector rolls one objective (sealed hull / capture quota / blitz launch / zero unit loss) with a real reward and a pinned HUD chip. |
| B015 | Redeploy & farm cleared sectors | The world map allows revisiting cleared sectors; waves keep escalating (noted in the map info). |
| B016 | Retreat | [R] or the map's RETREAT button abandons sector progress while keeping the deck, ranks, relics and routes. |

### Player-facing settings & accessibility (B017–B026)

| # | Improvement | What it does |
| --- | --- | --- |
| B017 | Master volume | A slider drives the Web Audio master gain (persisted). |
| B018 | Screen-shake toggle | Real JS-level gate on `shake()` — not just CSS. |
| B019 | Particle density | Three budgets (120 / 300 / 600 particles) tuned per frame. |
| B020 | Scanlines toggle | The CRT overlay turns off via a body class. |
| B021 | Auto-pause on tab hide | The sim pauses when the tab loses focus (opt-out). |
| B022 | UI scale | Root font scaling at 1× / 1.15× / 1.3×. |
| B023 | Colorblind mode | Shape-coded diamond capture markers + a high-separation palette. |
| B024 | High-contrast theme | Brighter ink and stronger outlines via CSS variables. |
| B025 | Damage numbers toggle | Per-hit floating digits, on by default, one switch off. |
| B026 | Hand auto-sort | Boards → skills → powers → modules → curses, stable, toggleable. |

### Towers, modules & integrity (B027–B044)

| # | Improvement | What it does |
| --- | --- | --- |
| B027 | Unit integrity system | Towers carry 20 + 10/level hull, damage sources, visual bars, repair paths and 50%-refund destruction. |
| B028 | WELD repair splash | The WELD ability now also patches +4 integrity on every deployed unit. |
| B029 | FIELD PATCH subroutine | Restores every unit to full integrity. |
| B030 | Upgrade heals | The integrity delta from level-ups and integrity powers is healed into the new max. |
| B031 | SELF-HEALING HULL relic | Units regenerate 1 integrity/s. |
| B032 | ARMORED MOUNTS relic | +40% unit integrity. |
| B033 | SHIELD GRID firmware | +25% unit integrity this sector (heals on install). |
| B034 | Unit veterancy | Kills are tracked per unit: +2% damage per 10 kills, V1–V5 badges, capped +10%. |
| B035 | Unit combat ledger | The unit panel reports integrity, kills, captures and total damage dealt. |
| B036 | Per-tower damage accounting | Every damage path (shots, chains, splash, zaps, rasps) credits the firing unit. |
| B037 | VULCAN blueprint | 8th tower — twin gatling at 9 shots/s, the swarm shredder. |
| B038 | PULSE CORE blueprint | 9th tower — periodic radial blast with charge-up arc and no barrel. |
| B039 | TUNGSTEN BARRELS module | Vulcan: +25% fire rate and 30% armor punch. |
| B040 | RESONANCE CHAMBER module | Pulse: blast radius +45% and damage +20%. |
| B041 | BOREHEAD GATLINGS relic | Vulcan fire rate +15%. |
| B042 | PULSE CATALYST relic | Pulse blasts fire 20% more often. |
| B043 | Undo placement | [Z] refunds the last board 100% and returns its card to the hand (works from discard or exhaust). |
| B044 | Sell-all & upgrade-all | Blueprint-wide scrap (with confirm + GRID RECLAIMER bonus) and one-level-each batch upgrades. |

### Hostiles & combat (B045–B056)

| # | Improvement | What it does |
| --- | --- | --- |
| B045 | SHRIEKER hostile | Kamikaze darts that detonate on death, shredding nearby unit integrity. |
| B046 | JAMMER hostile | Interference dish that quarters the fire rate of every unit within 70px until destroyed (with visual aura). |
| B047 | ANNIHILATOR boss | Every 24th wave becomes a SIEGE: armored regenerating walker that births scrap escorts, leaks 8, and drops a relic on death. |
| B048 | Veteran perks | Veterans roll fast / tough / regen perks, telegraphed with F/T/R letters. |
| B049 | Enemy inspection | Tapping a hostile pins a live readout: HP, armor, regen, veteran status and bounty estimate. |
| B050 | Wave preview | The fabrication window shows the next two waves' compositions plus a 1–5 threat rating. |
| B051 | METEOR SHOWER weather | Periodic sky-fire strikes hostiles for 15% hull; rare stray hits nick your units. |
| B052 | SILICON RAIN weather | +30% silicon salvage while it lasts. |
| B053 | Weather visual overlays | Ion flickers, rust streaks, frost rims, solar glow, silicon dust and meteor streaks render per weather. |
| B054 | Scorch-mark decals | Kill sites bake into the ground as a capped, sector-scoped layer. |
| B055 | Armor notches on HP bars | Armored hostiles show plate notches on their hull bars. |
| B056 | Captured shriekers disarm | Capturing a shrieker intact denies its explosion (rewards the capture doctrine). |

### The deck & drafts (B057–B073)

| # | Improvement | What it does |
| --- | --- | --- |
| B057 | GRAVITY WELL | Drags every hostile 70px back and slows them 40% for 3s. |
| B058 | NANO SWARM | Corrodes every hostile for 30 damage over 4s. |
| B059 | CIRCUIT BREAKER | Stuns the entire field for 2s (new stun mechanic + sparkle FX). |
| B060 | ORE VEIN | Prints +40 Fe +20 Cu. |
| B061 | SALVAGE BOND | Pays 6 Fe per wave cleared this sector — a growing economy card. |
| B062 | WRECKING BALL | Scraps your weakest unit for a 100% matter refund. |
| B063 | ASSEMBLY CALL | Fetches up to 2 circuit boards straight from the draw pile. |
| B064 | OVERCHARGE | The next board printed deploys at level 2. |
| B065 | SCAVENGER DRONE | Firmware: +12% salvage from every source. |
| B066 | REPULSOR FIELD | Firmware: hostiles march 8% slower. |
| B067 | BLUEPRINT EFFICIENCY | Firmware: circuit boards cost 10% less matter. |
| B068 | Draft SKIP | A 4th offer declines the cache for +15 Fe. |
| B069 | Draft owned-counts | Card offers show how many copies you already field. |
| B070 | Draft keyboard support | 1–4 picks from the keyboard; ESC declines. |
| B071 | Free per-sector mulligan | ⇄ MULLIGAN redraws the whole opening hand once per sector (ethereal cards burn). |
| B072 | Draft relic medal | Owning 5 relics at once triggers the HOARDER commendation. |
| B073 | Grid capacity preview | `gridCap()`/`usedGrid()` chip warnings at ≥90% usage. |

### Sectors, world & generation (B074–B080)

| # | Improvement | What it does |
| --- | --- | --- |
| B074 | SPIRAL map archetype | 6th generator: an Archimedean arm whose chords cross back over every turn — guaranteed loops + crossings. |
| B075 | NULL HORIZON sector | 9th template: silicon-heavy phase-shifter belt. |
| B076 | OBSIDIAN VEINS sector | 10th template: copper-rich plated hell. |
| B077 | Hazard-colored map codes | World-map sector codes are tinted per hazard type. |
| B078 | Map hover highlight | Hovering a node highlights it before the click-to-inspect step. |
| B079 | Animated live routes | Cleared world-route edges flow with marching dashes. |
| B080 | Map node info | Revisited cleared sectors are flagged ("waves escalate on revisit"). |

### UX, feedback & confirmation (B081–B090)

| # | Improvement | What it does |
| --- | --- | --- |
| B081 | Toast queue | Toasts queue up to 3 deep with message-length-aware timing instead of overwriting. |
| B082 | Medal notification badge | The ★ button pulses while unviewed commendations wait. |
| B083 | Chip change pulses | Resource, grid, core and score chips pulse when their values change. |
| B084 | Chip warnings | Grid chip warns at ≥90% usage; the core chip pulses red below 35%. |
| B085 | Confirm dialogs | A generic confirm modal guards tower recycling, card tearing, sell-all, retreat and reroll (recycle confirms opt-in). |
| B086 | Pause state label | The pause button reflects ▶ RESUME / ❚❚ PAUSE. |
| B087 | TURBO indicator | 100× speed is flagged on the speed chip and sector name. |
| B088 | Objective chip | The sector objective lives in a persistent top-right chip with ✓/◇ state. |
| B089 | ESC closes top modal | Modal stack closes top-down; the end screen is protected from accidental dismissal. |
| B090 | Focus handling | Modals focus their first button; hotkeys go silent while typing in inputs. |

### Rendering & juice (B091–B095)

| # | Improvement | What it does |
| --- | --- | --- |
| B091 | New tower art | Vulcan twin gatling (spinning drum) and Pulse resonator (charge-up arc, violet bloom). |
| B092 | New hostile art | Shrieker dart, jammer hex-dish, annihilator siege hulk with crown reactor and wider boss HP bar. |
| B093 | Placement & spawn juice | Towers drop in with dust; spawn gates flash a portal ring per spawn. |
| B094 | Ghost help | An invalid ghost now labels why: "NO FOUNDATION". |
| B095 | Integrity bars on units | Damaged units show a color-graded integrity bar over the chassis. |

### Verification & engineering (B096–B100)

| # | Improvement | What it does |
| --- | --- | --- |
| B096 | Deterministic debug hook | `window.__FZ` exposes state + deploy/spawn/save/load helpers for the harnesses. |
| B097 | Extended rendercheck | The harness now drives VULCAN, PULSE, shrieker, jammer, annihilator, meteor/silicon weather, integrity bars and inspection (~3.3M canvas ops, no NaN). |
| B098 | Extended smoke test | Covers mulligan, undo, medals, archive, settings, confirm dialogs, ESC modal, draft skip and auto-save. |
| B099 | Save/load roundtrip assertions | The smoke test mutates state, saves, restores and asserts fidelity. |
| B100 | Gencheck on 6 archetypes | 400 seeds: still 100% crossings, 100% loops, 100% multi-spawn with the spiral in the rotation. |

---

## SMALL — 100

### Documentation & hygiene (S001–S010)

| # | Improvement |
| --- | --- |
| S001 | Fixed the README merge-conflict block (merged both branch descriptions into one accurate feature list). |
| S002 | Removed the dead `.offer:hover.rarwap` CSS selector. |
| S003 | De-duplicated the merged `#deckList`/`.mini` CSS blocks down to one set. |
| S004 | Removed the no-op `ctx.rotate(0)` in `drawTower`. |
| S005 | README controls, scripts and feature counts updated to match the new build. |
| S006 | RELIC description fixed: TRACTION TREADS now reads 55% → 72%, matching the code. |
| S007 | OVERCHARGE card description fixed to match its actual persistent behavior. |
| S008 | Help manual updated: nine blueprints, thirteen classes, integrity, objectives, new circuitry, Z/C/R hotkeys. |
| S009 | Every improvement in this build is catalogued in `IMPROVEMENTS.md`. |
| S010 | Balanced-constant pins (`extract_constants.mjs`) left byte-identical — the Z3 proof still binds to the game. |

### Determinism & correctness (S011–S025)

| # | Improvement |
| --- | --- |
| S011 | Enemy HP jitter is seeded per spawn (stable across game speeds) instead of sampling `S.time`. |
| S012 | `S.streak` resets when deploying into a sector. |
| S013 | Screen flash and grid pulse clear on sector deploy. |
| S014 | Scorch decals reset on sector regeneration. |
| S015 | `spawnT`/`spawnInt` reset on sector deploy. |
| S016 | Starting Cu/Si matter scales gently with route depth (was flat). |
| S017 | World-map node pulse uses deterministic `S.time` instead of `performance.now()`. |
| S018 | `launchWave` ignores input while a modal is open. |
| S019 | `openDraft` no-ops when the run is over. |
| S020 | `showEnd` guards against double-fire; the end screen can't be ESC'd away. |
| S021 | Endless-escalation resume resets the end-screen guard so a later defeat still records. |
| S022 | Rebuild/endless correctly resets `endStatsShown`. |
| S023 | Save payload is versioned (`fz_save_v2`) and tolerant of corrupt/absent storage. |
| S024 | Resume falls back to the build phase if a saved wave has no hostiles left. |
| S025 | `routePolyline`-based enemy rebuild on resume handles viewport changes safely. |

### Number & text polish (S026–S035)

| # | Improvement |
| --- | --- |
| S026 | Salvage floats no longer print "+26.0Fe" — trailing ".0" is trimmed via `fmtF`. |
| S027 | New `fmtF` helper centralizes trimmed fixed-point formatting. |
| S028 | Toast duration scales with message length (1.2s–3s). |
| S029 | Floating-text pool is capped at 80 so late-game spam can't overflow. |
| S030 | Empty-hand state now points at [D] LEDGER. |
| S031 | Card bodies carry their full description as a hover tooltip. |
| S032 | Targeting chips get doctrine tooltips (furthest/closest/strongest/…). |
| S033 | Module chips in the unit panel get description tooltips. |
| S034 | Medals button tooltip reports earned/total count. |
| S035 | Draft rank offers display the current Mk level, not just the next one. |

### Storage & persistence hardening (S036–S044)

| # | Improvement |
| --- | --- |
| S036 | `storeGet`/`storeSet` wrap localStorage with an in-memory fallback (file://, jsdom, private mode). |
| S037 | Towers save in unit coordinates so saves survive window resizes. |
| S038 | Enemies save their route node ids and rebuild pixel polylines on resume. |
| S039 | Run saves clear on defeat (rebuild keeps meta progress, not the lost board). |
| S040 | Settings survive a seed reroll (only the run is wiped). |
| S041 | History is truncated to 10 entries and formatted with HH:MM dates. |
| S042 | Daily seed derives from UTC yyyymmdd — stable across timezones. |
| S043 | Best score loads on boot and updates live. |
| S044 | `clearSave` guards file:// origins where removal may throw. |

### Accessibility & theming details (S045–S054)

| # | Improvement |
| --- | --- |
| S045 | `aria-label`s on the icon-only buttons (map, medals, archive, sound, settings, help). |
| S046 | `focus-visible` rings preserved for keyboard players; mouse clicks stay clean. |
| S047 | UI scale applies through body font-size (cascades everywhere). |
| S048 | Scanlines toggle via `body.noscan` instead of JS style pokes. |
| S049 | Colorblind mode swaps in a shape-coded capture marker (diamond, not color alone). |
| S050 | High-contrast theme re-tunes ink/dim/line tokens rather than per-element overrides. |
| S051 | Hotkeys ignore keystrokes while focus is in an input/textarea/select. |
| S052 | Spacebar prevents page scrolling during wave launches. |
| S053 | Reduced-motion media query still neutralizes CSS animation for vestibular safety. |
| S054 | `user-select`/`-webkit-user-select` stays off on interactive chrome. |

### Combat micro-fixes (S055–S075)

| # | Improvement |
| --- | --- |
| S055 | Aegis HUD readout now includes the CRYO GRID slow bonus (was silently wrong). |
| S056 | Pulses only fire when a hostile is actually in range (no wasted FX). |
| S057 | Pulse splash halves armor like mortar shells. |
| S058 | Vulcan tungsten rounds punch 30% of armor. |
| S059 | Jammer aura checks skip dead hostiles. |
| S060 | Annihilator escort spawns cap at 60 fielded hostiles. |
| S061 | Shrieker blast damage scales up at wave 10+. |
| S062 | Meteor stray hits are capped at 1 integrity (nuisance, not a killer). |
| S063 | Meteor weather only strikes during waves. |
| S064 | Objective trackers use per-sector counters (leaks/captures/losses), never run totals. |
| S065 | Failed objectives report honestly at the wave-12 payout. |
| S066 | Objective payouts add score (+200) on top of matter/grid. |
| S067 | Early-launch objective also pays score and announces via toast. |
| S068 | Tower recycle prunes the undo stack so Z can't resurrect a scrapped unit. |
| S069 | Sell-all prunes undo entries and beam references. |
| S070 | Tower destruction (shrieker/meteor) prunes beams, undo entries and selection. |
| S071 | Destruction refunds are floored — no fractional-matter exploits. |
| S072 | WRECKING BALL deselects the scrapped unit and clears its beams. |
| S073 | Captured hostile type stats land in the per-type ledger. |
| S074 | `damageTower` floats respect the damage-numbers setting. |
| S075 | Stun suspends phase-shifter blinks too (breaker > blinkers). |

### Deck & hand micro-fixes (S076–S085)

| # | Improvement |
| --- | --- |
| S076 | The mulligan button only appears in wave-0 fabrication and hides while modals are open. |
| S077 | Mulligan burns ethereal cards into the exhaust pile instead of discarding them. |
| S078 | Hand auto-sort is stable (kind, then name) and applied after every draw/redraw. |
| S079 | `sectorShuffle` resets overcharge, mulligan and the undo stack. |
| S080 | Undo pulls the exact played card instance back from discard OR exhaust. |
| S081 | `canPlayDef` gates WRECKING BALL on having units, FIELD PATCH on damage existing. |
| S082 | Board costs honor the BLUEPRINT EFFICIENCY discount at affordability-check time. |
| S083 | The played-card instance resolves by identity, not slot index (hand-control safety). |
| S084 | ASSEMBLY CALL respects the hand cap (overflow routes to discard). |
| S085 | Ledger shows deck composition by kind and notes exhausted cards return next sector. |

### HUD & input micro-fixes (S086–S100)

| # | Improvement |
| --- | --- |
| S086 | Ability buttons dim when their matter cost is unaffordable. |
| S087 | Surge/Weld readiness text now includes affordability in the glow state. |
| S088 | Sell-all button explains itself ("single unit — use RECYCLE") when pointless. |
| S089 | Grid/cap chip updates are change-driven (no DOM churn between identical frames). |
| S090 | Sector name appends "TURBO" at 100× speed. |
| S091 | The hand signature includes unit selection so panels refresh on selection flips. |
| S092 | `drawWorld` guards zero-size canvases during modal layout. |
| S093 | Spiral fallback chords guarantee crossings even for degenerate random rolls. |
| S094 | The spiral is scaled to fit both landscape and portrait frames. |
| S095 | Smoke test asserts the save file exists after wave clear. |
| S096 | Smoke test roundtrip asserts wave and matter restore exactly. |
| S097 | Rendercheck exercises every new draw path (no NaN in 3.3M canvas ops). |
| S098 | `__FZ` hook is harmless at runtime (no network, no perf cost). |
| S099 | Particle FX all respect the density setting (burst/ring/sparks/debris/dust). |
| S100 | Pause label, speed label and doctrine label all refresh through one `hud()` path. |
