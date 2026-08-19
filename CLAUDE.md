# Aunty Mel — Working Agreement & Project Notes

## Prime directive: accuracy over speed

This is a **health application for women navigating menopause**. Wrong content here is not
a cosmetic bug — it can lead someone to take an unsafe supplement dose, delay seeing a GP,
or lose trust in guidance they genuinely need. Every action must be gold standard.

**Non-negotiable rules for all work in this repo:**

1. **Never rush.** There is no deadline that justifies a lower-quality change. Take the time
   to do it properly the first time.
2. **Never assume.** If a fact, a file's contents, an API's behaviour, or a user's intent is
   not directly verified, it is unknown. Go and check.
3. **Always verify first, then act.** Read the actual file before editing it. Read the actual
   schema before writing a query. Run the actual command before reporting a result.
4. **Double-check before reporting.** Re-read the diff. Re-run the test. Confirm the claim
   still holds after the change.
5. **Verify every health claim against a real, checkable source** before it ships. If a source
   cannot be verified, the claim does not ship. Do not paraphrase from memory.
6. **Never invent a citation, author, study, programme, product, or resource name.** If a
   citation is asserted, confirm the paper exists and that it actually supports the specific
   claim being made. Conflating two sources into one attribution line counts as a defect.
7. **Report findings faithfully.** If something is unverified, say "unverified". If a check was
   skipped, say so. If an earlier claim turns out to be wrong, correct it explicitly rather
   than quietly moving on.
8. **Flag safety implications explicitly**, especially cumulative supplement dosing, drug
   interactions, and anything that might substitute for medical care.
9. **Preserve the guardrails that already exist.** Every supplement must keep a GP-check
   disclaimer (enforced by `validateFrameworks`). Never weaken or strip a safety caveat.
10. **When uncertain, ask.** A clarifying question is always cheaper than a wrong change to
    health content.

### Verification checklist before claiming any work is done
- [ ] Read the real file/schema — not assumed from a filename or a summary
- [ ] `npm run type-check` passes
- [ ] `npm run test:run` passes
- [ ] `npm run validate-content` passes (this is part of `npm run build`)
- [ ] Any health claim added/changed has a verified source
- [ ] Any supplement added/changed has a disclaimer and a declared substance key
- [ ] Stated outcomes match actual command output

---

## Project overview

**Aunty Mel** — a menopause wellness app for women, with cultural personalisation.
Next.js 14 (App Router) + Supabase (Postgres + RLS + Auth) + Stripe + Vercel hosting.

### Key commands

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Runs `validate-content` then `next build` |
| `npm run type-check` | `tsc --noEmit` |
| `npm run test:run` | Vitest, single run |
| `npm run validate-content` | Validates wellness framework YAML |

### Architecture notes (verified)

**Wellness recommendation engine** — `src/lib/wellness-engine.ts`
Pure functions, no I/O. Flow: onboarding answers + frameworks → `matchFrameworks()` →
`buildPlan()`. Frameworks are YAML in `content/wellness/frameworks/*.yaml`; a framework
fires on `trigger_all: true` or when **all** its `trigger_conditions` match (OR within a
condition via `min_matches`, default 1). `buildPlan()` flattens matched frameworks and runs
preference filter → substance dedupe → primary-symptom boost → priority sort → dose ceilings.
Tier gating is separate (`applyTierGating`): free = top 3 non-supplement recs, supplements
are premium-only.

**That order matters.** Filtering must precede dedupe: dedupe keeps the highest-priority card
per substance and discards the rest, so an `active_only` winner would otherwise take an
eligible sibling card with it for a limited-mobility user. There is a regression test for this
in `wellness-engine.safety.test.ts`.

**Cultural personalisation** — `src/lib/cultural-engine.ts`, `content/wellness/cultural/*.yaml`
Driven by self-declared `heritage` / `country` onboarding answers (skippable), mapped via
`src/lib/community-map.ts`. Heritage is **UK GDPR special-category data** — see
`src/app/privacy/page.tsx`. Treat it with corresponding care.

**Content is YAML, not a CMS.** Recommendation IDs must be unique across all frameworks.
Because one user can match many frameworks at once, the same substance can legitimately
appear in several frameworks — dedupe must therefore work at the **substance** level, not
just the ID level, or users see the same supplement several times with conflicting doses.

**Notifications** — `src/app/api/cron/notifications/`, `src/app/api/push/subscribe/`,
`push_subscriptions` table (migration 009), `web-push`, VAPID env vars.

### Gotchas / known-fragile areas
- `sortByPriority` tie-breaking is deliberately explicit; see the comment block — ties
  previously fell back to alphabetical YAML filename order and silently defeated the
  primary-symptom boost. Do not "simplify" it away.
- Calcium supplement vs **calcium D-glucarate**, and collagen **Type I** vs **Type II**, are
  genuinely different substances. Never merge them via fuzzy title matching.
- Migrations are sequentially numbered in `supabase/migrations/` — always add a new file,
  never edit an applied one.

---

## Git workflow
- Develop on the branch assigned for the task; never push to `main` without explicit permission.
- Push with `git push -u origin <branch>`; open a **draft** PR.
