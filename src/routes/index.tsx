import { createFileRoute } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { CallToAction } from '../components/landing/CallToAction'
import { Categories } from '../components/landing/Categories'
import { Faq } from '../components/landing/Faq'
import { Hero } from '../components/landing/Hero'
import { HowItWorks } from '../components/landing/HowItWorks'
import { LandingFooter } from '../components/landing/LandingFooter'
import { LandingHeader } from '../components/landing/LandingHeader'
import { LanguageMarquee } from '../components/landing/LanguageMarquee'
import { PartnerClinics } from '../components/landing/PartnerClinics'
import { SampleCalls } from '../components/landing/SampleCalls'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'Tokie — Call Korean clinics in your own language' },
      { name: 'description', content: 'Tokie lets you call Korean clinics in your own language. No Korean number, no Korean needed.' },
    ],
  }),
  component: Landing,
})

function Landing() {
  const [number, setNumber] = useState('')
  const callInput = useRef<HTMLInputElement>(null)

  // "Tokie, …" prompts across the page lead back to the hero call box.
  function askTokie() {
    callInput.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    callInput.current?.focus({ preventScroll: true })
  }

  return (
    <div className="lp">
      <LandingHeader />
      <main>
        <Hero number={number} onNumberChange={setNumber} inputRef={callInput} />
        <LanguageMarquee />
        <HowItWorks onAsk={askTokie} />
        <Categories />
        <SampleCalls />
        <PartnerClinics />
        <Faq />
        <CallToAction />
      </main>
      <LandingFooter />
      {/* Phones only: a call-to-action that stays in reach while scrolling. */}
      <div className="lp-mbar">
        <a className="lp-btn lp-btn-teal" href="#clinics">Call a clinic for free</a>
      </div>
    </div>
  )
}
