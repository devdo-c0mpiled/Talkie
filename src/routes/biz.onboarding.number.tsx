import { createFileRoute } from '@tanstack/react-router'
import { NumberStep } from '../components/onboarding/NumberStep'
import { wizardHead } from '../components/onboarding/OnboardingShell'

export const Route = createFileRoute('/biz/onboarding/number')({
  head: () => wizardHead('Get a number'),
  component: NumberStep,
})
