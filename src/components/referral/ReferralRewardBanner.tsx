'use client'

import { Gift } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

interface UnseenReward {
  id: string
  role: 'referrer' | 'referred'
  months: number
  applied_at: string
}

export default function ReferralRewardBanner() {
  const t = useTranslations('ReferralRewardBanner')
  const [rewards, setRewards] = useState<UnseenReward[]>([])
  const [dismissing, setDismissing] = useState(false)

  useEffect(() => {
    fetch('/api/referral/notifications')
      .then((res) => (res.ok ? res.json() : { rewards: [] }))
      .then((data) => setRewards(data.rewards ?? []))
      .catch(() => setRewards([]))
  }, [])

  if (rewards.length === 0) return null

  const totalMonths = rewards.reduce((sum, r) => sum + r.months, 0)
  const referredCount = rewards.filter((r) => r.role === 'referrer').length
  const hasWelcomeBonus = rewards.some((r) => r.role === 'referred')

  let message: string
  if (hasWelcomeBonus && referredCount === 0) {
    message = t('welcome')
  } else if (referredCount > 0 && !hasWelcomeBonus) {
    message = t('friendsSubscribed', { friends: referredCount, months: totalMonths })
  } else {
    message = t('earned', { months: totalMonths })
  }

  async function dismiss() {
    setDismissing(true)
    try {
      await fetch('/api/referral/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: rewards.map((r) => r.id) }),
      })
    } finally {
      setRewards([])
    }
  }

  return (
    <div className="bg-brand-900 text-white rounded-2xl p-4 mb-4 flex items-start gap-3">
      <Gift aria-hidden="true" className="h-6 w-6 flex-shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-semibold">{message}</p>
        <p className="text-brand-200 text-xs mt-0.5">{t('checkBilling')}</p>
      </div>
      <button
        onClick={dismiss}
        disabled={dismissing}
        aria-label={t('dismiss')}
        className="text-brand-200 hover:text-white text-lg leading-none px-1 disabled:opacity-50"
      >
        ×
      </button>
    </div>
  )
}
