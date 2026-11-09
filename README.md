# Talkie

한국 뷰티숍과 외국인 고객을 위한 전화 통역 서비스의 시작 화면입니다. TanStack Start와 Router를 사용하고 Cloudflare Workers에서 실행합니다. Better Auth는 D1에 계정과 세션을 저장하며 로그인 폼은 TanStack Form을 사용합니다.

## 로컬 실행

Node.js 22.12 이상과 npm이 필요합니다. 로컬 D1 데이터는 `.wrangler/`에만 저장됩니다.

```sh
npm install
cp .dev.vars.example .dev.vars
# .dev.vars의 BETTER_AUTH_SECRET에 openssl rand -base64 32로 생성한 값을 넣습니다.
npx wrangler d1 migrations apply talkie-db --local
npm run dev -- --host 127.0.0.1 --port 3000
```

`.dev.vars`는 비밀값이므로 Git에 추가하지 마세요. 로컬 URL을 바꾸면 `BETTER_AUTH_URL`도 실제 접속 주소와 일치시켜야 합니다.

- `/`: 서비스 소개
- `/login`: 이메일과 비밀번호로 가입 또는 로그인
- `/admin`: 로그인한 사용자의 계정 화면. 통화 및 관리자 기능은 준비 중입니다.

이메일 소유권 확인과 비밀번호 재설정은 아직 제공하지 않습니다. 누구나 가입할 수 있으며 로그인은 관리자 권한을 부여하지 않습니다. 실제 관리 기능을 추가하기 전에 이메일 확인, 권한 모델과 복구 절차를 구현해야 합니다.

## 검사

```sh
npm run typecheck
npm run build
npm run deploy:check
# 로컬 서버를 실행한 상태에서 별도 터미널에서 실행합니다.
npm run test:auth
```

인증 검사는 로컬 서버에서만 실행되며 로컬 D1에 테스트 계정을 생성합니다. 회원가입, 비밀번호 거부, 세션, 로그아웃, 관리자 경로 보호 및 요청 제한을 확인합니다. `src/routeTree.gen.ts`는 개발 서버 또는 빌드 시 자동 생성됩니다.

## Cloudflare 배포

GitHub Actions는 `main`에 대한 PR과 `main` 또는 `allen-wip` push에서 타입 검사, 빌드, 배포 dry-run과 로컬 D1 인증 검사를 실행합니다. Cloudflare Workers Builds는 `main`을 빌드하고 배포합니다. 두 검사는 독립적으로 실행되므로 GitHub Actions 통과가 배포의 선행 조건은 아닙니다.

`wrangler.jsonc`의 `DB` 바인딩은 프로덕션 D1을 가리킵니다. 배포 전 대상 Cloudflare 계정과 데이터베이스를 확인하고 다음을 설정하세요.

1. `npx wrangler d1 migrations apply talkie-db --remote`로 D1 마이그레이션을 적용합니다. 적용 전 백업과 기존 데이터 영향을 검토하세요.
2. 32자 이상의 고유한 무작위 `BETTER_AUTH_SECRET`을 `npx wrangler secret put BETTER_AUTH_SECRET`으로 설정합니다. 로컬 비밀값과 다른 값을 사용하세요. 이 명령은 현재 운영 Worker의 새 버전을 즉시 배포할 수 있으므로 대상과 적용 시점을 확인하세요.
3. `BETTER_AUTH_URL`은 `wrangler.jsonc`의 서비스 URL입니다. 도메인이 바뀌면 실제 URL로 변경합니다.
4. `main` 배포 후 로그인, 세션과 로그아웃을 확인합니다. 이메일 인증과 관리자 권한은 아직 제공하지 않습니다.

인증 요청 제한은 Cloudflare가 제공하는 `cf-connecting-ip`를 사용하고 D1에 카운터를 저장합니다. 앱은 Cloudflare를 통해 제공되어야 하며, 로컬 테스트에서 보낸 헤더는 프로덕션 클라이언트 식별을 검증하지 않습니다.

## 음성 PoC 실행

Node.js 22.12 이상이 필요합니다.

```sh
npm ci
# .dev.vars가 없을 때만 예제 파일을 복사합니다.
cp -n .dev.vars.example .dev.vars
# .dev.vars에 API 키를 입력합니다.
npm run setup:elevenlabs
npm run dev -- --host 127.0.0.1 --port 4317
```

<http://127.0.0.1:4317/poc>에서 언어를 선택하고 모델 카드의 **대화 시작**을 누릅니다. 브라우저의 마이크 접근을 허용해야 합니다. 연결 후 AI가 먼저 인사합니다. 입력이 감지되지 않으면 **마이크 목록 확인**에서 사용할 장치를 선택합니다. 한 번에 한 모델만 연결되며, 종료 후 다른 모델을 선택할 수 있습니다. 각 대화는 최대 10분입니다.

- `/`: 서비스 소개
- `/poc`: 음성 비교 테스트

## 설정

`.dev.vars`는 로컬 Workers 환경변수 파일이며 Git에 포함되지 않습니다. OpenAI 키에는 선택한 모델의 접근 권한과 사용 가능한 결제가 필요합니다. 모델 ID는 예제 파일의 환경변수로 변경할 수 있습니다. 키가 설정되어 있어도 모델 접근 권한이 없으면 연결 오류가 표시됩니다.

`npm run setup:elevenlabs`는 인증이 필요한 PoC 전용 에이전트를 만들고 ID를 `.dev.vars`에 기록합니다. 이미 ID가 있으면 새로 만들지 않습니다. 기존 에이전트를 직접 지정할 때에는 시스템 프롬프트를 `{{test_prompt}}`, 첫 메시지를 `{{greeting}}`으로 설정하고 language 재정의를 허용해야 합니다. 생성 스크립트는 이 설정을 적용하고 사용할 버전 ID도 저장합니다. ElevenLabs 비교 대상은 에이전트의 LLM과 음성 합성 모델을 포함한 전체 대화 구성입니다.

네 서비스는 같은 시나리오와 추가 지시사항을 사용합니다. 기본 시나리오는 모의 성형외과 예약입니다. 테스트에서는 요청한 시술과 시간을 예약 가능한 것으로 처리하며 실제 병원 예약이나 전화 발신은 수행하지 않습니다. 한국어·영어·일본어·중국어를 선택할 수 있으며, 언어별 인식 품질은 직접 확인해야 합니다.

1. **마이크 목록 확인**을 누르고 입력 장치를 확인합니다. MacBook 내장 마이크가 있으면 우선 선택합니다.
2. 모델의 **대화 시작**을 누르고 “말씀하세요”가 들릴 때까지 기다립니다.
3. “내일 오후 두 시에 보톡스 예약 가능한가요?”라고 말합니다.
4. “네, 가능합니다. 예약해 드릴까요?”라는 답을 들으면 “네, 예약해 주세요”라고 말합니다.
5. “네, 예약되었습니다”라는 답을 확인하고 **종료**를 누릅니다. 다른 모델도 같은 순서로 테스트합니다.

이름이나 전화번호를 묻지 않는 짧은 모의 예약 흐름입니다. **마이크 끄기**는 입력을 무음으로 만들며, 발화 종료를 서버에 강제로 확정하는 기능은 아닙니다. 개발 서버의 코드 갱신은 통화를 끊을 수 있으므로 테스트 중 소스를 수정하지 않습니다.

토끼는 입력·출력 음량에 맞춰 듣기·말하기 상태를 표시합니다. 대화 전사, 연결 시간, 평가 점수는 현재 브라우저에 최대 30회 저장되며 JSON으로 내보내거나 삭제할 수 있습니다. 음성 파일은 녹음하거나 저장하지 않습니다. 로컬 서버 콘솔에는 OpenAI 전사·응답과 연결 진단이 출력됩니다. 연결 시간은 모델의 응답 지연 측정값이 아닙니다. 별도의 발화 끝→출력 시작 측정은 브라우저 음량 기반 추정값입니다. 제공자별 전사 시점과 지원 기능이 다르므로 응대 품질은 직접 듣고 평가합니다. 종료 확인에 실패하면 결과에 표시됩니다.

## Gemini Live

`.dev.vars`의 `GEMINI_API_KEY`를 설정하고 Gemini Live 카드에서 대화를 시작합니다. 기본 모델은 `gemini-3.8-live`, 목소리는 `Kore`이며 모델은 `GEMINI_LIVE_MODEL`로 변경할 수 있습니다. 이 모델에 대한 API 접근 권한이 필요합니다.

서버가 모델·지침·전사 설정을 고정한 1회용 토큰을 발급합니다. 브라우저는 이 토큰으로 Gemini Live에 직접 연결하므로 영구 API 키를 받지 않습니다. 토큰은 발급 후 1분 안에 연결해야 하고 유효기간은 15분입니다. 앱의 대화 제한은 기존과 같이 10분입니다.

마이크 음성은 PCM16으로 전송하고 응답은 Web Audio로 재생합니다. 전사와 사용량 이벤트를 수집하며, 끼어들기 이벤트가 오면 남은 재생을 중단합니다. 종료 시 소켓·오디오 처리 노드·마이크를 정리합니다. `gemini.audio_received`는 음성 데이터 수신 이벤트이며 사용자가 실제로 들은 시점이나 지연 측정값은 아닙니다.

참고: [Gemini 임시 토큰](https://ai.google.dev/gemini-api/docs/live-api/ephemeral-tokens), [Live WebSocket API](https://ai.google.dev/api/live).

## 검증 범위

한국어 녹음 파일을 가상 마이크로 입력한 테스트에서 네 서비스 모두 예약 완료 응답까지 확인했습니다. Realtime과 Gemini에는 일부 전사 오인식이 있었고, ElevenLabs는 무음에서 추가 질문을 하는 경우가 있었습니다. 이 결과는 실제 마이크 환경이나 모든 언어의 인식 품질을 보장하지 않습니다. 녹음 파일과 개인 테스트 로그는 저장소에 포함하지 않습니다.


음성 API는 localhost 요청만 허용합니다. 음성 코드 검사는 `npm test`로 실행합니다.

## 목소리 선택

기본 모델은 GPT Live입니다. 각 모델 카드의 **목소리**를 선택한 뒤 대화를 시작합니다. 통화 중에는 변경할 수 없으며, 종료 후 다른 목소리로 다시 시작합니다. 선택한 값은 테스트 기록과 JSON에 함께 저장됩니다.

GPT Live는 marin·noeul·quartz·ripple, Realtime은 내장 목소리 10종, Gemini는 Kore·Puck 등 8종을 제공합니다. ElevenLabs는 계정에서 조회한 목소리 목록의 첫 100개와 에이전트 기본 목소리를 제공합니다. 기존 ElevenLabs 에이전트는 `npm run setup:elevenlabs -- --enable-voice-selection`으로 Voice ID 재정의를 허용해야 합니다. 이 명령은 `.dev.vars`에 지정된 에이전트 설정과 버전 ID를 갱신합니다.

목록 기준: [GPT Live](https://developers.openai.com/api/docs/guides/live-conversations), [Realtime](https://developers.openai.com/api/docs/guides/realtime-conversations), [Gemini Live](https://ai.google.dev/gemini-api/docs/live-guide), [ElevenLabs overrides](https://elevenlabs.io/docs/eleven-agents/customization/personalization/overrides).
