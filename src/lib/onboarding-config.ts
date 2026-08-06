/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ONBOARDING — single source of truth
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Every question the app asks at sign-up is defined here. The wizard
 * (src/app/onboarding/page.tsx) renders this array in order — it has no
 * hard-coded questions of its own.
 *
 * WHY THIS MATTERS
 * Each answer is stored in `onboarding_answers` as (question_key, answer_value),
 * and the wellness engine matches frameworks against exactly those pairs. So a
 * step's `key` + a choice's `value` here ARE the vocabulary Pamela's frameworks
 * trigger on. Add a step here and it immediately becomes available as a framework
 * trigger — no engine or database change required.
 *
 * ╭───────────────────────────────────────────────────────────────────────────╮
 * │ HOW TO ADD A NEW SECTION (for additional research areas)                    │
 * │                                                                             │
 * │   1. Copy one of the SINGLE or MULTI blocks below.                          │
 * │   2. Give it a unique `key` (snake_case) and `id`.                          │
 * │   3. List the `choices` — each needs a stable `value` (snake_case) and a    │
 * │      human `label`.                                                         │
 * │   4. Drop it into the STEPS array at the position you want it asked.        │
 * │                                                                             │
 * │   That's it. Frameworks can now trigger on `your_key` = `your_value`.       │
 * │   See the EXTENSION TEMPLATE at the bottom of STEPS for a ready example.    │
 * ╰───────────────────────────────────────────────────────────────────────────╯
 */

export interface Choice {
  value: string
  label: string
  emoji?: string
}

interface BaseStep {
  id: string
  title: string
  subtitle?: string
}

export type OnboardingStep =
  /** Single-select; auto-advances on tap. */
  | (BaseStep & {
      kind: 'single'
      key: string
      choices?: Choice[]
      /** Derive choices from earlier answers (e.g. primary symptom from symptoms). */
      choicesFrom?: (answers: AnswerMap) => Choice[]
      skippable?: boolean
    })
  /** Multi-select; user taps Continue when done. */
  | (BaseStep & {
      kind: 'multi'
      key: string
      choices: Choice[]
      minSelect?: number
      skippable?: boolean
      ctaLabel?: string
    })
  /** Free-text input. */
  | (BaseStep & {
      kind: 'text'
      key: string
      placeholder?: string
      required?: boolean
    })
  /** Bespoke step rendered by a dedicated component in the wizard. */
  | (BaseStep & {
      kind: 'custom'
      component: 'disclaimer' | 'continent' | 'heritage' | 'location' | 'complete'
    })

/** Answers are a flat map; array values are multi-selects. */
export type AnswerMap = Record<string, string | string[] | undefined>

// ─── Choice sets ──────────────────────────────────────────────────────────────

const AGE_CHOICES: Choice[] = ['Under 40', '40–44', '45–49', '50–54', '55–59', '60+'].map(
  (v) => ({ value: v, label: v })
)

const STAGE_CHOICES: Choice[] = [
  { value: 'unsure', label: "I'm not sure yet" },
  { value: 'perimenopause', label: "I think I'm in perimenopause" },
  { value: 'menopause', label: "I've been told I'm in menopause" },
  { value: 'postmenopause', label: "I'm postmenopausal" },
  { value: 'surgical', label: "I've had surgical menopause" },
]

export const SYMPTOM_CHOICES: Choice[] = [
  { value: 'hot_flashes', label: 'Hot flushes' },
  { value: 'night_sweats', label: 'Night sweats' },
  { value: 'sleep_problems', label: 'Sleep problems' },
  { value: 'mood_changes', label: 'Mood changes / irritability' },
  { value: 'anxiety', label: 'Anxiety' },
  { value: 'brain_fog', label: 'Brain fog / memory' },
  { value: 'weight_changes', label: 'Weight changes' },
  { value: 'joint_pain', label: 'Joint or muscle aches' },
  { value: 'fatigue', label: 'Low energy / fatigue' },
  { value: 'low_libido', label: 'Low libido' },
  { value: 'vaginal_dryness', label: 'Vaginal dryness' },
  { value: 'skin_changes', label: 'Skin changes' },
  { value: 'hair_changes', label: 'Hair changes' },
]

const SEVERITY_CHOICES: Choice[] = [
  { value: 'mild', label: 'Mild — noticeable but manageable' },
  { value: 'moderate', label: 'Moderate — affects my day regularly' },
  { value: 'severe', label: 'Severe — it disrupts my life' },
]

const GOAL_CHOICES: Choice[] = [
  'Reduce physical symptoms',
  'Improve sleep',
  'Manage mood and stress',
  'Understand my body better',
  'Manage weight',
  'Boost energy',
  'Improve relationships and intimacy',
  'All of the above',
].map((v) => ({ value: v, label: v }))

const DIET_CHOICES: Choice[] = [
  { value: 'whole_foods', label: 'Mostly whole foods' },
  { value: 'mixed', label: 'Mixed — some healthy, some not' },
  { value: 'convenience', label: 'Convenience / fast food mostly' },
  { value: 'specific', label: 'I follow a specific diet (vegan, vegetarian etc.)' },
  { value: 'unaware', label: "I don't pay much attention to diet" },
]

const DIET_RESTRICTION_CHOICES: Choice[] = [
  { value: 'none', label: 'No restrictions' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'dairy_free', label: 'Dairy-free / lactose intolerant' },
  { value: 'gluten_free', label: 'Gluten-free / coeliac' },
  { value: 'nut_allergy', label: 'Nut allergy' },
  { value: 'shellfish_allergy', label: 'Shellfish allergy' },
  { value: 'soy_free', label: 'Avoid soy' },
  { value: 'halal', label: 'Halal' },
  { value: 'kosher', label: 'Kosher' },
]

const EXERCISE_CHOICES: Choice[] = [
  { value: 'very_active', label: 'Very active (4+ days/week)' },
  { value: 'moderately_active', label: 'Moderately active (2–3 days/week)' },
  { value: 'lightly_active', label: 'Lightly active (walks, 1 day/week)' },
  { value: 'not_active', label: 'Not very active' },
  { value: 'limited', label: 'I have a condition that limits me' },
]

const SMOKING_CHOICES: Choice[] = [
  { value: 'non_smoker', label: 'Never smoked' },
  { value: 'ex_smoker', label: 'Ex-smoker' },
  { value: 'occasional_smoker', label: 'Occasionally' },
  { value: 'regular_smoker', label: 'Regularly' },
]

const ALCOHOL_CHOICES: Choice[] = [
  { value: 'none', label: "I don't drink" },
  { value: 'occasional', label: 'Occasionally (1–2 drinks/week)' },
  { value: 'regular', label: 'Regularly (3–7 drinks/week)' },
  { value: 'frequent', label: 'Most days' },
]

const CAFFEINE_CHOICES: Choice[] = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low (1 cup/day)' },
  { value: 'moderate', label: 'Moderate (2–3/day)' },
  { value: 'high', label: 'High (4+/day)' },
]

const SLEEP_CHOICES: Choice[] = [
  { value: 'good', label: 'Good — I sleep well' },
  { value: 'fair', label: 'Fair — some disruption' },
  { value: 'poor', label: 'Poor — I struggle most nights' },
  { value: 'very_poor', label: 'Very poor — sleep is a major problem' },
]

const STRESS_CHOICES: Choice[] = [
  { value: 'low', label: 'Low — I feel calm most of the time' },
  { value: 'moderate', label: 'Moderate — some stress but manageable' },
  { value: 'high', label: 'High — I feel stressed regularly' },
  { value: 'very_high', label: 'Very high — I feel overwhelmed' },
]

const MEDICAL_FLAG_CHOICES: Choice[] = [
  { value: 'none', label: 'None of these' },
  { value: 'on_hrt', label: "I'm currently on HRT" },
  { value: 'oestrogen_sensitive', label: 'History of breast/ovarian cancer or an oestrogen-sensitive condition' },
  { value: 'blood_thinners', label: 'I take blood thinners (e.g. warfarin)' },
  { value: 'high_blood_pressure', label: 'High blood pressure' },
  { value: 'kidney_stones', label: 'History of kidney stones' },
  { value: 'thyroid', label: 'Thyroid condition' },
  { value: 'diabetes', label: 'Diabetes' },
  { value: 'pregnant_breastfeeding', label: 'Pregnant or breastfeeding' },
]

const TRIED_CHOICES: Choice[] = [
  'Nothing yet',
  'Diet changes',
  'Exercise',
  'HRT',
  'Natural supplements',
  'Mindfulness / meditation',
  'Counselling or therapy',
  'Acupuncture',
  'Other',
].map((v) => ({ value: v, label: v }))

// ─── Step flow ────────────────────────────────────────────────────────────────
// Order here = order asked. New sections (severity, diet restrictions, lifestyle,
// medical & safety) are interleaved into the relevant part of the flow.

export const STEPS: OnboardingStep[] = [
  { id: 'disclaimer', kind: 'custom', component: 'disclaimer', title: '' },

  {
    id: 'name',
    kind: 'text',
    key: 'full_name',
    title: "What's your name?",
    subtitle: "We'll use this to personalise your experience.",
    placeholder: 'Your first name',
    required: true,
  },
  {
    id: 'age',
    kind: 'single',
    key: 'age_range',
    title: 'How old are you?',
    choices: AGE_CHOICES,
  },
  {
    id: 'stage',
    kind: 'single',
    key: 'menopause_stage',
    title: 'Where are you in your menopause journey?',
    subtitle: "It's okay if you're not sure — we'll help you understand.",
    choices: STAGE_CHOICES,
  },

  // ── Symptoms ──────────────────────────────────────────────────────────────
  {
    id: 'symptoms',
    kind: 'multi',
    key: 'symptoms',
    title: 'Which symptoms are you experiencing?',
    subtitle: 'Select all that apply.',
    choices: SYMPTOM_CHOICES,
    minSelect: 1,
  },
  {
    id: 'primary_symptom',
    kind: 'single',
    key: 'primary_symptom',
    title: 'Which symptom bothers you most right now?',
    subtitle: 'This helps us prioritise your plan.',
    // Only offer the symptoms they already selected.
    choicesFrom: (a) => {
      const selected = (a.symptoms as string[] | undefined) ?? []
      return SYMPTOM_CHOICES.filter((c) => selected.includes(c.value))
    },
  },
  {
    id: 'symptom_severity',
    kind: 'single',
    key: 'symptom_severity',
    title: 'How severe is that main symptom?',
    subtitle: 'We tailor how intensive your plan is to how much it affects you.',
    choices: SEVERITY_CHOICES,
  },

  {
    id: 'goal',
    kind: 'single',
    key: 'primary_goal',
    title: "What's your main goal with this app?",
    choices: GOAL_CHOICES,
  },

  // ── Diet ────────────────────────────────────────────────────────────────--
  {
    id: 'diet',
    kind: 'single',
    key: 'diet_type',
    title: 'How would you describe your current diet?',
    choices: DIET_CHOICES,
  },
  {
    id: 'diet_restrictions',
    kind: 'multi',
    key: 'diet_restrictions',
    title: 'Any dietary needs or allergies we should respect?',
    subtitle: "Select all that apply — we won't suggest foods that don't fit.",
    choices: DIET_RESTRICTION_CHOICES,
  },

  // ── Lifestyle ──────────────────────────────────────────────────────────────
  {
    id: 'exercise',
    kind: 'single',
    key: 'exercise_level',
    title: 'How active are you currently?',
    choices: EXERCISE_CHOICES,
  },
  {
    id: 'smoking',
    kind: 'single',
    key: 'smoking_status',
    title: 'Do you smoke?',
    subtitle: 'Smoking affects hot flushes, bone and heart health.',
    choices: SMOKING_CHOICES,
  },
  {
    id: 'alcohol',
    kind: 'single',
    key: 'alcohol_intake',
    title: 'How often do you drink alcohol?',
    choices: ALCOHOL_CHOICES,
  },
  {
    id: 'caffeine',
    kind: 'single',
    key: 'caffeine_intake',
    title: 'How much caffeine do you have?',
    choices: CAFFEINE_CHOICES,
  },
  {
    id: 'sleep',
    kind: 'single',
    key: 'sleep_quality',
    title: 'How would you rate your sleep quality right now?',
    choices: SLEEP_CHOICES,
  },
  {
    id: 'stress',
    kind: 'single',
    key: 'stress_level',
    title: 'How is your stress level day-to-day?',
    choices: STRESS_CHOICES,
  },

  // ── Health & safety ─────────────────────────────────────────────────────────
  {
    id: 'medical_flags',
    kind: 'multi',
    key: 'medical_flags',
    title: 'Do any of these apply to you?',
    subtitle:
      'This keeps your plan safe — we use it to flag supplements or advice to check with your GP first. Select all that apply.',
    choices: MEDICAL_FLAG_CHOICES,
  },

  // ── Heritage & location (bespoke steps) ─────────────────────────────────────
  { id: 'continent', kind: 'custom', component: 'continent', title: '' },
  { id: 'heritage', kind: 'custom', component: 'heritage', title: '' },
  { id: 'location', kind: 'custom', component: 'location', title: '' },

  {
    id: 'previously_tried',
    kind: 'multi',
    key: 'previously_tried',
    title: 'Have you tried anything to manage your symptoms?',
    subtitle: "Select all that apply — we won't repeat what hasn't worked.",
    choices: TRIED_CHOICES,
    ctaLabel: 'Build my plan →',
  },

  // ╭─ EXTENSION TEMPLATE ──────────────────────────────────────────────────────╮
  // │ Copy this block, give it a unique id + key + choices, and move it to       │
  // │ wherever you want it asked. Delete these comment lines when you do.         │
  // │                                                                            │
  // │ {                                                                          │
  // │   id: 'my_new_section',                                                    │
  // │   kind: 'single',          // or 'multi'                                   │
  // │   key: 'my_question_key',  // becomes the framework trigger question       │
  // │   title: 'Your question here?',                                            │
  // │   subtitle: 'Optional helper text.',                                       │
  // │   choices: [                                                               │
  // │     { value: 'option_a', label: 'Option A' },                             │
  // │     { value: 'option_b', label: 'Option B' },                             │
  // │   ],                                                                       │
  // │ },                                                                         │
  // ╰────────────────────────────────────────────────────────────────────────────╯

  { id: 'complete', kind: 'custom', component: 'complete', title: '' },
]

// ─── Persistence mapping ──────────────────────────────────────────────────────
// Every answer is written to `onboarding_answers` generically. A few keys ALSO
// populate dedicated columns the rest of the app reads directly. Adding a new
// step needs no change here unless it must feed one of those columns.

/** Keys copied onto the `profiles` row. */
export const PROFILE_KEYS = ['full_name', 'menopause_stage'] as const

/** Keys copied onto the `user_preferences` row (read by the wellness engine). */
export const PREFERENCE_KEYS = [
  'diet_type',
  'exercise_level',
  'sleep_quality',
  'stress_level',
] as const

/** All keys that produce a stored answer (used by tests / tooling). */
export function collectedKeys(): string[] {
  return STEPS.filter(
    (s): s is Extract<OnboardingStep, { key: string }> => 'key' in s
  ).map((s) => s.key)
}

// ─── Heritage & location data (consumed by the bespoke steps) ─────────────────

export const CONTINENT_OPTIONS: Choice[] = [
  { value: 'africa', label: 'Africa', emoji: '🌍' },
  { value: 'caribbean', label: 'Caribbean', emoji: '🌴' },
  { value: 'south_asia', label: 'South Asia', emoji: '🌏' },
  { value: 'east_asia', label: 'East & Southeast Asia', emoji: '🌸' },
  { value: 'mena', label: 'Middle East & North Africa', emoji: '🌙' },
  { value: 'latin_america', label: 'Latin America', emoji: '🌎' },
  { value: 'europe', label: 'Europe & British Isles', emoji: '🏰' },
  { value: 'other', label: 'Mixed / Other', emoji: '🌐' },
]

/** Maps a continent value to the COMMUNITY_OPTIONS group names to show. */
export const CONTINENT_TO_GROUPS: Record<string, string[]> = {
  africa: ['Nigeria', 'Ghana', 'East & Southern Africa', 'West Africa (other)'],
  caribbean: ['Caribbean'],
  south_asia: ['South Asia — India', 'South Asia — Pakistan & Bangladesh'],
  east_asia: ['East Asia', 'Southeast Asia'],
  mena: ['Middle East & North Africa'],
  latin_america: ['Latin America'],
  europe: ['White British & European'],
  other: ['Other'],
}

/**
 * ISO 3166-1 alpha-2 codes — must match the keys in LOCATION_FILE_MAP
 * (src/lib/community-map.ts). This is deliberately a short list: it only
 * needs to cover countries that have (or are planned to have) a location
 * modifier file. 'other' means no location modifier is loaded — that's a
 * safe, honest default, not a gap to fill with an exhaustive country list.
 */
export const COUNTRY_OPTIONS: Choice[] = [
  { value: 'GB', label: 'United Kingdom' },
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'AU', label: 'Australia' },
  { value: 'other', label: 'Somewhere else' },
]

export const TIMEZONE_OPTIONS: Array<{ group: string; options: Choice[] }> = [
  { group: 'UK & Ireland', options: [{ value: 'Europe/London', label: 'London / Dublin (GMT / BST)' }] },
  {
    group: 'Europe',
    options: [
      { value: 'Europe/Paris', label: 'Paris / Berlin / Amsterdam (CET)' },
      { value: 'Europe/Helsinki', label: 'Helsinki / Tallinn (EET)' },
      { value: 'Europe/Lisbon', label: 'Lisbon / Canary Islands (WET)' },
    ],
  },
  {
    group: 'Africa',
    options: [
      { value: 'Africa/Lagos', label: 'Lagos / Accra / Abidjan (WAT)' },
      { value: 'Africa/Nairobi', label: 'Nairobi / Kampala / Dar es Salaam (EAT)' },
      { value: 'Africa/Johannesburg', label: 'Johannesburg / Harare / Lusaka (SAST)' },
      { value: 'Africa/Cairo', label: 'Cairo / Khartoum (EET)' },
      { value: 'Africa/Casablanca', label: 'Casablanca / Rabat (WET)' },
    ],
  },
  {
    group: 'Middle East',
    options: [
      { value: 'Asia/Dubai', label: 'Dubai / Abu Dhabi (GST)' },
      { value: 'Asia/Riyadh', label: 'Riyadh / Kuwait / Baghdad (AST)' },
      { value: 'Asia/Beirut', label: 'Beirut / Amman / Nicosia (EET)' },
      { value: 'Asia/Tehran', label: 'Tehran (IRST)' },
    ],
  },
  {
    group: 'South Asia',
    options: [
      { value: 'Asia/Kolkata', label: 'India (IST)' },
      { value: 'Asia/Karachi', label: 'Pakistan (PKT)' },
      { value: 'Asia/Dhaka', label: 'Bangladesh (BST)' },
      { value: 'Asia/Colombo', label: 'Sri Lanka (SLST)' },
    ],
  },
  {
    group: 'East & SE Asia',
    options: [
      { value: 'Asia/Shanghai', label: 'China / Hong Kong / Taiwan (CST)' },
      { value: 'Asia/Tokyo', label: 'Japan / Korea (JST)' },
      { value: 'Asia/Singapore', label: 'Singapore / Malaysia / Philippines (SGT)' },
      { value: 'Asia/Bangkok', label: 'Thailand / Vietnam / Indonesia (ICT)' },
    ],
  },
  {
    group: 'Americas',
    options: [
      { value: 'America/New_York', label: 'New York / Toronto / Miami (ET)' },
      { value: 'America/Chicago', label: 'Chicago / Mexico City (CT)' },
      { value: 'America/Denver', label: 'Denver / Phoenix (MT)' },
      { value: 'America/Los_Angeles', label: 'Los Angeles / Vancouver (PT)' },
      { value: 'America/Jamaica', label: 'Jamaica / Caribbean (EST)' },
      { value: 'America/Sao_Paulo', label: 'São Paulo / Buenos Aires (BRT)' },
    ],
  },
  {
    group: 'Pacific',
    options: [
      { value: 'Australia/Sydney', label: 'Sydney / Melbourne (AEST)' },
      { value: 'Pacific/Auckland', label: 'New Zealand (NZST)' },
    ],
  },
]

export const COMMUNITY_OPTIONS: Array<{ group: string; options: Choice[] }> = [
  {
    group: 'Nigeria',
    options: [
      { value: 'yoruba', label: 'Yoruba (Lagos, Oyo, Ogun, Ondo, Ekiti, Osun)' },
      { value: 'igbo', label: 'Igbo (Anambra, Imo, Enugu, Abia, Ebonyi)' },
      { value: 'hausa_fulani', label: 'Hausa / Hausa-Fulani (Northern Nigeria)' },
      { value: 'ijaw', label: 'Ijaw / Niger Delta' },
      { value: 'edo', label: 'Edo / Bini' },
      { value: 'efik', label: 'Efik / Ibibio (Cross River, Akwa Ibom)' },
      { value: 'urhobo', label: 'Urhobo / Delta' },
      { value: 'nigerian_other', label: 'Other Nigerian heritage' },
    ],
  },
  {
    group: 'Ghana',
    options: [
      { value: 'akan', label: 'Akan / Ashanti / Fante' },
      { value: 'ewe', label: 'Ewe' },
      { value: 'ga', label: 'Ga / Adangbe' },
      { value: 'ghanaian', label: 'Other Ghanaian heritage' },
    ],
  },
  {
    group: 'East & Southern Africa',
    options: [
      { value: 'kikuyu', label: 'Kikuyu (Kenya)' },
      { value: 'luo', label: 'Luo (Kenya/Uganda)' },
      { value: 'kenyan', label: 'Other Kenyan heritage' },
      { value: 'baganda', label: 'Baganda (Uganda)' },
      { value: 'ugandan', label: 'Other Ugandan heritage' },
      { value: 'bemba', label: 'Bemba (Zambia)' },
      { value: 'zambian', label: 'Other Zambian heritage' },
      { value: 'shona', label: 'Shona (Zimbabwe)' },
      { value: 'zulu', label: 'Zulu (South Africa)' },
      { value: 'xhosa', label: 'Xhosa (South Africa)' },
      { value: 'south_african', label: 'Other South African heritage' },
      { value: 'amhara', label: 'Amhara / Oromo (Ethiopia)' },
      { value: 'somali', label: 'Somali' },
    ],
  },
  {
    group: 'West Africa (other)',
    options: [
      { value: 'wolof', label: 'Wolof (Senegal/Gambia)' },
      { value: 'temne', label: 'Temne / Mende (Sierra Leone)' },
      { value: 'krio', label: 'Krio (Sierra Leone)' },
    ],
  },
  {
    group: 'Caribbean',
    options: [
      { value: 'jamaican', label: 'Jamaican' },
      { value: 'trinidadian', label: 'Trinidadian / Tobagonian' },
      { value: 'barbadian', label: 'Barbadian (Bajan)' },
      { value: 'guyanese', label: 'Guyanese' },
      { value: 'haitian', label: 'Haitian' },
      { value: 'grenadian', label: 'Grenadian' },
      { value: 'st_lucian', label: 'St Lucian' },
      { value: 'caribbean', label: 'Other Caribbean heritage' },
    ],
  },
  {
    group: 'South Asia — India',
    options: [
      { value: 'punjabi', label: 'Punjabi (Sikh / Hindu)' },
      { value: 'gujarati', label: 'Gujarati (including Jain)' },
      { value: 'bengali_india', label: 'Bengali (West Bengal)' },
      { value: 'tamil', label: 'Tamil (Tamil Nadu / South India)' },
      { value: 'malayali', label: 'Malayali (Kerala)' },
      { value: 'marathi', label: 'Marathi (Maharashtra)' },
      { value: 'telugu', label: 'Telugu (Andhra / Telangana)' },
      { value: 'kannada', label: 'Kannada (Karnataka)' },
      { value: 'bihari', label: 'Bihari / UP' },
      { value: 'rajasthani', label: 'Rajasthani' },
      { value: 'indian', label: 'Other Indian heritage' },
    ],
  },
  {
    group: 'South Asia — Pakistan & Bangladesh',
    options: [
      { value: 'punjabi_pakistan', label: 'Punjabi (Pakistan / Muslim)' },
      { value: 'sindhi', label: 'Sindhi' },
      { value: 'pashtun', label: 'Pashtun / KPK' },
      { value: 'kashmiri', label: 'Kashmiri' },
      { value: 'pakistani', label: 'Other Pakistani heritage' },
      { value: 'bangladeshi', label: 'Bangladeshi / Bengali (Bangladesh)' },
      { value: 'sylheti', label: 'Sylheti' },
      { value: 'sri_lankan', label: 'Sri Lankan (Sinhalese / Tamil)' },
    ],
  },
  {
    group: 'East Asia',
    options: [
      { value: 'cantonese', label: 'Cantonese (Guangdong / Hong Kong)' },
      { value: 'mandarin', label: 'Mandarin-speaking (Northern China)' },
      { value: 'hakka', label: 'Hakka' },
      { value: 'hokkien', label: 'Hokkien / Fujianese' },
      { value: 'japanese', label: 'Japanese' },
      { value: 'korean', label: 'Korean' },
      { value: 'taiwanese', label: 'Taiwanese' },
    ],
  },
  {
    group: 'Southeast Asia',
    options: [
      { value: 'vietnamese', label: 'Vietnamese' },
      { value: 'filipino', label: 'Filipino (Tagalog / Visayan)' },
      { value: 'thai', label: 'Thai' },
      { value: 'malay', label: 'Malay / Malaysian' },
      { value: 'indonesian', label: 'Indonesian / Javanese' },
    ],
  },
  {
    group: 'Middle East & North Africa',
    options: [
      { value: 'arab', label: 'Arab (general)' },
      { value: 'moroccan', label: 'Moroccan' },
      { value: 'egyptian', label: 'Egyptian' },
      { value: 'lebanese', label: 'Lebanese / Syrian' },
      { value: 'iranian', label: 'Iranian / Persian' },
      { value: 'turkish', label: 'Turkish / Kurdish' },
    ],
  },
  {
    group: 'Latin America',
    options: [
      { value: 'mexican', label: 'Mexican' },
      { value: 'colombian', label: 'Colombian' },
      { value: 'puerto_rican', label: 'Puerto Rican' },
      { value: 'cuban', label: 'Cuban' },
      { value: 'dominican', label: 'Dominican' },
      { value: 'peruvian', label: 'Peruvian' },
      { value: 'brazilian', label: 'Brazilian' },
      { value: 'hispanic', label: 'Other Latin American / Hispanic' },
    ],
  },
  {
    group: 'White British & European',
    options: [
      { value: 'english', label: 'English' },
      { value: 'scottish', label: 'Scottish' },
      { value: 'welsh', label: 'Welsh' },
      { value: 'white_irish', label: 'Irish' },
      { value: 'polish', label: 'Polish' },
      { value: 'eastern_european', label: 'Other Eastern European' },
      { value: 'mediterranean', label: 'Mediterranean (Italian / Greek / Spanish)' },
      { value: 'white_european', label: 'Other White European' },
    ],
  },
  {
    group: 'Other',
    options: [
      { value: 'mixed', label: 'Mixed heritage (select all that apply above)' },
      { value: 'prefer_not_to_say', label: 'Prefer not to say' },
    ],
  },
]
