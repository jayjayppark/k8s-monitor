# Architecture

## Overview

The MVP is a monorepo with two applications:

- `backend`: API server that connects to one Kubernetes cluster and normalizes cluster state.
- `frontend`: browser application that renders cluster health and resource views from backend APIs.

The backend is the only component that communicates with Kubernetes. The frontend never talks directly to the Kubernetes API.

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

## Repository Shape

Implementation should start with this intended layout:

```text
.
├── backend/
├── frontend/
├── docs/
├── scripts/
├── AGENTS.md
└── TASKS.md
```

No `backend`, `frontend`, or package manifest is created during the initial design step.

## Backend Responsibilities

- Load Kubernetes connection configuration.
- Check cluster connectivity.
- List and watch Kubernetes resources needed for the MVP.
- Query metrics-server through `metrics.k8s.io` when available.
- Normalize Kubernetes resources into frontend-safe DTOs.
- Cache recent resource snapshots in memory to reduce repeated Kubernetes API pressure.
- Surface partial failures explicitly, such as unavailable metrics API.
- Expose read-only REST endpoints.

## Frontend Responsibilities

- Render dashboard summary, inventory tables, and detail views.
- Call backend APIs only.
- Provide namespace/status/name filters.
- Display degraded states when a backend response includes warnings or source errors.
- Avoid storing credentials or Kubernetes secrets.

## Kubernetes Access Model

The backend needs read-only access to:

- Nodes.
- Namespaces.
- Pods.
- Services.
- Deployments, ReplicaSets, StatefulSets, DaemonSets.
- Events.
- Pod and node metrics from `metrics.k8s.io` when available.

The MVP should work with either:

- Local kubeconfig for development.
- In-cluster service account for deployment.

Required verbs should be limited to `get`, `list`, and `watch` for monitored resources.

## Data Flow

1. Backend starts and loads Kubernetes configuration.
2. Backend verifies API connectivity and discovers whether metrics-server is available.
3. Backend maintains a recent in-memory snapshot of resource inventory.
4. Frontend requests summary and list endpoints.
5. Backend merges resource state with metrics where available.
6. Backend returns DTOs with metadata about freshness and degraded data sources.
7. Frontend renders the current state and warns if data is stale or partial.

## Metrics Strategy

CPU and memory usage for the MVP comes from metrics-server:

- Node metrics: `NodeMetrics`.
- Pod metrics: `PodMetrics`.

Metrics are optional. If `metrics.k8s.io` is unavailable, the backend returns `null` usage values and a source warning. This keeps the dashboard useful without requiring Prometheus.

## Realtime Strategy

Initial implementation should favor simple, reliable data refresh:

- Backend watches Kubernetes resources where practical.
- Frontend may poll summary and list endpoints on a short interval.
- Server-Sent Events or WebSocket can be considered later if polling causes poor UX.

## Security Boundaries

- Backend owns Kubernetes credentials.
- Frontend receives only normalized monitoring data.
- No secrets are returned by API endpoints.
- Logs must not print kubeconfig content, bearer tokens, or Slack webhook URLs.

## Deployment Assumptions

- MVP may be run locally against a kubeconfig.
- Later deployment may run backend inside the target cluster with read-only RBAC.
- Frontend may be served separately or by the backend in a later packaging step.

## Known Architecture Limits

- One backend instance monitors one cluster.
- No historical metrics storage.
- No high availability requirements for MVP.
- No alerting pipeline.
- Metrics resolution and retention are limited by metrics-server.
