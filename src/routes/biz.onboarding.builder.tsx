import { createFileRoute } from '@tanstack/react-router'
import { ScenarioBuilderStep } from '../components/onboarding/ScenarioBuilderStep'
import { wizardHead } from '../components/onboarding/OnboardingShell'

export const Route = createFileRoute('/biz/onboarding/builder')({
  head: () => wizardHead('Call scenario builder'),
  component: ScenarioBuilderStep,
})
