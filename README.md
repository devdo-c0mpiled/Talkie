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
- `/login`: 이메일과 비밀번호 또는 설정된 Google 계정으로 가입 또는 로그인
- `/admin`: 관리자 화면. 안전한 관리자 인증을 완성할 때까지 접근이 차단되며 통화 및 관리자 기능은 준비 중입니다.

이메일 소유권 확인과 비밀번호 재설정은 아직 제공하지 않습니다. Google 로그인을 사용하려면 Google Cloud 프로젝트의 웹 OAuth 클라이언트 ID와 비밀값을 `.dev.vars`의 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`에 설정하고 승인된 리디렉션 URI에 `http://127.0.0.1:3000/api/auth/callback/google`을 추가합니다. 두 값이 모두 설정되면 Google 로그인 버튼이 표시됩니다. 기존 계정과 Google 계정의 연결은 비활성화되어 있습니다. 이메일·비밀번호 가입만으로 관리자 권한을 얻을 수 없습니다. 실제 관리 기능을 추가하기 전에 신뢰할 수 있는 이메일 확인과 로그인 세션의 인증 방식을 검증해야 합니다.

## 검사

```sh
npm run typecheck
npm run build
npm run deploy:check
# 로컬 서버를 실행한 상태에서 별도 터미널에서 실행합니다.
npm run test:auth
```

Google 로그인 시작 검사는 로컬 서버에 합성 값 `GOOGLE_CLIENT_ID=synthetic-client-id`, `GOOGLE_CLIENT_SECRET=synthetic-client-secret`을 설정한 뒤 `npm run test:google`로 실행합니다. Google에 접속하거나 실제 계정을 사용하지 않습니다. CI에서도 이 합성 설정을 사용합니다.

인증 검사는 로컬 서버에서만 실행되며 로컬 D1에 테스트 계정을 생성하고 합성 계정의 이메일 검증 상태를 변경합니다. 실행 전 임의의 `admin-<16진수>@example.test` 주소를 `TALKIE_TEST_ADMIN_EMAIL`과 로컬 `.dev.vars`의 `ADMIN_EMAILS` 양쪽에 설정하세요. 회원가입, 세션, 로그아웃, 관리자 경로 보호 및 요청 제한을 확인합니다. `src/routeTree.gen.ts`는 개발 서버 또는 빌드 시 자동 생성됩니다.

## Cloudflare 배포

GitHub Actions는 `main`에 대한 PR과 `main` 또는 `allen-wip` push에서 타입 검사, 빌드, 배포 dry-run과 로컬 D1 인증 검사를 실행합니다. Cloudflare Workers Builds는 `main`을 빌드하고 배포합니다. 두 검사는 독립적으로 실행되므로 GitHub Actions 통과가 배포의 선행 조건은 아닙니다.

`wrangler.jsonc`의 `DB` 바인딩은 프로덕션 D1을 가리킵니다. 배포 전 대상 Cloudflare 계정과 데이터베이스를 확인하고 다음을 설정하세요.

1. `npx wrangler d1 migrations apply talkie-db --remote`로 D1 마이그레이션을 적용합니다. 적용 전 백업과 기존 데이터 영향을 검토하세요.
2. 32자 이상의 고유한 무작위 `BETTER_AUTH_SECRET`을 `npx wrangler secret put BETTER_AUTH_SECRET`으로 설정합니다. 로컬 비밀값과 다른 값을 사용하세요. 이 명령은 현재 운영 Worker의 새 버전을 즉시 배포할 수 있으므로 대상과 적용 시점을 확인하세요.
3. `BETTER_AUTH_URL`은 `wrangler.jsonc`의 서비스 URL입니다. 도메인이 바뀌면 실제 URL로 변경합니다.
4. `ADMIN_EMAILS`를 Worker 환경에 쉼표로 구분한 관리자 이메일 목록으로 설정합니다. 대소문자와 앞뒤 공백은 무시합니다. 미설정 시 모든 사용자의 관리자 접근이 거부됩니다. 이메일은 Git에 커밋하지 마세요.
5. `main` 배포 후 로그인, 세션과 로그아웃을 확인합니다. 관리자는 신뢰할 수 있는 이메일 확인과 세션별 인증 방식 검증을 완성할 때까지 접근할 수 없습니다.

Google 로그인을 활성화하려면 운영 Worker에 `GOOGLE_CLIENT_ID`와 `GOOGLE_CLIENT_SECRET`을 설정하고 Google OAuth 클라이언트의 승인된 리디렉션 URI에 `https://talkie.devdo.workers.dev/api/auth/callback/google`을 추가하세요. 비밀값을 저장소에 커밋하지 마세요. 비밀번호 계정과 Google 계정의 연결은 지원하지 않으므로 같은 이메일로 이미 가입한 경우 Google 로그인이 거부됩니다.

인증 요청 제한은 Cloudflare가 제공하는 `cf-connecting-ip`를 사용하고 D1에 카운터를 저장합니다. 앱은 Cloudflare를 통해 제공되어야 하며, 로컬 테스트에서 보낸 헤더는 프로덕션 클라이언트 식별을 검증하지 않습니다.
