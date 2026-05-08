import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function ProfilePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, subscription_tier, subscription_status, created_at')
    .eq('id', user.id)
    .single()

  const isPremium = profile?.subscription_tier === 'premium'

  async function signOut() {
    'use server'
    const supabase = createClient()
    await supabase.auth.signOut()
    redirect('/auth/sign-in')
  }

  return (
    <div className="space-y-6 py-4">
      <h1 className="text-2xl font-bold text-brand-900">Profile</h1>

      {/* Account info */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 space-y-3">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Name</p>
          <p className="font-medium text-gray-900 mt-0.5">{profile?.full_name ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Email</p>
          <p className="font-medium text-gray-900 mt-0.5">{user.email}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Plan</p>
          <p className="font-medium mt-0.5">
            {isPremium ? (
              <span className="text-brand-700">Premium ✨</span>
            ) : (
              <span className="text-gray-600">Free</span>
            )}
          </p>
        </div>
      </div>

      {/* Subscription management */}
      {isPremium ? (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <p className="font-semibold text-gray-900 mb-3">Subscription</p>
          <form action="/api/stripe/portal" method="POST">
            <button
              type="submit"
              className="w-full border border-gray-200 text-gray-700 font-medium py-2 rounded-xl text-sm hover:bg-gray-50 transition-colors"
            >
              Manage billing →
            </button>
          </form>
        </div>
      ) : (
        <div className="bg-brand-50 border border-brand-200 rounded-2xl p-5">
          <p className="font-semibold text-brand-900">Upgrade to Premium</p>
          <p className="text-brand-700 text-sm mt-1 mb-3">
            Unlock your full wellness plan, complete content library, and full journal history.
          </p>
          <a
            href="/pay"
            className="inline-block bg-brand-900 text-white text-sm font-semibold px-4 py-2 rounded-xl"
          >
            Upgrade — £7.99/month
          </a>
        </div>
      )}

      {/* Update plan */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <p className="font-semibold text-gray-900 mb-1">Update your wellness plan</p>
        <p className="text-sm text-gray-500 mb-3">
          Redo your intake if your symptoms or lifestyle have changed.
        </p>
        <a
          href="/onboarding"
          className="block text-center border border-brand-200 text-brand-700 font-medium py-2 rounded-xl text-sm hover:bg-brand-50 transition-colors"
        >
          Redo intake
        </a>
      </div>

      {/* Sign out */}
      <form action={signOut}>
        <button
          type="submit"
          className="w-full text-gray-400 text-sm py-2 hover:text-gray-600 transition-colors"
        >
          Sign out
        </button>
      </form>
    </div>
  )
}
