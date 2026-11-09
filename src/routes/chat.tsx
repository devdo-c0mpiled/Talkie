import { createFileRoute } from '@tanstack/react-router'
import chatCss from '../chat.css?url'
import { TokieChat } from '../components/chat/TokieChat'

export const Route = createFileRoute('/chat')({
  head: () => ({
    meta: [
      { title: 'Chat with Tokie — Get a Korean number' },
      { name: 'description', content: 'Tokie gives you a Korean number, answers the calls in Korean, and tells you everything in your language.' },
    ],
    links: [{ rel: 'stylesheet', href: chatCss }],
  }),
  component: TokieChat,
})
