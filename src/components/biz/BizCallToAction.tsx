import { useState } from 'react'
import type { SubmitEvent } from 'react'
import tokie from '../../assets/landing/tokie.webp'
import { LineIcon } from '../landing/LineIcon'

const words = [
  { lang: 'ja', text: '予約' },
  { lang: 'zh', text: '预约' },
  { lang: 'th', text: 'จอง' },
  { lang: 'en', text: 'Booking' },
]

export function BizCallToAction() {
  // Mock only: nothing is sent anywhere yet.
  const [booked, setBooked] = useState(false)

  function book(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    setBooked(true)
  }

  return (
    <section id="book-demo" className="lp-cta">
      <div className="lp-container">
        <div className="lp-cta-card lp-reveal biz-cta-card">
          <div className="lp-cta-words biz-cta-words" aria-hidden="true">
            {[...words, ...words].map(({ lang, text }, index) => <span key={index} lang={lang}>{text}</span>)}
          </div>
          <h2>Your guests call. Tokie answers.</h2>
          <p className="biz-cta-lead">See it with your own hours and menu in a short call.</p>
          {booked ? (
            <p className="biz-cta-done" role="status"><LineIcon name="check" />Thanks. We'll email you a time.</p>
          ) : (
            <form className="biz-cta-form" onSubmit={book}>
              <label htmlFor="biz-email" className="lp-sr-only">Work email</label>
              <input id="biz-email" type="email" required placeholder="you@business.com" autoComplete="email" />
              <button type="submit" className="lp-cta-btn">Book a demo</button>
            </form>
          )}
          <span className="lp-cta-tokie"><img className="lp-tokie-img" src={tokie} alt="Tokie the bunny" width={688} height={900} /></span>
        </div>
      </div>
    </section>
  )
}
