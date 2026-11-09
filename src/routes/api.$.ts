import { createFileRoute } from '@tanstack/react-router'
import { env } from 'cloudflare:workers'
import { handleApi } from '../../server/api.mjs'
export const Route = createFileRoute('/api/$')({
 server: { handlers: {
 GET: ({ request }) => handleApi(request, env),
 POST: ({ request }) => handleApi(request, env),
 } },
})
