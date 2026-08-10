# Pamela content extraction — conventions & compliance rules

This folder is the **Phase 1 extraction layer**: a faithful, source-attributed record of
what is actually in Pamela's content corpus (the "Mel" Google Drive folder), mapped to the
app's wellness frameworks. It is **working analysis for human review — not app content**.
Nothing here ships until Pamela signs off and it is rewritten into framework YAML.

## The hard rule (non-negotiable)

This app is **not a medical app or device**. It does not diagnose, treat, or prescribe.

Every item that involves something **ingested or applied to the body** (supplement, herb,
specific food taken for an effect, fasting window, dose, topical) MUST be expressed as a
**suggestion that has worked for many — not an instruction**, and MUST carry the
"see your own medical professional first" line. Standard body pattern:

> "Some women find [X] helps with [symptom]. [Plain description of what it is / how Pamela
> frames it.] This is a suggestion that has worked for many women — it isn't medical advice,
> so please always check with your GP or pharmacist before trying it[, especially if you take
> other medication or have a health condition]."

Never imperative ("Take 400mg of X"). Never an evidence claim that Pamela's source does not
actually make. If a number/dose is not in the source, it stays blank — **we do not invent it.**

## Field legend (per item)

- **Source** — the exact file(s) the item came from. If from multiple, all are listed.
- **What Pamela says** — faithful summary of the source. Quotation marks = her words verbatim.
- **Maps to** — target framework + category (`diet` / `lifestyle` / `mindset` / `supplement`).
- **targets_symptoms** — only symptoms the source actually ties it to.
- **Status** — `NEW` (not in current framework) · `ENRICHES <rec id>` · `DUPLICATE of <rec id>`
  · `CONFLICT with <rec id>` (contradicts existing content — needs human resolution).
- **Dose in source** — the exact dose if stated, or **"none stated"**. Never inferred.
- **Draft app copy** — proposed non-prescriptive rewrite. DRAFT — requires Pamela sign-off.
- **Flags** — contraindications she states, brand names, third-party copyright, anything
  needing a decision.

## Status buckets

The app's model is that **everything it offers is a suggestion, not a prescription** — the
non-prescriptive framing + the "always see your own medical professional" disclaimer is what
keeps it on the right side of that line. Every suggestion has an effect if the user acts on it,
whether it's a hormone, a herb, or a lifestyle change — so the **default for all of them is the
same: include it, with the disclaimer and any contraindication Pamela states.** We do not
withhold an item just because its effect is larger.

- **CANDIDATE** — becomes a framework rec after Pamela confirms wording. **This is the default.**
  It includes hormone-acting and medication-interacting items too; each carries its specific
  contraindication *inside* the disclaimer, e.g. "not if you take thyroid medication", "not if
  you're on blood-pressure medication", "not if you are on birth control / post-menopause".
  Where Pamela's source states a dose, it is reproduced and framed ("some women find X, at around
  Y, has helped"); where no dose is stated, none is invented.

- **HOLD — a truthfulness / legal call, NOT a caution call.** A small set of items can't be
  written as-is, for reasons unrelated to how risky the suggestion is:
  - **Missing information** — a named product with no stated composition or dose (e.g. "MNM").
    We can't describe it without inventing it, which breaks the no-hallucination rule. Held
    until Pamela says what's in it.
  - **Brand / product / shop names** — reproduce the *substance* generically (e.g. "a
    bioidentical progesterone cream"), never the brand ("Dr Anna Cabeca Vida Pura"). Endorsing a
    commercial product is an advertising/liability issue separate from the health advice, and the
    intake tooling already expects branding to be stripped.
  - **Third-party copyrighted material** — content authored by someone other than Pamela (e.g.
    the Jessica Drummond / IPHI cycle map) needs permission before reuse.

- **REGULATORY FLAG (included, but noted)** — legal OTC supplements need only the disclaimer. A
  genuine *medicine* raises a jurisdiction question the disclaimer alone may not settle — e.g.
  bioidentical **progesterone is a prescription-only medicine in the UK**. Such items are still
  included as suggestions per the app's model, but tagged so the existing geo/jurisdiction gate
  (`info_only` regions) can be applied. A fact to surface — not a reason to withhold.

## Global flags found across the corpus (apply everywhere)

- **Branding to strip:** "Smarter Change", "Flourish & Thrive", "Rebalance Club", "SMART
  Rewind", workshop/discount promos, booking CTAs, social handles, price mentions. The
  intake tooling already expects branding removal — none of this belongs in app copy.
- **Brand/product endorsements named by Pamela** (escalate, do not reproduce as app advice):
  e.g. specific supplement brands, "Sentia" alcohol-alternative, "Dr Anna Cabeca Vida Pura"
  progesterone cream, named apps (Yuka, Squeezy), named lab tests (DUTCH, Invivo GI EcologiX).
- **Third-party / non-Pamela authored material** seen in the corpus (IP check before any use):
  - "Period-Cycle" hormone-phase map — © Jessica Drummond / IPHI.
  - "3-Day Nutrition Awareness Journal" + Bristol Stool Chart — integrativewomenshealthinstitute.com.
  - "Self-Care Reset Workbook" template — bylined "Abiola Abrams [replace with your name]".
  - "Dragontime" (Luisa Francia) and cycleharmony.com referenced in cycle-tracking doc.
- **Pamela's opinion stated as fact** (must be framed as her view, never asserted by the app):
  e.g. "bananas are probably the worst thing to eat in menopause", claims that legumes/soy
  cause problems — note these are personal/clinical opinion and in some cases **conflict**
  with the current `foundations` framework (which actively recommends legumes & phytoestrogens).
  Conflicts are surfaced, not silently merged.

## Process

1. One framework per file. Pilot = `sleep-fatigue.md`.
2. Each source file is actually read before anything from it is extracted (no assuming).
3. De-duplicated against the live framework YAML, not from memory.
4. Pamela reviews → confirmed items rewritten into YAML → `frameworks-review.md` regenerated
   → second plain-English sign-off → PR.
