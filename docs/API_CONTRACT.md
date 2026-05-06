# API Contract

## Principles

- API is read-only for the MVP.
- Frontend receives normalized DTOs, not raw Kubernetes objects.
- Every response that depends on Kubernetes data includes freshness and source status.
- Missing metrics are represented as `null` values plus a warning, not as a hard failure for inventory endpoints.

## Common Types

### Envelope

```json
{
  "data": {},
  "meta": {
    "generatedAt": "2026-05-06T00:00:00Z",
    "cluster": {
      "name": "current",
      "serverVersion": "v1.30.0"
    },
    "sources": [
      {
        "name": "kubernetes",
        "status": "ok"
      },
      {
        "name": "metrics-server",
        "status": "degraded",
        "message": "metrics.k8s.io is unavailable"
      }
    ]
  }
}
```

### Quantity

```json
{
  "raw": "256Mi",
  "value": 268435456,
  "unit": "bytes"
}
```

CPU values should use millicores as the normalized unit. Memory values should use bytes.

### ResourceRef

```json
{
  "kind": "Pod",
  "namespace": "default",
  "name": "web-abc123",
  "uid": "..."
}
```

### Error

```json
{
  "error": {
    "code": "KUBERNETES_UNAVAILABLE",
    "message": "Unable to reach Kubernetes API",
    "details": {}
  }
}
```

## Endpoints

### `GET /api/health`

Returns backend process health and Kubernetes connectivity.

Response:

```json
{
  "status": "ok",
  "kubernetes": {
    "status": "ok",
    "serverVersion": "v1.30.0"
  },
  "metrics": {
    "status": "ok"
  }
}
```

### `GET /api/cluster/summary`

Returns high-level cluster status.

Response data:

```json
{
  "nodes": {
    "total": 3,
    "ready": 3,
    "notReady": 0
  },
  "namespaces": {
    "total": 8
  },
  "pods": {
    "total": 42,
    "running": 39,
    "pending": 1,
    "failed": 0,
    "succeeded": 2,
    "unknown": 0
  },
  "workloads": {
    "deployments": 12,
    "statefulSets": 1,
    "daemonSets": 2,
    "replicaSets": 14
  },
  "events": {
    "recentWarnings": 4
  }
}
```

### `GET /api/nodes`

Query parameters:

- `status`: optional `ready` or `notReady`.
- `search`: optional case-insensitive name search.

Response data:

```json
{
  "items": [
    {
      "name": "worker-1",
      "status": "Ready",
      "roles": ["worker"],
      "kubeletVersion": "v1.30.0",
      "internalIP": "10.0.1.10",
      "allocatable": {
        "cpu": { "raw": "4", "value": 4000, "unit": "millicores" },
        "memory": { "raw": "16Gi", "value": 17179869184, "unit": "bytes" }
      },
      "usage": {
        "cpu": { "raw": "250m", "value": 250, "unit": "millicores" },
        "memory": { "raw": "2048Mi", "value": 2147483648, "unit": "bytes" }
      },
      "ageSeconds": 86400
    }
  ]
}
```

### `GET /api/namespaces`

Response data:

```json
{
  "items": [
    {
      "name": "default",
      "status": "Active",
      "ageSeconds": 86400,
      "counts": {
        "pods": 8,
        "services": 2,
        "deployments": 3
      }
    }
  ]
}
```

### `GET /api/workloads`

Query parameters:

- `namespace`: optional namespace.
- `kind`: optional `Pod`, `Deployment`, `ReplicaSet`, `StatefulSet`, `DaemonSet`, or `Service`.
- `status`: optional status string.
- `search`: optional case-insensitive name search.

Response data:

```json
{
  "items": [
    {
      "kind": "Deployment",
      "namespace": "default",
      "name": "web",
      "status": "Available",
      "ready": "3/3",
      "restarts": null,
      "labels": {
        "app": "web"
      },
      "owner": null,
      "ageSeconds": 3600
    }
  ]
}
```

### `GET /api/pods/{namespace}/{name}`

Returns pod detail.

Response data:

```json
{
  "kind": "Pod",
  "namespace": "default",
  "name": "web-abc123",
  "status": "Running",
  "nodeName": "worker-1",
  "podIP": "10.244.1.5",
  "ready": "1/1",
  "restarts": 0,
  "containers": [
    {
      "name": "web",
      "ready": true,
      "restartCount": 0,
      "image": "example/web:1.0.0",
      "resources": {
        "requests": {
          "cpu": { "raw": "100m", "value": 100, "unit": "millicores" },
          "memory": { "raw": "128Mi", "value": 134217728, "unit": "bytes" }
        },
        "limits": {
          "cpu": null,
          "memory": null
        }
      },
      "usage": {
        "cpu": { "raw": "20m", "value": 20, "unit": "millicores" },
        "memory": { "raw": "64Mi", "value": 67108864, "unit": "bytes" }
      }
    }
  ],
  "events": [
    {
      "type": "Warning",
      "reason": "BackOff",
      "message": "Back-off restarting failed container",
      "count": 3,
      "lastTimestamp": "2026-05-06T00:00:00Z"
    }
  ]
}
```

### `GET /api/events`

Query parameters:

- `namespace`: optional namespace.
- `type`: optional `Normal` or `Warning`.
- `involvedKind`: optional Kubernetes kind.
- `limit`: optional maximum event count, default `50`.

Response data:

```json
{
  "items": [
    {
      "namespace": "default",
      "type": "Warning",
      "reason": "FailedScheduling",
      "message": "0/3 nodes are available",
      "involvedObject": {
        "kind": "Pod",
        "namespace": "default",
        "name": "pending-pod",
        "uid": "..."
      },
      "count": 1,
      "lastTimestamp": "2026-05-06T00:00:00Z"
    }
  ]
}
```

## Status Codes

- `200`: Successful response. May include degraded source status.
- `400`: Invalid query parameter.
- `404`: Requested resource was not found.
- `503`: Backend cannot reach required Kubernetes API for the requested operation.
- `500`: Unexpected backend error.

## Versioning

MVP endpoints live under `/api`. If breaking changes are needed after MVP, introduce `/api/v1` before external consumers depend on the contract.
