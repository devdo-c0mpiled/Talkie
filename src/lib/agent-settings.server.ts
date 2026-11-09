import '@tanstack/react-start/server-only'
import { env } from 'cloudflare:workers'
import { z } from 'zod'
import { getAuth } from './auth.server'
import { getOrCreateCustomer } from './customers.server'

const headers = { 'Cache-Control': 'private, no-store' }
const settingsSchema = z.strictObject({
  language: z.string().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/).max(35).nullable(),
  voice: z.enum(['marin', 'quartz', 'ripple', 'vesper', 'willow', 'stone', 'gleam', 'meridian', 'bossa', 'tempo', 'beacon', 'delta', 'cinder', 'nuri', 'juni', 'flitz', 'brise', 'sillage', 'nira', 'harema', 'shida', 'noeul']),
  responseRules: z.string().max(4000),
})
type AgentSettings = z.infer<typeof settingsSchema>
type SettingsRow = { language: string | null; voice: string | null; response_rules: string | null }
const defaults: AgentSettings = { language: null, voice: 'marin', responseRules: '' }

function settingsFromRow(row: SettingsRow): AgentSettings {
  if (row.voice === null) return defaults
  return settingsSchema.parse({ language: row.language, voice: row.voice, responseRules: row.response_rules })
}

export async function getInboundAgentSettings(db: D1Database, callId: string): Promise<AgentSettings | null> {
  const row = await db.prepare(`SELECT s.language, s.voice, s.response_rules
    FROM inbound_conversation_calls ic
    JOIN inbound_conversations c ON c.id = ic.conversation_id
    JOIN customers customer ON printf('%04d', customer.customer_no) = c.customer_id AND customer.user_id IS NOT NULL
    LEFT JOIN agent_settings s ON s.customer_no = customer.customer_no
    WHERE ic.call_id = ?`).bind(callId).first<SettingsRow>()
  return row ? settingsFromRow(row) : null
}

export async function handleAgentSettings(request: Request): Promise<Response> {
  const session = await getAuth().api.getSession({ headers: request.headers })
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401, headers })
  if (request.method === 'POST' && request.headers.get('Origin') !== new URL(env.BETTER_AUTH_URL).origin) {
    return Response.json({ error: 'Forbidden' }, { status: 403, headers })
  }
  const customer = await getOrCreateCustomer({ db: env.DB, userId: session.user.id, designatedEmail: env.CUSTOMER_0001_EMAIL })
  if (customer.kind !== 'ready') return Response.json({ error: 'Customer unavailable' }, { status: 503, headers })
  if (request.method === 'GET') {
    const row = await env.DB.prepare(`SELECT s.language, s.voice, s.response_rules FROM customers c
      LEFT JOIN agent_settings s ON s.customer_no = c.customer_no WHERE c.user_id = ?`)
      .bind(session.user.id).first<SettingsRow>()
    return Response.json(row ? settingsFromRow(row) : defaults, { headers })
  }
  let body: unknown
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid request' }, { status: 400, headers }) }
  const parsed = settingsSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400, headers })
  const { language, voice, responseRules } = parsed.data
  await env.DB.prepare(`INSERT INTO agent_settings (customer_no, language, voice, response_rules)
    SELECT customer_no, ?, ?, ? FROM customers WHERE user_id = ?
    ON CONFLICT(customer_no) DO UPDATE SET language = excluded.language, voice = excluded.voice, response_rules = excluded.response_rules`)
    .bind(language, voice, responseRules, session.user.id).run()
  return Response.json(parsed.data, { headers })
}
