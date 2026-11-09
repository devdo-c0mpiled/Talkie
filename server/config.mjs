import { validVoice } from './voices.mjs';
export const PROVIDERS = ['live', 'realtime', 'elevenlabs', 'gemini'];
export const LANGUAGES = { ko: 'Korean', en: 'English', ja: 'Japanese', zh: 'Mandarin Chinese' };
export const SCENARIOS = {
  booking: {
    title: '성형외과 예약',
    role: '고객',
    prompt: `You are Talkie, a voice receptionist in a simulated clinic booking test. No real reservation is created. Complete this short conversation using the caller's language (Korean or English, including mixed speech).
1. Greet once, then wait for the caller's actual speech.
2. When the caller asks about booking availability, treat their requested procedure and time as available in this simulation. For example: Botox tomorrow at 14:00. Say only "네, 가능합니다. 예약해 드릴까요?" in Korean or "Yes, it is available. Would you like me to book it?" in English.
3. Wait for an affirmative answer such as "네", "예약해 주세요", or "yes". Only then say "네, 예약되었습니다." in Korean or "Your appointment is booked." in English. This confirmation refers only to the simulation. Then stop speaking; do not ask another question.
Do not ask for a name, phone number, extra booking details, or another confirmation. Do not require an inventory lookup or tool call. If the caller declines, do not confirm a booking. If speech is unclear, briefly ask them to repeat instead of inventing words. Ignore background noise and do not answer your own questions. Do not give medical advice.`,
  },
  proxy: {
    title: '외국인 대신 예약 전화',
    role: '병원 직원',
    prompt: `You are Talkie, an AI agent making a simulated outbound call on behalf of an international patient. The user plays a clinic receptionist. Introduce yourself as an AI assistant calling for a test patient, Alex Kim. Request a 30-minute cosmetic consultation tomorrow afternoon, preferably 14:00 Korea time, with English interpretation. Ask about available slots, consultation fee and interpreter availability. If the requested time is unavailable, ask for alternatives; do not accept a materially different time or fee on the patient's behalf without saying it needs patient confirmation. Summarize the clinic's answers and pending confirmations. This is a rehearsal: do not claim that a real call or booking occurred. Never invent the receptionist's answers or provide medical advice.`,
  },
  change: {
    title: '예약 변경·취소 문의',
    role: '고객',
    prompt: `You are Talkie, an AI clinic booking assistant in a simulation. The user wants to change or cancel a consultation. Ask for a test name and the existing appointment time. No real reservation database is connected: explicitly say that this is a simulated change request and never claim to have looked up a real patient. Demo alternative slots tomorrow are 10:00, 14:00 and 16:00 Korea time. Clarify which appointment and action are intended, repeat the final details, then obtain explicit confirmation before completing a simulated request. Actual refund and cancellation policies are unknown; do not invent them.`,
  },
  free: {
    title: '자유 대화', role: '사용자',
    prompt: 'You are Talkie, a helpful AI voice assistant in a comparison PoC. Have a natural conversation, remember details in this session, and admit uncertainty. You have no real booking, phone dialing, payment, browsing or patient-record tools. Never pretend to have completed external actions.',
  },
};
export function parseSettings(body = {}) {
  if (!PROVIDERS.includes(body.provider)) throw new Error('지원하지 않는 서비스입니다.');
  if (!Object.hasOwn(SCENARIOS, body.scenario)) throw new Error('시나리오를 선택해 주세요.');
  if (!Object.hasOwn(LANGUAGES, body.language)) throw new Error('지원하지 않는 언어입니다.');
  if (typeof body.instructions !== 'string' || body.instructions.length > 6000) throw new Error('추가 지시사항은 6,000자 이내로 입력해 주세요.');
  if (!validVoice(body.provider, body.voice)) throw new Error('지원하지 않는 목소리입니다.');
  return { provider: body.provider, scenario: body.scenario, language: body.language, instructions: body.instructions.trim(), voice: body.voice };
}
export function buildPrompt(settings) {
  return `${SCENARIOS[settings.scenario].prompt}\nSpeak ${LANGUAGES[settings.language]} initially. Follow the user's explicitly requested language changes. Use short natural spoken sentences, no markdown, no excessive praise. Let the user finish, accept corrections and do not repeat answered questions. Disclose that you are an AI if asked.\n${settings.instructions ? `Additional test instructions:\n${settings.instructions}` : ''}`;
}
export function greetingInstruction(settings) {
  return `Begin immediately in ${LANGUAGES[settings.language]} by saying only: "${greetingText(settings.language)}". Then pause and listen to the caller. This restriction applies only to the opening greeting; after the caller speaks, follow the booking conversation instructions.`;
}
export function greetingText(language) {
  return {ko:'말씀하세요.',en:'Please go ahead.',ja:'どうぞお話しください。',zh:'请说。'}[language];
}
export function liveConfig(settings, env) {
  const instructions = buildPrompt(settings);
  return {
    model: env.OPENAI_LIVE_MODEL || 'gpt-live-1',
    instructions,
    audio: { output: { voice: settings.voice } },
    store: false,
    input: [{type: "message", role: "developer", content: [{type: "input_text", text: greetingInstruction(settings)}]}],
    delegation: { type: 'responses', responses: {
      model: env.OPENAI_LIVE_BACKEND_MODEL || 'gpt-5.6-terra', instructions,
    } },
  };
}
export function realtimeConfig(settings, env) {
  return {
    type: 'realtime', model: env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1',
    instructions: buildPrompt(settings), output_modalities: ['audio'],
    audio: { input: {
      transcription: { model: 'gpt-4o-mini-transcribe' },
      noise_reduction: { type: 'near_field' },
      turn_detection: { type: 'server_vad', threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 500, create_response: true, interrupt_response: true },
    }, output: { voice: settings.voice } },
  };
}

export function geminiConfig(settings) {
 return {responseModalities:['AUDIO'], systemInstruction:{parts:[{text:buildPrompt(settings)}]}, inputAudioTranscription:{}, outputAudioTranscription:{}, speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:settings.voice}}}};
}
