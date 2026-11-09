import { Link, createFileRoute } from '@tanstack/react-router'
import { BookingDetail } from '../components/dashboard/BookingDetail'
import { findBooking } from '../lib/biz-mock'

export const Route = createFileRoute('/biz/dashboard/$bookingId')({
  head: ({ params }) => ({ meta: [{ title: `Booking ${params.bookingId} · Tokie` }] }),
  component: BookingPage,
})

function BookingPage() {
  const { bookingId } = Route.useParams()
  const booking = findBooking(bookingId)

  if (!booking) {
    return (
      <div className="dash-body">
        <main className="dash-main dash-missing">
          <h1 className="dash-title">Booking not found</h1>
          <Link to="/biz/dashboard" className="lp-btn lp-btn-teal dash-btn">Back to bookings</Link>
        </main>
      </div>
    )
  }

  // key resets confirm/reschedule/playback state when moving between bookings.
  return <BookingDetail key={booking.id} b={booking} />
}
