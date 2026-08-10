'use client'

import { useEffect, useState } from 'react'

interface UnseenReward {
  id: string
  role: 'referrer' | 'referred'
  months: number
  applied_at: string
}

export default function ReferralRewardBanner() {
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
    message = "Welcome bonus applied — you've got a free month on us!"
  } else if (referredCount > 0 && !hasWelcomeBonus) {
    message = `Your ${referredCount === 1 ? 'friend' : `${referredCount} friends`} subscribed — you just earned ${totalMonths} free month${totalMonths === 1 ? '' : 's'}!`
  } else {
    message = `You just earned ${totalMonths} free month${totalMonths === 1 ? '' : 's'} from referrals!`
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
      <span className="text-2xl leading-none">🎉</span>
      <div className="flex-1">
        <p className="text-sm font-semibold">{message}</p>
        <p className="text-brand-200 text-xs mt-0.5">Check your billing for the details.</p>
      </div>
      <button
        onClick={dismiss}
        disabled={dismissing}
        aria-label="Dismiss"
        className="text-brand-200 hover:text-white text-lg leading-none px-1 disabled:opacity-50"
      >
        ×
      </button>
    </div>
  )
}
