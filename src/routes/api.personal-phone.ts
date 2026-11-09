import { createFileRoute } from '@tanstack/react-router'

async function handle({ request }: { request: Request }) {
  const { handlePersonalPhone } = await import('../lib/personal-phone.server')
  return handlePersonalPhone(request)
}

export const Route = createFileRoute('/api/personal-phone')({
  server: { handlers: { GET: handle, POST: handle } },
})
