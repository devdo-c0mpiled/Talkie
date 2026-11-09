import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

const bundle = await build({ entryPoints: ['src/lib/call-store.server.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { createInboundCall, listInboundConversations, getInboundConversation, markBridgeStarted, markBridgeFinished, markBridgeFailed, writeTranscript, readPriorInboundTranscript } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const worker = new Miniflare({ workers: [{ config: { name: 'inbound-store-check', compatibilityDate: '2026-11-08', env: { DB: { type: 'd1', id: 'synthetic-inbound-db' } }, manifest: { mainModule: 'worker.mjs', modules: { 'worker.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } } } }] })
try {
  const db = await worker.getD1Database('DB')
  const migration = await readFile('migrations/0004_live_call_transcripts.sql', 'utf8')
  for (const statement of migration.split(';').map((s) => s.trim()).filter(Boolean)) await db.prepare(statement).run()

  const call = { callId: 'CA_1', customerId: 'CUSTOMER_A', callerNumber: '010-1234-5678' }
  const first = await createInboundCall(db, call)
  assert.ok(first)
  assert.equal(await createInboundCall(db, call), first, 'a duplicate webhook preserves the conversation')
  assert.equal(await createInboundCall(db, { ...call, customerId: 'CUSTOMER_B' }), null, 'another customer cannot claim the same call')
  assert.equal(await createInboundCall(db, { ...call, callId: 'CA_2', callerNumber: '+82 10 1234 5678' }), first, 'same customer and normalized caller share a conversation')
  const other = await createInboundCall(db, { ...call, callId: 'CA_3', customerId: 'CUSTOMER_B' })
  assert.ok(other && other !== first, 'same caller is isolated across customers')
  const anonymous1 = await createInboundCall(db, { ...call, callId: 'CA_4', callerNumber: null })
  const anonymous2 = await createInboundCall(db, { ...call, callId: 'CA_5', callerNumber: 'unknown' })
  assert.ok(anonymous1 && anonymous2 && anonymous1 !== anonymous2, 'unknown callers do not merge')
  assert.equal(await createInboundCall(db, { ...call, callId: 'CA_4', callerNumber: null }), anonymous1)
  const racing = await Promise.all(Array.from({ length: 5 }, (_, i) => createInboundCall(db, { ...call, callId: `CA_RACE_${i}`, callerNumber: '02-1234-5678' })))
  assert.equal(new Set(racing).size, 1, 'simultaneous calls share one conversation')
  const claims = await Promise.all(['CUSTOMER_C', 'CUSTOMER_D'].map((customerId) => createInboundCall(db, { ...call, callId: 'CA_CLAIM', customerId, callerNumber: null })))
  assert.equal(claims.filter(Boolean).length, 1, 'one call can have only one customer even during a race')
  assert.equal((await listInboundConversations(db, 'CUSTOMER_B')).length, 1)
  assert.equal(await getInboundConversation(db, { customerId: 'CUSTOMER_B', conversationId: first }), null)

  assert.equal(await markBridgeStarted(db, 'CA_1'), true)
  assert.equal(await writeTranscript(db, { callId: 'CA_1', eventId: 'one', role: 'business', text: '안녕', startMs: 0, endMs: 1 }), true)
  assert.equal(await markBridgeFinished(db, 'CA_1'), true)
  assert.equal(await markBridgeFailed(db, 'CA_1'), false, 'completed transcripts cannot become incomplete')
  assert.equal(await markBridgeStarted(db, 'CA_2'), true)
  assert.equal(await markBridgeFailed(db, 'CA_2'), true)
  const detail = await getInboundConversation(db, { customerId: 'CUSTOMER_A', conversationId: first })
  assert.equal(detail.calls.length, 2)
  assert.equal(detail.calls[0].lines[0].text, '안녕')
  assert.equal(detail.calls[0].state, 'complete')
  assert.equal(detail.calls[1].state, 'incomplete')
  assert.deepEqual(await readPriorInboundTranscript(db, 'CA_1'), [], 'current and later calls are excluded')
  assert.deepEqual(await readPriorInboundTranscript(db, 'CA_2'), [{ role: 'business', text: '안녕' }], 'a later call may see completed prior calls')
  assert.deepEqual(await readPriorInboundTranscript(db, 'CA_3'), [], 'other customers never share prior calls')
  assert.deepEqual(await readPriorInboundTranscript(db, 'missing'), [])
  await createInboundCall(db, { ...call, callId: 'CA_LONG' })
  await markBridgeStarted(db, 'CA_LONG')
  for (let i = 0; i < 4; i++) {
    await writeTranscript(db, { callId: 'CA_LONG', eventId: `long_${i}`, role: 'agent', text: 'x'.repeat(4000), startMs: i, endMs: i })
  }
  await markBridgeFinished(db, 'CA_LONG')
  await createInboundCall(db, { ...call, callId: 'CA_LATER' })
  const history = await readPriorInboundTranscript(db, 'CA_LATER')
  assert.equal(history.reduce((length, message) => length + message.text.length, 0), 12000, 'history is bounded')
  console.log('Inbound conversation reuse, isolation and per-call transcripts passed')
} finally {
  await worker.dispose()
}
