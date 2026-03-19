const AUTH_USER_KEY = 'auth_user'
const USER_ID_KEY = 'current_user_id'

function parseJson(value) {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export function getCachedUser() {
  return parseJson(localStorage.getItem(AUTH_USER_KEY))
}

export function getCachedUserId() {
  return localStorage.getItem(USER_ID_KEY) || getCachedUser()?.id || ''
}

export function getCachedUserName() {
  const user = getCachedUser()
  return user?.nickname || user?.username || '我'
}

export function saveCachedUser(user) {
  if (!user || typeof user !== 'object') return
  const normalizedUser = { ...getCachedUser(), ...user }
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(normalizedUser))
  if (normalizedUser.id) {
    localStorage.setItem(USER_ID_KEY, String(normalizedUser.id))
  }
}

export function clearCachedUser() {
  localStorage.removeItem(AUTH_USER_KEY)
  localStorage.removeItem(USER_ID_KEY)
  localStorage.removeItem('current_user')
  localStorage.removeItem('user_info')
  localStorage.removeItem('current_user_name')
}

export function migrateLegacyUserCache() {
  const legacyUser = parseJson(localStorage.getItem('current_user')) || parseJson(localStorage.getItem('user_info'))
  if (legacyUser && !getCachedUser()) {
    saveCachedUser(legacyUser)
  }
  localStorage.removeItem('current_user')
  localStorage.removeItem('user_info')
  localStorage.removeItem('current_user_name')
}

window.UserCache = {
  getCachedUser,
  getCachedUserId,
  getCachedUserName,
  saveCachedUser,
  clearCachedUser,
  migrateLegacyUserCache
}
