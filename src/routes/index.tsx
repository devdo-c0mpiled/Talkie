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
  const [query, setQuery] = useState('')
  const searchInput = useRef<HTMLInputElement>(null)

  // "Tokie, …" prompts across the page drop their text into the hero search box.
  function askTokie(prompt: string) {
    setQuery(prompt)
    searchInput.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    searchInput.current?.focus({ preventScroll: true })
  }

  return (
    <div className="lp">
      <LandingHeader />
      <main>
        <Hero query={query} onQueryChange={setQuery} inputRef={searchInput} />
        <LanguageMarquee />
        <HowItWorks onAsk={askTokie} />
        <Categories />
        <SampleCalls />
        <PartnerClinics />
        <Faq />
        <CallToAction />
      </main>
      <LandingFooter />
    </div>
  )
}
