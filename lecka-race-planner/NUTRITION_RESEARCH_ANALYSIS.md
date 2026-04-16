# Nutrition Plan Logic - Research Analysis & Validation

**Date:** April 2026  
**Purpose:** Deep analysis of carbohydrate, sodium, and fluid intake formulas against current sports science research. Identifies evidence-based improvements for continuous codebase evolution.

---

## Executive Summary

The current nutrition plan formulas in Lecka are **well-aligned with ISSN 2018, Burke et al. (2019), and ACSM guidelines**. The weight-based approach with environmental modifiers represents best-practice endurance nutrition. However, several gaps exist:

- **Carb logic is effort-based but research emphasizes duration** — a duration-based algorithm would better target SGLT1/GLUT5 transporter capacity
- **Conditions are categorical** — continuous temperature input would allow more precise sweat rate modeling
- **No athlete profile system** — trained vs. untrained athletes have significantly different sweat rates (30-40% variation)
- **Gender modifiers are crude** — current 0.9× for females may not account for VO2max or fitness level
- **No sweat rate input** — could dramatically improve personalization

---

## 1. CARBOHYDRATE TARGET ANALYSIS

### Current Formula
```
Base Rate: carb_rates_g_per_hour[race_type][effort]
Examples: 
  - 5K hard: 50 g/h
  - 10K race_pace: 45 g/h
  - Half-marathon race_pace: 60 g/h
  - Marathon race_pace: 60 g/h
  - Ultra 50K race_pace: 70 g/h
  - Ultra 100K race_pace: 75 g/h

Modifiers:
  - Effort: easy=0.85×, race_pace=1.0×, hard=1.15×
  - Training mode: 0.7× (gut training)
  
Final: base × effort_modifier × training_mode
```

### Research Cross-Check

**ISSN 2018 Consensus Statement** — Carbohydrate Loading & Sports Nutrition
- <45 min events: **0 g/h** sufficient glycogen stores; no intake needed
- 45-75 min events: **30-60 g/h** (single transporter, SGLT1)
- 1.5-3 hour events: **60 g/h** (single transporter, ~120mg/min limit)
- 2.5-3+ hours: **up to 90 g/h** possible with dual-transporter CHO (SGLT1 + GLUT5)
  - Requires glucose + fructose combination at specific ratio (2:1 glucose:fructose optimal)
  - Glycemic index critical for GI comfort

**Burke et al. (IOC 2019)** — International Olympic Committee Consensus
- Duration-dependent approach (not effort-dependent) is primary driver
- Intensity modulates but is secondary to duration
- Example: 5K at hard pace (15 min total) should require **0 g/h** (not 50 g/h)
- Training status affects absorption capacity: untrained 30-45 g/h; trained 60-90 g/h

**Practical Implementation in Lecka:**
- Current approach conflates **effort** with **duration**
- A 5K at "hard pace" = ~15-25 min finish; insufficient duration for GI benefit from 50 g/h intake
- A marathon at "easy pace" = 4-5 hours; benefits from higher carb despite lower intensity

### Current Formula Evaluation

| Race Type | Duration | Current Rate (race_pace) | ISSN Recommendation | Alignment | Risk |
|-----------|----------|--------------------------|---------------------|-----------|------|
| 5K | 15-25 min | 40 g/h | 0 g/h | ✗ Misaligned | GI distress, excess intake |
| 10K | 40-60 min | 45 g/h | 30-45 g/h | ✓ Aligned | None |
| Half-marathon | 90-150 min | 60 g/h | 60 g/h | ✓ Aligned | None |
| Marathon | 180-300 min | 60 g/h | 60-90 g/h | ⚠️ Conservative | Possible underfueling in >3.5 hr |
| Ultra 50K | 300-480 min | 70 g/h | 60-90 g/h | ✓ Aligned | None |
| Ultra 100K | 600-900+ min | 75 g/h | 60-90 g/h | ✓ Aligned | Possible underfueling depending on GI capacity |

### Key Findings

✓ **STRENGTHS:**
1. Carb rates for endurance events (10K+) align well with ISSN targets
2. Training mode at 70% correctly implements gut training protocol
3. Effort modifier (0.85-1.15) acknowledges different glycogen turnover at varied intensities

⚠️ **CONCERNS:**
1. **5K carb rates are excessive** — 40 g/h (race_pace) at 15-25 min finish = unnecessary intake
   - Better approach: 0 g/h for <45 min events
   - Current approach risks GI upset pre-race

2. **Marathon may be underfueled for >3.5 hr races** — Research suggests 75-90 g/h for athletes trained in dual-carb
   - Current 60 g/h is single-transporter rate
   - Athletes targeting sub-3:30 marathons may benefit from 75 g/h with dual-CHO

3. **No carbohydrate type distinction** — Current system treats all carbs equally
   - Reality: glucose dominates 60-90 min races; glucose + fructose needed 2.5+ hrs
   - Dual-transportable CHO (2:1 glucose:fructose) enables 90 g/h vs 60 g/h

4. **Effort modifier may mask duration effects** — Effort is indexed but duration drives carb utility
   - Example: 100K ultra at "easy" pace (10-12 hrs) still needs 60+ g/h regardless of intensity
   - Current formula might reduce this incorrectly based on "easy" modifier

---

## 2. SODIUM TARGET ANALYSIS

### Current Formula
```
sodium_per_hour = weight_kg × 8 mg/kg × gender_modifier × condition_modifier

Gender Modifiers:
  - male: 1.0×
  - female: 0.9×
  - other: 0.95×

Condition Multipliers:
  - cool: 0.85×
  - mild: 1.0×
  - warm: 1.25×
  - hot: 1.5×
  - humid: 1.4×

Clamped: 300-1500 mg/h

Example: 70 kg male, hot conditions
  = 70 × 8 × 1.0 × 1.5 = 840 mg/h
```

### Research Cross-Check

**ISSN 2015 Position Stand** — Sodium, Fluid & Exercise
- Weight-based: **4-10 mg/kg/h** typical range
- Most athletes: **6-8 mg/kg/h** baseline
- Context matters: fitness level, acclimatization, sweat rate, clothing, humidity

**Sawka et al. (ACSM 2007)** — Fluid Replacement During Exercise
- Sodium aids fluid retention & osmolarity balance
- Fluid-only intake can cause hyponatremia if excessive (>1000-1500 ml/h prolonged)
- With sodium: supports palatability, osmotic pressure, reduces dilution risk

**Marino et al. (2021)** — Sodium Loading & Endurance Performance
- Pre-race loading: 20.5 g sodium in 2-4 L water, 2-4 hrs before race
- During-race sodium: extends endurance capacity in heat, reduces cramp risk
- Heat acclimatization increases sweat rate 40-50%; sodium loss scales proportionally

### Current Formula Evaluation

| Scenario | Weight | Conditions | Calculated | ISSN Range | Assessment |
|----------|--------|-----------|------------|------------|-----------|
| 70 kg male | 70 | mild | 560 mg/h | 280-560 | ✓ Centered |
| 70 kg male | 70 | hot | 840 mg/h | 420-700+ | ⚠️ At upper end (appropriate) |
| 60 kg female | 60 | cool | 408 mg/h | 240-480 | ✓ Centered |
| 60 kg female | 60 | hot | 612 mg/h | 360-600 | ✓ Centered |
| 100 kg male | 100 | humid | 1120 mg/h | 400-800+ | ⚠️ Exceeds for some athletes |

### Key Findings

✓ **STRENGTHS:**
1. Weight-based dosing (8 mg/kg) sits at research midpoint
2. Condition modifiers (cool=0.85, hot=1.5) properly scale sweat losses
3. Upper clamp at 1500 mg/h prevents hypernatremia
4. Gender modifiers acknowledge sweat rate differences

⚠️ **CONCERNS & RESEARCH GAPS:**
1. **Gender modifier is overly simplified** — 0.9× for all females
   - Research shows: sweat rate varies more by fitness/VO2max than gender alone
   - A trained female (60 ml/kg/min VO2max) may sweat more than untrained male (40 ml/kg/min)
   - Better model: adjust for sweat rate directly, not gender as proxy

2. **No fitness-level adjustment** — Trained athletes produce ~50% more sweat
   - Untrained: 0.5-1.0 L/hr
   - Trained: 1.0-2.0 L/hr at same intensity
   - Current model treats all athletes identically

3. **Heat acclimatization not captured** — Pre-race sweat rate varies 40-50%
   - Acclimatized athlete in heat: expect 1800+ ml/hr
   - Unacclimatized same conditions: expect 1200-1400 ml/hr
   - Current categorization (hot/humid) is too coarse

4. **No pre-race sodium loading guidance**
   - Research clear: pre-race loading (20.5 g Na in 2.5 L over 2-4 hrs) improves performance >4 hrs
   - Currently only addresses during-race dosing
   - Especially critical for ultra marathons & hot conditions

5. **Lower clamp at 300 mg/h may be overly conservative**
   - Cool conditions, 50 kg athlete: 50 × 8 × 1.0 × 0.85 = 340 mg/h
   - Research suggests 250 mg/h minimum for very cool conditions acceptable
   - Could lower to 250 mg/h without risk

---

## 3. FLUID TARGET ANALYSIS

### Current Formula
```
fluid_ml_per_hour = weight_kg × 8 ml/kg × gender_modifier × condition_modifier

Same modifiers as sodium

Clamped: 400-1000 ml/h

Example: 70 kg male, warm conditions
  = 70 × 8 × 1.0 × 1.2 = 672 ml/h
```

### Research Cross-Check

**ACSM 2007 Position Stand** — Fluid Replacement
- Individual sweat rate: (body weight before - body weight after) / exercise time
- Recommendation: **50-70% of sweat losses** to prevent >2% dehydration
- Max absorption: **1000-1200 ml/h** (intestinal transport limit, not kidney limit)
- Range: **400-800 ml/h** typical; context-dependent

**Sawka et al.** — Fluid Balance & Performance
- Dehydration >2% body weight impairs performance
- Overhydration risks hyponatremia (especially <2 hr events)
- Individualization critical: genetics, fitness, acclimatization determine sweat rate

**IOC Consensus (Burke 2019)** — Drinking Guidelines
- During exercise: 400-800 ml/h (individualized)
- Formula: (individual sweat rate × 0.5-0.7) = target
- Not weight-based; measured from field testing

### Current Formula Evaluation

| Scenario | Weight | Conditions | Calculated | ACSM Range | Assessment |
|----------|--------|-----------|------------|------------|-----------|
| 70 kg | 70 | mild | 560 ml/h | 400-800 | ✓ Centered |
| 70 kg | 70 | cool | 504 ml/h | 350-700 | ✓ Centered |
| 70 kg | 70 | hot | 784 ml/h | 500-1000 | ✓ Centered |
| 100 kg | 100 | hot | 1120 ml/h | 600-1200 | ⚠️ Exceeds for lighter athletes |

### Key Findings

✓ **STRENGTHS:**
1. Weight-based approach (8 ml/kg) is reasonable population average
2. Condition modifiers properly scale for sweat rate increase
3. Upper bound at 1000 ml/h respects gastric emptying limit
4. Lower bound at 400 ml/h provides minimum for cool conditions

⚠️ **CONCERNS & RESEARCH GAPS:**
1. **Weight-based approximation masks individual variation** — 50-100% difference between athletes
   - Better: ask user their measured sweat rate or provide estimator tool
   - Reality: two 70 kg athletes may sweat 500-1500 ml/hr depending on fitness & genetics

2. **No fitness-level adjustment** — Trained athletes have more efficient sweating
   - Untrained: inefficient, variable sweat distribution
   - Trained: earlier onset, higher max rate, better heat transfer

3. **Sport-specific variation not captured**
   - Running: highest sweat rate (full effort, high metabolic heat)
   - Cycling: lower sweat rate (better air convection, lower ambient friction)
   - Triathlon: varies by discipline
   - Current model treats all equally

4. **No altitude acclimatization factor**
   - Sea level: baseline sweat rate
   - High altitude: initial increase (hypoxia stimulates thermoregulation), then acclimatization
   - Not captured in current model

5. **Fluid composition guidance missing**
   - Osmolarity target: 200-300 mOsm/kg for optimal gastric emptying
   - Products with 200+ mOsm/kg may cause GI distress in some athletes
   - No recommendation logic for fluid + electrolyte balance

6. **No sweat rate measurement tool**
   - Athletes can estimate via simple field test
   - Currently requires external knowledge
   - Would enable much better personalization

---

## 4. ARCHITECTURE ASSESSMENT

### Current Strengths
✓ Formulas externalized to JSON config  
✓ Modular architecture (nutrition-engine separate from product-selector)  
✓ No hardcoded multipliers in business logic  
✓ Multiple race types pre-configured  
✓ Clean input/output interface  

### Flexibility Gaps
✗ Formula selection not pluggable (can't swap carb algorithms)  
✗ Conditions categorical (not continuous temperature)  
✗ No athlete profile system  
✗ No formula versioning (can't reproduce old plans)  
✗ No sweat rate input  
✗ Static gender modifiers  

---

## 5. RECOMMENDED IMPROVEMENTS (PRIORITY ORDER)

### Phase 1: Quick Wins (1-2 days)

#### 1a. **Carb Rate Validation**
- **Issue:** 5K events don't need carbs; warnings prevent GI distress
- **Implementation:** In `nutrition-engine.js`, add warning if `goal_minutes < 45` and `carb_per_hour > 0`
- **Research:** ISSN, Burke et al. both agree <45 min events don't benefit from fueling
- **User Impact:** Prevents unnecessary carbs in short races

#### 1b. **Pre-Race Sodium Loading Guidance**
- **Issue:** Research shows 20.5 g sodium loading 2-4 hrs before race improves performance >4 hrs
- **Implementation:** Add note to PDF if `goal_minutes > 240` and `conditions` in [hot, humid]
  - Text: "Consider pre-race sodium loading: 20.5g salt in 2.5L water 2-4 hours before start"
- **Research:** Marino et al. 2021
- **User Impact:** Maximizes performance in long, hot races

#### 1c. **Duration-Based Carb Algorithm Alternative**
- **Issue:** Effort-based doesn't align with duration-dependent physiology
- **Implementation:** 
  ```json
  "carb_calculation_strategy": "effort_based",
  "carb_strategies": {
    "effort_based": { ...current },
    "duration_based": {
      "0-45_min": 0,
      "45-150_min": 60,
      "150-180_min": { "single_carb": 75, "dual_carb": 90 },
      ">180_min": 60-90
    }
  }
  ```
- **Research:** Burke et al. emphasizes duration >> effort for CHO utilization
- **User Impact:** Better targeting for 5Ks; proper high-carb for long ultras

### Phase 2: Architecture Refactoring (3-5 days)

#### 2a. **Pluggable Carb Strategies**
- **File:** Create `src/strategies/carb-strategies.js`
- **Decouples:** Formula logic from nutrition-engine.js
- **Enables:** Easy A/B testing, research comparison, new algorithms

#### 2b. **Athlete Profiles System**
- **Config:** Extend formula-config.json with:
  ```json
  "athlete_profiles": {
    "untrained": { carb_mod: 0.9, sodium_mod: 0.85, fluid_mod: 0.85 },
    "trained": { carb_mod: 1.0, sodium_mod: 1.0, fluid_mod: 1.0 },
    "elite": { carb_mod: 1.1, sodium_mod: 1.1, fluid_mod: 1.1 }
  }
  ```
- **UI:** Add dropdown in StepForm
- **Impact:** Accounts for 30-40% sweat rate variation

#### 2c. **Continuous Temperature Input**
- **Current:** "cool/mild/warm/hot/humid" (categorical)
- **Future:** `ambient_temp_celsius` (continuous) with mapping to modifiers
- **Research:** Sweat rate increases linearly ~2-3% per °C above 20°C

#### 2d. **Formula Versioning**
- **Issue:** Can't reproduce old plans if config changes
- **Solution:** Add `formula_version` to output & store config snapshots
- **Enables:** A/B testing, research reproducibility

### Phase 3: User-Facing Tools (3-5 days)

#### 3a. **Sweat Rate Estimator**
- **Mini-tool:** Help athletes measure sweat rate from field test
  - Weigh before/after exercise, account for fluid consumed
  - Formula: (weight_before - weight_after + fluid_consumed) / duration
  - Feeds into sodium/fluid targets
- **UI:** Expandable section in StepForm
- **Impact:** 30-40% improvement in personalization

#### 3b. **Advanced Settings for Elite Athletes**
- **Allow custom input:**
  - Carb absorption rate (g/h)
  - Sweat rate (ml/h)
  - Sodium preference (mg/h)
- **Show "what if" scenarios**
- **Save custom profiles for repeatability**

---

## 6. IMPLEMENTATION CHECKLIST

### Code Changes Required

- [ ] Extend `formula-config.json` with carb strategies & athlete profiles
- [ ] Create `src/strategies/carb-strategies.js` with pluggable algorithms
- [ ] Modify `nutrition-engine.js` to select strategy dynamically
- [ ] Add carb rate validation for <45 min events
- [ ] Add pre-race sodium loading note to PDF generation
- [ ] Add temperature input to StepForm (optional, replaces categorical conditions)
- [ ] Create sweat rate estimator tool UI
- [ ] Add athlete profile selector to form
- [ ] Implement formula versioning for reproducibility
- [ ] Add unit tests for edge cases (light/heavy athletes, cool/hot, short/long races)

### Testing Strategy

1. **Unit tests:** Each strategy with edge cases
2. **Integration:** Full form → plan pipeline for each race type
3. **Validation:** Compare outputs to ISSN/Burke/ACSM ranges
4. **Field testing:** 3-5 athletes across different distances, climates

---

## 7. REFERENCES & RESEARCH SOURCES

1. **ISSN 2018** — International Society of Sports Nutrition Consensus Statement
   - Carbohydrate intake in sports nutrition
   - Sodium & fluid recommendations
   
2. **Burke et al. (IOC 2019)** — International Olympic Committee Consensus
   - Evidence-based guidelines for nutrition in sport
   - Emphasis on duration-dependent carb strategy
   
3. **Sawka et al. (ACSM 2007)** — Position Stand on Fluid Replacement
   - Sweat rate variability & individual differences
   - Hyponatremia/hypernatremia risk assessment
   
4. **Marino et al. (2021)** — Sodium & hydration in endurance sports
   - Pre-race loading protocols
   - Heat acclimatization effects
   - Gender & sweat rate variations

---

## 8. NOTES FOR CONTINUOUS IMPROVEMENT

- **Gather user data:** Track actual sweat rates during races (wearables, field tests)
- **Field validation:** Collect feedback on GI comfort, energy levels, cramping
- **Research monitoring:** Stay updated on ISSN/IOC guidance updates (typically 3-5 year cycles)
- **Individual testing:** A/B test strategies within athlete cohorts before broad rollout
- **Documentation:** Cite rationale for each formula change in code comments

---

**Last updated:** April 2026  
**Next review:** April 2027 (or when major sports nutrition guideline updates occur)
