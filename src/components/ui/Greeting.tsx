'use client'

/**
 * Greeting component — uses the user's local device time, not server UTC.
 * Rendered client-side so Lagos (UTC+1) and Karachi (UTC+5) get the right
 * time-of-day greeting rather than whatever the Vercel server thinks it is.
 */

export default function Greeting({ firstName }: { firstName: string }) {
  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-900">
        {greeting}, {firstName} 👋
      </h1>
      <p className="text-gray-500 mt-1 text-sm">How are you feeling today?</p>
    </div>
  )
}
