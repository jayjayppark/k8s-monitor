# 제품 기준

## 목표

MVP는 하나의 Kubernetes 클러스터 상태를 빠르게 파악하는 읽기 전용 웹 대시보드입니다. 사용자는 클러스터 요약, node 상태, namespace, workload, pod detail, recent event를 확인할 수 있어야 합니다.

1차 검증 환경은 EC2 한 대에서 실행되는 단일 노드 Kubernetes입니다. 백엔드와 프론트엔드도 같은 EC2에서 실행해 실제 Kubernetes API 연결을 확인합니다.

## 사용자

- Kubernetes 클러스터에 접근할 수 있는 개발자 또는 platform engineer.
- Prometheus/Grafana 같은 전체 observability stack을 도입하기 전에 단순한 상태 확인 화면이 필요한 소규모 팀.

## MVP 포함 범위

- 백엔드 인스턴스 하나가 하나의 Kubernetes 클러스터를 모니터링합니다.
- 백엔드는 kubeconfig를 사용해 Kubernetes API에 연결합니다.
- 프론트엔드는 백엔드 API만 호출합니다.
- 모든 Kubernetes 동작은 읽기 전용입니다.
- metrics-server가 있으면 CPU/memory usage를 표시합니다.
- metrics-server가 없으면 usage는 unavailable/degraded로 표시하고 나머지 인벤토리는 계속 보여줍니다.

## MVP 화면

### 클러스터 요약

- Kubernetes version.
- node readiness count.
- namespace count.
- pod phase count.
- workload count.
- recent warning event count.
- Kubernetes API 또는 metrics API degraded 상태.

### Nodes

- name, readiness, roles, kubelet version.
- internal IP.
- allocatable CPU/memory.
- metrics-server가 제공하는 current CPU/memory usage.
- readiness와 name search filter.

### Namespaces

- name, status, age.
- 기본 workload count.

### Workloads

- Pods, Deployments, ReplicaSets, StatefulSets, DaemonSets, Services.
- kind, namespace, name, status, readiness, restarts.
- label summary, owner summary, age.
- namespace, kind, status, name search filter.

### Pod detail

- status, node assignment, pod IP, readiness, restarts.
- container readiness, image, restart count.
- resource requests/limits.
- current usage when metrics are available.
- related recent events.

### Events

- namespace, type, reason, message.
- involved object.
- count, last timestamp.
- namespace, type, involved kind, limit filter.

## 제외 범위

- Kubernetes resource 생성/수정/삭제.
- logs, exec, port-forward.
- multi-cluster management.
- user authentication/RBAC administration UI.
- alert routing 또는 notification management.
- collector, DaemonSet, Operator, sidecar, node agent.
- Prometheus integration.
- long-term metric storage.

## 성공 기준

- 사용자는 dashboard에서 unhealthy node 또는 pod를 빠르게 확인할 수 있습니다.
- 사용자는 namespace/status/name 기준으로 workload를 좁혀 볼 수 있습니다.
- metrics-server가 있으면 CPU/memory usage를 볼 수 있습니다.
- metrics-server가 없어도 inventory와 status view는 정상 동작합니다.
- 프론트엔드는 kubeconfig, bearer token, Kubernetes Secret 값을 받지 않습니다.
