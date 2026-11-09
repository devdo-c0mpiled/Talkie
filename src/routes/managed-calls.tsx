import { createFileRoute, redirect } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { getCurrentUser } from '../lib/auth.functions'
import { authClient } from '../lib/auth-client'

export const Route = createFileRoute('/managed-calls')({
  beforeLoad: async () => { if (!await getCurrentUser()) throw redirect({ to: '/login' }) },
  component: ManagedCalls,
})

type Call = { callId: string; createdAt: number }
type Detail = { status: string; duration: number | null; recordingAvailable: boolean | null }
export const managedAttemptKey = (userId: string) => `managed-call-attempt:${userId}`
function ManagedCalls() {
  const session = authClient.useSession()
  if (session.isPending) return <p>로그인 상태를 확인하고 있습니다.</p>
  if (!session.data?.user.id) return <p>로그인 상태를 확인할 수 없습니다. 다시 로그인해 주세요.</p>
  return <UserCalls key={session.data.user.id} userId={session.data.user.id} />
}

function UserCalls({ userId }: { userId: string }) {
  const attemptKey = managedAttemptKey(userId)
  const [calls, setCalls] = useState<Call[]>([])
  const [selected, setSelected] = useState('')
  const [detail, setDetail] = useState<Detail | null>(null)
  const [to, setTo] = useState('')
  const [message, setMessage] = useState('')
  const [locked, setLocked] = useState(true)
  const submitting = useRef(false)

  async function loadCalls() {
    try {
      const response = await fetch('/api/managed-calls', { cache: 'no-store' })
      if (!response.ok) throw new Error()
      const result: { calls: Call[] } = await response.json()
      setCalls(result.calls)
    } catch { setMessage('통화 목록을 불러오지 못했습니다.') }
  }
  async function checkAttempt(id: string) {
    try {
      const response = await fetch(`/api/managed-calls?attempt=${encodeURIComponent(id)}`, { cache: 'no-store' })
      if (!response.ok) throw new Error()
      const result: { state: string } = await response.json()
      if (result.state === 'created' || result.state === 'rejected') {
        if (localStorage.getItem(attemptKey) === id) localStorage.removeItem(attemptKey)
        setLocked(false)
        setMessage(result.state === 'created' ? '발신 요청이 등록됐습니다. 연결 여부는 통화 상태를 확인해 주세요.' : '발신 요청이 거절됐습니다.')
        await loadCalls()
        return
      }
    } catch { /* An absent or unavailable attempt cannot prove that the call was not sent. */ }
    setLocked(true)
    setMessage('발신 결과를 확인할 수 없습니다. 중복 통화를 막기 위해 다시 발신하지 말고 서비스 담당자에게 확인해 주세요.')
  }
  useEffect(() => {
    void loadCalls()
    async function restoreAttempt() {
      try {
        const saved = localStorage.getItem(attemptKey)
        const response = await fetch('/api/managed-calls?pending=1', { cache: 'no-store' })
        if (!response.ok) throw new Error()
        const result: { attemptId: string | null } = await response.json()
        const id = saved ?? result.attemptId
        if (id) {
          localStorage.setItem(attemptKey, id)
          await checkAttempt(id)
        } else setLocked(false)
      } catch {
        setMessage('발신 상태를 확인하지 못했습니다. 다시 로그인하거나 서비스 담당자에게 확인해 주세요.')
      }
    }
    void restoreAttempt()
  }, [userId])

  async function place(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current || locked) return
    submitting.current = true
    const attemptId = crypto.randomUUID()
    try { localStorage.setItem(attemptKey, attemptId) } catch {
      submitting.current = false
      setMessage('발신 안전 확인을 저장할 수 없어 요청하지 않았습니다.')
      return
    }
    setLocked(true)
    setMessage('발신 요청을 보내고 있습니다.')
    try {
      await fetch('/api/managed-calls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ attemptId, userId, to: to.replace(/[\s()-]/g, '') }) })
    } catch { /* Check the reserved attempt; never repeat the POST. */ }
    await checkAttempt(attemptId)
    submitting.current = false
  }
  async function showCall(callId: string) {
    setSelected(callId)
    setDetail(null)
    try {
      const response = await fetch(`/api/managed-calls?call=${encodeURIComponent(callId)}`, { cache: 'no-store' })
      if (!response.ok) throw new Error()
      setDetail(await response.json())
    } catch { setMessage('통화 상태를 불러오지 못했습니다.') }
  }
  return <main style={{ maxWidth: 640, margin: 'auto', padding: 24, color: '#122b3f' }}>
    <h1>관리형 통화</h1>
    <p>앱에서 발신한 통화만 이 계정에 표시됩니다. 발신 요청 등록은 상대방 연결을 뜻하지 않습니다.</p>
    <form onSubmit={place}>
      <label>받는 전화번호 <input type="tel" value={to} onChange={event => setTo(event.target.value)} required disabled={locked} /></label>{' '}
      <button type="submit" disabled={locked}>발신 요청</button>
    </form>
    {message && <p role="status">{message}</p>}
    {locked && <button type="button" onClick={() => { const id = localStorage.getItem(attemptKey); if (id) void checkAttempt(id) }}>발신 결과 확인</button>}
    <h2>내 통화 기록</h2>
    {calls.length === 0 ? <p>표시할 통화가 없습니다.</p> : <ul>{calls.map(call => <li key={call.callId}>
      <button type="button" onClick={() => void showCall(call.callId)}>{new Date(call.createdAt).toLocaleString('ko-KR')} 통화 상태 보기</button>
    </li>)}</ul>}
    {detail && selected && <section><h2>통화 상태</h2><p>{detail.status}{detail.duration !== null ? ` · ${detail.duration}초` : ''}</p>
      {detail.recordingAvailable === true && <audio controls src={`/api/managed-calls?call=${encodeURIComponent(selected)}&recording=1`}>녹음을 재생할 수 없습니다.</audio>}
      {detail.recordingAvailable === false && <p>녹음이 없습니다.</p>}
      {detail.recordingAvailable === null && <p>녹음 여부를 확인할 수 없습니다.</p>}
    </section>}
  </main>
}
