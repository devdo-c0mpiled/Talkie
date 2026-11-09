가상 호텔로 진행하는 연기용 대본입니다. 고객은 **Allen**, 고객↔AI는 영어, AI↔호텔 직원은 한국어입니다. 호텔명·전화번호·예약번호는 테스트 전에 준비한 값을 사용합니다.

**1. 기본 예약 문의**

- **고객 → AI**  
  “Hi, I’m Allen. Could you ask the hotel whether they have a twin room for two adults, December 5 to 7, 2026? Please check availability first.”
- **AI → 호텔**  
  “안녕하세요. Allen 고객님을 대신해 문의드리는 AI 전화비서입니다. 지금 문의드려도 괜찮을까요?”
- **호텔 → AI**  
  “네, 말씀하세요.”
- **AI → 호텔**  
  “12월 5일부터 7일까지 2박, 성인 두 분이 묵을 트윈룸 한 개가 가능한가요?”
- **호텔 → AI**  
  “네, 가능합니다. 예약 요청을 남겨드릴까요?”
- **AI → 고객**  
  “They have a twin room available for those dates. Nothing is booked yet. Would you like to check the total price before deciding?”
- **고객 → AI**  
  “Yes, please check the total first.”

**2. 예약일 변경 — 숙박 기간 유지**

- **고객 → AI**  
  “I’d like to ask about changing my December 5 to 7 reservation. Please move check-in to December 6, but keep it at two nights.”
- **AI → 고객**  
  “That would be December 6 to 8, with the same room and guests. I’ll ask whether the change is possible before requesting it.”
- **AI → 호텔**  
  “Allen 고객님의 기존 예약 일정 변경 문의입니다. 12월 5일부터 7일까지의 예약을 6일부터 8일까지로 변경할 수 있을까요? 객실과 인원은 그대로이고, 아직 변경 요청은 아닙니다.”
- **호텔 → AI**  
  “가능 여부와 변경 금액을 확인해서 안내드려야 합니다.”
- **AI → 고객**  
  “The hotel needs to check availability and the revised total. Your reservation hasn’t been changed.”
- **고객 → AI**  
  “Okay. Let me know before making the change.”

**3. 체크아웃만 변경 — 체크인 유지**

- **고객 → AI**  
  “Keep my check-in on December 5, but change checkout from December 7 to December 8.”
- **AI → 고객**  
  “That would make it three nights, December 5 to 8. I’ll check whether you can add the extra night and what the new total would be.”
- **AI → 호텔**  
  “Allen 고객님이 체크인은 12월 5일 그대로 두고, 체크아웃만 7일에서 8일로 하루 연장할 수 있는지 문의하셨습니다. 추가 숙박 가능 여부와 변경된 총액을 확인 부탁드립니다.”
- **호텔 → AI**  
  “추가 하루는 가능하지만 같은 객실을 계속 쓰실 수 있는지는 확인이 필요합니다.”
- **AI → 고객**  
  “An extra night is available, but they haven’t confirmed whether you can stay in the same room. Would you like me to check that before you decide?”
- **고객 → AI**  
  “Yes. Please check that first. Don’t change the reservation yet.”

**4. 예약 취소 — 조건 확인 후 결정**

- **고객 → AI**  
  “I’m considering canceling my December 5 to 7 reservation. Can you check whether there’s a cancellation fee? Don’t cancel it yet.”
- **AI → 호텔**  
  “Allen 고객님의 예약 취소 조건을 문의드립니다. 취소 가능한지와 수수료가 있는지 확인 부탁드립니다. 아직 취소 처리는 하지 말아 주세요.”
- **호텔 → AI**  
  “예약 내역을 확인해 보니 지금 취소하시면 수수료는 없습니다.”
- **AI → 고객**  
  “The hotel says there’s no cancellation fee if you cancel now. Would you like me to request the cancellation?”
- **고객 → AI**  
  “Yes, please cancel it.”
- **AI → 호텔**  
  “고객님이 안내받은 조건으로 취소에 동의하셨습니다. 해당 예약 취소를 요청드립니다.”
- **호텔 → AI**  
  “네, 취소 처리됐습니다.”
- **AI → 고객**  
  “The hotel has confirmed that your reservation is canceled.”

**5. 캐리어 보관 — 예약 변경 없음**

- **고객 → AI**  
  “Could you ask whether the hotel can hold two suitcases after I check out on December 7? I’d leave them at 11 a.m. and collect them at 6 p.m.”
- **AI → 호텔**  
  “Allen 고객님이 12월 7일 체크아웃 후 오전 11시부터 오후 6시까지 캐리어 두 개를 맡길 수 있는지 문의하셨습니다.”
- **호텔 → AI**  
  “당일 보관 공간을 확인해야 해서 지금 확답드리기는 어렵습니다. 체크아웃하실 때 프런트에 말씀해 주세요.”
- **AI → 고객**  
  “They can’t guarantee storage in advance because it depends on space that day. They’ve asked you to check with the front desk at checkout.”
- **고객 → AI**  
  “Could you also ask whether there’s a fee?”
- **AI → 호텔**  
  “보관이 가능한 경우 비용이 있는지도 알 수 있을까요?”
- **호텔 → AI**  
  “투숙객 짐은 무료로 보관해 드리지만, 공간이 있어야 가능합니다.”
- **AI → 고객**  
  “There’s no charge for guests, but storage still depends on available space. It hasn’t been confirmed.”

**6. 원하는 객실이 없을 때 — 대안 확인**

- **고객 → AI**  
  “Could you ask for a double room for two adults, December 6 to 8?”
- **AI → 호텔**  
  “12월 6일부터 8일까지 성인 두 분이 묵을 더블룸 한 개가 가능한가요?”
- **호텔 → AI**  
  “더블룸은 없고 트윈룸은 가능합니다.”
- **AI → 고객**  
  “The double room is unavailable. They have a twin room with two separate beds. Would you like me to check that option?”
- **고객 → AI**  
  “A twin room is fine. Please check the total before booking.”
- **AI → 호텔**  
  “고객님이 트윈룸도 괜찮다고 하셨습니다. 예약 전에 2박 총액을 확인하고 싶어 하십니다.”
