import '@tanstack/react-start/server-only'

import type { CallLine } from './chat-tools'

type Reservation = { intent: string; actionId: string; to: string; instruction: string }
type Binding = { intent: string; callId: string; to: string }
type Fragment = { callId: string; eventId: string; role: 'business' | 'agent'; text: string; startMs: number; endMs: number }

const hex = (value: string) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const phone = (value: string) => typeof value === 'string' && /^\d{8,15}$/.test(value)
const id = (value: string) => typeof value === 'string' && /^[\w-]{1,256}$/.test(value)
const eventIdValid = (value: string) => typeof value === 'string' && value.length > 0 && value.length <= 256 && !/[\x00-\x1f\x7f]/.test(value)

export async function reserveCall(db: D1Database, { intent, actionId, to, instruction }: Reservation): Promise<boolean> {
  if (!hex(intent) || !hex(actionId) || !phone(to) || typeof instruction !== 'string' || !instruction.trim() || instruction.length > 4000) return false
  const result = await db.prepare('INSERT OR IGNORE INTO live_calls (intent, action_id, destination, instruction) VALUES (?, ?, ?, ?)')
    .bind(intent, actionId, to, instruction).run()
  return result.meta.changes === 1
}

export async function bindCall(db: D1Database, { intent, callId, to }: Binding): Promise<string | null> {
  if (!hex(intent) || !id(callId) || !phone(to)) return null
  const row = await db.prepare('UPDATE OR IGNORE live_calls SET call_id = ? WHERE intent = ? AND destination = ? AND (call_id IS NULL OR call_id = ?) RETURNING instruction')
    .bind(callId, intent, to, callId).first<{ instruction: string }>()
  return row?.instruction ?? null
}

export async function markBridgeStarted(db: D1Database, callId: string): Promise<boolean> {
  if (!id(callId)) return false
  const result = await db.prepare('UPDATE live_calls SET bridge_started_at = ? WHERE call_id = ? AND bridge_started_at IS NULL')
    .bind(Date.now(), callId).run()
  return result.meta.changes === 1
}

export async function markBridgeFinished(db: D1Database, callId: string): Promise<boolean> {
  if (!id(callId)) return false
  const result = await db.prepare('UPDATE live_calls SET bridge_finished_at = MAX(bridge_started_at, ?) WHERE call_id = ? AND bridge_started_at IS NOT NULL AND bridge_finished_at IS NULL AND bridge_failed_at IS NULL')
    .bind(Date.now(), callId).run()
  return result.meta.changes === 1
}

export async function markBridgeFailed(db: D1Database, callId: string): Promise<boolean> {
  if (!id(callId)) return false
  const result = await db.prepare('UPDATE live_calls SET bridge_failed_at = MAX(bridge_started_at, ?) WHERE call_id = ? AND bridge_started_at IS NOT NULL AND bridge_finished_at IS NULL AND bridge_failed_at IS NULL')
    .bind(Date.now(), callId).run()
  return result.meta.changes === 1
}

export async function writeTranscript(db: D1Database, { callId, eventId, role, text, startMs, endMs }: Fragment): Promise<boolean> {
  if (!id(callId) || !eventIdValid(eventId) || !['business', 'agent'].includes(role) || typeof text !== 'string' || !text || text.length > 4000 ||
    !Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) || startMs < 0 || endMs < startMs) return false
  // ponytail: retain at most 2,000 fragments per call; add archival or pagination for longer calls.
  const result = await db.prepare(`INSERT OR IGNORE INTO live_call_transcripts (call_id, event_id, role, text, start_ms, end_ms)
    SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM live_calls WHERE call_id = ? AND bridge_finished_at IS NULL AND bridge_failed_at IS NULL)
    AND (SELECT count(*) FROM live_call_transcripts WHERE call_id = ?) < 2000`)
    .bind(callId, eventId, role, text, startMs, endMs, callId, callId).run()
  return result.meta.changes === 1
}

export async function readTranscript(db: D1Database, callId: string): Promise<CallLine[]> {
  if (!id(callId)) return []
  const result = await db.prepare('SELECT event_id, role, text, start_ms, end_ms FROM live_call_transcripts WHERE call_id = ? ORDER BY rowid')
    .bind(callId).all<{ event_id: string; role: 'business' | 'agent'; text: string; start_ms: number; end_ms: number }>()
  const lines: CallLine[] = []
  let previous: { line: CallLine; endMs: number } | undefined
  for (const fragment of result.results) {
    // A different speaker starts a new line, even when speech overlaps.
    if (previous && previous.line.role === fragment.role && fragment.start_ms <= previous.endMs + 1500) {
      previous.line.text += fragment.text
      previous.endMs = Math.max(previous.endMs, fragment.end_ms)
    } else {
      // GPT-Live emits no turn-complete signal; final requires separately verified session closure.
      const line: CallLine = { id: fragment.event_id, role: fragment.role, text: fragment.text, final: false }
      lines.push(line)
      previous = { line, endMs: fragment.end_ms }
    }
  }
  return lines
}

// Numbers are only conversation-grouping hints; the customer identity comes from the server-side number mapping.
function normalizeCallerNumber(value: string | null): string | null {
  if (!value || !/^[+\d() .-]+$/.test(value)) return null
  const number = value.replace(/[() .-]/g, '')
  if (/^0\d{8,11}$/.test(number)) return `+82${number.slice(1)}`
  if (/^\+820\d{8,11}$/.test(number)) return `+82${number.slice(4)}`
  return /^\+[1-9]\d{7,14}$/.test(number) ? number : null
}

type InboundConversation = { id: string; callerNumber: string | null; createdAt: number }
type InboundCall = { callId: string; createdAt: number; state: 'connecting' | 'active' | 'complete' | 'incomplete'; lines: CallLine[] }
type ConversationRow = { id: string; caller_number: string | null; created_at: number }
type CallRow = { call_id: string; created_at: number; bridge_started_at: number | null; bridge_finished_at: number | null; bridge_failed_at: number | null }

export async function createInboundCall(db: D1Database, { callId, customerId, callerNumber }: { callId: string; customerId: string; callerNumber: string | null }): Promise<string | null> {
  if (!id(callId) || !id(customerId) || (callerNumber !== null && typeof callerNumber !== 'string')) return null
  const number = normalizeCallerNumber(callerNumber)
  const conversationId = crypto.randomUUID()
  const intent = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const now = Date.now()
  // A D1 batch is transactional, so simultaneous calls from the same number cannot create two conversations.
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO live_calls (intent, direction, call_id) VALUES (?, 'inbound', ?)").bind(intent, callId),
    db.prepare(`INSERT OR IGNORE INTO inbound_conversations (id, customer_id, caller_number, created_at)
      SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM live_calls WHERE call_id = ? AND direction = 'inbound')
      AND NOT EXISTS (SELECT 1 FROM inbound_conversation_calls WHERE call_id = ?)`)
      .bind(conversationId, customerId, number, now, callId, callId),
    db.prepare(`INSERT OR IGNORE INTO inbound_conversation_calls (call_id, conversation_id, created_at)
      SELECT ?, id, ? FROM inbound_conversations WHERE customer_id = ? AND (id = ? OR (? IS NOT NULL AND caller_number = ?))
      AND EXISTS (SELECT 1 FROM live_calls WHERE call_id = ? AND direction = 'inbound')`)
      .bind(callId, now, customerId, conversationId, number, number, callId),
  ])
  const row = await db.prepare(`SELECT c.id FROM inbound_conversations c JOIN inbound_conversation_calls cc ON cc.conversation_id = c.id
    WHERE cc.call_id = ? AND c.customer_id = ?`).bind(callId, customerId).first<{ id: string }>()
  return row?.id ?? null
}

export async function listInboundConversations(db: D1Database, customerId: string): Promise<InboundConversation[]> {
  if (!id(customerId)) return []
  // ponytail: list at most 100 conversations; add cursor pagination when older conversations must be visible.
  const rows = await db.prepare('SELECT id, caller_number, created_at FROM inbound_conversations WHERE customer_id = ? ORDER BY created_at DESC, id DESC LIMIT 100')
    .bind(customerId).all<ConversationRow>()
  return rows.results.map((row) => ({ id: row.id, callerNumber: row.caller_number, createdAt: row.created_at }))
}

export async function getInboundConversation(db: D1Database, { customerId, conversationId }: { customerId: string; conversationId: string }): Promise<(InboundConversation & { calls: InboundCall[] }) | null> {
  if (!id(customerId) || !id(conversationId)) return null
  const row = await db.prepare('SELECT id, caller_number, created_at FROM inbound_conversations WHERE id = ? AND customer_id = ?')
    .bind(conversationId, customerId).first<ConversationRow>()
  if (!row) return null
  const calls = await db.prepare(`SELECT cc.call_id, cc.created_at, c.bridge_started_at, c.bridge_finished_at, c.bridge_failed_at
    FROM inbound_conversation_calls cc JOIN live_calls c ON c.call_id = cc.call_id
    WHERE cc.conversation_id = ? ORDER BY cc.created_at, cc.rowid`).bind(conversationId).all<CallRow>()
  return {
    id: row.id,
    callerNumber: row.caller_number,
    createdAt: row.created_at,
    calls: await Promise.all(calls.results.map(async (call) => ({
      callId: call.call_id,
      createdAt: call.created_at,
      state: call.bridge_finished_at !== null ? 'complete' : call.bridge_failed_at !== null ? 'incomplete' : call.bridge_started_at !== null ? 'active' : 'connecting',
      lines: await readTranscript(db, call.call_id),
    }))),
  }
}

/** Historical speech is untrusted input, not an instruction or proof of caller identity. */
export async function readPriorInboundTranscript(db: D1Database, callId: string): Promise<{ role: 'business' | 'agent'; text: string }[]> {
  if (!id(callId)) return []
  // ponytail: read at most 400 recent fragments from completed prior calls; add summarization for longer history.
  const rows = await db.prepare(`SELECT previous.call_id, t.role, t.text FROM inbound_conversation_calls current
    JOIN inbound_conversation_calls previous ON previous.conversation_id = current.conversation_id AND previous.rowid < current.rowid
    JOIN live_calls c ON c.call_id = previous.call_id AND c.bridge_finished_at IS NOT NULL
    JOIN live_call_transcripts t ON t.call_id = previous.call_id
    WHERE current.call_id = ? ORDER BY previous.rowid DESC, t.rowid DESC LIMIT 400`)
    .bind(callId).all<{ call_id: string; role: 'business' | 'agent'; text: string }>()
  const messages: { role: 'business' | 'agent'; text: string }[] = []
  let lastCallId = ''
  for (const row of rows.results.reverse()) {
    const last = messages.at(-1)
    if (last?.role === row.role && lastCallId === row.call_id) last.text += row.text
    else messages.push({ role: row.role, text: row.text })
    lastCallId = row.call_id
  }
  const bounded = messages.slice(-80)
  let remaining = 12_000
  for (let i = bounded.length - 1; i >= 0; i--) {
    bounded[i].text = bounded[i].text.slice(-remaining)
    remaining -= bounded[i].text.length
    if (!remaining) return bounded.slice(i)
  }
  return bounded
}
