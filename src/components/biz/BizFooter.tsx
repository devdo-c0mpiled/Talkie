import { Link } from '@tanstack/react-router'

// From the desktop design's footer, trimmed to sections this page has. `#` marks pages that do not exist yet.
const columns = [
  {
    title: 'Product',
    links: [
      { label: 'AI receptionist', href: '#fb1' },
      { label: 'Dedicated number', href: '#fb2' },
      { label: 'Booking inbox', href: '#fb3' },
      { label: 'Confirmations', href: '#fb4' },
    ],
  },
  {
    title: 'Get started',
    links: [
      { label: 'Book a demo', href: '#book-demo' },
      { label: 'Contact', href: '#book-demo' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'FAQ', href: '#faq' },
      { label: 'Help center', href: '#' },
      { label: 'Privacy', href: '#' },
      { label: 'Terms', href: '#' },
    ],
  },
]

export function BizFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-container">
        <div className="lp-footer-grid biz-footer-grid">
          <div className="lp-footer-col">
            <p className="lp-footer-title">Tokie</p>
            <p>Multilingual AI receptionist for clinics in Korea.</p>
          </div>
          {columns.map(({ title, links }) => (
            <nav key={title} className="lp-footer-col" aria-label={title}>
              <p className="lp-footer-title">{title}</p>
              <ul>{links.map(({ label, href }) => <li key={label}><a href={href}>{label}</a></li>)}</ul>
            </nav>
          ))}
          <nav className="lp-footer-col" aria-label="For travelers">
            <p className="lp-footer-title">For travelers</p>
            <ul><li><Link to="/">Find a clinic</Link></li></ul>
          </nav>
        </div>
        <div className="lp-footer-bottom">
          <p>© 2026 Tokie. All clinic names are fictional.</p>
          <p>+82 2 6080 1120</p>
        </div>
      </div>
    </footer>
  )
}
