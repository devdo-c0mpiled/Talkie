import assert from 'node:assert/strict'
import { build } from 'esbuild'

const result = await build({
  entryPoints: ['src/worker.ts'], bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'stubs', setup(build) {
    build.onResolve({ filter: /^@tanstack\/react-start\/server-entry$/ }, () => ({ path: 'app', namespace: 'stub' }))
    build.onResolve({ filter: /^\.\/lib\/(sfu-live-object|telephone-listen-object)\.server$/ }, args => ({ path: args.path, namespace: 'stub' }))
    build.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: args.path === 'app'
      ? 'export default { fetch(request, env, ctx) { return Response.json({ path: new URL(request.url).pathname, sameEnv: env.marker, sameContext: ctx.marker }) } }'
      : 'export class SfuLiveSession {} export class TelephoneListen {}', loader: 'js' }))
  } }],
})
const { default: worker, SfuLiveSession, TelephoneListen } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`)
assert.equal(typeof SfuLiveSession, 'function')
assert.equal(typeof TelephoneListen, 'function')
const id = 'a'.repeat(64), token = 'b'.repeat(64)
let forwarded = []
const env = { marker: true, SFU_LIVE: {
  idFromString(value) { if (value !== id) throw new Error('invalid id'); return value },
  get(value) { return { fetch(request) { forwarded.push({ value, request }); return new Response('media') } } },
} }
const ctx = { marker: true }
const request = (path, init) => worker.fetch(new Request(`https://example.test${path}`, init), env, ctx)
for (const direction of ['input', 'output']) {
  const response = await request(`/api/sfu-live/media/${id}/${direction}/${token}?ignored=1`, { headers: { Upgrade: 'websocket' } })
  assert.equal(await response.text(), 'media')
  const { value, request: forwardedRequest } = forwarded.at(-1)
  assert.equal(value, id)
  assert.equal(new URL(forwardedRequest.url).pathname, `/media/${direction}/${token}`)
  assert.equal(new URL(forwardedRequest.url).search, '')
  assert.equal(forwardedRequest.headers.get('Upgrade'), 'websocket')
}
for (const path of [
  `/api/sfu-live/media/${id}/start/${token}`,
  `/api/sfu-live/media/${id}/stop/${token}`,
  `/api/sfu-live/media/${'c'.repeat(64)}/input/${token}`,
  `/api/sfu-live/media/${id}/input/${token}/extra`,
  '/api/sfu-live/media',
]) assert.equal((await request(path, { headers: { Upgrade: 'websocket' } })).status, 404)
assert.equal((await request(`/api/sfu-live/media/${id}/input/${token}`)).status, 404)
assert.equal((await request(`/api/sfu-live/media/${id}/input/${token}`, { method: 'POST', headers: { Upgrade: 'websocket' } })).status, 404)
assert.equal(forwarded.length, 2)
assert.deepEqual(await (await request('/account')).json(), { path: '/account', sameEnv: true, sameContext: true })
assert.deepEqual(await (await request('/start', { method: 'POST' })).json(), { path: '/start', sameEnv: true, sameContext: true })
console.log('Worker wiring checks passed')
