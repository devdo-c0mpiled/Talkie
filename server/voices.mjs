const options = names => names.map(id => ({id, name:id}));
export const VOICES = {
 live: options(['marin', 'noeul', 'quartz', 'ripple']),
 realtime: options(['marin', 'cedar', 'alloy', 'ash', 'ballad', 'coral', 'echo', 'sage', 'shimmer', 'verse']),
 gemini: options(['Kore', 'Puck', 'Charon', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr']),
 elevenlabs: [{id:'default',name:'에이전트 기본'}],
};
export const DEFAULT_VOICES = {live:'marin', realtime:'marin', gemini:'Kore', elevenlabs:'default'};
export function validVoice(provider, voice) {
 return typeof voice==='string' && (provider==='elevenlabs' ? voice==='default'||/^[a-zA-Z0-9]{20}$/.test(voice) : !!VOICES[provider]?.some(v=>v.id===voice));
}
export async function voiceCatalog(env, upstream=fetch) {
 const catalog={...VOICES};
 if(!env.ELEVENLABS_API_KEY)return {voices:catalog};
 try {
  const r=await upstream('https://api.elevenlabs.io/v2/voices?page_size=100',{headers:{'xi-api-key':env.ELEVENLABS_API_KEY},signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error();
  const data=await r.json();
  catalog.elevenlabs=[...VOICES.elevenlabs,...(data.voices||[]).filter(v=>validVoice('elevenlabs',v.voice_id)&&typeof v.name==='string').map(v=>({id:v.voice_id,name:v.name}))];
  return {voices:catalog};
 }catch{return {voices:catalog,error:'ElevenLabs 목소리 목록을 불러오지 못했습니다.'};}
}
