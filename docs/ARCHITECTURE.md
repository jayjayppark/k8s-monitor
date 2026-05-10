# 아키텍처

## 현재 목표

MVP는 하나의 Kubernetes 클러스터를 읽기 전용으로 보여주는 백엔드/프론트엔드 애플리케이션입니다. 1차 실행 환경은 EC2 한 대입니다.

```text
EC2
├── K3s single-node Kubernetes
├── backend: Fastify API server
└── frontend: React + Vite dev server
```

백엔드는 kubeconfig로 같은 EC2의 Kubernetes API에 연결합니다. 프론트엔드는 Kubernetes API에 직접 접근하지 않고 백엔드 API만 호출합니다.

## 런타임 구성

```text
Browser
  |
  | HTTP
  v
Frontend
  |
  | REST API
  v
Backend
  |
  | Kubernetes API / metrics.k8s.io
  v
Kubernetes cluster
```

## 저장소 구조

```text
.
├── backend/             # Fastify 백엔드
├── frontend/            # React + Vite 프론트엔드
├── packages/shared/     # 공유 DTO 타입
├── docs/                # 제품 기준, 아키텍처, API 계약
├── scripts/             # 보조 스크립트
└── tools/slack-bot/     # Slack 기반 Codex 실행 도구
```

## 기술 선택

- TypeScript를 백엔드, 프론트엔드, 공유 패키지에 사용합니다.
- pnpm workspaces로 모노레포를 관리합니다.
- 백엔드는 Fastify를 사용합니다.
- 프론트엔드는 React + Vite를 사용합니다.
- Kubernetes API client는 `@kubernetes/client-node`를 사용합니다.
- 백엔드/프론트엔드/공유 패키지 테스트는 Vitest를 사용합니다.

## 백엔드 책임

- kubeconfig 기반 Kubernetes 연결 설정을 로드합니다.
- Kubernetes API connectivity와 server version을 확인합니다.
- metrics-server availability를 확인합니다.
- Nodes, Namespaces, Pods, Services, Deployments, ReplicaSets, StatefulSets, DaemonSets, Events를 읽습니다.
- Kubernetes resource를 프론트엔드에 안전한 DTO로 정규화합니다.
- raw Kubernetes object, kubeconfig, token, Secret 값을 API 응답에 포함하지 않습니다.
- 공통 envelope, source status, error response 형식을 모든 endpoint에 적용합니다.

## 프론트엔드 책임

- cluster summary, nodes, namespaces, workloads, pod detail, events 화면을 제공합니다.
- 백엔드 API client를 통해서만 데이터를 가져옵니다.
- loading, empty, degraded, error state를 일관되게 표시합니다.
- metrics-server가 없는 경우 usage unavailable 상태를 명확히 보여줍니다.
- credential 또는 Kubernetes secret을 저장하거나 표시하지 않습니다.

## 공유 패키지 책임

- `docs/API_CONTRACT.md`와 일치하는 DTO 타입을 제공합니다.
- 백엔드와 프론트엔드 사이의 계약 drift를 줄이는 작은 helper만 둡니다.
- Kubernetes client type이나 runtime secret을 브라우저용 타입에 섞지 않습니다.

## Kubernetes 접근 방식

MVP의 Kubernetes 동작은 읽기 전용입니다.

필요한 verb:

- `get`
- `list`
- `watch`

대상 resource:

- core: nodes, namespaces, pods, services, events.
- apps: deployments, replicasets, statefulsets, daemonsets.
- metrics.k8s.io: nodes, pods.

metrics-server 권한과 availability는 optional입니다. metrics를 사용할 수 없으면 API는 degraded source metadata와 `null` usage를 반환합니다.

## 데이터 freshness

초기 구현은 단순 polling을 기준으로 합니다.

- 백엔드는 요청 시 Kubernetes API를 조회하거나 짧은 in-memory cache를 사용할 수 있습니다.
- 프론트엔드는 일정 interval로 summary/list endpoint를 다시 호출할 수 있습니다.
- watch, Server-Sent Events, WebSocket은 MVP 이후 필요가 명확할 때 도입합니다.

## EC2 검증 방식

1. EC2에 K3s 단일 노드 Kubernetes를 설치합니다.
2. `kubectl get nodes`가 동작하는 kubeconfig를 준비합니다.
3. 백엔드를 같은 EC2에서 실행하고 kubeconfig로 Kubernetes API에 연결합니다.
4. 프론트엔드를 같은 EC2에서 실행합니다.
5. 브라우저에서 프론트엔드를 열고 실제 cluster summary와 resource 목록을 확인합니다.
6. metrics-server가 정상인 경우 usage 값을 확인합니다.
7. metrics-server가 없거나 실패하는 경우 degraded UI를 확인합니다.

## 패키징 방향

개발 중에는 백엔드와 프론트엔드를 별도 dev server로 실행합니다.

첫 배포 가능한 MVP에서는 Fastify 백엔드가 빌드된 프론트엔드 정적 파일을 제공할 수 있게 합니다. 이렇게 하면 단일 백엔드 프로세스로 API와 UI를 함께 제공할 수 있습니다.

## 보안 경계

- Kubernetes credential은 백엔드 프로세스만 사용합니다.
- 프론트엔드는 정규화된 monitoring data만 받습니다.
- API와 로그는 kubeconfig content, bearer token, Slack webhook URL, Kubernetes Secret 값을 출력하지 않습니다.
- AWS 설정 변경은 이 프로젝트의 애플리케이션 구현 범위가 아닙니다.
