export function getAuthUserId() {
  if (window.AuthSession && typeof window.AuthSession.getUserId === 'function') {
    return String(window.AuthSession.getUserId() || '').trim()
  }
  return ''
}
