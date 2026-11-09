import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundle = await build({
  entryPoints: ['src/lib/call-result.server.ts'], bundle: true, write: false, platform: 'node', format: 'esm',
  plugins: [{ name: 'synthetic-booking', setup(build) {
    build.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'env', namespace: 'mock' }))
    build.onResolve({ filter: /^@tanstack\/react-start\/server-only$/ }, () => ({ path: 'empty', namespace: 'mock' }))
    build.onResolve({ filter: /^@tanstack\/ai$/ }, () => ({ path: 'ai', namespace: 'mock' }))
    build.onResolve({ filter: /^\.\/ai\.server$/ }, () => ({ path: 'adapter', namespace: 'mock' }))
    build.onResolve({ filter: /^\.\/clawops\.server$/ }, () => ({ path: 'clawops', namespace: 'mock' }))
    build.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({ contents: ({
      env: 'export const env = globalThis.bookingTestEnv',
      empty: '',
      ai: 'export const chat = async ({ threadId }) => threadId.startsWith("call-translation-") ? { lines: ["Translated"] } : globalThis.bookingSummary',
      adapter: 'export const getOpenAiChat = () => ({})',
      clawops: 'export const getCallAnsweredAt = async () => undefined; export const fetchCallRecording = async () => null',
    })[path], loader: 'js' }))
  } }],
})
const records = new Map()
globalThis.bookingTestEnv = { DB: { prepare(sql) { return { bind(...args) { return {
  async first() {
    const row = sql.includes('WHERE call_id') ? [...records.values()].find(row => row.call_id === args[0]) : records.get(args[0])
    return row ?? null
  },
  async run() { const [id, call_id, , data] = args; if (![...records.values()].some(row => row.call_id === call_id)) records.set(id, { data, call_id }) },
} } } } } }
const { prepareCallResult, loadCallResult } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const report = { state: 'done', outcome: 'completed', hasRecording: false, lines: [{ id: 'one', role: 'business', text: '예', final: true }] }
const analysis = status => status === 'unavailable' ? { status, reason: 'model-unavailable' } : { status: 'available', summary: ['예'], reservation: { status, evidence: status === 'unknown' ? [] : ['예'], assessment: 'model-estimate' }, followUpActions: [] }
const summary = status => ({ status, headline: `Booking ${status}`, when: '', startsAt: '', what: '', who: '', addressKo: '', bring: [], answers: [], sources: { when: '', what: '', who: '' } })
for (const [verified, proposed] of [['unavailable', 'confirmed'], ['unknown', 'confirmed'], ['pending', 'confirmed'], ['confirmed', 'pending']]) {
  globalThis.bookingSummary = summary(proposed)
  const id = `call-${verified}-${proposed}`
  assert.equal(await prepareCallResult(id, report, 'Clinic', 'en', analysis(verified)), null, `${verified}/${proposed} must not create a page`)
  assert.equal([...records.values()].some(row => row.call_id === id), false, 'disagreement must not persist')
}
globalThis.bookingSummary = summary('confirmed')
assert.equal(await prepareCallResult('incomplete', { ...report, transcriptIncomplete: true }, 'Clinic', 'en', analysis('confirmed')), null)
assert.equal([...records.values()].some(row => row.call_id === 'incomplete'), false)
const confirmed = await prepareCallResult('call-confirmed', report, 'Clinic', 'en', analysis('confirmed'))
assert.equal(confirmed?.status, 'confirmed')
assert.equal((await loadCallResult(confirmed.id))?.result.status, 'confirmed')
records.set('legacy', { call_id: 'old', data: JSON.stringify({ id: 'legacy', status: 'confirmed', headline: 'Booking confirmed' }) })
assert.equal((await loadCallResult('legacy'))?.result.status, 'confirmed', 'existing page remains accessible')
assert.equal(await prepareCallResult('old', report, 'Clinic', 'en', analysis('unknown')), null, 'mismatched existing page must not be linked')
assert.equal((await prepareCallResult('old', report, 'Clinic', 'en', analysis('confirmed')))?.id, 'legacy', 'matching existing page remains linkable')
console.log('Booking page verification checks passed')
