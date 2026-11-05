# Translation review — onboarding quiz + profile page (fr / es / de / pt)

**Status: drafted and self-reviewed by Claude. NOT yet signed off by a human
native speaker.** Drafted 2026-11-04. Every string below still needs the
language reviewer's sign-off before launch in that language.

## Self-review pass (2026-11-04)

I checked all four languages for grammar, register, gender agreement,
regional variant (es-ES, pt-PT), medical terminology and demonyms, and
against the strings that already existed. 57 strings changed:

- **Consistency with the daily check-in:** quiz symptom labels now use the
  same terms as `Symptoms.*` (for example de "Geringe Libido", es "Libido
  baja", fr "Baisse de libido").
- **Pre-existing mistranslations fixed (outside the quiz):**
  - pt "Atualizar" (means *update/refresh*) → "Passar a Premium" on the
    Dashboard and Learn upgrade buttons.
  - es "Mejorar" → "Hazte Premium" on the same buttons.
  - pt "As membros premium" (wrong gender agreement) → "As subscritoras Premium".
  - pt Brazilianisms → pt-PT: "Meu plano" → "O meu plano",
    "configurações" → "definições", "sem enrolação" → "sem rodeios".
  - de "Magischer Link" (word-for-word calque) → "Anmeldelink".
  - de "Aufnahme" (reads as a hospital admission) → "Fragebogen".
  - es: title-case removed from the terms and privacy links, and the consent
    wording made more natural.
- **HRT wording:** fr `Disclaimer.gpSignpost` said "THS", while the quiz uses
  "THM (traitement hormonal de la ménopause)", the term the French health
  authority (HAS) uses. The signpost now says THM too. Only the term changed,
  not the meaning.
- **Profile text:** the language setting now names the Learn section by its
  real nav label in each language (de "Wissen", es "Aprender", and so on).
- **Demonyms and grammar:** es "Cachemir" (*cashmere* the fabric) →
  "De Cachemira"; es "Ceilanesa" (dated) → "Esrilanquesa"; pt severity options
  given masculine agreement with *sintoma*; the "White British & European"
  group label was rephrased in all four languages.

Treat this as a careful first pass, not a native speaker's sign-off. The
priorities below still stand.

## Where the strings live

- `messages/<locale>.json` → `Onboarding` (the whole quiz) and `Profile`.
- English wording is canonical in `src/lib/onboarding-config.ts`; `en.json`
  must match it word for word (enforced by `src/lib/onboarding-i18n.test.ts`).
- **Edit only the text (right-hand side).** Never rename a key: keys map to the
  stored answer values that the wellness engine matches on. The tests fail if a
  key goes missing or a string is left empty in any language.

## Register used (matching the existing translations)

| Locale | Register | Notes |
|---|---|---|
| fr | *vous*, feminine agreement | "médecin généraliste" for GP |
| es | Spain Spanish, *tú*, feminine | "médico de cabecera" for GP |
| de | *du* | "Hausärztin oder Hausarzt" for GP |
| pt | European Portuguese, *você / o seu*, feminine | "médico de família" for GP |

## Priority 1 — safety-critical (check first, word by word)

These answers decide which supplements are flagged or withheld. A user who
misreads one could get advice that is unsafe for her.

- `Onboarding.steps.medical_flags.title` / `.subtitle`
- `Onboarding.choices.medical_flags.*` (all 9), especially:
  - `on_hrt`: HRT terminology. Drafted as: fr "traitement hormonal de la
    ménopause (THM)", es "terapia hormonal sustitutiva (THS)", de
    "Hormonersatztherapie (HRT)", pt "terapêutica hormonal de substituição
    (THS)". Please confirm each is the term women in that country actually use.
  - `oestrogen_sensitive`: breast/ovarian cancer and oestrogen-sensitive conditions.
  - `blood_thinners`: example drug is warfarin. In some countries the common
    brand differs (for example Marcumar/phenprocoumon in Germany, Sintrom in
    Spain). Should the example be localised? **Raise with Pamela**: this changes
    which women recognise themselves in the option.
  - `pregnant_breastfeeding`, `kidney_stones`, `high_blood_pressure`, `thyroid`, `diabetes`.
  - `none` ("None of these"): it clears every other option, so it must read as
    clearly exclusive.
- `Onboarding.choices.diet_restrictions.*`: allergies (`nut_allergy`,
  `shellfish_allergy`) feed food suggestions. "Nut allergy" was drafted as
  tree-nut wording (fr "fruits à coque", pt "frutos de casca rija"). Confirm
  peanut allergy readers won't think it excludes them.
- `Disclaimer.*`: already existed and is not changed here. It is now the
  second screen of the quiz, so it is read straight after the language choice.

## Priority 2 — symptoms and menopause stage

- `Onboarding.choices.symptoms.*`: these drive the whole plan. Watch for "hot
  flushes" (pt-PT "afrontamentos" was chosen over Brazilian "fogachos/ondas de
  calor"), "brain fog" and "vaginal dryness".
- `Onboarding.choices.menopause_stage.*` and `symptom_severity.*`.
- Note: `Symptoms.*` (the daily check-in) already had its own translations. The
  quiz labels are slightly longer (for example "Mood changes / irritability").
  Check that both read consistently.

## Priority 3 — everything else

Lifestyle (exercise, smoking, alcohol, caffeine, sleep, stress), goals, "what
have you tried", heritage communities and regions, countries, timezones, and
the profile page.

Specific doubts to check:
- Community demonyms (`Onboarding.communities.*`) were drafted as feminine
  adjectives (fr/es/pt) or neuter adjectives (de). Some may be wrong or
  unnatural, for example fr "Philippine", pt "Trinitária", es "Santalucense".
- `Onboarding.communityGroups.White_British_European` is a sensitive phrasing
  in every language.
- `Profile.upgradeCta` keeps the £ price. Is that right for non-UK readers?
  (Pricing is a product decision, not a translation one.)

## Not translated yet

- API error texts are English. The quiz now logs them and shows a translated
  generic message instead.
- Learn articles are authored in English in `/admin/articles`. They are not
  part of this change.

Everything else is translated: every app page and component, including
Journal, Pay, Refer and NotificationSettings; the legal pages, under an
"English prevails" banner; and all plan content.

## Plan content (added 2026-11-05)

All 166 framework recommendations and 130 cultural blocks are translated in
`content/wellness/i18n/{fr,es,de,pt}/`. Plans are stored in English and
translated when the page renders, so a missing block falls back to English.

The build blocks bad translations. `npm run validate-content` fails if a
translation changes any number or dose from the English, if an overlay uses an
unknown id, or if an overlay file cannot be read. The tests fail on any
untranslated block. At runtime, a broken overlay file is skipped with a log, so
its blocks show in English and the page stays up.

**Reviewer: check these safety lines first, word by word:**
- every recommendation `disclaimer`;
- the inline cultural `DISCLAIMER:` lines, rendered as MISE EN GARDE / AVISO /
  HINWEIS / AVISO;
- every vitamin D figure: 400 IU (400 UI fr/es/pt, 400 IE de) and 1000–2000 IU.

### English-source issues carried over unchanged (for Pamela)

- `communities/india-gujarati`, undhiyu: "Raw banana (kacchi keri)".
  *Kacchi keri* means raw **mango**; raw banana is *kachha kela*. The text is
  kept as written in every language.
- `communities/nigeria-hausa`, masa-tsamiya-sorghum: "burukutu" is listed as a
  sorghum food. Burukutu is a fermented sorghum **beer**, so it is an odd
  suggestion here.
- `communities/nigeria-hausa`: tuwo shinkafa is glossed as "rice
  pudding/mould". It is a soft rice swallow. The translations say "rice
  paste/ball".
- `location-modifiers/uk-diaspora`: the URL `bms.thebms.org.uk` is
  **unverified**. The BMS site is thebms.org.uk; confirm the link.
- `communities/nigeria-igbo`: "Aba Women's Riot" is also called the Aba
  Women's War (1929). The English name is kept in brackets.
- These figures are carried over exactly but were **not re-verified**: the
  Indian and Pakistani average menopause ages (46.7, 47.16) and HRT access
  (6.2% vs 23.3%).

### English-source issues in the UI and legal copy (for Pamela / legal)

- Privacy and cookie policies say "only essential cookies", but PostHog and
  `mmf_attr` cookies are set. PostHog and Cloudflare Stream are not listed as
  processors.
- The data-deletion page names "Profile → Account Settings → Delete Account",
  which does not exist.
- The support FAQ says "Manage subscription"; the button says "Manage billing".
  It also says to email to reset onboarding, but there is a Redo intake button.
- Terms §5 cites section 4 for "one account per person". That rule is in §3.
- The translations add 112 (EU) next to 999.
- Waitlist: the stats (40–55% libido, 13M, 1B+) have no citation, and the
  referral offers conflict.
