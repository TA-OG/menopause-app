# Extraction — `sleep-fatigue` framework  (PILOT)

Target framework: [content/wellness/frameworks/sleep-fatigue.yaml](../../content/wellness/frameworks/sleep-fatigue.yaml)
Triggers on: `symptoms` = `sleep_problems` or `fatigue`.

**Source files read for this framework (all opened in full, not assumed):**
Your Perimenopause and Menopause Sleep Survival Guide · SleepCATION · Sleep-Inducing Dinners ·
Perimenopause Fatigue (Bloating, Low Energy & Menopause) · herbs_for_energy · Morning Energy
Optimisation · 5-Minute Energy Resets · "Your Guide to a Hormonal Friendly Day" (in 24-hour
Autophagy Fast) · Module Nine HGH · Podcast script ("I'm not sure where I am in menopause").

Read the conventions + the hard rule in [README.md](README.md) before reviewing.
Everything below is DRAFT for Pamela's sign-off. Doses are reproduced **only where her source
states them**; "none stated" means the source gave no dose and we have not invented one.

---

## A. DIET

### A1. Sleep-supportive evening meals (tryptophan + magnesium + complex carbs)
- **Source:** Sleep-Inducing Dinners
- **What Pamela says:** A recipe set of 6 dinners "designed to provide essential nutrients… that
  help regulate the melatonin hormone." Per-recipe rationale she gives: salmon = omega-3; sweet
  potato = complex carbs + vitamin B6 → melatonin; turkey/chicken = tryptophan → melatonin;
  chickpeas = "boosts serotonin… tryptophan and magnesium"; quinoa = complex carbs → melatonin;
  lentils = complex carbs, brown rice = magnesium; asparagus = "rich in antioxidants and helps
  regulate blood sugar levels." 6 dishes: grilled salmon + sweet potato + broccoli; turkey & veg
  stir-fry; chickpea curry + basmati; chicken & quinoa bowl with spinach; lentil & brown rice bowl
  with grilled asparagus; jerk chicken with sweet-potato mash. (Bonus: 20 African/Caribbean recipes
  via code "MPOWDER".)
- **Maps to:** sleep-fatigue / `diet`
- **targets_symptoms:** sleep_problems
- **Status:** ENRICHES `df_sleep_tryptophan` (adds the evening-meal application + recipes). The 6
  recipes themselves are **recipe content** → better suited to a Learn/recipes surface than a
  framework rec.
- **Dose in source:** n/a (food)
- **Draft app copy:** "Some women find a tryptophan- and magnesium-rich evening meal helps them
  wind down — for example oily fish, turkey or chicken, or chickpeas and lentils, paired with a
  complex carb like sweet potato, quinoa or brown rice. These foods provide the building blocks
  your body uses to make melatonin. It's a gentle thing to try, not a prescription."
- **Flags:** "MPOWDER" promo + branding → strip. Recipes are African/Caribbean-inclusive — good
  fit for the app's cultural-context engine; route there.

### A2. Don't eat a large, high-carb meal late at night
- **Source:** Sleep Survival Guide ("Don't eat a huge bowl of pasta at 9 PM and wonder why you're
  awake at 2 AM with blood sugar chaos")
- **Maps to:** sleep-fatigue / `diet` (timing)
- **targets_symptoms:** sleep_problems
- **Status:** ENRICHES `df_energy_blood_sugar` / `lf_wind_down`
- **Dose in source:** n/a
- **Draft app copy:** "Some women find that a large, carb-heavy meal late in the evening leads to
  a 2–3am wake-up as blood sugar dips. Eating your main carbs earlier, and keeping a late meal
  lighter and balanced with protein, is a simple thing to try."
- **Flags:** none.

### A3. Stop eating at least 5 hours before bed
- **Source:** "Your Guide to a Hormonal Friendly Day" (in 24-hour Autophagy Fast)
- **Maps to:** sleep-fatigue / `lifestyle` or `diet` (timing)
- **targets_symptoms:** sleep_problems
- **Status:** NEW
- **Dose in source:** "Stop eating at least 5 hours before bed" (verbatim)
- **Draft app copy:** "Some women find leaving a few hours (Pamela suggests around 5) between
  their last meal and bed helps them sleep more soundly. Worth experimenting with what gap suits
  you."
- **Flags:** Frame as her suggestion; the "5 hours" is hers, reproduced as-is. Not suitable to
  push hard for anyone who needs to eat closer to bed (e.g. blood-sugar conditions, medication
  timing) — keep gentle.

---

## B. LIFESTYLE

### B1. Chew thoroughly; don't drink fluids with meals
- **Source:** Perimenopause Fatigue ("Most only chew 5–10 times"; chewing properly "reduces
  bloating, supports hormone balance, improves nutrient absorption… helps stabilise your energy");
  Mood Swings SMART podcast ("chewing your food 30 to 40 times before swallowing… not drinking
  water… with your meals because… it dilutes your digestive enzymes").
- **Maps to:** sleep-fatigue / `lifestyle` (also relevant to weight/gut)
- **targets_symptoms:** fatigue
- **Status:** NEW
- **Dose in source:** "chew 30–40 times"; "chew 5–10 times" (current habit she observes)
- **Draft app copy:** "Some women find that slowing down at meals — chewing thoroughly and not
  washing food down with a big drink — eases bloating and afternoon energy dips. It's an easy,
  no-cost thing to try."
- **Flags:** "supports hormone balance" is Pamela's framing — keep soft, don't assert as fact.

### B2. Consistent earlier bedtime (before ~11pm), aim for adequate sleep
- **Source:** Module Nine HGH ("Sleep is vital… aim for 8 hours"); Module Two ("Sleep before
  11pm"); Hormonal Friendly Day ("Sleep 6 hours or more")
- **Maps to:** sleep-fatigue / `lifestyle`
- **targets_symptoms:** sleep_problems, fatigue
- **Status:** ENRICHES `lf_sleep_consistency`
- **Dose in source:** "before 11pm"; "6 hours or more"; "8 hours"
- **Draft app copy:** "Some women find a consistent, earlier bedtime makes the biggest difference
  to how rested they feel. Pamela suggests aiming to be asleep before around 11pm."
- **Flags:** **Minor tension** with existing `lf_sleep_consistency`, which states *wake time* is
  the primary anchor and warns against fixating on bedtime. Not a contradiction (both can be
  true), but Pamela leans bedtime-first — surface to Pamela so the combined message is coherent.

### B3. Calming essential oils for sleep (aromatherapy)
- **Source:** SleepCATION
- **What Pamela says:** "5 calming essential oils for sleep and relaxation: Lavender, Vetiver,
  Cedarwood, Roman Chamomile, Ylang Ylang. Add a few drops on your pillow or a diffuser."
- **Maps to:** sleep-fatigue / `lifestyle`
- **targets_symptoms:** sleep_problems
- **Status:** NEW
- **Dose in source:** "a few drops on your pillow or a diffuser"
- **Draft app copy:** "Some women find a calming scent at bedtime — lavender, chamomile, cedarwood,
  vetiver or ylang ylang in a diffuser or a few drops on the pillow — helps them relax into sleep."
- **Flags:** Aromatherapy = applied/inhaled, not ingested → low risk, but keep "some women find".
  Note generic allergy caution (skin/pillow contact). Not a medical claim.

### B4. "Sleepcation" wind-down ritual
- **Source:** SleepCATION ("Set a date in the diary; wear your favourite PJs; add calming essential
  oils; create a relaxing atmosphere/soothing ambiance; unplug 12 hours; eat breakfast in bed")
- **Maps to:** sleep-fatigue / `lifestyle`
- **targets_symptoms:** sleep_problems
- **Status:** ENRICHES `lf_wind_down`
- **Dose in source:** "unplug 12 hours"
- **Draft app copy:** "Some women find planning a deliberate 'sleepcation' — a screen-free
  evening, a calming atmosphere, a proper wind-down — resets a stretch of bad nights."
- **Flags:** none.

### B5. Morning energy routine (intention · breathing breaks · daylight · gratitude)
- **Source:** Morning Energy Optimisation checklist
- **What Pamela says:** Set an intention for the day; schedule mindfulness/deep-breathing breaks
  (min 4–5 min, "minimum of 4–5 breaks/day"); "morning detoxification drink"; "energising
  breakfast"; "expose your eyes to natural daily light minimum 20 minutes"; "three things you are
  grateful for."
- **Maps to:** sleep-fatigue / `lifestyle` (+ overlaps mood/stress)
- **targets_symptoms:** fatigue
- **Status:** Mixed — daylight = DUPLICATE `lf_morning_light`; intention / scheduled breathing
  breaks / gratitude / energising breakfast = NEW.
- **Dose in source:** "minimum 4–5 min breaks, 4–5/day"; "natural light minimum 20 minutes"
- **Draft app copy:** "Some women find a short morning routine sets their energy for the day:
  daylight on your eyes, an energising breakfast, a couple of minutes of slow breathing, and
  noting three things you're grateful for."
- **Flags:** "morning detoxification drink" — **unspecified** (no recipe/ingredients given) and
  "detox" is a non-clinical claim → **omit** from app copy rather than guess what it is.

### B6. Scheduled micro-breathing breaks through the day
- **Source:** Morning Energy Optimisation ("deep breathing breaks… minimum 4–5 min breaks/day")
- **Maps to:** sleep-fatigue / `lifestyle` (also stress)
- **targets_symptoms:** fatigue
- **Status:** NEW
- **Draft app copy:** "Some women find scheduling a few short breathing breaks across the day
  (even 4–5 minutes) steadies their energy and stress."
- **Flags:** none.

---

## C. MINDSET / EDUCATION

### C1. Why you wake at 2–3am — the hormonal picture (validation + mechanism)
- **Source:** Sleep Survival Guide
- **What Pamela says:** In perimenopause progesterone drops first; it converts to allopregnanolone
  ("basically nature's chill pill") which tells the brain "relax, go to sleep." When it drops you
  lose that natural calming mechanism, the body "pumps out more cortisol," and "you wake up at 2 or
  3 AM like someone set an alarm — your blood sugar has crashed and your body's like EMERGENCY WAKE
  UP." "This isn't in your head. This is actual hormonal chaos." "You're not crazy… Your hormones
  are legitimately messed up right now, and that's fixable."
- **Maps to:** sleep-fatigue / `mindset`
- **targets_symptoms:** sleep_problems
- **Status:** NEW (validation/education — high value, non-prescriptive)
- **Draft app copy:** "If you wake reliably at 2–3am, you're not imagining it. As progesterone
  falls in perimenopause, the body's natural night-time calming signal weakens and stress hormones
  and blood-sugar dips can jolt you awake. It's a real hormonal shift — not a character flaw — and
  there are gentle things that can help. If sleep is badly affected, do talk to your GP."
- **Flags:** Keep mechanism described as explanation, not a diagnosis. Ends with GP signpost.

### C2. Your daily cortisol rhythm (and what "off" feels like)
- **Source:** Podcast script ("I'm not sure where I am in menopause")
- **What Pamela says:** Cortisol "needs to be high in the morning so we get out of bed… and
  gradually declines as the day goes on so that we fall asleep." High at night → "jittery…
  racing thoughts, unable to sleep." Low in the morning → no energy.
- **Maps to:** sleep-fatigue / `mindset`
- **targets_symptoms:** fatigue, sleep_problems
- **Status:** NEW (education)
- **Draft app copy:** "Energy is meant to follow a daily rhythm — higher in the morning, easing
  off by night so you can sleep. When that rhythm flips (wired at night, flat in the morning),
  it's a sign your stress-hormone pattern may be off, which is common in this transition."
- **Flags:** none.

### C3. Fatigue is cellular, not weakness — "it's not about pushing harder"
- **Source:** Perimenopause Fatigue (mitochondria slow → low energy, brain fog, sluggish digestion,
  less motivation; "It's not 'in your head', it's happening at a cellular level"; "it's not about
  pushing harder… support your body from the inside out")
- **Maps to:** sleep-fatigue / `mindset`
- **targets_symptoms:** fatigue
- **Status:** ENRICHES `mr_fatigue_self_compassion`
- **Draft app copy:** "Perimenopausal fatigue is physical, not a willpower problem — hormonal
  shifts affect how your cells produce energy. The answer usually isn't pushing harder, it's
  supporting your body and resting without guilt."
- **Flags:** "MNM (Mitochondrial Nutrient Mix)" is named here as the solution → see E5 (ESCALATE).
  Keep this mindset rec free of the product reference.

### C4. Five-minute energy resets (micro-practices)
- **Source:** 5-Minute Energy Resets by Pamela Windle
- **What Pamela says:** 5 short practices — Breath Break (inhale 4, hold 2, exhale 6, ×5 rounds);
  Ground-and-Go (feet flat, 3 breaths, "I am here now"); Shake It Out (2 min shaking); Digital
  Detox Minute (step away from screens); Heart Touch (hand on heart + belly, 3 breaths).
- **Maps to:** sleep-fatigue / `mindset` or `lifestyle` (also mood/anxiety/stress)
- **targets_symptoms:** fatigue
- **Status:** NEW
- **Draft app copy:** "Some women find a 5-minute reset helps when energy dips — a few slow breaths
  (in for 4, hold 2, out for 6), a stretch and a moment away from screens can interrupt stress and
  restore focus."
- **Flags:** The breathing pattern is hers, reproduced as-is. Low risk. Strong reuse candidate
  across mood/anxiety/high-stress frameworks too.

### C5. Becoming a smarter supplement buyer (quality literacy)
- **Source:** Sleep Survival Guide ("Quality Matters" + "What to Look FOR")
- **What Pamela says:** Look for third-party testing — "NSF Certified, USP Verified,
  ConsumerLab.com tested, Informed Choice"; clear dosing; minimal ingredients; non-GMO/gluten-free.
  Prefer "magnesium glycinate instead of magnesium oxide (which is cheap and can give you
  diarrhoea)." Avoid artificial colours/dyes, magnesium stearate, unnamed "proprietary blends,"
  fillers, and silicon dioxide high in the ingredient list. "Read the actual ingredient list, not
  just the front label."
- **Maps to:** sleep-fatigue / `mindset` (education) — broadly reusable
- **targets_symptoms:** n/a (meta-guidance)
- **Status:** NEW
- **Draft app copy:** "If you do choose to try a supplement, it's worth being a careful buyer:
  look for independent testing (NSF, USP, Informed Choice), clear dosing, and a short ingredient
  list — and read the back, not just the front. As always, check with your GP or pharmacist first."
- **Flags:** Generic, brand-neutral, empowering — safe. Do **not** reproduce her named favourite
  brands (see E-flags).

---

## D. SUPPLEMENTS — CANDIDATE (with Pamela's caveat + GP gate)

> All of the following require the hard-rule framing and a disclaimer. Where Pamela's source gives
> no dose, app copy must **not** state one.

### D1. Magnesium glycinate
- **Source:** Sleep Survival Guide; Mood Swings podcast
- **Dose in source:** "300–400mg before bed" (Sleep Survival). Existing framework rec
  `ss_magnesium_sleep` says **200–400mg**.
- **Status:** DUPLICATE of `ss_magnesium_sleep` — but a **dose discrepancy** (300–400 vs 200–400).
- **Action for Pamela:** confirm the range to standardise. Until confirmed, keep the existing
  200–400mg (more conservative lower bound). Do not silently change.
- **Flags:** none beyond standard disclaimer.

### D2. L-theanine
- **Source:** Sleep Survival Guide
- **Dose in source:** "200–400mg before bed"
- **Status:** NEW
- **What Pamela says:** "boosts your calming brain chemicals (GABA, serotonin) without making you
  groggy… quiets the noise. Great for when your brain won't shut up."
- **Draft app copy:** "Some women find L-theanine helps quiet a racing mind at bedtime without
  making them groggy. It's a suggestion that has worked for many — please check with your GP or
  pharmacist first, particularly if you take medication for blood pressure."
- **Flags:** Pamela notes a theoretical interaction with blood-pressure medication (consistent with
  the existing mood framework's L-theanine note). Include that caveat.

### D3. Lemon balm
- **Source:** Sleep Survival Guide
- **Dose in source:** "500mg–3g before bed" (also "can drink it as a tea")
- **Status:** NEW
- **What Pamela says:** "studies show that taking it for 8 weeks significantly reduces anxiety,
  stress, depression, and sleep problems… works really well with magnesium and L-theanine."
- **Draft app copy:** "Some women find lemon balm — as a capsule or a tea before bed — helps them
  feel calmer and sleep more easily. A suggestion that's worked for many; check with your GP or
  pharmacist first."
- **Flags:** Her "studies show…" claim — keep softened ("some women find") rather than reproduce as
  a clinical guarantee.

### D4. Jatamansi  (optional, per Pamela)
- **Source:** Sleep Survival Guide
- **Dose in source:** "500mg before bed"
- **Status:** NEW (marked "optional" by Pamela)
- **What Pamela says:** "Ayurvedic herb… boosts GABA… really helpful if anxiety is keeping you up.
  Just don't overdo it — too much can upset your stomach. And skip it if you're pregnant."
- **Draft app copy:** "Some women find the Ayurvedic herb jatamansi calming at night. A suggestion
  that's worked for many — not suitable in pregnancy, and please check with your GP or pharmacist
  first."
- **Flags:** Less familiar herb / thinner evidence base → consider whether the app wants to include
  it at all. Include her "not in pregnancy" caveat. **Pamela to confirm she wants this in-app.**

### D5. Energy adaptogens (8 herbs) — **no doses stated in source**
- **Source:** herbs_for_energy
- **What Pamela says (verbatim "how it helps"):**
  - **Liquorice root** (Glycyrrhiza glabra) — "Supports adrenal function… energy depleted by chronic
    stress and high cortisol." *Her stated contraindication: "not recommended for those with high
    blood pressure."*
  - **Maca** (Lepidium meyenii) — "hormonal balance, sustained energy and stamina… helps with
    fatigue, mood and libido."
  - **Ashwagandha** (Withania somnifera) — "regulate cortisol, supports thyroid function and restores
    energy."
  - **Rhodiola** (Rhodiola rosea) — "resistance to physical and mental fatigue… brain fog, low
    motivation."
  - **Siberian ginseng** (Eleutherococcus senticosus) — "adrenal health and sustained energy without
    overstimulating."
  - **Nettle** (Urtica dioica) — "rich in iron, magnesium and B vitamins… heavy, dragging fatigue
    linked to low iron."
  - **Holy basil / Tulsi** (Ocimum tenuiflorum) — "regulates cortisol… wired-but-tired feeling and
    brain fog."
  - **Spirulina** (Arthrospira platensis) — "iron, B vitamins and plant protein… physical depletion."
  - **Her disclaimer (verbatim):** "Please consult a qualified practitioner before starting any new
    herb or supplement, particularly if you are on medication, have an existing health condition, or
    are pregnant. Liquorice root is not recommended for those with high blood pressure."
- **Dose in source:** **none stated for any** — app copy must not state doses.
- **Status:** NEW — all CANDIDATEs, **including liquorice** (its blood-pressure contraindication
  goes in the disclaimer). Ashwagandha already appears in `high-stress` and `mood-anxiety-brain-fog`
  frameworks → cross-ref for consistency (reuse the thyroid/pregnancy caveat already written there).
- **Draft app copy (example, maca):** "Some women find an adaptogen like maca supports energy,
  mood and libido through perimenopause. Adaptogens are a suggestion that has worked for many —
  please check with your GP or pharmacist first, especially if you take any medication, have a
  health condition, or are pregnant."
- **Draft app copy (liquorice, with its contraindication):** "Some women find liquorice root
  supports flagging energy and adrenal recovery. A suggestion that's worked for many — **not
  suitable if you have high blood pressure** — and please check with your GP or pharmacist first."
- **Flags:** No doses → never invent. Maca's hormone-axis caveat already noted in `sexual-health`
  framework — reuse. Liquorice's blood-pressure contraindication is carried in its disclaimer.

---

## D (cont.) — items reclassified from "hold" to CANDIDATE per the app's model

> These carry a larger effect, so the disclaimer carries the specific contraindication Pamela
> states. Doses are hers, reproduced and framed as a suggestion — never an instruction.

### D6. Berberine
- **Source:** Sleep Survival Guide
- **Dose in source:** "500mg with dinner… up to two capsules a day"
- **What Pamela says:** helps "stabilise your blood sugar so you're not crashing in the middle of
  the night… can upset your stomach at first, so start slow and always take it with food."
- **Draft app copy:** "Some women find berberine (around 500mg with a meal) helps steady overnight
  blood sugar and reduce 2–3am wake-ups. It can unsettle the stomach at first, so many start low
  and take it with food. A suggestion that's worked for many — **please check with your GP or
  pharmacist first, especially if you take medication for diabetes or blood sugar**, as berberine
  can lower blood glucose."
- **Flags:** Interacts with diabetes/other meds — contraindication carried in the disclaimer.

### D7. Vitex / Chasteberry
- **Source:** Sleep Survival Guide
- **Dose in source:** "400–800mg in the morning"
- **What Pamela says:** "works on your pituitary gland to help your body make a bit more
  progesterone naturally… takes 2–3 months to really kick in."
- **Draft app copy:** "Some women in perimenopause find vitex (chasteberry), taken in the morning,
  supports their own progesterone balance over a couple of months. A suggestion that's worked for
  many — **not suitable if you're on birth control or fertility medication, or if you're
  post-menopause** — and please check with your GP or pharmacist first."
- **Flags:** Hormone-acting; her contraindications carried in the disclaimer.

### D8. Bugleweed
- **Source:** Sleep Survival Guide
- **Dose in source:** "300–500mg — only if needed"
- **What Pamela says:** for signs an over-active thyroid may be driving "racing heart… major
  anxiety." "Do NOT take this if you have an underactive thyroid (hypothyroidism) or take thyroid
  medication… Doctor conversation essential on this one."
- **Draft app copy:** "Some women whose sleep is disrupted by an over-active thyroid find bugleweed
  calming. **Do not take it if you have an underactive thyroid or take any thyroid medication — it
  can make things worse.** Pamela is clear this one needs a conversation with your doctor first."
- **Flags:** Thyroid-active. Strong contraindication in the disclaimer; Pamela's own "doctor
  essential" line kept.

### D9. Bioidentical progesterone cream — generic (brand removed); **REGULATORY FLAG**
- **Source:** Sleep Survival Guide
- **Dose in source:** "20–40mg before bed"
- **What Pamela says:** apply "to thin skin areas — inner wrists, inner arms, chest, inner thighs
  about an hour before bed… Dosing is individual… Don't take it if you are post menopause."
- **Draft app copy (generic, brand removed):** "Because falling progesterone is often the root of
  perimenopausal sleep trouble, some women find a bioidentical progesterone cream at night helpful.
  Dosing is very individual and it isn't suitable once you're post-menopause. **In the UK this is a
  prescription-only medicine — please discuss it with your doctor before using it.**"
- **Flags:**
  - **Brand removed** — Pamela names "Dr Anna Cabeca Vida Pura"; not reproduced (see E2).
  - **REGULATORY FLAG** — bioidentical progesterone is a prescription-only medicine (POM) in the
    UK. Included as a suggestion per the app's model, but tag it for the geo/`info_only`
    jurisdiction gate and a compliance read. Dose (20–40mg) is Pamela's, reproduced and framed —
    confirm whether you want the number shown vs. "an individual dose your doctor advises".

---

## E. HOLD — truthfulness / legal, not caution

### E1. "MNM (Mitochondrial Nutrient Mix)" — missing composition
- **Source:** Perimenopause Fatigue ("a blend of nutrients designed to support mitochondrial
  function")
- **Why held:** No ingredients and no dose are stated anywhere in the corpus. We can't describe or
  suggest it without inventing its contents — the no-hallucination rule, not caution. **Needs
  Pamela to say what's in it** before it can be used.

### E2. Brand / product names — strip to generic
- Named in the corpus: "Dr Anna Cabeca Vida Pura" (progesterone cream); favourite-brand lists
  (Thorne, Pure Encapsulations, Life Extension, Vital, Gaia Herbs, Designs For Health, Wild
  Nutrition, Quick Silver); "Sentia" (alcohol alternative); apps/tests (Yuka, DUTCH, Invivo).
- **Why held:** Endorsing specific commercial products is an advertising/liability matter separate
  from the health advice. Keep the *substance* generic; drop the brand. (The intake tooling already
  expects branding removal.)

### E3. Third-party copyrighted material
- The Jessica Drummond / IPHI cycle-phase map (from "Period-Cycle") and the IWHI journal / Bristol
  Stool Chart are authored by others. **Permission needed before any reuse.**

---

## F. Open questions for Pamela (do not resolve by assumption)

1. **Magnesium glycinate dose** — your guide says 300–400mg; the app currently says 200–400mg.
   Which range should be the standard?
2. **Progesterone cream (D9)** — included per the app's model, brand removed, with the
   prescription-only note. Do you want the specific 20–40mg dose shown, or "an individual dose your
   doctor advises"? Confirm it should be caught by the jurisdiction gate.
3. **Bedtime vs wake-time (B2)** — the app currently leads on fixing *wake* time; you lead on an
   earlier *bedtime*. How would you like the combined message framed?
4. **Adaptogen doses (D5)** — your energy-herbs handout gives no doses. Do you want to supply doses,
   or should the app suggest the herbs without one?
5. **"MNM" (E1)** — what is actually in it? Without composition it can't be referenced.
6. **Brands (E2)** — confirm we strip all brand names and keep substances generic (default), or
   whether any are essential to name.
