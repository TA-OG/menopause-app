/**
 * Shared between DELETE /api/account and the profile page's delete dialog,
 * so the word the UI asks for and the word the server checks can't drift.
 */
export const DELETE_CONFIRMATION = 'DELETE'

export function isDeleteConfirmed(typed: string): boolean {
  return typed.trim() === DELETE_CONFIRMATION
}

/**
 * Why DELETE /api/account refused or failed. The API sends this code next to
 * its English message, and the profile dialog shows the code's message in
 * her own language.
 */
export type DeleteAccountErrorCode =
  | 'confirm_required'
  | 'admin'
  | 'nothing_deleted'
  | 'subscription_cancelled'

/** The DeleteAccount.* message key for each code. */
export const DELETE_ERROR_MESSAGE_KEY: Record<DeleteAccountErrorCode, string> = {
  confirm_required: 'errorGeneric',
  admin: 'errorAdmin',
  nothing_deleted: 'errorNothingDeleted',
  subscription_cancelled: 'errorSubscriptionCancelled',
}

export function isDeleteAccountErrorCode(value: unknown): value is DeleteAccountErrorCode {
  return typeof value === 'string' && Object.hasOwn(DELETE_ERROR_MESSAGE_KEY, value)
}
