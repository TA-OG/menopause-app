import Link from 'next/link'

export const metadata = {
  title: 'Support — Aunty Mel',
  description: 'Get help with Aunty Mel. FAQs, account support, and how to contact us.',
}

const FAQ = [
  {
    q: 'What is Aunty Mel?',
    a: 'Aunty Mel is a personalised wellness app for women going through perimenopause and menopause. It gives you evidence-informed guidance on diet, lifestyle, and mindset — tailored to your specific symptoms, background, and goals.',
  },
  {
    q: 'Is Aunty Mel medical advice?',
    a: 'No. Aunty Mel provides general wellness information only. It is not a substitute for medical advice from a qualified healthcare professional. Always consult your GP or a menopause specialist for medical concerns.',
  },
  {
    q: 'How do I log in?',
    a: 'You can sign in with your Google account, or use a magic link — we\'ll email you a one-click login link. No password needed.',
  },
  {
    q: 'I didn\'t receive my magic link email.',
    a: 'Check your spam or junk folder. Magic links expire after 1 hour — if it\'s expired, go back to the sign-in page and request a new one. If you still don\'t receive it, contact us at hello@auntymel.app.',
  },
  {
    q: 'How do I cancel my subscription?',
    a: 'Go to your account settings and tap "Manage subscription". You can cancel at any time. You\'ll keep access until the end of your current billing period and we won\'t charge you again.',
  },
  {
    q: 'Can I get a refund?',
    a: 'Yes — we offer a 30-day no-questions-asked money-back guarantee. Email hello@auntymel.app with the subject "Refund request" and we\'ll sort it within 5 business days. If you\'re outside the 30-day window and something went wrong, still get in touch — we\'ll look at it as a person, not a policy.',
  },
  {
    q: 'How do I update my wellness plan?',
    a: 'Your plan is generated from your onboarding answers. If your symptoms or situation have changed, contact us at hello@auntymel.app and we can reset your onboarding so you can complete it fresh.',
  },
  {
    q: 'Is my health data safe?',
    a: 'Yes. Your data is encrypted in transit and at rest, stored on secure EU servers (Supabase, Ireland), and never sold to third parties. See our Privacy Policy for full details.',
  },
  {
    q: 'How do I delete my account and data?',
    a: 'You can request full account and data deletion by visiting our data deletion page or emailing privacy@auntymel.app. We\'ll delete everything within 30 days.',
  },
  {
    q: 'What devices does Aunty Mel work on?',
    a: 'Aunty Mel is a progressive web app (PWA) that works on any modern smartphone, tablet, or desktop. You can add it to your home screen from your browser for an app-like experience. iOS and Android native apps are coming soon.',
  },
  {
    q: 'Can I use Aunty Mel if I have had surgical menopause?',
    a: 'Absolutely. During onboarding you can tell us you\'ve had surgical menopause and your plan will be tailored accordingly.',
  },
  {
    q: 'Why do you ask about my cultural background?',
    a: 'Research shows menopause affects women differently depending on cultural background — in symptom patterns, dietary factors, and which approaches work best. We use this to make your recommendations genuinely relevant to you, referencing foods and traditions you actually know. This information is optional, treated as sensitive, and never shared.',
  },
]

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="mb-10">
          <Link href="/" className="text-brand-600 text-sm font-medium hover:underline">
            ← Back to Aunty Mel
          </Link>
          <h1 className="text-3xl font-bold text-brand-900 mt-4 mb-2">Support</h1>
          <p className="text-gray-500 text-sm">
            We&apos;re a small team and we genuinely want to help. Find answers below or
            drop us an email — we reply within 1 business day.
          </p>
        </div>

        {/* Contact card */}
        <div className="bg-white rounded-2xl p-6 border border-brand-100 mb-10">
          <h2 className="font-bold text-brand-900 mb-1">Contact us</h2>
          <p className="text-sm text-gray-600 mb-4">
            Can&apos;t find your answer below? Email us — we read every message.
          </p>
          <div className="space-y-2">
            <a
              href="mailto:hello@auntymel.app"
              className="flex items-center gap-3 bg-brand-900 text-white font-semibold text-sm px-5 py-3 rounded-xl hover:bg-brand-800 transition-colors w-fit"
            >
              ✉️ Email hello@auntymel.app
            </a>
            <p className="text-xs text-gray-400">
              For privacy or data requests:{' '}
              <a href="mailto:privacy@auntymel.app" className="underline">
                privacy@auntymel.app
              </a>
            </p>
          </div>
        </div>

        {/* FAQ */}
        <h2 className="text-xl font-bold text-brand-900 mb-4">Frequently asked questions</h2>
        <div className="space-y-3">
          {FAQ.map(({ q, a }) => (
            <details
              key={q}
              className="bg-white rounded-2xl border border-gray-100 group"
            >
              <summary className="flex items-center justify-between px-5 py-4 cursor-pointer list-none font-medium text-gray-900 text-sm">
                {q}
                <span className="text-brand-500 text-lg ml-3 flex-shrink-0 group-open:rotate-45 transition-transform">+</span>
              </summary>
              <div className="px-5 pb-4 text-sm text-gray-600 leading-relaxed">
                {a}
              </div>
            </details>
          ))}
        </div>

        {/* Footer links */}
        <div className="border-t border-gray-200 pt-6 mt-10 flex flex-wrap gap-4 text-sm">
          <Link href="/privacy" className="text-brand-600 hover:underline">Privacy Policy</Link>
          <Link href="/terms" className="text-brand-600 hover:underline">Terms & Refund Policy</Link>
          <Link href="/data-deletion" className="text-brand-600 hover:underline">Delete my data</Link>
          <Link href="/" className="text-gray-400 hover:underline">Back to Aunty Mel</Link>
        </div>

      </div>
    </main>
  )
}
