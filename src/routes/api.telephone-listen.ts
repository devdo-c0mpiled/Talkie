import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/telephone-listen')({
  server: { handlers: { GET: async ({ request }) => {
    const [{ env }, { getAuth }, { fromCallReference }, { handleTelephoneListen }] = await Promise.all([
      import('cloudflare:workers'), import('../lib/auth.server'), import('../lib/clawops.server'), import('../lib/telephone-listen-access.server'),
    ])
    const namespace: DurableObjectNamespace | undefined = Reflect.get(env, 'TELEPHONE_LISTEN')
    if (!namespace) return new Response('Listening unavailable', { status: 503 })
    return handleTelephoneListen(request, {
      db: env.DB,
      namespace,
      userId: async req => (await getAuth().api.getSession({ headers: req.headers }))?.user.id ?? null,
      fromReference: fromCallReference,
    })
  } } },
})
