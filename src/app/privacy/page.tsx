import Link from 'next/link'

export const metadata = {
  title: 'Privacy Policy — Aunty Mel',
  description: 'How Aunty Mel collects, uses, and protects your personal data.',
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-bold text-brand-900 mb-3">{title}</h2>
      <div className="space-y-3 text-gray-700 leading-relaxed text-sm">{children}</div>
    </section>
  )
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h3 className="font-semibold text-gray-900 mb-1.5">{title}</h3>
      <div className="space-y-2 text-gray-700 leading-relaxed text-sm">{children}</div>
    </div>
  )
}

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="mb-10">
          <Link href="/" className="text-brand-600 text-sm font-medium hover:underline">
            ← Back to Aunty Mel
          </Link>
          <h1 className="text-3xl font-bold text-brand-900 mt-4 mb-2">Privacy Policy</h1>
          <p className="text-gray-500 text-sm">
            Last updated: 12 May 2026 &nbsp;·&nbsp; Effective: 12 May 2026
          </p>
        </div>

        {/* Plain-English summary */}
        <div className="bg-white rounded-2xl p-6 border border-brand-100 mb-10">
          <p className="font-semibold text-brand-900 mb-2">The short version</p>
          <ul className="space-y-1.5 text-sm text-gray-700">
            <li>✅ We collect only what we need to give you a personalised wellness plan.</li>
            <li>✅ We never sell your data. Ever.</li>
            <li>✅ Your health information is treated as sensitive and stored securely.</li>
            <li>✅ You can request, correct, or delete your data at any time.</li>
            <li>✅ We use a small number of trusted third-party services — listed below.</li>
          </ul>
        </div>

        {/* 1 — Who we are */}
        <Section title="1. Who we are">
          <p>
            Aunty Mel is a digital wellness platform designed to support women through
            perimenopause and menopause. It is operated by <strong>Aunty Mel Ltd</strong>
            {' '}(a company registered in England and Wales).
          </p>
          <p>
            <strong>Data controller:</strong> Aunty Mel Ltd<br />
            <strong>Contact:</strong>{' '}
            <a href="mailto:privacy@auntymel.app" className="text-brand-600 underline">
              privacy@auntymel.app
            </a>
          </p>
          <p>
            References to &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo; in this
            policy mean Aunty Mel Ltd.
          </p>
        </Section>

        {/* 2 — What data we collect */}
        <Section title="2. What data we collect">

          <SubSection title="Account information">
            <p>When you register, we collect your name and email address. If you sign in
            with Google, we receive your name, email address, and profile picture from Google.</p>
          </SubSection>

          <SubSection title="Health and wellness data">
            <p>
              To personalise your wellness plan, we collect information you voluntarily provide,
              including:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Menopause stage (e.g. perimenopause, postmenopause)</li>
              <li>Symptoms you experience (e.g. hot flushes, sleep problems, mood changes)</li>
              <li>Lifestyle information (diet, exercise level, sleep quality, stress level)</li>
              <li>Cultural and heritage background (used to make recommendations culturally relevant)</li>
              <li>Daily symptom check-ins and journal entries</li>
            </ul>
            <p className="mt-2 text-xs text-gray-500 bg-gray-50 rounded-xl p-3">
              <strong>Important:</strong> Health information is a &ldquo;special category&rdquo; of personal data
              under UK GDPR. We process it only with your explicit consent, given during sign-up.
              You can withdraw this consent at any time by deleting your account.
            </p>
          </SubSection>

          <SubSection title="Payment information">
            <p>
              Payments are handled by Stripe. We never see or store your full card number.
              We receive a payment reference and subscription status from Stripe so we know
              whether your subscription is active.
            </p>
          </SubSection>

          <SubSection title="Usage data">
            <p>
              We collect basic usage information — pages visited, features used, and error logs —
              to improve the app. This data is anonymised where possible.
            </p>
          </SubSection>

          <SubSection title="Communications">
            <p>
              If you contact us by email or through the app, we keep a record of that
              correspondence to help us respond and improve our support.
            </p>
          </SubSection>
        </Section>

        {/* 3 — Why we collect it */}
        <Section title="3. Why we collect your data (lawful basis)">
          <p>We process your data for the following purposes and on the following legal bases:</p>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-brand-50">
                  <th className="text-left p-2 font-semibold text-brand-900 border border-brand-100">Purpose</th>
                  <th className="text-left p-2 font-semibold text-brand-900 border border-brand-100">Lawful basis</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Creating and managing your account', 'Contract'],
                  ['Personalising your wellness plan', 'Explicit consent (health data)'],
                  ['Processing your subscription payment', 'Contract'],
                  ['Sending transactional emails (magic links, receipts)', 'Contract'],
                  ['Sending wellness tips and updates (if opted in)', 'Consent'],
                  ['Improving the app and fixing bugs', 'Legitimate interests'],
                  ['Complying with legal obligations', 'Legal obligation'],
                ].map(([purpose, basis]) => (
                  <tr key={purpose} className="border-b border-gray-100">
                    <td className="p-2 border border-gray-100 text-gray-700">{purpose}</td>
                    <td className="p-2 border border-gray-100 text-gray-600">{basis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* 4 — Who we share data with */}
        <Section title="4. Who we share your data with">
          <p>
            We do not sell, rent, or trade your personal data. We share data only with the
            following trusted service providers who help us run the platform:
          </p>
          <div className="space-y-3 mt-3">
            {[
              {
                name: 'Supabase',
                role: 'Database and authentication',
                location: 'EU (Ireland)',
                link: 'https://supabase.com/privacy',
              },
              {
                name: 'Stripe',
                role: 'Payment processing',
                location: 'USA (Standard Contractual Clauses)',
                link: 'https://stripe.com/gb/privacy',
              },
              {
                name: 'Resend',
                role: 'Transactional emails (magic links, receipts)',
                location: 'USA (Standard Contractual Clauses)',
                link: 'https://resend.com/legal/privacy-policy',
              },
              {
                name: 'Brevo',
                role: 'Email marketing (if you opted in)',
                location: 'EU (France)',
                link: 'https://www.brevo.com/legal/privacypolicy/',
              },
              {
                name: 'Vercel',
                role: 'App hosting and edge infrastructure',
                location: 'USA (Standard Contractual Clauses)',
                link: 'https://vercel.com/legal/privacy-policy',
              },
            ].map((provider) => (
              <div key={provider.name} className="bg-gray-50 rounded-xl p-3 text-xs">
                <p className="font-semibold text-gray-900">{provider.name}</p>
                <p className="text-gray-600">{provider.role} · {provider.location}</p>
                <a
                  href={provider.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 underline"
                >
                  Privacy policy →
                </a>
              </div>
            ))}
          </div>
          <p className="mt-4">
            We may also disclose your data if required by law, or to protect the safety
            and rights of our users or the public.
          </p>
        </Section>

        {/* 5 — Data retention */}
        <Section title="5. How long we keep your data">
          <p>
            We keep your account and wellness data for as long as your account is active.
            If you delete your account, we will delete or anonymise your personal data
            within <strong>30 days</strong>, except where we are required to retain it
            for legal reasons (e.g. financial records, which we keep for 7 years in line
            with UK tax law).
          </p>
          <p>
            Anonymised, aggregated usage data (which cannot identify you) may be kept
            indefinitely to help us improve the service.
          </p>
        </Section>

        {/* 6 — Your rights */}
        <Section title="6. Your rights">
          <p>
            Under UK GDPR, you have the following rights regarding your personal data:
          </p>
          <ul className="space-y-2 mt-2">
            {[
              ['Right of access', 'Request a copy of the personal data we hold about you.'],
              ['Right to rectification', 'Ask us to correct inaccurate or incomplete data.'],
              ['Right to erasure', 'Ask us to delete your data ("right to be forgotten").'],
              ['Right to restriction', 'Ask us to limit how we use your data in certain circumstances.'],
              ['Right to data portability', 'Receive your data in a structured, machine-readable format.'],
              ['Right to object', 'Object to processing based on legitimate interests or for direct marketing.'],
              ['Right to withdraw consent', 'Where processing is based on consent, withdraw it at any time without affecting prior processing.'],
            ].map(([right, description]) => (
              <li key={right} className="flex gap-2">
                <span className="text-brand-500 font-bold flex-shrink-0">→</span>
                <span><strong>{right}:</strong> {description}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4">
            To exercise any of these rights, email us at{' '}
            <a href="mailto:privacy@auntymel.app" className="text-brand-600 underline">
              privacy@auntymel.app
            </a>
            . We will respond within <strong>30 days</strong>. There is no charge for
            most requests.
          </p>
          <p>
            If you are unhappy with how we handle your request, you have the right to
            lodge a complaint with the{' '}
            <a
              href="https://ico.org.uk"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 underline"
            >
              Information Commissioner&apos;s Office (ICO)
            </a>
            , the UK&apos;s data protection authority.
          </p>
        </Section>

        {/* 7 — Security */}
        <Section title="7. How we protect your data">
          <p>
            We take security seriously. Measures we use include:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>All data is encrypted in transit (TLS) and at rest</li>
            <li>Authentication is handled by Supabase Auth — we never store passwords</li>
            <li>Database access is protected by row-level security policies</li>
            <li>We conduct regular reviews of third-party service security</li>
            <li>We limit employee access to personal data on a need-to-know basis</li>
          </ul>
          <p>
            No system is 100% secure. If we become aware of a data breach that affects
            your rights, we will notify you and the ICO in accordance with our legal
            obligations.
          </p>
        </Section>

        {/* 8 — Cookies */}
        <Section title="8. Cookies and tracking">
          <p>
            We use a small number of essential cookies required for the app to function —
            specifically, a session cookie to keep you logged in. We do not use advertising
            cookies or third-party tracking pixels.
          </p>
          <p>
            You can control cookies through your browser settings, but disabling essential
            cookies will prevent you from staying logged in.
          </p>
        </Section>

        {/* 9 — Children */}
        <Section title="9. Children's privacy">
          <p>
            Aunty Mel is designed for adults. We do not knowingly collect personal data
            from anyone under the age of 18. If you believe a child has provided us with
            personal data, please contact us immediately at{' '}
            <a href="mailto:privacy@auntymel.app" className="text-brand-600 underline">
              privacy@auntymel.app
            </a>{' '}
            and we will delete it promptly.
          </p>
        </Section>

        {/* 10 — Changes */}
        <Section title="10. Changes to this policy">
          <p>
            We may update this policy from time to time. If we make significant changes,
            we will notify you by email or with a notice in the app before the changes
            take effect. The &ldquo;last updated&rdquo; date at the top of this page always
            reflects the current version.
          </p>
        </Section>

        {/* 11 — Contact */}
        <Section title="11. Contact us">
          <p>
            Questions, requests, or concerns about your privacy? We&apos;d love to hear from you:
          </p>
          <div className="bg-white rounded-2xl p-4 border border-gray-100 mt-2 text-sm">
            <p className="font-semibold text-gray-900">Aunty Mel — Privacy Team</p>
            <p className="text-gray-600 mt-1">
              Email:{' '}
              <a href="mailto:privacy@auntymel.app" className="text-brand-600 underline">
                privacy@auntymel.app
              </a>
            </p>
          </div>
        </Section>

        {/* Footer links */}
        <div className="border-t border-gray-200 pt-6 mt-4 flex gap-4 text-sm">
          <Link href="/terms" className="text-brand-600 hover:underline">Terms of Service</Link>
          <Link href="/" className="text-gray-400 hover:underline">Back to Aunty Mel</Link>
        </div>

      </div>
    </main>
  )
}
