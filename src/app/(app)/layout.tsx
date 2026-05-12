import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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

  return (
    <div className="min-h-screen bg-cream pb-20 pt-16">
      <main className="max-w-lg mx-auto px-4 pt-4">
        {children}
      </main>
      <NavBar />
    </div>
  )
}
