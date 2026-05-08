import Link from 'next/link'

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-brand-50 to-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-4xl mx-auto">
        <span className="text-brand-900 font-bold text-xl">
          {/* TODO: Replace with logo */}
          Menopause App
        </span>
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

      {/* Hero */}
      <section className="text-center px-6 py-20 max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold text-brand-900 leading-tight mb-4">
          Finally understand what&apos;s happening in your body
        </h1>
        <p className="text-lg text-gray-600 mb-8 leading-relaxed">
          Personalised wellness guidance for perimenopause and menopause.
          Real information. Real adjustments. Real results — empowering you
          to have a better conversation with your doctor.
        </p>
        <Link
          href="/auth/sign-up"
          className="inline-block bg-brand-900 text-white font-semibold px-8 py-4 rounded-2xl text-lg hover:bg-brand-800 transition-colors"
        >
          Start for free
        </Link>
        <p className="mt-3 text-sm text-gray-500">
          No credit card required. Free plan available.
        </p>
      </section>

      {/* Disclaimer */}
      <div className="max-w-2xl mx-auto px-6 pb-12">
        <p className="text-xs text-center text-gray-400 leading-relaxed">
          This app provides general wellness information only. It is not medical
          advice and does not replace professional healthcare. Always consult
          your GP for medical concerns.
        </p>
      </div>
    </main>
  )
}
