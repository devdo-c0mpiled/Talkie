import type { RefObject, SubmitEvent } from 'react'
import globe from '../../assets/landing/globe.svg'
import search from '../../assets/landing/search.svg'
import { Icon } from './Icon'

const suggestions = ['Book a skin clinic', 'Find a Japanese-speaking line', 'Call for free from my browser']

type HeroProps = {
  query: string
  onQueryChange: (query: string) => void
  inputRef: RefObject<HTMLInputElement | null>
}

export function Hero({ query, onQueryChange, inputRef }: HeroProps) {
  function findClinic(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    document.getElementById('clinics')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section className="lp-hero">
      <div className="lp-hero-inner">
        <p className="lp-badge"><Icon src={globe} size={14} /> For travelers in Korea</p>
        <h1>Which clinic should I call for you?</h1>
        <p className="lp-hero-lead">Tokie lets you call Korean clinics in your own language. No Korean number, no Korean needed.</p>

        <form className="lp-search" role="search" onSubmit={findClinic}>
          <Icon src={search} size={20} />
          <input
            ref={inputRef}
            type="search"
            name="q"
            aria-label="Tell Tokie which clinic to call"
            autoComplete="off"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          <span className="lp-wave lp-wave--sm" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></span>
          <button type="submit" className="lp-btn lp-btn-teal">Find a clinic</button>
        </form>

        <ul className="lp-chips" aria-label="Suggestions">
          {suggestions.map((suggestion) => (
            <li key={suggestion}>
              <button type="button" className="lp-chip" onClick={() => onQueryChange(suggestion)}>{suggestion}</button>
            </li>
          ))}
        </ul>

        <ul className="lp-stats">
          <li><strong>日本語 · 中文 · ไทย</strong><span>Japanese, Chinese, and Thai</span></li>
          <li><strong>[N] clinics</strong><span>Ready to take your call</span></li>
        </ul>
      </div>
    </section>
  )
}
