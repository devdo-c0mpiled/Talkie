import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { RefObject, SubmitEvent } from 'react'
import globe from '../../assets/landing/globe.svg'
import tokie from '../../assets/landing/tokie.webp'
import { CALL_NUMBER_STORAGE_KEY } from '../../lib/chat-tools'
import { Icon } from './Icon'
import { LineIcon } from './LineIcon'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

// Each place type comes with the sample number typed into the empty call box.
// Placeholder data from the design; names and numbers are fictional.
const places = [
  { name: 'Clinic', word: 'clinic', number: '02-6080-1120' },
  { name: 'Restaurant', word: 'restaurant', number: '070-1231-1231' },
  { name: 'Salon', word: 'salon', number: '070-4821-3302' },
  { name: 'Hotel', word: 'hotel', number: '02-3150-7788' },
  { name: 'Spa', word: 'spa', number: '070-5512-0909' },
]

const shortcuts = [
  { name: 'Oneul Kitchen', number: '070-1231-1231' },
  { name: 'Dalbit Hair', number: '070-4821-3302' },
  { name: 'Haneul Pharmacy', number: '02-555-0193' },
]

type HeroProps = {
  number: string
  onNumberChange: (number: string) => void
  inputRef: RefObject<HTMLInputElement | null>
}

export function Hero({ number, onNumberChange, inputRef }: HeroProps) {
  const navigate = useNavigate()
  const reducedMotion = usePrefersReducedMotion()
  const [place, setPlace] = useState(0)
  const [typed, setTyped] = useState(0)
  // Place types rotate on their own until the visitor picks one or a sample number.
  const [rotating, setRotating] = useState(true)

  const sample = places[place].number
  const typedCount = reducedMotion ? sample.length : typed
  const sampleDone = typedCount >= sample.length

  useEffect(() => {
    if (reducedMotion) return
    if (typed < sample.length) {
      const timer = setTimeout(() => setTyped(typed + 1), 70)
      return () => clearTimeout(timer)
    }
    if (!rotating) return
    const timer = setTimeout(() => {
      setPlace((place + 1) % places.length)
      setTyped(0)
    }, 1600)
    return () => clearTimeout(timer)
  }, [reducedMotion, typed, sample, rotating, place])

  function pickPlace(index: number) {
    setRotating(false)
    setPlace(index)
    setTyped(0)
    onNumberChange('')
  }

  function pickShortcut(shortcut: string) {
    setRotating(false)
    onNumberChange(shortcut)
  }

  function call(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!/\d/.test(number)) {
      inputRef.current?.focus()
      return
    }
    // Kept out of the URL; the chat picks it up and offers to call it.
    sessionStorage.setItem(CALL_NUMBER_STORAGE_KEY, number.trim())
    void navigate({ to: '/chat' })
  }

  return (
    <section className="lp-hero">
      <div className="lp-hero-inner">
        <p className="lp-badge"><Icon src={globe} size={14} /> For travelers in Korea</p>
        <h1 aria-label="Which place should I call for you?">
          Which <span className="lp-hero-word" aria-hidden="true"><b key={place}>{places[place].word}</b></span> should I call for you?
        </h1>
        <div className="lp-pick" role="group" aria-label="Choose a place type">
          {places.map(({ name }, index) => (
            <button key={name} type="button" aria-pressed={index === place} onClick={() => pickPlace(index)}>{name}</button>
          ))}
        </div>
        <p className="lp-hero-lead">Tokie calls Korean clinics, restaurants, salons, and hotels for you, in your own language. No Korean number, no Korean needed.</p>

        <div className="lp-callbox">
          <div className="lp-tokie-hero">
            <p className="lp-tokie-bubble">Hi! I'll make the call for you.</p>
            <div className="lp-tokie-pic">
              <img className="lp-tokie-img" src={tokie} alt="Tokie the bunny" width={688} height={900} />
              <div className="lp-tokie-floor" />
            </div>
          </div>
          <form className="lp-call" aria-label="Business phone number" onSubmit={call}>
            <span className="lp-call-cc">KR +82</span>
            <div className="lp-call-field">
              <label className="lp-sr-only" htmlFor="lp-call-number">Business phone number</label>
              <input
                ref={inputRef}
                id="lp-call-number"
                className="lp-call-input"
                type="tel"
                name="number"
                placeholder=" "
                autoComplete="off"
                value={number}
                onChange={(event) => onNumberChange(event.target.value)}
              />
              <div className="lp-call-sample" aria-hidden="true">{sample.slice(0, typedCount)}<i className="lp-caret" /></div>
            </div>
            <button type="submit" className={sampleDone && !number ? 'lp-btn lp-btn-teal lp-call-btn is-ready' : 'lp-btn lp-btn-teal lp-call-btn'}>
              <LineIcon name="phone" /> Call
            </button>
          </form>
          <p className="lp-meta lp-call-note">Use your phone's own dialer. No app, no Korean SIM.</p>
        </div>

        <ul className="lp-chips" aria-label="Sample numbers">
          {shortcuts.map(({ name, number: shortcut }) => (
            <li key={name}>
              <button type="button" className="lp-chip" onClick={() => pickShortcut(shortcut)}>{name} · {shortcut}</button>
            </li>
          ))}
        </ul>

        <ul className="lp-stats">
          <li><strong>日本語 · 中文 · ไทย</strong><span>Japanese, Chinese, and Thai</span></li>
          <li><strong>[N] places</strong><span>Ready to take your call</span></li>
        </ul>
      </div>
    </section>
  )
}
