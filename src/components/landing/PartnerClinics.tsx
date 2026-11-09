const languageCodes: Record<string, string> = { 日本語: 'ja', 中文: 'zh-Hans', ไทย: 'th', English: 'en' }

// Placeholder data from the design; clinic names and numbers are fictional.
const clinics = [
  { name: 'Mirae Plastic Surgery', area: 'Gangnam', services: 'Rhinoplasty, Eyes', phone: '+82 2 6080 1120', languages: ['日本語', '中文', 'ไทย'] },
  { name: 'Hanbit Dermatology', area: 'Sinsa', services: 'Botox, Laser toning', phone: '+82 2 6080 1121', languages: ['日本語', '中文', 'English'] },
  { name: 'Dalbit Beauty Lounge', area: 'Hongdae', services: 'Hair spa, Nails', phone: '+82 2 6080 1122', languages: ['ไทย', 'English'] },
]

export function PartnerClinics() {
  return (
    <section id="clinics" className="lp-clinics">
      <div className="lp-container">
        <div className="lp-section-head lp-reveal">
          <p className="lp-eyebrow">Partner clinics</p>
          <h2 className="lp-h2">Call any of them now</h2>
        </div>
        <ul className="lp-clinic-grid">
          {clinics.map(({ name, area, services, phone, languages }, index) => (
            <li key={name} className={`lp-clinic lp-pop lp-pop--${index + 1}`}>
              <div>
                <h3 className="lp-clinic-name">{name}</h3>
                <p className="lp-meta">{area} · {services}</p>
              </div>
              <p className="lp-mono lp-clinic-phone">{phone}</p>
              <ul className="lp-clinic-langs" aria-label="Languages">
                {languages.map((language) => (
                  <li key={language} className="lp-tag" lang={languageCodes[language]}>{language}</li>
                ))}
              </ul>
              {/* The free browser call flow is not built yet, so this button has no action. */}
              <button type="button" className="lp-clinic-call" aria-label={`Call ${name} for free`}>Call free</button>
            </li>
          ))}
        </ul>
        <p className="lp-meta">Clinic names are fictional examples.</p>
      </div>
    </section>
  )
}
