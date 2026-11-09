const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function initialState({contactRef='mock-verified-contact'}={}){return {mode:'mock_rehearsal',stage:0,customerLanguage:null,hotelLanguage:'ko',disclosed:false,permission:false,dates:null,quote:null,readback:null,bookingConsent:false,contactAsked:false,contactConsent:false,contactRef,alternativeOffered:false,alternativeAccepted:false,submitted:false,status:'inquiry',confirmationRef:null,hotelConnected:true,customerConnected:true,events:[]};}
export function advance(previous,line){
 const s=structuredClone(previous);
 if(!line||line.id!==s.stage+1)throw Error('순서가 맞지 않거나 이미 처리된 발화입니다.');
 if(!['customer','hotel','ai'].includes(line.speaker)||!['customer','hotel'].includes(line.leg))throw Error('발화자 또는 회선 오류');
 if(line.speaker==='customer'&&line.leg!=='customer'||line.speaker==='hotel'&&line.leg!=='hotel')throw Error('사람 간 직접 중계는 허용하지 않습니다.');
 if(!s[`${line.leg}Connected`])throw Error('회선 연결이 끊겼습니다.');
 if(s.stage===0){if(line.event!=='intent'||line.speaker!=='customer'||!line.language)throw Error('사용자 최초 발화가 필요합니다.');s.customerLanguage=line.language;}
 if(line.language!==(line.leg==='hotel'?'ko':s.customerLanguage))throw Error('회선 언어가 최초 설정과 다릅니다.');
 const actors={intent:'customer',acknowledge:'ai',disclose:'ai',permission:'hotel',correct_dates:'customer',inquire:'ai',unavailable:'hotel',offer_alternative:'ai',choose_alternative:'customer',quote:'hotel',readback:'ai',booking_consent:'customer',ask_contact:'ai',contact_consent:'customer',submit:'ai',hotel_result:'hotel',summary:'ai'};
 if(actors[line.event]!==line.speaker)throw Error('이 동작을 수행할 수 없는 발화자입니다.');
 const hotelEvents=['disclose','permission','inquire','unavailable','quote','submit','hotel_result'];
 if(line.leg!==(hotelEvents.includes(line.event)?'hotel':'customer'))throw Error('잘못된 대상 회선입니다.');
 if(line.leg==='hotel'&&!['disclose','permission'].includes(line.event)&&!s.permission)throw Error('호텔의 진행 동의가 필요합니다.');
 switch(line.event){
 case 'intent':s.dates=line.dates;break;
 case 'disclose':s.disclosed=true;break;
 case 'permission':if(!s.disclosed)throw Error('AI 신원·목적을 먼저 안내해야 합니다.');s.permission=line.allowed===true;if(!s.permission)s.status='declined';break;
 case 'correct_dates':if(s.submitted)throw Error('요청 후 변경은 새 확인 절차가 필요합니다.');s.dates=line.dates;s.quote=null;s.readback=null;s.bookingConsent=false;s.contactConsent=false;break;
 case 'unavailable':s.quote=null;s.readback=null;s.bookingConsent=false;s.alternativeOffered=true;s.alternativeAccepted=false;break;
 case 'choose_alternative':if(!s.alternativeOffered)throw Error('대안 안내가 없습니다.');s.alternativeAccepted=line.accepted===true;break;
 case 'quote':
  if(s.submitted)throw Error('요청 후 견적 변경은 별도 재확인이 필요합니다.');
  if(!line.terms||line.terms.checkIn!==s.dates?.checkIn||line.terms.checkOut!==s.dates?.checkOut||!Number.isFinite(line.terms.total)||line.terms.total<=0)throw Error('견적 날짜 또는 금액 오류');
  if(s.alternativeOffered&&!s.alternativeAccepted)throw Error('대체 객실에 고객이 동의하지 않았습니다.');
  s.quote=line.terms;s.readback=null;s.bookingConsent=false;break;
 case 'readback':if(!s.quote||!same(s.quote,line.terms))throw Error('호텔 견적과 고객 안내가 다릅니다.');s.readback=line.terms;break;
 case 'booking_consent':if(!s.readback)throw Error('조건을 먼저 안내해야 합니다.');s.bookingConsent=line.allowed===true;break;
 case 'ask_contact':s.contactAsked=true;break;
 case 'contact_consent':if(!s.contactAsked)throw Error('공유 목적을 먼저 안내해야 합니다.');s.contactConsent=line.allowed===true;break;
 case 'submit':if(s.submitted)throw Error('중복 예약 요청입니다.');if(!s.bookingConsent||!same(s.readback,s.quote)||!same(s.quote,line.terms))throw Error('현재 조건에 대한 고객 동의가 필요합니다.');if(!s.contactConsent||!s.contactRef)throw Error('연락처 동의 또는 확인된 연락처가 없습니다.');s.submitted=true;s.status='request_submitted';break;
 case 'hotel_result':if(!s.submitted||!same(s.quote,line.terms))throw Error('호텔 결과가 요청 조건과 다릅니다.');if(!['pending_confirmation','confirmed'].includes(line.status))throw Error('알 수 없는 호텔 처리 결과입니다.');if(line.status==='confirmed'&&!line.confirmationRef)throw Error('호텔 예약 확정 근거가 없습니다.');s.status=line.status;s.confirmationRef=line.confirmationRef||null;break;
 case 'summary':if(!['pending_confirmation','confirmed'].includes(s.status)||line.status!==s.status)throw Error('호텔 확인 상태와 고객 요약이 다릅니다.');break;
 }
 s.stage=line.id;s.events.push({...line,delivery:'simulated'});return s;
}
