# Nutrition Plan Logic — Research & Methodology

**Date:** April 2026 (updated October 2026)
**Purpose:** Transparent documentation of how Lecka calculates carbohydrate, sodium, and fluid targets — cross-referenced against current sports science research. Every number on your plan comes from here.

---

## Executive Summary

Lecka's nutrition plan is built on **ISSN 2018, Burke et al. (IOC 2019), and ACSM guidelines**. The approach is duration-adaptive, weight-based, and personalised by athlete profile, effort level, environment, and elevation.

**What the plan does:**
- Carb targets scale continuously with race duration — a 70 km race gives a meaningfully different rate from a 50 km race
- Fluid targets scale with body weight, conditions, and fitness level. Sodium is set as a concentration in that fluid (mg per litre), as ACSM and DGE guidance recommends
- Athlete profile (untrained → elite) adjusts all three targets by up to ±15%
- Hilly and mountain courses increase carb targets (climbing burns more glycogen)
- Product quantities are calibrated to actually deliver your carb target — not based on a fixed cadence
- Your plan page shows a live "Provided vs. Target" breakdown so you can see exactly how well your selected products match your needs
- Age bracket (optional): masters athletes 40+ receive adjusted carb targets reflecting lower max CHO oxidation rates — a 3–12% reduction depending on age group
- Sodium targets scale with race duration — events under 90 minutes receive a partial sodium target reflecting actual sweat sodium losses

**Known simplifications (honest limitations):**
- Conditions are categorical (cool / mild / warm / hot / humid) — continuous temperature input would allow more precise sweat-rate modelling
- Gender modifier is a simplified proxy (female = 0.9×) — fitness level predicts sweat rate better than gender alone
- No individual sweat-rate measurement — field-tested sweat rate would be the single biggest accuracy improvement
- No formula versioning — plans generated at different times may differ slightly if research anchors are updated
- Age modifier is bracket-based (under 40 / 40–49 / 50–59 / 60+), not continuous — a continuous VO2max-decline curve would be more precise
- Sweat saltiness is an optional, self-reported question — athletes who are not sure get the "average" sodium concentration (700 mg/L). Individual sweat sodium varies roughly 230–2,070 mg/L, and self-report is only a rough guide, so it remains the largest source of error

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
    60 min  →  42 g/h   (updated from 35 g/h — aligns with Jeukendrup 2004,
                          Rollo & Williams 2011 on 45–60 min mouth-rinsing benefit)
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
| 10K | 50 min | **~30 g/h** | 30–45 g/h | ✓ (interpolated from 20 g/h at 45 min and 42 g/h at 60 min) |
| Half marathon | 105 min | **54 g/h** | 55–65 g/h | ✓ |
| Marathon | 210 min | **65 g/h** | 60–75 g/h | ✓ |
| Ultra 50K | 360 min | **74 g/h** | 60–90 g/h | ✓ |
| Ultra 100K | 600 min | **79 g/h** | 60–90 g/h | ✓ |

> **Note on 10K:** The 60-minute anchor was updated from 35 g/h to 42 g/h in June 2026, aligning with Jeukendrup & Chambers (2004) and Rollo & Williams (2011) on mouth-rinsing and gut-priming benefit at 45–60 minutes. A 50-minute 10K now outputs approximately 30 g/h (interpolated).

### Masters athlete carb modifier (new — June 2026)

An optional age bracket input applies a downward modifier to carb_per_hour only:

| Age bracket | Carb modifier | Rationale |
|-------------|--------------|-----------|
| Under 40    | × 1.00       | Baseline — no change |
| 40–49       | × 0.97       | Marginal decline in max CHO oxidation |
| 50–59       | × 0.93       | Meaningful reduction in absorption capacity and gut motility |
| 60+         | × 0.88       | Masters athletes: lower VO2max ceiling, slower gastric emptying |

**Research basis:** Coyle et al. (Masters Athletes review, 2020) documents ~1% per year VO2max decline after age 30, with associated reductions in maximum carbohydrate oxidation rates. Gastric emptying slows with age independent of training status. The modifiers are intentionally conservative — they reflect population averages, not individual variation. An elite 58-year-old may require no reduction.

**Input is optional.** If age bracket is not provided, no modifier is applied and the plan defaults to the under-40 baseline.

### Known limitations
1. **No carbohydrate type guidance** — dual-transporter CHO (glucose + fructose, 2:1) enables up to 90 g/h for events > 2.5 h; current products are single-source glucose-dominant
2. **Effort modifier tapers at ultra durations** — above 240 minutes, the ±15% effort band is progressively compressed to ±6% by 480 minutes. This reflects the research consensus that duration dominates effort as a carbohydrate driver for ultra-distance events. The tapering factor reaches its minimum (40% of the raw deviation) at 480 minutes and holds there for longer races.

---

## 2. SODIUM TARGET

### How it's calculated

```
sodium_per_hour = fluid_ml_per_hour ÷ 1000 × sodium concentration (mg per litre)

Sodium concentration by sweat profile:
  light:     500 mg/L
  average:   700 mg/L   (default — used when the athlete is not sure)
  salty:    1000 mg/L

Then duration scaling for events under 90 min (below).
Clamped to 200–1000 mg/h. The upper value is a product cap, not a safety limit.

Worked example — 70 kg male, hot, intermediate, marathon:
  fluid  = 70 × 8 × 1.0 × 1.4 × 1.0 = 784 ml/h
  sodium = 784 ÷ 1000 × 700         = 549 mg/h
```

**Sweat profile question.** The form asks (optionally) how salty the athlete's sweat is. A sweat test is the reliable way to know: under 30 mmol/L (about 690 mg/L) maps to light, 30–60 mmol/L to average, and 60 mmol/L (about 1,380 mg/L) or more to salty — the bands used by Lara et al. 2017 in marathon runners. Without a test, frequent white salt marks on clothing or skin after long sessions suggest salty sweat, but this sign has not been validated against measured sweat sodium, so "Not sure" defaults to average.

**Why sodium follows fluid.** Sports guidelines set sodium as a concentration in what you drink, not as a rate per kilogram of body weight. Tying sodium to fluid keeps the two in proportion: when heat, body size or fitness raise your sweat rate, both rise together. Gender, conditions and athlete profile therefore affect sodium only through the fluid target. Elevation does not change sodium.

### Research basis

**ACSM 2007 (Sawka et al.)** — Sweat rates and sweat electrolytes vary so much between people that fluid and electrolyte plans should be individualised. Recommended drink composition: 20–30 mmol/L sodium (460–690 mg/L) and 2–5 mmol/L potassium.

**German Nutrition Society (DGE) 2020** — For activity over 90 minutes, drinks should carry 400–1,100 mg/L sodium.

**Why 700 mg/L as the default** — It sits at the top of the ACSM range and in the middle of the DGE range. "Salty" (1,000 mg/L) stays inside the DGE range.

**How much sodium athletes actually lose** — Across 1,303 tested athletes, endurance athletes sweated 1.28 ± 0.57 L/h and lost about 1,190 ± 640 mg sodium per hour (Barnes et al. 2019). Sweat sodium ranges from about 230 to 2,070 mg/L between individuals. At the average profile, plans provide roughly 390–700 mg/h, about 30–60% of that average loss; full replacement is not the goal.

**Heat adaptation** — After a summer of heat exposure, sweat volume rises but sweat sodium concentration falls 22–59% (Brown et al. 2022). This is why heat raises fluid, and therefore sodium, without an extra sodium multiplier.

**Performance and cramps** — One randomised trial found salt capsules (about 2.6 g sodium in total) shortened half-Ironman finish times (Del Coso et al. 2016). A systematic review of five trials found minimal evidence that sodium taken during exercise improves endurance performance, though none of the trials was run in hot conditions (McCubbin et al. 2018). Cramps are not reliably linked to sodium or hydration (Schwellnus 2009; Schwellnus et al. 2011), so the plan does not promise cramp prevention.

### Sample outputs

| Scenario | Fluid | Sodium | Previous model |
|----------|-------|--------|----------------|
| 70 kg male, mild, intermediate, marathon | 560 ml/h | 392 mg/h | 560 mg/h |
| 70 kg male, hot, intermediate, marathon | 784 ml/h | 549 mg/h | 840 mg/h |
| 70 kg male, hot, trained, marathon | 800 ml/h (running cap) | 560 mg/h | 924 mg/h |
| 60 kg female, cool, intermediate, marathon | 400 ml/h | 280 mg/h | 367 mg/h |
| 90 kg male, humid, trained, Ironman | 1000 ml/h | 700 mg/h | 1109 mg/h |

### Sodium duration scaling (new — June 2026)

For events under 90 minutes, the sodium target is scaled down to reflect actual sweat sodium losses at short durations:

| Duration | Sodium scale |
|----------|-------------|
| 0 min    | × 0.0       |
| 45 min   | × 0.40      |
| 60 min   | × 0.65      |
| ≥ 90 min | × 1.00 (full rate) |

Between anchors, linear interpolation is used. For all events 90 minutes and above, the model is unchanged.

**Rationale:** Sweat sodium losses at sub-45-minute efforts are negligible — total race sweat volume is too low for sodium depletion to be a meaningful concern. Surfacing a 500+ mg/h target for a 22-minute 5K is both misleading and not clinically supported. The 90-minute threshold matches the DGE 2020 guidance, which sets sodium recommendations for activity lasting more than 90 minutes.

### Hyponatremia — why the plan says "drink to thirst"

Low blood sodium during or after exercise (hyponatremia) is caused mainly by drinking more than you sweat, not by too little salt. This is the conclusion of the 2015 international consensus statement (Hew-Butler et al.). Sports drinks are far less salty than blood, so drinking too much of them still dilutes blood sodium. At the 161 km Western States race, 6.6% of finishers were hyponatremic even though 94% used sodium supplements; overhydration was the defining feature (Hoffman & Stuempfle 2015).

For races of 4 hours or more, your plan shows a reminder: drink to thirst, and if you are gaining weight during the race, drink less.

### Pre-race sodium loading

For hot or humid races of 4 hours or more, your plan shows the studied pre-load protocol: 10 ml per kg body weight of a drink containing about 3,770 mg sodium per litre (164 mmol/L, about 9.5 g table salt per litre). In the Sims studies the drink was taken in seven portions over 60 minutes, finishing 45 minutes before exercise; in Hamouti et al. it was drunk 90 minutes before. For a 70 kg athlete this is about 700 ml of water with about 6.5 g table salt (about 2,600 mg sodium; a level teaspoon of salt is about 6 g). In small lab studies in the heat this raised plasma volume before exercise, reduced heat strain, and lengthened time to exhaustion or improved time-trial performance (Sims et al. 2007, in men and in women; Hamouti et al. 2014). Try it in training first, and skip it if you have high blood pressure or kidney problems.

### Known limitations
1. **Sweat saltiness is self-reported** — light / average / salty is optional and most athletes have no sweat test; "Not sure" uses average
2. **Fluid modifiers are proxies** — gender and athlete profile approximate sweat rate; a weigh-before-and-after sweat test is more accurate
3. **Conditions are categorical** — continuous temperature would model sweat rate more precisely
4. **No individual sweat-rate input** — still the single biggest accuracy improvement available

### Correction note (October 2026)

Earlier versions of this page based the sodium target on 8 mg per kg body weight, citing an "ISSN 2015 Position Stand on Sodium and Fluid in Exercise" and a 4–10 mg/kg/h range. We could not verify either source, so both have been removed. Earlier versions also suggested a pre-race loading dose of 20.5 g in 2.5 L, which was well above the studied protocol; it has been replaced. Earlier versions also said salt intake reduces cramping; that claim has been removed.

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

  Clamped to sport-specific ceiling (updated June 2026):
  - Running events:                  400–800 ml/h
  - Triathlon (bike leg) / cycling:  400–1000 ml/h

  Note: Elevation is NOT applied to fluid. The effect of altitude and
  gradient on sweat rate is complex and does not follow a reliable linear
  multiplier — athletes on mountain courses should treat the fluid target
  as a minimum and monitor thirst and urine colour.

Gender modifiers:      male × 1.00 · female × 0.90 · other × 0.95
Condition modifiers:   cool × 0.90 · mild × 1.00 · warm × 1.20 · hot × 1.40 · humid × 1.35
Profile modifiers:     untrained × 0.85 · intermediate × 1.00 · trained × 1.10 · elite × 1.15

The sodium target (section 2) is derived from this fluid value.

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
| 100 kg, hot, marathon (running) | 1120 → **800 ml/h** (clamped) | 600–1000 | ✓ (running ceiling) |
| 100 kg, hot, triathlon_140_6 | 1120 → **1000 ml/h** (clamped) | 600–1200 | ✓ (cycling ceiling) |

**Maximum cap — sport-specific (updated June 2026):**
- Running events: 800 ml/h (reflects gastric emptying ceiling at race pace — approximately 600–800 ml/h during running due to reduced splanchnic blood flow)
- Triathlon (bike leg) and cycling: 1000 ml/h (convective cooling from speed allows higher effort with greater fluid tolerance)

The previous universal cap of 1000 ml/h has been replaced with this sport-aware ceiling. Large athletes running in hot conditions are now capped at 800 ml/h rather than receiving a 1000 ml/h target that is practically unachievable and GI-risky at race pace.

### Known limitations
1. **No individual sweat-rate measurement** — field test (weigh before/after + fluid consumed) would dramatically improve accuracy
2. **Sport-specific variation not captured for within-triathlon disciplines** — the fluid ceiling applies per race type; per-leg variation in a triathlon is not modelled

---

## 4. ELEVATION MODIFIER

Climbing increases glycogen demand (muscles work against gravity at higher metabolic cost) and raises core temperature (lower speeds reduce convective cooling). Carb targets are uplifted on hilly courses. Sodium is not adjusted for elevation: no source supports a fixed multiplier, and sodium follows fluid, which is also not adjusted.

```
Average course grade is calculated from inputs:
  avg_grade_pct = elevation_gain_m / (distance_km × 1000) × 100

Tier thresholds and modifiers:
  Tier        | Avg grade  | Carb modifier
  ─────────────────────────────────────────
  flat        | < 1%       | × 1.00
  rolling     | 1–3%       | × 1.05
  hilly       | 3–6%       | × 1.10
  very hilly  | 6–10%      | × 1.15
  mountain    | > 10%      | × 1.22
```

The elevation tier is shown in the plan header so you can verify how your course was classified. If no elevation data is provided, the plan defaults to flat.

Fluid is not adjusted for elevation — the relationship between altitude, gradient, and sweat demand is complex and does not follow a simple multiplier. Monitoring thirst and urine colour remains the most reliable guide on mountain courses.

---

## 4b. PRODUCT FRUCTOSE PROFILES — LAB-VERIFIED DATA

### Source

Eurofins lab reports, December 2025 – April 2026. Values are per-unit based on confirmed net weights from the product master sheet.

### Standard Gel fructose profiles (Eurofins, Dec 2025)

| Flavour | Net weight | Carbs/unit | Free fructose | Free glucose | Sucrose | Fructose % of carbs | Dual-transporter? |
|---------|-----------|-----------|--------------|-------------|---------|---------------------|------------------|
| Passion Fruit | 40g | 27g | 3.7g | 3.8g | 8.2g | 14% | No |
| Banana | 44g | 25g | 1.2g | 1.2g | 14.7g | 5% | No |
| Coffee Cacao | 43g | 22g | 0.1g | 0.4g | 15.3g | ~0% | No |
| Lime Ginger | 40g | 27g | 7.1g | 6.7g | 0.4g | 26% | Yes |
| Kumquat Honey | 40g | 26g | 6.7g | 6.3g | 0.35g | 26% | Yes |

Lab reports: AR-25-VD-249580 (Passion Fruit), AR-25-VD-249581 (Banana), AR-25-VD-258719 (Coffee Cacao), AR-25-VD-251832 (Lime Ginger), AR-25-VD-251833 (Kumquat Honey).

### Ultra Gel fructose profiles

| Flavour | Net weight | Carbs/unit | Free fructose | Free glucose | Sucrose | Fructose % | Dual-transporter? |
|---------|-----------|-----------|--------------|-------------|---------|-----------|------------------|
| Passion Fruit Mango | 102g | 65g | 5.4g | 5.2g | 29.6g | 8% | No |
| Banana Peanut Butter | 108g | 60g | 2.0g | 2.1g | 38.0g | 3% | No |

Lab reports: AR-25-VD-256496 (Passion Fruit Mango, Jan 2026), AR-26-VD-082550 (Banana Peanut Butter, Apr 2026).

**Note on Banana Peanut Butter:** Label not yet finalised at time of publication. Values derived from Eurofins lab report. Sodium: 448mg per 108g unit (4150mg/kg × 0.108kg). Carbs: 60g per 108g unit (55.1g/100g × 108g = 59.5g, rounded to 60g). Contains 6.4g fat per unit — classified as high-fat, which slows gastric emptying.

### Corrections to previously assumed values

The following values were updated from estimated to label/lab-confirmed:

| Product | Field | Old value | New value | Source |
|---------|-------|-----------|-----------|--------|
| Passion Fruit | carbs_per_unit | 25g | 27g | Label (67.1g/100g × 40g) |
| Passion Fruit | sodium_per_unit | 90mg | 88mg | Label confirmed |
| Banana | carbs_per_unit | 22g | 25g | Label (55.9g/100g × 44g) |
| Banana | sodium_per_unit | 100mg | 98mg | Label confirmed |
| Banana | net_weight_g | assumed 40g | 44g | Product master |
| Coffee Cacao | caffeine_mg | 90mg | 80mg | Label declared value (lab: 81.7mg → 80mg declared) |
| Coffee Cacao | net_weight_g | assumed 40g | 43g | Product master |
| Lime Ginger | sodium_per_unit | 105mg | 103mg | Label (2570mg/kg × 40g) |
| Kumquat Honey | sodium_per_unit | 100mg | 96mg | Label (2390mg/kg × 40g) |
| Ultra Gel PFM | sodium_per_unit | 410mg | 405mg | Label (3970mg/kg × 102g) |

### Flavour-level dual-transporter classification

Lime Ginger and Kumquat Honey are classified `dual_transporter: true` because 26% of their carbs are free fructose — sourced from real lime juice and raw honey respectively. At intakes up to 65g carbs/hour these flavours provide meaningful natural GLUT5 (fructose) activation alongside SGLT1 (glucose/sucrose) absorption.

This is naturally occurring fructose in whole-food form, not an engineered 2:1 ratio product. For athletes targeting above 65g/hour, adding a purpose-engineered dual-transporter supplement (e.g. Maurten, SiS Beta Fuel) is still recommended.

Passion Fruit (14%) provides a moderate fructose fraction from the fruit itself but is below the threshold for meaningful dual-transporter classification at practical intake rates. Banana (5%) and Coffee Cacao (~0%) are sucrose-dominant and classified as single-transporter.

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
✓ Athlete profile system — 4 levels (untrained / intermediate / trained / elite) applied to carbs and fluid (sodium follows fluid)
✓ Elevation modifier — applied to carbs based on avg course grade
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
- [x] Athlete profile system (untrained → elite) applied to carbs and fluid
- [x] Elevation modifier (carbs)
- [x] Product quantities calibrated to carb target (target-driven, not fixed cadence)
- [x] "Provided vs. target" display on plan page
- [x] Carb rate validation and warnings for events < 45 min
- [x] Pre-race sodium loading guidance for hot/humid races ≥ 4 hours, using the studied 10 ml/kg protocol (Oct 2026)
- [x] Effort modifier tapering for ultra-duration events (> 240 min)
- [x] Masters athlete age bracket modifier (carbs only, optional input)
- [x] Sodium duration scaling (events < 90 min receive proportionally reduced target)
- [x] Sport-aware fluid ceiling (800 ml/h running, 1000 ml/h cycling/triathlon bike)
- [x] Gut training mode safety cap for events > 180 min (minimum 85% of normal target)
- [x] 60-minute carb anchor corrected from 35 g/h to 42 g/h
- [x] Sodium model v2: sodium = fluid × concentration (mg/L), sweat-profile ready (Oct 2026)
- [x] Overdrinking / hyponatremia reminder for races ≥ 4 hours (Oct 2026)
- [x] Optional sweat profile question in the form (light / average / salty, with sweat-test bands) (Oct 2026)

### Pending
- [ ] Continuous temperature input (replaces categorical conditions)
- [ ] Individual sweat-rate estimator tool (weigh before/after field test → feeds sodium/fluid targets)
- [ ] Formula versioning (reproducible plans even after research updates)

---

## 8. REFERENCES

1. **ISSN 2018** — International Society of Sports Nutrition Consensus Statement on Carbohydrate Intake in Sport
2. **Burke et al. (IOC 2019)** — International Olympic Committee Consensus Statement on Nutrition for Sport — duration-dependent carbohydrate framework
3. **Sawka et al. (ACSM 2007)** — Position Stand on Fluid Replacement During Exercise — sweat rate variability and hyponatremia risk
4. **Hew-Butler et al. (2015)** — Statement of the 3rd International Exercise-Associated Hyponatremia Consensus Development Conference, Br J Sports Med 49:1432–1446
5. **Barnes et al. (2019)** — Normative data for sweating rate, sweat sodium concentration and sweat sodium loss in athletes, J Sports Sci
6. **Jeukendrup & Chambers (2004)** — Oral carbohydrate sensing and exercise performance — basis for 45–60 min mouth-rinsing benefit
7. **Rollo & Williams (2011)** — Influence of mouth-rinsing a carbohydrate solution on 1 h running performance — CNS activation at sub-1-hour durations
8. **Coyle et al. / Masters Athletes Review (2020)** — Carbohydrate oxidation rates in masters endurance athletes — age-based CHO modifier rationale
9. **DGE Working Group Sports Nutrition (2020)** — Fluid Replacement in Sports, Dtsch Z Sportmed
10. **Baker (2017)** — Sweating rate and sweat sodium concentration in athletes: methodology and variability, Sports Med 47(Suppl 1):111–128
11. **Brown et al. (2022)** — Seasonal heat acclimatisation in healthy adults: a systematic review, Sports Med
12. **Hoffman & Stuempfle (2015)** — Sodium supplementation and exercise-associated hyponatremia during prolonged exercise, Med Sci Sports Exerc 47:1781–1787
13. **Del Coso et al. (2016)** — Effects of oral salt supplementation on physical performance during a half-ironman: a randomized controlled trial, Scand J Med Sci Sports 26:156
14. **Schwellnus (2009)** — Cause of exercise-associated muscle cramps, Br J Sports Med 43:401; **Schwellnus et al. (2011)** — Cramping in 210 Ironman triathletes, Br J Sports Med 45:650
15. **Sims et al. (2007)** — Sodium loading aids fluid balance and reduces physiological strain of trained men exercising in the heat, Med Sci Sports Exerc 39:123–130; **Sims et al. (2007)** — Preexercise sodium loading aids fluid balance and endurance for women exercising in the heat, J Appl Physiol 103:534–541
16. **Hamouti et al. (2014)** — Ingestion of sodium plus water improves cardiovascular function and performance during dehydrating cycling in the heat, Scand J Med Sci Sports 24:507–518
17. **McCubbin et al. (2018)** — Impact of sodium ingestion during exercise on endurance performance: a systematic review, Int J Sports Sci 8:97–107
18. **Lara et al. (2017)** — Sweat sodium loss influences serum sodium concentration in a marathon, Scand J Med Sci Sports 27:152–160

---

## 9. CONTINUOUS IMPROVEMENT

- Field feedback is more valuable than lab estimates — GI comfort reports, energy levels, and cramping data directly inform anchor adjustments
- The "Provided vs. Target" delta on every plan page creates a natural feedback loop — systematic mismatches may indicate product carb content updates are needed
- ISSN and IOC guidelines update on 3–5 year cycles — next major review expected 2028–2030
- Individual sweat-rate input remains the highest-priority accuracy improvement

---

**Last updated:** June 2026
**Next review:** June 2027, or upon major ISSN / IOC guideline update
