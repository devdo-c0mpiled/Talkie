import { createServerFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'

export const getAdminAccess = createServerFn({ method: 'GET' }).handler(async (): Promise<Awaited<ReturnType<typeof import('./auth.server').getAdminSession>>> => {
  const { getAdminSession } = await import('./auth.server')
  const session = await getAdminSession(getRequestHeaders())
  // Keep admin access closed until the session proves a trusted provider and email ownership.
  return session.status === 'anonymous' ? session : { status: 'denied' }
})
