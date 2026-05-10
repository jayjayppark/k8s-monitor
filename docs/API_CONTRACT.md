# API 계약

## 원칙

- API는 MVP에서 read-only입니다.
- 프론트엔드는 raw Kubernetes object가 아니라 정규화된 DTO를 받습니다.
- Kubernetes data에 의존하는 모든 응답은 freshness와 source status를 포함합니다.
- missing metrics는 inventory endpoint의 hard failure가 아니라 `null` 값과 warning으로 표현합니다.

## 공통 타입

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

CPU 값은 정규화 단위로 millicores를 사용해야 합니다. Memory 값은 bytes를 사용해야 합니다.

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

## 엔드포인트

### `GET /api/health`

백엔드 프로세스 health와 Kubernetes connectivity를 반환합니다.

응답:

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

상위 수준의 cluster status를 반환합니다.

응답 데이터:

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

쿼리 파라미터:

- `status`: 선택 사항. `ready` 또는 `notReady`.
- `search`: 선택 사항. 대소문자를 구분하지 않는 이름 검색.

응답 데이터:

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

응답 데이터:

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

쿼리 파라미터:

- `namespace`: 선택 사항. namespace.
- `kind`: 선택 사항. `Pod`, `Deployment`, `ReplicaSet`, `StatefulSet`, `DaemonSet`, 또는 `Service`.
- `status`: 선택 사항. status string.
- `search`: 선택 사항. 대소문자를 구분하지 않는 이름 검색.

응답 데이터:

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

pod detail을 반환합니다.

응답 데이터:

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

쿼리 파라미터:

- `namespace`: 선택 사항. namespace.
- `type`: 선택 사항. `Normal` 또는 `Warning`.
- `involvedKind`: 선택 사항. Kubernetes kind.
- `limit`: 선택 사항. 최대 event count이며 기본값은 `50`입니다.

응답 데이터:

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

## 상태 코드

- `200`: 성공 응답입니다. degraded source status가 포함될 수 있습니다.
- `400`: query parameter가 유효하지 않습니다.
- `404`: 요청한 resource를 찾을 수 없습니다.
- `503`: 백엔드가 요청된 작업에 필요한 Kubernetes API에 도달할 수 없습니다.
- `500`: 예상하지 못한 백엔드 error입니다.

## 버전 관리

MVP endpoint는 `/api` 아래에 둡니다. MVP 이후 breaking change가 필요하면 외부 사용자가 contract에 의존하기 전에 `/api/v1`을 도입합니다.
