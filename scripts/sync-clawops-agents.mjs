import fs from 'node:fs'
import {parseEnv} from 'node:util'
import {phoneAgentInstructions,hotelRoleplayInstructions} from '../src/lib/phone-agent-instructions.mjs'
const base=`https://api.claw-ops.com/v1/accounts/${process.env.CLAWOPS_ACCOUNT_ID}/agents`
const headers={authorization:`Bearer ${process.env.CLAWOPS_API_KEY}`,'content-type':'application/json'}
const updates={}
for(const [key,name,instructions] of [
  ['CLAWOPS_AGENT_ID','Tokie 발신 상담원',phoneAgentInstructions],
  ['CLAWOPS_ROLEPLAY_AGENT_ID','Tokie 호텔 예약 상담원',hotelRoleplayInstructions],
]) {
  let id=process.env[key]
  if(!id){const r=await fetch(base,{headers});if(!r.ok)throw Error(`List failed ${r.status}`);id=(await r.json()).data.find(x=>x.name===name)?.agentId}
  const r=await fetch(id?`${base}/${id}`:base,{method:id?'PATCH':'POST',headers,body:JSON.stringify({name,instructions,greeting:false,liveEvents:{events:['transcript.final','transcript.partial']}})})
  if(!r.ok)throw Error(`Agent update failed ${r.status}`)
  updates[key]=(await r.json()).agentId
  console.log(`${name}: configured`)
}
for(const file of ['.env.local','.dev.vars']){
  const vars={...parseEnv(fs.readFileSync(file,'utf8')),...updates}
  fs.writeFileSync(file,Object.entries(vars).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n',{mode:0o600})
}
