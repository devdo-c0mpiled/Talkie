import { Link } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import logoPhone from '../../assets/landing/logo-phone.svg'
import onboardingCss from '../../onboarding.css?url'
import { Icon } from '../landing/Icon'
import { LineIcon } from '../landing/LineIcon'

const onboardingFonts = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@500;700;800&display=swap'

/** Shared `head()` for the wizard routes; same fonts and stylesheet as `/signup`. */
export function wizardHead(title: string) {
  return {
    meta: [{ title: `${title} · Tokie` }],
    links: [
      { rel: 'stylesheet', href: onboardingFonts },
      { rel: 'stylesheet', href: onboardingCss },
    ],
  }
}

// The biz demo skips account creation entirely; "Go live" is the finish screen and sits outside the 5-dot progress bar.
const steps = ['Phone number', 'Template', 'Agent flow', 'Availability', 'Intake fields', 'Go live']
const TOTAL_STEPS = 5

type ShellProps = {
  /** 1 to 5 for the progress steps, 6 for the finish screen. */
  step: number
  title: string
  sub?: string
  /** Small line above the action buttons. */
  note?: ReactNode
  back?: LinkProps['to']
  next?: LinkProps['to']
  nextLabel?: string
  /** Replaces the default Continue link. */
  actions?: ReactNode
  children: ReactNode
}

/** Wizard layout: dark progress sidebar, step header, content and a sticky action bar. */
export function OnboardingShell({ step, title, sub, note, back, next, nextLabel = 'Continue', actions, children }: ShellProps) {
  return (
    <div className="lp ob ob--wiz">
      <aside className="ob-side">
        <Link to="/" className="lp-logo" aria-label="Tokie home">
          <span className="lp-logo-mark"><Icon src={logoPhone} size={16} /></span>
          Tokie
        </Link>

        <div className="ob-side-body">
          <h2 className="ob-side-title">Set up your booking agent</h2>
          <ol className="ob-steps">
            {steps.map((name, index) => {
              const n = index + 1
              const state = n < step ? 'done' : n === step ? 'current' : undefined
              return (
                <li key={name} data-state={state} aria-current={n === step ? 'step' : undefined}>
                  <span className="ob-steps-dot">{n < step ? <LineIcon name="check" size={14} /> : n}</span>
                  {name}
                </li>
              )
            })}
          </ol>
        </div>

        <p className="ob-side-foot">Seoul Breeze Hotel · Draft</p>
      </aside>

      <main className="ob-main">
        <div className="ob-wiz">
          <div className="ob-head">
            <div className="ob-progress" aria-hidden="true">
              {Array.from({ length: TOTAL_STEPS }, (_, index) => (
                <i key={index} data-done={index < step ? '' : undefined} />
              ))}
            </div>
            <p className="ob-step">{step <= TOTAL_STEPS ? `Step ${step} of ${TOTAL_STEPS} · ${steps[step - 1]}` : steps[step - 1]}</p>
            <h1>{title}</h1>
            {sub && <p className="ob-sub">{sub}</p>}
          </div>

          {children}

          <div className="ob-bar">
            {note && <p className="ob-bar-note" aria-live="polite">{note}</p>}
            <div className="ob-bar-row">
              {back && <Link to={back} className="ob-btn-sec">Back</Link>}
              {actions ?? (next && <Link to={next} className="lp-btn lp-btn-teal ob-btn">{nextLabel}</Link>)}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
