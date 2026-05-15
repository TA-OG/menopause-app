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
  created_at: string
  updated_at: string
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
