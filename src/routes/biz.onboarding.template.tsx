import { createFileRoute } from '@tanstack/react-router'
import { TemplateStep } from '../components/onboarding/TemplateStep'
import { wizardHead } from '../components/onboarding/OnboardingShell'

export const Route = createFileRoute('/biz/onboarding/template')({
  head: () => wizardHead('Pick a template'),
  component: TemplateStep,
})
