/** Select an existing local user database only in an explicitly opted-in dev server. */
export function getDevelopmentUserId(): number | null {
  if (!import.meta.env.DEV || !['development', 'development.cn', 'development.global'].includes(import.meta.env.MODE)) return null

  const rawUserId = import.meta.env.RENDERER_DEV_USER_ID?.trim()
  if (!rawUserId || !/^\d+$/.test(rawUserId)) return null

  const userId = Number(rawUserId)
  return Number.isSafeInteger(userId) && userId > 0 ? userId : null
}

export function getSkipLoginUserId(): number {
  return getDevelopmentUserId() ?? 999999999
}
