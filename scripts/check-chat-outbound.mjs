import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

const bundle = await build({
  entryPoints: ['scripts/check-chat-outbound-worker.mjs'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022', external: ['node:*'],
  plugins: [{ name: 'synthetic-bindings', setup(build) {
    build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'mock-env' }))
    build.onLoad({ filter: /.*/, namespace: 'mock-env' }, () => ({ contents: 'export const env = globalThis.__testEnv = {}', loader: 'js' }))
    build.onResolve({ filter: /^@tanstack\/react-start\/server-only$/ }, () => ({ path: 'server-only', namespace: 'mock-env' }))
  } }],
})
const worker = new Miniflare({ workers: [{ config: {
  name: 'outbound-test', compatibilityDate: '2026-11-08', compatibilityFlags: ['nodejs_compat'],
  env: { DB: { type: 'd1', id: 'synthetic-outbound-db' } },
  manifest: { mainModule: 'worker.mjs', modules: { 'worker.mjs': { type: 'esm', contents: bundle.outputFiles[0].text } } },
} }] })
const run = async (body) => (await worker.dispatchFetch('https://example.test/', { method: 'POST', body: JSON.stringify(body) })).json()
try {
  for (const number of ['001123456789', '002123456789', '006123456789', '+82001123456789', '06012345678', '0912345678']) {
    assert.equal(await run({ type: 'normalize', number }), null, `reject ${number}`)
  }
  for (const [number, expected] of [['02-1234-5678', '0212345678'], ['010-1234-5678', '01012345678'], ['+82 31 123 4567', '0311234567'], ['070-1234-5678', '07012345678'], ['1588-1234', '15881234']]) {
    assert.equal(await run({ type: 'normalize', number }), expected, `accept ${number}`)
  }
  const db = await worker.getD1Database('DB')
  for (const statement of (await readFile('migrations/0004_live_call_transcripts.sql', 'utf8')).split(';').filter(x => x.trim())) await db.prepare(statement).run()
  const first = await run({ action: 'action-1', mode: 'webhook-first' })
  assert.deepEqual(first, { callId: 'CA_webhook' })
  const events = await run({ type: 'events' })
  assert.equal(events.length, 1)
  assert.equal(events[0].payload.To, '0212345678')
  assert.equal(events[0].payload.From, '07012340000')
  assert.equal(new URL(events[0].payload.Url).origin, 'https://example.test')
  assert.match(new URL(events[0].payload.Url).searchParams.get('intent'), /^[a-f0-9]{64}$/)
  assert.ok(!('AgentId' in events[0].payload) && !('CallContext' in events[0].payload))
  assert.equal((await run({ action: 'action-1' })).error, 'unknown')
  assert.equal((await run({ action: 'action-2', mode: 'unknown' })).error, 'unknown')
  assert.equal((await run({ action: 'action-5', mode: 'rejected' })).error, 'rejected')
  assert.equal((await run({ type: 'events' })).length, 3)
  const statusRequest = async (mode) => worker.dispatchFetch('https://example.test/', { method: 'POST', body: JSON.stringify({ type: 'status', callId: 'CA_webhook', mode }) })
  const unavailable = await statusRequest('status-failure')
  assert.equal(unavailable.status, 502)
  assert.equal(unavailable.headers.get('cache-control'), 'no-store')
  assert.equal((await statusRequest('status-malformed')).status, 502)
  const status = await statusRequest('status-ok')
  assert.equal(status.status, 200)
  assert.equal(status.headers.get('cache-control'), 'no-store')
  assert.equal((await status.json()).state, 'calling')
  assert.deepEqual(await run({ type: 'result', callId: 'CA_webhook', mode: 'status-failure' }), { state: 'unknown', outcome: 'status-unavailable' })
  const oversized = await run({ action: 'oversized', instruction: '가'.repeat(4001) })
  assert.equal(oversized.error, 'instruction-too-long')
  assert.equal((await run({ type: 'events' })).length, 3)
  assert.equal((await (await statusRequest('status-no-answer')).json()).state, 'done')
  const beforeFlush = await (await statusRequest('status-completed')).json()
  assert.equal(beforeFlush.state, 'calling')
  await db.prepare('UPDATE live_calls SET bridge_finished_at = ? WHERE call_id = ?').bind(Date.now(), 'CA_webhook').run()
  const afterFlush = await (await statusRequest('status-completed')).json()
  assert.equal(afterFlush.state, 'done')
  assert.equal(afterFlush.transcriptIncomplete, undefined)
  await db.prepare('UPDATE live_calls SET bridge_finished_at = NULL, provider_completed_at = ? WHERE call_id = ?').bind(Date.now() - 30_001, 'CA_webhook').run()
  const fallback = await (await statusRequest('status-completed')).json()
  assert.equal(fallback.state, 'done')
  assert.equal(fallback.transcriptIncomplete, true)
  const incomplete = await run({ type: 'result', callId: 'CA_webhook', mode: 'status-completed' })
  assert.equal(incomplete.transcriptIncomplete, true)
  assert.deepEqual(await run({ type: 'recording-counts' }), { recordings: 3, transcriptions: 0 })
  const failedRecording = await run({ type: 'result', callId: 'CA_webhook', mode: 'recording-failure' })
  assert.equal(failedRecording.transcriptIncomplete, true)
  assert.deepEqual(await run({ type: 'recording-counts' }), { recordings: 4, transcriptions: 0 })
  const recorded = await run({ type: 'result', callId: 'CA_webhook', mode: 'recording-delayed' })
  assert.equal(recorded.transcript, 'Synthetic recording transcript')
  assert.equal(recorded.transcriptIncomplete, undefined)
  assert.equal((await run({ type: 'result', callId: 'CA_webhook', mode: 'recording' })).transcript, recorded.transcript)
  assert.deepEqual(await run({ type: 'recording-counts' }), { recordings: 7, transcriptions: 1 })
  await db.prepare('INSERT INTO live_call_transcripts (call_id, event_id, role, text, start_ms, end_ms) VALUES (?, ?, ?, ?, ?, ?)')
    .bind('CA_webhook', 'event-1', 'business', 'Live transcript', 0, 1).run()
  assert.equal((await run({ type: 'result', callId: 'CA_webhook', mode: 'recording' })).transcript, 'Business: Live transcript')
  assert.deepEqual(await run({ type: 'recording-counts' }), { recordings: 7, transcriptions: 1 })
  console.log('Outbound URL, webhook race, duplicate and unknown checks passed with synthetic D1 and provider')
} finally { await worker.dispose() }
