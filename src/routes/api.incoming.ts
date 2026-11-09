import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/incoming')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleIncoming } = await import('../lib/incoming.server')
        return handleIncoming(request)
      },
    },
  },
})
