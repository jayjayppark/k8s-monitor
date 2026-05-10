# 개발과 검증 절차

## 목적

이 문서는 로컬 개발, EC2 단일 노드 Kubernetes 검증, 읽기 전용 RBAC 요구사항, smoke test 절차의 현재 기준입니다.

MVP는 백엔드만 Kubernetes API와 통신합니다. 프론트엔드는 백엔드 API만 호출하며 kubeconfig, bearer token, Kubernetes Secret 값을 받지 않습니다.

## 필수 도구

- Node.js 22 이상.
- pnpm 10.10.0 이상.
- kubectl.
- kubeconfig로 접근 가능한 Kubernetes cluster.
- EC2 검증 환경에서는 K3s single-node server.
- GitHub Issue 기반 작업을 로컬에서 조회하려면 GitHub CLI.
- Slack bot을 실행하려면 Python virtualenv.

의존성 설치:

```sh
pnpm install
```

검증 명령:

```sh
pnpm lint
pnpm build
pnpm test
pnpm format:check
```

## 로컬 실행

백엔드는 기본적으로 `127.0.0.1:3000`에서 실행됩니다.

```sh
KUBECONFIG=~/.kube/config pnpm dev:backend
```

특정 kubeconfig context를 선택해야 하면 `KUBERNETES_CONTEXT`를 지정합니다.

```sh
KUBECONFIG=~/.kube/config KUBERNETES_CONTEXT=dev-cluster pnpm dev:backend
```

health check:

```sh
curl http://127.0.0.1:3000/api/health
```

프론트엔드는 Vite dev server로 실행합니다.

```sh
pnpm dev:frontend
```

기본 API 호출은 same-origin `/api`이고, Vite dev server가 `http://127.0.0.1:3000`으로 proxy합니다. 백엔드 주소가 다르면 proxy target을 지정합니다.

```sh
VITE_BACKEND_PROXY_TARGET=http://127.0.0.1:3000 pnpm dev:frontend
```

브라우저가 백엔드 origin을 직접 호출해야 하는 환경에서는 `VITE_API_BASE_URL`을 사용합니다.

```sh
VITE_API_BASE_URL=http://127.0.0.1:3000 pnpm dev:frontend
```

## EC2 개발 실행

EC2 검증은 한 대의 EC2에서 K3s, 백엔드, 프론트엔드를 함께 실행하는 기준입니다.

Kubernetes 접근 확인:

```sh
kubectl get nodes
kubectl get namespaces
kubectl get --raw /version
```

metrics-server 확인:

```sh
kubectl top nodes
kubectl get --raw /apis/metrics.k8s.io/v1beta1/nodes
```

metrics-server가 없거나 실패해도 백엔드 API는 inventory 응답을 계속 반환하고, usage 값은 `null`이며 source status는 degraded 또는 unavailable이어야 합니다.

EC2에서 백엔드 실행:

```sh
HOST=0.0.0.0 PORT=3000 KUBECONFIG=~/.kube/config pnpm dev:backend
```

EC2에서 프론트엔드 실행:

```sh
VITE_BACKEND_PROXY_TARGET=http://127.0.0.1:3000 pnpm dev:frontend -- --host 0.0.0.0
```

브라우저 접속:

```text
http://<EC2_PUBLIC_IP>:5173
```

개발 단계에서 EC2 security group은 필요한 source IP에 대해서만 아래 port를 열어둡니다.

- `5173/tcp`: Vite frontend dev server.
- `3000/tcp`: backend를 브라우저에서 직접 호출하는 구성일 때만 필요.
- `22/tcp`: SSH.

AWS 설정 변경은 애플리케이션 구현 범위가 아닙니다.

## 읽기 전용 RBAC

MVP 런타임에 필요한 Kubernetes verb는 `get`, `list`, `watch`입니다. 백엔드는 Kubernetes resource를 생성, 수정, 삭제하지 않습니다.

대상 resource:

- core API group: `nodes`, `namespaces`, `pods`, `services`, `events`.
- apps API group: `deployments`, `replicasets`, `statefulsets`, `daemonsets`.
- metrics.k8s.io API group: `nodes`, `pods`.

클러스터 내부에서 service account로 실행할 때의 최소 권한 예시:

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: k8s-monitor
  namespace: k8s-monitor
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: k8s-monitor-readonly
rules:
  - apiGroups: [""]
    resources: ["nodes", "namespaces", "pods", "services", "events"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["apps"]
    resources: ["deployments", "replicasets", "statefulsets", "daemonsets"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["metrics.k8s.io"]
    resources: ["nodes", "pods"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: k8s-monitor-readonly
subjects:
  - kind: ServiceAccount
    name: k8s-monitor
    namespace: k8s-monitor
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: k8s-monitor-readonly
```

RBAC 적용 전 권한을 확인하려면 대상 kubeconfig 또는 service account 기준으로 `kubectl auth can-i`를 사용합니다.

```sh
kubectl auth can-i list nodes
kubectl auth can-i list pods --all-namespaces
kubectl auth can-i list deployments.apps --all-namespaces
kubectl auth can-i list nodes.metrics.k8s.io
kubectl auth can-i create pods --all-namespaces
kubectl auth can-i delete pods --all-namespaces
```

마지막 두 명령은 `no`가 기대값입니다.

## Smoke Test

EC2 smoke test는 실제 단일 노드 Kubernetes에 연결된 상태에서 실행합니다. 이 절차는 조회와 확인 중심이며, 운영 클러스터에는 실행하지 않습니다.

사전 확인:

```sh
pnpm install
pnpm lint
pnpm build
pnpm test
kubectl get nodes
```

백엔드 API 확인:

```sh
HOST=0.0.0.0 PORT=3000 KUBECONFIG=~/.kube/config pnpm dev:backend
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:3000/api/cluster/summary
curl http://127.0.0.1:3000/api/nodes
curl http://127.0.0.1:3000/api/namespaces
curl http://127.0.0.1:3000/api/workloads
curl "http://127.0.0.1:3000/api/events?limit=10"
curl http://127.0.0.1:3000/api/alerts
```

프론트엔드 확인:

```sh
VITE_BACKEND_PROXY_TARGET=http://127.0.0.1:3000 pnpm dev:frontend -- --host 0.0.0.0
```

브라우저에서 확인할 항목:

- Overview에 Kubernetes version, node readiness, namespace count, pod phase count, workload count가 표시됩니다.
- Nodes, Namespaces, Workloads, Events 화면이 로딩 후 table을 표시합니다.
- Workloads에서 Pod를 선택하면 Pod detail panel이 표시됩니다.
- metrics-server가 정상인 경우 node와 pod usage가 표시됩니다.
- metrics-server가 실패하는 경우 degraded banner와 `unavailable` usage 표시가 보이고, inventory 화면은 계속 동작합니다.
- kubeconfig, bearer token, Kubernetes Secret 값은 화면과 API 응답에 표시되지 않습니다.

장애 알림 UI를 검증할 때는 MVP 테스트용 클러스터의 전용 namespace에서만 임시 resource를 만들고 테스트 후 삭제합니다. 운영 클러스터에서는 실행하지 않습니다.

```sh
kubectl create namespace k8s-monitor-alert-test
kubectl -n k8s-monitor-alert-test run bad-image --image=ghcr.io/example/does-not-exist:never
kubectl -n k8s-monitor-alert-test get pods
kubectl -n k8s-monitor-alert-test get events --sort-by=.lastTimestamp
kubectl delete namespace k8s-monitor-alert-test
```

## Secret 취급

아래 값은 파일에 저장하거나 commit하지 않습니다.

- Slack webhook URL.
- GitHub token.
- kubeconfig 내용.
- bearer token.
- AWS credential.
- Kubernetes Secret 값.
