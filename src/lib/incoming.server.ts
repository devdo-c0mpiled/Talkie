import '@tanstack/react-start/server-only'
import { env } from 'cloudflare:workers'

import { getAuth } from './auth.server'
import { getInboundConversation, listInboundConversations } from './call-store.server'
import { bindConfiguredCustomerPhone, getOrCreateCustomer } from './customers.server'

const headers = { 'Cache-Control': 'private, no-store' }

export async function handleIncoming(request: Request): Promise<Response> {
  const session = await getAuth().api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401, headers })

  let result = await getOrCreateCustomer({ db: env.DB, userId: session.user.id, designatedEmail: env.CUSTOMER_0001_EMAIL })
  if (result.kind !== 'ready') return Response.json({ error: 'Customer unavailable' }, { status: 503, headers })

  if (result.customer.id === '0001') {
    result = await bindConfiguredCustomerPhone({ db: env.DB, phoneNumber: env.CLAWOPS_PHONE_NUMBER, designatedEmail: env.CUSTOMER_0001_EMAIL })
    if (result.kind !== 'ready') return Response.json({ error: 'Customer unavailable' }, { status: 503, headers })
  }

  const customer = { id: result.customer.id, phoneNumber: result.customer.phoneNumber }
  const conversationId = new URL(request.url).searchParams.get('conversation')
  const conversations = await listInboundConversations(env.DB, customer.id)
  if (conversationId !== null) {
    const conversation = await getInboundConversation(env.DB, { customerId: customer.id, conversationId })
    if (!conversation) return Response.json({ error: 'Not found' }, { status: 404, headers })
    return Response.json({ customer, conversations, selected: conversation }, { headers })
  }

  return Response.json({ customer, conversations }, { headers })
}
