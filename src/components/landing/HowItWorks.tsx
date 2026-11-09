import type { ReactNode } from 'react'
import arrowRight from '../../assets/landing/arrow-right-20.svg'
import calendar from '../../assets/landing/calendar.svg'
import clock from '../../assets/landing/clock.svg'
import phone from '../../assets/landing/phone.svg'
import pin from '../../assets/landing/pin.svg'
import { BrowserCallDemo } from './BrowserCallDemo'
import { Icon } from './Icon'
import { LineIcon } from './LineIcon'

type FeatureProps = {
  id: string
  eyebrow: string
  title: string
  body: string[]
  /** "Tokie, …" call to action: a link when `href` is given, otherwise it jumps to the hero call box. */
  prompt: string
  href?: string
  onAsk: () => void
  /** Text alternative for a purely illustrative mock-up; leave out when the mock-up is interactive. */
  visualLabel?: string
  /** Put the copy on the left (desktop only). */
  copyFirst?: boolean
  children: ReactNode
}

function Feature({ id, eyebrow, title, body, prompt, href, onAsk, visualLabel, copyFirst, children }: FeatureProps) {
  const promptLabel = <>{prompt} <Icon src={arrowRight} size={20} /></>
  return (
    <article id={id} className={copyFirst ? 'lp-feature lp-feature--copy-first' : 'lp-feature'}>
      <div className="lp-feature-visual" role={visualLabel ? 'img' : undefined} aria-label={visualLabel}>
        {children}
      </div>
      <div className="lp-feature-copy lp-reveal">
        <p className="lp-eyebrow">{eyebrow}</p>
        <h2 className="lp-h2">{title}</h2>
        {body.map((paragraph) => <p key={paragraph} className="lp-body">{paragraph}</p>)}
        {href
          ? <a className="lp-prompt" href={href}>{promptLabel}</a>
          : <button type="button" className="lp-prompt" onClick={onAsk}>{promptLabel}</button>}
      </div>
    </article>
  )
}

function LiveCallMock() {
  return (
    <div className="lp-card lp-chat">
      <div className="lp-chat-head">
        <div>
          <p className="lp-title-sm">Hanbit Dermatology</p>
          <p className="lp-meta">AI receptionist · <span lang="ja">日本語</span></p>
        </div>
        <span className="lp-status lp-status--live">On call 0:42</span>
      </div>
      <div className="lp-bubble lp-pop">
        <p lang="ja">金曜日の午後にボトックスの予約をしたいです。</p>
        <p>I'd like to book Botox on Friday afternoon.</p>
      </div>
      <div className="lp-bubble lp-bubble--agent lp-pop lp-pop--2">
        <p lang="ja">金曜日は15時と17時が空いています。</p>
        <p>Friday has 3 PM and 5 PM open.</p>
      </div>
      <div className="lp-bubble lp-pop lp-pop--3">
        <p lang="ja">15時でお願いします。</p>
        <p>3 PM, please.</p>
      </div>
    </div>
  )
}

function ConfirmationMock() {
  return (
    <div className="lp-stack">
      <div className="lp-card lp-request">
        <div>
          <p className="lp-meta">Your request</p>
          <p className="lp-title-sm">Botox · Fri, Nov 20 · 3:00 PM</p>
        </div>
        {/* The status flips from pending to confirmed and back on a loop. */}
        <div className="lp-swap">
          <span className="lp-status lp-status--pending">Pending</span>
          <span className="lp-badge lp-badge--teal"><LineIcon name="check" size={14} /> Confirmed</span>
        </div>
      </div>
      <div className="lp-card lp-message lp-pop">
        <p className="lp-meta">Message from Mirae Plastic Surgery</p>
        <p className="lp-message-text" lang="zh-Hans">预约已确认：11月20日 15:00，Mirae Plastic Surgery</p>
        <p className="lp-message-sub">Booking confirmed: Fri, Nov 20 · 3:00 PM</p>
        <span className="lp-tag"><Icon src={calendar} size={14} /> Add to calendar</span>
      </div>
    </div>
  )
}

function VisitDayMock() {
  return (
    <div className="lp-day">
      <div className="lp-card lp-day-card lp-pop">
        <p className="lp-meta lp-day-label"><Icon src={pin} size={16} /> Address for taxi</p>
        <p className="lp-day-address" lang="ko">서울특별시 강남구 압구정로 [N]</p>
        <p className="lp-message-sub" lang="ko">미래성형외과 3층</p>
      </div>
      <div className="lp-card lp-day-card lp-day-card--inset lp-pop lp-pop--2">
        <p className="lp-meta lp-day-label"><Icon src={clock} size={16} /> Open today</p>
        <p className="lp-day-value">10 AM to 7 PM</p>
      </div>
      <div className="lp-card lp-day-card lp-pop lp-pop--3">
        <p className="lp-meta lp-day-label"><Icon src={phone} size={16} /> Call again</p>
        <p className="lp-mono lp-day-phone">+82 2 6080 1120</p>
      </div>
    </div>
  )
}

export function HowItWorks({ onAsk }: { onAsk: () => void }) {
  return (
    <section id="how-it-works" className="lp-features" aria-label="How it works">
      <div className="lp-container">
        <Feature
          id="call-in-your-language"
          eyebrow="Call in your language"
          title="Just talk. In Japanese, Chinese, or Thai."
          body={["Call the clinic's Tokie number and speak naturally. The AI receptionist answers in your language and books your visit."]}
          prompt="Tokie, book Botox for Friday"
          onAsk={onAsk}
          visualLabel="Live call with Hanbit Dermatology's AI receptionist in Japanese: the caller asks for Botox on Friday afternoon, is offered 3 PM or 5 PM, and picks 3 PM."
        >
          <LiveCallMock />
        </Feature>

        <Feature
          id="free-browser-call"
          eyebrow="Free browser call"
          title="No Korean number? Call from your browser."
          body={[
            "Tap Call for free and talk through your phone's browser. Works on hotel Wi-Fi, no SIM or app needed.",
            'You speak English. They hear Korean. Tokie translates both ways, live.',
          ]}
          prompt="Tokie, call a place for free"
          onAsk={onAsk}
          copyFirst
        >
          <BrowserCallDemo />
        </Feature>

        <Feature
          id="instant-confirmation"
          eyebrow="Instant confirmation"
          title="The clinic confirms. You get it in your language."
          body={['Your request is summarized for the clinic. Once they confirm, you get a message in your language with the time, address, and what to bring.']}
          prompt="Tokie, show a sample confirmation"
          onAsk={onAsk}
          visualLabel="A Botox request for Friday, November 20 at 3:00 PM going from pending to confirmed, followed by a confirmation message from Mirae Plastic Surgery in Chinese with an add-to-calendar option."
        >
          <ConfirmationMock />
        </Feature>

        <Feature
          id="on-the-day"
          eyebrow="On the day"
          title="Find the clinic. Show the driver. Walk in."
          body={["Every booking comes with the address in Korean for taxis, opening hours, and the clinic's number in one card."]}
          prompt="Tokie, find clinics near me"
          href="#clinics"
          onAsk={onAsk}
          visualLabel="Booking card with the clinic's address in Korean for taxis, today's opening hours of 10 AM to 7 PM, and the clinic's phone number."
          copyFirst
        >
          <VisitDayMock />
        </Feature>
      </div>
    </section>
  )
}
