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
- risk pod count.
- recent warning event count.
- active alert count.
- Kubernetes API 또는 metrics API degraded 상태.
- 문제가 있는 리소스가 있으면 브라우저 화면에서 눈에 띄는 알림을 표시합니다.

### Nodes

- name, readiness, roles, kubelet version.
- internal IP.
- allocatable 대비 current CPU/memory usage와 사용률.
- readiness와 name search filter.

### Namespaces

- name, status, age.
- 기본 workload count.

### Workloads

- Pods, Deployments, ReplicaSets, StatefulSets, DaemonSets, Services.
- kind, namespace, name, status, readiness, restarts.
- owner summary, age.
- namespace, kind, status, name search filter.
- Pod 항목을 선택하면 선택한 행 바로 아래에 Pod detail을 펼쳐 보여줍니다.

### Pod detail

- status, node assignment, pod IP, readiness, restarts.
- container readiness, image, restart count.
- resource requests/limits.
- request 대비 current CPU/memory usage와 사용률.
- related recent events.

### Events

- namespace, type, reason, message.
- involved object.
- count, last timestamp.
- namespace, type, involved kind, limit filter.

### Alerts

- unhealthy node, failed/pending pod, high restart count, recent warning event, Kubernetes API degraded 상태를 알림 후보로 표시합니다.
- MVP의 브라우저 알림은 in-app banner 또는 notification panel을 우선합니다.
- 브라우저 Web Notification API 사용은 사용자가 명시적으로 허용한 경우에만 선택적으로 사용합니다.
- Slack 알림은 webhook 기반으로 시작하며, secret은 환경 변수로만 제공합니다.
- Slack 알림은 중복 전송을 줄이기 위해 같은 alert key에 대한 간단한 cooldown을 적용합니다.

## 제외 범위

- Kubernetes resource 생성/수정/삭제.
- logs, exec, port-forward.
- multi-cluster management.
- user authentication/RBAC administration UI.
- 복잡한 alert routing, escalation, silence, on-call schedule 관리.
- collector, DaemonSet, Operator, sidecar, node agent.
- Prometheus integration.
- long-term metric storage.

## 성공 기준

- 사용자는 dashboard에서 unhealthy node 또는 pod를 빠르게 확인할 수 있습니다.
- 사용자는 namespace/status/name 기준으로 workload를 좁혀 볼 수 있습니다.
- metrics-server가 있으면 CPU/memory usage를 볼 수 있습니다.
- metrics-server가 없어도 inventory와 status view는 정상 동작합니다.
- 프론트엔드는 kubeconfig, bearer token, Kubernetes Secret 값을 받지 않습니다.
