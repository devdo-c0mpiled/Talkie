import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { Miniflare } from 'miniflare'

const bundle = await build({
  stdin: {
    resolveDir: process.cwd(),
    loader: 'js',
    contents: `
      import assert from 'node:assert/strict'
      import { createLiveDelegation } from './src/lib/live-delegation.server.ts'
      export default { async fetch() {
        globalThis.__talkieTestEnv.OPENAI_API_KEY = 'synthetic-key'
        const requests = []
        let fail = false
        let unblock
        let delay
        globalThis.fetch = async (input, init) => {
          const request = new Request(input, init)
          requests.push(await request.json())
          if (delay) await delay
          if (fail) return new Response('unavailable', { status: 401 })
          return new Response('event: response.output_text.delta\\ndata: {"type":"response.output_text.delta","delta":"Synthetic answer","item_id":"test","output_index":0,"content_index":0}\\n\\nevent: response.completed\\ndata: {"type":"response.completed","response":{"id":"resp_test","status":"completed","output":[]}}\\n\\ndata: [DONE]\\n\\n', { headers: { 'content-type': 'text/event-stream' } })
        }
        const replies = []
        const session = createLiveDelegation({ send: (event) => replies.push(event), history: [{ role: 'user', content: 'Prior synthetic request' }] })
        await session.handle({ type: 'session.input_transcript.delta', delta: 'Synthetic question' })
        const delegation = { type: 'session.delegation.created', delegation: { target: 'client', id: 'test-id' } }
        await session.handle(delegation)
        assert.deepEqual(replies, [{ type: 'session.commentary.append', delegation_id: 'test-id', content: 'Synthetic answer' }])
        assert.equal(requests.length, 1)
        assert.ok(JSON.stringify(requests[0]).includes('Synthetic question'))
        assert.ok(JSON.stringify(requests[0]).includes('Prior synthetic request'), 'the delegation backend receives prior conversation context')
        await session.handle(delegation)
        assert.equal(requests.length, 1, 'duplicate delegations must not rerun')
        await session.handle({ type: 'session.delegation.created', delegation: { target: 'responses', id: 'ignored' } })
        assert.equal(requests.length, 1)
        delay = new Promise((resolve) => { unblock = resolve })
        const pending = session.handle({ type: 'session.delegation.created', delegation: { target: 'client', id: 'stale' } })
        await session.handle({ type: 'session.input_transcript.delta', delta: ' Correction' })
        unblock()
        await pending
        delay = null
        assert.equal(replies.at(-1).delegation_id, 'stale')
        assert.notEqual(replies.at(-1).content, 'Synthetic answer', 'new speech invalidates an old answer')
        fail = true
        await session.handle({ type: 'session.delegation.created', delegation: { target: 'client', id: 'failure' } })
        assert.equal(replies.at(-1).delegation_id, 'failure')
        assert.notEqual(replies.at(-1).content, 'Synthetic answer')
        session.close()
        await session.handle({ type: 'session.delegation.created', delegation: { target: 'client', id: 'closed' } })
        assert.equal(requests.length, 3)
        return new Response('ok')
      } }
    `,
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  external: ['node:*'],
  plugins: [{
    name: 'synthetic-cloudflare-env',
    setup(build) {
      build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'test-env', namespace: 'test-env' }))
      build.onLoad({ filter: /.*/, namespace: 'test-env' }, () => ({
        contents: 'globalThis.__talkieTestEnv = {}; export const env = globalThis.__talkieTestEnv;',
        loader: 'js',
      }))
    },
  }],
})

const worker = new Miniflare({ workers: [{ config: {
  name: 'synthetic-live-delegation-check',
  compatibilityDate: '2026-11-08',
  compatibilityFlags: ['nodejs_compat'],
  manifest: { mainModule: 'worker.mjs', modules: { 'worker.mjs': { type: 'esm', contents: bundle.outputFiles[0].text } } },
} }] })
try {
  const response = await worker.dispatchFetch('http://localhost/')
  assert.equal(response.status, 200, await response.text())
  console.log('Live delegation checks passed with a mocked provider')
} finally {
  await worker.dispose()
}
