import { createFileRoute } from '@tanstack/react-router'

async function handleChat({ request }: { request: Request }) {
  const { handleChat } = await import('../lib/chat.server')
  return handleChat(request)
}

export const Route = createFileRoute('/api/chat')({
  server: { handlers: { POST: handleChat } },
})
