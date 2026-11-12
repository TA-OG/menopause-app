import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import './globals.css'
import AutoLocaleNotice from '@/components/layout/AutoLocaleNotice'
import { siteUrl } from '@/lib/site'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

// og:locale per app language; the description comes from messages (Meta).
const OG_LOCALE: Record<string, string> = { en: 'en_GB', fr: 'fr_FR', es: 'es_ES', de: 'de_DE', pt: 'pt_PT' }

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Meta')
  const locale = await getLocale()
  return {
    metadataBase: new URL(siteUrl()),
    title: {
      default: 'Aunty Mel',
      template: '%s | Aunty Mel',
    },
    description: t('description'),
    // './' resolves to each page's own path, so every page declares itself
    // canonical (and the ?lang= / ?tab= variants collapse onto it).
    alternates: { canonical: './' },
    manifest: '/manifest.json',
    other: { 'mobile-web-app-capable': 'yes' },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: 'Aunty Mel',
    },
    formatDetection: {
      telephone: false,
    },
    openGraph: {
      type: 'website',
      locale: OG_LOCALE[locale] ?? 'en_GB',
      siteName: 'Aunty Mel',
      title: 'Aunty Mel',
      description: t('description'),
      // The image itself comes from opengraph-image.tsx
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Aunty Mel',
      description: t('description'),
    },
  }
}

export const viewport: Viewport = {
  themeColor: '#c653a0',
  width: 'device-width',
  initialScale: 1,
  // No maximumScale / userScalable: locking zoom stops low-vision readers
  // enlarging text (WCAG 1.4.4) — on an app for women in midlife, that matters.
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale} className={inter.variable}>
      <body className="min-h-screen bg-white">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <AutoLocaleNotice />
        </NextIntlClientProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  // Best-effort: push and the offline page degrade without it.
                  navigator.serviceWorker.register('/sw.js').catch(function() {})
                })
              }
            `,
          }}
        />
      </body>
    </html>
  )
}
