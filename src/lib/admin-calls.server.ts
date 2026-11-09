import '@tanstack/react-start/server-only'
import { readTranscript } from './call-store.server'

type CallRow = {
  row_id: number
  call_id: string
  direction: 'inbound' | 'outbound'
  created_at: number | null
  bridge_started_at: number | null
  bridge_finished_at: number | null
  bridge_failed_at: number | null
}
type AdminSession = { status: 'anonymous' } | { status: 'denied' } | { status: 'allowed'; email: string }

const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const fields = `c.rowid AS row_id, c.call_id, c.direction, cc.created_at,
  c.bridge_started_at, c.bridge_finished_at, c.bridge_failed_at`
const join = 'FROM live_calls c LEFT JOIN inbound_conversation_calls cc ON cc.call_id = c.call_id'

function callView(row: CallRow) {
  return {
    callId: row.call_id,
    direction: row.direction,
    createdAt: row.created_at,
    // These are stored bridge observations, not a consultation outcome.
    bridgeState: row.bridge_finished_at !== null ? 'finished' : row.bridge_failed_at !== null ? 'failed' : row.bridge_started_at !== null ? 'started' : 'not_started',
  }
}

export async function handleAdminCalls(request: Request, db: D1Database, getSession: (headers: Headers) => Promise<AdminSession>): Promise<Response> {
  const session = await getSession(request.headers)
  if (session.status === 'anonymous') return response({ error: 'Unauthorized' }, 401)
  if (session.status === 'denied') return response({ error: 'Forbidden' }, 403)

  const params = new URL(request.url).searchParams
  if ([...params.keys()].some((key) => !['call', 'cursor', 'limit'].includes(key) || params.getAll(key).length !== 1)) return response({ error: 'Invalid query' }, 400)
  const callId = params.get('call')
  if (callId !== null) {
    if (!/^[\w-]{1,256}$/.test(callId) || params.has('cursor') || params.has('limit')) return response({ error: 'Invalid query' }, 400)
    const row = await db.prepare(`SELECT ${fields} ${join} WHERE c.call_id = ?`).bind(callId).first<CallRow>()
    if (!row) return response({ error: 'Not found' }, 404)
    return response({ ...callView(row), lines: await readTranscript(db, callId) })
  }

  const cursor = params.get('cursor')
  const limit = params.get('limit')
  if ((cursor !== null && (!/^[1-9]\d*$/.test(cursor) || !Number.isSafeInteger(Number(cursor)))) ||
      (limit !== null && (!/^[1-9]\d*$/.test(limit) || Number(limit) > 100))) return response({ error: 'Invalid query' }, 400)
  const pageSize = limit === null ? 50 : Number(limit)
  const rows = await db.prepare(`SELECT ${fields} ${join} WHERE c.call_id IS NOT NULL AND (? IS NULL OR c.rowid < ?) ORDER BY c.rowid DESC LIMIT ?`)
    .bind(cursor === null ? null : Number(cursor), cursor === null ? null : Number(cursor), pageSize + 1).all<CallRow>()
  const page = rows.results.slice(0, pageSize)
  return response({ calls: page.map(callView), nextCursor: rows.results.length > pageSize ? String(page[page.length - 1].row_id) : null })
}
