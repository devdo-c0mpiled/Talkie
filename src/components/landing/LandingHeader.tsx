import { Link } from '@tanstack/react-router'
import arrowRight from '../../assets/landing/arrow-right-16.svg'
import caretDown from '../../assets/landing/caret-down.svg'
import chevronDown from '../../assets/landing/chevron-down-16.svg'
import tokie from '../../assets/landing/tokie.webp'
import { Icon } from './Icon'
import { LineIcon } from './LineIcon'

const languages = ['English', '日本語', '简体中文', 'ไทย']

const steps = [
  { href: '#call-in-your-language', icon: 'globe', title: 'Call in your language', detail: 'Speak Japanese, Chinese, or Thai' },
  { href: '#free-browser-call', icon: 'mic', title: 'Free browser call', detail: 'No Korean number needed' },
  { href: '#instant-confirmation', icon: 'check', title: 'Instant confirmation', detail: 'Get the booking in your language' },
] as const

export function LandingHeader() {
  return (
    <header className="lp-header">
      <div className="lp-container lp-header-inner">
        <Link to="/" className="lp-logo" aria-label="Tokie home">
          <span className="lp-tokie-ava" aria-hidden="true"><img src={tokie} alt="" /></span>
          Tokie
        </Link>

        <nav className="lp-nav" aria-label="Main">
          <div className="lp-dd">
            <button type="button" className="lp-nav-link" aria-haspopup="true">How it works <Icon src={chevronDown} size={16} className="lp-dd-chevron" /></button>
            <div className="lp-dd-panel">
              <ul className="lp-dd-card">
                {steps.map(({ href, icon, title, detail }) => (
                  <li key={href}>
                    <a className="lp-dd-item" href={href}>
                      <span className="lp-dd-icon"><LineIcon name={icon} /></span>
                      <span><span className="lp-title-sm">{title}</span><span className="lp-meta">{detail}</span></span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <a className="lp-nav-link" href="#clinics">Clinics</a>
          <a className="lp-nav-link" href="#faq">FAQ</a>
        </nav>

        <div className="lp-header-actions">
          <label className="lp-lang">
            <span className="lp-sr-only">Language</span>
            <select defaultValue="English">
              {languages.map((language) => <option key={language}>{language}</option>)}
            </select>
            <Icon src={caretDown} width={10} height={6} />
          </label>
          <Link to="/account" className="lp-nav-link lp-for-clinics">For clinics <Icon src={arrowRight} size={16} /></Link>
          <a className="lp-btn lp-btn-teal lp-header-cta" href="#clinics">Find a clinic</a>
        </div>
      </div>
    </header>
  )
}
