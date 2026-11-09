// Gemini Live의 little-endian PCM16과 Web Audio의 Float32 사이를 변환한다.
export function encodePcm16(samples) {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function decodePcm16(data) {
  const binary = atob(data);
  if (binary.length % 2) throw new Error('PCM16 데이터 길이가 올바르지 않습니다.');
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const samples = new Float32Array(bytes.length / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
  return samples;
}

export function pcmSampleRate(mimeType = '') {
  if (!/^audio\/pcm(?:;|$)/i.test(mimeType)) throw new Error('지원하지 않는 Gemini 음성 형식입니다.');
  const rate = Number(mimeType.match(/(?:^|;)\s*rate=(\d+)(?:;|$)/)?.[1] || 24000);
  if (!Number.isInteger(rate) || rate < 8000 || rate > 96000) throw new Error('지원하지 않는 음성 샘플레이트입니다.');
  return rate;
}
