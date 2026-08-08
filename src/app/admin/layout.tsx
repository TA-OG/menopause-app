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
      <nav className="bg-brand-900 border-t border-brand-800 px-6">
        <div className="max-w-6xl mx-auto flex gap-1 overflow-x-auto">
          {[
            { href: '/admin',            label: 'Overview' },
            { href: '/admin/dashboard',  label: 'Performance' },
            { href: '/admin/monitoring', label: 'Monitoring' },
            { href: '/admin/intake',     label: 'Content intake' },
          ].map((tab) => (
            <a
              key={tab.href}
              href={tab.href}
              className="text-sm text-brand-200 hover:text-white px-3 py-2.5 border-b-2 border-transparent hover:border-brand-400 transition-colors whitespace-nowrap"
            >
              {tab.label}
            </a>
          ))}
        </div>
      </nav>
      <main className="max-w-6xl mx-auto px-6 py-8">
        {children}
      </main>
    </div>
  )
}
