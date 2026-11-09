import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundle = await build({ entryPoints: ['src/lib/call-result.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { analyzeCall } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
const lines = [
  { role: 'agent', text: '내일 오후 두 시 예약할 수 있나요?' },
  { role: 'business', text: '네, 두 시에 예약해 드렸습니다.' },
]
const transcript = lines.map(({ role, text }) => `${role === 'agent' ? 'Tokie agent' : 'Business'}: ${text}`).join('\n')
const input = { state: 'done', outcome: 'completed', transcript, complete: true, lines }
const output = { summary: ['내일 오후 두 시 예약할 수 있나요?', '네, 두 시에 예약해 드렸습니다.'], reservation: { status: 'confirmed', evidence: ['네, 두 시에 예약해 드렸습니다.'] }, followUpActions: [] }
const analyze = (input, value) => analyzeCall(input, async () => value)
const result = await analyze(input, output)
assert.equal(result.status, 'available')
assert.equal(result.reservation.status, 'confirmed')
assert.equal(result.reservation.assessment, 'model-estimate')
assert.equal(result.reservation.evidence[0], '네, 두 시에 예약해 드렸습니다.')
assert.equal(result.summary[0], '내일 오후 두 시 예약할 수 있나요?')
assert.equal((await analyze(input, { ...output, summary: ['없는 말'] })).status, 'unavailable', 'invented quotes must be rejected')
assert.equal((await analyze(input, { ...output, reservation: { status: 'confirmed', evidence: ['내일 오후 두 시 예약할 수 있나요?'] } })).status, 'unavailable', 'agent request cannot prove business confirmation')
assert.equal((await analyze({ ...input, complete: false }, output)).reservation.status, 'unknown', 'incomplete transcript cannot prove confirmation')
assert.equal((await analyze({ ...input, lines: [] }, output)).reservation.status, 'unknown', 'unlabelled recording cannot prove confirmation')
assert.equal((await analyze({ ...input, complete: false }, { ...output, reservation: { status: 'declined', evidence: ['네, 두 시에 예약해 드렸습니다.'] } })).reservation.status, 'unknown')
assert.equal((await analyze({ ...input, complete: false }, { ...output, reservation: { status: 'pending', evidence: ['네, 두 시에 예약해 드렸습니다.'] } })).reservation.status, 'unknown')
assert.equal((await analyze(input, { ...output, reservation: { status: 'unknown', evidence: [] }, followUpActions: ['없는 행동'] })).status, 'unavailable')
assert.equal((await analyze(input, { ...output, reservation: { status: 'unknown', evidence: [] } })).reservation.status, 'unknown')
assert.equal((await analyzeCall(input, async () => { throw Error('model error') })).reason, 'model-unavailable')
assert.equal((await analyzeCall({ state: 'calling', outcome: 'in-progress' }, async () => { throw Error('must not call') })).reason, 'call-in-progress')
assert.equal((await analyzeCall({ state: 'done', outcome: 'no-answer' }, async () => { throw Error('must not call') })).reason, 'call-not-connected')
console.log('call-result checks passed')
