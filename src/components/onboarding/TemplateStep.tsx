import { useState } from 'react'
import { LineIcon } from '../landing/LineIcon'
import { OnboardingShell } from './OnboardingShell'

// Placeholder templates from the design; step counts are illustrative.
const templates = [
  { name: 'Hotel front desk', desc: 'Room bookings, stay changes, directions', meta: '7 steps · Most popular', icon: 'bell' },
  { name: 'Boutique guesthouse', desc: 'Smaller property, simple booking flow', meta: '6 steps', icon: 'calendar' },
  { name: 'Resort & spa', desc: 'Room bookings plus spa and dining requests', meta: '6 steps', icon: 'sparkle' },
  { name: 'Start from scratch', desc: 'Describe what you need and build as you go', meta: '2 steps', icon: 'plus' },
] as const

export function TemplateStep() {
  const [picked, setPicked] = useState(0)

  return (
    <OnboardingShell
      step={2}
      title="What should your AI receptionist handle?"
      sub="Pick a template to get a ready-made flow. You can change it anytime."
      note={<>Selected: <b>{templates[picked].name}</b></>}
      back="/biz/onboarding/number"
      next="/biz/onboarding/builder"
      nextLabel="Next"
    >
      <div className="ob-tpl-grid" role="radiogroup" aria-label="Agent templates">
        {templates.map((t, i) => (
          <button key={t.name} type="button" role="radio" className="ob-tpl" aria-checked={i === picked} onClick={() => setPicked(i)}>
            <span className="ob-tpl-ic"><LineIcon name={t.icon} size={22} /></span>
            <span className="ob-tpl-name">{t.name}</span>
            <span className="ob-tpl-desc">{t.desc}</span>
            <span className="ob-tpl-meta">{t.meta}</span>
            {i === picked && <span className="ob-tpl-badge"><LineIcon name="check" size={14} /></span>}
          </button>
        ))}
      </div>

      <section className="ob-card ob-stack">
        <label className="ob-label" htmlFor="tpl-describe">Or describe it in your own words</label>
        <textarea id="tpl-describe" className="ob-input ob-textarea" rows={3} placeholder="e.g. Answer reservation calls from English-speaking guests and confirm room type and dates" />
        {/* Demo only: there is no AI generation behind this button. */}
        <button type="button" className="ob-btn-sec ob-btn-block"><LineIcon name="sparkle" size={18} /> Generate with AI</button>
      </section>
    </OnboardingShell>
  )
}
