# MVP 요구사항

## 목표

하나의 Kubernetes 클러스터를 모니터링하는 경량 웹 애플리케이션을 만듭니다. MVP는 in-cluster collector 또는 agent를 설치하지 않고도 사용자가 클러스터 health, node 및 workload 상태, 기본 CPU/memory 사용량을 빠르게 파악할 수 있게 해야 합니다.

## 사용자

- 이미 Kubernetes 클러스터 접근 권한을 가진 개발자 또는 platform engineer.
- 전체 observability stack을 도입하기 전에 단순한 dashboard가 필요한 소규모 팀.

## 범위

### 포함 범위

- 백엔드 인스턴스 하나당 정확히 하나의 Kubernetes 클러스터를 모니터링합니다.
- 백엔드는 Kubernetes API에 직접 연결합니다.
- 프론트엔드는 모든 모니터링 데이터를 백엔드 API에서 읽습니다.
- cluster summary를 표시합니다:
  - 사용 가능한 경우 Kubernetes version.
  - readiness별 node count.
  - namespace count.
  - phase별 pod count.
  - recent warning events.
- node inventory를 표시합니다:
  - name, readiness, roles, Kubernetes version.
  - 사용 가능한 경우 internal IP.
  - allocatable CPU and memory.
  - metrics-server를 사용할 수 있을 때 current CPU and memory usage.
- namespace inventory를 표시합니다:
  - namespace name.
  - status.
  - age.
  - basic workload counts.
- Pods, Deployments, ReplicaSets, StatefulSets, DaemonSets, Services에 대한 workload inventory를 표시합니다:
  - name, namespace, status, readiness, 적용 가능한 경우 restarts.
  - labels와 owner references의 요약 형태.
- pod detail을 표시합니다:
  - containers and readiness.
  - restart counts.
  - node assignment.
  - recent related events.
  - 지정된 경우 resource requests and limits.
  - metrics-server를 사용할 수 있을 때 current CPU and memory usage.
- 단순 filter를 제공합니다:
  - Namespace.
  - Resource kind.
  - Status.
  - Name search.
- Kubernetes API 또는 metrics API 호출이 실패하면 stale-data 또는 degraded-state indicator를 표시합니다.
- read-only monitoring만 제공합니다.

### 제외 범위

- Prometheus integration.
- Custom metrics.
- Logs and exec access.
- Kubernetes resource mutation.
- Multi-cluster management.
- Authentication and RBAC administration UI.
- Alert routing or notification management.
- Collector, DaemonSet, Operator, sidecar, node agent.
- Long-term metric storage.

## 데이터 소스

- resource inventory와 events에는 Kubernetes core 및 apps API를 사용합니다.
- CPU와 memory usage에는 metrics-server의 `metrics.k8s.io` API를 사용합니다.
- 배포 방식에 따라 백엔드 프로세스의 kubeconfig 또는 in-cluster service account credential을 사용합니다.

## 기능 요구사항

1. 백엔드는 startup 또는 health endpoint를 통해 Kubernetes connectivity를 검증해야 합니다.
2. 백엔드는 프론트엔드를 위한 read-only REST API를 노출해야 합니다.
3. 백엔드는 Kubernetes object를 반환하기 전에 안정적인 DTO로 정규화해야 합니다.
4. 백엔드는 metrics-server가 없어도 동작해야 하며 usage metrics 없이 resource inventory를 반환해야 합니다.
5. 프론트엔드는 metrics를 사용할 수 없을 때도 유용한 dashboard를 렌더링해야 합니다.
6. 프론트엔드는 loading, empty, degraded, error state를 표시해야 합니다.
7. 프론트엔드는 raw kubeconfig, bearer token, cluster secret을 받아서는 안 됩니다.
8. 시스템은 추가 component 설치 없이 표준 Kubernetes 클러스터에서 사용할 수 있어야 합니다.

## 비기능 요구사항

- Lightweight: 로컬 개발과 소규모 클러스터 모니터링에 적합해야 합니다.
- Read-only by default: MVP 동작에는 write verb가 필요하지 않아야 합니다.
- Low operational footprint: 하나의 백엔드 프로세스와 하나의 프론트엔드 앱으로 구성합니다.
- Clear failure behavior: API error는 어떤 data source가 실패했는지 보이도록 해야 합니다.
- Extensible: resource 및 metric DTO는 이후 Prometheus 지원을 추가할 여지를 남겨야 합니다.

## 초기 성공 기준

- 사용자는 dashboard를 열어 클러스터에 unhealthy node 또는 pod가 있는지 파악할 수 있습니다.
- 사용자는 namespace와 status로 workload를 filter할 수 있습니다.
- 사용자는 metrics-server가 설치되어 있을 때 CPU/memory usage를 볼 수 있습니다.
- 사용자는 metrics-server가 설치되어 있지 않아도 inventory와 status view를 사용할 수 있습니다.
