# 호텔 대리 예약 하네스

Allen은 처음 사용한 언어로 AI와 대화하고, AI는 한국인 호텔 직원과 별도 한국어 회선으로 대화한다. 두 사람이 직접 대화하는 통역 통화는 구성하지 않는다.

```sh
npm --prefix harness/hotel test
npm --prefix harness/hotel start
```

http://127.0.0.1:4321 에서 기본 예약과 날짜 변경 대본을 확인할 수 있다. 추가 패키지나 API 키는 필요 없다. Node.js 20 이상을 사용한다.

기본 대본은 영어를 사용하는 Allen을 유지한다. 한국어 선택은 최초 고객 언어 고정 규칙을 확인하기 위한 테스트 변형이다. 실제 음성 언어 감지나 다른 언어 번역을 구현한 것은 아니다.

## 검증 범위

- AI 신원·대리 문의 목적·음성 처리와 전달 안내 후 호텔의 진행 의사 확인
- 날짜 변경 시 숙박 기간 유지, 대체 객실에 대한 고객 선택
- 호텔 견적과 고객 안내의 일치, 변경된 견적에 대한 재동의
- 예약 요청 동의와 연락처 공유 동의 구분
- 호텔 답변이 요청 접수이면 미확정 유지, 호텔 확정 근거가 있을 때만 확정으로 요약
- 거절·연락처 누락·회선 단절·중복 요청 차단

호텔의 객실·가격·취소 규정·확인 참조값은 모두 모의 데이터다. `confirmed`도 모의 호텔 응답을 검증한 상태이며 실제 예약이 아니다. 전화번호는 생성하지 않는다.

고정 대본과 구조화된 이벤트를 검사한다. 문장의 의미·자연스러움은 수동 검토 대상으로 남기며, 실제 AI 모델·음성 인식·발신·예약 DB는 호출하지 않는다. 실패 분기는 처리를 중단하고 원인을 표시한다. 자동 재발신이나 예약 재시도는 하지 않는다.

첫 안내 문구는 개인정보 처리에 필요한 법적 검토를 대체하지 않는다. 실제 서비스에서 녹음·전사·보관·국외 이전을 수행한다면 실제 처리 방식에 맞는 근거와 안내를 별도로 확인해야 한다.

## TanStack 연동 준비

`evaluate.mjs`는 DOM, React, API 키 없이 실행된다. 팀원 작업이 main에 반영되면 실제 에이전트와 도구 실행에서 관찰한 이벤트를 아래 형식으로 변환해 전달한다. 누락된 이벤트를 대본에서 복사해 채우면 검증 의미가 사라진다.

```js
import {evaluateTrace} from './harness/hotel/evaluate.mjs';
const report = evaluateTrace(observedEvents, {
  variant: 'basic', language: 'en', result: 'pending_confirmation',
  contactRef: 'mock-verified-contact',
});
if (!report.passed) console.error(report.errors);
```

JSON 파일로도 실행할 수 있다. `{ "events": [...], "expectation": { "variant": "basic", "language": "en", "result": "pending_confirmation" } }`를 저장하고 `node harness/hotel/check-trace.mjs <파일>`을 실행한다. 성공은 종료 코드 0, 실패는 1이다. 이벤트 필드는 `scenario.mjs`를 따른다. 이 평가기는 승인된 두 대본의 정확한 이벤트 순서와 조건을 검사한다. 자유 대화 전체를 평가하는 도구는 아니다.

현재 통과는 구조화된 이벤트 검증 결과다. 실제 AI 응답의 의미, 음성 지연, 전화 연결, 예약 DB 반영은 별도 증거가 필요하며 `modelTested`와 `telephonyTested`는 false로 유지한다. 운영 경로에 모의 연락처 기본값을 사용하면 안 된다.

main 반영 후 확인 순서:

1. `git fetch origin` 후 새 커밋과 변경 파일을 확인한다. 공유 작업 디렉터리의 미커밋 파일은 건드리지 않는다.
2. 호텔 브랜치에서 `git merge-tree --write-tree HEAD origin/main`으로 충돌을 사전 확인한다. 변경된 라우트와 서버 함수 경계를 읽고 실제 연동 위치를 결정한다.
3. 통합 브랜치에서 병합하고 `npm ci`, `npm run typecheck`, `npm run build`, `npm --prefix harness/hotel test`를 실행한다.
4. 실제 에이전트 이벤트를 매핑하고 두 대본의 미확정·확정 분기를 검사한다. 거절, 연락처 누락, 날짜 변경, 연결 단절도 확인한다.
5. 발신은 별도 회선으로 연결되는지, 중복 요청이 DB에 없는지 확인한다. 화면 재생만으로 실제 통화 검증을 통과시키지 않는다.

## 호텔 측 관리 범위

호텔 가입과 관리 화면은 전화 수신의 필수 조건이 아니다. 관리 화면은 시간에 따라 보류 가능한 별도 범위다. 추후 연결 시 요청 ID, 고객이 동의한 숙박 조건, 접수/미확정/확정 상태, 호텔 확인 근거, 후속 연락 필요 여부를 표시한다. 조회 권한과 실제 저장소가 연결되기 전에는 관리 기능이 구현됐다고 표시하지 않는다. 호텔 직원의 상태 변경만으로 고객 동의를 대신하거나 기존 요청을 중복 생성하지 않는다.

## 평가 방법 참고

- [skills.sh · AI agent evaluation](https://www.skills.sh/mejbaurbahar/software-tester-skills/ai-agent-evaluation): 최종 상태와 도구 실행 기록을 검사하고 평가기 자체에도 실패 사례를 적용한다. 본 하네스에 반영했다.
- [skills.sh · Google ADK evaluation](https://www.skills.sh/google/adk-docs/adk-eval-guide), [원본 저장소](https://github.com/google/adk-docs): 호출 순서와 대화 시나리오 평가 참고. TanStack 프로젝트에 ADK 런타임은 추가하지 않았다.
- [skills.sh · Promptfoo evaluation](https://www.skills.sh/testland/qa/promptfoo-evaluation), [Promptfoo 저장소](https://github.com/promptfoo/promptfoo): 실제 모델 연결 후 같은 입력을 반복 실행하고 회귀 결과를 비교할 후보. 현재 설치하거나 실행한 것은 아니다.

2026-11-09 점검에서 JSON 키 순서에 따른 오판, 외부 이벤트 수정으로 내부 견적이 바뀌는 문제, 종료 후 재진입, 잘못된 박수·인원·취소 조건을 보완했다. 고객 이름은 첫 발화에서 확인한다. 기본 대본은 총액만 안내하며 세금 포함 여부는 고객이 물었을 때 호텔에 확인한다.

## 시나리오 실행

`/test`는 `/chat`과 같은 챗 UI를 사용한다. 대본 선택기, 테스트 배지, 개발용 상태 문구는 표시하지 않는다. 대화 중 필요한 조건 확인과 승인·결과 카드만 표시한다. 원문 대본은 `hotel-roleplay-scripts.md`에 있다.

AI가 `hotel_inquiry`를 호출하면 서버가 호텔 조건을 조회하고 제안을 D1에 저장한다. 고객이 카드에서 승인하면 현재 제안 ID와 버전을 검사한 뒤 예약을 생성·변경·취소한다. AI는 `hotel_status`로 저장 결과를 다시 확인한다. 자유 텍스트의 “네”나 모델의 성공 문구만으로는 예약을 바꾸지 않는다.

- 기본 예약: `/test?scenario=booking`
- 예약일 변경: `/test?scenario=dates`
- 체크아웃만 변경: `/test?scenario=checkout`
- 취소: `/test?scenario=cancel`
- 캐리어 보관: `/test?scenario=luggage`
- 대체 객실: `/test?scenario=alternative`

기존 예약이 필요한 네 시나리오는 Allen의 12월 5~7일 예약으로 시작한다. 예약일만 변경하면 숙박 기간을 유지하고, 체크아웃만 변경하면 체크인을 유지한다. 짐 보관은 가능 여부 문의로 끝나며 보관 확정이나 예약 변경을 하지 않는다.

로컬 실행에는 `OPENAI_API_KEY`, `HOTEL_SANDBOX_ENABLED=true`, `npx wrangler d1 migrations apply talkie-db --local`이 필요하다. 호텔 상태는 `hotel_workflows` 테이블에 저장하며 버전 조건부 갱신으로 중복·동시 요청을 검사한다.

현재 호텔 응답과 예약 DB는 샌드박스다. 고객 화면의 시연용 문구는 실제 서비스와 같지만 내부 `mode=sandbox`와 테스트 예약 ID를 유지한다. 실제 전화·호텔 예약 시스템의 성공을 뜻하지 않는다. 샌드박스 모드에서는 발신 도구가 제공되지 않는다.

`TokieChat`의 `hotelWorkflow` 속성이 실행 경로를 연결한다. `hotelHarness`는 개발용 대본 패널만 제어하며 두 화면에서는 꺼 둔다. `/chat`은 서버 설정에서 호텔 워크플로가 활성화된 경우에만 같은 실행 경로를 사용하고, 비활성 상태에서는 기존 채팅을 유지한다. 운영 실발신으로 전환하려면 호텔 사업자 응답 어댑터를 연결하고 별도로 검증해야 한다.

```sh
node --test scripts/check-hotel-workflow.mjs
npm --prefix harness/hotel test
npm run typecheck
npm run build
```

`scripts/hotel-workflow-browser-check.js`는 Playwright의 page를 받는 브라우저 검증 함수다. 실제 AI 응답과 D1 저장 결과를 함께 확인한다. 모델 호출 비용이 발생하므로 CI에서는 상태 전이 테스트만 자동 실행한다.
