import { describe, expect, it } from 'vitest'
import { customerCodeFromUrl, upsertEnvFile, webhookUrlFor } from './stream-setup'

describe('upsertEnvFile', () => {
  it('replaces existing keys in place and keeps everything else', () => {
    const before = '# Supabase\nNEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co\nCLOUDFLARE_ACCOUNT_ID=old\n\n# end\n'
    expect(upsertEnvFile(before, { CLOUDFLARE_ACCOUNT_ID: 'new' })).toBe(
      '# Supabase\nNEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co\nCLOUDFLARE_ACCOUNT_ID=new\n\n# end\n',
    )
  })

  it('appends keys that are not there yet', () => {
    expect(upsertEnvFile('A=1\n', { B: '2' })).toBe('A=1\nB=2\n')
    expect(upsertEnvFile('', { B: '2' })).toBe('B=2\n')
  })

  it('recognises export-prefixed and spaced assignments', () => {
    expect(upsertEnvFile('export B = 1\n', { B: '2' })).toBe('B=2\n')
  })

  it('does not touch a commented-out key', () => {
    expect(upsertEnvFile('# B=1\n', { B: '2' })).toBe('# B=1\nB=2\n')
  })

  it('refuses multi-line values and bad names rather than corrupting the file', () => {
    expect(() => upsertEnvFile('', { B: 'a\nb' })).toThrow(/single line/)
    expect(() => upsertEnvFile('', { 'b-1': 'x' })).toThrow(/Invalid/)
  })
})

describe('customerCodeFromUrl', () => {
  it('extracts the code from a Stream thumbnail or preview URL', () => {
    expect(
      customerCodeFromUrl('https://customer-f33zs165nr7gyfy4.cloudflarestream.com/6b9e/thumbnails/thumbnail.jpg'),
    ).toBe('f33zs165nr7gyfy4')
  })

  it('returns null for anything else', () => {
    expect(customerCodeFromUrl(undefined)).toBeNull()
    expect(customerCodeFromUrl('https://evil.example/customer-abc.cloudflarestream.com/')).toBeNull()
  })
})

describe('webhookUrlFor', () => {
  it('builds the webhook URL from the site origin', () => {
    expect(webhookUrlFor('https://auntymel.app')).toBe('https://auntymel.app/api/stream/webhook')
    expect(webhookUrlFor('https://auntymel.app/some/path/')).toBe('https://auntymel.app/api/stream/webhook')
  })

  it('refuses URLs Cloudflare could not reach', () => {
    expect(() => webhookUrlFor('http://auntymel.app')).toThrow(/https/)
    expect(() => webhookUrlFor('https://localhost:3000')).toThrow(/localhost/)
    expect(() => webhookUrlFor('not a url')).toThrow(/not a URL/)
  })
})
