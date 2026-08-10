# smarterchange.co.uk blog → app content — intake log

Tracks which public blog posts have been pulled into `review/pamela-extraction/` for Pamela's
review, and which are queued next. Feeds the biweekly automated pull (see repo automation /
scheduled task "Pull smarterchange.co.uk blog post"). Read [README.md](README.md) conventions
before processing any item on this list.

**Important — this list only feeds the draft/review layer.** Per this folder's existing rule nothing
here goes live until Pamela signs off and it's rewritten into `content/wellness/frameworks/*.yaml`
or `content/modules/*`. The automated job appends a new dated extraction file and updates this log
— it does not touch live app content.

**Attribution:** every extraction file produced from this queue should credit the source post with
its title, publish date and URL, so that if/when the material becomes a Learn article
(`content/modules/`), the article can include a "based on an article by Pamela Windle,
originally published at smarterchange.co.uk/blog/<slug>" backlink.

---

## Processed

| Date pulled | Post | Published | Extraction file |
|---|---|---|---|
| 2026-08-10 | When Progesterone Isn't Right | 2026-06-10 | `blog-smarterchange-public.md` |
| 2026-08-10 | Is Your Deodorant Affecting Your Breast Health? | 2026-05-23 | *(queued below — not yet done, see note)* |
| 2026-08-10 | Why belly fat gets worse after menopause | 2026-05-10 | `blog-smarterchange-public.md` |
| 2026-08-10 | Your GP Said You Were Fine | 2026-03-14 | `blog-smarterchange-public.md` |
| 2026-08-10 | Before You Reach for a Supplement | 2026-03-06 | `blog-smarterchange-public.md` |
| 2026-08-10 | Osteoporosis Prevention | 2025-01-09 | `blog-smarterchange-public.md` |

*(Note: "Is Your Deodorant Affecting Your Breast Health?" was surveyed but not extracted in batch 1
— left in the queue below as the next new-topic candidate.)*

## Queue (next up, in priority order)

Priority favours frameworks with little/no coverage yet from this blog (sexual health, skin/hair,
high-stress, mood/anxiety) before topping up frameworks already enriched in batch 1.

1. Are YOU Struggling With Anxiety in Perimenopause? — 2023-06-02 → `mood-anxiety-brain-fog`
2. You Don't Have To Lose Your Libido! — 2020-10-02 → `sexual-health`
3. Are You Accidentally Making Your Skin Look Older? — 2023-04-16 → `skin-hair`
4. Do you often feel overwhelmed and burnt out? — 2023-06-22 → `high-stress`
5. What's REALLY Preventing you From Getting a Good Night's Sleep?? — 2023-04-02 → `sleep-fatigue`
6. Struggling to Lose Belly Weight? — 2023-06-16 → `weight-joint-energy`
7. Do You Know What to Do When a Menopausal Female Has a Heart Attack? — 2023-09-13 → `bone-cardiovascular`
8. Is Your Gut Negatively Impacting Your Perimenopause Journey? — 2023-10-13 → `foundations` (gut)
9. How to Get the Most Out of Your HRT — 2023-11-14 → `foundations` (HRT mindset)
10. Is Your Deodorant Affecting Your Breast Health? — 2026-05-23 → new topic, no framework yet
11. The Truth about EMFs — Is Your Trusty Mobile Messing with Your Sleep? — 2024-01-23 → `sleep-fatigue`
12. Do We Need to Use Lubrication When We're Over 40? — 2019-10-18 → `sexual-health`
13. Is Safe to Relax and Dye Your Hair in Menopause? — 2023-05-16 → `skin-hair`
14. 7 Simple Ways to Reduce Your Stress Levels and Rebalance Your Hormones — 2019-07-13 → `high-stress`
15. Could Histamine Intolerance Be Worsening Perimenopause Symptoms — 2024-02-17 → `foundations` (histamine — check overlap with `df_histamine_food_awareness`)
16. Can Spinach Worsen Menopause Symptoms? — 2024-09-16 → `foundations` (diet — check overlap)
17. Mould Could Be Affecting Your Menopause — 2024-03-05 → new topic, no framework yet
18. Does Endometriosis Disappear After Menopause? — 2024-03-20 → `perimenopause-specific`
19. Are You Struggling With Fibroids or Weight gain? — 2021-06-04 → `perimenopause-specific` / `weight-joint-energy`
20. Is it Thyroid, Perimenopause or Adrenal Fatigue? — 2022-02-07 → `foundations` (mindset)
21. How to Tell the Difference Between an Underactive Thyroid and Menopause — 2019-08-24 → `foundations` (likely duplicate of #20 — check first)
22. Did You Know That These Chronic Health Problems Can Make Menopause Even Worse? — 2023-07-07 → `foundations` (mindset)
23. It's Not Your Mum's Menopause — 2026-04-26 → `foundations` (general/mindset)
24. CBD for the Perimenopause and Menopause — Does it Work? — 2021-03-12 → `foundations` (supplement)
25. Is it Possible to Reverse the Ageing Process? — 2019-10-04 → `skin-hair`
26. Do This to Slow the Ageing Process and Protect Your Health! — 2023-03-16 → `skin-hair` (likely duplicate of #25 — check first)
27. Are You Eating Enough and Making Your Symptoms Worse? — 2023-05-02 → `foundations` (diet)
28. This is the ONLY Diet You'll Ever Need for the Menopause — 2019-06-01 → `foundations` (diet)
29. Can Drinking Alcohol Affect the Menopause? — 2019-05-18 → `foundations` (diet)
30. Peri-Menopause & Menopause – What's the Difference? — 2019-05-14 → `foundations` (evergreen intro — good anytime)
31. Menopause and Sleep: What is the Connection? — 2021-07-08 → `sleep-fatigue` (likely thin/duplicate — check first)

**Deliberately excluded from this queue:** workplace/employer-facing posts (menopause policy,
legal requirements, workplace culture, senior-leader engagement) — this app serves individual
users, not employers, so that content doesn't fit either surface. Podcast-episode listing pages
with no independent write-up are also excluded unless a transcript/summary exists on the page.

When this queue runs out, re-crawl `smarterchange.co.uk/blog` (paginated via `?page=N`) for posts
published after the last "Processed" date above, apply the same exclusions, and append newly
found relevant posts to the bottom of this queue in the same priority style.
