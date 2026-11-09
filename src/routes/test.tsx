import { createFileRoute } from '@tanstack/react-router'
import chatCss from '../chat.css?url'
import { TokieChat } from '../components/chat/TokieChat'

export const Route = createFileRoute('/test')({
  head: () => ({
    meta: [
      { title: 'Talkie · 호텔 대본 테스트' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
    links: [{ rel: 'stylesheet', href: chatCss }],
  }),
  component: () => <TokieChat hotelHarness />,
})
