/**
 * ─────────────────────────────────────────────────────────────────────────────
 * "YOUR PATH BACK TO YOU": every word Mel says in the journey, and its status
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Source: Pamela's Care Journey document and her comments on it
 * (docs/pamela-decisions-2026-10.md). Nothing here is paraphrased from
 * memory: each line is either the document's wording, her own words, or a
 * redraft from her comments that is waiting for her to approve it.
 *
 * Every line carries a status, and the journey cannot open to women while any
 * line it needs is not cleared (journeyLaunchBlockers in journey.ts):
 *
 *   approved     she approved it, or it is her own words verbatim
 *   unchallenged in the pack she reviewed line by line, and she raised
 *                nothing on it
 *   redrafted    rewritten from her comments, so the exact wording is ours,
 *                not hers. Waits for her OK
 *   pending      she has not answered. Waits for her
 *
 * To clear a line: change its status here, in the same commit as a note in
 * docs/pamela-decisions-2026-10.md saying when and how she approved it.
 */

export type CopyStatus = 'approved' | 'unchallenged' | 'redrafted' | 'pending'

export interface CopyLine {
  text: string
  status: CopyStatus
  /** Where it came from, for whoever has to check it. */
  source: string
}

const line = (text: string, status: CopyStatus, source: string): CopyLine => ({
  text,
  status,
  source,
})

// ─── Welcome ──────────────────────────────────────────────────────────────────

export const WELCOME = {
  hello: line(
    "Hello love. I'm Mel. If you've found your way here, I'm guessing things haven't felt quite like you lately. Your sleep, your moods, your body, maybe even how you see yourself. I want you to know something first: you're not broken, and you're not on your own.",
    'unchallenged',
    'Care Journey, Screen 1'
  ),
  helloButton: line('Hello, Mel', 'unchallenged', 'Care Journey, Screen 1'),
  howItWorks: line(
    "Here's how this works. First, I'll ask how you are. Properly, all of it, not just the symptoms. Then we'll choose one thing to start with. Just one. When we ease one thing, the others often soften too. And we'll go gently, one small step at a time.",
    'approved',
    'Care Journey, Screen 2. "When we ease one thing…": "I like this because that\'s what I would say"'
  ),
  howItWorksButton: line('That sounds good', 'unchallenged', 'Care Journey, Screen 2'),
  whoIsBehindMe: line(
    "I'm Aunty Mel, your guide in this app. Everything I share has been put together by Pamela, a certified women's health coach specialising in menopause, so you're in safe hands. I'm not a replacement for your GP, and I'll always tell you when something is worth checking with them.",
    'approved',
    'Care Journey, Screen 3, with Pamela\'s own description of herself (decision 1, headline only)'
  ),
  whoIsBehindMeButton: line('I understand', 'unchallenged', 'Care Journey, Screen 3'),
  askName: line('What would you like me to call you?', 'unchallenged', 'Care Journey, Screen 4'),
} as const

// ─── Between the sessions ─────────────────────────────────────────────────────
// {name} is her first name, or nothing if she gave none.

export const BETWEEN_SESSIONS = {
  afterFeeling: line(
    "Thank you for telling me that, {name}. That's a lot to be carrying, and you've been carrying it anyway. A few gentle questions about rest next.",
    'unchallenged',
    'Care Journey, after Session 1'
  ),
  afterRest: line(
    "You're doing so well, love. Next, a little about the people around you.",
    'unchallenged',
    'Care Journey, after Session 2'
  ),
  afterConnection: line('Thank you. Now a gentler one, about you.', 'unchallenged', 'Care Journey, after Session 3'),
  afterYou: line(
    "We're nearly there. These last few help me keep you safe and choose what suits your day-to-day.",
    'unchallenged',
    'Care Journey, after Session 4'
  ),
  heritageIntro: line(
    "If you'd like, tell me a little about your heritage. Food and family traditions shape so much, and I can include ones that feel like home. You can skip this.",
    'unchallenged',
    'Care Journey, Session 7'
  ),
  carryOn: line('Carry on', 'unchallenged', 'Care Journey, after Session 1'),
  comeBackLater: line("I'll come back later", 'unchallenged', 'Care Journey, after Session 1'),
} as const

// ─── Finishing the questions ──────────────────────────────────────────────────

export const FINISHING = {
  thankYou: line(
    "Thank you, {name}. You've been carrying a lot, and I want you to know I heard all of it.",
    'unchallenged',
    'Care Journey, "Finishing the questions", First'
  ),
  /** Only the ones her answers support are said (heardPhrases in journey.ts). */
  heardBrokenNights: line('The broken nights.', 'unchallenged', 'Care Journey, "Finishing the questions"'),
  heardStretchedThin: line('Feeling stretched thin.', 'unchallenged', 'Care Journey, "Finishing the questions"'),
  heardNotRecognising: line(
    'Not quite recognising yourself.',
    'unchallenged',
    'Care Journey, "Finishing the questions"'
  ),
  hardSeason: line(
    "That's not weakness, love. That's a hard season.",
    'unchallenged',
    'Care Journey, "Finishing the questions"'
  ),
  thankYouButton: line('Thank you', 'unchallenged', 'Care Journey, "Finishing the questions"'),
  suggestFocus: line(
    "Here's what I'd like us to start with: {focus}. When we ease this one thing, the others often soften too. Everything else you told me is safe with me. We'll come to it, one step at a time.",
    'approved',
    'Care Journey, "Finishing the questions", Then (the ⚑ line approved, decision 2)'
  ),
  acceptFocus: line("Let's start there", 'unchallenged', 'Care Journey, "Finishing the questions"'),
  chooseOtherFocus: line(
    "I'd rather start with something else",
    'unchallenged',
    'Care Journey, "Finishing the questions"'
  ),
  // Was "One tiny thing a day". Pamela: "a day for 7 days is too much … max 3
  // in one week". And "safer in yourself" → "In your body again".
  firstWeek: line(
    "Lovely. Your first week is all about feeling a bit safer in your body again. Three small invitations this week, two minutes at most, whenever you're ready. I'll be here every morning.",
    'redrafted',
    'Care Journey, "Finally", changed for decision 4 and Pamela\'s comment "In your body again"'
  ),
  seeFirstSteps: line('See your first steps', 'unchallenged', 'Care Journey, "Finally"'),
} as const

// ─── The path ─────────────────────────────────────────────────────────────────

export const PATH = {
  title: line('Your path back to you', 'approved', 'Pamela: "How about your path back to you instead of care journey"'),
  stageFeelSafe: line('Feel safe', 'unchallenged', 'Care Journey, "Your care plan"'),
  stageFoundations: line('Foundations', 'unchallenged', 'Care Journey, "Your care plan"'),
  stageSupport: line('Support', 'unchallenged', 'Care Journey, "Your care plan"'),
  waiting: line("Waiting for you when you're ready", 'unchallenged', 'Care Journey, "Your care plan"'),
  didThis: line('I did this', 'unchallenged', 'Care Journey, Stage 1'),
  notToday: line("Not today, that's OK", 'unchallenged', 'Care Journey, Stage 1'),
  seeYouTomorrow: line("I'll see you tomorrow morning, love.", 'unchallenged', 'Care Journey, first care plan screen'),
  freeWeekEnd: line(
    "You've given yourself a whole week of care, {name}. To keep going with your foundations, join me in Aunty Mel Premium.",
    'unchallenged',
    'Care Journey, "Free week"'
  ),
  supportOpener: line(
    "These sit on top of what you're already doing, never instead of it. Some women report benefits; evidence varies and they're not right for everyone. Please check with your GP or pharmacist before taking anything.",
    'pending',
    'Care Journey, Stage 3 (decision 8: Pamela, then solicitor review)'
  ),
} as const

/**
 * The Feel Safe week: three invitations, not one a day (decision 4). Every
 * line is from Pamela's own edits, but the arrangement is ours, so all of it
 * waits for her approval.
 */
export const FEEL_SAFE_INVITATIONS = [
  {
    id: 'feel_safe_1',
    /** Day of the Feel Safe week (1–7) it opens on. */
    opensOnDay: 1,
    says: line(
      "What you're feeling has a reason. You're not imagining it, and you're not broken.",
      'redrafted',
      'Day 1, with Pamela\'s "Not broken"'
    ),
    invitation: line(
      'If you\'d like to: put your hands on your heart. Close your eyes and breathe. If it feels right, say: "My body is calm and my mind is calm too."',
      'redrafted',
      'Pamela: "My body is calm and my mind is calm too. Put your hands on your heart. Not chest." and "Could these be a suggestion rather than a command?"'
    ),
  },
  {
    id: 'feel_safe_2',
    opensOnDay: 3,
    says: line(
      "Your body has changed, and it's asking for something new or different. Of course it feels unsettling.",
      'approved',
      'Pamela\'s own wording for Day 2'
    ),
    invitation: line(
      "If you'd like to: write down one thing your body still does well.",
      'redrafted',
      'Day 2 practice, as a suggestion rather than a command'
    ),
  },
  {
    id: 'feel_safe_3',
    opensOnDay: 5,
    says: line(
      "You don't have to explain yourself to everyone. But one person can help.",
      'unchallenged',
      'Day 4'
    ),
    invitation: line(
      "If you'd like to: think of one person you can talk to.",
      'redrafted',
      'Pamela: "Tell? Tell what. One person you can talk to."'
    ),
  },
] as const

export type FeelSafeInvitationId = (typeof FEEL_SAFE_INVITATIONS)[number]['id']

// ─── Every morning ────────────────────────────────────────────────────────────

export const MORNING = {
  // "love" removed: Pamela, on the drafted greeting: "I don't like this."
  question: line('How are you feeling today?', 'approved', 'Care Journey, "Every morning", Pamela\'s edit'),
  good: line('Good', 'unchallenged', 'Care Journey, "Every morning"'),
  upAndDown: line('Up and down', 'unchallenged', 'Care Journey, "Every morning"'),
  hard: line('Hard', 'unchallenged', 'Care Journey, "Every morning"'),
  replyGood: line("Lovely to hear. Keep doing what you're doing.", 'unchallenged', 'Care Journey, "Every morning"'),
  replyUpAndDown: line(
    "That's completely normal, love. Today, just your one small thing.",
    'unchallenged',
    'Care Journey, "Every morning"'
  ),
  replyHard: line(
    "I'm sorry today's hard. Be gentle with yourself. Even resting counts.",
    'unchallenged',
    'Care Journey, "Every morning"'
  ),
  smallStep: line('Did you manage your small step?', 'unchallenged', 'Care Journey, "Every morning"'),
  yes: line('Yes', 'unchallenged', 'Care Journey, "Every morning"'),
} as const

/**
 * The low-mood safety line (decision 5, unanswered). The number is checked:
 * Samaritans, 116 123, free from the UK and Ireland, 24 hours a day
 * (samaritans.org "Contact us"; nidirect.gov.uk), confirmed 30 Oct 2026.
 */
export const SAFETY_SIGNPOST = line(
  'If things feel too much, please talk to your GP. If you ever feel unsafe, Samaritans are there day and night on 116 123.',
  'pending',
  'Care Journey, "Every morning", Safety ⚑ (decision 5)'
)

/** Every line the journey shows, for the launch check and the tests. */
export function allJourneyCopy(): CopyLine[] {
  return [
    ...Object.values(WELCOME),
    ...Object.values(BETWEEN_SESSIONS),
    ...Object.values(FINISHING),
    ...Object.values(PATH),
    ...FEEL_SAFE_INVITATIONS.flatMap((i) => [i.says, i.invitation]),
    ...Object.values(MORNING),
    SAFETY_SIGNPOST,
  ]
}

/** Fill {name} / {focus}. A missing name drops cleanly ("Thank you, ." never shows). */
export function fill(text: string, vars: { name?: string | null; focus?: string }): string {
  const name = vars.name?.trim()
  let out = name ? text.replace(/\{name\}/g, name) : text.replace(/,? ?\{name\}/g, '')
  if (vars.focus !== undefined) out = out.replace(/\{focus\}/g, vars.focus)
  return out
}
