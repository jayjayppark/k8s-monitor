# 아키텍처

## 개요

MVP는 pnpm workspaces로 관리되는 TypeScript 모노레포입니다. 두 개의 애플리케이션과 하나의 공유 패키지를 포함합니다:

- `backend`: 하나의 Kubernetes 클러스터에 연결하고 클러스터 상태를 정규화하는 Fastify API 서버.
- `frontend`: 백엔드 API에서 받은 클러스터 상태와 리소스 화면을 렌더링하는 React + Vite 브라우저 애플리케이션.
- `packages/shared`: 두 애플리케이션에서 함께 사용하는 TypeScript API DTO 타입과 helper.

백엔드만 Kubernetes와 통신합니다. 프론트엔드는 Kubernetes API와 직접 통신하지 않습니다.

```text
Browser
  |
  | HTTP
  v
Frontend app
  |
  | REST API
  v
Backend API
  |
  | Kubernetes API / metrics.k8s.io
  v
Kubernetes cluster
```

## 저장소 형태

구현 스캐폴드는 아래 layout을 사용합니다:

```text
.
├── backend/
├── frontend/
├── packages/
│   └── shared/
├── docs/
├── scripts/
├── pnpm-workspace.yaml
├── package.json
├── AGENTS.md
└── TASKS.md
```

현재 스캐폴드는 workspace manifest와 package placeholder만 포함합니다. 런타임 백엔드, 프론트엔드, 공유 소스 파일은 이후 구현 이슈에서 도입합니다.

## 기술 스택

- 런타임 언어: 백엔드, 프론트엔드, 공유 패키지 전반에 TypeScript를 사용합니다.
- 워크스페이스 관리자: pnpm workspaces.
- 백엔드 프레임워크: Fastify.
- 프론트엔드 프레임워크 및 빌드 도구: React with Vite.
- 공유 계약 패키지: `packages/shared`.
- Kubernetes 클라이언트: `@kubernetes/client-node`.
- 테스트 러너: Vitest.
- 린트 및 포맷: ESLint and Prettier.

## 백엔드 책임

- Kubernetes 연결 설정을 로드합니다.
- cluster connectivity를 확인합니다.
- MVP에 필요한 Kubernetes resource를 list/watch합니다.
- 사용 가능한 경우 `metrics.k8s.io`를 통해 metrics-server를 조회합니다.
- local kubeconfig와 in-cluster service account access에 `@kubernetes/client-node`를 사용합니다.
- Kubernetes resource를 프론트엔드에 안전한 DTO로 정규화합니다.
- 반복적인 Kubernetes API 부하를 줄이기 위해 최근 resource snapshot을 메모리에 캐시합니다.
- metrics API unavailable 같은 partial failure를 명시적으로 드러냅니다.
- read-only REST endpoint를 노출합니다.

## 프론트엔드 책임

- dashboard summary, inventory table, detail view를 렌더링합니다.
- 백엔드 API만 호출합니다.
- 백엔드 응답에는 `packages/shared`의 공유 DTO 타입을 사용합니다.
- namespace/status/name filter를 제공합니다.
- 백엔드 응답에 warning 또는 source error가 포함된 경우 degraded state를 표시합니다.
- credential 또는 Kubernetes secret을 저장하지 않습니다.

## 공유 패키지 책임

- `docs/API_CONTRACT.md`와 일치하는 TypeScript DTO를 정의합니다.
- backend/frontend contract drift를 막는 데 도움이 되는 작은 shared helper만 제공합니다.
- 브라우저에 노출되는 DTO에 Kubernetes client type을 import하지 않습니다.
- runtime secret, kubeconfig value, environment-specific configuration을 보관하지 않습니다.

## Kubernetes 접근 모델

백엔드는 아래 항목에 read-only access가 필요합니다:

- Nodes.
- Namespaces.
- Pods.
- Services.
- Deployments, ReplicaSets, StatefulSets, DaemonSets.
- Events.
- 사용 가능한 경우 `metrics.k8s.io`의 pod 및 node metrics.

MVP는 아래 방식 중 하나로 동작해야 합니다:

- 개발용 local kubeconfig.
- 배포용 in-cluster service account.

필요한 verb는 monitored resource에 대한 `get`, `list`, `watch`로 제한되어야 합니다.

## 데이터 흐름

1. 백엔드가 시작되고 Kubernetes configuration을 로드합니다.
2. 백엔드는 API connectivity를 검증하고 metrics-server 사용 가능 여부를 발견합니다.
3. 백엔드는 resource inventory의 최근 in-memory snapshot을 유지합니다.
4. 프론트엔드는 summary 및 list endpoint를 요청합니다.
5. 백엔드는 사용 가능한 경우 resource state와 metrics를 병합합니다.
6. 백엔드는 freshness와 degraded data source에 대한 metadata가 포함된 DTO를 반환합니다.
7. 프론트엔드는 현재 상태를 렌더링하고 data가 stale 또는 partial이면 경고합니다.

## 메트릭 전략

MVP의 CPU와 memory usage는 metrics-server에서 가져옵니다:

- Node metrics: `NodeMetrics`.
- Pod metrics: `PodMetrics`.

Metrics는 optional입니다. `metrics.k8s.io`를 사용할 수 없으면 백엔드는 usage 값을 `null`로 반환하고 source warning을 포함합니다. 이렇게 하면 Prometheus 없이도 dashboard가 유용하게 동작합니다.

## 실시간 전략

초기 구현은 단순하고 신뢰할 수 있는 data refresh를 우선합니다:

- 가능한 경우 백엔드는 Kubernetes resource를 watch합니다.
- 프론트엔드는 짧은 interval로 summary 및 list endpoint를 polling할 수 있습니다.
- polling이 나쁜 UX를 만들면 이후 Server-Sent Events 또는 WebSocket을 고려할 수 있습니다.

## 로컬 개발 전략

로컬 개발은 백엔드와 프론트엔드 개발 서버를 분리해서 사용합니다:

- `pnpm dev:backend`: Fastify 백엔드를 development mode로 시작합니다.
- `pnpm dev:frontend`: Vite frontend development server를 시작합니다.
- `pnpm dev`: 두 development server를 함께 시작합니다.

첫 번째 packaged MVP는 Fastify 백엔드가 빌드된 프론트엔드 정적 asset을 제공할 수 있어야 합니다. 이렇게 하면 배포 시 하나의 백엔드 프로세스가 browser app과 API를 함께 host할 수 있습니다.

## 보안 경계

- 백엔드가 Kubernetes credential을 소유합니다.
- 프론트엔드는 정규화된 모니터링 데이터만 받습니다.
- API endpoint는 secret을 반환하지 않습니다.
- 로그에는 kubeconfig content, bearer token, Slack webhook URL을 출력하지 않아야 합니다.

## 배포 가정

- MVP는 kubeconfig를 사용해 로컬에서 실행될 수 있습니다.
- 이후 배포는 read-only RBAC와 함께 target cluster 내부에서 백엔드를 실행할 수 있습니다.
- 프론트엔드는 별도로 제공되거나 이후 packaging 단계에서 백엔드가 제공할 수 있습니다.

## 알려진 아키텍처 한계

- 백엔드 인스턴스 하나는 하나의 클러스터만 모니터링합니다.
- historical metrics storage가 없습니다.
- MVP에는 high availability 요구사항이 없습니다.
- alerting pipeline이 없습니다.
- metrics resolution과 retention은 metrics-server에 의해 제한됩니다.
