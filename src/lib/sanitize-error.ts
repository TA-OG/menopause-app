/**
 * Sanitize errors before sending to client.
 * Never expose internal error details, stack traces, or DB messages.
 */
export function sanitizeError(error: unknown): string {
  if (process.env.NODE_ENV === 'development') {
    if (error instanceof Error) return error.message
    return String(error)
  }
  return 'Something went wrong. Please try again.'
}

export function isAuthError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.toLowerCase().includes('auth') ||
      error.message.toLowerCase().includes('jwt') ||
      error.message.toLowerCase().includes('session')
  }
  return false
}
