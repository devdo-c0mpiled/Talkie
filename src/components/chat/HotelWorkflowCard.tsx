import type { Workflow } from '../../lib/hotel-workflow'
const labels: Record<Workflow['status'],string> = {
 inquiry:'', needs_details:'More information needed', unavailable:'Another room is available',awaiting_customer:'Review your request',
 declined:'Request declined',confirmed:'Reservation confirmed',changed:'Reservation updated',cancelled:'Reservation canceled',information_only:'Hotel response',
}
export function HotelWorkflowCard({state,busy,error,onDecide}:{state:Workflow|null;busy:boolean;error:string|null;onDecide:(approved:boolean)=>void}) {
 if(error)return <p className="ch-error" role="alert">We couldn’t check your request. Please try again.</p>
 if(!state||state.status==='inquiry')return null
 const stay=state.offer?.stay??state.booking
 return <section className="ch-card ch-workflow" aria-label="Hotel request">
  <strong role="status">{labels[state.status]}</strong>
  {stay&&<p>{stay.guestName} · {stay.checkIn} → {stay.checkOut}<br/>{stay.roomType} · {stay.adults} adults · {stay.rooms} room</p>}
  {state.offer&&<p>{state.offer.operation==='cancel'?`Cancellation fee: ₩${state.offer.fee?.toLocaleString()}`:`Total: ₩${state.offer.total.toLocaleString()}`}</p>}
  {state.offer&&<div className="ch-card-actions">
    <button className="ch-btn-primary" type="button" disabled={busy} onClick={()=>onDecide(true)}>{state.offer.operation==='cancel'?'Confirm cancellation':'Confirm request'}</button>
    <button className="ch-btn-soft" type="button" disabled={busy} onClick={()=>onDecide(false)}>Keep unchanged</button>
  </div>}
 </section>
}
