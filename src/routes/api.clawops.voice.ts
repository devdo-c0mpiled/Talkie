import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/clawops/voice')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleClawOpsVoice } = await import('../lib/clawops-routes.server')
        return handleClawOpsVoice(request)
      },
    },
  },
})
