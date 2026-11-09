import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/admin/calls')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const [{ env }, { getAdminSession }, { handleAdminCalls }] = await Promise.all([
          import('cloudflare:workers'),
          import('../lib/auth.server'),
          import('../lib/admin-calls.server'),
        ])
        return handleAdminCalls(request, env.DB, getAdminSession)
      },
    },
  },
})
