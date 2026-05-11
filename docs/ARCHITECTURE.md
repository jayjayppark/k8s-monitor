# 아키텍처

## 현재 목표

MVP는 하나의 Kubernetes 클러스터를 읽기 전용으로 보여주는 백엔드/프론트엔드 애플리케이션입니다. 1차 실행 환경은 EC2 한 대입니다.

```text
EC2
├── K3s single-node Kubernetes
├── backend: Fastify API server
├── frontend: React + Vite dev server
└── browser access: http://<EC2_PUBLIC_IP>:5173
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
├── .github/workflows/   # CI 검증
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
- Pod log subresource를 읽어 선택한 Pod/container의 bounded recent log를 반환합니다.
- Kubernetes resource를 프론트엔드에 안전한 DTO로 정규화합니다.
- unhealthy node, failed/pending pod, high restart count, recent warning event 같은 기본 alert candidate를 계산합니다.
- Slack webhook이 설정된 경우 alert candidate를 Slack으로 보낼 수 있습니다.
- raw Kubernetes object, kubeconfig, token, Secret 값을 API 응답에 포함하지 않습니다. Pod 로그는 저장하지 않고 요청 응답으로만 반환합니다.
- 공통 envelope, source status, error response 형식을 모든 endpoint에 적용합니다.

## 프론트엔드 책임

- cluster summary, nodes, namespaces, workloads, pod detail, events 화면을 제공합니다.
- 백엔드 API client를 통해서만 데이터를 가져옵니다.
- loading, empty, degraded, error state를 일관되게 표시합니다.
- alert banner 또는 notification panel로 문제가 있는 리소스를 눈에 띄게 보여줍니다.
- metrics-server가 없는 경우 usage unavailable 상태를 명확히 보여줍니다.
- credential 또는 Kubernetes secret을 저장하거나 표시하지 않습니다.

현재 프론트엔드는 React + Vite 런타임으로 구현되어 있습니다. Overview 화면은 `/api/cluster/summary`, `/api/alerts`, `/api/events`를 호출해 node health, risk pod count, active alert, warning event 중심의 summary card, degraded source banner, active alert panel, recent events table을 표시합니다. Nodes, Namespaces, Workloads, Events 화면은 같은 app shell과 API client를 기반으로 list/filter/table UI를 제공합니다. Nodes와 Pod detail의 CPU/memory는 Kubernetes raw quantity만 노출하지 않고 allocatable 또는 request 대비 사용량과 사용률을 함께 표시합니다. Workloads 화면에서 Pod 항목을 선택하면 `/api/pods/{namespace}/{name}`으로 Pod detail을 조회해 선택한 행 바로 아래에 펼쳐 표시합니다.

개발 중 기본 API 호출은 same-origin `/api` 경로를 사용합니다. Vite dev server는 `/api` 요청을 `VITE_BACKEND_PROXY_TARGET` 또는 기본값 `http://127.0.0.1:3000`으로 proxy합니다. 브라우저가 직접 백엔드 origin을 호출해야 하는 환경에서는 `VITE_API_BASE_URL`로 API base URL을 지정할 수 있습니다.

## 공유 패키지 책임

- `docs/API_CONTRACT.md`와 일치하는 DTO 타입을 제공합니다.
- 백엔드와 프론트엔드 사이의 계약 drift를 줄이는 작은 helper만 둡니다.
- Kubernetes client type이나 runtime secret을 브라우저용 타입에 섞지 않습니다.

## Kubernetes 접근 방식

MVP의 Kubernetes 동작은 읽기 전용입니다.

백엔드는 `@kubernetes/client-node`의 `KubeConfig`로 Kubernetes client를 초기화합니다. 로컬/EC2 개발에서는 `KUBECONFIG`와 선택적 `KUBERNETES_CONTEXT`를 사용하고, 클러스터 내부에서 실행할 때는 `KUBERNETES_AUTH_MODE=in-cluster` 또는 `KUBERNETES_IN_CLUSTER=true`로 service account credentials를 사용합니다.

필요한 verb:

- `get`
- `list`
- `watch`

대상 resource:

- core: nodes, namespaces, pods, services, events.
- core subresource: pods/log.
- apps: deployments, replicasets, statefulsets, daemonsets.
- metrics.k8s.io: nodes, pods.

metrics-server 권한과 availability는 optional입니다. metrics를 사용할 수 없으면 API는 degraded source metadata와 `null` usage를 반환합니다.

## 데이터 freshness

초기 구현은 단순 polling을 기준으로 합니다.

- 백엔드는 요청 시 Kubernetes API를 조회하거나 짧은 in-memory cache를 사용할 수 있습니다.
- 프론트엔드는 일정 interval로 summary/list endpoint를 다시 호출할 수 있습니다.
- watch, Server-Sent Events, WebSocket은 MVP 이후 필요가 명확할 때 도입합니다.

## 알림 전략

MVP 알림은 단순한 상태 기반 alert candidate로 시작합니다.

- 브라우저: in-app banner 또는 notification panel을 기본으로 합니다.
- 브라우저 OS 알림: 사용자가 권한을 허용한 경우에만 선택적으로 사용합니다.
- Slack: 환경 변수로 제공된 webhook URL이 있을 때만 전송합니다.

초기 alert condition:

- NotReady node.
- Failed 또는 장시간 Pending pod.
- restart count가 threshold 이상인 pod.
- 최근 Warning event.
- Kubernetes API unavailable 또는 metrics-server degraded.

Slack 알림은 `SLACK_ALERT_WEBHOOK_URL`이 설정된 백엔드 프로세스에서만 활성화됩니다. 알림 본문에는 severity, title, resource reference, 짧은 message만 포함하고 kubeconfig, token, Secret 값, raw object 전체를 포함하지 않습니다. 같은 alert가 반복 전송되지 않도록 alert key와 `SLACK_ALERT_COOLDOWN_SECONDS` 기반 cooldown을 둡니다. Slack 전송 실패는 monitoring API 응답 실패로 전파하지 않습니다.

## EC2 검증 방식

1. EC2에 K3s 단일 노드 Kubernetes를 설치합니다.
2. `kubectl get nodes`가 동작하는 kubeconfig를 준비합니다.
3. 백엔드를 같은 EC2에서 `HOST=0.0.0.0`으로 실행하고 kubeconfig로 Kubernetes API에 연결합니다.
4. 프론트엔드를 같은 EC2에서 Vite `--host 0.0.0.0`으로 실행합니다.
5. 외부 브라우저에서 `http://<EC2_PUBLIC_IP>:5173`로 프론트엔드를 열고 실제 cluster summary와 resource 목록을 확인합니다.
6. metrics-server가 정상인 경우 usage 값을 확인합니다.
7. metrics-server가 없거나 실패하는 경우 degraded UI를 확인합니다.

개발 단계에서는 EC2 security group에서 frontend port `5173/tcp`와 backend port `3000/tcp`를 필요한 source IP에만 열어둡니다. 패키징 후에는 백엔드가 정적 프론트엔드를 함께 제공해 공개 포트를 하나로 줄이는 것을 목표로 합니다.

## 필요한 설치 항목

EC2 dev box에는 아래 항목이 필요합니다.

- Node.js 22 이상.
- pnpm.
- K3s single-node server.
- kubectl.
- GitHub CLI: GitHub Issue를 Slack bot 또는 로컬에서 조회할 때 사용합니다.
- Python virtualenv: `tools/slack-bot` 실행에 사용합니다.

- EC2 K3s 설치와 kubeconfig 준비 절차는 `docs/KUBERNETES_SETUP.md`를 기준으로 합니다.
- 구체적인 로컬/EC2 실행 명령, 읽기 전용 RBAC 예시, smoke test 절차는 `docs/DEVELOPMENT.md`를 기준으로 합니다.
- 장애 알림 검증용 선택 시나리오는 `docs/FAILURE_TESTING.md`를 기준으로 합니다.

자동 설치 스크립트가 필요해지면 `scripts/` 아래에 추가하되, AWS 설정 변경이나 secret 작성은 포함하지 않습니다.

## CI 검증

GitHub Actions는 pull request와 `main` branch push에서 실행됩니다.

- Node.js 22와 pnpm 10.10.0을 사용합니다.
- `pnpm install --frozen-lockfile`로 의존성을 설치합니다.
- `pnpm format:check`, `pnpm lint`, `pnpm build`, `pnpm test`를 실행합니다.
- CI는 Kubernetes cluster나 AWS credential을 요구하지 않습니다.

## 패키징 방향

개발 중에는 백엔드와 프론트엔드를 별도 dev server로 실행합니다.

첫 배포 가능한 MVP에서는 Fastify 백엔드가 빌드된 프론트엔드 정적 파일을 제공할 수 있게 합니다. 이렇게 하면 단일 백엔드 프로세스로 API와 UI를 함께 제공할 수 있습니다.

## 보안 경계

- Kubernetes credential은 백엔드 프로세스만 사용합니다.
- 프론트엔드는 정규화된 monitoring data만 받습니다.
- API와 로그는 kubeconfig content, bearer token, Slack webhook URL, Kubernetes Secret 값을 출력하지 않습니다.
- AWS 설정 변경은 이 프로젝트의 애플리케이션 구현 범위가 아닙니다.
