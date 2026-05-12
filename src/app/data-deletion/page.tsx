import Link from 'next/link'

export const metadata = {
  title: 'Delete My Data — Aunty Mel',
  description: 'Request deletion of your Aunty Mel account and all associated personal data.',
}

export default function DataDeletionPage() {
  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="mb-10">
          <Link href="/" className="text-brand-600 text-sm font-medium hover:underline">
            ← Back to Aunty Mel
          </Link>
          <h1 className="text-3xl font-bold text-brand-900 mt-4 mb-2">Delete My Data</h1>
          <p className="text-gray-500 text-sm">
            You have the right to have your data deleted. We make this as straightforward
            as possible.
          </p>
        </div>

        {/* What gets deleted */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 mb-6">
          <h2 className="font-bold text-brand-900 mb-3">What we&apos;ll delete</h2>
          <ul className="space-y-2 text-sm text-gray-700">
            {[
              'Your account and login credentials',
              'Your name and email address',
              'All health and wellness data (symptoms, check-ins, journal entries)',
              'Your onboarding answers and wellness plan',
              'Your preferences and settings',
              'Any communications you have sent us (except where legally required to retain)',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-brand-500 font-bold flex-shrink-0 mt-0.5">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* What we keep */}
        <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 mb-6">
          <h2 className="font-bold text-gray-900 mb-3">What we are legally required to keep</h2>
          <ul className="space-y-2 text-sm text-gray-600">
            {[
              'Financial records (invoices, payment history) — kept for 7 years as required by UK tax law',
              'Records of any legal disputes or complaints — kept for the duration required by law',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-gray-400 flex-shrink-0 mt-0.5">→</span>
                {item}
              </li>
            ))}
          </ul>
          <p className="text-xs text-gray-500 mt-3">
            These records are kept in minimal form and are not used for any marketing or
            profiling purposes.
          </p>
        </div>

        {/* How to request */}
        <div className="bg-brand-50 rounded-2xl p-6 border border-brand-100 mb-6">
          <h2 className="font-bold text-brand-900 mb-3">How to request deletion</h2>

          <div className="space-y-4">
            <div>
              <p className="font-semibold text-sm text-gray-900 mb-1">
                Option 1 — Email us (fastest)
              </p>
              <p className="text-sm text-gray-700 mb-2">
                Send an email from the address associated with your account:
              </p>
              <a
                href="mailto:privacy@auntymel.app?subject=Data deletion request&body=Please delete my account and all associated data. My email address is: [your email address]"
                className="inline-flex items-center gap-2 bg-brand-900 text-white font-semibold text-sm px-5 py-3 rounded-xl hover:bg-brand-800 transition-colors"
              >
                ✉️ Email privacy@auntymel.app
              </a>
              <p className="text-xs text-gray-500 mt-2">
                Subject: <strong>Data deletion request</strong> · Include the email address on your account
              </p>
            </div>

            <div className="border-t border-brand-100 pt-4">
              <p className="font-semibold text-sm text-gray-900 mb-1">
                Option 2 — From your account
              </p>
              <p className="text-sm text-gray-700">
                Sign in to Aunty Mel, go to{' '}
                <strong>Profile → Account Settings → Delete Account</strong>.
                This will immediately deactivate your account and schedule full data
                deletion within 30 days.
              </p>
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 mb-6">
          <h2 className="font-bold text-brand-900 mb-3">What happens next</h2>
          <ol className="space-y-3">
            {[
              ['Within 48 hours', 'We confirm receipt of your request by email'],
              ['Within 30 days', 'Your account is deactivated and all personal data is deleted from our systems and those of our processors'],
              ['After deletion', 'We send a confirmation email to confirm everything has been removed'],
            ].map(([time, action]) => (
              <li key={time} className="flex gap-3 text-sm">
                <span className="bg-brand-100 text-brand-900 font-semibold px-2 py-0.5 rounded-lg text-xs flex-shrink-0 h-fit mt-0.5">
                  {time}
                </span>
                <span className="text-gray-700">{action}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Rights reminder */}
        <div className="text-sm text-gray-500 leading-relaxed mb-8">
          <p>
            Data deletion is your right under UK GDPR. You can also exercise your rights
            to <strong>access</strong>, <strong>rectify</strong>, or <strong>port</strong> your
            data by emailing{' '}
            <a href="mailto:privacy@auntymel.app" className="text-brand-600 underline">
              privacy@auntymel.app
            </a>
            . If you are unhappy with our response, you can complain to the{' '}
            <a
              href="https://ico.org.uk/make-a-complaint"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 underline"
            >
              Information Commissioner&apos;s Office (ICO)
            </a>
            .
          </p>
        </div>

        {/* Footer links */}
        <div className="border-t border-gray-200 pt-6 flex flex-wrap gap-4 text-sm">
          <Link href="/privacy" className="text-brand-600 hover:underline">Privacy Policy</Link>
          <Link href="/support" className="text-brand-600 hover:underline">Support</Link>
          <Link href="/" className="text-gray-400 hover:underline">Back to Aunty Mel</Link>
        </div>

      </div>
    </main>
  )
}
