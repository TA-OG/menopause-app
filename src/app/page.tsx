import Link from 'next/link'
import Logo from '@/components/ui/Logo'

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-cream to-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-4xl mx-auto">
        <Logo size="md" />
        <div className="flex gap-3">
          <Link
            href="/auth/sign-in"
            className="text-brand-900 font-medium px-4 py-2 rounded-xl hover:bg-brand-100 transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/auth/sign-up"
            className="bg-brand-900 text-white font-medium px-4 py-2 rounded-xl hover:bg-brand-800 transition-colors"
          >
            Get started free
          </Link>
        </div>
      </nav>

      {/* Hero — manifesto */}
      <section className="text-center px-6 py-16 max-w-2xl mx-auto">
        <p className="text-brand-600 font-semibold text-sm uppercase tracking-widest mb-4">
          Every body needs an Aunty Mel
        </p>
        <h1 className="text-4xl font-bold text-brand-900 leading-tight mb-6">
          The wisdom women have always shared — finally in your pocket
        </h1>
        <p className="text-lg text-gray-600 mb-4 leading-relaxed">
          For eons, the secrets of menopause have been passed from mother to daughter,
          aunty to niece, grandmother to granddaughter. That wisdom was never lost.
          It just needs a home.
        </p>
        <p className="text-base text-gray-500 mb-8 leading-relaxed">
          Aunty Mel gives you personalised wellness guidance — built on real specialist
          expertise — to help you understand your body, manage your symptoms, and
          have a more powerful conversation with your doctor.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/waitlist"
            className="inline-block bg-brand-900 text-white font-semibold px-8 py-4 rounded-2xl text-lg hover:bg-brand-800 transition-colors"
          >
            Join the waitlist →
          </Link>
          <Link
            href="/auth/sign-up"
            className="inline-block border border-brand-300 text-brand-900 font-semibold px-8 py-4 rounded-2xl text-lg hover:bg-brand-50 transition-colors"
          >
            Get started free
          </Link>
        </div>
        <p className="mt-3 text-sm text-gray-400">
          No credit card required. Free plan available.
        </p>
      </section>

      {/* What you get */}
      <section className="max-w-2xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
          {[
            { emoji: '✨', title: 'Your plan', desc: 'Personalised wellness recommendations built around your symptoms' },
            { emoji: '📓', title: 'Your journal', desc: 'Track what works. See your progress. Build your own picture.' },
            { emoji: '📚', title: 'Real knowledge', desc: 'Evidence-informed articles from Pamela — no fluff, no fear' },
          ].map((item) => (
            <div key={item.title} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm text-center">
              <div className="text-3xl mb-2">{item.emoji}</div>
              <p className="font-bold text-brand-900 text-sm mb-1">{item.title}</p>
              <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Disclaimer */}
        <p className="text-xs text-center text-gray-400 leading-relaxed">
          Aunty Mel provides general wellness information only. Not medical advice.
          Always consult your GP for medical concerns.
        </p>
      </section>
    </main>
  )
}
