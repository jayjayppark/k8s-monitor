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
  normalizeResourceQuantities,
  normalizeServiceWorkloadItem,
  normalizeStatefulSetWorkloadItem,
  type EventDto,
  type EventListOptions,
  type NamespaceDto,
  type NodeDto,
  type PodDetailDto,
  type PodEventDto,
  type ResourceQuantityDto,
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

interface MetricsObjectMeta {
  name?: string;
  namespace?: string;
}

interface NodeMetric {
  metadata?: MetricsObjectMeta;
  usage?: Record<string, string | undefined>;
}

interface PodContainerMetric {
  name?: string;
  usage?: Record<string, string | undefined>;
}

interface PodMetric {
  metadata?: MetricsObjectMeta;
  containers?: PodContainerMetric[];
}

interface MetricsList<TItem> {
  items?: TItem[];
}

interface ResourceMetrics {
  nodes: Map<string, ResourceQuantityDto>;
  pods: Map<string, Map<string, ResourceQuantityDto>>;
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

function podMetricKey(namespace: string, name: string): string {
  return `${namespace}/${name}`;
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
    const [lists, metrics] = await Promise.all([
      this.listRawResources(),
      this.listMetrics(),
    ]);
    const podCounts = countByNamespace(lists.pods);
    const serviceCounts = countByNamespace(lists.services);
    const deploymentCounts = countByNamespace(lists.deployments);
    const now = new Date();
    const nodes = lists.nodes.map((node) =>
      normalizeNode(
        node,
        now,
        metrics.nodes.get(node.metadata?.name ?? "") ?? undefined,
      ),
    );
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
      const podMetrics = await this.readPodMetrics(namespace, name);
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

      return normalizePodDetail(pod, podEvents, podMetrics);
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

  private async listMetrics(): Promise<ResourceMetrics> {
    const emptyMetrics: ResourceMetrics = {
      nodes: new Map(),
      pods: new Map(),
    };

    try {
      const [nodeMetrics, podMetrics] = await Promise.all([
        this.clients.customObjects.listClusterCustomObject({
          group: "metrics.k8s.io",
          version: "v1beta1",
          plural: "nodes",
        }) as Promise<MetricsList<NodeMetric>>,
        this.clients.customObjects.listCustomObjectForAllNamespaces({
          group: "metrics.k8s.io",
          version: "v1beta1",
          plural: "pods",
        }) as Promise<MetricsList<PodMetric>>,
      ]);

      return {
        nodes: this.mapNodeMetrics(nodeMetrics.items ?? []),
        pods: this.mapPodMetrics(podMetrics.items ?? []),
      };
    } catch {
      return emptyMetrics;
    }
  }

  private async readPodMetrics(
    namespace: string,
    name: string,
  ): Promise<Map<string, ResourceQuantityDto>> {
    try {
      const podMetrics =
        (await this.clients.customObjects.getNamespacedCustomObject({
          group: "metrics.k8s.io",
          version: "v1beta1",
          namespace,
          plural: "pods",
          name,
        })) as PodMetric;

      return this.mapPodMetricContainers(podMetrics);
    } catch {
      return new Map();
    }
  }

  private mapNodeMetrics(
    nodes: NodeMetric[],
  ): Map<string, ResourceQuantityDto> {
    const usageByNode = new Map<string, ResourceQuantityDto>();

    for (const node of nodes) {
      if (node.metadata?.name) {
        usageByNode.set(
          node.metadata.name,
          normalizeResourceQuantities(node.usage),
        );
      }
    }

    return usageByNode;
  }

  private mapPodMetrics(
    pods: PodMetric[],
  ): Map<string, Map<string, ResourceQuantityDto>> {
    const usageByPod = new Map<string, Map<string, ResourceQuantityDto>>();

    for (const pod of pods) {
      const namespace = pod.metadata?.namespace ?? "default";
      const name = pod.metadata?.name;

      if (name) {
        usageByPod.set(
          podMetricKey(namespace, name),
          this.mapPodMetricContainers(pod),
        );
      }
    }

    return usageByPod;
  }

  private mapPodMetricContainers(
    pod: PodMetric,
  ): Map<string, ResourceQuantityDto> {
    const usageByContainer = new Map<string, ResourceQuantityDto>();

    for (const container of pod.containers ?? []) {
      if (container.name) {
        usageByContainer.set(
          container.name,
          normalizeResourceQuantities(container.usage),
        );
      }
    }

    return usageByContainer;
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
