import { BrowserCallDemo } from '../landing/BrowserCallDemo'

// The design plays the same three sample calls as the traveler page, so the demo is shared.
export function BizStaffDemo() {
  return (
    <section className="biz-section biz-staff" aria-labelledby="biz-staff-title">
      <div className="lp-container biz-staff-inner">
        <div className="lp-section-head">
          <h2 id="biz-staff-title" className="lp-h2 lp-reveal">What your staff hears</h2>
          <p className="lp-body">Guests speak English. Your staff hears Korean. Tokie translates both ways, live.</p>
        </div>
        <div className="biz-staff-demo">
          <BrowserCallDemo />
          <p className="lp-meta">Business names are fictional examples.</p>
        </div>
      </div>
    </section>
  )
}
