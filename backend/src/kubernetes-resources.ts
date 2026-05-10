import type {
  CoreV1Event,
  V1DaemonSet,
  V1Deployment,
  V1Namespace,
  V1Node,
  V1Pod,
  V1ReplicaSet,
  V1Service,
  V1StatefulSet,
} from "@kubernetes/client-node";

import { createKubernetesClientBundle } from "./kubernetes-client.ts";
import {
  normalizeDaemonSetWorkloadItem,
  normalizeDeploymentWorkloadItem,
  normalizeEventList,
  normalizeNamespace,
  normalizeNode,
  normalizePodDetail,
  normalizePodWorkloadItem,
  normalizeReplicaSetWorkloadItem,
  normalizeServiceWorkloadItem,
  normalizeStatefulSetWorkloadItem,
  type EventDto,
  type EventListOptions,
  type NamespaceDto,
  type NodeDto,
  type PodDetailDto,
  type PodEventDto,
  type WorkloadItemDto,
} from "./kubernetes-normalizers.ts";

export interface KubernetesResourceSnapshot {
  nodes: NodeDto[];
  namespaces: NamespaceDto[];
  workloads: WorkloadItemDto[];
  events: EventDto[];
}

export interface WorkloadListOptions {
  namespace?: string;
  kind?: WorkloadItemDto["kind"];
  status?: string;
  search?: string;
}

export interface NodeListOptions {
  status?: "ready" | "notReady";
  search?: string;
}

export interface KubernetesResourceReader {
  getSnapshot(options?: {
    eventLimit?: number;
  }): Promise<KubernetesResourceSnapshot>;
  listNodes(options?: NodeListOptions): Promise<NodeDto[]>;
  listNamespaces(): Promise<NamespaceDto[]>;
  listWorkloads(options?: WorkloadListOptions): Promise<WorkloadItemDto[]>;
  listEvents(options?: EventListOptions): Promise<EventDto[]>;
  getPod(namespace: string, name: string): Promise<PodDetailDto | null>;
}

type KubernetesClients = ReturnType<
  typeof createKubernetesClientBundle
>["clients"];

interface ResourceLists {
  nodes: V1Node[];
  namespaces: V1Namespace[];
  pods: V1Pod[];
  services: V1Service[];
  deployments: V1Deployment[];
  replicaSets: V1ReplicaSet[];
  statefulSets: V1StatefulSet[];
  daemonSets: V1DaemonSet[];
  events: CoreV1Event[];
}

function includesSearch(value: string, search: string | undefined): boolean {
  return !search || value.toLowerCase().includes(search.toLowerCase());
}

function countByNamespace<T extends { metadata?: { namespace?: string } }>(
  items: T[],
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const item of items) {
    const namespace = item.metadata?.namespace ?? "default";
    counts.set(namespace, (counts.get(namespace) ?? 0) + 1);
  }

  return counts;
}

function filterNodes(
  nodes: NodeDto[],
  options: NodeListOptions = {},
): NodeDto[] {
  return nodes
    .filter((node) => {
      if (!options.status) {
        return true;
      }

      return options.status === "ready"
        ? node.status === "Ready"
        : node.status === "NotReady";
    })
    .filter((node) => includesSearch(node.name, options.search));
}

function filterWorkloads(
  workloads: WorkloadItemDto[],
  options: WorkloadListOptions = {},
): WorkloadItemDto[] {
  return workloads
    .filter(
      (item) => !options.namespace || item.namespace === options.namespace,
    )
    .filter((item) => !options.kind || item.kind === options.kind)
    .filter((item) => !options.status || item.status === options.status)
    .filter((item) => includesSearch(item.name, options.search));
}

export class KubernetesClientResourceReader implements KubernetesResourceReader {
  private readonly clients: KubernetesClients;

  public constructor(clients = createKubernetesClientBundle().clients) {
    this.clients = clients;
  }

  public async getSnapshot(
    options: { eventLimit?: number } = {},
  ): Promise<KubernetesResourceSnapshot> {
    const lists = await this.listRawResources();
    const podCounts = countByNamespace(lists.pods);
    const serviceCounts = countByNamespace(lists.services);
    const deploymentCounts = countByNamespace(lists.deployments);
    const now = new Date();
    const nodes = lists.nodes.map((node) => normalizeNode(node, now));
    const namespaces = lists.namespaces.map((namespace) =>
      normalizeNamespace(
        namespace,
        {
          pods: podCounts.get(namespace.metadata?.name ?? "") ?? 0,
          services: serviceCounts.get(namespace.metadata?.name ?? "") ?? 0,
          deployments:
            deploymentCounts.get(namespace.metadata?.name ?? "") ?? 0,
        },
        now,
      ),
    );

    return {
      nodes,
      namespaces,
      workloads: [
        ...lists.pods.map((pod) => normalizePodWorkloadItem(pod, now)),
        ...lists.deployments.map((deployment) =>
          normalizeDeploymentWorkloadItem(deployment, now),
        ),
        ...lists.replicaSets.map((replicaSet) =>
          normalizeReplicaSetWorkloadItem(replicaSet, now),
        ),
        ...lists.statefulSets.map((statefulSet) =>
          normalizeStatefulSetWorkloadItem(statefulSet, now),
        ),
        ...lists.daemonSets.map((daemonSet) =>
          normalizeDaemonSetWorkloadItem(daemonSet, now),
        ),
        ...lists.services.map((service) =>
          normalizeServiceWorkloadItem(service, now),
        ),
      ],
      events: normalizeEventList(lists.events, { limit: options.eventLimit }),
    };
  }

  public async listNodes(options: NodeListOptions = {}): Promise<NodeDto[]> {
    const snapshot = await this.getSnapshot();
    return filterNodes(snapshot.nodes, options);
  }

  public async listNamespaces(): Promise<NamespaceDto[]> {
    const snapshot = await this.getSnapshot();
    return snapshot.namespaces;
  }

  public async listWorkloads(
    options: WorkloadListOptions = {},
  ): Promise<WorkloadItemDto[]> {
    const snapshot = await this.getSnapshot();
    return filterWorkloads(snapshot.workloads, options);
  }

  public async listEvents(options: EventListOptions = {}): Promise<EventDto[]> {
    const events = await this.clients.core.listEventForAllNamespaces();
    return normalizeEventList(events.items ?? [], options);
  }

  public async getPod(
    namespace: string,
    name: string,
  ): Promise<PodDetailDto | null> {
    try {
      const [pod, events] = await Promise.all([
        this.clients.core.readNamespacedPod({ name, namespace }),
        this.clients.core.listNamespacedEvent({ namespace }),
      ]);
      const podEvents: PodEventDto[] = normalizeEventList(events.items ?? [], {
        involvedKind: "Pod",
        limit: 50,
      })
        .filter((event) => event.involvedObject.name === name)
        .map((event) => ({
          type: event.type,
          reason: event.reason,
          message: event.message,
          count: event.count,
          lastTimestamp: event.lastTimestamp,
        }));

      return normalizePodDetail(pod, podEvents);
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error) {
        const code = String((error as { code: unknown }).code);

        if (code === "404") {
          return null;
        }
      }

      throw error;
    }
  }

  private async listRawResources(): Promise<ResourceLists> {
    const [
      nodes,
      namespaces,
      pods,
      services,
      deployments,
      replicaSets,
      statefulSets,
      daemonSets,
      events,
    ] = await Promise.all([
      this.clients.core.listNode(),
      this.clients.core.listNamespace(),
      this.clients.core.listPodForAllNamespaces(),
      this.clients.core.listServiceForAllNamespaces(),
      this.clients.apps.listDeploymentForAllNamespaces(),
      this.clients.apps.listReplicaSetForAllNamespaces(),
      this.clients.apps.listStatefulSetForAllNamespaces(),
      this.clients.apps.listDaemonSetForAllNamespaces(),
      this.clients.core.listEventForAllNamespaces(),
    ]);

    return {
      nodes: nodes.items ?? [],
      namespaces: namespaces.items ?? [],
      pods: pods.items ?? [],
      services: services.items ?? [],
      deployments: deployments.items ?? [],
      replicaSets: replicaSets.items ?? [],
      statefulSets: statefulSets.items ?? [],
      daemonSets: daemonSets.items ?? [],
      events: events.items ?? [],
    };
  }
}

export function createDefaultKubernetesResourceReader(): KubernetesResourceReader {
  try {
    return new KubernetesClientResourceReader();
  } catch {
    return {
      async getSnapshot(): Promise<KubernetesResourceSnapshot> {
        throw new Error("Kubernetes client is unavailable");
      },
      async listNodes(): Promise<NodeDto[]> {
        throw new Error("Kubernetes client is unavailable");
      },
      async listNamespaces(): Promise<NamespaceDto[]> {
        throw new Error("Kubernetes client is unavailable");
      },
      async listWorkloads(): Promise<WorkloadItemDto[]> {
        throw new Error("Kubernetes client is unavailable");
      },
      async listEvents(): Promise<EventDto[]> {
        throw new Error("Kubernetes client is unavailable");
      },
      async getPod(): Promise<PodDetailDto | null> {
        throw new Error("Kubernetes client is unavailable");
      },
    };
  }
}
