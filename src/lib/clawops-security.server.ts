type WebhookConfig = {
  webhookUrl: string
  signingKey: string
  accountId: string
  phoneNumber: string
}

type StreamToken = { callId: string; token: string }

const encoder = new TextEncoder()

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function canonicalPhone(value: string): string | null {
  const digits = value.replace(/[ -]/g, '')
  if (/^\+82\d{8,12}$/.test(digits)) return `0${digits.slice(3)}`
  return /^0\d{8,12}$/.test(digits) ? digits : null
}

export async function authorizeClawOpsWebhook(
  request: Request,
  config: WebhookConfig,
  db: D1Database,
): Promise<StreamToken | null> {
  if (request.method !== 'POST' || request.url !== config.webhookUrl || !config.signingKey || !config.accountId) return null
  if (!/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) return null
  const signature = request.headers.get('x-signature') ?? ''
  if (!/^[A-Za-z0-9+/]{43}=$/.test(signature)) return null
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
  const signedData = config.webhookUrl + [...fields.keys()].sort().map((key) => key + fields.get(key)).join('')
  const key = await crypto.subtle.importKey('raw', encoder.encode(config.signingKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const signatureBytes = Uint8Array.from(atob(signature), (char) => char.charCodeAt(0))
  if (!await crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(signedData))) return null

  const callId = fields.get('CallId') ?? ''
  const direction = fields.get('Direction')
  const ownedPhone = canonicalPhone(config.phoneNumber)
  const actualPhone = canonicalPhone(fields.get(direction === 'inbound' ? 'To' : 'From') ?? '')
  if (!callId || callId.length > 256 || /[\x00-\x1f\x7f]/.test(callId) || fields.get('AccountId') !== config.accountId || !['inbound', 'outbound'].includes(direction ?? '') || !ownedPhone || actualPhone !== ownedPhone) return null

  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const [callHash, tokenHash] = await Promise.all([sha256(callId), sha256(token)])
  // ponytail: Call hashes are retained to prevent replay of old signed webhooks; add a verified provider retention bound before pruning.
  const result = await db.prepare('INSERT INTO clawops_stream_tokens (call_hash, token_hash, expires_at) VALUES (?, ?, ?) ON CONFLICT(call_hash) DO NOTHING')
    .bind(callHash, tokenHash, Date.now() + 5 * 60_000).run()
  return result.meta.changes === 1 ? { callId, token } : null
}

export async function consumeClawOpsStreamToken(db: D1Database, { callId, token }: StreamToken): Promise<boolean> {
  if (typeof callId !== 'string' || !callId || callId.length > 256 || typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return false
  const [callHash, tokenHash] = await Promise.all([sha256(callId), sha256(token)])
  const result = await db.prepare('UPDATE clawops_stream_tokens SET token_hash = NULL WHERE call_hash = ? AND token_hash = ? AND expires_at > ?')
    .bind(callHash, tokenHash, Date.now()).run()
  return result.meta.changes === 1
}
