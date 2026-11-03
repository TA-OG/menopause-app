import { redirect } from 'next/navigation'
import { JOURNEY_LAUNCHED, journeyLaunchBlockers, JOURNEY_LAUNCH_CHECKLIST } from '@/lib/journey'

/**
 * Once "Your path back to you" launches, a new woman starts there instead of
 * the original wizard (src/lib/journey.ts). Until then this does nothing,
 * and admins reach the journey at /path/welcome.
 */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  if (JOURNEY_LAUNCHED && journeyLaunchBlockers().length === 0 && JOURNEY_LAUNCH_CHECKLIST.length === 0) {
    redirect('/path/welcome')
  }
  return children
}
