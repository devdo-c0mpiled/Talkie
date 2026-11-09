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

## 토스 테스트 결제

`/checkout`에서 로그인 후 1,000원 테스트 결제를 실행합니다. 실제 금액은 청구되지 않습니다. 주문 금액은 서버에서 정하며 결제 승인 시 주문 소유자·금액·주문번호·paymentKey·`DONE` 상태를 확인합니다.

1. `.dev.vars.example`을 참고해 `.dev.vars`에 `TOSS_CLIENT_KEY`와 `TOSS_SECRET_KEY`를 설정합니다. 토스 개발자센터의 **API 개별 연동 테스트 키**(`test_ck_`, `test_sk_`)를 사용합니다. 라이브 키와 결제위젯 키는 허용하지 않습니다.
2. `npx wrangler d1 migrations apply talkie-db --local`로 로컬 DB를 준비합니다.
3. 기존 로그인 환경변수를 설정한 뒤 `npm run dev`로 실행하고 회원가입 또는 로그인합니다.
4. `/checkout`의 `테스트 결제하기`를 눌러 토스 결제창을 엽니다. 인증 후 같은 경로에서 서버 승인을 확인합니다.

취소·인증 실패 시 완료 처리하지 않습니다. 승인 응답을 받지 못하면 주문은 `CONFIRMING`에 남으며 `승인 다시 확인`으로 토스 조회 결과를 대조합니다. 새 주문의 유효기간은 30분입니다. 테스트 주문은 실제 예약이나 상품 구매로 연결되지 않습니다.

`npm run test:payments`는 SQLite와 모의 토스 응답으로 금액 변조, 소유권, 중복 승인, 만료, 응답 불일치와 통신 오류 복구를 검사합니다. 실제 토스 결제창 검증에는 유효한 테스트 키가 필요합니다. 배포 환경에서는 DB 마이그레이션과 두 키의 Workers secret 등록을 별도로 완료해야 합니다.
