import { createFileRoute } from '@tanstack/react-router'

async function incoming(request: Request) {
  if (new URL(request.url).searchParams.has('history')) {
    const [{ env }, { getAuth }, { handleChatHistory }] = await Promise.all([
      import('cloudflare:workers'), import('../lib/auth.server'), import('../lib/chat-history.server'),
    ])
    const session = await getAuth().api.getSession({ headers: request.headers })
    return handleChatHistory(request, { db: env.DB, userId: session?.user.id ?? null })
  }
  if (request.method !== 'GET') return new Response(null, { status: 405 })
  const { handleIncoming } = await import('../lib/incoming.server')
  return handleIncoming(request)
}

export const Route = createFileRoute('/api/incoming')({
  server: { handlers: { GET: ({ request }) => incoming(request), POST: ({ request }) => incoming(request) } },
})
