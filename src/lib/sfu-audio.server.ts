// Cloudflare's Packet protobuf: sequenceNumber = 1, timestamp = 2, payload = 5.
const MAX_PACKET_BYTES = 32_768
const MAX_PCM_BYTES = 32_764 // field tag + three-byte varint length = 4 bytes

function writeVarint(value: number): number[] {
  const bytes: number[] = []
  do {
    const byte = value % 128
    value = Math.floor(value / 128)
    bytes.push(byte | (value ? 128 : 0))
  } while (value)
  return bytes
}

export function encodeSfuPackets(pcm: Uint8Array): Uint8Array[] {
  if (pcm.length % 4) throw new Error('SFU PCM must contain complete stereo samples')
  const packets: Uint8Array[] = []
  for (let offset = 0; offset < pcm.length; offset += MAX_PCM_BYTES) {
    const chunk = pcm.subarray(offset, offset + MAX_PCM_BYTES)
    const header = [42, ...writeVarint(chunk.length)]
    const packet = new Uint8Array(header.length + chunk.length)
    packet.set(header)
    packet.set(chunk, header.length)
    if (packet.length > MAX_PACKET_BYTES) throw new Error('SFU packet exceeds size limit')
    packets.push(packet)
  }
  return packets
}

export function decodeSfuPacket(packet: Uint8Array): Uint8Array {
  let offset = 0
  let payload = new Uint8Array(0)
  function varint(): number {
    let value = 0
    for (let shift = 0; shift < 35; shift += 7) {
      if (offset >= packet.length) throw new Error('Truncated protobuf varint')
      const byte = packet[offset++]
      value += (byte & 127) * 2 ** shift
      if (!(byte & 128)) {
        if (value > 0xffffffff) throw new Error('Protobuf integer exceeds uint32')
        return value
      }
    }
    throw new Error('Invalid protobuf varint')
  }
  while (offset < packet.length) {
    const tag = varint()
    const field = Math.floor(tag / 8)
    const wire = tag % 8
    if (!field) throw new Error('Invalid protobuf field')
    if (wire === 0) varint()
    else if (wire === 1 || wire === 5) offset += wire === 1 ? 8 : 4
    else if (wire === 2) {
      const length = varint()
      if (length > packet.length - offset) throw new Error('Truncated protobuf field')
      if (field === 5) payload = packet.slice(offset, offset + length)
      offset += length
    } else throw new Error('Unsupported protobuf wire type')
    if (offset > packet.length) throw new Error('Truncated protobuf field')
    if (field === 5 && wire !== 2) throw new Error('Invalid protobuf payload')
  }
  if (payload.length % 4) throw new Error('SFU PCM must contain complete stereo samples')
  return payload
}

// A windowed-sinc low-pass filter suppresses frequencies above the 12 kHz
// Nyquist limit before decimation. History and phase span WebSocket packets.
const TAPS = 63
const FILTER = Array.from({ length: TAPS }, (_, i) => {
  const x = i - (TAPS - 1) / 2
  const cutoff = 0.21
  const sinc = x === 0 ? 2 * cutoff : Math.sin(2 * Math.PI * cutoff * x) / (Math.PI * x)
  return sinc * (0.54 - 0.46 * Math.cos(2 * Math.PI * i / (TAPS - 1)))
})
const FILTER_SUM = FILTER.reduce((sum, value) => sum + value, 0)
const COEFFICIENTS = FILTER.map(value => value / FILTER_SUM)

function sample(value: number): number {
  return Math.max(-32768, Math.min(32767, Math.round(value)))
}

export function createSfuToLiveConverter(): (pcm: Uint8Array) => Uint8Array {
  const history = new Float64Array(TAPS)
  let position = 0
  let phase = 0
  return pcm => {
    if (pcm.length % 4) throw new Error('SFU PCM must contain complete stereo samples')
    const input = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    const output = new Uint8Array(Math.floor((pcm.length / 4 + 1 - phase) / 2) * 2)
    const view = new DataView(output.buffer)
    let written = 0
    for (let offset = 0; offset < pcm.length; offset += 4) {
      history[position] = (input.getInt16(offset, true) + input.getInt16(offset + 2, true)) / 2
      if (phase === 0) {
        let value = 0
        for (let i = 0; i < TAPS; i++) value += COEFFICIENTS[i] * history[(position - i + TAPS) % TAPS]
        view.setInt16(written, sample(value), true)
        written += 2
      }
      position = (position + 1) % TAPS
      phase = 1 - phase
    }
    return output
  }
}

export function createLiveToSfuConverter(): (pcm: Uint8Array) => Uint8Array {
  let previous: number | undefined
  return pcm => {
    if (pcm.length % 2) throw new Error('Live PCM must contain complete mono samples')
    const input = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    const output = new Uint8Array(pcm.length * 4)
    const view = new DataView(output.buffer)
    for (let offset = 0; offset < pcm.length; offset += 2) {
      const current = input.getInt16(offset, true)
      const midpoint = sample(((previous ?? current) + current) / 2)
      const out = offset * 4
      view.setInt16(out, midpoint, true)
      view.setInt16(out + 2, midpoint, true)
      view.setInt16(out + 4, current, true)
      view.setInt16(out + 6, current, true)
      previous = current
    }
    return output
  }
}
