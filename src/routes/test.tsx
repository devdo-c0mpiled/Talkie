import { createFileRoute } from '@tanstack/react-router'
import chatCss from '../chat.css?url'
import { TokieChat } from '../components/chat/TokieChat'
import { scenarioIds } from '../lib/hotel-workflow'

export const Route = createFileRoute('/test')({
  validateSearch: (search:Record<string,unknown>): {scenario?:string} => ({
    scenario: typeof search.scenario==='string' && (scenarioIds as readonly string[]).includes(search.scenario) ? search.scenario : 'booking',
  }),
  head: () => ({
    meta: [
      { title: 'Chat with Tokie' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
    links: [{ rel: 'stylesheet', href: chatCss }],
  }),
  component: HotelTestPage,
})
function HotelTestPage() {
  const {scenario}=Route.useSearch()
  return <TokieChat key={scenario} hotelWorkflow hotelScenario={scenario} />
}
