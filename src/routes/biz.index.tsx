import { createFileRoute, Link } from '@tanstack/react-router'
import { BizCallToAction } from '../components/biz/BizCallToAction'
import { BizFaq } from '../components/biz/BizFaq'
import { BizFeatures } from '../components/biz/BizFeatures'
import { BizFooter } from '../components/biz/BizFooter'
import { BizHeader } from '../components/biz/BizHeader'
import { BizHero } from '../components/biz/BizHero'
import { BizIndustries } from '../components/biz/BizIndustries'
import { BizStaffDemo } from '../components/biz/BizStaffDemo'
import bizCss from '../biz.css?url'

export const Route = createFileRoute('/biz/')({
  head: () => ({
    meta: [
      { title: 'Tokie for Business: a multilingual AI phone receptionist' },
      { name: 'description', content: 'Tokie gives your business a multilingual AI phone receptionist. Take bookings in Japanese, Chinese, and Thai. No code.' },
    ],
    links: [{ rel: 'stylesheet', href: bizCss }],
  }),
  component: BizLanding,
})

function BizLanding() {
  return (
    <div className="lp biz">
      <BizHeader />
      <main>
        <BizHero />
        <BizIndustries />
        <BizFeatures />
        <BizStaffDemo />
        <BizFaq />
        <BizCallToAction />
      </main>
      <BizFooter />
      {/* Phones only: a call-to-action that stays in reach while scrolling. */}
      <div className="lp-mbar biz-mbar">
        <a className="lp-btn lp-btn-teal" href="#book-demo">Book a demo</a>
        <Link to="/biz/onboarding/number" className="biz-mbar-link">Start free</Link>
      </div>
    </div>
  )
}
