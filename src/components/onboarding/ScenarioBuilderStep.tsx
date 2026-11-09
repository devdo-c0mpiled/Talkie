import { useState } from 'react'
import { LineIcon } from '../landing/LineIcon'
import { OnboardingShell } from './OnboardingShell'

// Placeholder flow from the design's Hotel front desk template; the hotel and number are fictional.
const paths = [
  { tag: 'FAQ', tone: 'line', text: 'Check-in time, parking, directions' },
  { tag: 'Booking', tone: 'teal', text: 'Check availability and book' },
  { tag: 'Handoffs', tone: 'amber', text: 'Price confirmations, complaints' },
]

const blocks = ['Answer call', 'Detect language', 'AI response', 'Route by intent', 'Create booking', 'Staff handoff', 'End call']

function Node({ icon, label, caption, chip, suggested }: { icon: Parameters<typeof LineIcon>[0]['name']; label: string; caption: string; chip?: string; suggested?: boolean }) {
  return (
    <li className="ob-node" data-suggested={suggested ? '' : undefined}>
      <span className="ob-ic-tile"><LineIcon name={icon} size={18} /></span>
      <span className="ob-node-text">
        <span className="ob-label">{label}</span>
        <span className="ob-caption">{caption}</span>
      </span>
      {chip && <span className={`ob-chip ${suggested ? 'ob-chip--line' : 'ob-chip--teal'}`}>{chip}</span>}
    </li>
  )
}

export function ScenarioBuilderStep() {
  const [suggestion, setSuggestion] = useState<'pending' | 'applied' | 'dismissed'>('pending')
  const [added, setAdded] = useState<string[]>([])

  return (
    <OnboardingShell
      step={3}
      title="Seoul Breeze Booking Agent"
      note={<><span className="ob-saved-dot" />Draft · Saved</>}
      back="/biz/onboarding/template"
      next="/biz/onboarding/schedule"
      nextLabel="Next"
    >
      <ol className="ob-flow" aria-label="Agent flow">
        <Node icon="phone" label="Answer call" caption="+82 2 6080 1120" />
        <Node icon="globe" label="Detect language" caption="日本語 · 中文 · ไทย · English" />
        <Node icon="chat" label="Greeting" caption={'"Hi, this is Seoul Breeze Hotel" in the caller\'s language'} />
        {suggestion === 'applied' && <Node icon="list" label="Collect booking details" caption="Asks for: name, dates, room type, contact" chip="New" />}
        {suggestion === 'pending' && <Node icon="sparkle" label="Collect booking details" caption="Suggested by AI Builder" chip="Review" suggested />}
        <Node icon="branch" label="Route by intent" caption="Listens and picks the right path" />
        <li className="ob-branches">
          {paths.map((p) => (
            <div key={p.tag} className="ob-branch">
              <span className={`ob-chip ob-chip--${p.tone}`}>{p.tag}</span>
              <span className="ob-label">{p.text}</span>
            </div>
          ))}
        </li>
        {added.map((name, i) => <Node key={i} icon="plus" label={name} caption="Added just now · Tap to set up" chip="New" />)}
      </ol>

      <div className="ob-inset ob-row">
        <span className="ob-check"><LineIcon name="shield" size={20} /></span>
        <div>
          <p className="ob-label">Guardrails</p>
          <p className="ob-caption">Price confirmations, availability changes, or cancellations always go to staff.</p>
        </div>
      </div>

      <details className="ob-card ob-details">
        <summary><LineIcon name="plus" size={18} /> Add a block</summary>
        <p className="ob-caption">Tap one to add it to the end of your flow.</p>
        <div className="ob-palette">
          {blocks.map((b) => <button key={b} type="button" className="ob-chip ob-chip--line ob-chip--btn" onClick={() => setAdded([...added, b])}>{b}</button>)}
        </div>
      </details>

      {/* The design opens this in a bottom sheet; the demo keeps it inline with a canned reply. */}
      <section className="ob-card ob-stack" aria-labelledby="ai-builder">
        <h2 id="ai-builder" className="ob-card-title"><span className="ob-saved-dot" />AI Builder</h2>
        <p className="ob-bubble-me">When someone asks to book, get their name, dates and room type.</p>
        <p className="ob-body">Got it. I'll add <b>Collect booking details</b> right after the greeting. Should I also ask for contact info so we can send a confirmation?</p>
        <div className="ob-inset ob-stack ob-stack--tight" aria-live="polite">
          <p className="ob-label">Proposed changes</p>
          <p className="ob-row"><span className="ob-chip ob-chip--teal">Add</span>Collect booking details</p>
          <p className="ob-caption">Asks for: name, dates, room type, contact</p>
          <p className="ob-row"><span className="ob-chip ob-chip--soft">Link</span>Greeting → Collect details → Route</p>
          {suggestion === 'pending' ? (
            <div className="ob-bar-row">
              <button type="button" className="lp-btn lp-btn-teal ob-btn" onClick={() => setSuggestion('applied')}>Apply</button>
              <button type="button" className="ob-btn-sec" onClick={() => setSuggestion('dismissed')}>Dismiss</button>
            </div>
          ) : (
            <p className="ob-row">
              <span className="ob-label">{suggestion === 'applied' ? 'Applied' : 'Dismissed'}</span>
              <button type="button" className="ob-link" onClick={() => setSuggestion('pending')}>{suggestion === 'applied' ? 'Undo' : 'Show again'}</button>
            </p>
          )}
        </div>
        <div className="ob-chips">
          <span className="ob-chip ob-chip--line">After hours, take a message instead</span>
          <span className="ob-chip ob-chip--line">Transfer if they ask for an interpreter</span>
        </div>
      </section>
    </OnboardingShell>
  )
}
