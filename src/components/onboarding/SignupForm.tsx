import { useForm } from '@tanstack/react-form'
import { Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import google from '../../assets/onboarding/google.svg'
import lock from '../../assets/onboarding/lock.svg'
import { authClient } from '../../lib/auth-client'
import { Icon } from '../landing/Icon'

const TOTAL_STEPS = 6
const STEP = 1

export function SignupForm() {
  const router = useRouter()
  const [error, setError] = useState('')
  const form = useForm({
    defaultValues: { clinicName: '', email: '', password: '' },
    onSubmit: async ({ value }) => {
      setError('')
      try {
        // The account has no separate clinic record yet, so the clinic name is stored as the account name.
        const result = await authClient.signUp.email({ name: value.clinicName.trim(), email: value.email, password: value.password })
        if (result.error) {
          setError('We couldn’t create your account. Check your details and try again.')
          return
        }
        await router.invalidate()
        // Step 2 ("Get a phone number") is not built yet, so new accounts land on the admin page.
        await router.navigate({ to: '/admin' })
      } catch {
        setError('We couldn’t reach the server. Please try again in a moment.')
      }
    },
  })

  return (
    <form className="ob-form" onSubmit={(event) => { event.preventDefault(); void form.handleSubmit() }}>
      <div className="ob-head">
        <div className="ob-progress" aria-hidden="true">
          {Array.from({ length: TOTAL_STEPS }, (_, index) => (
            <i key={index} data-done={index < STEP ? '' : undefined} />
          ))}
        </div>
        <p className="ob-step">Step {STEP} of {TOTAL_STEPS}</p>
        <h1>Create your clinic account</h1>
      </div>

      {/* Google sign-in is not configured on the auth server yet. */}
      <button type="button" className="ob-google">
        <Icon src={google} size={18} />
        Continue with Google
      </button>

      <p className="ob-or">or</p>

      <form.Field name="clinicName">
        {(field) => (
          <div className="ob-field">
            <label className="ob-label" htmlFor="signup-clinic">Clinic name</label>
            <input className="ob-input" id="signup-clinic" name={field.name} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} type="text" autoComplete="organization" placeholder="Saebom Plastic Surgery" required />
          </div>
        )}
      </form.Field>

      <form.Field name="email">
        {(field) => (
          <div className="ob-field">
            <label className="ob-label" htmlFor="signup-email">Work email</label>
            <input className="ob-input" id="signup-email" name={field.name} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} type="email" autoComplete="email" placeholder="manager@saebom.clinic" required />
          </div>
        )}
      </form.Field>

      <form.Field name="password">
        {(field) => (
          <div className="ob-field">
            <label className="ob-label" htmlFor="signup-password">Password</label>
            <input className="ob-input" id="signup-password" name={field.name} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} type="password" autoComplete="new-password" minLength={8} aria-describedby="signup-password-hint" required />
            <p className="ob-hint" id="signup-password-hint">At least 8 characters.</p>
          </div>
        )}
      </form.Field>

      <div className="ob-field ob-field--country">
        <p className="ob-label">Country</p>
        <div className="ob-country">
          <span className="ob-country-chip"><Icon src={lock} size={16} /> South Korea</span>
          <p className="ob-hint">Tokie is available for clinics in Korea.</p>
        </div>
      </div>

      {error && <p className="ob-error" role="alert">{error}</p>}

      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(pending) => <button type="submit" className="lp-btn lp-btn-teal ob-submit" disabled={pending}>Create account</button>}
      </form.Subscribe>

      <div className="ob-foot">
        <p className="ob-login">Already have an account? <Link to="/login">Log in</Link></p>
        <p className="ob-terms">By continuing, you agree to the <a href="#">Terms</a> and <a href="#">Privacy Policy</a>.</p>
      </div>
    </form>
  )
}
