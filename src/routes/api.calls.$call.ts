import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/calls/$call')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { handleCallStatus } = await import('../lib/clawops.server')
        return handleCallStatus(params.call)
      },
    },
  },
})
