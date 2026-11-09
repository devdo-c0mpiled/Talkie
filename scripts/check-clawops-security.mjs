import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

const bundle = await build({ entryPoints: ['src/lib/clawops-security.server.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { authorizeClawOpsWebhook, consumeClawOpsStreamToken } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const worker = new Miniflare({ workers: [{ config: { name: 'clawops-security-check', compatibilityDate: '2026-11-08', env: { DB: { type: 'd1', id: 'synthetic-db' } }, manifest: { mainModule: 'worker.mjs', modules: { 'worker.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } } } }] })
try {
  const db = await worker.getD1Database('DB')
  await db.prepare(await readFile('migrations/0003_clawops_stream_tokens.sql', 'utf8')).run()
  const config = { webhookUrl: 'https://example.test/voice', signingKey: 'synthetic-key', accountId: 'AC_TEST', phoneNumber: '07012340000' }
  const params = { CallId: 'CA_TEST', AccountId: 'AC_TEST', From: '01012340000', To: '07012340000', CallStatus: 'in-progress', Direction: 'inbound' }
  function request(values = params, signatureValues = values, url = config.webhookUrl) {
    const data = config.webhookUrl + Object.keys(signatureValues).sort().map((key) => key + signatureValues[key]).join('')
    const signature = createHmac('sha256', config.signingKey).update(data).digest('base64')
    return new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Signature': signature }, body: new URLSearchParams(values) })
  }
  let cancelled = false
  const oversized = new ReadableStream({
    pull(controller) { controller.enqueue(new Uint8Array(16_385).fill(65)) },
    cancel() { cancelled = true },
  })
  const oversizedRequest = new Request(config.webhookUrl, { method: 'POST', headers: request().headers, body: oversized, duplex: 'half' })
  assert.equal(await authorizeClawOpsWebhook(oversizedRequest, config, db), null)
  assert.equal(cancelled, true, 'oversized request must be cancelled while reading')
  let chunksCancelled = false
  const chunks = new ReadableStream({
    pull(controller) { controller.enqueue(new TextEncoder().encode('가'.repeat(4_000))) },
    cancel() { chunksCancelled = true },
  })
  const chunksRequest = new Request(config.webhookUrl, { method: 'POST', headers: request().headers, body: chunks, duplex: 'half' })
  assert.equal(await authorizeClawOpsWebhook(chunksRequest, config, db), null)
  assert.equal(chunksCancelled, true, 'the limit counts bytes across chunks, not decoded characters')
  const edgeValues = { ...params, CallId: 'CA_EDGE', Padding: '' }
  edgeValues.Padding = 'x'.repeat(16_384 - new URLSearchParams(edgeValues).toString().length)
  assert.ok(await authorizeClawOpsWebhook(request(edgeValues), config, db), 'a valid 16 KiB request is accepted')
  assert.equal(await authorizeClawOpsWebhook(request({ ...params, To: '07099999999' }), config, db), null)
  assert.equal(await authorizeClawOpsWebhook(request({ ...params, AccountId: 'AC_OTHER' }), config, db), null)
  assert.equal(await authorizeClawOpsWebhook(request(params, { ...params, From: '01000000000' }), config, db), null)
  assert.equal(await authorizeClawOpsWebhook(request(params, params, 'https://evil.test/voice'), config, db), null)
  const duplicated = request()
  const body = `${await duplicated.text()}&To=07012340000`
  assert.equal(await authorizeClawOpsWebhook(new Request(config.webhookUrl, { method: 'POST', headers: duplicated.headers, body }), config, db), null)
  const issued = await authorizeClawOpsWebhook(request(), config, db)
  assert.ok(issued?.token)
  assert.equal(issued.callId, params.CallId)
  assert.equal(await authorizeClawOpsWebhook(request(), config, db), null, 'a signed webhook cannot issue a second token for the same call')
  assert.equal(await consumeClawOpsStreamToken(db, { callId: 'CA_OTHER', token: issued.token }), false)
  assert.equal(await consumeClawOpsStreamToken(db, { callId: issued.callId, token: 'wrong-token' }), false)
  const attempts = await Promise.all(Array.from({ length: 4 }, () => consumeClawOpsStreamToken(db, issued)))
  assert.equal(attempts.filter(Boolean).length, 1, 'concurrent stream starts consume the token once')
  assert.equal(await authorizeClawOpsWebhook(request(), config, db), null, 'used calls remain replay protected')
  const expired = await authorizeClawOpsWebhook(request({ ...params, CallId: 'CA_EXPIRED' }), config, db)
  assert.ok(expired)
  await db.prepare('UPDATE clawops_stream_tokens SET expires_at = 0').run()
  assert.equal(await consumeClawOpsStreamToken(db, expired), false)
  assert.equal(await authorizeClawOpsWebhook(request({ ...params, CallId: 'CA_EXPIRED' }), config, db), null)
  const outbound = await authorizeClawOpsWebhook(request({ ...params, CallId: 'CA_OUTBOUND', Direction: 'outbound', From: '07012340000', To: '01012340000' }), config, db)
  assert.ok(outbound, 'outbound calls check the owned From number')
  console.log('ClawOps signature, replay and stream token checks passed')
} finally {
  await worker.dispose()
}
