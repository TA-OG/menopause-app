import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserAccess } from '@/lib/access'
import { journeyVisibleTo } from '@/lib/journey'

/**
 * "Your path back to you" (src/lib/journey.ts).
 *
 * Outside the (app) group on purpose: a new woman walks the path before her
 * intake is complete, which the (app) layout would redirect to /onboarding.
 *
 * Until the journey launches (journeyVisibleTo), only admins see it, so
 * Pamela can review every screen in the real app. Anyone else is sent to
 * the dashboard as though it did not exist.
 */
export default async function PathLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in')

  const { isAdmin } = await getUserAccess(supabase, user.id)
  if (!journeyVisibleTo({ isAdmin })) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-lg px-6 py-8">{children}</div>
    </div>
  )
}
