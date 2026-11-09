import { createFileRoute } from '@tanstack/react-router'
import { PublishStep } from '../components/onboarding/PublishStep'
import { wizardHead } from '../components/onboarding/OnboardingShell'

export const Route = createFileRoute('/biz/onboarding/publish')({
  head: () => wizardHead('Test and go live'),
  component: PublishStep,
})
