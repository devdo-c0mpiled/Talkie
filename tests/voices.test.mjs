import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSettings,liveConfig,realtimeConfig,geminiConfig} from '../server/config.mjs';
import {voiceCatalog} from '../server/voices.mjs';
import {handleApi} from '../server/api.mjs';
const base={scenario:'booking',language:'ko',instructions:''};
test('provider voice validation and output configuration preserve the selection',()=>{
 for(const [provider,voice,configure] of [['live','noeul',liveConfig],['realtime','cedar',realtimeConfig],['gemini','Puck',geminiConfig]]){
  const settings=parseSettings({...base,provider,voice});const config=configure(settings,{});
  assert.equal(provider==='gemini'?config.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName:config.audio.output.voice,voice);
 }
 assert.throws(()=>parseSettings({...base,provider:'realtime',voice:'noeul'}));
 assert.throws(()=>parseSettings({...base,provider:'gemini',voice:'marin'}));
});
test('ElevenLabs forwards the selected voice with the SDK field name',async()=>{
 const voice='abcdefghijklmnopqrst';
 const request=new Request('http://localhost/api/session',{method:'POST',headers:{origin:'http://localhost'},body:JSON.stringify({...base,provider:'elevenlabs',voice})});
 const response=await handleApi(request,{ELEVENLABS_API_KEY:'secret',ELEVENLABS_AGENT_ID:'agent'},async()=>Response.json({token:'ephemeral'}));
 assert.equal(response.status,200);assert.equal((await response.json()).overrides.tts.voiceId,voice);
});
test('voice catalog returns only labels and IDs and exposes lookup failure',async()=>{
 const result=await voiceCatalog({ELEVENLABS_API_KEY:'secret'},async()=>Response.json({voices:[{voice_id:'abcdefghijklmnopqrst',name:'Test',secret:'private'}]}));
 assert.deepEqual(result.voices.elevenlabs[1],{id:'abcdefghijklmnopqrst',name:'Test'});
 assert.ok((await voiceCatalog({ELEVENLABS_API_KEY:'secret'},async()=>new Response(null,{status:403}))).error);
});
