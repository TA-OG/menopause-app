import type { CulturalContext } from '@/lib/cultural-engine'

export type SubscriptionTier = 'free' | 'premium'
export type SubscriptionStatus = 'active' | 'cancelled' | 'past_due' | 'trialing' | null
export type MenopauseStage = 'perimenopause' | 'menopause' | 'postmenopause' | 'surgical' | 'unsure'
export type ExerciseLevel = 'very_active' | 'moderately_active' | 'lightly_active' | 'not_active' | 'limited'
export type DietType = 'whole_foods' | 'mixed' | 'convenience' | 'specific' | 'unaware'
export type StressLevel = 'low' | 'moderate' | 'high' | 'very_high'
export type SleepQuality = 'good' | 'fair' | 'poor' | 'very_poor'
export type AlcoholFrequency = 'never' | 'occasionally' | 'weekly' | 'daily'
export type RecommendationPriority = 'high' | 'medium' | 'low'
export type RecommendationCategory = 'diet' | 'lifestyle' | 'mindset' | 'supplement'
export type ContentTier = 'free' | 'premium'
export type CheckinMood = 1 | 2 | 3 | 4 | 5

// ─── Core symptom keys ────────────────────────────────────────────────────────
export type SymptomKey =
  | 'hot_flashes'
  | 'night_sweats'
  | 'sleep_problems'
  | 'mood_changes'
  | 'anxiety'
  | 'brain_fog'
  | 'weight_changes'
  | 'joint_pain'
  | 'low_libido'
  | 'fatigue'
  | 'vaginal_dryness'
  | 'skin_changes'
  | 'hair_changes'
  | 'other'

// ─── Database table interfaces ────────────────────────────────────────────────

export interface Profile {
  id: string                           // FK to auth.users
  full_name: string | null
  avatar_url: string | null
  onboarding_complete: boolean
  subscription_tier: SubscriptionTier
  subscription_status: SubscriptionStatus
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  menopause_stage: MenopauseStage | null
  date_of_birth: string | null         // ISO date string
  country: string | null               // ISO 3166-1 alpha-2
  currency: 'gbp' | 'usd' | null
  referral_code: string | null
  referral_months_banked: number
  created_at: string
  updated_at: string
}

// ─── Referral program ─────────────────────────────────────────────────────────

export type ReferralStatus = 'pending' | 'qualified' | 'expired'
export type ReferralRewardRole = 'referrer' | 'referred'
export type ReferralRewardStatus = 'pending' | 'applied' | 'failed'

export interface Referral {
  id: string
  referrer_id: string
  referred_id: string
  referral_code_used: string
  status: ReferralStatus
  qualified_at: string | null
  created_at: string
  updated_at: string
}

export interface ReferralReward {
  id: string
  referral_id: string
  user_id: string
  role: ReferralRewardRole
  months: number
  status: ReferralRewardStatus
  application_method: 'stripe_trial_extension' | 'banked_credit' | null
  applied_at: string | null
  notified_at: string | null
  created_at: string
}

export interface MenopauseProfile {
  id: string
  user_id: string
  last_period_date: string | null      // ISO date
  symptom_onset_date: string | null    // ISO date
  confirmed_menopause: boolean
  stage: MenopauseStage | null
  primary_goal: string | null
  secondary_goals: string[]
  previously_tried: string[]
  created_at: string
  updated_at: string
}

export interface OnboardingAnswer {
  id: string
  user_id: string
  question_key: string                 // e.g. 'primary_symptom', 'hot_flash_frequency'
  answer_value: string                 // e.g. 'hot_flashes', '8_or_more'
  answered_at: string
}

export interface UserPreferences {
  id: string
  user_id: string
  diet_type: DietType | null
  exercise_level: ExerciseLevel | null
  stress_level: StressLevel | null
  sleep_quality: SleepQuality | null
  alcohol_frequency: AlcoholFrequency | null
  smoking_status: 'never' | 'ex_smoker' | 'current' | null
  notification_hour: number | null     // 0-23, user's local hour for daily nudge
  notification_enabled: boolean
  feature_usage: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface SymptomCheckin {
  id: string
  user_id: string
  checkin_date: string                 // ISO date, unique per user per day
  symptoms: Partial<Record<SymptomKey, number>>  // symptom key → severity 1-5
  severity_overall: number | null      // 1-5
  mood_score: number | null            // 1-5
  sleep_hours: number | null
  energy_level: number | null          // 1-5
  // Lifestyle tracking — what they tried
  tried_today: string[]                // IDs of wellness plan items they actioned
  notes: string | null
  created_at: string
  updated_at: string
}

export interface WellnessPlan {
  id: string
  user_id: string
  generated_at: string
  framework_ids: string[]
  diet_adjustments: WellnessRecommendation[]
  lifestyle_adjustments: WellnessRecommendation[]
  mindset_recommendations: WellnessRecommendation[]
  supplement_suggestions: WellnessRecommendation[]
  // Optional: buildPlan()'s return type omits this (populated separately
  // by the wellness-plan API route from the cultural engine), and older
  // rows predating the column may not have it either.
  cultural_context?: CulturalContext | null
  is_active: boolean
  version: number
  created_at: string
}

export interface WellnessRecommendation {
  id: string
  title: string
  body: string
  priority: RecommendationPriority
  category: RecommendationCategory
  disclaimer?: string                  // Required for supplements
  /**
   * Audience tag for preference-based filtering in the engine.
   * 'all'         — shown to everyone (default)
   * 'active_only' — hidden for users with exercise_level='limited' or 'not_active'
   *
   * Field name matches the YAML convention (who_for) for direct parse compatibility.
   */
  who_for?: 'all' | 'active_only' | string
  /**
   * Symptom IDs this recommendation most directly addresses.
   * Used by the engine to boost priority when it matches primary_symptom.
   */
  targets_symptoms?: string[]
  /**
   * Populated by the engine (not authored in YAML) when several frameworks
   * each contributed a card for the same substance. Carries the symptom-specific
   * framing from the cards that were collapsed away, so personalisation survives
   * deduplication.
   */
  also_for?: string[]
  /**
   * Populated by the engine (not authored in YAML) from the substance registry.
   * A single, explicit cumulative ceiling for this substance, shown once so a
   * user who matched several frameworks cannot read four cards as four doses.
   */
  max_daily_note?: string
  /**
   * Onboarding answers that make this recommendation *directly* relevant to
   * this user, e.g. the caffeine-cutoff card for someone drinking 4+ cups.
   *
   * SEMANTICS DIFFER FROM `trigger_conditions` — READ THIS.
   *   trigger_conditions : AND across conditions (all must match to fire).
   *   relevant_when      : OR  across conditions (any match = directly relevant).
   *
   * The difference is deliberate. A framework fires when a user's whole
   * situation matches. Relevance is naturally disjunctive: "this matters to
   * you if any of these apply". Within a single condition, the `answer` array
   * and `min_matches` behave exactly as they do for triggers.
   *
   * Relevance only ever adjusts RANKING. A recommendation is never removed for
   * failing to match — a non-smoker still has the smoking-cessation card in her
   * library, it simply stops competing for space at the top of her plan.
   */
  relevant_when?: TriggerCondition[]
  /**
   * Medical flags (from the `medical_flags` onboarding question) that this
   * recommendation's OWN disclaimer already addresses.
   *
   * This is an INDEX INTO EXISTING VERIFIED CONTENT, never an independent
   * clinical claim. `validateFlagTags()` enforces both directions: a tag whose
   * disclaimer says nothing about that condition fails the build, and a
   * disclaimer that names a condition without the matching tag fails too. So
   * these tags cannot drift from — or invent beyond — the authored copy.
   *
   * A flag NEVER removes a recommendation. It surfaces the caution the author
   * already wrote, and de-ranks the card out of the lead position.
   */
  caution_for?: string[]
  /**
   * Dietary restrictions (from the `diet_restrictions` onboarding question)
   * that this recommendation needs adapting for — e.g. the two collagen cards,
   * whose own copy says "if you have a fish or shellfish allergy, check the
   * source", and glucosamine, which is "often shellfish-derived".
   *
   * Like `caution_for`, this indexes existing authored copy rather than adding
   * a claim, and it NEVER removes a card. Removal would actively misfire on
   * this content: every omega-3 card already reads "from fish oil or algae
   * oil ... algae-based is the plant-based equivalent", so dropping it for a
   * vegan would delete advice the author had deliberately made vegan-safe.
   */
  adapt_for?: string[]
  /**
   * Populated by the engine (not authored in YAML) when one of this user's own
   * answers bears directly on this card — a medical flag it cautions about, or
   * a dietary restriction it needs adapting for. This is what makes the plan
   * visibly hers rather than generically correct.
   */
  personal_note?: PersonalNote
}

/**
 * A single piece of "this applies to you, specifically" context attached to a
 * recommendation by the engine, from the user's own onboarding answers.
 */
export interface PersonalNote {
  /**
   * 'caution' — a declared medical flag this card's disclaimer speaks to.
   *             Always surfaced ABOVE any collapsed/"read more" boundary.
   * 'adapt'   — a dietary restriction the card can be adapted for.
   */
  kind: 'caution' | 'adapt'
  /** The onboarding answer values that produced this note, e.g. ['blood_thinners']. */
  because: string[]
  /** Reader-facing sentence. Never asserts anything the card does not already say. */
  text: string
}

/**
 * A normalised, total view of everything the user told us at intake.
 *
 * WHY THIS EXISTS
 * `buildPlan()` used to receive only `preferences` and `primarySymptom`, and
 * the engine read exactly one field off `preferences` (`exercise_level`). That
 * meant 11 of the 20 questions onboarding asks could not possibly influence the
 * plan — not because of a bug in the ranking, but because their answers were
 * never passed to the code that builds it. Every one of them was written to the
 * database and then never read again.
 *
 * Deriving one explicit object, from the full answer set, makes the engine's
 * inputs visible and testable, and makes "which questions actually shape the
 * plan?" a question with a checkable answer. See `onboarding-influence.test.ts`,
 * which fails the build if a collected question stops mattering.
 */
export interface UserSignals {
  age_range?: string
  menopause_stage?: string
  /** Every symptom she ticked. */
  symptoms: string[]
  primary_symptom?: string
  symptom_severity?: string
  primary_goal?: string
  diet_type?: string
  diet_restrictions: string[]
  exercise_level?: string
  smoking_status?: string
  alcohol_intake?: string
  caffeine_intake?: string
  sleep_quality?: string
  stress_level?: string
  medical_flags: string[]
  previously_tried: string[]
}

/**
 * Substance registry — the single auditable place where we declare which
 * supplement recommendations refer to the same underlying substance, and what
 * the maximum safe combined daily intake is.
 *
 * This exists because one user can legitimately match many frameworks at once.
 * Without it, each framework contributes its own card for (say) omega-3 and the
 * doses read as additive. See enforceDoseCeilings() in wellness-engine.ts.
 */
export interface SubstanceMaxDaily {
  amount: number
  unit: string
  /** What the figure is measured over, e.g. "combined EPA+DHA from supplements" */
  basis: string
  /** Full citation for the figure. Never leave this empty. */
  source: string
}

export interface SubstanceEntry {
  /** Stable key, e.g. 'omega_3_epa_dha' */
  key: string
  display_name: string
  /**
   * 'verified'              — max_daily is set and carries a real citation
   * 'needs_clinical_review' — no upper limit encoded yet; must be null
   *
   * Structural protection (one card per substance, doses never summed) applies
   * either way. This flag only governs whether a *numeric* ceiling is enforced.
   */
  limit_status: 'verified' | 'needs_clinical_review'
  max_daily: SubstanceMaxDaily | null
  /** Every supplement recommendation ID that refers to this substance. */
  recommendation_ids: string[]
  /** Free-text note for anything a reviewer must know (e.g. combination products). */
  note?: string
}

export interface JournalEntry {
  id: string
  user_id: string
  content: string
  // Structured tracking fields
  symptom_focus: SymptomKey | null     // Which symptom this entry is about
  plan_item_id: string | null          // Which wellness plan item they're journalling about
  plan_item_title?: string | null      // Human-readable title for the plan item (optional)
  days_tried: number | null            // How many days they've been trying this item
  perceived_effect: 'much_better' | 'better' | 'no_change' | 'worse' | null
  would_continue: boolean | null
  created_at: string
  updated_at: string
}

export interface ContentModule {
  id: string
  slug: string
  title: string
  body_md: string
  tier: ContentTier
  category: string
  tags: string[]
  estimated_read_minutes: number | null
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface PushSubscription {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  created_at: string
}

export interface AuditLog {
  id: string
  table_name: string
  record_id: string
  action: 'INSERT' | 'UPDATE' | 'DELETE'
  performed_by: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  timestamp: string
}

// ─── Wellness engine types ────────────────────────────────────────────────────

export interface WellnessFramework {
  id: string
  label: string
  /**
   * If true, this framework fires for every user regardless of their answers.
   * Used for universal foundations (hydration, vitamin D, GP signpost etc).
   * When trigger_all is true, trigger_conditions is ignored.
   */
  trigger_all?: boolean
  trigger_conditions: TriggerCondition[]
  diet_adjustments: WellnessRecommendation[]
  lifestyle_adjustments: WellnessRecommendation[]
  mindset_recommendations: WellnessRecommendation[]
  supplement_suggestions: WellnessRecommendation[]
  content_module_ids?: string[]
}

export interface TriggerCondition {
  question: string
  answer: string | string[]
  min_matches?: number
}

// ─── API response types ───────────────────────────────────────────────────────

export interface ApiResponse<T = void> {
  data?: T
  error?: string
}

export interface ProfileResponse extends ApiResponse<Profile> {}
export interface WellnessPlanResponse extends ApiResponse<WellnessPlan> {}
export interface JournalEntriesResponse extends ApiResponse<JournalEntry[]> {}
export interface ContentModulesResponse extends ApiResponse<ContentModule[]> {}

// ─── UI / component types ─────────────────────────────────────────────────────

export interface OnboardingStep {
  id: number
  title: string
  description?: string
  component: string
}

export interface NavItem {
  label: string
  href: string
  icon: string
  requiresPremium?: boolean
}

// ─── Journal tracking types ───────────────────────────────────────────────────

export interface SymptomTrend {
  date: string
  symptom: SymptomKey
  severity: number
}

export interface PlanItemProgress {
  plan_item_id: string
  title: string
  category: RecommendationCategory
  days_tried: number
  last_effect: string | null
  would_continue: boolean | null
}
