import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { build } from 'esbuild'

const output = await build({ entryPoints: ['src/lib/sfu-control.server.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { handleSfuControl } = await import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].contents).toString('base64')}`)
const sqlite = new DatabaseSync(':memory:')
sqlite.exec("CREATE TABLE \"user\" (id TEXT PRIMARY KEY); INSERT INTO \"user\" VALUES ('a'), ('b')")
sqlite.exec(await readFile('migrations/0013_sfu_live_control.sql', 'utf8'))
let pauseSessionRead = false
let releaseSessionRead
let announceSessionRead
const db = { prepare(sql) { return { bind(...values) { return {
  async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...values).changes) } } },
  async first() { const row = sqlite.prepare(sql).get(...values) ?? null; if (pauseSessionRead && sql.startsWith('SELECT state, track_kind')) { pauseSessionRead = false; announceSessionRead(); await new Promise(resolve => { releaseSessionRead = resolve }) }; return row },
} } } } }
let count = 0
let mutations = 0
let rejectTrack = false
let releaseStart
let started
let startWaiting = false
const startStarted = new Promise(resolve => { started = resolve })
const api = {
  async createSession() { mutations++; return `s${++count}` },
  async createTrack({ track }) { mutations++; if (rejectTrack) throw Error('ambiguous'); return { track: { ...track, mid: track.mid ?? 'r0' }, sessionDescription: { type: track.location === 'local' ? 'answer' : 'offer', sdp: 'sdp' }, requiresImmediateRenegotiation: track.location === 'remote' } },
  async renegotiate() { mutations++ }, async closeTrack() { mutations++ },
}
const objects = { idFromName(name) { return name }, get() { return { async fetch(url) {
  if (url.endsWith('/stop')) return Response.json({ stopping: true })
  if (startWaiting) { started(); await new Promise(resolve => { releaseStart = resolve }) }
  return Response.json({ sessionId: 'bridge-session', trackName: 'ai-output' })
} } } }
const context = { db, api, objects, instructions: 'test' }
const request = (user, body, origin = 'https://example.test') => handleSfuControl(new Request('https://example.test/api/sfu-live', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) }), { ...context, userId: user, origin: 'https://example.test' })
const control = (operation, extra = {}) => ({ action: 'control', request: { operation, ...extra } })
const session = async user => (await (await request(user, control('session/new'))).json()).sessionId
const local = (sessionId, trackName = 'mic') => control('tracks/new', { sessionId, body: { sessionDescription: { type: 'offer', sdp: 'sdp' }, tracks: [{ location: 'local', mid: '0', trackName }] } })
assert.equal((await request(null, control('session/new'))).status, 401)
assert.equal((await request('a', control('session/new'), 'https://evil.test')).status, 403)
const s = await session('a')
assert.equal((await request('b', local(s))).status, 404)
assert.equal((await request('a', local(s))).status, 200)
const before = mutations
const receiver = await session('a')
const remote = (sessionId, trackName) => control('tracks/new', { sessionId: receiver, body: { tracks: [{ location: 'remote', sessionId, trackName }] } })
assert.equal((await request('a', remote('victim', 'track'))).status, 404)
assert.equal(mutations, before + 1)
assert.equal((await request('b', { action: 'start', source: { sessionId: s, trackName: 'mic' } })).status, 404)
const start = await request('a', { action: 'start', source: { sessionId: s, trackName: 'mic' } })
assert.equal(start.status, 200)
assert.deepEqual(await start.json(), { sessionId: 'bridge-session', trackName: 'ai-output' })
assert.equal((await request('a', remote('bridge-session', 'ai-output'))).status, 200)
assert.equal((await request('a', control('renegotiate', { sessionId: receiver, body: { sessionDescription: { type: 'answer', sdp: 'answer' } } }))).status, 200)
assert.equal((await request('a', control('tracks/close', { sessionId: receiver, body: { tracks: [{ mid: 'wrong' }], force: true } }))).status, 404)
assert.equal((await request('a', control('tracks/close', { sessionId: receiver, body: { tracks: [{ mid: 'r0' }], force: true } }))).status, 200)
assert.equal((await request('a', { action: 'stop', source: { sessionId: s, trackName: 'mic' } })).status, 202)
assert.equal((await request('a', { action: 'stop', source: { sessionId: s, trackName: 'mic' } })).status, 409)
const expired = await session('a')
assert.equal((await request('a', local(expired, 'expired-mic'))).status, 200)
assert.equal((await request('a', { action: 'start', source: { sessionId: expired, trackName: 'expired-mic' } })).status, 200)
sqlite.prepare('UPDATE sfu_live_sessions SET expires_at = 0 WHERE id = ?').run(expired)
sqlite.prepare('UPDATE sfu_live_bridges SET expires_at = 0 WHERE source_session = ?').run(expired)
const expiredSource = { sessionId: expired, trackName: 'expired-mic' }
assert.equal((await request('b', { action: 'stop', source: expiredSource })).status, 404)
assert.equal((await request('a', { action: 'start', source: expiredSource })).status, 404)
assert.equal((await request('a', { action: 'stop', source: expiredSource })).status, 202)
const expiredClose = control('tracks/close', { sessionId: expired, body: { tracks: [{ mid: '0' }], force: true } })
assert.equal((await request('b', expiredClose)).status, 404)
assert.equal((await request('a', expiredClose)).status, 200)
const failed = await session('a')
rejectTrack = true
assert.equal((await request('a', local(failed))).status, 502)
rejectTrack = false
const afterFailure = mutations
assert.equal((await request('a', local(failed))).status, 409)
assert.equal(mutations, afterFailure)
const racing = await session('a')
assert.equal((await request('a', local(racing, 'race'))).status, 200)
startWaiting = true
const pending = request('a', { action: 'start', source: { sessionId: racing, trackName: 'race' } })
await startStarted
assert.equal((await request('a', control('tracks/close', { sessionId: racing, body: { tracks: [{ mid: '0' }], force: true } }))).status, 409)
assert.equal((await request('a', { action: 'stop', source: { sessionId: racing, trackName: 'race' } })).status, 202)
releaseStart()
assert.notEqual((await pending).status, 200)
const stale = await session('a')
assert.equal((await request('a', local(stale, 'stale'))).status, 200)
const readPaused = new Promise(resolve => { announceSessionRead = resolve })
pauseSessionRead = true
const staleStart = request('a', { action: 'start', source: { sessionId: stale, trackName: 'stale' } })
await readPaused
assert.equal((await request('a', control('tracks/close', { sessionId: stale, body: { tracks: [{ mid: '0' }], force: true } }))).status, 200)
releaseSessionRead()
assert.equal((await staleStart).status, 409)
assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM sfu_live_bridges WHERE source_session = ?').get(stale).n, 0)
const concurrent = await session('a')
const trackReadPaused = new Promise(resolve => { announceSessionRead = resolve })
pauseSessionRead = true
const staleTrack = request('a', local(concurrent, 'stale'))
await trackReadPaused
assert.equal((await request('a', local(concurrent, 'current'))).status, 200)
releaseSessionRead()
assert.equal((await staleTrack).status, 409)
assert.equal(sqlite.prepare('SELECT track_name FROM sfu_live_sessions WHERE id = ?').get(concurrent).track_name, 'current')
console.log('SFU ownership, control, failure and start/stop race checks passed')
