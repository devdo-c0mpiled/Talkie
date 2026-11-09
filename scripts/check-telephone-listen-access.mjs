import assert from 'node:assert/strict'
import { build } from 'esbuild'

const built = await build({ entryPoints: ['src/lib/telephone-listen-access.server.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { handleTelephoneListen } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`)
let owner = true
let active = true
const requests = []
const deps = {
  userId: async () => 'user-1',
  fromReference: async value => value === 'signed' ? 'outbound-1' : null,
  db: { prepare: sql => ({ bind: (...values) => ({ first: async () => sql.includes('inbound_conversation_calls') ? (owner && values[1] === 'user-1' ? { call_id: values[0] } : null) : (active ? { call_id: values[0] } : null) }) }) },
  namespace: { idFromName: name => name, get: id => ({ fetch: async request => { requests.push({ id, request }); return new Response('connected') } }) },
}
const req = (query, headers = {}) => new Request(`https://talkie.example/api/telephone-listen?${query}`, { headers: { Origin: 'https://talkie.example', Upgrade: 'websocket', ...headers } })
assert.equal((await handleTelephoneListen(req('call=inbound-1'), deps)).status, 200)
assert.equal(requests.at(-1).id, 'inbound-1')
assert.equal(new URL(requests.at(-1).request.url).pathname, '/listen')
owner = false
assert.equal((await handleTelephoneListen(req('call=inbound-1'), deps)).status, 404)
owner = true
assert.equal((await handleTelephoneListen(req('reference=signed'), deps)).status, 200)
assert.equal(requests.at(-1).id, 'outbound-1')
assert.equal((await handleTelephoneListen(req('reference=bad'), deps)).status, 404)
active = false
assert.equal((await handleTelephoneListen(req('reference=signed'), deps)).status, 404)
active = true
assert.equal((await handleTelephoneListen(req('call=inbound-1&reference=signed'), deps)).status, 400)
assert.equal((await handleTelephoneListen(req('call=inbound-1', { Origin: 'https://evil.example' }), deps)).status, 403)
assert.equal((await handleTelephoneListen(req('call=inbound-1', { Upgrade: 'none' }), deps)).status, 400)
assert.equal((await handleTelephoneListen(req('call=inbound-1'), { ...deps, userId: async () => null })).status, 401)
console.log('telephone listener access checks passed')
