import { createFileRoute } from '@tanstack/react-router'
import { FieldsStep } from '../components/onboarding/FieldsStep'
import { wizardHead } from '../components/onboarding/OnboardingShell'

export const Route = createFileRoute('/biz/onboarding/fields')({
  head: () => wizardHead('Intake fields'),
  component: FieldsStep,
})
