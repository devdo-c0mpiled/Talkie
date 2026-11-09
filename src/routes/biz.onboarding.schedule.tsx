import { createFileRoute } from '@tanstack/react-router'
import { ScheduleStep } from '../components/onboarding/ScheduleStep'
import { wizardHead } from '../components/onboarding/OnboardingShell'

export const Route = createFileRoute('/biz/onboarding/schedule')({
  head: () => wizardHead('Availability'),
  component: ScheduleStep,
})
