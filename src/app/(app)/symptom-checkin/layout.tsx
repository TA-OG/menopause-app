import { getTranslations } from 'next-intl/server'

// /symptom-checkin/history is a child route with its own title. A plain string
// title here would stop the root "%s | Aunty Mel" template reaching it, so this
// layout re-declares the template alongside its own default.
export async function generateMetadata() {
  const t = await getTranslations('Checkin')
  return { title: { default: t('title'), template: '%s | Aunty Mel' } }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
