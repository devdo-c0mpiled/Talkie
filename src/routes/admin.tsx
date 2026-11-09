import { Link, createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { authClient } from '../lib/auth-client'
import { getCurrentUser } from '../lib/auth.functions'

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    const user = await getCurrentUser()
    if (!user) throw redirect({ to: '/login' })
    return { user }
  },
  component: Admin,
})

function Admin() {
  const { user } = Route.useRouteContext()
  const router = useRouter()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

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
      <div className="admin-top"><Link to="/" className="back-link">← 홈으로 돌아가기</Link><span className="status"><span /> 준비 중</span></div>
      <div className="admin-content">
        <p className="eyebrow"><span /> TALKIE FOR SHOPS</p>
        <h1>반가워요,<br /><em>{user.name}님.</em></h1>
        <p>{user.email} 계정으로 로그인했습니다.</p>
        <div className="admin-notice"><span>✳</span><div><strong>관리 기능 준비 중</strong><p>통화 연결과 관리 기능은 아직 제공되지 않습니다.</p></div></div>
        <Link to="/checkout" className="button button-dark">테스트 결제</Link>
        <button type="button" className="button button-dark" onClick={signOut} disabled={pending}>로그아웃 <span>↗</span></button>
        {error && <p role="alert">{error}</p>}
      </div>
      <div className="admin-decoration" aria-hidden="true">✳</div>
    </section>
  )
}
