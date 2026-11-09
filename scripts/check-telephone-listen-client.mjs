import assert from 'node:assert/strict'
import { build } from 'esbuild'

const built = await build({ entryPoints: ['src/lib/telephone-listen-audio.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { decodeTelephoneAudio, createTelephonePlayer } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`)
assert.deepEqual([...decodeTelephoneAudio(Buffer.from([0xff, 0x7f, 0x80, 0x00]).toString('base64'))], [0, 0, 32124 / 32768, -32124 / 32768])
assert.throws(() => decodeTelephoneAudio(''))
assert.throws(() => decodeTelephoneAudio('A'.repeat(16385)))
assert.equal(decodeTelephoneAudio(Buffer.alloc(12288, 0xff).toString('base64')).length, 12288)

const sources = []
const context = {
  currentTime: 10, destination: {}, closed: false,
  createGain: () => ({ gain: { value: 1 }, connect() {}, disconnect() {} }),
  createBuffer: (_, length, rate) => ({ duration: length / rate, copyToChannel() {} }),
  createBufferSource: () => {
    const source = { connect() {}, disconnect() {}, start(time) { this.time = time }, stop() { this.stopped = true } }
    sources.push(source)
    return source
  },
  close() { this.closed = true },
}
const player = createTelephonePlayer(context)
const packet = Buffer.alloc(800, 0xff).toString('base64')
assert.equal(player.play('phone', packet), true)
assert.equal(player.play('phone', packet), true)
assert.equal(player.play('agent', packet), true)
assert.equal(sources[0].time, 10.04)
assert.ok(Math.abs(sources[1].time - 10.14) < 1e-9)
assert.equal(sources[2].time, 10.04)
for (let i = 0; i < 17; i++) player.play('phone', packet)
assert.equal(player.play('phone', packet), false)
for (let i = 0; i < 49; i++) assert.equal(player.play('agent', packet), true)
assert.ok(player.remainingMs() >= 5000, 'generated speech remains queued until it is played')
player.stop()
assert.ok(sources.every(source => source.stopped))
assert.equal(context.closed, true)
console.log('Telephone listener decode, simultaneous tracks, bounded scheduling, and cleanup passed')
