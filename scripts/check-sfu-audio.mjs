import assert from 'node:assert/strict'
import { build } from 'esbuild'

const built = await build({ entryPoints: ['src/lib/sfu-audio.server.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
const { encodeSfuPackets, decodeSfuPacket, createSfuToLiveConverter, createLiveToSfuConverter } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`)

const join = chunks => Buffer.concat(chunks.map(chunk => Buffer.from(chunk)))
const stereo = (count, fn) => {
  const data = Buffer.alloc(count * 4)
  for (let i = 0; i < count; i++) {
    const [left, right] = fn(i)
    data.writeInt16LE(left, i * 4)
    data.writeInt16LE(right, i * 4 + 2)
  }
  return data
}
const mono = (count, fn) => {
  const data = Buffer.alloc(count * 2)
  for (let i = 0; i < count; i++) data.writeInt16LE(fn(i), i * 2)
  return data
}
const pcm = stereo(20_000, i => [i % 30_000, -i % 30_000])
const packets = encodeSfuPackets(pcm)
assert.ok(packets.every(packet => packet.length <= 32_768))
assert.deepEqual(join(packets.map(decodeSfuPacket)), pcm)
assert.deepEqual(Buffer.from(decodeSfuPacket(Uint8Array.from([8, 7, 16, 9, 42, 4, 1, 2, 3, 4]))), Buffer.from([1, 2, 3, 4]))
assert.throws(() => decodeSfuPacket(Uint8Array.from([42, 4, 1])))
assert.throws(() => decodeSfuPacket(Uint8Array.from([40, 1])))
assert.throws(() => encodeSfuPackets(new Uint8Array(3)))

const signal = stereo(4801, i => {
  const value = Math.round(16000 * Math.sin(2 * Math.PI * 4000 * i / 48000))
  return [value, value]
})
const down = createSfuToLiveConverter()
const splitDown = join([down(signal.subarray(0, 404)), down(signal.subarray(404, 2812)), down(signal.subarray(2812))])
assert.deepEqual(splitDown, Buffer.from(createSfuToLiveConverter()(signal)), 'resampling is independent of packet boundaries')
assert.equal(splitDown.length, Math.ceil(4801 / 2) * 2)
const antiPhase = stereo(100, i => [i * 100, -i * 100])
assert.ok(createSfuToLiveConverter()(antiPhase).every(value => value === 0), 'stereo downmix')
const rms = data => {
  let sum = 0
  for (let i = 100; i < data.length / 2; i++) sum += data.readInt16LE(i * 2) ** 2
  return Math.sqrt(sum / (data.length / 2 - 100))
}
const wave = frequency => stereo(4800, i => {
  const value = Math.round(16000 * Math.sin(2 * Math.PI * frequency * i / 48000))
  return [value, value]
})
const pass = rms(Buffer.from(createSfuToLiveConverter()(wave(4000))))
const stop = rms(Buffer.from(createSfuToLiveConverter()(wave(18000))))
assert.ok(pass > 10_000 && stop < pass / 100, `low-pass pass=${pass} stop=${stop}`)

const live = mono(1001, i => Math.round(12000 * Math.sin(i / 10)))
const up = createLiveToSfuConverter()
const splitUp = join([up(live.subarray(0, 66)), up(live.subarray(66, 1002)), up(live.subarray(1002))])
assert.deepEqual(splitUp, Buffer.from(createLiveToSfuConverter()(live)), 'upsampling is independent of packet boundaries')
assert.equal(splitUp.length, live.length * 4)
for (let i = 0; i < splitUp.length; i += 4) assert.equal(splitUp.readInt16LE(i), splitUp.readInt16LE(i + 2), 'stereo channels match')
assert.throws(() => createLiveToSfuConverter()(new Uint8Array(1)))
console.log('SFU audio packet, resampling, continuity, and filter checks passed')
