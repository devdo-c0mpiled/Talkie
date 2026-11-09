import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'

export const getAdminAccess = createServerFn({ method: 'GET' }).handler(async (): Promise<Awaited<ReturnType<typeof import('./auth.server').getAdminSession>>> => {
  const { getAdminSession } = await import('./auth.server')
  return getAdminSession(getRequestHeaders())
})

export const getCurrentUser = createServerFn({ method: 'GET' }).handler(async () => {
  const { getAuth, ensureCustomer } = await import('./auth.server')
  const session = await getAuth().api.getSession({ headers: getRequestHeaders() })
  if (!session) return null
  await ensureCustomer(session.user.id)
  return { name: session.user.name, email: session.user.email }
})
