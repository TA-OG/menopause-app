import Link from 'next/link'

export const metadata = {
  title: 'Accessibility Statement — Aunty Mel',
  description: 'Our commitment to making Aunty Mel accessible to everyone.',
}

export default function AccessibilityPage() {
  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-6 py-12">

        <div className="mb-10">
          <Link href="/" className="text-brand-600 text-sm font-medium hover:underline">
            ← Back to Aunty Mel
          </Link>
          <h1 className="text-3xl font-bold text-brand-900 mt-4 mb-2">Accessibility Statement</h1>
          <p className="text-gray-500 text-sm">
            Last updated: 12 May 2026
          </p>
        </div>

        <section className="mb-8">
          <p className="text-sm text-gray-700 leading-relaxed">
            Aunty Mel is committed to making our app accessible to everyone, including
            people with disabilities. We believe that women navigating menopause deserve
            support regardless of how they access the web, and we work to meet the
            <strong> Web Content Accessibility Guidelines (WCAG) 2.1 Level AA</strong> standard.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-brand-900 mb-3">What we&apos;re doing</h2>
          <ul className="space-y-2 text-sm text-gray-700">
            {[
              'Using semantic HTML to support screen readers and assistive technologies',
              'Providing sufficient colour contrast across text and UI elements',
              'Making all interactive elements keyboard-navigable',
              'Using descriptive labels on form inputs and buttons',
              'Providing alt text for images and icons',
              'Avoiding content that flashes or rapidly changes (seizure risk)',
              'Supporting text resizing up to 200% without loss of functionality',
              'Testing with screen reader software on iOS (VoiceOver) and Android (TalkBack)',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-brand-500 font-bold flex-shrink-0">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-brand-900 mb-3">Known limitations</h2>
          <p className="text-sm text-gray-700 leading-relaxed mb-3">
            We are a small team and Aunty Mel is in active development. Some areas may
            not yet meet full WCAG 2.1 AA compliance, including:
          </p>
          <ul className="space-y-2 text-sm text-gray-600">
            {[
              'Some complex data visualisations (symptom charts) may not have full screen-reader equivalents — we are working on text alternatives',
              'The onboarding questionnaire may not be fully optimised for switch access devices — we are reviewing this',
            ].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="text-gray-400 flex-shrink-0">→</span>
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-brand-900 mb-3">Feedback and contact</h2>
          <p className="text-sm text-gray-700 leading-relaxed mb-4">
            If you experience an accessibility barrier on Aunty Mel — or if you need
            information in an alternative format — please contact us. We take all
            accessibility feedback seriously and will respond within 5 business days.
          </p>
          <a
            href="mailto:hello@auntymel.app?subject=Accessibility feedback"
            className="inline-flex items-center gap-2 bg-brand-900 text-white font-semibold text-sm px-5 py-3 rounded-xl hover:bg-brand-800 transition-colors"
          >
            ✉️ Email hello@auntymel.app
          </a>
        </section>

        <section className="mb-8">
          <h2 className="text-xl font-bold text-brand-900 mb-3">
            Enforcement and escalation
          </h2>
          <p className="text-sm text-gray-700 leading-relaxed">
            If you are not satisfied with our response to an accessibility complaint,
            you can contact the{' '}
            <a
              href="https://www.equalityadvisoryservice.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 underline"
            >
              Equality Advisory and Support Service (EASS)
            </a>
            , which provides free advice and support on discrimination and equality issues
            in the UK.
          </p>
        </section>

        <div className="border-t border-gray-200 pt-6 flex flex-wrap gap-4 text-sm">
          <Link href="/support" className="text-brand-600 hover:underline">Support</Link>
          <Link href="/privacy" className="text-brand-600 hover:underline">Privacy Policy</Link>
          <Link href="/" className="text-gray-400 hover:underline">Back to Aunty Mel</Link>
        </div>

      </div>
    </main>
  )
}
