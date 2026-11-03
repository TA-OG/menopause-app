import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Mocks ────────────────────────────────────────────────────────────────────
// Hoisted so the module-scope `new Stripe(...)` in route.ts picks them up.

const m = vi.hoisted(() => {
  class StripeInvalidRequestError extends Error {
    code?: string
    constructor(code?: string) {
      super(code ?? 'invalid request')
      this.code = code
    }
  }
  return {
    StripeInvalidRequestError,
    customersDel: vi.fn(),
    getUser: vi.fn(),
    signOut: vi.fn(),
    profile: { data: null as unknown, error: null as unknown },
    rpc: vi.fn(),
    calls: [] as string[],
  }
})

vi.mock('stripe', () => {
  function Stripe() {
    return { customers: { del: m.customersDel } }
  }
  Stripe.errors = { StripeInvalidRequestError: m.StripeInvalidRequestError }
  return { default: Stripe }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: m.getUser, signOut: m.signOut } }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => m.profile }) }),
    }),
    rpc: m.rpc,
  }),
}))

vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ success: true }) }))
vi.mock('@/lib/monitoring', () => ({ recordEvent: async () => {} }))

import { DELETE } from './route'

function request(body: unknown) {
  return new NextRequest('http://localhost/api/account', {
    method: 'DELETE',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  m.calls.length = 0
  m.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
  m.signOut.mockResolvedValue({})
  m.profile = { data: { stripe_customer_id: 'cus_1', is_admin: false }, error: null }
  m.customersDel.mockImplementation(async () => {
    m.calls.push('stripe')
    return {}
  })
  m.rpc.mockImplementation(async () => {
    m.calls.push('erase')
    return { error: null }
  })
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DELETE /api/account', () => {
  it('rejects a signed-out caller without touching Stripe or the database', async () => {
    m.getUser.mockResolvedValue({ data: { user: null } })
    const res = await DELETE(request({ confirm: 'DELETE' }))
    expect(res.status).toBe(401)
    expect(m.customersDel).not.toHaveBeenCalled()
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('requires the typed confirmation server-side', async () => {
    for (const body of [{}, { confirm: 'delete' }, { confirm: 'yes' }, null]) {
      const res = await DELETE(request(body))
      expect(res.status).toBe(400)
    }
    expect(m.rpc).not.toHaveBeenCalled()
  })

  it('cancels Stripe before erasing, then signs out', async () => {
    const res = await DELETE(request({ confirm: 'DELETE' }))
    expect(res.status).toBe(200)
    expect(m.calls).toEqual(['stripe', 'erase'])
    expect(m.customersDel).toHaveBeenCalledWith('cus_1')
    expect(m.rpc).toHaveBeenCalledWith('erase_user', { p_user_id: 'user-1' })
    expect(m.signOut).toHaveBeenCalled()
  })

  it('does not erase anything if Stripe cancellation fails, and says nothing was deleted', async () => {
    m.customersDel.mockRejectedValue(new Error('Stripe is down'))
    const res = await DELETE(request({ confirm: 'DELETE' }))
    expect(res.status).toBe(500)
    expect(m.rpc).not.toHaveBeenCalled()
    expect((await res.json()).error).toMatch(/nothing has been deleted/)
  })

  it('carries on when the Stripe customer is already gone (e.g. a retry)', async () => {
    m.customersDel.mockRejectedValue(new m.StripeInvalidRequestError('resource_missing'))
    const res = await DELETE(request({ confirm: 'DELETE' }))
    expect(res.status).toBe(200)
    expect(m.rpc).toHaveBeenCalled()
  })

  it('skips Stripe for a user who never had a customer', async () => {
    m.profile = { data: { stripe_customer_id: null, is_admin: false }, error: null }
    const res = await DELETE(request({ confirm: 'DELETE' }))
    expect(res.status).toBe(200)
    expect(m.customersDel).not.toHaveBeenCalled()
    expect(m.rpc).toHaveBeenCalled()
  })

  it('tells her the subscription was cancelled when only the erase step fails', async () => {
    m.rpc.mockResolvedValue({ error: { message: 'boom' } })
    const res = await DELETE(request({ confirm: 'DELETE' }))
    expect(res.status).toBe(500)
    const { error } = await res.json()
    expect(error).toMatch(/subscription has been cancelled/)
    expect(error).not.toMatch(/nothing has been deleted/)
    expect(m.signOut).not.toHaveBeenCalled()
  })

  it('says nothing was deleted when the erase step fails for a user with no subscription', async () => {
    m.profile = { data: { stripe_customer_id: null, is_admin: false }, error: null }
    m.rpc.mockResolvedValue({ error: { message: 'boom' } })
    const res = await DELETE(request({ confirm: 'DELETE' }))
    expect((await res.json()).error).toMatch(/nothing has been deleted/)
  })

  it('refuses to delete an admin account from the app', async () => {
    m.profile = { data: { stripe_customer_id: null, is_admin: true }, error: null }
    const res = await DELETE(request({ confirm: 'DELETE' }))
    expect(res.status).toBe(403)
    expect(m.customersDel).not.toHaveBeenCalled()
    expect(m.rpc).not.toHaveBeenCalled()
  })
})
