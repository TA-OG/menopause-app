/**
 * Shared between DELETE /api/account and the profile page's delete dialog,
 * so the word the UI asks for and the word the server checks can't drift.
 */
export const DELETE_CONFIRMATION = 'DELETE'

export function isDeleteConfirmed(typed: string): boolean {
  return typed.trim() === DELETE_CONFIRMATION
}
