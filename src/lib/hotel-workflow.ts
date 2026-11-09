// Executable hotel workflow. No framework, model, network or UI dependencies.
export type Operation = 'availability' | 'book' | 'change_dates' | 'change_checkout' | 'cancel' | 'luggage'
export type Stay = { guestName: string; checkIn: string; checkOut: string; adults: number; rooms: number; roomType: 'twin' | 'double' }
export type Booking = Stay & { id: string; status: 'confirmed' | 'cancelled'; total: number }
export type Inquiry = Partial<Stay> & { operation: Operation; bags?: number; dropOff?: string; pickUp?: string; fromDate?: string; throughDate?: string; stayNights?: number }
export type AvailableStay = {checkIn:string;checkOut:string;nights:number;roomType:Stay['roomType']}
export type Offer = { id: string; operation: Operation; stay: Stay; total: number; fee?: number; evidenceKo: string }
export type Workflow = {
 id: string; mode: 'sandbox'; scenario: string; version: number;
 status: 'inquiry' | 'needs_details' | 'unavailable' | 'awaiting_customer' | 'declined' | 'confirmed' | 'changed' | 'cancelled' | 'information_only';
 booking: Booking | null; draft: Stay; offer: Offer | null; evidenceKo: string | null;
 availability?: {fromDate:string;throughDate:string;nights:number;roomType:Stay['roomType'];options:AvailableStay[]};
 missing: string[]; audit: { event: string; version: number }[];
 lastCommit: string | null; lastOperation: Operation | null;
}
export const scenarioIds = ['booking', 'dates', 'checkout', 'cancel', 'luggage', 'alternative'] as const
const initialStay: Stay = { guestName: 'Allen', checkIn: '2026-12-05', checkOut: '2026-12-07', adults: 2, rooms: 1, roomType: 'twin' }
export function newWorkflow(id: string, scenario: string): Workflow {
 if (!(scenarioIds as readonly string[]).includes(scenario)) throw Error('Unknown hotel scenario')
 const existing = ['dates', 'checkout', 'cancel', 'luggage'].includes(scenario)
 return { id, scenario, mode: 'sandbox', version: 0, status: 'inquiry',
  booking: existing ? { ...initialStay, id: `TEST-${id}`, status: 'confirmed', total: 280000 } : null,
  draft: { ...initialStay }, offer: null, evidenceKo: null, missing: [], audit: [], lastCommit: null, lastOperation: null }
}
const day = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s
const nights = (stay: Stay) => (Date.parse(stay.checkOut) - Date.parse(stay.checkIn)) / 86400000
function record(s: Workflow, event: string) { s.version++; s.audit.push({event, version:s.version}); return s }
export function inquireHotel(previous: Workflow, input: Inquiry, offerId = crypto.randomUUID()): Workflow {
 const s = structuredClone(previous)
 const continuing = s.lastOperation === input.operation
 s.lastOperation = input.operation
 s.offer = null; s.evidenceKo = null; s.missing = []; s.status = 'inquiry'
 if (!['availability','book','change_dates','change_checkout','cancel','luggage'].includes(input.operation)) throw Error('Unknown hotel operation')
 if (input.operation==='availability') {
  const fromDate=input.fromDate??'2026-12-05', throughDate=input.throughDate??'2026-12-08'
  const duration=input.stayNights??nights(s.draft), roomType=input.roomType??s.draft.roomType
  if(!day(fromDate)||!day(throughDate)||fromDate>throughDate||!Number.isInteger(duration)||duration<1||duration>30||!['twin','double'].includes(roomType)||(input.adults!==undefined&&input.adults!==2)||(input.rooms!==undefined&&input.rooms!==1)) {
   delete s.availability;s.status='needs_details';s.missing=['valid check-in search dates, positive whole nights, one room and two adults'];return record(s,'invalid_availability_search')
  }
  const options:AvailableStay[]=[]
  for(const checkIn of ['2026-12-05','2026-12-06','2026-12-07']) {
   const checkOut=new Date(Date.parse(checkIn)+duration*86400000).toISOString().slice(0,10)
   if(checkIn>=fromDate&&checkIn<=throughDate&&checkOut<='2026-12-08'&&!(roomType==='double'&&checkIn>='2026-12-06'))options.push({checkIn,checkOut,nights:duration,roomType})
  }
  s.availability={fromDate,throughDate,nights:duration,roomType,options};s.status='information_only'
  const listed=options.map(o=>`${o.checkIn} 체크인, ${o.checkOut} 체크아웃`).join('; ')
  s.evidenceKo=`확인된 숙박 재고 범위는 2026년 12월 5일부터 8일까지입니다. ${roomType==='twin'?'트윈룸':'더블룸'} 1개, 성인 2명, ${duration}박 기준 ${listed?`가능한 일정: ${listed}`:'조회 조건에 맞는 일정은 이 범위에서 확인되지 않았습니다'}. 범위 밖 날짜는 확인되지 않았습니다. 예약은 생성하거나 변경하지 않았습니다.`
  return record(s,'available_dates_checked')
 }
 const existing = s.booking?.status === 'confirmed' ? s.booking : null
 if (['change_dates','change_checkout','cancel'].includes(input.operation) && !existing) {
  s.status='needs_details'; s.missing=['active reservation']; return record(s,'missing_reservation')
 }
 if (input.operation === 'book' && existing) { s.status='needs_details';s.missing=['use a change operation for the existing reservation']; return record(s,'existing_reservation') }
 if (input.operation === 'luggage') {
  if (!Number.isInteger(input.bags) || (input.bags ?? 0) < 1 || !/^\d{2}:\d{2}$/.test(input.dropOff ?? '') || !/^\d{2}:\d{2}$/.test(input.pickUp ?? '') || input.dropOff! >= input.pickUp! || [input.dropOff,input.pickUp].some(t=>Number(t?.slice(0,2))>23||Number(t?.slice(3))>59)) {
   s.status='needs_details';s.missing=['number of bags and valid same-day storage times'];return record(s,'missing_storage_details')
  }
  s.status='information_only'; s.evidenceKo=`가방 ${input.bags}개, ${input.dropOff}부터 ${input.pickUp}까지 보관 문의입니다. 투숙객 보관료는 없지만 당일 공간 확인이 필요합니다. 보관 확정은 아닙니다.`
  return record(s,'luggage_checked')
 }
 const stay: Stay = { ...(continuing ? s.draft : existing ?? s.draft) }
 if(input.operation==='book'&&previous.lastOperation==='availability'&&previous.availability&&input.checkIn) {
  const option=previous.availability.options.find(o=>o.checkIn===input.checkIn&&(!input.roomType||o.roomType===input.roomType))
  if(option){stay.roomType=option.roomType;if(!input.checkOut)stay.checkOut=option.checkOut}
 }
 delete s.availability
 for (const key of ['guestName','checkIn','checkOut','adults','rooms','roomType'] as const) {
  const value = input[key]; if (value !== undefined) Object.assign(stay, {[key]:value})
 }
 if (input.operation==='cancel') Object.assign(stay, existing)
 if (input.operation==='change_checkout' && input.checkIn && input.checkIn!==existing!.checkIn) {
  s.status='needs_details';s.missing=['checkout-only changes must preserve check-in'];return record(s,'conflicting_dates')
 }
 if (input.operation==='change_dates' && input.checkIn && !input.checkOut && day(input.checkIn)) {
  stay.checkOut = new Date(Date.parse(input.checkIn) + nights(existing!) * 86400000).toISOString().slice(0,10)
 }
 s.draft=stay
 if (!day(stay.checkIn)||!day(stay.checkOut)||nights(stay)<=0||nights(stay)>30||stay.checkIn<'2026-12-05'||stay.checkOut>'2026-12-08'||!stay.guestName.trim()||stay.adults!==2||stay.rooms!==1||!['twin','double'].includes(stay.roomType)) {
  s.status='needs_details';s.missing=['sandbox supports Dec 5–8, 2026, one room, two adults and a guest name'];return record(s,'invalid_details')
 }
 if (input.operation!=='cancel' && stay.roomType==='double' && stay.checkIn>='2026-12-06') {
  s.status='unavailable';s.evidenceKo='해당 일정에는 더블룸이 없습니다. 트윈룸은 가능합니다. 고객님 선택을 확인해 주세요.';return record(s,'alternative_offered')
 }
 const total = input.operation==='cancel' ? existing!.total : nights(stay)*140000
 const evidenceKo = input.operation==='cancel' ? '이 테스트 예약은 현재 취소 수수료 없이 취소할 수 있습니다. 아직 취소 처리 전입니다.' : `${stay.checkIn}부터 ${stay.checkOut}까지 ${nights(stay)}박, 성인 ${stay.adults}명, ${stay.roomType==='twin'?'트윈룸':'더블룸'} ${stay.rooms}개가 가능합니다. 총액은 ${total}원입니다. 아직 요청을 적용하지 않았습니다.`
 s.offer={id:offerId,operation:input.operation,stay,total,...(input.operation==='cancel'?{fee:0}:{}),evidenceKo};s.evidenceKo=evidenceKo;s.status='awaiting_customer'
 return record(s,'hotel_offer_received')
}
export function decideHotel(previous: Workflow, offerId: string, version: number, approved: boolean): Workflow {
 if (approved && previous.lastCommit===offerId) return previous
 if (previous.version!==version || previous.status!=='awaiting_customer' || previous.offer?.id!==offerId) throw Error('The offer changed. Review the latest terms before deciding.')
 const s=structuredClone(previous), offer=s.offer!
 if (!approved) {s.offer=null;s.status='declined';return record(s,'customer_declined')}
 if (offer.operation==='cancel') {
  if (!s.booking||s.booking.status!=='confirmed') throw Error('No active reservation')
  s.booking.status='cancelled';s.status='cancelled';s.evidenceKo='테스트 호텔에서 예약 취소 처리를 완료했습니다.'
 } else {
  s.booking={...offer.stay,id:s.booking?.id??`TEST-${s.id}`,total:offer.total,status:'confirmed'}
  s.status=offer.operation==='book'?'confirmed':'changed';s.evidenceKo=offer.operation==='book'?'테스트 호텔에서 예약을 저장했습니다.':'테스트 호텔에서 예약 변경을 저장했습니다.'
 }
 s.lastCommit=offerId;s.draft={...offer.stay};s.offer=null
 return record(s,'customer_approved_and_sandbox_saved')
}
