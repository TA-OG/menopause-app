import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

/**
 * Admin layout — hard gate.
 * Any route under /admin requires is_admin = true on the user's profile.
 * Unauthenticated users → sign-in. Authenticated non-admins → dashboard.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()

  if (!profile?.is_admin) redirect('/dashboard')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-brand-900 text-white px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-brand-300 uppercase tracking-widest mb-0.5">Aunty Mel</p>
          <h1 className="text-lg font-bold">Admin</h1>
        </div>
        <a href="/dashboard" className="text-sm text-brand-200 hover:text-white transition-colors">
          ← Back to app
        </a>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}
