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
