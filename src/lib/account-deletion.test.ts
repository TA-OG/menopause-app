import { describe, it, expect } from 'vitest'
import { isDeleteConfirmed, DELETE_CONFIRMATION } from './account-deletion'

describe('isDeleteConfirmed', () => {
  it('accepts exactly the confirmation word', () => {
    expect(isDeleteConfirmed(DELETE_CONFIRMATION)).toBe(true)
  })

  it('ignores surrounding whitespace from mobile keyboards', () => {
    expect(isDeleteConfirmed(` ${DELETE_CONFIRMATION} `)).toBe(true)
  })

  it('rejects anything else, including lowercase', () => {
    for (const typed of ['', 'delete', 'DELET', 'DELETE ME', 'yes']) {
      expect(isDeleteConfirmed(typed)).toBe(false)
    }
  })
})

describe('delete error codes', () => {
  it('maps every code to a DeleteAccount message in every locale', async () => {
    const { DELETE_ERROR_MESSAGE_KEY } = await import('./account-deletion')
    const locales = ['en', 'fr', 'es', 'de', 'pt'] as const
    for (const locale of locales) {
      const messages = (await import(`../../messages/${locale}.json`)).default
      for (const key of Object.values(DELETE_ERROR_MESSAGE_KEY)) {
        expect(messages.DeleteAccount[key], `${locale}.DeleteAccount.${key}`).toBeTruthy()
      }
    }
  })

  it('rejects anything that is not a known code', async () => {
    const { isDeleteAccountErrorCode } = await import('./account-deletion')
    expect(isDeleteAccountErrorCode('admin')).toBe(true)
    for (const v of ['', 'toString', 'constructor', null, undefined, 42]) {
      expect(isDeleteAccountErrorCode(v)).toBe(false)
    }
  })
})
