import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import './globals.css'
import AutoLocaleNotice from '@/components/layout/AutoLocaleNotice'

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
    title: {
      default: 'Aunty Mel',
      template: '%s | Aunty Mel',
    },
    description: t('description'),
    keywords: ['menopause', 'perimenopause', 'wellness', 'womens health', 'symptoms'],
    manifest: '/manifest.json',
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
    },
  }
}

export const viewport: Viewport = {
  themeColor: '#c653a0',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
      <head>
        <link rel="icon" href="/icons/icon-192x192.png" type="image/png" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
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
                  navigator.serviceWorker.register('/sw.js')
                    .catch(function(err) { console.log('SW registration failed:', err) })
                })
              }
            `,
          }}
        />
      </body>
    </html>
  )
}
