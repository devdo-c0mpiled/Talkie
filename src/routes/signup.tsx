import { createFileRoute } from '@tanstack/react-router'
import { SignupForm } from '../components/onboarding/SignupForm'
import { SignupSidebar } from '../components/onboarding/SignupSidebar'
import onboardingCss from '../onboarding.css?url'

const onboardingFonts = 'https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@500;700;800&display=swap'

export const Route = createFileRoute('/signup')({
  head: () => ({
    meta: [
      { title: 'Create your clinic account — Tokie' },
      { name: 'description', content: 'Set up Tokie to answer international booking calls for your clinic, in the caller’s language.' },
    ],
    links: [
      { rel: 'stylesheet', href: onboardingFonts },
      { rel: 'stylesheet', href: onboardingCss },
    ],
  }),
  component: Signup,
})

function Signup() {
  return (
    <div className="lp ob">
      <SignupSidebar />
      <main className="ob-main">
        <SignupForm />
      </main>
    </div>
  )
}
