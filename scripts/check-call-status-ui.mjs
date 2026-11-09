import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const source = await readFile('src/components/chat/TokieChat.tsx', 'utf8')
const bundle = await build({
  stdin: { contents: `${source}\nexport { CallLive }`, sourcefile: 'src/components/chat/TokieChat.tsx', resolveDir: 'src/components/chat', loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  plugins: [{ name: 'synthetic-boundaries', setup(build) {
    build.onResolve({ filter: /^(react|@tanstack\/ai-react)$/ }, args => ({ path: args.path, namespace: 'synthetic' }))
    build.onResolve({ filter: /^real-react$/ }, () => ({ path: require.resolve('react') }))
    build.onResolve({ filter: /auth-client$/ }, () => ({ path: 'auth', namespace: 'synthetic' }))
    build.onResolve({ filter: /\.webp$/ }, () => ({ path: 'image', namespace: 'synthetic' }))
    build.onLoad({ filter: /.*/, namespace: 'synthetic' }, ({ path }) => ({ loader: 'js', contents: path === 'react' ? `
      export * from 'real-react'; export { default } from 'real-react';
      export const useState = (...args) => globalThis.testHooks.useState(...args);
      export const useEffect = (...args) => globalThis.testHooks.useEffect(...args);
      export const useRef = (...args) => globalThis.testHooks.useRef(...args);
      export const useId = () => 'synthetic';
    ` : path === '@tanstack/ai-react' ? 'export const fetchServerSentEvents = () => ({}); export const useChat = () => ({});' : path === 'auth' ? 'export const authClient = {};' : 'export default "synthetic.webp";' }))
  } }],
})
const { CallLive } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const slots = []
let cursor = 0
let effectKey
let cleanup
globalThis.testHooks = {
  useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }] },
  useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index] },
  useEffect(effect, deps) { cursor++; const key = JSON.stringify(deps); if (key !== effectKey) { cleanup?.(); effectKey = key; cleanup = effect() } },
}
let poll
let tick
globalThis.setTimeout = callback => { poll = callback; return 1 }
globalThis.clearTimeout = () => {}
globalThis.setInterval = callback => { tick = callback; return 1 }
globalThis.clearInterval = () => {}
let calls = 0
let done = 0
let answered
globalThis.fetch = async () => {
  calls++
  if (calls === 1) return Response.json({ state: 'calling', outcome: 'in-progress', lines: [{ id: 'line', role: 'business', text: 'hello', final: false }] })
  if (calls === 2) return new Response(null, { status: 502 })
  if (calls === 3) throw new Error('synthetic network failure')
  return Response.json({ state: 'unknown', outcome: 'status-unavailable', lines: [] })
}
function render() { cursor = 0; return CallLive({ reference: 'synthetic', business: 'Test', onDone: (_reference, value) => { done++; answered = value }, onActivity() {} }) }
function find(node, predicate) {
  if (!node || typeof node !== 'object') return undefined
  if (predicate(node)) return node
  for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, predicate); if (found) return found }
}
render()
await poll()
tick()
assert.ok(JSON.stringify(render()).includes('0:00'), 'show the observed clock before an outage')
for (let i = 0; i < 3; i++) await poll()
let tree = render()
assert.equal(calls, 4, 'unavailable status must stop after three failed attempts')
assert.equal(done, 0, 'an unavailable status must not claim the call ended')
assert.ok(JSON.stringify(tree).includes('Call status unavailable'), 'show an unknown status')
const retry = find(tree, node => node.type === 'button' && node.props.children === 'Check call status')
assert.ok(retry, 'offer a manual status check')
globalThis.fetch = async () => Response.json({ state: 'done', outcome: 'no-answer', lines: [] })
retry.props.onClick()
render()
await poll()
tree = render()
assert.equal(done, 1, 'a confirmed ended status reports the end once')
assert.equal(answered, true, 'an answer observed before the outage is retained')
assert.ok(JSON.stringify(tree).includes('Call ended'))
assert.ok(!JSON.stringify(tree).includes('Call ended ·'), 'duration remains unknown after an outage')
cleanup?.()
slots.length = 0; effectKey = undefined; done = 0; calls = 0
globalThis.fetch = async () => { calls++; return new Response(null, { status: 403 }) }
render()
const deniedPoll = poll
poll = undefined
await deniedPoll()
tree = render()
assert.equal(calls, 1, 'an access denial is not retried')
assert.equal(poll, undefined)
assert.equal(done, 0)
assert.ok(JSON.stringify(tree).includes('Call status access denied'))
console.log('Call status unknown and manual recheck passed')
