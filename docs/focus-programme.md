# Focus programme — one change a week, checked in daily

Status: **Phases 1–2 built** (schema, selection logic, API routes). Phases 3–4 not started.

### API (Phase 2)

| Route | Does |
|---|---|
| `GET /api/focus?today=&focus=` | State: options, week-1 preview, current/kept weeks (cards from her current plan), next choice, today's check-in, open week's focus ratings |
| `POST /api/focus` | Start: focus symptoms checked against intake; refused if nothing matches; opens week 1 |
| `POST /api/focus/week` | Open next week: app's pick or an offered alternative only; never dated before the previous week |
| `POST /api/focus/review` | kept/stopped from day 7, swapped any time; keep refused past 3 changes unless she releases one |
| `POST /api/focus/checkin` | Daily answers via `record_focus_checkin()` (merge, never replace) |
| `DELETE /api/focus` | End programme; weeks kept as history. Not gated, so she can always end it |

Every `today` is checked to be within ±1 day of UTC. Start is two inserts: if week 1
fails, she is left in the normal "choose next change" state, recoverable from the UI.

## Why

A full plan is up to 166 suggestions delivered at once. This turns it into one
change a week, chosen for the symptoms she wants to tackle first, with a
10-second daily check-in and a weekly review before the next change opens.
Nothing is removed from the full plan — it stays one tap away.

## Decisions (agreed 2026-10-08)

| # | Decision |
|---|---|
| 1 | Chip label stays **"Helps with"**; the full sentence under it reads **"Documented or reported to help with …"** |
| 2 | The **app** chooses the weekly change (author does not hand-pick) |
| 3 | Any **non-supplement** change can lead a week (diet, lifestyle, mindset) |
| 4 | Supplements never lead a week. They get their **own tab** with a strong caveat (wording below) |
| 5 | She picks **1–3** focus symptoms, from those she declared at intake |
| 6 | A change she keeps stays on her daily check-in — **at most 3** changes there in total |
| 7 | The next week opens **only after her review** (from day 7), never automatically |
| 8 | **Premium only** |
| 9 | GP signpost when focus symptoms worsen — **thresholds to be set by Pamela** (not invented) |
| 10 | If no change covers all her symptoms, show the **closest match and say so** |
| 11 | Redoing intake mid-programme **keeps the programme**; next weeks pick from the new plan |
| 12 | Daily answer is **Yes / Not today** (stored in `symptom_checkins.tried_today`) |

### Supplements tab caveat (pending solicitor review)

> Some women report benefits. Evidence varies and these are not right for
> everyone. This is not medical advice. Check with your GP or pharmacist
> before taking anything.

Shown in addition to — never instead of — every supplement's own GP-check
disclaimer, dose ceiling and personal note. A disclaimer cannot exclude
liability for personal injury caused by negligence (Unfair Contract Terms Act
1977 s.2(1); Consumer Rights Act 2015 s.65), so final wording needs legal sign-off.

## Blocking before any of this is shown to users (Phase 3)

- **Symptom-tag audit (Pamela).** Selection runs entirely on `targets_symptoms`.
  Today ~60% of non-supplement cards have no tags, hot flushes has 5 and night
  sweats 1, and some tags go beyond the card's own text (e.g. the 10-minute
  walk card is tagged weight and fatigue; its text claims blood sugar, mood and
  sleep). Under "Documented or reported to help with…", each tag is a claim and
  must be supported by the card's copy and a source.
- **GP-signpost thresholds (Pamela)** for decision 9.
- **Solicitor review** of the supplements caveat.

## How it works

### Selection — `src/lib/focus-programme.ts` (pure, no I/O)

Eligible: in her (tier-gated) plan, not a supplement, not already used in this
programme, not `active_only` when her exercise level is limited/not active, and
**no declared medical flag or dietary restriction applies to it** (same
detection as the plan's personal notes). Cautioned cards stay in her full plan
with their caution; they just never lead a week.

Ranked by: how many of her focus symptoms it covers → `scoreRecommendation()`
→ id. Deterministic: same inputs, same pick. Returns the pick, two
alternatives she can choose instead, whether it is a closest match, and which
focus symptoms nothing covers.

### Data — migration `036_focus_programmes.sql`

- `focus_programmes` — her focus symptoms (1–3, `symptom_key[]`), status,
  start date. One active programme per user (partial unique index).
- `focus_weeks` — one row per weekly change: the recommendation id, a snapshot
  of the wording she was shown, the symptoms it was chosen for, start date,
  review outcome (`kept` / `stopped` / `swapped`), and `released_on` when she
  later drops a kept change. One open week per programme.
- `record_focus_checkin()` — the daily check-in write. **Merges** into
  `symptom_checkins` (adds ratings and ticks to the day's row) instead of
  replacing it, so it can never wipe what the full check-in form saved.
  SECURITY INVOKER: RLS still applies.

Cautions and personal notes are always re-derived from her **current** answers
at render time, never read from the snapshot.

### What real content gives today

For a woman focusing on sleep, anxiety and fatigue, the current frameworks
yield 18 distinct weeks: 2 covering all three, then closest matches. Focusing
on night sweats alone yields exactly one card (hydration) — the tag audit
above decides whether that tag stands.

## Phases

| Phase | Scope | Status |
|---|---|---|
| 0 | Symptom-tag audit; build check that eligible cards are tagged | Waiting on Pamela |
| 1 | Migration + selection logic + tests | **Done** — 33 unit tests (`src/lib/focus-programme.test.ts`); 36 database checks (`scripts/sql-tests/run.sh`, needs a local Postgres) |
| 2 | API routes (start, read, daily check-in, weekly review), premium + geo gating | **Built, not live** — `src/app/api/focus/**`; decisions unit-tested (`src/lib/focus-api.test.ts`). Needs migration 036 in production before any route works |
| 3 | UI: focus picker, this week, daily check-in, weekly review, supplements tab; add the 5 symptoms missing from the check-in page | Not started |
| 4 | Dashboard "This week"; daily push shows this week's change | Not started |
