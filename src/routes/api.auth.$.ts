import { createFileRoute } from '@tanstack/react-router'

async function handleAuth({ request }: { request: Request }) {
  const { getAuth } = await import('../lib/auth.server')
  return getAuth().handler(request)
}

export const Route = createFileRoute('/api/auth/$')({
  server: { handlers: { GET: handleAuth, POST: handleAuth } },
})
