export const concept={mode:'mock_rehearsal',customer:'Allen',hotelRole:'한국인 호텔 직원',customerLanguage:'first_customer_utterance',hotelLanguage:'ko',directHumanBridge:false,realCalls:false,phoneNumber:null};
export const offers={
 basic:{checkIn:'2026-12-05',checkOut:'2026-12-07',nights:2,adults:2,rooms:1,roomType:'twin',breakfast:true,total:320000,currency:'KRW',payment:'at_hotel',freeCancelUntil:'2026-12-03T18:00:00+09:00',lateCancelFee:160000},
 change:{checkIn:'2026-12-06',checkOut:'2026-12-08',nights:2,adults:2,rooms:1,roomType:'twin',breakfast:false,total:280000,currency:'KRW',payment:'at_hotel',freeCancelUntil:'2026-12-04T18:00:00+09:00',lateCancelFee:140000},
};

// English is Allen's approved persona. Korean is an explicit language-routing test variation.
export function makeScript({variant='basic',language='en',result='pending_confirmation'}={}) {
 if(!['basic','change'].includes(variant)||!['en','ko'].includes(language)||!['pending_confirmation','confirmed'].includes(result))throw Error('Unsupported fixture');
 const changed=variant==='change',terms=offers[variant];const rows=[];
 const add=(speaker,event,text,extra={})=>rows.push({id:rows.length+1,speaker,leg:speaker==='hotel'?'hotel':extra.to||'customer',language:speaker==='hotel'||extra.to==='hotel'?'ko':language,event,text,...extra});
 const say=(en,ko)=>language==='en'?en:ko;
 add('customer','intent',say(changed?'I’m Allen. Could you call the hotel for me? I need one double room for two adults, December 5 to 7.':'I’m Allen. Could you call the hotel for me? I need one twin room for two adults, December 5 to 7, with breakfast.',changed?'Allen입니다. 호텔에 대신 전화해 주세요. 12월 5일부터 7일까지 성인 두 명, 더블룸 한 개요.':'Allen입니다. 호텔에 대신 전화해 주세요. 12월 5일부터 7일까지 성인 두 명, 조식 포함 트윈룸 한 개요.'),{dates:{checkIn:'2026-12-05',checkOut:'2026-12-07'}});
 add('ai','acknowledge',say('I’ll check with the hotel and ask you before making a reservation.','호텔에 확인한 뒤 예약 전에 다시 여쭤볼게요.'));
 add('ai','disclose','안녕하세요. 고객님 요청으로 숙박 문의를 대신 드리는 Talkie의 AI 전화비서입니다. 말씀해 주시는 내용은 AI가 처리해 고객님께 전달합니다. 지금 문의드려도 괜찮을까요?',{to:'hotel'});
 add('hotel','permission','네, 말씀해 주세요.',{allowed:true});
 if(changed){
  add('customer','correct_dates',say('Actually, please change check-in to December 6. Still two nights.','아, 체크인은 12월 6일로 바꿔 주세요. 이틀 묵는 건 같아요.'),{dates:{checkIn:'2026-12-06',checkOut:'2026-12-08'}});
  add('ai','inquire','고객님 희망 일정은 2026년 12월 6일 체크인, 8일 체크아웃입니다. 성인 두 분, 더블룸 한 개가 가능할까요?',{to:'hotel'});
  add('hotel','unavailable','그 날짜에는 더블룸이 없습니다. 조식 미포함 트윈룸은 가능해요.');
  add('ai','offer_alternative',say('The double room is unavailable for December 6 to 8. They can offer a twin room without breakfast. Would you like me to check that option?','12월 6일부터 8일까지 더블룸은 없고 조식 미포함 트윈룸은 가능하다고 합니다. 그 객실로 조건을 확인할까요?'));
  add('customer','choose_alternative',say('Yes, a twin room without breakfast is fine. What is the total, and can I cancel?','네, 조식 없는 트윈룸으로 괜찮아요. 총액과 취소 조건을 확인해 주세요.'),{accepted:true});
  add('ai','inquire','고객님이 조식 미포함 트윈룸으로 변경해도 괜찮다고 하셨습니다. 2박 총액과 취소 조건을 알려주시겠어요?',{to:'hotel'});
 }else add('ai','inquire','2026년 12월 5일부터 7일까지 2박, 성인 두 분, 조식 포함 트윈룸 한 개가 가능한가요? 총액과 취소 조건도 알려주세요.',{to:'hotel'});
 add('hotel','quote',changed?'네, 총 28만 원이고 현장 결제입니다. 한국 시간 12월 4일 오후 6시까지 무료 취소이고, 이후에는 14만 원이 부과됩니다.':'네, 총 32만 원이고 현장 결제입니다. 한국 시간 12월 3일 오후 6시까지 무료 취소이고, 이후에는 16만 원이 부과됩니다.',{terms});
 add('ai','readback',say(changed?'The hotel offers one twin room without breakfast for two adults, December 6 to 8, for 280,000 won, payable at the hotel. Cancellation is free until December 4 at 6 p.m. Korean time, then costs 140,000 won. Nothing is booked yet. Shall I request it under your name, Allen?':'The hotel offers one twin room with breakfast for two adults, December 5 to 7, for 320,000 won, payable at the hotel. Cancellation is free until December 3 at 6 p.m. Korean time, then costs 160,000 won. Nothing is booked yet. Shall I request it under your name, Allen?',changed?'성인 두 분, 12월 6일부터 8일까지 조식 미포함 트윈룸 한 개입니다. 총 28만 원이고 현장 결제입니다. 한국 시간 12월 4일 오후 6시까지 무료 취소, 이후에는 14만 원입니다. 아직 예약 전입니다. Allen 님 이름으로 요청할까요?':'성인 두 분, 12월 5일부터 7일까지 조식 포함 트윈룸 한 개입니다. 총 32만 원이고 현장 결제입니다. 한국 시간 12월 3일 오후 6시까지 무료 취소, 이후에는 16만 원입니다. 아직 예약 전입니다. Allen 님 이름으로 요청할까요?'),{terms});
 add('customer','booking_consent',say('Yes, please request that reservation.','네, 그 조건으로 예약 요청해 주세요.'),{allowed:true});
 add('ai','ask_contact',say('May I share your verified contact details with the hotel so they can confirm your request?','호텔에서 예약 요청을 확인할 수 있도록 확인된 연락처를 전달해도 될까요?'));
 add('customer','contact_consent',say('Yes, that’s fine.','네, 괜찮아요.'),{allowed:true});
 add('ai','submit','고객명은 Allen입니다. 안내해 주신 조건으로 예약을 요청하며, 확인된 연락처 전달에도 동의하셨습니다. 예약 확정 여부를 알려주시겠어요?',{to:'hotel',terms});
 add('hotel','hotel_result',result==='confirmed'?'안내드린 조건으로 예약이 확정됐습니다. 모의 예약 확인 참조값은 MOCK-HOTEL-CONFIRMED입니다.':'예약 요청은 접수했습니다. 최종 객실 배정은 확인 후 연락드리겠습니다.',{status:result,terms,confirmationRef:result==='confirmed'?'MOCK-HOTEL-CONFIRMED':null});
 add('ai','summary',say(result==='confirmed'?'The hotel has confirmed your reservation on the terms you approved. This rehearsal uses a mock confirmation reference.':'The hotel has received your request, but your reservation is not confirmed yet. They will contact you after checking the room allocation.',result==='confirmed'?'호텔에서 동의하신 조건으로 예약을 확정했습니다. 이번 리허설의 확인 참조값은 모의 값입니다.':'호텔에서 요청을 접수했지만 아직 예약이 확정되지는 않았습니다. 객실 배정을 확인한 뒤 연락드린다고 합니다.'),{status:result});
 return structuredClone(rows);
}
