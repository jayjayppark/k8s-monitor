import type {
  V1Container,
  V1ContainerStatus,
  V1Namespace,
  V1Node,
  V1ObjectMeta,
  V1OwnerReference,
  V1Pod,
} from "@kubernetes/client-node";

export interface QuantityDto {
  raw: string;
  value: number;
  unit: "millicores" | "bytes";
}

export interface ResourceQuantityDto {
  cpu: QuantityDto | null;
  memory: QuantityDto | null;
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

export interface WorkloadItemDto {
  kind: "Pod";
  namespace: string;
  name: string;
  status: string;
  ready: string;
  restarts: number;
  labels: Record<string, string>;
  owner: string | null;
  ageSeconds: number | null;
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

export interface NamespaceWorkloadCounts {
  pods: number;
  services: number;
  deployments: number;
}

const BINARY_MEMORY_UNITS: Record<string, number> = {
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  Pi: 1024 ** 5,
  Ei: 1024 ** 6,
};

const DECIMAL_MEMORY_UNITS: Record<string, number> = {
  K: 1000,
  M: 1000 ** 2,
  G: 1000 ** 3,
  T: 1000 ** 4,
  P: 1000 ** 5,
  E: 1000 ** 6,
};

const EMPTY_RESOURCE_QUANTITIES: ResourceQuantityDto = {
  cpu: null,
  memory: null,
};

function getName(metadata: V1ObjectMeta | undefined): string {
  return metadata?.name ?? "";
}

function calculateAgeSeconds(
  metadata: V1ObjectMeta | undefined,
  now: Date,
): number | null {
  const createdAt = metadata?.creationTimestamp;

  if (!createdAt) {
    return null;
  }

  return Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 1000));
}

export function normalizeCpuQuantity(
  raw: string | undefined,
): QuantityDto | null {
  if (!raw) {
    return null;
  }

  if (raw.endsWith("n")) {
    return {
      raw,
      value: Number(raw.slice(0, -1)) / 1_000_000,
      unit: "millicores",
    };
  }

  if (raw.endsWith("u")) {
    return {
      raw,
      value: Number(raw.slice(0, -1)) / 1_000,
      unit: "millicores",
    };
  }

  if (raw.endsWith("m")) {
    return {
      raw,
      value: Number(raw.slice(0, -1)),
      unit: "millicores",
    };
  }

  return {
    raw,
    value: Number(raw) * 1000,
    unit: "millicores",
  };
}

export function normalizeMemoryQuantity(
  raw: string | undefined,
): QuantityDto | null {
  if (!raw) {
    return null;
  }

  const match = raw.match(/^([0-9.]+)([A-Za-z]+)?$/);

  if (!match) {
    return {
      raw,
      value: Number(raw),
      unit: "bytes",
    };
  }

  const value = Number(match[1]);
  const suffix = match[2];
  const multiplier = suffix
    ? (BINARY_MEMORY_UNITS[suffix] ?? DECIMAL_MEMORY_UNITS[suffix] ?? 1)
    : 1;

  return {
    raw,
    value: value * multiplier,
    unit: "bytes",
  };
}

function normalizeResourceQuantities(
  resources: Record<string, string | undefined> | undefined,
): ResourceQuantityDto {
  return {
    cpu: normalizeCpuQuantity(resources?.cpu),
    memory: normalizeMemoryQuantity(resources?.memory),
  };
}

function normalizeLabels(
  labels: Record<string, string> | undefined,
): Record<string, string> {
  return labels ? { ...labels } : {};
}

function summarizeOwner(
  ownerReferences: V1OwnerReference[] | undefined,
): string | null {
  const owner = ownerReferences?.[0];

  if (!owner?.kind || !owner.name) {
    return null;
  }

  return `${owner.kind}/${owner.name}`;
}

function summarizePodReadiness(pod: V1Pod): string {
  const total = pod.spec?.containers.length ?? 0;
  const ready =
    pod.status?.containerStatuses?.filter((status) => status.ready).length ?? 0;

  return `${ready}/${total}`;
}

function sumPodRestarts(pod: V1Pod): number {
  return (
    pod.status?.containerStatuses?.reduce(
      (sum, status) => sum + (status.restartCount ?? 0),
      0,
    ) ?? 0
  );
}

function findContainerStatus(
  container: V1Container,
  statuses: V1ContainerStatus[] | undefined,
): V1ContainerStatus | undefined {
  return statuses?.find((status) => status.name === container.name);
}

function getNodeRoles(labels: Record<string, string> | undefined): string[] {
  const roles = new Set<string>();

  for (const label of Object.keys(labels ?? {})) {
    const prefix = "node-role.kubernetes.io/";

    if (label.startsWith(prefix)) {
      const role = label.slice(prefix.length);

      if (role) {
        roles.add(role);
      }
    }
  }

  const legacyRole = labels?.["kubernetes.io/role"];

  if (legacyRole) {
    roles.add(legacyRole);
  }

  return [...roles].sort();
}

export function normalizeNode(node: V1Node, now = new Date()): NodeDto {
  const readyCondition = node.status?.conditions?.find(
    (condition) => condition.type === "Ready",
  );

  return {
    name: getName(node.metadata),
    status: readyCondition?.status === "True" ? "Ready" : "NotReady",
    roles: getNodeRoles(node.metadata?.labels),
    kubeletVersion: node.status?.nodeInfo?.kubeletVersion ?? null,
    internalIP:
      node.status?.addresses?.find((address) => address.type === "InternalIP")
        ?.address ?? null,
    allocatable: normalizeResourceQuantities(node.status?.allocatable),
    usage: EMPTY_RESOURCE_QUANTITIES,
    ageSeconds: calculateAgeSeconds(node.metadata, now),
  };
}

export function normalizeNamespace(
  namespace: V1Namespace,
  counts: Partial<NamespaceWorkloadCounts> = {},
  now = new Date(),
): NamespaceDto {
  return {
    name: getName(namespace.metadata),
    status: namespace.status?.phase ?? "Unknown",
    ageSeconds: calculateAgeSeconds(namespace.metadata, now),
    counts: {
      pods: counts.pods ?? 0,
      services: counts.services ?? 0,
      deployments: counts.deployments ?? 0,
    },
  };
}

export function normalizePodWorkloadItem(
  pod: V1Pod,
  now = new Date(),
): WorkloadItemDto {
  return {
    kind: "Pod",
    namespace: pod.metadata?.namespace ?? "default",
    name: getName(pod.metadata),
    status: pod.status?.phase ?? "Unknown",
    ready: summarizePodReadiness(pod),
    restarts: sumPodRestarts(pod),
    labels: normalizeLabels(pod.metadata?.labels),
    owner: summarizeOwner(pod.metadata?.ownerReferences),
    ageSeconds: calculateAgeSeconds(pod.metadata, now),
  };
}

export function normalizePodDetail(
  pod: V1Pod,
  events: PodEventDto[] = [],
): PodDetailDto {
  return {
    kind: "Pod",
    namespace: pod.metadata?.namespace ?? "default",
    name: getName(pod.metadata),
    status: pod.status?.phase ?? "Unknown",
    nodeName: pod.spec?.nodeName ?? null,
    podIP: pod.status?.podIP ?? null,
    ready: summarizePodReadiness(pod),
    restarts: sumPodRestarts(pod),
    containers: (pod.spec?.containers ?? []).map((container) => {
      const status = findContainerStatus(
        container,
        pod.status?.containerStatuses,
      );

      return {
        name: container.name,
        ready: status?.ready ?? false,
        restartCount: status?.restartCount ?? 0,
        image: container.image ?? "",
        resources: {
          requests: normalizeResourceQuantities(container.resources?.requests),
          limits: normalizeResourceQuantities(container.resources?.limits),
        },
        usage: EMPTY_RESOURCE_QUANTITIES,
      };
    }),
    events,
  };
}
