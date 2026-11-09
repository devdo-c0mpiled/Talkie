import { createFileRoute } from '@tanstack/react-router'
import chatCss from '../chat.css?url'
import { TokieChat } from '../components/chat/TokieChat'
import { getHotelWorkflowCapability } from '../lib/hotel-workflow.functions'
import { scenarioIds } from '../lib/hotel-workflow'

export const Route = createFileRoute('/chat')({
  validateSearch: (search:Record<string,unknown>): {scenario?:string} => ({scenario: typeof search.scenario==='string' && (scenarioIds as readonly string[]).includes(search.scenario) ? search.scenario : 'booking'}),
  loader: () => getHotelWorkflowCapability(),
  head: () => ({
    meta: [
      { title: 'Chat with Tokie' },
      { name: 'description', content: 'Chat with Tokie about your hotel request.' },
    ],
    links: [{ rel: 'stylesheet', href: chatCss }],
  }),
  component: ChatPage,
})

function ChatPage() {
  const {enabled}=Route.useLoaderData()
  const {scenario}=Route.useSearch()
  return <TokieChat key={scenario} hotelWorkflow={enabled} hotelScenario={scenario} />
}
