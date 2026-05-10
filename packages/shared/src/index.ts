export type SourceStatus = "ok" | "degraded" | "unavailable";
export type SourceName = "kubernetes" | "metrics-server";

export interface ApiSourceStatus {
  name: SourceName;
  status: SourceStatus;
  message?: string;
}

export interface ApiClusterMeta {
  name: string;
  serverVersion: string | null;
}

export interface ApiResponseMeta {
  generatedAt: string;
  cluster: ApiClusterMeta;
  sources: ApiSourceStatus[];
}

export interface ApiEnvelope<TData> {
  data: TData;
  meta: ApiResponseMeta;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
}

export interface QuantityDto {
  raw: string;
  value: number;
  unit: "millicores" | "bytes";
}

export interface ResourceQuantityDto {
  cpu: QuantityDto | null;
  memory: QuantityDto | null;
}

export interface ResourceRefDto {
  kind: string;
  namespace: string | null;
  name: string;
  uid: string | null;
}

export interface ClusterSummaryDto {
  nodes: {
    total: number;
    ready: number;
    notReady: number;
  };
  namespaces: {
    total: number;
  };
  pods: {
    total: number;
    running: number;
    pending: number;
    failed: number;
    succeeded: number;
    unknown: number;
  };
  workloads: {
    deployments: number;
    statefulSets: number;
    daemonSets: number;
    replicaSets: number;
  };
  events: {
    recentWarnings: number;
  };
  alerts: {
    active: number;
    critical: number;
    warning: number;
  };
}

export interface AlertItemDto {
  id: string;
  severity: "warning" | "critical";
  status: "active" | "resolved";
  title: string;
  message: string;
  resource: ResourceRefDto | null;
  startedAt: string;
  lastSeenAt: string;
}

export interface NodeDto {
  name: string;
  status: "Ready" | "NotReady";
  roles: string[];
  kubeletVersion: string | null;
  internalIP: string | null;
  allocatable: ResourceQuantityDto;
  usage: ResourceQuantityDto;
  ageSeconds: number | null;
}

export interface NamespaceDto {
  name: string;
  status: string;
  ageSeconds: number | null;
  counts: {
    pods: number;
    services: number;
    deployments: number;
  };
}

export type WorkloadKind =
  | "Pod"
  | "Deployment"
  | "ReplicaSet"
  | "StatefulSet"
  | "DaemonSet"
  | "Service";

export interface WorkloadItemDto {
  kind: WorkloadKind;
  namespace: string;
  name: string;
  status: string;
  ready: string;
  restarts: number | null;
  labels: Record<string, string>;
  owner: string | null;
  ageSeconds: number | null;
}

export interface EventDto {
  namespace: string | null;
  type: string;
  reason: string;
  message: string;
  involvedObject: ResourceRefDto;
  count: number;
  lastTimestamp: string | null;
}

export interface PodContainerDto {
  name: string;
  ready: boolean;
  restartCount: number;
  image: string;
  resources: {
    requests: ResourceQuantityDto;
    limits: ResourceQuantityDto;
  };
  usage: ResourceQuantityDto;
}

export interface PodEventDto {
  type: string;
  reason: string;
  message: string;
  count: number;
  lastTimestamp: string | null;
}

export interface PodDetailDto {
  kind: "Pod";
  namespace: string;
  name: string;
  status: string;
  nodeName: string | null;
  podIP: string | null;
  ready: string;
  restarts: number;
  containers: PodContainerDto[];
  events: PodEventDto[];
}

export interface ListResponse<TItem> {
  items: TItem[];
}
