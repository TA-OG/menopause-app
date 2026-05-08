/**
 * Centralised wellness disclaimer copy.
 * All user-facing disclaimer text lives here — never inline.
 * Referenced by OnboardingDisclaimer, WellnessPlan, ContentModule, and video intro.
 */

export const DISCLAIMER = {
  // Full disclaimer — shown at onboarding step 0 and in footer
  full: `This app provides general wellness information and lifestyle guidance only. 
It is not medical advice and is not a replacement for professional medical care. 
The content is here to empower you to understand your body and have more informed 
conversations with your doctor. Always consult your GP or a qualified healthcare 
professional for medical concerns, diagnosis, or treatment decisions.`,

  // Short form — shown on every wellness plan recommendation card
  short: `General wellness guidance only — not medical advice. Consult your GP for medical concerns.`,

  // Supplement-specific — appended to every supplement suggestion
  supplement: `Always check with your GP before starting any new supplement, 
especially if you take prescription medications or have any underlying health conditions.`,

  // Video intro — Pamela's standard opening
  videoIntro: `We're here to give you the real information about what's happening in your body 
during menopause and perimenopause. As always, this is not medical advice and it's not a 
replacement for your doctor — it's here to empower you to understand your own body, 
ask better questions, and get real results from the changes you're making.`,

  // GP signpost — shown at bottom of every wellness plan
  gpSignpost: `These are general wellness suggestions. For medical treatment options — including 
HRT, prescription medications, or specialist referrals — please speak with your GP.`,
} as const

export type DisclaimerKey = keyof typeof DISCLAIMER
