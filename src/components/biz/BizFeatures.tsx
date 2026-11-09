import { useRef, useState } from 'react'
import { LineIcon } from '../landing/LineIcon'

// Placeholder data from the design; names and numbers are fictional.
const NUMBER = '+82 2 6080 1120'

const features = [
  { id: 'fb1', title: 'Describe your business', body: 'Type your hours, menu, and rules in plain words. Tokie turns them into a receptionist that speaks three languages.', mock: <DraftMock /> },
  { id: 'fb2', title: 'Your own number', body: 'Put it on your website, Instagram, and map listing. Guests without a Korean SIM can call free from a link.', mock: <NumberMock /> },
  { id: 'fb3', title: 'Every call as a summary', body: 'See who called, what they want, and when, translated for your team. Confirm in one tap.', mock: <InboxMock /> },
  { id: 'fb4', title: 'Confirm in their language', body: 'When you confirm, Tokie sends the guest the time, address, and directions in their language.', mock: <ConfirmMock /> },
]

export function BizFeatures() {
  const track = useRef<HTMLDivElement>(null)
  const [slide, setSlide] = useState(0)

  // Phones show the cards as a swipe carousel; the dots follow the scroll position.
  function onScroll() {
    const el = track.current
    const card = el?.firstElementChild as HTMLElement | null
    if (!el || !card) return
    setSlide(Math.round(el.scrollLeft / (card.offsetWidth + 12)))
  }

  return (
    <section id="features" className="biz-features">
      <div className="lp-container">
        <h2 className="lp-h2 lp-reveal">Your front desk, in every language</h2>
        <div ref={track} className="biz-car" onScroll={onScroll}>
          {features.map(({ id, title, body, mock }) => (
            <article key={id} id={id} className="lp-card biz-feature">
              <div className="biz-mock">{mock}</div>
              <h3 className="biz-h3">{title}</h3>
              <p className="lp-body">{body}</p>
            </article>
          ))}
        </div>
        <nav className="biz-dots" aria-label="Slides">
          {features.map(({ id }, index) => (
            <a key={id} href={`#${id}`} aria-label={`Slide ${index + 1}`} aria-current={index === slide || undefined}><i /></a>
          ))}
        </nav>
      </div>
    </section>
  )
}

function Toggle({ label, lang }: { label: string; lang: string }) {
  return <span className="biz-toggle" lang={lang}>{label}<i /></span>
}

function DraftMock() {
  return (
    <div className="biz-mini" aria-hidden="true">
      <div className="biz-mini-head"><p className="lp-title-sm">Hanbit Dermatology</p><span className="lp-badge biz-badge-sm">Draft</span></div>
      <div className="biz-toggles"><Toggle label="日本語" lang="ja" /><Toggle label="中文" lang="zh" /><Toggle label="ไทย" lang="th" /></div>
      <div className="biz-inset"><span className="lp-meta">Hours</span><span>Mon to Sat, 10 AM to 7 PM</span></div>
      <div className="biz-inset"><span className="lp-meta">Rules</span><span>Always ask if it's their first visit.<i className="lp-caret" /></span></div>
    </div>
  )
}

function NumberMock() {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard?.writeText(NUMBER).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <>
      <div className="biz-mini">
        <p className="lp-meta">Your Tokie number</p>
        <div className="biz-mini-head">
          <span className="biz-number">{NUMBER}</span>
          <button type="button" className="biz-copy" aria-label="Copy phone number" onClick={copy}><LineIcon name="copy" size={16} /></button>
        </div>
        <div className="biz-qr-row" aria-hidden="true">
          <span className="biz-qr">QR</span>
          <span className="lp-meta">Print it for the counter. Guests scan and call for free.</span>
        </div>
      </div>
      <div className="biz-toast-slot" aria-live="polite">
        {copied && <span className="biz-toast"><LineIcon name="check" size={14} />Number copied</span>}
      </div>
    </>
  )
}

function InboxMock() {
  return (
    <div className="biz-mini" aria-hidden="true">
      <div className="biz-mini-head"><p className="lp-title-sm">Booking inbox</p><span className="lp-meta">Today</span></div>
      <div className="biz-inset biz-inset--card">
        <div className="biz-row">
          <span className="lp-swap">
            <span className="lp-status lp-status--pending biz-status">New request</span>
            <span className="lp-status lp-status--live biz-status">Confirmed</span>
          </span>
          <span className="lp-badge biz-badge-sm" lang="ja">日本語</span>
        </div>
        <span className="biz-strong">Botox · Fri, Nov 20 · 3:00 PM</span>
      </div>
      <div className="biz-inset biz-row"><span className="lp-badge biz-badge-sm" lang="zh">中文</span><span>Skin booster · 2 people</span></div>
      <div className="biz-inset biz-row"><span className="lp-badge biz-badge-sm" lang="th">ไทย</span><span>Laser toning · Sat, Nov 14</span></div>
    </div>
  )
}

function ConfirmMock() {
  return (
    <div className="biz-confirm" aria-hidden="true">
      <div className="biz-mini">
        <div className="biz-mini-head"><span className="lp-meta">Your team</span><span className="lp-status lp-status--live biz-status">Confirmed</span></div>
        <span className="biz-strong">Fri, Nov 20 · 3:00 PM · Botox consult</span>
      </div>
      <span className="biz-send"><LineIcon name="arrow-down" size={16} /></span>
      <div className="biz-mini biz-mini--night">
        <span className="lp-meta">Guest's phone</span>
        <span className="biz-strong" lang="th">ยืนยันการจอง</span>
        <span className="lp-meta" lang="th">20 พ.ย. 15:00 · Hanbit Dermatology</span>
      </div>
    </div>
  )
}
