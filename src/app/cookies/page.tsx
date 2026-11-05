import { getTranslations } from 'next-intl/server'
import LegalDocument from '@/components/legal/LegalDocument'

// Content: src/content/legal/<locale>.ts. English is the binding version.

export async function generateMetadata() {
  const t = await getTranslations('Legal.meta.cookies')
  return { title: t('title'), description: t('description') }
}

export default function CookiesPage({ searchParams }: { searchParams: { lang?: string } }) {
  return <LegalDocument doc="cookies" searchParams={searchParams} />
}
