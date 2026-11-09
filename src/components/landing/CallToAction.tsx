const greetings = [
  { lang: 'ja', text: 'こんにちは' },
  { lang: 'zh-Hans', text: '你好' },
  { lang: 'th', text: 'สวัสดี' },
  { lang: 'en', text: 'Hello' },
]

// Two rows of six greetings; the second row continues where the first stops.
const rows = [0, 1].map((row) => Array.from({ length: 6 }, (_, index) => greetings[(row * 6 + index) % greetings.length]))

export function CallToAction() {
  return (
    <section className="lp-cta">
      <div className="lp-container">
        <div className="lp-cta-card">
          <div className="lp-cta-words" aria-hidden="true">
            {rows.map((row, index) => (
              <p key={index}>
                {row.map(({ lang, text }, position) => <span key={position} lang={lang}>{text}</span>)}
              </p>
            ))}
          </div>
          <h2>Speak your language. Let Tokie handle the Korean.</h2>
          <a className="lp-cta-btn" href="#clinics">Find a clinic</a>
        </div>
      </div>
    </section>
  )
}
