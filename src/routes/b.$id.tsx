import { createFileRoute } from '@tanstack/react-router'
import bookingCss from '../booking.css?url'
import { BookingPage } from '../components/booking/BookingPage'
import { getCallResultPage } from '../lib/call-result.functions'

export const Route = createFileRoute('/b/$id')({
  loader: ({ params }) => getCallResultPage({ data: params.id }),
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.business} — Tokie` : 'Tokie' },
      // The address is the only key to the page, so keep it out of search engines.
      { name: 'robots', content: 'noindex' },
    ],
    links: [{ rel: 'stylesheet', href: bookingCss }],
  }),
  component: () => <BookingPage result={Route.useLoaderData()} />,
})
