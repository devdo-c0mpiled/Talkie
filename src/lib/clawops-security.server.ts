type WebhookConfig = {
  webhookUrl: string
  signingKey: string
  accountId: string
  phoneNumber: string
}

type StreamToken = { callId: string; token: string }
type StreamContext = { intent: string; to: string }
type AuthorizedWebhook = StreamToken & { direction: 'inbound' | 'outbound'; intent?: string; to: string; callerNumber: string | null }

const encoder = new TextEncoder()

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function canonicalPhone(value: string): string | null {
  if (!/^[\d+ ()-]+$/.test(value)) return null
  let digits = value.replace(/[ ()-]/g, '')
  if (digits.startsWith('+82')) digits = `0${digits.slice(3).replace(/^0/, '')}`
  if (digits.includes('+')) return null
  if (/^1[5-8]\d{6}$/.test(digits)) return digits
  return /^0\d{8,11}$/.test(digits) && !digits.startsWith('060') ? digits : null
}

async function verifiedFields(request: Request, signingKey: string): Promise<Map<string, string> | null> {
  if (!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) return null
  const signature = request.headers.get('x-signature') ?? ''
  if (!request.body) return null
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let body = ''
  let bytes = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 16_384) {
        await reader.cancel()
        return null
      }
      body += decoder.decode(value, { stream: true })
    }
    body += decoder.decode()
  } catch {
    return null
  } finally {
    reader.releaseLock()
  }
  const params = new URLSearchParams(body)
  const fields = new Map<string, string>()
  for (const [key, value] of params) {
    if (fields.has(key) || !/^[\x20-\x7e]+$/.test(key)) return null
    fields.set(key, value)
  }
  if (signingKey) {
    if (!/^[A-Za-z0-9+/]{43}=$/.test(signature)) return null
    const signedData = request.url + [...fields.keys()].sort().map((key) => key + fields.get(key)).join('')
    const key = await crypto.subtle.importKey('raw', encoder.encode(signingKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
    const signatureBytes = Uint8Array.from(atob(signature), (char) => char.charCodeAt(0))
    if (!await crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(signedData))) return null
  }

  return fields
}

export async function authorizeClawOpsWebhook(
  request: Request,
  config: WebhookConfig,
  db: D1Database,
  bindOutbound?: (context: { intent: string; callId: string; to: string }) => Promise<boolean>,
  bindInbound?: (context: { callId: string; to: string; callerNumber: string | null }) => Promise<boolean>,
): Promise<AuthorizedWebhook | null> {
  if (request.method !== 'POST' || !config.accountId) return null
  const baseUrl = config.webhookUrl
  const outboundMatch = request.url.match(/^(.+)\?intent=([0-9a-f]{64})$/)
  const intent = outboundMatch?.[1] === baseUrl ? outboundMatch[2] : undefined
  if (request.url !== baseUrl && !intent) return null
  if (!config.signingKey && intent && !bindOutbound) return null
  const fields = await verifiedFields(request, intent ? config.signingKey : '')
  if (!fields) return null
  const direction = fields.get('Direction')

  const callId = fields.get('CallId') ?? ''
  const ownedPhone = canonicalPhone(config.phoneNumber)
  const actualPhone = canonicalPhone(fields.get(direction === 'inbound' ? 'To' : 'From') ?? '')
  const to = canonicalPhone(fields.get('To') ?? '')
  const fromValue = fields.get('From') ?? ''
  const from = canonicalPhone(fromValue) || (/^\+[1-9]\d{7,14}$/.test(fromValue) ? fromValue : null)
  if (!callId || callId.length > 256 || /[\x00-\x1f\x7f]/.test(callId) || fields.get('AccountId') !== config.accountId || !['inbound', 'outbound'].includes(direction ?? '') || !to || (direction === 'outbound') !== Boolean(intent)) return null
  if (direction === 'outbound' && (!ownedPhone || actualPhone !== ownedPhone)) return null
  if (direction === 'inbound' && (!ownedPhone || actualPhone !== ownedPhone)) return null
  const callerNumber = fields.get('CallerIdRestricted') === 'true' ? null : from
  if (intent && bindOutbound && !await bindOutbound({ intent, callId, to })) return null
  if (direction === 'inbound' && bindInbound && !await bindInbound({ callId, to, callerNumber })) return null

  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const [callHash, tokenHash, intentHash, toHash] = await Promise.all([
    sha256(callId), sha256(token), intent ? sha256(intent) : null, intent ? sha256(to) : null,
  ])
  // ponytail: Call hashes are retained to prevent replay of old webhooks; add a verified provider retention bound before pruning.
  const result = await db.prepare('INSERT INTO clawops_stream_tokens (call_hash, token_hash, intent_hash, to_hash, expires_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(call_hash) DO NOTHING')
    .bind(callHash, tokenHash, intentHash, toHash, Date.now() + 5 * 60_000).run()
  return result.meta.changes === 1 ? { callId, token, direction: direction as 'inbound' | 'outbound', intent, to, callerNumber } : null
}

export async function consumeClawOpsStreamToken(db: D1Database, { callId, token }: StreamToken, context?: StreamContext): Promise<boolean> {
  if (typeof callId !== 'string' || !callId || callId.length > 256 || typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return false
  if (context && (!/^[0-9a-f]{64}$/.test(context.intent) || !/^\d{8,15}$/.test(context.to))) return false
  const [callHash, tokenHash, intentHash, toHash] = await Promise.all([
    sha256(callId), sha256(token), context ? sha256(context.intent) : null, context ? sha256(context.to) : null,
  ])
  const result = await db.prepare('UPDATE clawops_stream_tokens SET token_hash = NULL WHERE call_hash = ? AND token_hash = ? AND intent_hash IS ? AND to_hash IS ? AND expires_at > ?')
    .bind(callHash, tokenHash, intentHash, toHash, Date.now()).run()
  return result.meta.changes === 1
}

export async function issueClawOpsGather(db: D1Database, call: AuthorizedWebhook): Promise<string | null> {
  if (call.direction !== 'inbound') return null
  const gatherToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const [callHash, tokenHash, callerHash, toHash] = await Promise.all([
    sha256(call.callId), sha256(gatherToken), call.callerNumber ? sha256(call.callerNumber) : null, sha256(call.to),
  ])
  const result = await db.prepare('INSERT INTO clawops_gather_tokens (call_hash, token_hash, caller_hash, to_hash, expires_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(call_hash) DO NOTHING')
    .bind(callHash, tokenHash, callerHash, toHash, Date.now() + 5 * 60_000).run()
  return result.meta.changes === 1 ? gatherToken : null
}

export async function authorizeClawOpsGather(request: Request, config: WebhookConfig, db: D1Database): Promise<(StreamToken & { callerNumber: string | null; digits: string }) | null> {
  const match = request.url.match(/^(.+)\?gather=([0-9a-f]{64})$/)
  if (request.method !== 'POST' || !match || match[1] !== config.webhookUrl) return null
  const fields = await verifiedFields(request, '')
  if (!fields || fields.get('Direction') !== 'inbound') return null
  const callId = fields.get('CallId') ?? ''
  const fromValue = fields.get('From') ?? ''
  const from = canonicalPhone(fromValue) || (/^\+[1-9]\d{7,14}$/.test(fromValue) ? fromValue : null)
  const callerNumber = fields.get('CallerIdRestricted') === 'true' ? null : from
  const to = canonicalPhone(fields.get('To') ?? '')
  if (!callId || callId.length > 256 || /[\x00-\x1f\x7f]/.test(callId) || !to || to !== canonicalPhone(config.phoneNumber)) return null
  const [callHash, tokenHash, callerHash, toHash] = await Promise.all([
    sha256(callId), sha256(match[2]), callerNumber ? sha256(callerNumber) : null, sha256(to),
  ])
  const result = await db.prepare('UPDATE clawops_gather_tokens SET consumed_at = ? WHERE call_hash = ? AND token_hash = ? AND caller_hash IS ? AND to_hash = ? AND expires_at > ? AND consumed_at IS NULL')
    .bind(Date.now(), callHash, tokenHash, callerHash, toHash, Date.now()).run()
  if (result.meta.changes !== 1) return null
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const streamTokenHash = await sha256(token)
  const updated = await db.prepare('UPDATE clawops_stream_tokens SET token_hash = ? WHERE call_hash = ? AND token_hash IS NOT NULL AND intent_hash IS NULL AND to_hash IS NULL AND expires_at > ?')
    .bind(streamTokenHash, callHash, Date.now()).run()
  if (updated.meta.changes !== 1) return null
  return { callId, token, callerNumber, digits: fields.get('Digits') ?? '' }
}
