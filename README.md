# Talkie

한국 뷰티숍과 외국인 고객의 대화를 잇기 위한 전화 통역 서비스의 시작 화면입니다. 현재 랜딩 페이지와 준비 상태를 표시하는 관리자 경로만 제공하며, 로그인·전화 통역·통화 관리는 구현되지 않았습니다.

## 실행

Node.js 22.12 이상과 npm이 필요합니다.

```sh
npm install
npm run dev
```

- `/`: 서비스 소개
- `/admin`: 관리자 기능 준비 안내

## 검사

```sh
npm run build
npm run typecheck
npm run deploy:check
```

TanStack Start와 TanStack Router의 파일 기반 라우팅을 사용합니다. `src/routeTree.gen.ts`는 개발 서버 또는 빌드 시 자동 생성됩니다.

## CI와 Cloudflare Workers 배포

GitHub Actions는 `main`에 대한 PR과 `main` push에서 Node.js 24로 의존성 설치, 타입 검사, 빌드, Wrangler 배포 dry-run을 실행합니다. GitHub Actions에는 Cloudflare 비밀값이 필요하지 않습니다.

Cloudflare Workers Builds를 GitHub 저장소에 연결하면 `main` push마다 프로덕션을 빌드하고 배포합니다. 연결은 아직 별도로 설정해야 합니다.

1. Cloudflare 대시보드의 **Workers & Pages**에서 새 애플리케이션을 만들고 GitHub를 선택합니다. 기존 Worker를 연결한다면 해당 Worker의 **Settings > Builds > Connect**를 선택합니다.
2. GitHub 연결을 승인하고 `devdo-c0mpiled/Talkie`를 선택합니다. Worker 이름은 `wrangler.jsonc`의 `name`과 같은 `talkie`로 설정합니다.
3. 프로덕션 브랜치를 `main`, 루트 디렉터리를 저장소 루트(`/`), 빌드 명령을 `npm run typecheck && npm run build`, 배포 명령을 `npx wrangler deploy`로 설정합니다. Build Variables에 `NODE_VERSION=24`를 추가합니다. Workers Builds가 의존성을 자동 설치합니다.
4. **Settings > Build > Branch control**에서 Preview Builds를 비활성화합니다. 그러면 PR 브랜치는 자동 배포되지 않습니다. 설정 저장 후 새 Worker 생성 시 첫 배포가 실행되며, 기존 Worker 연결 시 다음 `main` push가 배포를 시작합니다.
5. Cloudflare의 빌드 및 배포 로그와 배포 URL을 확인합니다. GitHub Actions와 Cloudflare 빌드는 독립적으로 실행되므로 Actions 결과가 Cloudflare 배포의 선행 조건은 아닙니다. PR 검사를 병합 조건으로 적용하려면 GitHub 브랜치 보호 규칙에서 CI 검사를 필수로 설정하세요.

Workers Builds 연결 및 배포 권한은 Cloudflare 대시보드에서 설정합니다. GitHub Actions에는 Cloudflare API 토큰을 추가하지 않습니다. 실제 통화 연동 방식과 데이터 저장소는 아직 결정되지 않았습니다.
