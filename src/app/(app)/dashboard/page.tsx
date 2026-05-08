import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/sign-in')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, subscription_tier')
    .eq('id', user.id)
    .single()

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there'
  const isPremium = profile?.subscription_tier === 'premium'

  return (
    <div className="space-y-6 py-4">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-brand-900">
          Good morning, {firstName} 👋
        </h1>
        <p className="text-gray-500 mt-1 text-sm">
          How are you feeling today?
        </p>
      </div>

      {/* Daily check-in prompt */}
      <a
        href="/symptom-checkin"
        className="block bg-brand-900 text-white rounded-2xl p-5 hover:bg-brand-800 transition-colors"
      >
        <p className="font-semibold text-lg">Log today&apos;s symptoms</p>
        <p className="text-brand-200 text-sm mt-1">
          Track how you&apos;re doing and see your progress over time
        </p>
      </a>

      {/* Plan preview */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Your wellness plan</h2>
          <a href="/my-plan" className="text-brand-700 text-sm font-medium">
            View all →
          </a>
        </div>
        <p className="text-gray-500 text-sm">
          {isPremium
            ? 'Your personalised plan is ready.'
            : 'Complete your intake to see your personalised plan.'}
        </p>
      </div>

      {/* Journal shortcut */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Journal</h2>
          <a href="/journal" className="text-brand-700 text-sm font-medium">
            Open →
          </a>
        </div>
        <p className="text-gray-500 text-sm">
          Track what you&apos;re trying and how it&apos;s working for you.
        </p>
      </div>

      {/* Upgrade prompt for free users */}
      {!isPremium && (
        <div className="bg-blush-50 border border-blush-200 rounded-2xl p-5">
          <p className="font-semibold text-blush-800">Unlock your full plan</p>
          <p className="text-blush-700 text-sm mt-1 mb-3">
            Get access to all recommendations, content, and your complete journal history.
          </p>
          <a
            href="/pay"
            className="inline-block bg-blush-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-blush-700 transition-colors"
          >
            Upgrade — £7.99/month
          </a>
        </div>
      )}
    </div>
  )
}
