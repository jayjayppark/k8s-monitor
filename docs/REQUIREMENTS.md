# MVP Requirements

## Goal

Build a lightweight web application that monitors one Kubernetes cluster. The MVP should help a user quickly understand cluster health, node and workload status, and basic CPU/memory usage without installing in-cluster collectors or agents.

## Users

- A developer or platform engineer who already has access to a Kubernetes cluster.
- A small team that needs a simple dashboard before adopting a full observability stack.

## Scope

### In Scope

- Monitor exactly one Kubernetes cluster per backend instance.
- Backend connects directly to the Kubernetes API.
- Frontend reads all monitoring data from the backend API.
- Display cluster summary:
  - Kubernetes version if available.
  - Node count by readiness.
  - Namespace count.
  - Pod count by phase.
  - Recent warning events.
- Display node inventory:
  - Name, readiness, roles, Kubernetes version.
  - Internal IP if available.
  - Allocatable CPU and memory.
  - Current CPU and memory usage when metrics-server is available.
- Display namespace inventory:
  - Namespace name.
  - Status.
  - Age.
  - Basic workload counts.
- Display workload inventory for Pods, Deployments, ReplicaSets, StatefulSets, DaemonSets, and Services:
  - Name, namespace, status, readiness, restarts where applicable.
  - Labels and owner references in summarized form.
- Display pod detail:
  - Containers and readiness.
  - Restart counts.
  - Node assignment.
  - Recent related events.
  - Resource requests and limits when specified.
  - Current CPU and memory usage when metrics-server is available.
- Provide simple filters:
  - Namespace.
  - Resource kind.
  - Status.
  - Search by name.
- Show stale-data or degraded-state indicators when Kubernetes API or metrics API calls fail.
- Provide read-only monitoring only.

### Out of Scope

- Prometheus integration.
- Custom metrics.
- Logs and exec access.
- Mutating Kubernetes resources.
- Multi-cluster management.
- Authentication and RBAC administration UI.
- Alert routing or notification management.
- Collector, DaemonSet, Operator, sidecar, or node agent.
- Long-term metric storage.

## Data Sources

- Kubernetes core and apps APIs for resource inventory and events.
- `metrics.k8s.io` API from metrics-server for CPU and memory usage.
- Backend process kubeconfig or in-cluster service account credentials, depending on deployment mode.

## Functional Requirements

1. The backend must validate Kubernetes connectivity on startup or through a health endpoint.
2. The backend must expose a read-only REST API for the frontend.
3. The backend must normalize Kubernetes objects into stable DTOs before returning them.
4. The backend must tolerate missing metrics-server and return resource inventory without usage metrics.
5. The frontend must render a useful dashboard when metrics are unavailable.
6. The frontend must show loading, empty, degraded, and error states.
7. The frontend must not receive raw kubeconfig, bearer tokens, or cluster secrets.
8. The system must be usable against a standard Kubernetes cluster without installing extra components.

## Non-Functional Requirements

- Lightweight: suitable for local development and small cluster monitoring.
- Read-only by default: no write verbs required for MVP behavior.
- Low operational footprint: one backend process and one frontend app.
- Clear failure behavior: API errors should be visible and explain which data source failed.
- Extensible: resource and metric DTOs should leave room for future Prometheus support.

## Initial Success Criteria

- A user can open the dashboard and identify whether the cluster has unhealthy nodes or pods.
- A user can filter workloads by namespace and status.
- A user can see CPU/memory usage when metrics-server is installed.
- A user can still use inventory and status views when metrics-server is not installed.
