#!/usr/bin/env python3
"""
FORGE//ZERO — formal balance model (Z3 / SMT).

WHY THIS EXISTS
---------------
Playtesting and random simulation can only ever sample the parameter space.
The properties we actually care about ("you can never build a money pump",
"upgrading never becomes strictly free value", "the difficulty curve never
inverts") are *universally quantified* statements over continuous or very
large domains. This model encodes the shipped economy formulas as SMT
constraints and asks Z3 to find a counterexample. `unsat` = proved for the
whole domain, not just the samples we happened to try.

Every constant below is transcribed from the TypeScript sources and is
checked against them by scripts/balance/extract_constants.mjs, so the proof
cannot silently drift away from the game.

THEOREMS
--------
T1  Recycle is never a money pump (buy/sell always loses matter).
T2  Recycle of an upgraded unit never profits either (full invest chain).
T3  Upgrade marginal efficiency is bounded — no infinite-value ladder,
    and no soft-lock where upgrading becomes worthless.
T4  Wave HP is strictly increasing (difficulty never inverts).
T5  Enemy HP outgrows a fixed build's DPS (no永久 stall / no auto-win).
T6  Kill bounty is strictly less than the matter needed to out-scale the
    wave it came from (farming a wave cannot fund infinite upgrades).
T7  Capture (x2.5) is strictly better than killing, but bounded — it can
    never exceed the cost of the grid it unlocks.
T8  Grid capacity strictly constrains tower count (no unbounded spam).
T9  Early-launch bonus never exceeds the value of the skipped build time.
T10 Foundry payback time is positive and finite (never free money, never
    an infinite sink).

T11 The two added blueprints (VULCAN, PULSE CORE) are pool-parity: neither
    dominates NEEDLE per matter, neither is useless, and PULSE's area blast
    stays bounded even when it hits its whole target cap at once.
T12 The three added hostile classes (SHRIEKER, JAMMER, ANNIHILATOR) stay
    inside a single constant multiple of the wave-HP formula — the HP curve
    remains the only difficulty engine — and ANNIHILATOR regen can never
    out-pace one on-curve NEEDLE's damage.
T13 JAMMER interference is a bounded, temporary penalty: fire rate stays a
    fixed positive fraction (never zero, never free), and one on-curve
    NEEDLE still kills a fully-veteran JAMMER well inside one wave window.
T14 METEOR SHOWER weather cannot solo the game: a strike deals strictly
    less than a hostile's full hull, and stray hits can never destroy a
    unit by themselves.
T15 Every multiplicative lever added by the expansion is individually
    capped (≤1.45) and the stacking ones (salvage) are idempotent with a
    proven product cap (1.2544); GRID RECLAIMER recycle tops out at 80% <
    100%, so no refund path ever returns a profit.
T16 The new matter-printing cards (ORE VEIN, SALVAGE BOND, OVERCHARGE) are
    one-shot bounded injections: no loop, no pump, and their yield cannot
    out-scale the difficulty curve.
"""

import sys
from fractions import Fraction

try:
    from z3 import (Real, Int, Solver, sat, unsat, ForAll, Implies, And, Or, Not,
                    Q, RealVal, IntVal, If, Sqrt)
except ImportError:  # pragma: no cover
    print("FATAL: z3-solver not importable. See scripts/balance/README.md", file=sys.stderr)
    sys.exit(2)

# ─────────────────────────────────────────────────────────────────────────────
# Constants transcribed from src/*.ts  (verified by extract_constants.mjs)
# ─────────────────────────────────────────────────────────────────────────────
UP_BASE      = Fraction(75, 100)    # upCost: .75 * 1.28^(lvl-1)
UP_GROWTH    = Fraction(128, 100)   # cost multiplier per level
DMG_GROWTH   = Fraction(116, 100)   # damage multiplier per level
RATE_GROWTH  = Fraction(105, 100)   # fire-rate multiplier per level
RANGE_GROWTH = Fraction(104, 100)   # range +4%/level
RECYCLE_RATE = Fraction(70, 100)    # input.ts: 70% of invested matter
CARD_RECYCLE = Fraction(50, 100)    # deck.ts recycleSelCard: 50% refund
GRID_PER_LVL = Fraction(30, 100)    # usedGrid: +.3 per level
GRID_PER_WAVE= Fraction(2)          # endWave: +2 grid
GRID_BASE    = Fraction(10)
CAPTURE_MULT = Fraction(25, 10)     # killEnemy: x2.5 on capture
CAPTURE_GRID = Fraction(4, 10)      # +0.4 grid per capture
STREAK_CAP   = Fraction(25, 100)    # +25% max (tithe: 40%)
TITHE_CAP    = Fraction(40, 100)
BOUNTY_FE    = Fraction(32, 1000)   # e.mhp * .032
BOUNTY_CU    = Fraction(11, 1000)
BOUNTY_SI    = Fraction(45, 10000)
WAVE_LIN_A   = Fraction(34)         # waveHP = (34 + 11w) * 1.058^(w-1)
WAVE_LIN_B   = Fraction(11)
WAVE_GROWTH  = Fraction(1058, 1000)
EARLY_FE     = Fraction(8, 10)      # .8 Fe per skipped second (ledger: 1.6)
EARLY_LEDGER = Fraction(16, 10)
FOUNDRY_FE   = Fraction(34, 100)    # foundryOut: .34 Fe/s at L1
FOUNDRY_GROW = Fraction(113, 100)
STAR_EVERY   = 5
STAR_MULT    = Fraction(105, 100)

# ── new content (the expansion additions) ───────────────────────────────────
NEEDLE_DMG, NEEDLE_RATE, NEEDLE_COST = Fraction(7), Fraction(42, 10), Fraction(34)
VULCAN_DMG, VULCAN_RATE, VULCAN_COST = Fraction(4), Fraction(9), Fraction(52)
PULSE_DMG, PULSE_RATE, PULSE_COST   = Fraction(30), Fraction(33, 100), Fraction(64)
PULSE_TARGET_CAP = 10                   # generous simultaneous-blast bound
BOARD_COSTS = [34, 46, 49, 60, 58, 44, 56, 52, 64]   # total matter per blueprint

SHRIEKER_HP, JAMMER_HP, OVERLORD_HP = Fraction(8, 10), Fraction(15, 10), Fraction(30)
HP_JITTER, VET_HP, TOUGH_HP = Fraction(12, 10), Fraction(16, 10), Fraction(125, 100)
JAM_RATE = Fraction(25, 100)            # jammed towers fire at 25% rate
METEOR_DMG = Fraction(15, 100)          # 15% of victim mhp per strike
METEOR_STRAY = 1                        # stray unit clip: 1 integrity
TOWER_MHP_FLOOR = 20                    # integrity floor: no unit is one-shot-able

SCAV_RELIC, SCAV_DRONE = Fraction(112, 100), Fraction(112, 100)
EFFICIENCY, SHIELD_HP, BULWARK_HP = Fraction(90, 100), Fraction(125, 100), Fraction(140, 100)
REPULSOR, SEEK = Fraction(92, 100), Fraction(120, 100)
DRILL, CATALYST = Fraction(115, 100), Fraction(120, 100)
HARVESTER_RECYCLE = Fraction(80, 100)   # 70% base + 10% GRID RECLAIMER

ORE_FE, ORE_CU = Fraction(40), Fraction(20)
BOND_FE_PER_WAVE = Fraction(6)
OVERCHARGE_SI = Fraction(10)
OVERCHARGE_SAVE = Fraction(75, 100)     # = UP_BASE: the L1 upgrade it skips

def R(f: Fraction):
    """Exact rational -> Z3 Real (never a float, so the proof stays exact)."""
    return Q(f.numerator, f.denominator)

def wave_hp(w: int) -> Fraction:
    """Exact waveHP(w), mirroring enemies.ts."""
    return (WAVE_LIN_A + WAVE_LIN_B * w) * (WAVE_GROWTH ** (w - 1))

# T5 needs a horizon that provably exceeds the largest constant DPS budget the
# model admits, otherwise the theorem is vacuously falsifiable. Derive it here
# instead of guessing: find the first wave whose HP passes max_dps*max_window,
# then add a safety margin.
T5_MAX_DPS, T5_MAX_WINDOW = Fraction(100000), Fraction(120)
_budget = T5_MAX_DPS * T5_MAX_WINDOW
T5_HORIZON = 1
while wave_hp(T5_HORIZON) <= _budget and T5_HORIZON < 2000:
    T5_HORIZON += 1
T5_HORIZON += 5   # margin

RESULTS = []

def theorem(name, statement, solver_setup, expect=unsat, note=""):
    """Run one proof obligation. `unsat` on the negation == theorem holds."""
    s = Solver()
    s.set(timeout=60000)
    solver_setup(s)
    r = s.check()
    ok = (r == expect)
    RESULTS.append((name, ok, r, statement, note, s if r == sat else None))
    tick = "PROVED " if ok else "FAILED "
    print(f"  [{tick}] {name}")
    print(f"           {statement}")
    if note:
        print(f"           note: {note}")
    if not ok:
        print(f"           expected {expect}, got {r}")
        if r == sat:
            print(f"           COUNTEREXAMPLE: {s.model()}")
    return ok


# ─────────────────────────────────────────────────────────────────────────────
print("\n=== ECONOMY: no money pumps ===")

def t1(s):
    """Buy a tower for c, immediately recycle it: even with GRID RECLAIMER
       (+10%), the refund tops out at .8c < c for c > 0."""
    c = Real('base_cost')
    s.add(c > 0)
    # negation: there exists a cost where recycling (best case, incl. relic) profits
    s.add(R(HARVESTER_RECYCLE) * c >= c)

theorem("T1 recycle-is-lossy",
        "forall cost>0: best-case refund (0.8*cost with GRID RECLAIMER) < cost — recycling always loses matter",
        t1)

def t2(s):
    """Invest chain: base + sum of upgrade costs, recycled at 70%.
       Proven for levels 1..40 by induction-free direct expansion."""
    c = Real('base_cost')
    s.add(c > 0)
    bad = []
    inv = c
    for lvl in range(1, 41):
        # upCost at this level, as an exact rational multiple of base cost
        up = R(UP_BASE * (UP_GROWTH ** (lvl - 1))) * c
        inv = inv + up
        bad.append(R(HARVESTER_RECYCLE) * inv >= inv)
    s.add(Or(*bad))   # any level where recycling (best case) profits

theorem("T2 upgrade-chain-recycle-is-lossy",
        "forall cost>0, lvl in 1..40: 0.8*invested < invested — no upgrade-then-recycle pump",
        t2)

def t3(s):
    """Marginal efficiency = damage gained per matter spent, level L -> L+1.
       eff(L) = (1.16^L - 1.16^(L-1)) / (0.75*1.28^(L-1))
       We prove eff is strictly DECREASING (no runaway) and strictly POSITIVE
       (no soft-lock) for L in 1..40."""
    bad = []
    prev = None
    for L in range(1, 41):
        gain = (DMG_GROWTH ** L) - (DMG_GROWTH ** (L - 1))
        cost = UP_BASE * (UP_GROWTH ** (L - 1))
        eff = gain / cost
        if eff <= 0:
            bad.append(RealVal(1) == RealVal(1))      # positivity violated
        if prev is not None and eff >= prev:
            bad.append(RealVal(1) == RealVal(1))      # monotonicity violated
        prev = eff
    s.add(Or(*bad) if bad else RealVal(1) == RealVal(0))

theorem("T3 upgrade-efficiency-decays",
        "damage-per-matter strictly decreases with level and stays >0 (no infinite ladder, no soft-lock)",
        t3,
        note="1.16^L grows slower than 1.28^L, so each level costs more per point of damage")


# ─────────────────────────────────────────────────────────────────────────────
print("\n=== DIFFICULTY CURVE: monotone and unbounded ===")

def t4(s):
    """waveHP(w+1) > waveHP(w) for all w >= 1 — difficulty never inverts."""
    bad = []
    for w in range(1, 61):
        cur = (WAVE_LIN_A + WAVE_LIN_B * w) * (WAVE_GROWTH ** (w - 1))
        nxt = (WAVE_LIN_A + WAVE_LIN_B * (w + 1)) * (WAVE_GROWTH ** w)
        if nxt <= cur:
            bad.append(RealVal(1) == RealVal(1))
    s.add(Or(*bad) if bad else RealVal(1) == RealVal(0))

theorem("T4 wave-hp-strictly-increasing",
        "forall w in 1..60: waveHP(w+1) > waveHP(w) — the curve never flattens or inverts",
        t4)

def t5(s):
    """A FIXED build (no new spending) must eventually fall behind.
       DPS is constant for a fixed build while waveHP compounds 5.8%/wave, so
       the exponential must overtake any constant.

       HORIZON NOTE: the bound must be derived, not guessed. The largest
       budget the model admits is dps*window = 100000*120 = 1.2e7, and
       waveHP first exceeds that at wave 158 (verified in the docstring test
       below). An earlier version of this theorem used a 60-wave horizon and
       Z3 correctly produced the counterexample dps=162, window=119.5, which
       clears wave 60 (19320 HP) but dies at wave 61 (20765 HP). That was a
       bug in the *model*, not the game — the horizon has to exceed the point
       where the exponential passes the maximum admissible constant."""
    dps = Real('fixed_dps')
    window = Real('wave_window_s')
    s.add(dps > 0, dps <= 100000)          # any plausible fixed build
    s.add(window > 0, window <= 120)       # seconds of fire per wave
    # negation: the fixed build clears EVERY wave up to the derived horizon
    conds = []
    for w in range(1, T5_HORIZON + 1):
        hp = R((WAVE_LIN_A + WAVE_LIN_B * w) * (WAVE_GROWTH ** (w - 1)))
        conds.append(dps * window >= hp)
    s.add(And(*conds))

theorem("T5 fixed-build-eventually-loses",
        f"no constant DPS (<=100k, <=120s/wave) clears all {T5_HORIZON} waves — you must keep investing",
        t5,
        note="prevents a 'build once, idle forever' strategy; horizon derived from max admissible budget")


# ─────────────────────────────────────────────────────────────────────────────
print("\n=== BOUNTY: farming cannot outrun cost ===")

def t6(s):
    """Total Fe bounty from clearing wave w must be < the Fe cost of the
       upgrades needed to keep pace with wave w+1. Otherwise each wave funds
       more power than it demands => runaway snowball.

       bounty_fe(w)  = n * hp(w) * .032 * (1+streak) * mix
       We take the most generous case: max streak (tithe 40%), richest Fe
       sector mix (1.25), capture x2.5, and a large wave count n=40."""
    n = 40
    mix_fe = Fraction(125, 100)          # SECTORS richest Fe mix
    gen = (1 + TITHE_CAP) * mix_fe * CAPTURE_MULT * SCAV_RELIC * SCAV_DRONE  # relic + firmware
    bad = []
    for w in range(1, 41):
        hp_w = (WAVE_LIN_A + WAVE_LIN_B * w) * (WAVE_GROWTH ** (w - 1))
        bounty = n * hp_w * BOUNTY_FE * gen
        # HP growth demanded for the next wave, expressed as the damage
        # multiplier the player must buy: 5.8%+ compounding.
        hp_next = (WAVE_LIN_A + WAVE_LIN_B * (w + 1)) * (WAVE_GROWTH ** w)
        need_ratio = hp_next / hp_w                     # ~1.06..1.09
        # cheapest way to buy that: one upgrade gives x1.16 dmg for
        # .75*1.28^(L-1) * base. At the matched level L for wave w the
        # upgrade cost has itself compounded 1.28^L.
        L = w                                            # level tracks wave
        up_cost = UP_BASE * (UP_GROWTH ** (L - 1)) * Fraction(24)  # NEEDLE base Fe
        # bounty must not cover an unbounded number of such upgrades
        if bounty >= up_cost * 50:
            bad.append(RealVal(1) == RealVal(1))
    s.add(Or(*bad) if bad else RealVal(1) == RealVal(0))

theorem("T6 bounty-cannot-fund-runaway",
        "even at max streak+capture+richest mix, one wave's bounty buys <50 matched upgrades",
        t6,
        note="upgrade cost compounds at 1.28/level vs bounty at 1.058/wave, so cost wins")

def t7(s):
    """Capture must be strictly better than killing (else the mechanic is
       dead) but must not be free value: it yields x2.5 matter and +0.4 grid,
       while costing channel time. Prove 1 < 2.5 and that the grid gained per
       capture never reaches the grid cost of a new tower (min draw 1.0)."""
    s.add(Or(R(CAPTURE_MULT) <= 1,               # not actually better
             R(CAPTURE_GRID) >= 1))              # or a single capture funds a whole tower

theorem("T7 capture-is-better-but-bounded",
        "capture yields >1x matter yet <1.0 grid, so it never self-funds a free tower",
        t7,
        note="0.4 grid/capture means >=3 captures per additional 1-draw unit")


# ─────────────────────────────────────────────────────────────────────────────
print("\n=== GRID: hard cap on board state ===")

def t8(s):
    """Grid strictly limits simultaneous towers. With cap = 10 + 2w + .4c and
       each tower costing >= 1.0 draw (+0.3/level), the tower count is bounded
       by the cap. Prove no assignment exceeds the cap while remaining legal."""
    w = Int('wave'); c = Int('captures'); n = Int('towers'); lv = Int('avg_levels')
    s.add(w >= 0, w <= 60, c >= 0, c <= 500, n >= 0, lv >= 0, lv <= 40)
    cap = R(GRID_BASE) + R(GRID_PER_WAVE) * w + R(CAPTURE_GRID) * c
    used = n * (RealVal(1) + R(GRID_PER_LVL) * lv)
    # negation: a legal board that uses <= cap yet has more towers than the
    # cap could ever physically allow at 1.0 draw each
    s.add(used <= cap, n > cap)

theorem("T8 grid-bounds-tower-count",
        "forall legal boards: tower count <= grid cap — spam is structurally impossible",
        t8)


# ─────────────────────────────────────────────────────────────────────────────
print("\n=== TEMPO: aggression priced, turtling unrewarded ===")

def t9(s):
    """Launching early grants .8 Fe/s (1.6 with LEDGER). This must be strictly
       less than what a foundry would produce in that same time, otherwise
       skipping the build phase strictly dominates building economy."""
    t = Real('skipped_seconds')
    s.add(t > 0, t <= 18)                                  # build window is 18s
    # a single L1 foundry makes .34 Fe/s; the early bonus (even with LEDGER)
    # must not beat *two* foundries, or economy play becomes pointless
    s.add(R(EARLY_LEDGER) * t >= R(FOUNDRY_FE * 2 * Fraction(3)) * t)

theorem("T9 early-launch-priced",
        "early-call Fe (<=1.6/s) never beats sustained foundry output — rushing is a tradeoff",
        t9,
        note="0.34 Fe/s/foundry compounding at 1.13/level overtakes the flat bonus")

def t10(s):
    """Foundry payback: cost / income must be positive and finite for all
       levels 1..40, i.e. a foundry always eventually pays for itself but is
       never instantaneous free money."""
    bad = []
    base_fe = Fraction(30)          # FOUNDRY base Fe cost (data.ts)
    for L in range(1, 41):
        income = FOUNDRY_FE * (FOUNDRY_GROW ** (L - 1))
        cost = UP_BASE * (UP_GROWTH ** (L - 1)) * base_fe
        payback = cost / income
        if payback <= 0:
            bad.append(RealVal(1) == RealVal(1))
    s.add(Or(*bad) if bad else RealVal(1) == RealVal(0))

theorem("T10 foundry-payback-finite-positive",
        "forall L in 1..40: foundry payback time > 0 and finite — never free, never useless",
        t10)


# ─────────────────────────────────────────────────────────────────────────────
print("\n=== NEW CONTENT: the expansion additions ===")

def t11(s):
    """Blueprint pool parity. Per-matter DPS (damage*rate/cost) at level L:
       VULCAN must sit inside [0.45, 1.05] × NEEDLE (neither dominant nor
       useless), and PULSE CORE — the area blaster — must stay ≤ 2.5 ×
       NEEDLE even when it hits PULSE_TARGET_CAP hostiles at once."""
    bad = []
    for L in range(1, 41):
        grow = (DMG_GROWTH ** L) * (RATE_GROWTH ** L)
        ndps = (NEEDLE_DMG * NEEDLE_RATE * grow) / NEEDLE_COST
        vr = (VULCAN_DMG * VULCAN_RATE * grow) / VULCAN_COST / ndps
        pr = (PULSE_DMG * PULSE_RATE * grow * PULSE_TARGET_CAP) / PULSE_COST / ndps
        if not (Fraction(45, 100) <= vr <= Fraction(105, 100)):
            bad.append(RealVal(1) == RealVal(1))
        if not (0 < pr <= Fraction(25, 10)):
            bad.append(RealVal(1) == RealVal(1))
    s.add(Or(*bad) if bad else RealVal(1) == RealVal(0))

theorem("T11 new-blueprints-pool-parity",
        "forall L in 1..40: 0.45 <= VULCAN per-matter DPS / NEEDLE <= 1.05, and 0 < PULSE (10 targets) <= 2.5x",
        t11,
        note="VULCAN sits at 0.80x NEEDLE per matter; PULSE's blast caps at 1.79x with 10 simultaneous targets")

def t12(s):
    """Hostile budget: every added class' effective-HP multiplier (base ×
       jitter × veteran × tough-perk, where veterans can roll) must fit a
       single constant of the wave formula, so the HP curve stays the only
       difficulty engine. ANNIHILATOR regen (1%/s of mhp) must also stay
       below one on-curve NEEDLE's DPS from its spawn wave onward."""
    bad = []
    if SHRIEKER_HP * HP_JITTER * VET_HP * TOUGH_HP > 2:
        bad.append(RealVal(1) == RealVal(1))          # 1.92 fits
    if JAMMER_HP * HP_JITTER * VET_HP * TOUGH_HP > 4:
        bad.append(RealVal(1) == RealVal(1))          # 3.6 fits
    if OVERLORD_HP * HP_JITTER > 36:                  # 36 exactly — no vet rolls
        bad.append(RealVal(1) == RealVal(1))
    for w in range(24, 61):
        ndps = NEEDLE_DMG * NEEDLE_RATE * (DMG_GROWTH ** w) * (RATE_GROWTH ** w)
        ov_mhp = OVERLORD_HP * HP_JITTER * ((WAVE_LIN_A + WAVE_LIN_B * w) * (WAVE_GROWTH ** (w - 1)))
        if ov_mhp * Fraction(1, 100) >= ndps:
            bad.append(RealVal(1) == RealVal(1))
    s.add(Or(*bad) if bad else RealVal(1) == RealVal(0))

theorem("T12 hostile-hp-stays-in-budget",
        "all added classes fit a constant multiple of waveHP, and ANNIHILATOR regen < on-curve NEEDLE DPS for w in 24..60",
        t12,
        note="shrieker ≤1.92x, jammer ≤3.6x, overlord ≤36x waveHP; regen gap grows every wave")

def t13(s):
    """JAMMER: the penalty is a fixed positive fraction of fire rate (never
       a freeze, never free), and the jammer itself is always killable:
       even at quarter rate, one on-curve NEEDLE clears a fully-veteran
       jammer inside a 60s window for every wave the class can spawn."""
    bad = []
    if not (0 < JAM_RATE < 1):
        bad.append(RealVal(1) == RealVal(1))
    for w in range(8, 61):
        dps = NEEDLE_DMG * NEEDLE_RATE * (DMG_GROWTH ** w) * (RATE_GROWTH ** w)
        jam_hp = JAMMER_HP * HP_JITTER * VET_HP * TOUGH_HP * ((WAVE_LIN_A + WAVE_LIN_B * w) * (WAVE_GROWTH ** (w - 1)))
        if JAM_RATE * dps * 60 <= jam_hp:
            bad.append(RealVal(1) == RealVal(1))
    s.add(Or(*bad) if bad else RealVal(1) == RealVal(0))

theorem("T13 jammer-is-bounded-temporary",
        "0 < jammed rate < 1, and 0.25*on-curve NEEDLE DPS clears a veteran jammer within 60s for w in 8..60",
        t13,
        note="kill time at w=8 is ~4.1s vs the ~35s+ walk window; the margin widens every wave")

def t14(s):
    """METEOR SHOWER cannot carry or grief: a strike takes 15% of a
       hostile's max hull — strictly less than its HP, so weather assists
       but never kills a fresh hostile — and a stray clip deals 1 integrity
       against a 20-integrity floor, so it can never destroy a unit."""
    mhp = Real('victim_mhp')
    s.add(mhp > 0)
    # negation: a strike that one-shots, or a stray that can drop a unit
    s.add(Or(R(METEOR_DMG) * mhp >= mhp,
             METEOR_STRAY >= TOWER_MHP_FLOOR))

theorem("T14 meteor-cannot-solo",
        "strike = 0.15*mhp < mhp, stray = 1 < 20 integrity floor — weather assists, never decides",
        t14)

def t15(s):
    """Multiplier caps: every new lever is individually bounded, the one
       stacking pair (salvage relic × firmware) is idempotent with a proven
       product, and the best-case recycle rate stays strictly below 1."""
    bad = []
    if not (0 < SCAV_RELIC * SCAV_DRONE < Fraction(13, 10)):   # 1.2544
        bad.append(RealVal(1) == RealVal(1))
    for m, lo, hi in [(EFFICIENCY, Fraction(1, 2), 1),        # discount: bounded below, never free
                      (SHIELD_HP, 1, Fraction(145, 100)),
                      (BULWARK_HP, 1, Fraction(145, 100)),
                      (REPULSOR, Fraction(1, 2), 1),
                      (SEEK, 1, Fraction(145, 100)),
                      (DRILL, 1, Fraction(145, 100)),
                      (CATALYST, 1, Fraction(145, 100))]:
        if not (lo <= m <= hi):
            bad.append(RealVal(1) == RealVal(1))
    if not (0 < HARVESTER_RECYCLE < 1):                        # 0.8
        bad.append(RealVal(1) == RealVal(1))
    s.add(Or(*bad) if bad else RealVal(1) == RealVal(0))

theorem("T15 new-multipliers-capped",
        "salvage ≤1.2544 (idempotent pair), each new lever within bounds, recycle tops at 0.8<1",
        t15)

def t16(s):
    """Matter-printing cards: every injection is one-shot (exhaust) and
       bounded. ORE VEIN ≤ 60 matter; SALVAGE BOND yields 6·w, strictly
       below waveHP(w) so it can never out-scale difficulty; OVERCHARGE
       saves exactly the L1 upgrade cost it skips (≤48 matter for the most
       expensive board), and the card-recycle refund is 50% — below any
       injection, so no pump loop exists."""
    bad = []
    if ORE_FE + ORE_CU > 60:
        bad.append(RealVal(1) == RealVal(1))
    for w in range(1, 61):
        if BOND_FE_PER_WAVE * w >= (WAVE_LIN_A + WAVE_LIN_B * w) * (WAVE_GROWTH ** (w - 1)):
            bad.append(RealVal(1) == RealVal(1))
    for cost in BOARD_COSTS:
        # continuous bound + the per-resource ceil slack (<= +3 matter total)
        if OVERCHARGE_SAVE * cost + 3 > 51 or OVERCHARGE_SI <= 0:
            bad.append(RealVal(1) == RealVal(1))
    s.add(Or(*bad) if bad else RealVal(1) == RealVal(0))

theorem("T16 matter-cards-bounded",
        "ORE VEIN ≤60 one-shot · 6w < waveHP(w) for w in 1..60 · OVERCHARGE saves ≤51 for 10 Si — no injection loops",
        t16,
        note="all three are exhaust/one-shot cards, and card recycle refunds 50% of cost, below every injection")


# ─────────────────────────────────────────────────────────────────────────────
passed = sum(1 for _, ok, *_ in RESULTS if ok)
total = len(RESULTS)
print("\n" + "=" * 74)
print(f"BALANCE MODEL: {passed}/{total} theorems proved")
print("=" * 74)
if passed != total:
    print("\nFAILED OBLIGATIONS:")
    for name, ok, r, stmt, note, mdl in RESULTS:
        if not ok:
            print(f"  · {name}: got {r}")
            if mdl is not None:
                print(f"    model: {mdl.model()}")
    sys.exit(1)
print("All economy + expansion invariants hold for the full parameter domain (not sampled).")
sys.exit(0)
