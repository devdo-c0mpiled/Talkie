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

## 팀 개발용 TanStack 패키지

Start, Router, Form 외에 AI, Query, DB, Table, Virtual, Store, Pacer, Hotkeys, Charts, Markdown, Highlight와 각종 개발 도구를 설치했습니다. 설치된 패키지와 버전은 `package.json`에서 확인할 수 있습니다. DB, Pacer, Hotkeys 등 일부는 정식 안정판 전 버전이므로 사용 전에 해당 버전의 API를 확인하세요.

TanStack DB는 D1을 대체하지 않습니다. D1은 서버에서 접근하고, 클라이언트 컬렉션에는 Query와 API를 통해 데이터를 연결하세요. TanStack DB를 SSR에 사용할 때는 사용자 데이터가 섞이지 않도록 요청별 인스턴스를 생성해야 합니다.

`@tanstack/ai-cloudflare`는 현재 Workers 타입과 함께 설치할 수 있는 1.1.0으로 고정했습니다.

## AI 제공자 설정

`src/lib/ai.server.ts`에서 OpenAI와 Gemini 채팅, ElevenLabs 음성 생성·전사, Cloudflare Workers AI 채팅용 어댑터를 만들 수 있습니다. 이 파일은 서버에서만 가져오세요. 채팅과 전화 기능은 필요한 외부 API를 서버에서 호출합니다.

로컬에서 필요한 제공자만 `.dev.vars`에 설정하세요. Google AI Studio의 `GEMINI_API_KEY`는 Google 로그인에 사용하는 OAuth 클라이언트 정보와 별개입니다.

```dotenv
OPENAI_API_KEY=
GEMINI_API_KEY=
ELEVENLABS_API_KEY=
```

운영 환경에서는 같은 이름의 Cloudflare Worker secrets를 사용합니다. Workers AI는 `wrangler.jsonc`의 `AI` 바인딩을 사용하며 별도 API 키가 필요하지 않습니다. 제공자 호출에는 각 서비스의 사용량 제한과 요금이 적용될 수 있습니다. 실제 서비스를 호출하는 기능을 추가할 때는 인증, 요청 제한과 모델 선택 정책을 함께 적용하세요.

- `/`: 서비스 소개
- `/login`: 이메일과 비밀번호 또는 설정된 Google 계정으로 가입 또는 로그인
- `/account`: 로그인한 사용자의 계정 화면
- `/admin`: 관리자 이메일로 가입한 계정의 관리자 화면. 통화 및 관리자 기능은 준비 중입니다.
- `/chat`: 여행자용 Tokie 채팅. `/api/chat`이 TanStack AI로 OpenAI 응답을 스트리밍합니다.

## 여행자 채팅과 전화 걸기

`/api/chat`은 `OPENAI_API_KEY`로 TanStack AI 채팅을 실행합니다. 채팅에서는 업체 번호와 용건을 확인한 뒤 발신을 승인할 수 있습니다. 공용 번호로 전화가 오면 등록된 발신번호 또는 고객번호로 고객을 선택해 전사를 저장합니다. 같은 고객과 발신번호의 기존 대화가 있으면 재사용하고, 발신번호가 없으면 새 대화를 만듭니다. 가입 시 고객번호를 배정하지만 개인 전화번호는 자동 발급하지 않습니다.

발신에는 아래 값과 공개 HTTPS 웹훅이 필요합니다. 발신 번호와 수신 라우팅을 확인할 번호는 같은 계정 번호로 설정하세요. `CLAWOPS_SIGNING_KEY`는 선택 사항입니다.

```dotenv
OPENAI_API_KEY=
CLAWOPS_API_KEY=
CLAWOPS_ACCOUNT_ID=
CLAWOPS_FROM_NUMBER=
CLAWOPS_PHONE_NUMBER=
CLAWOPS_SIGNING_KEY=
CLAWOPS_WEBHOOK_URL=
CUSTOMER_0001_EMAIL=
```

ClawOps는 전화와 오디오를 전달합니다. Worker가 통화별 용건을 GPT-Live에 전달하고 전사를 D1에 저장해 채팅에 표시합니다. 통화 참조는 서명된 접근 토큰이므로 공유하지 마세요. D1의 통화 용건과 전사에는 자동 만료가 아직 없습니다. 공급자 응답이 불확실하면 같은 요청을 자동으로 다시 발신하지 않습니다.

채팅과 발신은 로그인 없이 이용할 수 있고 발신 제한은 없습니다.

완료된 통화는 예약 정보와 전사를 담은 결과 페이지를 생성할 수 있습니다. 예약 상태는 AI 추정이며, 결과 페이지와 녹음은 주소를 아는 사람에게 노출될 수 있습니다. 전사가 불완전한 통화는 결과 페이지를 만들지 않습니다.

이메일 소유권 확인과 비밀번호 재설정은 아직 제공하지 않습니다. `ADMIN_EMAILS`에 지정된 이메일로 먼저 가입한 사람은 이메일 소유 확인 없이 관리자 권한을 얻습니다. Google 로그인을 사용하려면 Google Cloud 프로젝트의 웹 OAuth 클라이언트 ID와 비밀값을 `.dev.vars`의 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`에 설정하고 승인된 리디렉션 URI에 `http://127.0.0.1:3000/api/auth/callback/google`을 추가합니다. 두 값이 모두 설정되면 Google 로그인 버튼이 표시됩니다. 기존 계정과 Google 계정의 연결은 비활성화되어 있습니다.

## ClawOps 전화와 GPT-Live

ClawOps VoiceML과 양방향 WebSocket으로 전화 오디오를 전달하고, Worker가 OpenAI GPT-Live에 직접 연결합니다. GPT-Live가 위임한 질문은 TanStack AI로 처리합니다. RealtimeKit 세션 API와 SFU 오디오 모듈은 별도로 제공하며 서로 연결되어 있지 않습니다.

1. 로컬 D1에 `npx wrangler d1 migrations apply talkie-db --local`을 실행합니다. 운영 환경에는 대상 계정과 D1을 확인한 뒤 별도로 원격 마이그레이션을 적용해야 합니다. Workers Builds는 D1 마이그레이션을 자동으로 적용하지 않습니다.
2. 위 설정을 `.dev.vars` 또는 운영 Worker secrets에 추가합니다. `CLAWOPS_WEBHOOK_URL`은 공개 HTTPS 주소와 `/api/clawops/voice` 경로를 정확히 포함해야 합니다.
3. `CUSTOMER_0001_EMAIL`을 설정하면 해당 계정에 고객번호 0001이 예약됩니다. `CLAWOPS_PHONE_NUMBER`는 공용 번호이며, 등록된 발신번호가 없으면 발신자가 고객번호를 입력합니다. 번호 라우팅을 변경하기 전에 현재 용도를 확인하세요.
4. 설정을 완료한 뒤 실제 전화로 음성 송수신, 전사, 재생 지연과 끼어들기를 확인합니다. 전화와 AI 사용량에는 각 공급자의 요금이 적용됩니다.

[ClawOps 양방향 스트림](https://platform.claw-ops.com/docs/build/stream)을 사용합니다. 발신은 통화별 임의 식별자로 매칭하고, 서명 키가 있으면 발신 [웹훅 서명](https://platform.claw-ops.com/docs/webhooks/signature-verification)을 검증합니다. 수신 웹훅은 서명을 검증하지 않아 요청을 위조할 수 있습니다. 스트림에는 5분 유효 일회용 토큰을 사용합니다. 재전송 방지용 통화 ID 해시는 D1에 보관됩니다. [OpenAI GPT-Live](https://developers.openai.com/api/docs/guides/voice-websockets)의 client delegation을 사용하며, TanStack AI의 Realtime 어댑터를 GPT-Live 어댑터로 취급하지 않습니다.

## 검사

```sh
npm run typecheck
npm run build
npm run deploy:check
npm run test:ai
npm run test:live
npm run test:worker
# 로컬 서버를 실행한 상태에서 별도 터미널에서 실행합니다.
npm run test:auth
```

AI와 통화 연동 검사는 로컬 Worker와 합성 응답을 사용합니다. 외부 제공자에 요청하지 않습니다. CI에서는 Cloudflare 원격 바인딩을 끄고 D1 인증 검사를 실행합니다. 로컬 개발에서 Workers AI를 실제로 호출하려면 Cloudflare 인증과 원격 바인딩이 필요합니다.

Google 로그인 시작 검사는 로컬 서버에 합성 값 `GOOGLE_CLIENT_ID=synthetic-client-id`, `GOOGLE_CLIENT_SECRET=synthetic-client-secret`을 설정한 뒤 `npm run test:google`로 실행합니다. Google에 접속하거나 실제 계정을 사용하지 않습니다. CI에서도 이 합성 설정을 사용합니다.

인증 검사는 로컬 서버에서만 실행되며 로컬 D1에 테스트 계정을 생성합니다. 실행 전 임의의 `admin-<16진수>@example.test` 주소를 `TALKIE_TEST_ADMIN_EMAIL`과 로컬 `.dev.vars`의 `ADMIN_EMAILS` 양쪽에 설정하고, `ADMIN_EMAILS`에는 합성 이메일 세 개를 더 추가하세요. 회원가입, 세션, 로그아웃, 관리자 경로 보호 및 요청 제한을 확인합니다. `src/routeTree.gen.ts`는 개발 서버 또는 빌드 시 자동 생성됩니다.

## Cloudflare 배포

GitHub Actions는 `main`에 대한 PR과 `main` 또는 `allen-wip` push에서 타입 검사, 빌드, 배포 dry-run과 로컬 D1 인증 검사를 실행합니다. Cloudflare Workers Builds는 `main`을 빌드하고 배포합니다. 두 검사는 독립적으로 실행되므로 GitHub Actions 통과가 배포의 선행 조건은 아닙니다.

`wrangler.jsonc`의 `DB` 바인딩은 프로덕션 D1을 가리킵니다. 배포 전 대상 Cloudflare 계정과 데이터베이스를 확인하고 다음을 설정하세요.

1. `npx wrangler d1 migrations apply talkie-db --remote`로 D1 마이그레이션을 적용합니다. 적용 전 백업과 기존 데이터 영향을 검토하세요.
2. 32자 이상의 고유한 무작위 `BETTER_AUTH_SECRET`을 `npx wrangler secret put BETTER_AUTH_SECRET`으로 설정합니다. 로컬 비밀값과 다른 값을 사용하세요. 이 명령은 현재 운영 Worker의 새 버전을 즉시 배포할 수 있으므로 대상과 적용 시점을 확인하세요.
3. `BETTER_AUTH_URL`은 `wrangler.jsonc`의 서비스 URL입니다. 도메인이 바뀌면 실제 URL로 변경합니다.
4. `ADMIN_EMAILS` Worker secret에 관리자 이메일 네 개를 쉼표로 구분해 설정합니다. 서로 다른 유효한 이메일이 정확히 네 개가 아니면 관리자 접근은 거부됩니다. 관리자 이메일을 Git에 커밋하지 마세요.
5. `main` 배포 후 로그인, 세션과 로그아웃을 확인합니다. 지정된 이메일로 가입한 계정은 이메일 확인 없이 관리자에 접근합니다.

Google 로그인을 활성화하려면 운영 Worker에 `GOOGLE_CLIENT_ID`와 `GOOGLE_CLIENT_SECRET`을 설정하고 Google OAuth 클라이언트의 승인된 리디렉션 URI에 `https://talkie.devdo.workers.dev/api/auth/callback/google`을 추가하세요. 비밀값을 저장소에 커밋하지 마세요. 비밀번호 계정과 Google 계정의 연결은 지원하지 않으므로 같은 이메일로 이미 가입한 경우 Google 로그인이 거부됩니다.

인증 요청 제한은 Cloudflare가 제공하는 `cf-connecting-ip`를 사용하고 D1에 카운터를 저장합니다. 앱은 Cloudflare를 통해 제공되어야 하며, 로컬 테스트에서 보낸 헤더는 프로덕션 클라이언트 식별을 검증하지 않습니다.
