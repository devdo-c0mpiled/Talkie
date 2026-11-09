import { createFileRoute } from '@tanstack/react-router'

async function handle({ request }: { request: Request }) {
  const { handleAgentSettings } = await import('../lib/agent-settings.server')
  return handleAgentSettings(request)
}

export const Route = createFileRoute('/api/agent-settings')({
  server: { handlers: { GET: handle, POST: handle } },
})
