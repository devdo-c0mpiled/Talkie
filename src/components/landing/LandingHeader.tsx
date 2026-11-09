import { Link } from '@tanstack/react-router'
import arrowRight from '../../assets/landing/arrow-right-16.svg'
import caretDown from '../../assets/landing/caret-down.svg'
import chevronDown from '../../assets/landing/chevron-down-16.svg'
import logoPhone from '../../assets/landing/logo-phone.svg'
import { Icon } from './Icon'

const languages = ['English', '日本語', '简体中文', 'ไทย']

export function LandingHeader() {
  return (
    <header className="lp-header">
      <div className="lp-container lp-header-inner">
        <Link to="/" className="lp-logo" aria-label="Tokie home">
          <span className="lp-logo-mark"><Icon src={logoPhone} size={16} /></span>
          Tokie
        </Link>

        <nav className="lp-nav" aria-label="Main">
          <a className="lp-nav-link" href="#how-it-works">How it works <Icon src={chevronDown} size={16} /></a>
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
          <Link to="/admin" className="lp-nav-link lp-for-clinics">For clinics <Icon src={arrowRight} size={16} /></Link>
          <a className="lp-btn lp-btn-teal lp-header-cta" href="#clinics">Find a clinic</a>
        </div>
      </div>
    </header>
  )
}
