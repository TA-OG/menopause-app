import Link from 'next/link'

export const metadata = {
  title: 'Terms of Service & Refund Policy — Aunty Mel',
  description: 'Our terms of service and refund policy. We want you to feel good about every penny you spend.',
}

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="mb-10 scroll-mt-6">
      <h2 className="text-xl font-bold text-brand-900 mb-3">{title}</h2>
      <div className="space-y-3 text-gray-700 leading-relaxed text-sm">{children}</div>
    </section>
  )
}

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="mb-10">
          <Link href="/" className="text-brand-600 text-sm font-medium hover:underline">
            ← Back to Aunty Mel
          </Link>
          <h1 className="text-3xl font-bold text-brand-900 mt-4 mb-2">
            Terms of Service & Refund Policy
          </h1>
          <p className="text-gray-500 text-sm">
            Last updated: 7 August 2026 &nbsp;·&nbsp; Effective: 7 August 2026
          </p>
        </div>

        {/* Refund policy — FIRST, prominent */}
        <div className="bg-white rounded-2xl p-6 border-2 border-brand-200 mb-10">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">💛</span>
            <h2 className="text-xl font-bold text-brand-900">Our Refund Promise</h2>
          </div>

          <p className="text-gray-700 text-sm leading-relaxed mb-4">
            We built Aunty Mel to give real value to real women going through something
            genuinely hard. If at any point you feel you haven&apos;t received that value,
            we want to make it right — no hoops, no guilt, no small print.
          </p>

          <div className="space-y-4">

            {/* 30-day guarantee */}
            <div className="bg-brand-50 rounded-xl p-4">
              <p className="font-bold text-brand-900 mb-1">30-day money-back guarantee</p>
              <p className="text-sm text-gray-700 leading-relaxed">
                If you subscribe and decide within <strong>30 days</strong> that Aunty Mel
                isn&apos;t right for you — for any reason, or no reason at all — email us and
                we&apos;ll refund you in full. No questions asked. You don&apos;t even need to
                explain why.
              </p>
            </div>

            {/* Beyond 30 days */}
            <div className="bg-blush-50 rounded-xl p-4 border border-blush-100">
              <p className="font-bold text-gray-900 mb-1">Beyond 30 days</p>
              <p className="text-sm text-gray-700 leading-relaxed">
                We still want to help. If you&apos;re outside the 30-day window but something
                went wrong — a technical issue, a billing error, a period where life got in
                the way — get in touch. We&apos;ll look at it as a person, not a policy.
                We&apos;d rather lose the revenue than have you feel you lost out.
              </p>
            </div>

            {/* How to claim */}
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="font-bold text-gray-900 mb-1">How to claim your refund</p>
              <p className="text-sm text-gray-700">
                Email{' '}
                <a href="mailto:hello@auntymel.app" className="text-brand-600 underline font-medium">
                  hello@auntymel.app
                </a>{' '}
                with the subject line <strong>&ldquo;Refund request&rdquo;</strong> and the
                email address on your account. That&apos;s it. We&apos;ll process it within
                5 business days and you&apos;ll see it in your account within 5–10 business
                days depending on your bank.
              </p>
            </div>

            {/* Cancellations */}
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="font-bold text-gray-900 mb-1">Cancellations</p>
              <p className="text-sm text-gray-700 leading-relaxed">
                You can cancel your subscription at any time from your account settings.
                Cancelling stops your next payment — you keep access until the end of your
                current billing period. We don&apos;t charge cancellation fees.
              </p>
            </div>

          </div>
        </div>

        {/* Terms of service */}
        <Section title="1. About Aunty Mel">
          <p>
            Aunty Mel is a digital wellness platform operated by{' '}
            <strong>Velanium Holdings Ltd</strong> (company number 17285945), a company
            registered in England and Wales with its registered office at 3rd Floor,
            86-90 Paul St, London, United Kingdom, EC2A 4NE. Our platform provides
            personalised wellness guidance for women navigating perimenopause and
            menopause, based on information you provide and content curated by our
            specialist team.
          </p>
          <p>
            By creating an account or using our service, you agree to these terms. If you
            don&apos;t agree, please don&apos;t use the service — and if something feels unfair,
            please tell us at{' '}
            <a href="mailto:hello@auntymel.app" className="text-brand-600 underline">
              hello@auntymel.app
            </a>
            . We want these terms to be fair.
          </p>
        </Section>

        <Section title="2. Not medical advice">
          <p>
            <strong>Aunty Mel provides general wellness information, not medical advice.</strong>
          </p>
          <p>
            The content, recommendations, and guidance on Aunty Mel are for informational and
            educational purposes only. They are not a substitute for professional medical advice,
            diagnosis, or treatment. Always consult a qualified healthcare provider — your GP,
            a menopause specialist, or another registered clinician — for any medical concerns.
          </p>
          <p>
            If you are experiencing a medical emergency, call 999 or go to your nearest A&E.
          </p>
        </Section>

        <Section title="3. Your account">
          <p>
            You must be 18 or older to use Aunty Mel. You are responsible for keeping your
            login credentials secure and for all activity on your account. Please let us know
            immediately at{' '}
            <a href="mailto:hello@auntymel.app" className="text-brand-600 underline">
              hello@auntymel.app
            </a>{' '}
            if you suspect unauthorised access.
          </p>
          <p>
            You may only create one account per person. We reserve the right to merge or remove
            duplicate accounts.
          </p>
        </Section>

        <Section title="4. Subscription and payment">
          <p>
            Aunty Mel is available on a free plan and a paid premium subscription
            (currently <strong>£7.99/month</strong>). Prices are displayed in GBP and include VAT.
          </p>
          <p>
            Your subscription renews automatically each month until you cancel it. Payments are
            processed by Stripe and are subject to{' '}
            <a
              href="https://stripe.com/gb/legal/ssa"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 underline"
            >
              Stripe&apos;s terms
            </a>
            . We may change our prices in the future — if we do, we will give you at least
            30 days&apos; notice before any change affects your subscription.
          </p>
        </Section>

        <Section title="5. Referral program" id="referrals">
          <p>
            From your account, you can generate a personal referral link (Invite friends).
            The following terms apply to referral rewards:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              When a friend creates an account using your link and completes their{' '}
              <strong>first successful subscription payment</strong>, you and your friend
              each receive <strong>one month free</strong> on the Premium plan.
            </li>
            <li>
              Your free month is applied automatically: if you already have an active
              subscription, it extends your current billing period by one month, whatever
              point you&apos;re currently at in your billing cycle; if you don&apos;t yet
              have a subscription, it&apos;s applied as a free trial period the next time
              you subscribe.
            </li>
            <li>
              Each person may only ever be credited as someone else&apos;s referred friend
              once, for the lifetime of their account — regardless of how many referral
              links they click or accounts they attempt to create. You cannot refer
              yourself or a second account you control.
            </li>
            <li>
              Referral rewards <strong>stack</strong>: you can earn a free month for each of
              up to <strong>6 qualifying referrals</strong>, for a maximum of{' '}
              <strong>6 free months</strong> in total. You&apos;re welcome to refer more than
              6 friends, but reward stacking is capped at 6 months.
            </li>
            <li>
              We may withhold, delay, or reverse referral rewards where we reasonably
              suspect fraud, abuse, fake or duplicate accounts, or attempts to circumvent
              the one-referral-per-person rule. See section 4 (&ldquo;one account per
              person&rdquo;), which also applies to the referral program.
            </li>
            <li>
              We may change or end the referral program at any time, but changes won&apos;t
              affect rewards you&apos;ve already qualified for.
            </li>
          </ul>
        </Section>

        <Section title="6. What you can and can't do">
          <p>You are welcome to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Use Aunty Mel for your own personal, non-commercial wellness purposes</li>
            <li>Share your referral link to bring friends to the platform</li>
            <li>Provide us with feedback so we can improve</li>
          </ul>
          <p className="mt-3">Please don&apos;t:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Share your login credentials with others</li>
            <li>Attempt to scrape, reverse-engineer, or copy our content or wellness frameworks</li>
            <li>Use the platform to provide or resell wellness advice to third parties</li>
            <li>Post content that is harmful, abusive, or illegal</li>
            <li>Create multiple or fake accounts to generate referral rewards</li>
          </ul>
        </Section>

        <Section title="7. Our content">
          <p>
            The wellness frameworks, articles, recommendations, and other content on Aunty Mel
            are owned by Velanium Holdings Ltd or our content partners. You may use them for
            your own personal reference but may not copy, redistribute, or publish them
            without our written permission.
          </p>
        </Section>

        <Section title="8. Your content">
          <p>
            Content you create in Aunty Mel — journal entries, check-ins, notes — belongs to you.
            We use it only to provide and improve your personalised experience. We do not publish
            or share your personal content without your consent.
          </p>
        </Section>

        <Section title="9. Service availability">
          <p>
            We aim for Aunty Mel to be available 24/7 but we can&apos;t guarantee it. We may
            occasionally need to take the service offline for maintenance or updates. We&apos;ll
            give advance notice for planned downtime wherever possible.
          </p>
        </Section>

        <Section title="10. Limitation of liability">
          <p>
            To the maximum extent permitted by UK law, Velanium Holdings Ltd is not liable for
            indirect, incidental, or consequential losses arising from your use of the
            platform. Our liability for direct losses is limited to the amount you paid us
            in the 12 months prior to the event giving rise to the claim.
          </p>
          <p>
            Nothing in these terms excludes liability for death or personal injury caused by
            our negligence, or for fraud or fraudulent misrepresentation.
          </p>
        </Section>

        <Section title="11. Governing law">
          <p>
            These terms are governed by the laws of England and Wales. Any disputes will be
            subject to the exclusive jurisdiction of the courts of England and Wales.
          </p>
          <p>
            If you&apos;re based in another country and a local law gives you additional
            rights, nothing in these terms overrides those rights.
          </p>
        </Section>

        <Section title="12. Changes to these terms">
          <p>
            We may update these terms from time to time. For material changes, we&apos;ll
            give you at least 30 days&apos; notice by email before they take effect. Continuing
            to use Aunty Mel after the effective date means you accept the updated terms.
          </p>
        </Section>

        <Section title="13. Contact">
          <p>
            Questions about these terms? We&apos;re a small team and we&apos;re happy to chat:
          </p>
          <div className="bg-white rounded-2xl p-4 border border-gray-100 mt-2">
            <p className="font-semibold text-gray-900 text-sm">Velanium Holdings Ltd</p>
            <p className="text-gray-600 text-sm mt-1">
              Company number: 17285945<br />
              Registered office: 3rd Floor, 86-90 Paul St, London, United Kingdom, EC2A 4NE
            </p>
            <p className="text-gray-600 text-sm mt-1">
              Email:{' '}
              <a href="mailto:hello@auntymel.app" className="text-brand-600 underline">
                hello@auntymel.app
              </a>
            </p>
          </div>
        </Section>

        {/* Footer links */}
        <div className="border-t border-gray-200 pt-6 mt-4 flex gap-4 text-sm">
          <Link href="/privacy" className="text-brand-600 hover:underline">Privacy Policy</Link>
          <Link href="/" className="text-gray-400 hover:underline">Back to Aunty Mel</Link>
        </div>

      </div>
    </main>
  )
}
