# Nutrition Plan Logic — Research & Methodology

**Date:** April 2026 (updated April 25, 2026)
**Purpose:** Transparent documentation of how Lecka calculates carbohydrate, sodium, and fluid targets — cross-referenced against current sports science research. Every number on your plan comes from here.

---

## Executive Summary

Lecka's nutrition plan is built on **ISSN 2018, Burke et al. (IOC 2019), and ACSM guidelines**. The approach is duration-adaptive, weight-based, and personalised by athlete profile, effort level, environment, and elevation.

**What the plan does:**
- Carb targets scale continuously with race duration — a 70 km race gives a meaningfully different rate from a 50 km race
- Sodium and fluid targets scale with body weight, conditions, and fitness level
- Athlete profile (untrained → elite) adjusts all three targets by up to ±15%
- Hilly and mountain courses increase carb and sodium targets (climbing burns more glycogen and raises core temperature)
- Product quantities are calibrated to actually deliver your carb target — not based on a fixed cadence
- Your plan page shows a live "Provided vs. Target" breakdown so you can see exactly how well your selected products match your needs

**Known simplifications (honest limitations):**
- Conditions are categorical (cool / mild / warm / hot / humid) — continuous temperature input would allow more precise sweat-rate modelling
- Gender modifier is a simplified proxy (female = 0.9×) — fitness level predicts sweat rate better than gender alone
- No individual sweat-rate measurement — field-tested sweat rate would be the single biggest accuracy improvement
- No formula versioning — plans generated at different times may differ slightly if research anchors are updated

---

## 1. CARBOHYDRATE TARGET

### How it's calculated

The active strategy is **distance_adaptive** — a continuously interpolated curve derived from 13 research-anchored breakpoints. Every unique race duration produces a unique carb target.

```
Step 1 — Base rate from race duration (linear interpolation):

  Duration  →  Base carb rate
  ────────────────────────────
  0–30 min  →   0 g/h   (sufficient muscle glycogen; no exogenous carbs needed)
    45 min  →  20 g/h   (marginal SGLT1 benefit begins)
    60 min  →  35 g/h   (single-transporter threshold)
    90 min  →  50 g/h
   120 min  →  58 g/h   (2-hour zone)
   180 min  →  63 g/h   (3-hour / marathon–ultra transition)
   240 min  →  67 g/h
   300 min  →  71 g/h   (50 km range, ~5 h)
   360 min  →  74 g/h
   480 min  →  77 g/h   (70–80 km range, ~8 h)
   600 min  →  79 g/h   (100 km range, ~10 h)
   900 min  →  82 g/h   (150+ km / very long ultra)

  Durations between anchors are linearly interpolated — every minute
  produces a distinct rate.

Step 2 — Effort modifier:
  easy:       × 0.85
  race_pace:  × 1.00
  hard:       × 1.15

Step 3 — Athlete profile modifier:
  untrained:    × 0.85
  intermediate: × 1.00  (baseline)
  trained:      × 1.10
  elite:        × 1.15

Step 4 — Elevation modifier (if course data provided):
  flat       (avg grade < 1%):   × 1.00
  rolling    (1–3%):             × 1.05
  hilly      (3–6%):             × 1.10
  very hilly (6–10%):            × 1.15
  mountain   (> 10%):            × 1.22

Final: base × effort × profile × elevation  (rounded to nearest integer)

Total carbs for race = carb_per_hour × (goal_minutes / 60)
```

**Worked example — 70 kg male, 4-hour marathon, race pace, intermediate, flat:**
```
  Base at 240 min:              67 g/h
  × effort (race_pace, 1.00):   67 g/h
  × profile (intermediate, 1.00): 67 g/h
  × elevation (flat, 1.00):     67 g/h
  → carb_per_hour = 67 g/h
  → total_carbs   = 67 × 4.0 = 268 g
```

### Research basis

**ISSN 2018 Consensus Statement:**
- < 45 min: 0 g/h — sufficient muscle glycogen; exogenous carbs provide no benefit
- 45–75 min: 30–60 g/h (single-transporter SGLT1, glucose only)
- 1.5–3 h: up to 60 g/h (single-transporter ceiling, ~120 mg/min)
- 2.5 h+: up to 90 g/h possible with dual-transporter CHO (glucose + fructose, 2:1 ratio)

**Burke et al. (IOC 2019):**
- Duration is the primary driver of carb need — not effort level
- Intensity modulates but is secondary; a 100 km ultra at "easy" pace still needs 75+ g/h
- Training status affects absorption capacity: untrained 30–45 g/h; trained up to 90 g/h

### Rates by race type (race pace, intermediate athlete, flat course)

| Race | Typical finish time | Lecka rate | ISSN range | Alignment |
|------|---------------------|-----------|------------|-----------|
| 5K | 22 min | **0 g/h** | 0 g/h | ✓ |
| 10K | 50 min | **25 g/h** | 30–45 g/h | ⚠️ Slightly conservative |
| Half marathon | 105 min | **54 g/h** | 55–65 g/h | ✓ |
| Marathon | 210 min | **65 g/h** | 60–75 g/h | ✓ |
| Ultra 50K | 360 min | **74 g/h** | 60–90 g/h | ✓ |
| Ultra 100K | 600 min | **79 g/h** | 60–90 g/h | ✓ |

> **Note on 10K:** The curve is intentionally conservative at 45–60 minutes to avoid GI distress at short, fast efforts. Athletes with trained gut absorption can select "trained" profile or "hard" effort to reach 30–35 g/h.

### Known limitations
1. **No carbohydrate type guidance** — dual-transporter CHO (glucose + fructose, 2:1) enables up to 90 g/h for events > 2.5 h; current products are single-source glucose-dominant
2. **Effort modifier does not vary by duration** — research suggests effort matters less as duration increases (a 12-hour ultra at "easy" pace still demands near-maximum carbs regardless); future update could reduce the effort band for very long events

---

## 2. SODIUM TARGET

### How it's calculated

```
sodium_per_hour =
  weight_kg
  × 8 mg/kg               (base rate — ISSN midpoint of 4–10 mg/kg/h range)
  × gender_modifier
  × condition_modifier
  × athlete_profile_modifier
  × elevation_modifier

  Clamped to 300–1500 mg/h

Gender modifiers:
  male:   × 1.00
  female: × 0.90
  other:  × 0.95

Condition modifiers (sweat sodium loss scales with sweat rate):
  cool:   × 0.85
  mild:   × 1.00
  warm:   × 1.25
  hot:    × 1.50
  humid:  × 1.40

Athlete profile modifiers (trained athletes produce more sweat):
  untrained:    × 0.85
  intermediate: × 1.00
  trained:      × 1.10
  elite:        × 1.15

Elevation modifiers (climbing raises core temperature and sweat rate):
  flat:       × 1.00
  rolling:    × 1.05
  hilly:      × 1.08
  very hilly: × 1.12
  mountain:   × 1.18

Worked example — 70 kg male, hot, trained, flat:
  = 70 × 8 × 1.0 × 1.5 × 1.10 × 1.0 = 924 mg/h

Worked example — 70 kg male, hot, intermediate, flat:
  = 70 × 8 × 1.0 × 1.5 × 1.00 × 1.0 = 840 mg/h
```

### Research basis

**ISSN 2015 — Sodium, Fluid & Exercise:**
- Typical range: 4–10 mg/kg/h; most athletes at 6–8 mg/kg/h baseline
- Lecka uses 8 mg/kg, at the upper-moderate end — appropriate for active endurance athletes

**Sawka et al. (ACSM 2007):**
- Sodium aids fluid retention, osmolarity balance, and palatability
- Fluid-only intake > 1000 ml/h risks hyponatremia in events > 2 h

### Sample outputs

| Scenario | Calculated | ISSN range | Assessment |
|----------|------------|------------|------------|
| 70 kg male, mild, intermediate | 560 mg/h | 280–560 | ✓ |
| 70 kg male, hot, intermediate | 840 mg/h | 420–700+ | ⚠️ Upper end — appropriate in sustained heat |
| 70 kg male, hot, trained | 924 mg/h | 500–900+ | ✓ |
| 60 kg female, cool, intermediate | 367 mg/h | 240–480 | ✓ |
| 70 kg male, mountain, intermediate | 840 × 1.18 = 991 mg/h | 500–1200 | ✓ |

### Known limitations
1. **Gender modifier is a simplified proxy** — fitness level and VO2max predict sweat rate more accurately than gender alone; a trained female often sweats more than an untrained male
2. **Heat acclimatisation not captured** — acclimatised athletes have higher pre-race sweat rates even before conditions shift
3. **No individual sweat-rate input** — the most impactful single improvement available

---

## 3. FLUID TARGET

### How it's calculated

```
fluid_ml_per_hour =
  weight_kg
  × 8 ml/kg               (base rate — ACSM population midpoint)
  × gender_modifier
  × condition_modifier
  × athlete_profile_modifier

  Clamped to 400–1000 ml/h

  Note: Elevation is NOT applied to fluid. The effect of altitude and
  gradient on sweat rate is complex and does not follow a reliable linear
  multiplier — athletes on mountain courses should treat the fluid target
  as a minimum and monitor thirst and urine colour.

Same gender, condition, and profile modifiers as sodium.

Worked example — 70 kg male, warm, trained:
  = 70 × 8 × 1.0 × 1.2 × 1.10 = 739 ml/h
```

**Important:** The fluid target represents how much to drink across all sources (water, sports drinks, aid stations). Gels and bars contribute negligible fluid; the target is met through your hydration carry and aid station strategy.

### Research basis

**ACSM 2007 Position Stand:**
- Target: replace 50–70% of sweat losses to prevent > 2% body weight dehydration
- Practical range: 400–800 ml/h; up to 1000 ml/h in sustained heat
- Gastric emptying limit: ~1000–1200 ml/h (set as the upper clamp)

### Sample outputs

| Scenario | Calculated | ACSM range | Assessment |
|----------|------------|------------|------------|
| 70 kg, mild, intermediate | 560 ml/h | 400–800 | ✓ |
| 70 kg, hot, intermediate | 784 ml/h | 500–1000 | ✓ |
| 70 kg, hot, trained | 862 ml/h | 600–1000 | ✓ |
| 100 kg, hot, intermediate | 1120 → **1000 ml/h** (clamped) | 600–1200 | ✓ (clamped) |

### Known limitations
1. **No individual sweat-rate measurement** — field test (weigh before/after + fluid consumed) would dramatically improve accuracy
2. **Sport-specific variation not captured** — cycling generates better convective cooling than running; triathletes face different demands across disciplines

---

## 4. ELEVATION MODIFIER

Climbing increases glycogen demand (muscles work against gravity at higher metabolic cost) and raises core temperature (lower speeds reduce convective cooling). Both carbs and sodium targets are uplifted on hilly courses.

```
Average course grade is calculated from inputs:
  avg_grade_pct = elevation_gain_m / (distance_km × 1000) × 100

Tier thresholds and modifiers:
  Tier        | Avg grade  | Carb modifier | Sodium modifier
  ───────────────────────────────────────────────────────────
  flat        | < 1%       | × 1.00        | × 1.00
  rolling     | 1–3%       | × 1.05        | × 1.05
  hilly       | 3–6%       | × 1.10        | × 1.08
  very hilly  | 6–10%      | × 1.15        | × 1.12
  mountain    | > 10%      | × 1.22        | × 1.18
```

The elevation tier is shown in the plan header so you can verify how your course was classified. If no elevation data is provided, the plan defaults to flat.

Fluid is not adjusted for elevation — the relationship between altitude, gradient, and sweat demand is complex and does not follow a simple multiplier. Monitoring thirst and urine colour remains the most reliable guide on mountain courses.

---

## 5. PRODUCT QUANTITY CALCULATION

### How many gels does the plan suggest?

Gel quantity is driven by your carb target — not by a fixed time cadence.

```
Step 1 — Calculate how many gels are needed:
  needed_gels = ceil(total_carbs / avg_carbs_per_selected_gel)

  If you selected multiple gel flavours, avg_carbs is the mean across all
  selected gels — they are rotated round-robin across your race.

Step 2 — Space them evenly across the race:
  Gels are spread from first intake (20 min) to near race end.
  Minimum spacing: 20 min (physiological absorption limit).
  If needed_gels exceeds what fits at 20-min spacing, the plan uses as
  many as physically fit — this is the practical ceiling.

Step 3 — Caffeine assignment:
  Slots at ≥ 45 min from race start and ≥ 60 min since the last caffeine
  dose are assigned caffeine gels (if you selected them). Caffeine gels
  contribute their carbs toward the total.
```

**Worked example — 2-hour race, 58 g/h target, Passion Fruit gel (25 g carbs):**
```
  total_carbs  = 58 × 2.0 = 116 g
  needed_gels  = ceil(116 / 25) = ceil(4.64) = 5
  slots        = [20, 45, 70, 94, 119 min]  (evenly spaced)
  provided     = 5 × 25 = 125 g  (108% of target — ceil rounds up by design)
```

**Why a slight overshoot is intentional:**
`ceil()` always rounds up, so the plan delivers ≥ target rather than falling short. In practice the delta is less than one gel's carb content. The "Provided by plan" row on your plan page shows the exact match — you can use the Adjust Plan button to fine-tune.

### Bars

Bars are placed at fixed positions regardless of carb target:
- **1 bar before** (at −30 min) if race duration ≥ 60 min — pre-loads glycogen before the start
- **1 bar after** (at +15 min) — supports recovery glycogen resynthesis

Bar carbs are not counted toward your during-race carb target; they serve pre- and post-race needs.

---

## 6. ARCHITECTURE

### What's in place
✓ Distance-adaptive carb curve — continuous interpolation, no fixed buckets
✓ Pluggable strategy system — five carb algorithms available (distance_adaptive is default)
✓ Athlete profile system — 4 levels (untrained / intermediate / trained / elite) applied to carbs, sodium, and fluid
✓ Elevation modifier — applied to carbs and sodium based on avg course grade
✓ Product quantities driven by carb target — not fixed cadence
✓ "Provided vs. Target" display — live feedback on every plan page
✓ Formulas externalised to config — rates and modifiers are separate from calculation logic

### What remains simplified
✗ Conditions are categorical — continuous temperature input would allow precise sweat-rate modelling (~2–3% increase per °C above 20°C)
✗ Gender modifier is a simplified proxy — training level and VO2max predict sweat rate more accurately than gender alone
✗ No individual sweat-rate input — the biggest single accuracy improvement available
✗ No formula versioning — cannot reproduce a plan generated 6 months ago if research anchors have been updated

---

## 7. ROADMAP

### Implemented ✅
- [x] Distance-adaptive carb algorithm (continuous, interpolated from duration)
- [x] Pluggable carb strategy system (effort_based, duration_based, hybrid, distance_adaptive, vo2max_adjusted)
- [x] Athlete profile system (untrained → elite) applied to carbs, sodium, and fluid
- [x] Elevation modifier (carbs and sodium)
- [x] Product quantities calibrated to carb target (target-driven, not fixed cadence)
- [x] "Provided vs. target" display on plan page
- [x] Carb rate validation and warnings for events < 45 min
- [x] Pre-race sodium loading guidance for hot/humid ultras > 4 hours

### Pending
- [ ] Continuous temperature input (replaces categorical conditions)
- [ ] Individual sweat-rate estimator tool (weigh before/after field test → feeds sodium/fluid targets)
- [ ] Formula versioning (reproducible plans even after research updates)
- [ ] Sport-specific fluid modifiers (running vs. cycling vs. triathlon)

---

## 8. REFERENCES

1. **ISSN 2018** — International Society of Sports Nutrition Consensus Statement on Carbohydrate Intake in Sport
2. **Burke et al. (IOC 2019)** — International Olympic Committee Consensus Statement on Nutrition for Sport — duration-dependent carbohydrate framework
3. **Sawka et al. (ACSM 2007)** — Position Stand on Fluid Replacement During Exercise — sweat rate variability and hyponatremia risk
4. **ISSN 2015** — Position Stand on Sodium and Fluid in Exercise
5. **Marino et al. (2021)** — Sodium and Hydration in Endurance Sports — pre-race loading protocols and heat acclimatisation effects

---

## 9. CONTINUOUS IMPROVEMENT

- Field feedback is more valuable than lab estimates — GI comfort reports, energy levels, and cramping data directly inform anchor adjustments
- The "Provided vs. Target" delta on every plan page creates a natural feedback loop — systematic mismatches may indicate product carb content updates are needed
- ISSN and IOC guidelines update on 3–5 year cycles — next major review expected 2028–2030
- Individual sweat-rate input remains the highest-priority accuracy improvement

---

**Last updated:** April 25, 2026
**Next review:** April 2027, or upon major ISSN / IOC guideline update
