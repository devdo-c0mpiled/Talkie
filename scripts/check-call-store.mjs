import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

const bundle = await build({ entryPoints: ['src/lib/call-store.server.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { reserveCall, bindCall, markBridgeStarted, markBridgeFinished, writeTranscript, readTranscript } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const worker = new Miniflare({ workers: [{ config: { name: 'call-store-check', compatibilityDate: '2026-11-08', env: { DB: { type: 'd1', id: 'synthetic-db' } }, manifest: { mainModule: 'worker.mjs', modules: { 'worker.mjs': { type: 'esm', contents: 'export default { fetch() { return new Response("ok") } }' } } } } }] })
try {
  const db = await worker.getD1Database('DB')
  const migration = await readFile('migrations/0004_live_call_transcripts.sql', 'utf8')
  for (const statement of migration.split(';').map((s) => s.trim()).filter(Boolean)) await db.prepare(statement).run()
  const intent = 'a'.repeat(64), actionId = 'b'.repeat(64), to = '01012345678', instruction = '예약을 확인해주세요'
  const reservation = { intent, actionId, to, instruction }
  assert.equal(await reserveCall(db, { ...reservation, intent: "' OR 1=1 --" }), false)
  assert.equal((await Promise.all(Array.from({ length: 6 }, () => reserveCall(db, reservation)))).filter(Boolean).length, 1)
  assert.equal(await reserveCall(db, { ...reservation, intent: 'c'.repeat(64) }), false, 'same action never triggers a second call')
  assert.equal(await bindCall(db, { intent, to: '01099999999', callId: 'CA_TEST' }), null)
  assert.equal(await bindCall(db, { intent, to, callId: 'CA_TEST' }), instruction, 'webhook can bind before the call creation response')
  assert.equal(await bindCall(db, { intent, to, callId: 'CA_TEST' }), instruction)
  assert.equal(await bindCall(db, { intent, to, callId: 'CA_OTHER' }), null)
  assert.ok(await reserveCall(db, { ...reservation, intent: 'c'.repeat(64), actionId: 'd'.repeat(64) }))
  assert.equal(await bindCall(db, { intent: 'c'.repeat(64), to, callId: 'CA_TEST' }), null, 'a call ID cannot bind to two reservations')
  const racing = await Promise.all(['CA_RACE_1', 'CA_RACE_2'].map((callId) => bindCall(db, { intent: 'c'.repeat(64), to, callId })))
  assert.equal(racing.filter(Boolean).length, 1, 'different call IDs cannot race to claim one intent')
  const event = { callId: 'CA_TEST', eventId: 'event_1', role: 'business', text: '안녕', startMs: 10, endMs: 20 }
  assert.equal(await writeTranscript(db, { ...event, callId: 'UNKNOWN' }), false)
  assert.equal(await writeTranscript(db, { ...event, endMs: 0 }), false)
  assert.equal((await Promise.all(Array.from({ length: 4 }, () => writeTranscript(db, event)))).filter(Boolean).length, 1, 'replayed events are idempotent')
  await writeTranscript(db, { ...event, eventId: 'event_2', role: 'agent', text: '네', startMs: 11, endMs: 21 })
  await writeTranscript(db, { ...event, eventId: 'event_3', text: ' 하세요', startMs: 21, endMs: 22 })
  await writeTranscript(db, { ...event, eventId: 'event_4', text: '다시', startMs: 3000, endMs: 3000 })
  assert.deepEqual(await readTranscript(db, 'CA_TEST'), [
    { id: 'event_1', role: 'business', text: '안녕', final: false },
    { id: 'event_2', role: 'agent', text: '네', final: false },
    { id: 'event_3', role: 'business', text: ' 하세요', final: false },
    { id: 'event_4', role: 'business', text: '다시', final: false },
  ])
  assert.deepEqual(await readTranscript(db, 'CA_OTHER'), [])
  await db.prepare("WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 1996) INSERT INTO live_call_transcripts SELECT 'CA_TEST', 'extra_' || i, 'agent', 'x', i, i FROM n").run()
  assert.equal(await writeTranscript(db, { ...event, eventId: 'beyond_limit' }), false, 'fragment cap prevents unbounded growth')
  assert.equal(await markBridgeFinished(db, 'CA_TEST'), false, 'completion requires a started bridge')
  assert.equal(await markBridgeStarted(db, 'CA_TEST'), true)
  assert.equal(await markBridgeStarted(db, 'CA_TEST'), false, 'a bridge cannot start twice')
  assert.equal(await markBridgeFinished(db, 'CA_TEST'), true)
  assert.equal(await markBridgeFinished(db, 'CA_TEST'), false)
  assert.equal(await writeTranscript(db, { ...event, eventId: 'after_finish' }), false)
  const state = await db.prepare('SELECT bridge_started_at, bridge_finished_at, provider_completed_at FROM live_calls WHERE call_id = ?').bind('CA_TEST').first()
  assert.ok(state.bridge_started_at > 0 && state.bridge_finished_at >= state.bridge_started_at && state.provider_completed_at === null)
  console.log('Call reservation, binding, replay and transcript checks passed')
} finally {
  await worker.dispose()
}
