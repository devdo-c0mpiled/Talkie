import { createFileRoute } from '@tanstack/react-router'

async function handle({ request }: { request: Request }) {
  const { handleSfuControlRoute } = await import('../lib/sfu-control-route.server')
  return handleSfuControlRoute(request)
}

export const Route = createFileRoute('/api/sfu-live')({ server: { handlers: { POST: handle } } })
