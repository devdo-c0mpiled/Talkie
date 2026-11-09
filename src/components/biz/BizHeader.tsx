import { Link } from '@tanstack/react-router'
import { useRef } from 'react'
import tokie from '../../assets/landing/tokie.webp'
import { LineIcon } from '../landing/LineIcon'

const sections = [
  { href: '#features', label: 'Product' },
  { href: '#faq', label: 'FAQ' },
]

export function BizHeader() {
  // Native <dialog> gives the phone menu sheet focus trapping and Escape for free.
  const menu = useRef<HTMLDialogElement>(null)
  const close = () => menu.current?.close()

  return (
    <header className="lp-header">
      <div className="lp-container lp-header-inner biz-header-inner">
        <Link to="/biz" className="lp-logo" aria-label="Tokie for Business home">
          <span className="lp-tokie-ava" aria-hidden="true"><img src={tokie} alt="" /></span>
          <span>Tokie <span className="biz-logo-sub">for Business</span></span>
        </Link>

        <nav className="lp-nav" aria-label="Main">
          {sections.map(({ href, label }) => <a key={href} className="lp-nav-link" href={href}>{label}</a>)}
        </nav>

        <div className="lp-header-actions">
          <Link to="/" className="lp-nav-link biz-desk">For travelers</Link>
          <Link to="/biz/dashboard" className="lp-nav-link biz-desk">Log in</Link>
          <a className="lp-btn lp-btn-teal lp-header-cta biz-desk" href="#book-demo">Book a demo</a>
          <button type="button" className="biz-menu-btn" aria-label="Open menu" aria-haspopup="dialog" onClick={() => menu.current?.showModal()}>
            <LineIcon name="menu" />
          </button>
        </div>
      </div>

      <dialog ref={menu} className="biz-sheet" aria-label="Menu" onClick={(event) => event.target === menu.current && close()}>
        {/* Clicks that land on the dialog itself (not this body) are backdrop clicks. */}
        <div className="biz-sheet-body">
          <div className="biz-sheet-handle" aria-hidden="true" />
          {sections.map(({ href, label }) => <a key={href} href={href} onClick={close}>{label}</a>)}
          <Link to="/">For travelers</Link>
          <Link to="/biz/dashboard">Log in</Link>
        </div>
      </dialog>
    </header>
  )
}
