---
name: talkie-diagrams
description: Talkie의 Archify 빌더로 인터랙티브 아키텍처 다이어그램을 만들거나 수정한다. nodes/edges JSON 또는 DataGround·insight-rag의 flow_graph를 변환하고 모션 미리보기와 독립 HTML을 공유할 때 사용한다.
---

# Talkie 다이어그램

저장소 루트에서 실행한다. Node.js 24를 사용하며 Python, 전역 Archify 설치, API 키는 필요하지 않다.

- 화면에서 편집하려면 `npm run diagram:builder`를 실행하고 출력된 localhost 주소를 연다. 포트 충돌 시 `DIAGRAM_PORT=4324 npm run diagram:builder`로 변경한다.
- 파일을 만들려면 `npm run diagram:build -- 입력.json output/diagrams/이름.html`을 실행한다. 출력 HTML과 같은 이름의 `.html.json`이 Archify 후보 원본이다.
- 입력 형식과 연결 제약은 [사용법](../../../docs/다이어그램-빌더.md), 시작 예시는 `tools/diagrams/examples/talkie-proposed.json`을 읽는다.

실제 구조를 그릴 때는 해당 소스 파일을 읽고 관계를 확인한다. 설계안이나 미구현 경로는 제목과 설명에 표시한다. 예시의 상태를 실제 실행 결과로 주장하지 않는다. 모션 재생은 노드 배열 순서의 시뮬레이션이다. 실행 이벤트 연동 요청에는 실제 이벤트를 상태로 매핑하는 별도 코드가 필요하다.

`nodes/edges`와 `flow_graph` 봉투만 입력한다. Archify 원본 JSON은 출력 형식이며 이 빌더에 다시 넣을 수 없다. 상태는 `pending`, `running`, `done`, `failed` 중 하나다. 노드 ID는 영문자로 시작하고 영문·숫자·밑줄·하이픈만 사용한다. 관계를 맞추려고 노드를 조용히 삭제하지 않는다. 40개를 넘으면 사용 목적에 맞춰 다이어그램을 나누고 범위를 명시한다.

생성 명령의 성공은 스키마 검증과 렌더링 성공을 뜻한다. 공유 전 브라우저에서 긴 한글 라벨, 연결선, 클릭 포커스, 모션, 모바일 가로 넘침을 확인한다. 자동 렌더링만으로 시각 검수나 실제 서비스 연동 완료를 주장하지 않는다.

변환기·서버를 수정하면 `npm run diagram:test`를 실행한다. `tools/diagrams/vendor/archify`는 해시 고정 원본이므로 직접 패치하지 않는다. 버전 교체 시 출처·라이선스·해시와 동작 검증을 함께 갱신한다. 사용자 요청 없이 전역 스킬 설치나 배포·머지를 하지 않는다.
