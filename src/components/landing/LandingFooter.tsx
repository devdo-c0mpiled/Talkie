type FooterLink = { label: string; href: string; lang?: string }

// `#` marks pages that do not exist yet.
const columns: { title: string; links: FooterLink[] }[] = [
  {
    title: 'How it works',
    links: [
      { label: 'Call in your language', href: '#call-in-your-language' },
      { label: 'Free browser call', href: '#free-browser-call' },
      { label: 'Instant confirmation', href: '#instant-confirmation' },
    ],
  },
  {
    title: 'Clinics',
    links: [
      { label: 'Plastic surgery', href: '#clinics' },
      { label: 'Dermatology', href: '#clinics' },
      { label: 'Beauty salons', href: '#clinics' },
    ],
  },
  {
    title: 'Languages',
    links: [
      { label: '日本語', href: '#', lang: 'ja' },
      { label: '简体中文', href: '#', lang: 'zh-Hans' },
      { label: 'ไทย', href: '#', lang: 'th' },
      { label: 'English', href: '#' },
    ],
  },
  {
    title: 'For clinics',
    links: [
      { label: 'Create a receptionist', href: '/account' },
      { label: 'Pricing', href: '#' },
      { label: 'Book a demo', href: '#' },
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

export function LandingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-container">
        <div className="lp-footer-grid">
          <div className="lp-footer-col">
            <p className="lp-footer-title">Tokie</p>
            <p>Call Korean clinics in your own language.</p>
          </div>
          {columns.map(({ title, links }) => (
            <nav key={title} className="lp-footer-col" aria-label={title}>
              <p className="lp-footer-title">{title}</p>
              <ul>
                {links.map(({ label, href, lang }) => (
                  <li key={label}><a href={href} lang={lang}>{label}</a></li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="lp-footer-bottom">
          <p>© 2026 Tokie. All clinic names are fictional.</p>
          <p>Made for travelers in Seoul</p>
        </div>
      </div>
    </footer>
  )
}
