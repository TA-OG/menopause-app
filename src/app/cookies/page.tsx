import Link from 'next/link'

export const metadata = {
  title: 'Cookie Policy — Aunty Mel',
  description: 'How Aunty Mel uses cookies and similar technologies.',
}

export default function CookiesPage() {
  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-6 py-12">

        <div className="mb-10">
          <Link href="/" className="text-brand-600 text-sm font-medium hover:underline">
            ← Back to Aunty Mel
          </Link>
          <h1 className="text-3xl font-bold text-brand-900 mt-4 mb-2">Cookie Policy</h1>
          <p className="text-gray-500 text-sm">
            Last updated: 12 May 2026
          </p>
        </div>

        {/* Summary */}
        <div className="bg-white rounded-2xl p-6 border border-brand-100 mb-8">
          <p className="font-semibold text-brand-900 mb-2">The short version</p>
          <p className="text-sm text-gray-700 leading-relaxed">
            We use only essential cookies required to keep you logged in. We do not use
            advertising cookies, tracking pixels, or sell data to ad networks.
          </p>
        </div>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-brand-900 mb-3">What are cookies?</h2>
          <p className="text-sm text-gray-700 leading-relaxed">
            Cookies are small text files stored on your device by your browser when you
            visit a website. They help sites remember information about your visit — such
            as whether you are logged in — so you don&apos;t have to re-enter it every time.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-brand-900 mb-3">Cookies we use</h2>
          <div className="space-y-4">

            {/* Essential cookies */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="bg-green-50 px-5 py-3 border-b border-gray-100">
                <p className="font-semibold text-green-800 text-sm">Essential cookies — always active</p>
                <p className="text-xs text-green-700 mt-0.5">
                  These are required for the app to function. They cannot be disabled.
                </p>
              </div>
              <div className="divide-y divide-gray-50">
                {[
                  {
                    name: 'sb-[project]-auth-token',
                    purpose: 'Keeps you logged in to Aunty Mel. Set by Supabase Auth.',
                    duration: 'Session / up to 1 week',
                    type: 'First-party',
                  },
                  {
                    name: '__stripe_mid / __stripe_sid',
                    purpose: 'Fraud prevention during payment processing. Set by Stripe.',
                    duration: '1 year / session',
                    type: 'Third-party (Stripe)',
                  },
                ].map((cookie) => (
                  <div key={cookie.name} className="px-5 py-4">
                    <p className="font-mono text-xs text-brand-700 font-semibold mb-1">{cookie.name}</p>
                    <p className="text-xs text-gray-600 mb-1">{cookie.purpose}</p>
                    <p className="text-xs text-gray-400">Duration: {cookie.duration} · {cookie.type}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Analytics — not used */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="bg-gray-50 px-5 py-3 border-b border-gray-100">
                <p className="font-semibold text-gray-700 text-sm">Analytics & advertising cookies — not used</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  We do not use Google Analytics, Facebook Pixel, or any advertising cookies.
                </p>
              </div>
            </div>

          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-brand-900 mb-3">Local storage</h2>
          <p className="text-sm text-gray-700 leading-relaxed">
            In addition to cookies, we use your browser&apos;s local storage to save
            app preferences (such as your last viewed page) and to enable offline
            functionality as a Progressive Web App (PWA). This data stays on your
            device and is not transmitted to our servers.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-brand-900 mb-3">How to control cookies</h2>
          <p className="text-sm text-gray-700 leading-relaxed mb-3">
            You can control cookies through your browser settings. Note that disabling
            the essential session cookie will prevent you from staying logged in.
          </p>
          <div className="space-y-2">
            {[
              { browser: 'Chrome', url: 'https://support.google.com/chrome/answer/95647' },
              { browser: 'Safari (iOS)', url: 'https://support.apple.com/en-gb/guide/iphone/iphb01fc3c85/ios' },
              { browser: 'Firefox', url: 'https://support.mozilla.org/en-US/kb/cookies-information-websites-store-on-your-computer' },
              { browser: 'Edge', url: 'https://support.microsoft.com/en-us/windows/microsoft-edge-browsing-data-and-privacy' },
            ].map(({ browser, url }) => (
              <a
                key={browser}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-brand-600 hover:underline"
              >
                → Manage cookies in {browser}
              </a>
            ))}
          </div>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-brand-900 mb-3">Changes to this policy</h2>
          <p className="text-sm text-gray-700 leading-relaxed">
            If we ever introduce new cookies, we will update this page and notify you
            in the app before doing so.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-brand-900 mb-3">Questions?</h2>
          <p className="text-sm text-gray-700">
            Email us at{' '}
            <a href="mailto:privacy@auntymel.app" className="text-brand-600 underline">
              privacy@auntymel.app
            </a>
            .
          </p>
        </section>

        <div className="border-t border-gray-200 pt-6 flex flex-wrap gap-4 text-sm">
          <Link href="/privacy" className="text-brand-600 hover:underline">Privacy Policy</Link>
          <Link href="/terms" className="text-brand-600 hover:underline">Terms of Service</Link>
          <Link href="/" className="text-gray-400 hover:underline">Back to Aunty Mel</Link>
        </div>

      </div>
    </main>
  )
}
