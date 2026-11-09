export type ListenTrack = 'phone' | 'agent'

// G.711 μ-law expands to signed 16-bit PCM; AudioBuffer expects -1 to 1.
export function decodeTelephoneAudio(payload: string): Float32Array<ArrayBuffer> {
  if (payload.length > 16_384) throw new Error('Audio packet is too large')
  const bytes = atob(payload)
  if (!bytes.length || bytes.length > 12_288) throw new Error('Invalid audio packet')
  const samples = new Float32Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) {
    const value = (~bytes.charCodeAt(i)) & 0xff
    const magnitude = (((value & 0x0f) << 3) + 0x84) << ((value & 0x70) >> 4)
    samples[i] = ((value & 0x80) ? 0x84 - magnitude : magnitude - 0x84) / 32768
  }
  return samples
}

export function createTelephonePlayer(context: AudioContext) {
  const nextTime: Record<ListenTrack, number> = { phone: 0, agent: 0 }
  const sources = new Set<AudioBufferSourceNode>()
  const gain = context.createGain()
  gain.gain.value = 0.5
  gain.connect(context.destination)
  return {
    play(track: ListenTrack, payload: string) {
      const samples = decodeTelephoneAudio(payload)
      const start = Math.max(nextTime[track], context.currentTime + 0.04)
      // ponytail: cap phone audio at 2 seconds and generated audio at 30 seconds; timestamped playout feedback could improve synchronization.
      if (sources.size >= 2048 || start + samples.length / 8_000 > context.currentTime + (track === 'phone' ? 2 : 30)) return false
      const buffer = context.createBuffer(1, samples.length, 8_000)
      buffer.copyToChannel(samples, 0)
      const source = context.createBufferSource()
      source.buffer = buffer
      source.connect(gain)
      sources.add(source)
      source.onended = () => { sources.delete(source); source.disconnect() }
      source.start(start)
      nextTime[track] = start + buffer.duration
      return true
    },
    remainingMs() {
      return Math.max(0, Math.ceil((Math.max(nextTime.phone, nextTime.agent) - context.currentTime) * 1000))
    },
    stop() {
      for (const source of sources) { source.onended = null; source.stop(); source.disconnect() }
      sources.clear()
      gain.disconnect()
      void context.close()
    },
  }
}
