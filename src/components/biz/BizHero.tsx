import { Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import tokie from '../../assets/landing/tokie.webp'
import { LineIcon } from '../landing/LineIcon'
import { usePrefersReducedMotion } from '../landing/usePrefersReducedMotion'

// Each business type comes with the sample description typed into the empty box.
// Placeholder data from the design; names and numbers are fictional.
const businesses = [
  { word: 'clinic', sample: 'Botox consult is 30 minutes, closed Sundays.', chip: 'Add treatment menu', menuLabel: 'Treatment menu added', menuBody: 'Botox consult (30 min), Laser toning, Skin booster.', name: 'Hanbit Dermatology' },
  { word: 'restaurant', sample: 'Tables for up to 6, last order 9:30 PM.', chip: 'Add the menu', menuLabel: 'Menu added', menuBody: 'Korean BBQ sets and vegetarian bibimbap. Last order 9:30 PM.', name: 'Oneul Kitchen' },
  { word: 'salon', sample: 'Cut and color take 2 hours, ask stylist preference.', chip: 'Add services', menuLabel: 'Services added', menuBody: 'Cut, color, and perm. Cut and color take 2 hours.', name: 'Dalbit Beauty Lounge' },
  { word: 'hotel', sample: 'Check-in from 3 PM, airport pickup on request.', chip: 'Add room types', menuLabel: 'Rooms added', menuBody: 'Standard and twin rooms. Airport pickup on request.', name: 'Saebom Hotel' },
  { word: 'spa', sample: '60 and 90 minute courses, couples rooms on weekends.', chip: 'Add courses', menuLabel: 'Courses added', menuBody: '60 and 90 minute massages. Couples rooms on weekends.', name: 'Dalbit Spa' },
]

// Which result card is showing: a quick-setup chip (0 to 2) or the built receptionist.
type Ready = 0 | 1 | 2 | 'built' | null

export function BizHero() {
  const reducedMotion = usePrefersReducedMotion()
  const [index, setIndex] = useState(0)
  const [typed, setTyped] = useState(0)
  const [ready, setReady] = useState<Ready>(null)
  const [text, setText] = useState('')
  // Business types rotate on their own until the visitor interacts.
  const rotating = ready === null

  const business = businesses[index]
  const typedCount = reducedMotion ? business.sample.length : typed

  useEffect(() => {
    if (reducedMotion) return
    if (typed < business.sample.length) {
      const timer = setTimeout(() => setTyped(typed + 1), 45)
      return () => clearTimeout(timer)
    }
    if (!rotating) return
    const timer = setTimeout(() => {
      setIndex((index + 1) % businesses.length)
      setTyped(0)
    }, 1600)
    return () => clearTimeout(timer)
  }, [reducedMotion, typed, business, rotating, index])

  const chips = ['Set opening hours', business.chip, 'Pick languages']

  return (
    <section className="biz-hero">
      <div className="biz-hero-inner">
        <p className="lp-badge biz-badge">For local businesses in Korea</p>
        <h1 aria-label="What should your business say to international guests?">
          What should your <span className="lp-hero-word biz-word" aria-hidden="true"><b key={index}>{business.word}</b></span> say to international guests?
        </h1>
        <p className="lp-hero-lead">Tokie gives your business a multilingual AI phone receptionist. Take bookings in Japanese, Chinese, and Thai. No code.</p>

        <div className="lp-callbox biz-callbox">
          <div className="lp-tokie-hero">
            <p className="lp-tokie-bubble">Hi! I'll answer in their language.</p>
            <div className="lp-tokie-pic">
              <img className="lp-tokie-img" src={tokie} alt="Tokie the bunny" width={688} height={900} />
              <div className="lp-tokie-floor" />
            </div>
          </div>
          <div className="biz-prompt">
            <div className="biz-prompt-field">
              <label className="lp-sr-only" htmlFor="biz-describe">Describe your business for your receptionist</label>
              <textarea id="biz-describe" rows={3} placeholder=" " value={text} onChange={(event) => setText(event.target.value)} />
              <div className="biz-prompt-sample" aria-hidden="true">{business.sample.slice(0, typedCount)}<i className="lp-caret" /></div>
            </div>
            <div className="biz-prompt-foot">
              <span className="lp-meta">Plain words are fine.</span>
              <button type="button" className="lp-btn lp-btn-teal biz-pill-btn" onClick={() => setReady('built')}>Build my receptionist</button>
            </div>
          </div>
        </div>

        <div className="biz-chips" role="group" aria-label="Quick setup">
          {chips.map((label, chip) => (
            <button key={chip} type="button" className="lp-chip" aria-pressed={ready === chip} onClick={() => setReady(chip as Ready)}>{label}</button>
          ))}
        </div>

        <div className="biz-result" aria-live="polite">
          {ready === null ? (
            <ul className="biz-chips">
              <li className="lp-tag">No code</li>
              <li className="lp-tag">Your own number</li>
              <li className="lp-tag">3 languages</li>
            </ul>
          ) : (
            <div key={String(ready)} className="lp-card biz-result-card">
              <span className="lp-badge lp-badge--teal"><LineIcon name="check" size={14} />Receptionist ready</span>
              {ready === 0 && <><p className="lp-title-sm">Opening hours saved</p><p className="lp-body">Mon to Sat, 10 AM to 7 PM. Closed Sundays. After-hours calls become requests for the next open day.</p></>}
              {ready === 1 && <><p className="lp-title-sm">{business.menuLabel}</p><p className="lp-body">{business.menuBody}</p></>}
              {ready === 2 && <><p className="lp-title-sm">Languages on</p><p className="lp-body"><span lang="ja">日本語</span> · <span lang="zh">中文</span> · <span lang="th">ไทย</span> · English</p></>}
              {ready === 'built' && (
                <>
                  <p className="lp-title-sm">{business.name} receptionist</p>
                  <p className="lp-body">Answers in Japanese, Chinese, and Thai. Next, pick your number. <Link to="/biz/onboarding/number" className="biz-link">Continue setup</Link></p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
