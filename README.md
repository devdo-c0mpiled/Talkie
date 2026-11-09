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

## Cloudflare Workers

`wrangler.jsonc`에 Workers 서버 엔트리와 호환성 옵션을 설정했습니다. Cloudflare 계정과 배포 대상이 정해진 뒤 Wrangler 인증 및 계정 설정을 확인하고 `npm run build` 후 `npx wrangler deploy`로 배포할 수 있습니다. 실제 통화 연동 방식과 데이터 저장소는 아직 결정되지 않았습니다.
