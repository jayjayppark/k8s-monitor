# 구현 작업

## Phase 0: 설계 기준선

1. 저장소 구조와 초기 제약을 확인합니다.
2. 프로젝트 규칙과 범위 경계를 담은 `AGENTS.md`를 작성합니다.
3. `docs/REQUIREMENTS.md`에 MVP 요구사항을 작성합니다.
4. `docs/ARCHITECTURE.md`에 초기 아키텍처를 작성합니다.
5. `docs/API_CONTRACT.md`에 백엔드/프론트엔드 API 계약을 작성합니다.
6. `docs/DECISIONS.md`에 초기 결정, 가정, 미해결 질문을 기록합니다.
7. `scripts/slack-notify.sh`로 Slack 완료 요약을 보냅니다.

## Phase 1: 스택 선택

1. [x] 백엔드 언어와 프레임워크를 선택합니다. Issue #1: TypeScript + Fastify.
2. [x] 프론트엔드 프레임워크와 빌드 도구를 선택합니다. Issue #1: React + Vite.
3. [x] 백엔드와 프론트엔드 테스트 프레임워크를 선택합니다. Issue #1: Vitest.
4. [x] 백엔드가 프론트엔드 정적 asset을 제공할지 결정합니다. Issue #1: 패키징된 MVP에서는 Fastify가 빌드된 프론트엔드를 제공합니다.
5. [x] 로컬 개발 명령을 정의합니다. Issue #1: pnpm 워크스페이스 명령 초안을 문서화했습니다.
6. [x] 스택 결정이 승인된 뒤에만 package/workspace manifest를 만듭니다. Issue #2: pnpm 워크스페이스 스캐폴드가 만들어졌습니다.

## Phase 2: 백엔드 기반

1. 백엔드 애플리케이션 skeleton을 만듭니다.
2. kubeconfig와 in-cluster mode를 위한 설정 로딩을 추가합니다.
3. secret을 출력하지 않는 구조화 로깅을 추가합니다.
4. `/api/health`를 추가합니다.
5. Kubernetes 클라이언트 초기화를 추가합니다.
6. Kubernetes 연결 확인을 추가합니다.
7. 공통 API envelope과 error response 타입을 추가합니다.
8. config와 response helper에 대한 unit test를 추가합니다.

## Phase 3: Kubernetes 인벤토리

1. namespace listing을 구현합니다.
2. node listing과 readiness mapping을 구현합니다.
3. pod listing과 phase/readiness/restart mapping을 구현합니다.
4. Deployment workload listing을 구현합니다.
5. ReplicaSet workload listing을 구현합니다.
6. StatefulSet workload listing을 구현합니다.
7. DaemonSet workload listing을 구현합니다.
8. service listing을 구현합니다.
9. recent event listing을 구현합니다.
10. Kubernetes object normalization 테스트를 추가합니다.

## Phase 4: 메트릭 통합

1. metrics-server 사용 가능 여부를 감지합니다.
2. node metrics 조회를 구현합니다.
3. pod metrics 조회를 구현합니다.
4. CPU는 millicores로, memory는 bytes로 정규화합니다.
5. node와 pod DTO에 metrics를 병합합니다.
6. metrics를 사용할 수 없을 때 degraded source metadata를 반환합니다.
7. quantity parsing과 missing metrics behavior 테스트를 추가합니다.

## Phase 5: 백엔드 API 엔드포인트

1. `GET /api/cluster/summary`를 구현합니다.
2. `GET /api/nodes`를 구현합니다.
3. `GET /api/namespaces`를 구현합니다.
4. `GET /api/workloads`를 구현합니다.
5. `GET /api/pods/{namespace}/{name}`을 구현합니다.
6. `GET /api/events`를 구현합니다.
7. filter query validation을 추가합니다.
8. mocked Kubernetes client 또는 fixture를 사용하는 integration test를 추가합니다.

## Phase 6: 프론트엔드 기반

1. 프론트엔드 애플리케이션 skeleton을 만듭니다.
2. 백엔드 엔드포인트용 API client를 추가합니다.
3. dashboard navigation을 위한 layout shell을 추가합니다.
4. 공통 loading, empty, degraded, error state를 추가합니다.
5. 공통 table 및 filter component를 추가합니다.
6. API client와 state rendering에 대한 프론트엔드 테스트를 추가합니다.

## Phase 7: 프론트엔드 화면

1. cluster summary dashboard를 만듭니다.
2. readiness와 usage column을 포함한 nodes table을 만듭니다.
3. namespaces table을 만듭니다.
4. namespace, kind, status, search filter가 있는 workloads table을 만듭니다.
5. pod detail view를 만듭니다.
6. events view 또는 recent events panel을 만듭니다.
7. desktop과 mobile에서 responsive layout check를 추가합니다.

## Phase 8: 로컬 실행 및 패키징

1. 로컬 개발 설정을 문서화합니다.
2. 필요한 Kubernetes RBAC 권한을 문서화합니다.
3. 필요하면 container build file을 추가합니다.
4. 배포 대상에 필요하면 예시 read-only RBAC manifest를 추가합니다.
5. 실제 또는 로컬 클러스터 대상 smoke test 지침을 추가합니다.
6. setup, run, troubleshooting 내용을 README에 업데이트합니다.

## Phase 9: MVP 검증

1. metrics-server가 설치된 클러스터에서 테스트합니다.
2. metrics-server가 없는 클러스터에서 테스트합니다.
3. Kubernetes API를 사용할 수 없을 때의 동작을 테스트합니다.
4. 프론트엔드가 secret을 받지 않는지 검증합니다.
5. mutation permission이 필요하지 않은지 검증합니다.
6. 미해결 질문을 검토하고 해결된 항목을 decision으로 승격합니다.
