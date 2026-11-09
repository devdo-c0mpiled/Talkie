import '@tanstack/react-start/server-only'
import { z } from 'zod'

const headers = { 'Cache-Control': 'private, no-store' }
const messageSchema = z.object({
  id: z.string().regex(/^[\w-]{1,256}$/),
  role: z.enum(['user', 'assistant']),
  text: z.string().min(1).max(10_000).refine((text) => Boolean(text.trim())),
}).strict()

export async function handleChatHistory(request: Request, { db, userId }: { db: D1Database; userId: string | null }): Promise<Response> {
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401, headers })
  const conversationId = new URL(request.url).searchParams.get('history')
  if (!conversationId || !/^[\w-]{1,256}$/.test(conversationId)) return Response.json({ error: 'Invalid conversation' }, { status: 400, headers })
  const owner = await db.prepare(`SELECT c.id FROM inbound_conversations c JOIN customers u
    ON c.customer_id = printf('%04d', u.customer_no) WHERE c.id = ? AND u.user_id = ?`)
    .bind(conversationId, userId).first()
  if (!owner) return Response.json({ error: 'Not found' }, { status: 404, headers })
  if (request.method === 'GET') {
    const rows = await db.prepare('SELECT message_id AS id, role, text FROM inbound_chat_messages WHERE conversation_id = ? ORDER BY rowid')
      .bind(conversationId).all<{ id: string; role: 'user' | 'assistant'; text: string }>()
    return Response.json({ messages: rows.results }, { headers })
  }
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers })
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: 'Invalid origin' }, { status: 403, headers })
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return Response.json({ error: 'Invalid content type' }, { status: 400, headers })
  const raw = await request.text()
  if (raw.length > 61_000) return Response.json({ error: 'Message too large' }, { status: 400, headers })
  let body: unknown
  try { body = JSON.parse(raw) } catch { return Response.json({ error: 'Invalid message' }, { status: 400, headers }) }
  const parsed = messageSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'Invalid message' }, { status: 400, headers })
  const message = parsed.data
  await db.prepare(`INSERT OR IGNORE INTO inbound_chat_messages (conversation_id, message_id, role, text)
    SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM inbound_conversations c JOIN customers u
      ON c.customer_id = printf('%04d', u.customer_no) WHERE c.id = ? AND u.user_id = ?)`)
    .bind(conversationId, message.id, message.role, message.text, conversationId, userId).run()
  const saved = await db.prepare('SELECT role, text FROM inbound_chat_messages WHERE conversation_id = ? AND message_id = ?')
    .bind(conversationId, message.id).first<{ role: string; text: string }>()
  if (!saved || saved.role !== message.role || saved.text !== message.text) return Response.json({ error: 'Message conflict' }, { status: 409, headers })
  return Response.json({ ok: true }, { headers })
}
