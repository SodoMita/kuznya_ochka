# FORGE//ZERO — visual direction (chosen: simplified 3 + 2)

Direction locked: **vector tactical-terminal battlefield** (simplified concept 3)
+ **structured card faces** (simplified concept 2). No textures, no baked shaders,
no grain/foil/bloom — everything is flat strokes and 1px borders, implementable
today with the existing canvas renderer + plain CSS. Textures / baked-shader
variants of these effects can be runtime-generated later, once the foundation
and layout are solid — explicitly out of scope for now.

## Reference images

| File | Role |
|------|------|
| `06_simplified_combined.png` | **Target look** — full screen, simplified terminal style |
| `07_simplified_cards.png` | **Card spec sheet** — anatomy of the new card face |
| `00_current_look.png` | Baseline (current) |
| `02_card_redesign.png`, `03_crt_terminal_style.png` | Original richer explorations (source of the direction) |
| `01…`, `04…`, `05…` | Parked: texture/atmosphere/sprite passes for later |

## Battlefield (render.ts) — terminal style, flat only

- Very faint 1px grid etching on the ground (hex or square), barely visible —
  a few polyline strokes per frame or one cached offscreen stroke pass; no noise.
- Roads: clean double-stroke lanes with amber-tinted outlines + dashed centerline
  (already close to current; mostly a palette/weight tune).
- Junction nodes as small filled dots; spawn gates keep their marks.
- Foundations: simple grey octagon outlines (as now, slightly thinner).
- CORE: hexagon with thin teal double outline, ONE soft glow (single
  `shadowBlur` pass on the hex only — no full-screen bloom).
- Enemies/towers stay schematic glyphs; thin teal range circles.
- NOT doing now: scanlines, noise, barrel distortion, CRT frame, textures.

## Cards (index.template.html + hud.ts) — spec from `07_simplified_cards.png`

Anatomy, top to bottom (all plain CSS):
1. **Ribbon** — diagonal-cut top strip (single `clip-path: polygon(...)`),
   card-type color (BOARD steel / SUBROUTINE teal / FIRMWARE gold / CORRUPTION purple),
   tiny letter-spaced type label + condensed name.
2. **Icon zone** — centered one-color line-art schematic (existing inline SVGs,
   enlarged, `stroke` in card color; max a few strokes).
3. **Body** — two lines of tiny monospace rules text.
4. **Keyword tags** — stamped labels with 1px borders (EXHAUST / RETAIN / ETHEREAL…).
5. **Cost chips** — small flat hexagons (`clip-path`) with numbers in resource colors.

States:
- **Selected**: 1px teal outline + slight lift (exists; just re-tune).
- **Unaffordable**: flat red diagonal hazard-stripe overlay via
  `repeating-linear-gradient(45deg, …)` at low alpha + dimming — replaces the
  current 50% opacity, reads much faster.

## Order of work
1. Card face restructure (pure CSS/HTML in `index.template.html`, minor `hud.ts`).
2. Battlefield palette/stroke pass in `render.ts` (grid etch, road strokes, core hex).
3. Later (out of scope now): runtime-generated texture/shader-bake variants.
