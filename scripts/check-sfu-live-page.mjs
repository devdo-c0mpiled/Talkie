import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { build } from 'esbuild'

assert.ok(existsSync('src/routes/sfu-live.tsx'), 'SFU Live page must exist')
const mock = {
  name: 'mock-ui',
  setup(build) {
    build.onResolve({ filter: /^(react|react\/jsx-runtime|@tanstack\/react-router|@tanstack\/react-start)$/ }, args => ({ path: args.path, namespace: 'mock' }))
    build.onResolve({ filter: /sfu-live\.client$/ }, () => ({ path: 'client', namespace: 'mock' }))
    build.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ loader: 'js', contents: args.path === 'react' ? `export const useState = (...x) => globalThis.hooks.useState(...x); export const useRef = (...x) => globalThis.hooks.useRef(...x); export const useEffect = (...x) => globalThis.hooks.useEffect(...x)` : args.path === 'react/jsx-runtime' ? `export const jsx = (type, props) => ({type, props}); export const jsxs = jsx; export const Fragment = 'fragment'` : args.path === 'client' ? `export const startSfuLive = options => globalThis.start(options)` : args.path === '@tanstack/react-start' ? `export const createClientOnlyFn = fn => fn` : `export const createFileRoute = () => config => config` }))
  },
}
const result = await build({ entryPoints: ['src/routes/sfu-live.tsx'], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [mock] })
const { Route } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`)
const slots = []
let cursor = 0
let cleanup
let audio = { srcObject: null, play: async () => {}, pause() {} }
globalThis.hooks = {
  useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }] },
  useRef(initial) { const index = cursor++; if (!(index in slots)) slots[index] = { current: initial }; return slots[index] },
  useEffect(effect) { cursor++; if (!cleanup) cleanup = effect() },
}
function render() {
  cursor = 0
  const tree = Route.component()
  function visit(node) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'audio' && node.props.ref) node.props.ref.current = audio
    for (const child of [node.props?.children].flat(Infinity)) visit(child)
  }
  visit(tree)
  return tree
}
function button(tree, label) {
  let found
  function visit(node) { if (!node || typeof node !== 'object') return; if (node.type === 'button' && node.props.children === label) found = node; for (const child of [node.props?.children].flat(Infinity)) visit(child) }
  visit(tree)
  assert.ok(found, `Missing button: ${label}`)
  return found
}
let release
let stopped = 0
let options
globalThis.start = value => { options = value; return new Promise(resolve => { release = resolve }) }
const sent = []
globalThis.fetch = async (url, init) => { sent.push([url, JSON.parse(init.body)]); return { ok: true, json: async () => ({ sessionId: 'remote', trackName: 'output' }) } }
let tree = render()
const pending = button(tree, 'Start voice conversation').props.onClick()
await new Promise(resolve => setImmediate(resolve))
await options.control({ operation: 'session/new' })
const source = { sessionId: 'source', trackName: 'mic' }
await options.startBridge(source)
await options.stopBridge(source)
assert.deepEqual(sent.map(x => x[1]), [{ action: 'control', request: { operation: 'session/new' } }, { action: 'start', source }, { action: 'stop', source }])
tree = render()
button(tree, 'Stop').props.onClick()
assert.equal(options.signal?.aborted, true, 'stop must cancel startup immediately')
release({ output: {}, stop: async () => { stopped++ } })
await pending
assert.equal(stopped, 1, 'stop while connecting must release the late connection')
assert.equal(audio.srcObject, null, 'canceled output must not play')
tree = render()
const second = button(tree, 'Start voice conversation').props.onClick()
await new Promise(resolve => setImmediate(resolve))
const output = {}
release({ output, stop: async () => { stopped++ } })
await second
assert.equal(audio.srcObject, output, 'connected output is attached to audio')
cleanup()
assert.equal(options.signal?.aborted, true, 'unmount must cancel the connection')
await Promise.resolve()
assert.equal(stopped, 2, 'unmount must release the connection')
assert.equal(audio.srcObject, null, 'unmount must detach output')

slots.length = 0
cleanup = undefined
audio = { srcObject: null, play: async () => { throw new Error('Playback blocked') }, pause() {} }
tree = render()
const blocked = button(tree, 'Start voice conversation').props.onClick()
await new Promise(resolve => setImmediate(resolve))
release({ output: {}, stop: async () => { stopped++ } })
await blocked
assert.equal(stopped, 3, 'playback failure must stop the connection')
assert.equal(audio.srcObject, null, 'playback failure must detach output')
assert.ok(JSON.stringify(render()).includes('Playback blocked'))
cleanup()

slots.length = 0
cleanup = undefined
audio = { srcObject: null, play: async () => {}, pause() {} }
tree = render()
const disconnected = button(tree, 'Start voice conversation').props.onClick()
await new Promise(resolve => setImmediate(resolve))
release({ output: {}, stop: async () => { stopped++ } })
await disconnected
options.onError(new Error('network'))
await Promise.resolve()
assert.equal(stopped, 4, 'connection failure must release the connection')
assert.equal(audio.srcObject, null)
assert.ok(JSON.stringify(render()).includes('ended unexpectedly'))
cleanup()

console.log('SFU Live page checks passed')
