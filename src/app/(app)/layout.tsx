import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGeoAccess } from '@/lib/geo'
import NavBar from '@/components/layout/NavBar'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/auth/sign-in')

  // Check onboarding complete
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_complete')
    .eq('id', user.id)
    .single()

  // Profile null = new user (handle_new_user trigger may not have fired yet)
  // onboarding_complete = false = incomplete onboarding
  // Either way redirect to /onboarding which is OUTSIDE this layout group — no loop
  if (!profile || !profile.onboarding_complete) {
    redirect('/onboarding')
  }

  // Jurisdiction gate — admin-controlled per country (migration 018).
  // 'disabled' countries see a notice instead of the app. 'info_only' and
  // 'full' fall through; the personalised-plan surfaces enforce info_only
  // themselves (my-plan page + wellness-plan API).
  const geo = await getGeoAccess(createAdminClient(), user.id)
  if (!geo.allowed) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center px-6">
        <div className="max-w-md text-center space-y-4">
          <div className="text-5xl">🌍</div>
          <h1 className="text-2xl font-bold text-brand-900">
            Aunty Mel isn&apos;t available in your region yet
          </h1>
          <p className="text-brand-700 text-sm">
            We&apos;re working to bring Aunty Mel to your country in a way that meets
            local health regulations. We&apos;ll let you know the moment it&apos;s ready.
          </p>
          <p className="text-xs text-gray-400">
            If you believe this is a mistake, contact{' '}
            <a href="mailto:hello@auntymel.app" className="text-brand-600 underline">
              hello@auntymel.app
            </a>
            .
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cream pb-20 pt-16">
      <main className="max-w-lg mx-auto px-4 pt-4">
        {children}
      </main>
      <NavBar />
    </div>
  )
}
