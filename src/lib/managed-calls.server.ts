type ManagedDeps = {
  db: D1Database
  userId: string | null
  accountId: string | undefined
  apiKey: string | undefined
  fetcher?: typeof fetch
  origin?: string
  from?: string
  agentId?: string
}

const validCallId = (value: string) => /^[\w-]{1,256}$/.test(value)
const headers = { 'Cache-Control': 'no-store' }
const statuses = new Set(['queued', 'ringing', 'in-progress', 'completed', 'no-answer', 'busy', 'rejected', 'canceled', 'failed'])
const validAttempt = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)

export async function createManagedCall(request: Request, deps: ManagedDeps): Promise<Response> {
  if (!deps.userId) return Response.json({ error: 'Login required.' }, { status: 401, headers })
  if (!deps.origin || request.headers.get('Origin') !== deps.origin) return Response.json({ error: 'Forbidden.' }, { status: 403, headers })
  let body: unknown
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid request.' }, { status: 400, headers }) }
  if (!body || typeof body !== 'object' || !('attemptId' in body) || !('userId' in body) || body.userId !== deps.userId || typeof body.attemptId !== 'string' || !validAttempt(body.attemptId)) {
    return Response.json({ error: 'Invalid request.' }, { status: 400, headers })
  }
  const { attemptId } = body
  const to = 'to' in body && typeof body.to === 'string' ? body.to : ''
  const rejected = !deps.accountId || !deps.apiKey || !deps.from || typeof deps.agentId !== 'string' || !deps.agentId.trim() ||
    !/^(?:0(?:2|1[016789]|3[1-3]|4[1-4]|5[0-5]|6[1-4]|70|80)\d{7,9}|1[5-8]\d{6})$/.test(to) || to === deps.from
  try {
    const inserted = await deps.db.prepare('INSERT OR IGNORE INTO managed_call_attempts (attempt_id, user_id, status, created_at) SELECT ?, id, ?, ? FROM "user" WHERE id = ?').bind(attemptId, rejected ? 'rejected' : 'pending', Date.now(), deps.userId).run()
    if (inserted.meta.changes !== 1) {
      const existing = await deps.db.prepare("SELECT attempt_id FROM managed_call_attempts WHERE user_id = ? AND (attempt_id = ? OR status = 'pending') ORDER BY status = 'pending' DESC LIMIT 1").bind(deps.userId, attemptId).first<{ attempt_id: string }>()
      return Response.json({ error: 'Attempt already submitted; check its status.', attemptId: existing?.attempt_id ?? null }, { status: 409, headers })
    }
  } catch { return Response.json({ error: 'Attempt could not be reserved; no call was sent.' }, { status: 503, headers }) }
  if (rejected) return Response.json({ state: 'rejected' }, { status: 422, headers })
  try {
    const response = await (deps.fetcher ?? fetch)(`https://api.claw-ops.com/v1/accounts/${encodeURIComponent(deps.accountId!)}/calls`, {
      method: 'POST', redirect: 'manual', headers: { Authorization: `Bearer ${deps.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ To: to, From: deps.from, AgentId: deps.agentId }),
    })
    if ([400, 401, 403, 404, 409, 410, 422, 429].includes(response.status)) {
      await deps.db.prepare("UPDATE managed_call_attempts SET status = 'rejected' WHERE attempt_id = ? AND user_id = ?").bind(attemptId, deps.userId).run()
      return Response.json({ state: 'rejected' }, { status: 422, headers })
    }
    if (response.status !== 201) throw new Error('Unknown provider outcome')
    const result: unknown = await response.json()
    if (!result || typeof result !== 'object' || !('callId' in result) || typeof result.callId !== 'string' || !validCallId(result.callId)) throw new Error('Unknown provider outcome')
    if (!await recordManagedCall(deps.db, deps.userId, result.callId)) throw new Error('Call ownership not recorded')
    await deps.db.prepare("UPDATE managed_call_attempts SET status = 'created', call_id = ? WHERE attempt_id = ? AND user_id = ?").bind(result.callId, attemptId, deps.userId).run()
    return Response.json({ state: 'created', callId: result.callId }, { status: 201, headers })
  } catch { return Response.json({ state: 'unknown', error: 'Call may have been queued. Do not submit it again.' }, { status: 502, headers }) }
}

/** Only call this after the provider returns a successful create response for this user. */
export async function recordManagedCall(db: D1Database, userId: string, callId: string): Promise<boolean> {
  if (!userId || !validCallId(callId)) return false
  const result = await db.prepare(`INSERT OR IGNORE INTO managed_calls (call_id, user_id, created_at)
    SELECT ?, id, ? FROM "user" WHERE id = ?`).bind(callId, Date.now(), userId).run()
  if (result.meta.changes === 1) return true
  const existing = await db.prepare('SELECT call_id FROM managed_calls WHERE call_id = ? AND user_id = ?')
    .bind(callId, userId).first<{ call_id: string }>()
  return Boolean(existing)
}

export async function handleManagedCalls(request: Request, deps: ManagedDeps): Promise<Response> {
  if (!deps.userId) return Response.json({ error: 'Login required.' }, { status: 401, headers })
  const params = new URL(request.url).searchParams
  if (params.get('pending') === '1') {
    const attempt = await deps.db.prepare("SELECT attempt_id FROM managed_call_attempts WHERE user_id = ? AND status = 'pending'").bind(deps.userId).first<{ attempt_id: string }>()
    return Response.json({ attemptId: attempt?.attempt_id ?? null }, { headers })
  }
  const attemptId = params.get('attempt')
  if (attemptId) {
    if (!validAttempt(attemptId)) return Response.json({ error: 'Attempt not found.' }, { status: 404, headers })
    const attempt = await deps.db.prepare('SELECT status, call_id FROM managed_call_attempts WHERE attempt_id = ? AND user_id = ?').bind(attemptId, deps.userId).first<{ status: string; call_id: string | null }>()
    if (!attempt) return Response.json({ error: 'Attempt not found.' }, { status: 404, headers })
    return Response.json({ state: attempt.status, callId: attempt.call_id }, { headers })
  }
  const callId = params.get('call')
  if (!callId) {
    // ponytail: return the newest 100 calls; add pagination if older calls need to be browsed.
    const rows = await deps.db.prepare('SELECT call_id, created_at FROM managed_calls WHERE user_id = ? ORDER BY created_at DESC, call_id DESC LIMIT 100')
      .bind(deps.userId).all<{ call_id: string; created_at: number }>()
    return Response.json({ calls: rows.results.map((row) => ({ callId: row.call_id, createdAt: row.created_at })) }, { headers })
  }
  if (!validCallId(callId)) return Response.json({ error: 'Call not found.' }, { status: 404, headers })
  const owner = await deps.db.prepare('SELECT call_id, created_at FROM managed_calls WHERE call_id = ? AND user_id = ?')
    .bind(callId, deps.userId).first<{ call_id: string; created_at: number }>()
  if (!owner) return Response.json({ error: 'Call not found.' }, { status: 404, headers })
  if (!deps.accountId || !deps.apiKey) return Response.json({ error: 'Call service unavailable.' }, { status: 503, headers })
  const fetcher = deps.fetcher ?? fetch
  const base = `https://api.claw-ops.com/v1/accounts/${encodeURIComponent(deps.accountId)}`
  const recording = params.get('recording') === '1'
  try {
    const response = await fetcher(`${base}/${recording ? 'recordings' : 'calls'}/${encodeURIComponent(callId)}`, {
      headers: { Authorization: `Bearer ${deps.apiKey}` }, redirect: 'manual',
    })
    if (recording && response.status === 404) return Response.json({ error: 'Recording unavailable.' }, { status: 404, headers })
    if (response.status !== 200) throw new Error('Provider unavailable')
    if (recording) {
      const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
      if (!type || !['audio/wav', 'audio/x-wav', 'audio/wave', 'application/octet-stream'].includes(type) || !response.body) throw new Error('Recording unavailable')
      return new Response(response.body, { headers: { ...headers, 'Content-Type': 'audio/wav', 'X-Content-Type-Options': 'nosniff' } })
    }
    const call: unknown = await response.json()
    if (!call || typeof call !== 'object') throw new Error('Invalid call')
    const data = call as Record<string, unknown>
    if (data.callId !== callId || typeof data.status !== 'string' || !statuses.has(data.status)) throw new Error('Invalid call')
    return Response.json({ callId, createdAt: owner.created_at, status: data.status,
      duration: typeof data.duration === 'number' ? data.duration : null,
      recordingAvailable: typeof data.recordingUrl === 'string' ? Boolean(data.recordingUrl) : data.recordingUrl === null ? false : null }, { headers })
  } catch {
    return Response.json({ error: 'Call service unavailable.' }, { status: 502, headers })
  }
}
