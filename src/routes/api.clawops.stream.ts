import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/clawops/stream')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleClawOpsStream } = await import('../lib/clawops-routes.server')
        return handleClawOpsStream(request)
      },
    },
  },
})
