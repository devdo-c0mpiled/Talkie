import '@tanstack/react-start/server-only'
import { env } from 'cloudflare:workers'
import { newWorkflow, inquireHotel, decideHotel } from './hotel-workflow'
import type { Workflow, Inquiry } from './hotel-workflow'

export function sandboxEnabled() { return env.HOTEL_SANDBOX_ENABLED === 'true' }
const validId=(id:unknown):id is string=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id)
export async function readWorkflow(id:string):Promise<Workflow> {
 if(!sandboxEnabled()||!validId(id))throw Error('Hotel sandbox is unavailable')
 const row=await env.DB.prepare('SELECT state FROM hotel_workflows WHERE id = ?').bind(id).first<{state:string}>()
 if(!row)throw Error('Start a hotel session first')
 return JSON.parse(row.state)
}
export async function startWorkflow(id:string,scenario:string) {
 if(!sandboxEnabled()||!validId(id))throw Error('Hotel sandbox is unavailable')
 const s=newWorkflow(id,scenario)
 await env.DB.prepare('INSERT OR IGNORE INTO hotel_workflows (id,state,version) VALUES (?,?,0)').bind(id,JSON.stringify(s)).run()
 const stored=await readWorkflow(id)
 if(stored.scenario!==scenario)throw Error('Session scenario mismatch')
 return stored
}
async function replace(previous:Workflow,next:Workflow) {
 if(previous===next)return previous
 const result=await env.DB.prepare('UPDATE hotel_workflows SET state = ?,version = ? WHERE id = ? AND version = ?').bind(JSON.stringify(next),next.version,previous.id,previous.version).run()
 if(result.meta.changes!==1)throw Error('State changed. Refresh before trying again.')
 return next
}
export async function queryWorkflow(id:string,input:Inquiry) {
 const previous=await readWorkflow(id)
 return replace(previous,inquireHotel(previous,input))
}
export async function handleHotelWorkflow(request:Request):Promise<Response> {
 if(!sandboxEnabled())return Response.json({error:'Hotel sandbox is not enabled.'},{status:503})
 try {
  const body=await request.json() as Record<string,unknown>
  if(!validId(body.sessionId))throw Error('Invalid session')
  if(body.action==='start'&&typeof body.scenario==='string')return Response.json({state:await startWorkflow(body.sessionId,body.scenario)})
  if(body.action==='read')return Response.json({state:await readWorkflow(body.sessionId)})
  if(body.action==='decide'&&typeof body.approved==='boolean'&&typeof body.offerId==='string'&&Number.isInteger(body.version)) {
   const previous=await readWorkflow(body.sessionId)
   const next=decideHotel(previous,body.offerId,body.version as number,body.approved)
   return Response.json({state:await replace(previous,next)})
  }
  throw Error('Invalid action')
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Hotel operation failed'},{status:409})}
}
