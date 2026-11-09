import { useState } from 'react'
import { LineIcon } from '../landing/LineIcon'
import { OnboardingShell } from './OnboardingShell'

// Placeholder data from the design; every number is fictional.
const regions = [
  { label: 'Seoul 02', numbers: ['+82 2 6080 1120', '+82 2 6080 1388', '+82 2 6080 1754', '+82 2 6080 2045'] },
  { label: 'Toll-free 080', numbers: ['+82 80 822 1120', '+82 80 822 1388', '+82 80 822 1754', '+82 80 822 2045'] },
  { label: 'Mobile 070', numbers: ['+82 70 4080 1120', '+82 70 4080 1388', '+82 70 4080 1754', '+82 70 4080 2045'] },
]

const languages = ['Japanese', 'Chinese', 'Thai', 'English']

export function NumberStep() {
  const [region, setRegion] = useState(0)
  const [picked, setPicked] = useState(0)
  const numbers = regions[region].numbers

  return (
    <OnboardingShell
      step={1}
      title="Pick your business phone number"
      sub="International callers dial this number or tap your web call link. No Korean SIM needed."
      note="You can change this later in Settings."
      next="/biz/onboarding/template"
      nextLabel="Claim this number"
    >
      <div className="ob-split">
        <div className="ob-stack">
          <div className="ob-seg" role="radiogroup" aria-label="Number type">
            {regions.map((r, i) => (
              <button key={r.label} type="button" role="radio" aria-checked={i === region} onClick={() => { setRegion(i); setPicked(0) }}>{r.label}</button>
            ))}
          </div>

          <div className="ob-stack ob-stack--tight" role="radiogroup" aria-label="Available numbers">
            {numbers.map((num, i) => (
              <button key={num} type="button" role="radio" className="ob-opt" aria-checked={i === picked} onClick={() => setPicked(i)}>
                <span className="ob-radio" aria-hidden="true" />
                <span className="ob-mono ob-opt-num">{num}</span>
                {i === 0 && <span className="ob-chip ob-chip--teal">Easy to remember</span>}
              </button>
            ))}
          </div>
        </div>

        <section className="ob-card ob-stack" aria-label="Number preview">
          <p className="lp-eyebrow">What callers will see</p>
          <p className="ob-mono ob-big-num" aria-live="polite">{numbers[picked]}</p>
          <div className="ob-inset ob-row">
            <span className="ob-ic-tile"><LineIcon name="link" size={18} /></span>
            <div>
              <p className="ob-caption">Web call link</p>
              <p className="ob-mono">tokie.app/c/seoulbreeze</p>
            </div>
          </div>
          <div className="ob-stack ob-stack--tight">
            <p className="ob-label">Answers in</p>
            <div className="ob-chips">
              {languages.map((l) => <span key={l} className="ob-chip ob-chip--soft">{l}</span>)}
            </div>
          </div>
          <hr className="ob-hr" />
          <p className="ob-row ob-muted-text"><span className="ob-check"><LineIcon name="check" size={18} /></span>Free during trial</p>
        </section>
      </div>
    </OnboardingShell>
  )
}
