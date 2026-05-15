import { createAdminClient } from '@/lib/supabase/admin'
import InviteButton from './InviteButton'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const admin = createAdminClient()

  // Fetch all waitlist signups, newest first
  const { data: signups, error } = await admin
    .from('waitlist_signups')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
        Failed to load waitlist: {error.message}
      </div>
    )
  }

  const total      = signups?.length ?? 0
  const pending    = signups?.filter((s) => !s.converted_to_user).length ?? 0
  const priority   = signups?.filter((s) => s.priority_access && !s.converted_to_user).length ?? 0
  const converted  = signups?.filter((s) => s.converted_to_user).length ?? 0

  return (
    <div className="space-y-8">

      {/* Diagnostics */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <p className="font-semibold text-brand-900 text-sm">Diagnostics</p>

        <div className="flex items-center justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-800">Environment variables</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Inventory every env var the app uses, with status (missing / invalid / ok). Values are masked.
            </p>
          </div>
          <a
            href="/api/admin/env-diagnose"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs bg-brand-900 text-white px-3 py-1.5 rounded-lg hover:bg-brand-800 transition-colors whitespace-nowrap"
          >
            Check env →
          </a>
        </div>

        <div className="flex items-center justify-between gap-4 pt-3 border-t border-gray-100">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-800">Stripe configuration</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Confirms which Stripe account your key authenticates as, and whether each price ID exists in it.
            </p>
          </div>
          <a
            href="/api/admin/stripe-diagnose"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs bg-brand-900 text-white px-3 py-1.5 rounded-lg hover:bg-brand-800 transition-colors whitespace-nowrap"
          >
            Check Stripe →
          </a>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total signups', value: total },
          { label: 'Pending',       value: pending },
          { label: 'Priority',      value: priority },
          { label: 'Converted',     value: converted },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-brand-900">{stat.value}</p>
            <p className="text-xs text-gray-500 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Waitlist table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-brand-900">Waitlist</h2>
          <p className="text-xs text-gray-400">
            Invite sends a Supabase magic-link sign-up email directly to the user.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Symptom</th>
                <th className="px-4 py-3">Refs</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Signed up</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {signups?.map((signup) => (
                <tr key={signup.id} className={signup.converted_to_user ? 'opacity-50' : 'hover:bg-gray-50'}>
                  <td className="px-4 py-3 font-medium text-brand-900">{signup.first_name}</td>
                  <td className="px-4 py-3 text-gray-600">{signup.email}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {signup.primary_symptom?.replace(/_/g, ' ') ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {signup.referral_count > 0 ? (
                      <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-0.5 rounded-full">
                        {signup.referral_count}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    {signup.priority_access ? (
                      <span className="bg-brand-100 text-brand-700 text-xs font-medium px-2 py-0.5 rounded-full">
                        Priority
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">
                    {new Date(signup.created_at).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric'
                    })}
                  </td>
                  <td className="px-4 py-3">
                    {signup.converted_to_user ? (
                      <span className="bg-gray-100 text-gray-500 text-xs px-2 py-0.5 rounded-full">
                        Invited
                      </span>
                    ) : (
                      <span className="bg-yellow-50 text-yellow-700 text-xs px-2 py-0.5 rounded-full">
                        Waiting
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!signup.converted_to_user && (
                      <InviteButton
                        waitlistId={signup.id}
                        email={signup.email}
                        firstName={signup.first_name}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {(!signups || signups.length === 0) && (
            <p className="text-center text-gray-400 text-sm py-12">
              No waitlist signups yet.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
