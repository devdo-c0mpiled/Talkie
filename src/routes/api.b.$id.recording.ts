import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/b/$id/recording')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { handleRecording } = await import('../lib/call-result.server')
        return handleRecording(request, params.id)
      },
    },
  },
})
