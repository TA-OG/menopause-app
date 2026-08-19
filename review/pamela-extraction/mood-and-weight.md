# Extraction pilot 2 — Mood/Anxiety/Brain-Fog & Weight/Joint/Energy

> Same method + conventions as `sleep-fatigue.md` and `README.md`. Everything here is a
> **suggestion + disclaimer** (the app's model); items carry Pamela's own contraindication inside
> the disclaimer. No dose is invented — where her source states one it is reproduced and framed;
> where it doesn't, none is given. De-duped against the two **live** frameworks:
> `content/wellness/frameworks/mood-anxiety-brain-fog.yaml` and `.../weight-joint-energy.yaml`.

**Sources read for this group (verbatim-checked):**
- *How to Manage Mood Swings in Perimenopause and Beyond Using The SMART Formula* (podcast transcript, 2.5k words)
- *Understanding and Overcoming Sugar Cravings* (image deck — neurotransmitter→food mapping)
- *3 brain suppliments* (image deck — **product photos only, no rationale text**)
- *EDIT Module Nine — HGH / the somatopause*
- *5-Minute Energy Resets*
- *Intermittent Fasting Worksheet*
- *Foods High in Phytoestrogens*
- Cross-ref only (already captured in `sleep-fatigue.md`): *herbs_for_energy* (8 adaptogens),
  *Perimenopause Fatigue* (MNM), *The Gut Garden*.

Legend: **NEW** = not in the live YAML · **REINFORCES** = already present, Pamela adds nuance ·
**DUP** = already covered, no action.

---

# PART 1 — MOOD, ANXIETY & BRAIN FOG

## 1A. The SMART formula as the framing spine — REINFORCES (mindset)
- **Source:** Mood Swings podcast.
- **What Pamela says:** her signature root-cause method — **S**upplement (medical-grade) ·
  **M**indset · **A**ction · **R**eal food · **T**esting. "We always look for root cause, whereas
  conventional medicine suppresses symptoms with a pill." Her own closing disclaimer: *"the
  information shared is for information only. I am not your health coach or your therapist. Please
  seek medical advice if you are really struggling with debilitating mood swings."*
- **Use:** this is the organising story behind almost all her content, not a single rec. Worth a
  short "how Aunty Mel thinks about symptoms" explainer in the Learn section rather than a
  framework rec. Her disclaimer language reinforces [[feedback_dose_framing]] — reuse near-verbatim.

## 1B. Ask your GP to check the right things — NEW (mindset/action → testing)
- **Source:** Mood Swings podcast.
- **What Pamela says:** before assuming it's "just hormones," check you're **not pre-diabetic**,
  and check **vitamin D, folate, B12, iron, and thyroid** — and for thyroid "the whole spectrum,"
  because GPs usually measure only TSH (sometimes T4) and "T3 is the only active thyroid hormone."
- **Draft app copy:** "Mood swings, low mood and brain fog can have very treatable root causes that
  look just like menopause — low vitamin D, folate, B12 or iron, blood-sugar problems, or an
  under-active thyroid. It's worth asking your GP to check these. Some women also choose a fuller
  private thyroid panel (including T3 and antibodies). This is a suggestion, not medical advice —
  your GP is the right person to guide testing."
- **Flags:**
  - **Editorial:** Pamela is pointedly critical of GPs ("GPs won't do this"). App must **not**
    disparage the NHS — reframe as "ask your GP, and some women choose private testing." → open Q.
  - Keep it as *encouragement to test*, never a self-diagnosis.

## 1C. Sugar-cravings → neurotransmitter → food mapping — NEW (diet) ⭐ signature content
- **Source:** *Understanding and Overcoming Sugar Cravings* deck (verbatim food lists below).
- **Mechanism she gives:** oestrogen decline → serotonin/insulin changes → cravings; the *type* of
  craving points to which neurotransmitter is low, and specific **amino-acid-rich foods** help.
  | If you crave… | She reads it as low in… | Foods she lists |
  |---|---|---|
  | sugar/carbs in the **afternoon/evening** | **serotonin** (needs tryptophan) | turkey, chicken, tofu, salmon, cottage cheese, eggs, yoghurt, milk, almonds, peanut butter, chia, pumpkin seeds, walnuts, oats, bananas, sweet potato, melon |
  | **comfort foods** (bread, biscuits, ice cream) | **D-phenylalanine (DPA)** | (deck names the amino acid, not a food list) |
  | calm after over-eating **bread/cereal/pasta/dairy** | **GABA** | yoghurt/tempeh/miso, spinach/kale/broccoli, brown rice/oats, peanut/almond butter, chia/pumpkin, banana/melon |
  | intense **sweet or starchy** cravings | low blood sugar → **glutamine** | beef/chicken/pork, salmon/tuna/sardines, milk/yoghurt/cheese, eggs, lentils/beans/peas, almonds/peanuts/chia, brown rice/oats/quinoa |
  | something sweet for a **quick energy fix** | **catecholamines** | bananas, salmon, dark chocolate, leafy greens, whole grains |
- **Draft app copy (framed, non-diagnostic):** "The *kind* of sugar craving you get can hint at what
  your body's short of. Afternoon/evening sugar cravings often ease when meals include
  tryptophan-rich foods (turkey, eggs, oats, salmon, pumpkin seeds); cravings for a quick energy fix
  often ease with steadier options like bananas, oily fish, dark chocolate and leafy greens. Many
  women find matching food to the craving works better than willpower. This is general wellbeing
  guidance, not a diagnosis or medical advice."
- **Her general craving tips (deck):** protein-rich meals, healthy fats (avocado, nuts, olive oil),
  drink water (thirst mistaken for hunger), reduce stress, sleep, **don't skip meals**, distract
  (walk / call a friend), swap to fruit/nuts/dark chocolate.
- **Flags:**
  - **Soften the mechanism:** present as "often linked to / many women find," NOT "you are low in
    serotonin" — avoid implying clinical deficiency diagnosis. → convention already covers this.
  - Cross-framework: this belongs in **both** mood (neurotransmitters) and weight (insulin/cravings).
  - Deck's craving **supplement** list handled in 1E.

## 1D. Gut–brain (vagus nerve) & how you eat — NEW/REINFORCES (diet + lifestyle)
- **Source:** Mood Swings podcast.
- **What Pamela says:** gut and brain are linked via the **vagus nerve**; poor microbiome → poor
  nutrient absorption → fewer "happy neurotransmitters" (serotonin). Feed the gut **diverse,
  colourful veg** (red cabbage, radish, brussels sprouts, sweet potato) and **culinary herbs**
  (parsley, coriander, rosemary, thyme, garlic, onion). Practical digestion tactics: **chew 30–40
  times**, and **don't drink fluids with meals** ("dilutes digestive enzymes").
- **De-dupe:** live mood YAML already has `df_fermented_foods` (gut-brain, 90% serotonin) and
  `df_protein_neurotransmitters`. This **reinforces** and adds the *diversity + herbs + chewing*
  angle → new rec `df_gut_diversity` + a lifestyle `lf_mindful_eating` (chewing).
- **Draft app copy (chewing):** "A simple, free habit: sit down, and chew each mouthful well
  (aim for around 30 chews). Eating slowly supports digestion and how well you absorb the nutrients
  your mood chemistry depends on."
- **Flags:**
  - **Contested claims — soften or drop:** (a) "**green veg like spinach increase toxicity in the
    body**" (oxalate claim) — overstated; recommend omit or reframe as "vary your greens." (b)
    "**don't drink water with meals — it dilutes digestive enzymes**" — physiologically contested;
    present as her preference at most, not fact. → open Q.

## 1E. Mood/brain supplements — mostly REINFORCES + one NEW; brand strip
- **Source:** Mood Swings podcast + *3 brain suppliments* deck + Sugar Cravings deck.
- Podcast for mood: **omega-3 (EPA+DHA)** [DUP: `df_omega3_brain`], **methyl B-complex**
  [DUP: `ss_b_complex` — she specifies *methylated*, already matches], **magnesium glycinate**
  [NEW for this framework — present in sleep, not in mood]. "Always buy good quality."
- *3 brain suppliments* deck = **product photos only**, no rationale text. Generic substances:
  - **Magnesium L-threonate** (deck shows 600mg providing 50mg elemental Mg) — NEW; marketed for
    cognition/brain fog. Includable generically.
  - **Ginkgo biloba** (60mg) — NEW; cognition/circulation. Includable generically **with**
    contraindication: interacts with blood thinners / stop before surgery.
  - **"Glucose Tolerance II with Glucevia"** — branded proprietary blend, **no generic composition
    stated** → HOLD (see 3.2), same reason as MNM.
- Sugar-cravings deck supplement list: **B vitamins, CoQ10, omega-3, digestive enzyme with lipase,
  alpha-lipoic acid** ("always speak to your GP before taking supplements").
- **Draft app copy (magnesium glycinate, mood):** "Some women find magnesium glycinate helps with
  the irritability and low mood of perimenopause, as well as sleep. A suggestion that's worked for
  many — please check with your GP or pharmacist first, especially if you take any medication."
- **Draft app copy (ginkgo):** "Some women use ginkgo biloba for brain fog and focus. **Not
  suitable if you take blood-thinning medication (e.g. warfarin, aspirin, apixaban) or are due for
  surgery** — please check with your GP or pharmacist first."
- **Flags:** brands to strip — Quicksilver, Cytoplan, Nutri Advanced, Allergy Research Group,
  Designs for Health, Seeking Health, Life & Soul.

## 1F. Nervous-system / mindset tools — NEW (mindset)
- **Sources:** Mood Swings podcast + *5-Minute Energy Resets*.
- Podcast: **self-hypnosis** ("deeper than meditation"), **NLP calm "anchor"** (rehearse a calm
  feeling, attach it to touching thumb + forefinger; trigger it when frustration rises),
  **self-compassion**, and — for trauma (domestic violence, childhood abuse surfacing) — **refer to
  a qualified therapist** ("out of my remit").
- *5-Minute Energy Resets* (5 micro-practices): **Breath Break** (in 4 / hold 2 / out 6 ×5),
  **Ground-and-Go**, **Shake It Out** (2 min), **Digital Detox Minute**, **Heart Touch**.
- **De-dupe:** live mood YAML has `mr_anxiety_breathwork` (physiological sigh) and
  `mr_self_compassion_mood`. These **add** the anchor technique + the 5 resets as a toolkit.
- **Draft app copy (anchor):** "Try building a calm 'anchor': when you feel settled, take a slow
  breath and gently press your thumb and forefinger together. Repeat it often. Over time that small
  gesture can help you call up calm in a heated moment — in a meeting, mid-argument, anywhere."
- **Flags:** the **safeguarding referral** line is important and good — keep an explicit "if
  something painful is surfacing, please reach out to a qualified therapist" signpost.

---

# PART 2 — WEIGHT, JOINT PAIN & ENERGY

## 2A. HGH / the "somatopause" — NEW (lifestyle + diet)  ⚠ tension flag
- **Source:** *EDIT Module Nine — HGH*.
- **What Pamela says:** growth-hormone decline ("somatopause") drives middle-age spread, low
  energy, brittle hair/nails, low libido. Ways to raise HGH:
  - **HIIT** — lunges/squats/jumping/skipping/press-ups/planks, **20–30 min, 3–5×/week**, "if
    you're not sweating you haven't hit the intensity."
  - **Sleep 8h** (HGH released mainly at night).
  - **HGH-friendly foods:** raw cacao, eggs, ginger, avocado.
  - **Diet tweaks:** water 1.5–2 L/day; **25g protein immediately after exercise**; avoid sugar for
    2h post-workout (if aiming to lose weight); reduce carbs (high-carb diets "switch off HGH").
  - Mental agility: learn a language/instrument, walk 2 miles/day, puzzles.
- **De-dupe:** live weight YAML has `lf_strength_training`, `lf_movement_consistency`
  ("consistency beats intensity"), `lf_low_impact_joints` ("avoid HIIT on hard surfaces until joint
  pain managed").
- **⚠ Genuine tension to resolve, not auto-merge:** Pamela pushes **HIIT** for HGH/metabolism; the
  live framework steers **moderate consistency + low-impact** and explicitly cautions HIIT for
  joint-pain users. Both can be true (HIIT for metabolic/HGH benefit; low-impact when joints hurt),
  but the app shouldn't say both flatly. → open Q: offer HIIT as an option **with** a joint-pain
  caveat, or keep it out of the joint-pain path? Recommend: include HIIT under *weight/energy* with
  "if your joints are painful, favour the low-impact options first."
- **Draft app copy (HGH foods, safe subset):** "Short bursts of harder exercise, good sleep and a
  protein-rich diet all support the growth hormone that keeps energy, muscle and skin healthy in
  midlife. Foods some women lean on: eggs, avocado, ginger and raw cacao. A brisk approach worked
  for many — build intensity gradually, and favour low-impact movement if your joints are sore."

## 2B. Intermittent fasting (16:8, tiered) — NEW (lifestyle/diet)  ⚠ contraindications
- **Source:** *Intermittent Fasting Worksheet*.
- **What Pamela says:** tiered **Beginner → Intermediate → Expert**; expert = **16:8** (16h fast,
  8h eating window, e.g. noon–8pm), building from 12–13h. Test urine pH (>7.0), aim for "moderate
  ketosis," avoid eating between meals.
- **Draft app copy (framed):** "Some women find a gentle eating window — for example finishing
  dinner earlier and having breakfast a little later — helps with energy and weight in midlife.
  If you're new to it, start small (a 12-hour overnight gap) before trying anything longer. This is
  a suggestion, not medical advice."
- **Flags (contraindications must be in the disclaimer):** **not suitable if you have diabetes or
  take blood-sugar medication, have (or have had) an eating disorder, are pregnant or
  breastfeeding, or are underweight — please check with your GP first.** Drop the urine-pH/ketosis
  self-testing instruction from app copy (too clinical / borderline directive) → open Q.

## 2C. Phytoestrogen foods — NEW (diet)
- **Source:** *Foods High in Phytoestrogens*.
- **List (verbatim):** fermented soy (tempeh/miso/tamari), linseed/flaxseed, sesame, wheatberries,
  fenugreek, oats, barley, beans, lentils, yams, rice, alfalfa, mung beans, apples, carrots,
  pomegranate, wheat germ, mint, hops, fennel.
- **Draft app copy:** "Some plant foods contain phytoestrogens — gentle plant compounds many women
  include for hormone balance: flaxseed, fermented soy (tempeh, miso), sesame, lentils, chickpeas,
  oats and pomegranate. Adding a variety across the week is an easy, food-first step."
- **Flags:** food-first, low risk. Note (from source) fenugreek "used to make Testofen" — keep the
  food, drop the supplement/testosterone-product reference. Cross-framework (also hot-flashes,
  bone-cardiovascular).

## 2D. Energy resets & morning optimisation — NEW (mindset/lifestyle)
- **Source:** *5-Minute Energy Resets* (see 1F — same toolkit; doubles as fatigue support),
  *Morning Energy Optimisation* (thin source, 58 words — low content).
- **Use:** the 5 resets map directly onto the **fatigue** trigger of this framework and the anxiety
  trigger of the mood framework → reuse the same rec set in both.

---

## 3. HOLD — truthfulness / legal (not caution) — this group

### 3.1 Brand / product names → strip to generic
Quicksilver, Cytoplan, Nutri Advanced, Allergy Research Group, Designs for Health, Seeking Health,
Life & Soul (supplements); any programme plugs ("Flourish & Thrive", "Rebalance Club", "Smart
Rewind", the £1.56/DRUM checkout offer) → **remove** — these are her commercial funnels, not app
content.

### 3.2 Missing composition → hold
**"Glucose Tolerance II with Glucevia"** (from the brain-supplements deck) — proprietary blend, no
generic ingredients/dose stated. Can't describe without inventing → hold until Pamela says what she
actually means (likely a fenugreek/blood-sugar-support product, but don't assume). Same rule as MNM.

### 3.3 Third-party / copyright
No new third-party decks in this group (the cycle-map issue stays in `sleep-fatigue.md`).

---

## 4. Open questions for Pamela (this group — will roll into the master set)

1. **GP framing** — happy to reframe your "GPs won't test this" as "ask your GP, and some women
   choose a fuller private thyroid panel"? (App can't disparage the NHS.)
2. **Contested physiology** — two of your points are physiologically contested: (a) spinach/green
   veg "increase toxicity," and (b) "don't drink water with meals — it dilutes digestive enzymes."
   OK to soften these to "vary your greens" and drop the water-with-meals claim, or is there a
   source you'd like us to cite?
3. **HIIT vs joints** — your HGH module recommends HIIT; the app currently steers joint-pain users
   to low-impact movement. Shall we offer HIIT as an option *with* a "favour low-impact if joints
   hurt" caveat?
4. **Intermittent fasting** — OK to present as a gentle eating-window suggestion with
   contraindications (diabetes/eating-disorder history/pregnancy/underweight) in the disclaimer,
   and drop the urine-pH/ketosis testing step from app copy?
5. **Neurotransmitter/craving mapping** — we'll present this as "often linked to / many women find,"
   not "you are low in serotonin." Confirm that framing is fine.
6. **"Glucose Tolerance II / Glucevia"** — what is this, in generic terms? Without composition we
   can't reference it.
7. **Brands** — confirm we strip all brand names (Quicksilver, Cytoplan, Nutri Advanced, etc.) and
   keep substances generic.
