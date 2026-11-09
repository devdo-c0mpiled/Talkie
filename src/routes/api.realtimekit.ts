import { createFileRoute } from '@tanstack/react-router'

async function handle({ request }: { request: Request }) {
  const { handleRealtimeKit } = await import('../lib/realtimekit.server')
  return handleRealtimeKit(request)
}

export const Route = createFileRoute('/api/realtimekit')({
  server: { handlers: { POST: handle } },
})
