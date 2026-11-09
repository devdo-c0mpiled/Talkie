import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'

export const getAdminAccess = createServerFn({ method: 'GET' }).handler(async (): Promise<Awaited<ReturnType<typeof import('./auth.server').getAdminSession>>> => {
  const { getAdminSession } = await import('./auth.server')
  return getAdminSession(getRequestHeaders())
})

export const getCurrentUser = createServerFn({ method: 'GET' }).handler(async () => {
  const { getAuth } = await import('./auth.server')
  const session = await getAuth().api.getSession({ headers: getRequestHeaders() })
  return session ? { name: session.user.name, email: session.user.email } : null
})
