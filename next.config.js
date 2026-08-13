// Content-Security-Policy — baseline lockdown of what the app is allowed to
// load/connect to. 'unsafe-inline' is required for script-src/style-src
// because Next.js (the App Router's hydration bootstrap, next/font's inline
// <style>, and our own service-worker-registration <script> in
// src/app/layout.tsx) emits inline scripts/styles with no nonce plumbing in
// this app — a stricter nonce-based CSP would need per-request nonces
// threaded through middleware.ts into every inline tag, which is a bigger
// change than this baseline hardening pass. Every other directive is scoped
// tightly: only Supabase (API + storage) and same-origin are ever reachable,
// so even if a dependency were compromised, exfiltration and remote script
// loading are still blocked.
// Next.js dev mode's webpack HMR runtime evaluates code via eval() (its
// eval-source-map devtool, for fast rebuilds) — that's blocked by a strict
// script-src and has nothing to do with production behaviour, so 'unsafe-eval'
// is scoped to development only. The production CSP stays strict.
const isDev = process.env.NODE_ENV !== 'production'

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.supabase.co",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
  // PWA headers
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        ],
      },
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Content-Security-Policy', value: CSP },
        ],
      },
    ]
  },
}

module.exports = nextConfig
