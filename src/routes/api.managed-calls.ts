import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/managed-calls')({
  server: { handlers: { GET: async ({ request }) => {
    const [{ env }, { getAuth }, { handleManagedCalls }] = await Promise.all([
      import('cloudflare:workers'), import('../lib/auth.server'), import('../lib/managed-calls.server'),
    ])
    const session = await getAuth().api.getSession({ headers: request.headers })
    return handleManagedCalls(request, { db: env.DB, userId: session?.user.id ?? null,
      accountId: env.CLAWOPS_ACCOUNT_ID, apiKey: env.CLAWOPS_API_KEY })
  }, POST: async ({ request }) => {
    const [{ env }, { getAuth }, { createManagedCall }] = await Promise.all([
      import('cloudflare:workers'), import('../lib/auth.server'), import('../lib/managed-calls.server'),
    ])
    const session = await getAuth().api.getSession({ headers: request.headers })
    return createManagedCall(request, { db: env.DB, userId: session?.user.id ?? null,
      accountId: env.CLAWOPS_ACCOUNT_ID, apiKey: env.CLAWOPS_API_KEY,
      origin: new URL(env.BETTER_AUTH_URL).origin, from: env.CLAWOPS_FROM_NUMBER,
      agentId: Reflect.get(env, 'CLAWOPS_MANAGED_AGENT_ID') })
  } } },
})
