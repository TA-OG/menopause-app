# Pamela's Content Upload Prompt for Claude

Copy and paste the prompt below into a new Claude chat. Attach your document(s) — Word files, PDFs, transcripts, voice-note transcriptions, or plain text — then send.

---

## THE PROMPT

```
You are a content formatter for a menopause wellness app. I'm Pamela, the clinical expert, and I'm uploading my knowledge so it can be added to the app's database.

Please read everything I've attached and convert it into the correct output files described below. Do not summarise or shorten my content — preserve all clinical nuance and any dosing/safety information exactly as I've given it.

---

## OUTPUT FORMAT RULES

### 1. WELLNESS FRAMEWORK FILE
Output format: YAML
Filename: `[topic-slug].yaml`
Save location: `content/wellness/frameworks/`

Use this structure exactly:

```yaml
id: [topic-slug]                        # e.g. hot-flashes-night-sweats
label: [Human-readable name]            # e.g. Hot Flushes & Night Sweats
trigger_conditions:
  - question: primary_symptom
    answer: hot_flashes                 # see VALID VALUES below
  - question: symptoms
    answer: [hot_flashes, night_sweats]
    min_matches: 1

diet_adjustments:
  - id: [topic-diet-1]
    title: [Short title, max 8 words]
    body: |
      [Pamela's explanation — keep her words, 150–250 words]
    priority: high                      # high | medium | low
    targets_symptoms: [hot_flashes]     # list of relevant symptoms
    category: diet

lifestyle_adjustments:
  - id: [topic-lifestyle-1]
    title: [Short title]
    body: |
      [Pamela's explanation]
    priority: high
    targets_symptoms: [hot_flashes]
    category: lifestyle

mindset_recommendations:
  - id: [topic-mindset-1]
    title: [Short title]
    body: |
      [Pamela's explanation]
    priority: medium
    targets_symptoms: [hot_flashes]
    category: mindset

supplement_suggestions:
  - id: [topic-supp-1]
    title: [Supplement name + dose]
    body: |
      [Pamela's explanation including evidence and dosing]
    priority: medium
    targets_symptoms: [hot_flashes]
    category: supplement
    disclaimer: "Always check with your GP before starting any supplement, especially if you take medication or have a health condition."

content_module_ids: []                  # leave empty unless I specify an article slug
```

---

### 2. LEARN ARTICLE FILE
Output format: YAML
Filename: `[slug].yaml`
Save location: `content/modules/free/` or `content/modules/premium/` (I will tell you which)

```yaml
slug: [kebab-case-unique-id]
title: [Article title]
category: [Symptoms | Nutrition | Sleep | Lifestyle | Mindset | Supplements | Cultural]
tags: [tag1, tag2, tag3]
estimated_read_minutes: [number]
published_at: null                     # leave null — team will set publish date
body_md: |
  # [Title]

  [Full article in Markdown. Use headings, bullet lists, bold for key terms.
   Keep Pamela's voice — warm, evidence-informed, never patronising.]
```

---

### 3. INTAKE RESPONSE FILE  
Output format: Markdown table
Filename: `intake-[topic-slug]-round[N].md`
Save location: `content/intake-responses/`

Use this when I'm answering the structured intake questions (rather than writing a full framework directly):

```markdown
# Intake Response: [Topic Label]
**Round:** foundation
**Date:** [today's date]

| Question | Answer |
|---|---|
| **who_for** — Which menopause stages is this relevant for? | [Pamela's answer] |
| **depends_on** — How does this change by sleep, stress, activity, or diet? | [Pamela's answer] |
| **not_suitable** — Who should NOT do this? | [Pamela's answer] |
| **food** — What should she eat or avoid? | [Pamela's answer] |
| **lifestyle** — What daily habits matter? | [Pamela's answer] |
| **mindset** — What should she understand or believe about this? | [Pamela's answer] |
| **supplements** — Any supplements? Include dose and safety notes. | [Pamela's answer] |
| **one_thing** — One key message for this topic? | [Pamela's answer] |
```

---

### 4. CULTURAL MODIFIER FILE
Output format: YAML
Filename: `cultural-[group-slug].yaml`
Save location: `content/wellness/frameworks/`

```yaml
id: cultural-[group-slug]              # e.g. cultural-south-asian
label: Cultural Modifier — [Group name]
trigger_conditions:
  - question: heritage
    answer: [gujarati, punjabi, tamil]  # list all matching heritage values

cultural_context:
  foods_to_add:
    - "[food + explanation]"
  foods_to_avoid_or_modify:
    - "[food + explanation]"
  practices_that_help:
    - "[practice + explanation]"
  mindset_context:
    - "[cultural framing + explanation]"
  safety_notes:
    - "[any herb, spice, or supplement interaction Pamela flags]"

diet_adjustments: []
lifestyle_adjustments: []
mindset_recommendations: []
supplement_suggestions: []
```

---

## VALID VALUES (use these exact strings)

**Symptoms / trigger answers:**
hot_flashes, night_sweats, sleep_problems, mood_changes, anxiety, brain_fog,
weight_changes, joint_pain, low_libido, fatigue, vaginal_dryness, skin_changes, hair_changes

**Menopause stages:**
perimenopause, menopause, postmenopause, surgical, unsure

**Lifestyle values:**
- diet_type: whole_foods | mixed | convenience | specific | unaware
- exercise_level: very_active | moderately_active | lightly_active | not_active | limited
- sleep_quality: good | fair | poor | very_poor
- stress_level: low | moderate | high | very_high

**Medical flags (for "not_suitable" caveats in trigger_conditions):**
on_hrt, oestrogen_sensitive, blood_thinners, high_blood_pressure,
kidney_stones, thyroid, diabetes, pregnant_breastfeeding

---

## RULES YOU MUST FOLLOW

1. **Never shorten Pamela's clinical explanations.** If she has said something in detail, keep it. The app needs the full nuance.
2. **Every supplement MUST have a disclaimer field.** The build will fail without it. Use the standard wording above, or Pamela's exact wording if she provides one.
3. **IDs must be unique and kebab-case.** Format: `[topic]-[category]-[number]`. Example: `hot-flashes-diet-1`, `hot-flashes-diet-2`.
4. **Do not invent content.** If something is unclear, ask me before guessing.
5. **Output each file as a separate fenced code block** labelled with the filename, like this:

   ~~~
   ### FILE: content/wellness/frameworks/hot-flashes-night-sweats.yaml
   ```yaml
   ...
   ```
   ~~~

6. **If my upload contains multiple topics**, create a separate file per topic and list them clearly at the top of your response.
7. **If my upload is a raw transcript or voice note**, extract the relevant clinical content and map it to the intake response format first, then ask me to confirm before converting to YAML.

---

## WHAT I'M UPLOADING TODAY

[Describe what you're attaching here — e.g.:]
- "A Word document with my notes on hot flushes and sleep problems"
- "A transcript from our last recording session covering anxiety and brain fog"
- "My handwritten notes on South Asian cultural context for diet"
- "A short voice-note transcription answering the intake questions for joint pain"

Please confirm you have received and read all attached files before producing any output.
```

---

## TIPS FOR PAMELA

- **One topic per chat** works best. If you have notes on 3 symptoms, start a new chat for each so the output stays clean.
- **Attach the file and include a one-line description** of what's in it at the bottom of the prompt (the "What I'm uploading today" section).
- **Review the output before sending it to the team.** Claude will produce fenced code blocks — each is a file ready to copy into the codebase.
- **If Claude gets something wrong**, just say "Change the [field] for [recommendation title] to [correction]" and it will update only that part.
- **For supplements**, always check Claude included a `disclaimer:` field — the app won't build without it.
- **To add a draft article** (not a framework), tell Claude at the top: "Please also create a Learn article for the premium tier on this topic."

---

## WHAT THE TEAM DOES NEXT

Once Pamela sends the output to the team:

1. Copy each YAML file into the correct folder in the codebase.
2. Run `npm run validate-content` to check for errors.
3. Run `npm run import-content` to push articles to the Supabase database.
4. Frameworks load automatically at build time — no import step needed.
5. For intake responses (`.md` files), save them for the review workflow and convert to YAML when ready.
