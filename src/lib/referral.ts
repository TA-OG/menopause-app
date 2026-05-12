import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-04-10',
})

/**
 * Generate a unique, human-readable referral code.
 * Format: 3 letters + 4 numbers e.g. PAM4821
 * Avoids ambiguous characters (0, O, I, 1)
 */
export function generateReferralCode(firstName: string): string {
  const SAFE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const SAFE_NUMBERS = '23456789'

  // Use first 2-3 letters of name + random chars
  const namePrefix = firstName
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3)
    .padEnd(3, SAFE_LETTERS[Math.floor(Math.random() * SAFE_LETTERS.length)])

  const numbers = Array.from({ length: 4 }, () =>
    SAFE_NUMBERS[Math.floor(Math.random() * SAFE_NUMBERS.length)]
  ).join('')

  return `${namePrefix}${numbers}`
}

/**
 * Create a Stripe coupon for a referrer.
 * 99p off forever, applied when they subscribe.
 * Coupons stack — one coupon per referral.
 * Stripe handles the stacking via multiple coupon application
 * using a subscription discount stack approach.
 *
 * NOTE: Stripe doesn't natively stack multiple coupons on one subscription.
 * Strategy: we create a single coupon per referrer that reflects their
 * total discount (referral_count * 99p), and update it as they refer more.
 * Max discount is capped at £7.99 (full subscription price).
 */
export async function createOrUpdateReferralCoupon(
  referralCount: number,
  existingCouponId?: string | null,
  firstName?: string
): Promise<string> {
  const discountPence = Math.min(referralCount * 99, 799) // Cap at £7.99

  if (existingCouponId) {
    // Stripe coupons are immutable — delete old and create new
    try {
      await stripe.coupons.del(existingCouponId)
    } catch {
      // Coupon may already be deleted or applied — continue
    }
  }

  const coupon = await stripe.coupons.create({
    amount_off: discountPence,
    currency: 'gbp',
    duration: 'forever',
    name: `Referral reward${firstName ? ` — ${firstName}` : ''} (${referralCount} referral${referralCount !== 1 ? 's' : ''})`,
    metadata: {
      referral_count: String(referralCount),
      type: 'referral_reward',
    },
  })

  return coupon.id
}

/**
 * Build the full referral URL for sharing.
 */
export function buildReferralUrl(referralCode: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://auntymel.com'
  return `${baseUrl}/waitlist?ref=${referralCode}`
}

/**
 * Validate a referral code format.
 */
export function isValidReferralCode(code: string): boolean {
  return /^[A-Z]{3}[0-9]{4}$/.test(code)
}
