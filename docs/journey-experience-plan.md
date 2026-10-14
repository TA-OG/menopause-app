# The journey with Mel: how her plan reaches her

Status: **Plan for review. No code changed yet.** Branch `feat/journey-plan-delivery`, cut from `origin/main` at `6f034b8`.
Examples of every screen and message described here: https://claude.ai/artifact/Bq88iCwcMsDZSkabnarWtS (private, share from its menu).

> **Superseded by decisions of 13–14 Oct 2026.** Where this plan disagrees, these win:
> - **Aunty Mel ≠ Pamela.** UI copy speaks as Mel (the brand and guide). Videos and audio are Pamela speaking as herself ("From Pamela"). **Never put Pamela's face next to Mel's name.** Mel wears the Aunty Mel brand mark. Pamela's face appears only on her own videos, labelled "From Pamela".
> - **The garden (section 9) and mascot are dropped.**
> - **Free = the 7-day Feel Safe week only.** Foundations and the weekly path are premium.
> - **Video hosting: Cloudflare Stream.**
> - **Rest this week** lives in PR #32: `POST /api/focus/week {rest:true}`, ends from day 7, no limit in a row.
> - **Safety gate:** `GET /api/focus` returns `gates.safety_required`. Show a gentle "a few questions to keep you safe" prompt. The safety page calls `POST /api/profile/safety-reviewed`. Existing users re-confirm before Foundations.
> - **Feeling keys** (`foggy`, `cant_sleep`, `anxious`, `overwhelmed`, `low`) and the clip mapping come from `src/lib/feelings.ts` (media session). Do not redefine them.
> - **All UI strings** go in `messages/en.json` first (next-intl). Translate to de/es/fr/pt only after Pamela approves the English.
> - **Branch base:** `feat/i18n-locale` (PR #33), not `main`.
> - **Source of truth for flow and copy:** Pamela's "Aunty Mel Care Journey" doc, https://claude.ai/code/artifact/30e5176f-ed87-42f0-be4b-6a759fbca36e

---

## 1. What the tester told us, in one line

> "On Facebook, you are the Aunty Mel. In the app, no one is."

Her voice note (9 Oct 2026) and the second woman she asked describe a single problem. The knowledge is right. The way it reaches her is wrong.

| What she felt | What the code does today |
|---|---|
| "Grabbed" by an e-consult form | `onboarding-config.ts`: disclaimer, then **20 questions** before she sees anything useful |
| Not told what the app is for | No welcome or mission screen. First screen is a disclaimer |
| "Start here — start where?" | `dashboard/page.tsx` heading `Start here` over three bare titles |
| "Food, Doing — doing what?" | `PlanTabs.tsx` tab labels `Food · Doing · Thinking · Supplements` |
| "Check in where?" | `NavBar.tsx` label `Check in` with a 📊 chart icon |
| "Academic, a leaflet, no life" | Inter font, long bodies, no voice, no face, no media anywhere in `src/` |
| "Doesn't touch my nervous system" | Nothing in the app is designed to change how she feels *right now* |
| "I'd paste it into AI" (2nd user) | Card bodies of 80–120 words with no one-line "what do I actually do" |
| The penguin that waves | Nobody greets her. A greeting by time of day is the only warmth |

**This plan is not a reskin.** The plan has to *arrive* the way a good auntie helps: welcome you in first, notice how you are, give you one small thing, check back, and never make you feel you've failed.

---

## 2. The North Star

> **Every time she opens Aunty Mel, she should leave feeling a little calmer, a little less alone, and clear on one small thing to do.**

Every screen, card and message gets this test: *does this feel like Mel sitting with her, or like a clinic handing her a leaflet?*

Calmer, then less alone, then one small thing. In that order. Information supports all three but is never the front door.

---

## 3. What the evidence says, and what we take from it

Research done 12 Oct 2026. The point is to make sure every design choice rests on something stronger than taste. Strength ratings are honest: several popular "habit app" claims have no controlled evidence, and are marked as such.

| Finding | Strength | What we do with it |
|---|---|---|
| **NICE NG23 (Nov 2024)** recommends menopause-specific CBT alongside HRT, or instead of it where HRT is unsuitable or not wanted. Biggest effect is on the *distress and bother* of symptoms, not just how often they happen. NICE names online CBT as an easier way to get it. | Strong: national guideline | The "mindset" content is clinically central, not a soft extra. Delivery should aim at *how bothersome* a symptom feels, so we track "how much did it bother you", not only "did it happen" |
| **MENOS 2 RCT** (Ayers, Hunter et al., *Menopause* 2012): self-help CBT with light telephone support was nearly as effective as group CBT for hot flushes and night sweats. Women described "regaining control" and "new ways of coping". | Strong: RCT | Self-guided works *when a person checks in*. A weekly review "from Mel" is the in-app version of that call |
| **Supportive accountability** (Mohr, Cuijpers & Lehman, JMIR 2011): human support improves adherence through accountability to someone seen as *trustworthy, kind and expert*, with clear expectations the user helps set. | Theory with good evidence base | Pamela's face, voice and name are the adherence mechanism, not decoration. She sets the expectation ("one small change a week, that's all"), and the woman chooses it |
| **Self-determination theory** (JMIR mHealth 2026 overview of 19 reviews): lasting engagement comes from **autonomy** (personal relevance, control), **competence** (clear language, it works) and **relatedness** (trust, endorsement, peers). | Moderate: review of reviews | Every week she chooses or swaps. Plain words everywhere. Mel is the relationship |
| **Self-compassion and menopause** (Brown et al., Univ. of Melbourne): women high in self-compassion found hot flushes up to 3× less disruptive. Follow-up linked it to lower anxiety and better sleep. Compassion-focused online groups for menopause show strong engagement (UCL feasibility thesis). | Moderate: observational plus feasibility | All feedback copy uses the three parts of self-compassion: kindness ("be gentle with yourself"), common humanity ("so many women feel this"), mindful noticing ("you noticed that — that matters") |
| **Feeling dismissed** (Barber & Charles 2023; Healthwatch Essex and Bristol reports; BJGP Open 2025): many UK women feel unheard by GPs and are offered other diagnoses first. | Moderate: qualitative, consistent | Validate before advising: "This is real. It's not in your head." Equip her for the GP (summary to share) without blaming the GP |
| **Implementation intentions** (Gollwitzer & Sheeran 2006, d≈0.65 across domains; health-only meta-analyses d≈0.2–0.5). | Strong but smaller in health | Each weekly change becomes an "if-then" she picks: *"When I put the kettle on in the afternoon, I'll make it decaf."* Small real effect, almost free to build |
| **Habit formation** (Lally et al. 2010): median 66 days to automaticity (range 18–254). **Missing one day did not materially affect it.** | Moderate: small sample, not yet replicated | No streaks. A missed day is said to be fine, because the evidence says it is. Progress shown as "4 of the last 7 days", never as a broken chain |
| **Fresh start effect** (Dai, Milkman & Riis 2014): people start goals more after temporal landmarks such as a new week or month. | Moderate: field data | After a gap, re-invite on a Monday or the 1st: "New week, fresh start. Shall we pick up where we left off?" |
| **Trauma-informed design** (SAMHSA's six principles, applied in UXPA Journal work): safety, trust, choice, collaboration, empowerment. Users can pause, skip or leave any flow. No surprises, no forced interaction, no punitive mechanics. | Practice guidance | Every intake question skippable except the safety gate. Nothing forced before value. No guilt notifications |
| **Plain language** (NHS service manual): reading age 9–11, sentences up to 20 words, paragraphs up to 3 sentences, everyday word first then the medical one. | Standard | A copy rulebook and a readability check in CI for UI strings |
| **Typography for older readers** (ODPHP health literacy; York thesis): body text at least 16px, up to 19px for older audiences. 1.5 line spacing preferred. Off-white or sepia backgrounds rated well. Break text into short chunks. | Moderate | 17–18px body, 1.6 line height, cream background, warm serif headings |
| **Menopause apps in practice:** Stella (top-3 symptoms, 12-week plan, a new technique each week, bite-size sessions). Balance (tracking, GP report, community). Women value trustworthy, local, quick content and something to take to their clinician (Sillence et al. 2025). | Market evidence | We are not first with "one change a week". **Our edge is Pamela's presence and warmth.** Stella and Balance are clinical in tone. Nobody in UK menopause does "an auntie who's got you" |
| **Finch (self-care pet):** gentle streaks and an emotional anchor drive retention. Critics note onboarding overload and novelty fading by month three. | Design commentary only, no controlled data | Take the *principles* (greeted, cared-for, never punished), not the pet. Pamela is the companion. A grown-up "garden" progress motif is offered as an option (section 9) |
| **Parasocial trust** (Univ. of Vienna 2024; public-health commentary): a familiar, warm face raises trust and *lowers scrutiny*. | Moderate, double-edged | Pamela's presence makes content more persuasive, so claims must be *more* careful. Every clip with a health claim gets her sign-off (two are flagged already) |

**What we deliberately do not do, and why:**
- **No AI "Ask Mel" chatbot.** A generated voice giving health answers in Pamela's name is a medical-advice risk and breaks [dose framing](../README.md). "Ask Mel" means *her recorded clips*, chosen by the feeling the woman picks.
- **No streaks, badges for consistency, or "you missed a day" notifications.** No controlled evidence that they help this audience, a plausible mechanism for harm (the abstinence violation effect), and directly against what the tester asked for.
- **No mascot.** The real need behind the penguin is *being greeted*. Mel's greeting and Pamela's own videos do that, and a cartoon risks reading childish to women over 40.

---

## 4. Seven experience principles (the rulebook)

1. **Welcome before questions.** She meets Mel and learns what the app does before we ask anything beyond what safety needs.
2. **Feeling first, knowledge second.** Every visit starts with how she is, and can end in a 1–3 minute calming moment.
3. **One small thing at a time.** One change a week. Never more than three on her daily list. The full plan is always one tap away and is never the front door.
4. **She chooses.** Every week: keep it, swap it, or rest. Every question: skip it. Every reminder: pick when, or turn it off.
5. **Kindness after every answer.** "Not today" gets warmth, not silence. Gaps get a welcome back, not a tally.
6. **Mel's voice everywhere.** Second person, warm, plain, UK English. Her phrases, her face, her clips. Written to her voice guide, which she approves.
7. **Safety never folds away.** Every caution, dose ceiling and GP note stays visible, open or shut, exactly as PR #20 built it. Warmth never softens a warning.

---

## 5. The journey, step by step

### 5.1 First open: welcomed in (about 3 minutes, all skippable)

| Step | What she sees | Replaces |
|---|---|---|
| 1 | **Pamela's welcome video**, labelled "From Pamela" (1:39, already cut: `content/video/edits/welcome.json`). Captions on by default. "Watch later" link | The disclaimer as first screen |
| 2 | **"Here's how I'll look after you"**: three cards. *Tell me how you're feeling* · *Try one small thing each week* · *I'll check in on you* | Nothing (missing today) |
| 3 | **The short safety note**, in plain words, with full terms one tap away | The disclaimer, unchanged legally, moved and rewritten |
| 4 | **"How are you feeling right now?"**: six tiles. Foggy · Can't sleep · Anxious or on edge · Overwhelmed · Low · Too hot | Nothing |
| 5 | **A calming moment**: the matching Mel clip (5 already cut) plus a 1-minute paced-breathing guide. Ends: *"Do you feel a little better than when you opened me?"* Yes · A bit · Not really | Nothing |
| 6 | **"Can I ask you a few things, so I can look after you properly?"** leads into intake chapter 1 | Straight into 20 questions |

### 5.2 Intake in three short chapters, not one long form

The engine needs the answers. PR #20 proved 15 of 16 questions shape the plan. So we keep every question and change *when* and *how* we ask.

| Chapter | When | Questions | Time |
|---|---|---|---|
| **1. About you** | First open, after the calming moment | Name · stage · symptoms · the one that bothers her most · **medical flags (safety gate, never skipped)** · dietary restrictions (safety for food advice) | ~90 sec |
| **2. Your days** | Offered on Today the next day, or straight away if she wants | Sleep · stress · activity · caffeine · alcohol · smoking · severity | ~60 sec |
| **3. Food and what you've tried** | Offered day 3 | Diet type · previously tried · goal · age · heritage and location (cultural modifiers) | ~60 sec |

- The plan is generated after chapter 1 and **sharpens** after 2 and 3. Today shows: *"Your plan gets more personal each time you tell me a bit more."*
- **Engineering risk (the biggest in this plan):** `buildPlan()` and `deriveUserSignals()` must handle missing answers without quietly giving worse or unsafe advice. Safety-relevant answers (medical flags, dietary restrictions) are in chapter 1 so cautions are never missing. Each later question gets a defined "not yet answered" behaviour, tested the same way as `onboarding-influence.test.ts`.
- Every chapter has a progress line ("2 of 6"), a warm sentence of *why* for each question in Mel's voice, and "Skip for now".

### 5.3 Today (the home screen)

Top to bottom, in this order:
1. **Mel's greeting, by name and time of day**, beside the Aunty Mel brand mark (never Pamela's photo). One line that changes with her recent check-ins (see section 6).
2. **"How are you right now?"** The six feeling tiles, one tap to a calming moment.
3. **This week's one small thing** (from the focus programme in PR #32): the change, her if-then, and today's *Yes, I did it* / *Not today*.
4. **Something from Mel**: one clip or one 60-second read matched to her focus symptoms.
5. **Your week so far**: soft dots for days she showed up, never crosses for days she didn't.
6. Lower down: journal, full plan, Learn. Referral and upgrade sit at the bottom, and the referral card appears only after week 1.

### 5.4 Her path: the plan as a journey (wraps PR #32)

PR #32 already built the engine for this: she picks 1–3 focus symptoms, the app picks one non-supplement change a week, a daily Yes / Not today, a review from day 7, at most 3 kept changes. **This plan is the experience layer on top of that engine.** We don't duplicate it.

Each week is a **chapter** with five moments:

| Day | Moment | What Mel does |
|---|---|---|
| 1 | **Your new small thing** | Short intro in Mel's voice: what it is, *why it may help her focus symptoms* (from the card's own copy, so no new claims), and **one line saying what to actually do**. She sets her if-then: *"When ___, I'll ___."* She can swap for one of two alternatives |
| 2–6 | **Daily check-in** (10 seconds) | *"Did you manage your small thing today?"* Yes / Not today. Plus "How much did [focus symptom] bother you?" (0–5) |
| 4 | **Midweek note** | One encouragement chosen from her answers so far (section 6) |
| 7+ | **Your week with Mel** (review) | *"What did you notice?"* Then three equal choices: **Keep it** (stays on her list) · **Try something else** · **Rest this week**. A gentle chart of her bother scores, with an honest caption |
| — | **Next chapter opens** | Only after she reviews. Never automatically (PR #32 decision 7) |

- **"Rest this week" is new** and needs an addition to PR #32's review outcomes. Rest is a choice, not a failure. It respects autonomy, and someone in a hard week should not have to choose between failing and quitting.
- **The full plan is renamed** "Everything Mel suggests for you": same tabs and same safety as PR #20, with clearer labels (section 7).
- **Supplements never lead a week** (PR #32 decision 4). They stay in their own tab with the caveat that's pending solicitor review.

### 5.5 Coming back after a gap

| Gap | What she sees |
|---|---|
| 1–2 days | Nothing different. No mention of the gap |
| 3–6 days | *"Lovely to see you. No catching up needed, we'll just carry on from today."* |
| 7+ days, or a Monday or 1st of the month | *"Welcome back. New week, fresh start. Want to carry on with [change], or pick something new?"* |
| Never | "You missed X days", a broken streak, red marks, or a guilt notification |

### 5.6 Reminders in Mel's voice

The notifications cron already exists. One gentle reminder at a time she chooses, or none. Copy rotates from an approved bank. Examples are on the examples page. Rules: never more than one a day, never after a "turn off", never guilt, never a health claim in a notification.

---

## 6. The encouragement engine (warm, but never invented)

Small, deterministic and testable, like `scoreRecommendation()`. **No AI-generated text.** Every message comes from a bank Pamela approves, chosen by rules.

| Signal | Example message (draft, for Pamela to edit) |
|---|---|
| First ever "Yes" | "You did it. That's the hardest one, the first." |
| "Not today" | "That's alright. Some days are like that. Tomorrow's a new one." |
| 3+ "Not today" in a week | "This one isn't fitting your life right now, and that's useful to know. Shall we find something easier?" |
| Bother score falling | "Your [sleep] has bothered you a bit less this week. Notice that." |
| Bother score rising, below GP threshold | "Sounds like a rough week. Be gentle with yourself. Here's something calming if you'd like it." |
| Bother score rising **at or above Pamela's GP threshold** (PR #32 decision 9) | "This has been hard for a while now. It's worth talking to your GP. Here's a summary you can show them." |
| Mood check "very low" on the check-in | Signpost shown straight away, never buried: GP, NHS 111, Samaritans 116 123. **Wording and threshold for Pamela and legal to approve** |
| 7 days of check-ins (any answers) | "A whole week of checking in with yourself. That's you looking after you." |

Rules: celebrate *showing up and noticing*, not only doing. Never compare her to other women. Never imply she caused her symptoms. Never promise an outcome.

---

## 7. Words: labels and voice

**Labels** (draft, for Pamela to choose; each change goes into all 5 languages):

| Now | Proposed | Why |
|---|---|---|
| Home | **Today** | Says what it is: what matters today |
| My Plan | **My path** | A journey, not a document |
| Check in (📊) | **How I'm feeling** (🌤) | Says what you do there. A chart icon reads as admin |
| Journal | **My notes** | Plainer word |
| Learn | **Learn with Mel** | Puts her in it |
| Start here | **Your one small thing this week** | Answers "start where?" |
| Food · Doing · Thinking · Supplements | **What to eat · Things to try · Mind and mood · Supplements to ask about** | Each one says what's inside it. "Ask about" reinforces the GP check |
| Log today's symptoms | **How are you today?** | A question from a person, not a form |

**Mel's voice guide** (draft, for Pamela to rewrite in her own words):
- Speaks like Pamela on camera: direct, warm, sure of herself. *"You're not broken."* *"Say yes to yourself."*
- Second person, short sentences, everyday words. Reading age 9–11 (NHS standard).
- Validates first, then suggests: *"Waking at 3am is so common, and it's not in your head. Here's one thing that helps some women."*
- Offers, never orders: "you might try", "some women find" (already the rule for anything dosed or swallowed).
- No guilt about food, weight or effort. Pamela herself says: *"I don't want to make people feel guilty about their food choices."*
- Terms of endearment ("love", "lovely") only if Pamela uses them naturally. Fake warmth is worse than plain warmth.

**Card rewrite pattern** (bodies stay, new fields added in front):
- `mel_says`: one warm sentence that validates.
- `try_this`: one line, the actual action. Answers "I'd just paste it into AI".
- `why_it_helps`: the existing body, folded.
- Cautions and dose ceilings: unchanged and always visible.

Generated by Claude from the existing body, reviewed by Pamela in the plain-English review sheet (`npm run review-frameworks`), so she never touches YAML. A worked example is on the examples page.

---

## 8. Look and feel

- **Type:** a warm serif for headings (Fraunces, free on Google Fonts, with a "soft" axis made for friendly text). Keep Inter for body, raised to 17px, line height 1.6.
- **Colour:** cream (`#fff5db`, already in the theme) as the page background in place of white. Brand magenta for actions. Fewer borders, more breathing room.
- **Who is talking:** messages from Mel carry the Aunty Mel brand mark, never a face. Pamela's face appears only on her own video tiles (frames from CAM 2, where she looks at the camera), always labelled "From Pamela". Showing her photo beside Mel's words would pass the app's voice off as hers.
- **Motion:** gentle and optional. The breathing guide is the only animation that matters, and it respects `prefers-reduced-motion`.
- **Accessibility kept from PR #20:** 44px touch targets, ARIA tabs, priority never shown by colour alone, captions on every clip, transcripts for every clip.

---

## 9. Optional: a grown-up "garden" for progress

The penguin points at something real: a little thing that greets you and grows with you. Finch shows a cared-for creature can anchor a habit. A cartoon may not suit women over 40.

**Option:** her path shows a small garden that grows a leaf or flower each time she checks in or keeps a change. **It never wilts and never loses anything.** It ties to Pamela's own "Gut Garden" teaching.

This is a taste call for you and Pamela, best settled by showing both versions to test users. It's on the examples page and is not part of the core plan.

---

## 10. Phases

| Phase | Scope | Depends on | Risk |
|---|---|---|---|
| **0. This branch** | This plan and the examples page. No code | Nothing | None |
| **1. Warm welcome** | Welcome flow, video player and hosting, feeling tiles and calming moment, labels, typography, Today restructure, voice pass on existing UI strings | Hosting choice (Mux or Cloudflare Stream). Pamela approves clips, labels and voice | Low |
| **2. Chunked intake** | 3 intake chapters, engine handling of missing answers, "help Mel know you" prompts on Today | Pamela confirms chapter-1 questions | **High**: plan correctness. Needs `onboarding-influence`-style tests for every missing answer |
| **3. The path** | UI for PR #32's focus programme: weekly chapters, if-then, daily check-in, midweek note, review with Rest, return-after-gap, Today card | **PR #32 merged** and migration 036 live. Pamela's tag audit, GP thresholds, solicitor caveat | Medium |
| **4. Encouragement and reminders** | Message bank and rules engine, reminders in Mel's voice, GP summary, mood safety signpost | Pamela writes or approves the message bank. Legal approves the signpost | Medium |
| **5. Card voice** | `mel_says` / `try_this` for all 166 cards, through the review sheet | Pamela's review time | Low, but long |
| Optional | Garden progress motif | Test-user preference | Low |

---

## 11. How we'll know it worked

All logged to our own `app_events` (not Sentry.io). Baseline taken **before** Phase 1 ships.

| Measure | Why |
|---|---|
| **"Do you feel better than when you opened me?"** (Yes / A bit / Not really) | The North Star, asked directly. Shown at most once a day |
| **Time to first calm**: seconds from first open to finishing a calming moment | The tester's core complaint, as a number |
| Intake completion by chapter | Proves chunking doesn't lose answers the engine needs |
| Day-1, day-7 and day-30 return | Whether she comes back |
| Week-1 review completed | Whether the path loop closes |
| Focus-symptom bother score, week 1 vs week 4 | Leading signal that it helps. Never marketed as an outcome |

**Before building Phase 1:** take up the tester's offer of a call and walk her through the examples page. Then show it to 5–8 women in the target group, including someone like the second user (busy, English as a second language, uses AI a lot). Test the prototype, not opinions about it. Re-test every two weeks with the same women.

---

## 12. Decisions needed before deep work

1. **Branch base and the uncommitted translations work.** The main checkout has uncommitted changes (`messages/`, `src/i18n/`, 5-language content, migrations 029/030) that touch the same files this plan changes: dashboard, my-plan, onboarding, NavBar, layout. Local `main` is also 14 commits behind `origin/main`, and its migration numbers 029/030 clash with ones already on `origin/main`. **That work should be committed and merged first, or every label change here gets done twice.** How do you want to handle it?
2. **PR #32 (focus programme).** Phase 3 builds directly on it. Merge it as the engine, and add "Rest this week" as a review outcome?
3. **Labels.** Does Pamela write them, or choose from the drafts in section 7?
4. **Chapter-1 intake questions.** Does Pamela agree with the six in 5.2, the minimum for a safe and useful first plan?
5. **Video hosting.** Mux or Cloudflare Stream (private, adaptive streaming), or start simpler?
6. **Garden motif.** Include it in the test, or drop it?
7. **Free vs premium.** Suggested: welcome, feeling tiles with one clip per feeling, and Today are free. The path (PR #32 decision 8: premium only) and the full clip library are premium.
8. **The two flagged clips.** "HRT is a band-aid" and "3am isn't insomnia, it's temperature regulation breakdown" need Pamela's sign-off, or we leave them out.

---

## Sources

- NICE NG23, Nov 2024 update: https://www.nice.org.uk/guidance/ng23/chapter/update-information · https://pharmaceutical-journal.com/article/news/nice-recommends-cognitive-behavioural-therapy-for-treatment-of-menopause-symptoms
- MENOS 2 RCT and participant experience: https://pmc.ncbi.nlm.nih.gov/articles/PMC3191497/ · https://www.cambridge.org/core/journals/behavioural-and-cognitive-psychotherapy/article/cognitive-behaviour-therapy-for-menopausal-hot-flushes-and-night-sweats-a-qualitative-analysis-of-womens-experiences-of-group-and-selfhelp-cbt/194BDB07D0ECA5ACB0C45D74D307141A
- Supportive accountability (Mohr et al. 2011): https://jmir.org/2011/1/e30
- SDT and mHealth engagement overview (2026): https://mhealth.jmir.org/2026/1/e88382 · https://www.kcl.ac.uk/why-do-we-stop-using-health-apps-and-is-that-always-a-problem
- Self-compassion and hot flushes: https://pursuit.unimelb.edu.au/articles/self-compassion-may-help-women-cope-with-menopausal-symptoms · https://discovery.ucl.ac.uk/id/eprint/10215150/1/Saidel_10215150_thesis.pdf
- Feeling dismissed: https://www.dovepress.com/barriers-to-accessing-effective-treatment-and-support-for-menopausal-s-peer-reviewed-fulltext-article-PPA · https://nds.healthwatch.co.uk/reports-library/experiences-north-east-essex-menopause-and-perimenopause
- Implementation intentions: https://www.frontiersin.org/articles/10.3389/fpsyg.2021.565202/full
- Habit formation (Lally et al. 2010): https://www.ucl.ac.uk/news/2009/aug/how-long-does-it-take-form-habit · https://bps.org.uk/research-digest/how-form-habit
- Fresh start effect: https://faculty.wharton.upenn.edu/wp-content/uploads/2014/06/Dai_Fresh_Start_2014_Mgmt_Sci.pdf
- Trauma-informed design: https://uxpajournal.org/?p=6446
- NHS content guide: https://service-manual.nhs.uk/content/how-we-write
- Typography for older readers: https://odphp.health.gov/healthliteracyonline/2016/display/section-3-3/ · https://etheses.whiterose.ac.uk/9027
- Menopause apps: https://journals.sagepub.com/doi/10.1177/20552076251330782 · https://onstella.com/stella-app · https://healthify.nz/balance-app
- Finch design critique: https://ixd.prattsi.org/2026/02/design-critique-finch-self-care-pet-ios-app/
- Parasocial trust and health: https://ucrisportal.univie.ac.at/en/publications/engagement-with-influencers-as-sources-of-health-information-and- · https://publichealthpost.org/mental-behavioral-health/familiar-faces-risky-choices-parasocial-relationships-and-health/
