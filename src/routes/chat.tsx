import { createFileRoute } from '@tanstack/react-router'
import chatCss from '../chat.css?url'
import { TokieChat } from '../components/chat/TokieChat'

export const Route = createFileRoute('/chat')({
  head: () => ({
    meta: [
      { title: 'Chat with Tokie — Book in Korea' },
      { name: 'description', content: 'Chat with Tokie about making bookings in Korea.' },
    ],
    links: [{ rel: 'stylesheet', href: chatCss }],
  }),
  component: TokieChat,
})
