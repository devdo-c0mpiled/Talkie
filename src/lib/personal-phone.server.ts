import '@tanstack/react-start/server-only'
import { env } from 'cloudflare:workers'
import { z } from 'zod'
import { getAuth } from './auth.server'
import { bindPersonalPhone, getOrCreateCustomer, getPersonalPhone } from './customers.server'

const headers = { 'Cache-Control': 'private, no-store' }
const bodySchema = z.object({ phoneNumber: z.string().max(32) })

export async function handlePersonalPhone(request: Request): Promise<Response> {
  const session = await getAuth().api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401, headers })
  if (request.method === 'POST' && request.headers.get('Origin') !== new URL(env.BETTER_AUTH_URL).origin) {
    return Response.json({ error: 'Forbidden' }, { status: 403, headers })
  }
  const customer = await getOrCreateCustomer({ db: env.DB, userId: session.user.id, designatedEmail: env.CUSTOMER_0001_EMAIL })
  if (customer.kind !== 'ready') return Response.json({ error: 'Customer unavailable' }, { status: 503, headers })
  if (request.method === 'GET') {
    const phoneNumber = await getPersonalPhone({ db: env.DB, userId: session.user.id })
    return Response.json({ customerNumber: customer.customer.id, phoneNumber, verified: false }, { headers })
  }
  let body: unknown
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid request' }, { status: 400, headers }) }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400, headers })
  const result = await bindPersonalPhone({ db: env.DB, userId: session.user.id, phoneNumber: parsed.data.phoneNumber })
  if (result.kind === 'invalid_config') return Response.json({ error: 'Invalid phone number' }, { status: 400, headers })
  if (result.kind === 'conflict') return Response.json({ error: 'Phone number unavailable' }, { status: 409, headers })
  if (result.kind !== 'ready') return Response.json({ error: 'Customer unavailable' }, { status: 503, headers })
  return Response.json({ customerNumber: customer.customer.id, phoneNumber: result.phoneNumber, verified: false }, { headers })
}
