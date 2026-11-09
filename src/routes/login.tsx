import { useForm } from '@tanstack/react-form'
import { Link, createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { authClient } from '../lib/auth-client'

const getGoogleSignInAvailable = createServerFn({ method: 'GET' }).handler(async () => {
  const { googleSignInAvailable } = await import('../lib/auth.server')
  return googleSignInAvailable()
})

export const Route = createFileRoute('/login')({
  loader: () => getGoogleSignInAvailable(),
  component: Login,
})

function Login() {
  const router = useRouter()
  const [signup, setSignup] = useState(false)
  const [error, setError] = useState('')
  const [googlePending, setGooglePending] = useState(false)
  const googleAvailable = Route.useLoaderData()

  async function signInWithGoogle() {
    setError('')
    setGooglePending(true)
    try {
      const result = await authClient.signIn.social({ provider: 'google', callbackURL: '/account' })
      if (result.error) throw new Error('Google sign-in failed')
    } catch {
      setError('Google 로그인에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      setGooglePending(false)
    }
  }
  const form = useForm({
    defaultValues: { name: '', email: '', password: '' },
    onSubmit: async ({ value }) => {
      setError('')
      try {
        const result = signup
          ? await authClient.signUp.email({ name: value.name.trim(), email: value.email, password: value.password })
          : await authClient.signIn.email({ email: value.email, password: value.password })
        if (result.error) {
          setError(signup ? '가입하지 못했습니다. 입력 내용을 확인해 주세요.' : '로그인하지 못했습니다. 이메일과 비밀번호를 확인해 주세요.')
          return
        }
        await router.invalidate()
        await router.navigate({ to: '/account' })
      } catch {
        setError('연결하지 못했습니다. 잠시 후 다시 시도해 주세요.')
      }
    },
  })

  return (
    <section className="admin-page">
      <Link to="/" className="back-link">← 홈으로 돌아가기</Link>
      <div className="admin-content auth-content">
        <p className="eyebrow"><span /> TALKIE FOR SHOPS</p>
        <h1>{signup ? '계정 만들기' : '다시 만나서'}<br /><em>{signup ? '함께 시작해요.' : '반가워요.'}</em></h1>
        {googleAvailable && <button className="button button-dark" type="button" onClick={signInWithGoogle} disabled={googlePending}>Google로 계속하기 <span>↗</span></button>}
        <form onSubmit={(event) => { event.preventDefault(); void form.handleSubmit() }}>
          {signup && <form.Field name="name">{(field) => <label>이름<input name={field.name} value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} required autoComplete="name" /></label>}</form.Field>}
          <form.Field name="email">{(field) => <label>이메일<input name={field.name} type="email" value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} required autoComplete="email" /></label>}</form.Field>
          <form.Field name="password">{(field) => <label>비밀번호<input name={field.name} type="password" value={field.state.value} onBlur={field.handleBlur} onChange={(event) => field.handleChange(event.target.value)} minLength={8} required autoComplete={signup ? 'new-password' : 'current-password'} /></label>}</form.Field>
          {signup && <p className="auth-help">비밀번호는 8자 이상이어야 합니다.</p>}
          {error && <p className="auth-error" role="alert">{error}</p>}
          <form.Subscribe selector={(state) => state.isSubmitting}>{(pending) => <button className="button button-dark" type="submit" disabled={pending}>{signup ? '가입하기' : '로그인'} <span>↗</span></button>}</form.Subscribe>
        </form>
        <p className="auth-switch">{signup ? '이미 계정이 있나요?' : '처음 오셨나요?'} <button type="button" onClick={() => { setSignup(!signup); setError('') }}>{signup ? '로그인' : '계정 만들기'}</button></p>
      </div>
    </section>
  )
}
