# API 계약

## 공통 원칙

- 모든 MVP API는 읽기 전용입니다.
- 프론트엔드는 raw Kubernetes object를 받지 않습니다.
- 성공 응답은 공통 envelope을 사용합니다.
- Kubernetes API 또는 metrics-server 상태는 `meta.sources`에 포함합니다.
- metrics-server가 없으면 inventory API는 실패하지 않고 usage 값을 `null`로 반환합니다.

## 공통 응답

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

source `status` 값:

- `ok`
- `degraded`
- `unavailable`

## 공통 타입

### Quantity

```json
{
  "raw": "256Mi",
  "value": 268435456,
  "unit": "bytes"
}
```

CPU는 `millicores`, memory는 `bytes`로 정규화합니다.

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

백엔드 프로세스, Kubernetes API, metrics-server 상태를 반환합니다.

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
  },
  "alerts": {
    "active": 2,
    "critical": 1,
    "warning": 1
  }
}
```

### `GET /api/alerts`

Query:

- `severity`: optional `warning` 또는 `critical`.
- `status`: optional `active` 또는 `resolved`.

```json
{
  "items": [
    {
      "id": "node/worker-1/not-ready",
      "severity": "critical",
      "status": "active",
      "title": "Node worker-1 is NotReady",
      "message": "Node worker-1 has Ready condition False",
      "resource": {
        "kind": "Node",
        "namespace": null,
        "name": "worker-1",
        "uid": "..."
      },
      "startedAt": "2026-05-06T00:00:00Z",
      "lastSeenAt": "2026-05-06T00:05:00Z"
    }
  ]
}
```

### `GET /api/nodes`

Query:

- `status`: optional `ready` 또는 `notReady`.
- `search`: optional name search.

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

`usage.cpu`와 `usage.memory`는 metrics가 없으면 `null`입니다.

### `GET /api/namespaces`

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

Query:

- `namespace`: optional namespace.
- `kind`: optional `Pod`, `Deployment`, `ReplicaSet`, `StatefulSet`, `DaemonSet`, `Service`.
- `status`: optional status string.
- `search`: optional name search.

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

container `usage.cpu`와 `usage.memory`는 metrics가 없으면 `null`입니다.

### `GET /api/events`

Query:

- `namespace`: optional namespace.
- `type`: optional `Normal` 또는 `Warning`.
- `involvedKind`: optional Kubernetes kind.
- `limit`: optional maximum event count. 기본값은 `50`입니다.

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

- `200`: 성공. degraded source status가 포함될 수 있습니다.
- `400`: query parameter가 유효하지 않습니다.
- `404`: 요청한 resource를 찾을 수 없습니다.
- `503`: 요청 처리에 필요한 Kubernetes API에 도달할 수 없습니다.
- `500`: 예상하지 못한 backend error입니다.
