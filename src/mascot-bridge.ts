// Import /mascot/talkie-mascot.js and mount <talkie-mascot> before use.
// One bridge per active VoiceSession; pass its methods through existing hooks.
export function createMascotBridge() {
  let lastOutput = -Infinity;
  let lastInput = -Infinity;
  let active = false;
  let previous = '';
  let emittedAt = 0;
  function emit(state: 'idle' | 'listening' | 'speaking', level = 0) {
    const now = performance.now();
    if (state === previous && now - emittedAt < 50) return;
    previous = state; emittedAt = now;
    window.dispatchEvent(new CustomEvent('talkie:voice-state', {detail: {state, level}}));
  }
  return {
    connected() { active = true; emit('listening'); },
    levels(input: number, output: number) {
      if (!active) return;
      const now = performance.now();
      if (output > 0.025) lastOutput = now;
      if (input > 0.06) lastInput = now;
      // Real output is authoritative. A cancelled output settles within 140 ms.
      const state = now - lastOutput < 140 ? 'speaking' : 'listening';
      emit(state, state === 'speaking' ? output : now - lastInput < 250 ? input : 0);
    },
    ended() { active = false; lastOutput = lastInput = -Infinity; emit('idle'); },
    error() { active = false; lastOutput = lastInput = -Infinity; emit('idle'); },
  };
}
