import { Link, createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { authClient } from '../lib/auth-client'
import { getCurrentUser } from '../lib/auth.functions'

const phoneDetailsSchema = z.object({
  customerNumber: z.string(),
  phoneNumber: z.string().nullable(),
  verified: z.literal(false),
})
type PhoneDetails = z.infer<typeof phoneDetailsSchema>
type PhoneState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string; signedOut: boolean }
  | { kind: 'ready'; details: PhoneDetails }

export const Route = createFileRoute('/account')({
  beforeLoad: async () => {
    const user = await getCurrentUser()
    if (!user) throw redirect({ to: '/login' })
    return { user }
  },
  component: Account,
})

function Account() {
  const { user } = Route.useRouteContext()
  const router = useRouter()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [phoneState, setPhoneState] = useState<PhoneState>({ kind: 'loading' })
  const [reload, setReload] = useState(0)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveUncertain, setSaveUncertain] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setPhoneState({ kind: 'loading' })
    setPhoneError('')
    setSaveUncertain(false)
    async function loadPhone() {
      try {
        const response = await fetch('/api/personal-phone', { signal: controller.signal })
        if (response.status === 401) {
          setPhoneState({ kind: 'error', message: '다시 로그인해 주세요.', signedOut: true })
          return
        }
        if (!response.ok) throw new Error('Phone details unavailable')
        const details = phoneDetailsSchema.parse(await response.json())
        setPhoneState({ kind: 'ready', details })
      } catch {
        if (!controller.signal.aborted) setPhoneState({ kind: 'error', message: '번호를 불러오지 못했습니다. 다시 시도해 주세요.', signedOut: false })
      }
    }
    void loadPhone()
    return () => controller.abort()
  }, [reload])

  async function savePhone(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setPhoneError('')
    try {
      const response = await fetch('/api/personal-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phoneNumber.trim() }),
      })
      if (response.status === 401) {
        setPhoneState({ kind: 'error', message: '다시 로그인해 주세요.', signedOut: true })
        return
      }
      if (response.status === 400) {
        setPhoneError('전화번호 형식을 확인해 주세요. 예: 010-1234-5678')
        return
      }
      if (response.status === 409) {
        setPhoneError('이미 사용 중인 번호이거나 이 계정에 저장된 번호를 변경할 수 없습니다. 저장된 번호를 다시 확인해 주세요.')
        return
      }
      if (!response.ok) throw new Error('Phone save failed')
      const details = phoneDetailsSchema.parse(await response.json())
      setPhoneState({ kind: 'ready', details })
    } catch {
      setPhoneError('저장 결과를 확인하지 못했습니다. 다시 불러와 저장 여부를 확인해 주세요.')
      setSaveUncertain(true)
    } finally {
      setSaving(false)
    }
  }

  async function signOut() {
    setPending(true)
    try {
      const result = await authClient.signOut()
      if (result.error) throw new Error('Sign out failed')
      await router.invalidate()
      await router.navigate({ to: '/login' })
    } catch {
      setError('로그아웃하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="admin-page">
      <div className="admin-top"><Link to="/" className="back-link">← 홈으로 돌아가기</Link><span className="status"><span /> 내 계정</span></div>
      <div className="admin-content auth-content">
        <p className="eyebrow"><span /> TALKIE FOR SHOPS</p>
        <h1>반가워요,<br /><em>{user.name}님.</em></h1>
        <p>{user.email} 계정으로 로그인했습니다.</p>
        <p><a href="/listen">진행 중인 전화 듣기</a></p>
        <p><a href="/sfu-live">AI 음성 대화</a></p>
        <p><a href="/managed-calls">관리형 통화 기록과 발신</a></p>
        {phoneState.kind === 'loading' && <p role="status">번호를 불러오는 중입니다.</p>}
        {phoneState.kind === 'error' && <div role="alert"><p>{phoneState.message}</p>{phoneState.signedOut ? <Link to="/login">로그인하기</Link> : <button type="button" onClick={() => setReload((value) => value + 1)}>다시 불러오기</button>}</div>}
        {phoneState.kind === 'ready' && <>
          <div className="admin-notice"><span>✳</span><div><strong>고객 내선번호</strong><p>{phoneState.details.customerNumber}</p></div></div>
          {phoneState.details.phoneNumber ? <div role="status"><strong>등록된 개인 전화번호</strong><p>{phoneState.details.phoneNumber}</p><p className="auth-help">이 번호는 소유 인증되지 않았으며 변경할 수 없습니다.</p></div> : <form onSubmit={(event) => { void savePhone(event) }}>
            <label>개인 전화번호<input type="tel" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value)} autoComplete="tel" placeholder="010-1234-5678" maxLength={32} required aria-describedby="phone-help" /></label>
            <p id="phone-help" className="auth-help">번호 소유 인증은 진행되지 않습니다. 저장한 번호는 변경할 수 없으니 확인 후 등록해 주세요.</p>
            {phoneError && <div role="alert"><p className="auth-error">{phoneError}</p><button type="button" onClick={() => setReload((value) => value + 1)}>저장된 번호 다시 불러오기</button></div>}
            <button type="submit" className="button button-dark" disabled={saving || saveUncertain}>{saving ? '저장 중...' : '개인 전화번호 등록'} <span>↗</span></button>
          </form>}
        </>}
        <button type="button" className="button button-dark" onClick={signOut} disabled={pending}>로그아웃 <span>↗</span></button>
        {error && <p role="alert">{error}</p>}
      </div>
      <div className="admin-decoration" aria-hidden="true">✳</div>
    </section>
  )
}
