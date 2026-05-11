import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type {
  AlertItemDto,
  ApiEnvelope,
  ClusterSummaryDto,
  EventDto,
  KubectlCommandResultDto,
  ListResponse,
  NamespaceDto,
  NodeDto,
  PodDetailDto,
  PodLogsDto,
  WorkloadItemDto,
  WorkloadKind,
} from "@k8s-monitor/shared";

import {
  getAlerts,
  getClusterSummary,
  getEvents,
  getNamespaces,
  getNodes,
  getPodDetail,
  getPodLogs,
  getRecentEvents,
  getWorkloads,
  runKubectlCommand,
} from "./api.ts";
import {
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingState,
  SelectFilter,
  TextFilter,
} from "./components.tsx";
import {
  formatAge,
  formatCount,
  formatDateTime,
  formatResourcePair,
  formatResourceUsage,
  getDegradedSources,
} from "./format.ts";
import { useApiResource } from "./useApiResource.ts";

type ViewId =
  | "overview"
  | "nodes"
  | "namespaces"
  | "workloads"
  | "events"
  | "kubectl";

const views: { id: ViewId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "nodes", label: "Nodes" },
  { id: "namespaces", label: "Namespaces" },
  { id: "workloads", label: "Workloads" },
  { id: "events", label: "Events" },
  { id: "kubectl", label: "Kubectl" },
];

const workloadKinds: (WorkloadKind | "all")[] = [
  "all",
  "Pod",
  "Deployment",
  "ReplicaSet",
  "StatefulSet",
  "DaemonSet",
  "Service",
];

type PodLogTailLines = "100" | "500";

const OVERVIEW_REFRESH_INTERVAL_MS = 5_000;
const ALERT_NOTIFICATION_INTERVAL_MS = 5_000;
const MAX_VISIBLE_ALERT_NOTIFICATIONS = 3;

const demoRecentEvents: EventDto[] = [
  {
    namespace: "demo",
    type: "Warning",
    reason: "BackOff",
    message: "Container is restarting repeatedly",
    involvedObject: {
      kind: "Pod",
      namespace: "demo",
      name: "api-crash-loop",
      uid: null,
    },
    count: 3,
    lastTimestamp: null,
  },
  {
    namespace: "demo",
    type: "Warning",
    reason: "FailedScheduling",
    message: "Pod is waiting for available node capacity",
    involvedObject: {
      kind: "Pod",
      namespace: "demo",
      name: "pending-worker",
      uid: null,
    },
    count: 1,
    lastTimestamp: null,
  },
  {
    namespace: "demo",
    type: "Normal",
    reason: "Pulled",
    message: "Container image pulled successfully",
    involvedObject: {
      kind: "Pod",
      namespace: "demo",
      name: "healthy-web",
      uid: null,
    },
    count: 1,
    lastTimestamp: null,
  },
];

function SourceBanner({ envelope }: { envelope: ApiEnvelope<unknown> }) {
  const degradedSources = getDegradedSources(envelope.meta.sources);

  if (degradedSources.length === 0) {
    return null;
  }

  return (
    <section className="banner" aria-label="Degraded sources">
      {degradedSources.map((source) => (
        <div key={source.name}>
          <strong>{source.name}</strong>
          <span>
            {source.status}
            {source.message ? `: ${source.message}` : ""}
          </span>
        </div>
      ))}
    </section>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  detail: string;
  tone?: "neutral" | "warning" | "critical" | "good";
}) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <span>{label}</span>
      <strong>{typeof value === "number" ? formatCount(value) : value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function SummaryCards({ summary }: { summary: ClusterSummaryDto }) {
  const atRiskPods =
    summary.pods.pending + summary.pods.failed + summary.pods.unknown;

  return (
    <section className="metric-grid" aria-label="Cluster summary">
      <MetricCard
        label="Node health"
        value={`${summary.nodes.ready}/${summary.nodes.total}`}
        detail={`${summary.nodes.notReady} not ready`}
        tone={summary.nodes.notReady > 0 ? "critical" : "good"}
      />
      <MetricCard
        label="Pods at risk"
        value={atRiskPods}
        detail={`${summary.pods.running}/${summary.pods.total} running`}
        tone={
          summary.pods.failed > 0
            ? "critical"
            : atRiskPods > 0
              ? "warning"
              : "good"
        }
      />
      <MetricCard
        label="Active alerts"
        value={summary.alerts.active}
        detail={`${summary.alerts.critical} critical, ${summary.alerts.warning} warning`}
        tone={
          summary.alerts.critical > 0
            ? "critical"
            : summary.alerts.warning > 0
              ? "warning"
              : "good"
        }
      />
      <MetricCard
        label="Warning events"
        value={summary.events.recentWarnings}
        detail={`${summary.namespaces.total} namespaces watched`}
        tone={summary.events.recentWarnings > 0 ? "warning" : "good"}
      />
    </section>
  );
}

function AlertPanel({
  alerts,
}: {
  alerts: ApiEnvelope<ListResponse<AlertItemDto>>;
}) {
  const [severity, setSeverity] = useState("all");
  const filteredAlerts = useMemo(
    () =>
      alerts.data.items.filter(
        (alert) => severity === "all" || alert.severity === severity,
      ),
    [alerts.data.items, severity],
  );

  return (
    <section className="panel panel-alerts">
      <div className="panel-heading">
        <div>
          <h2>Active alerts</h2>
          <p>{alerts.data.items.length} current alert candidates</p>
        </div>
        <FilterBar>
          <SelectFilter
            label="Severity"
            value={severity}
            onChange={setSeverity}
            options={[
              { label: "All", value: "all" },
              { label: "Critical", value: "critical" },
              { label: "Warning", value: "warning" },
            ]}
          />
        </FilterBar>
      </div>

      {filteredAlerts.length === 0 ? (
        <EmptyState
          title="No active alerts"
          message="The current filters have no alert candidates."
        />
      ) : (
        <div className="alert-list">
          {filteredAlerts.map((alert) => (
            <article
              className={`alert-item alert-${alert.severity}`}
              key={alert.id}
            >
              <div>
                <strong>{alert.title}</strong>
                <span>{alert.message}</span>
              </div>
              <span className="pill">{alert.severity}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function RecentEvents({
  events,
}: {
  events: ApiEnvelope<ListResponse<EventDto>>;
}) {
  const isShowingExamples = events.data.items.length === 0;
  const eventItems = isShowingExamples ? demoRecentEvents : events.data.items;

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Recent events</h2>
          <p>
            {isShowingExamples
              ? "Example events shown until Kubernetes returns recent events"
              : "Latest Kubernetes events returned by the backend"}
          </p>
        </div>
      </div>
      <DataTable
        items={eventItems}
        getKey={(event) =>
          `${event.namespace ?? "_"}:${event.involvedObject.kind}:${event.involvedObject.name}:${event.reason}:${event.lastTimestamp ?? ""}`
        }
        columns={[
          {
            key: "type",
            header: "Type",
            render: (event) => <span className="pill">{event.type}</span>,
          },
          {
            key: "object",
            header: "Object",
            render: (event) =>
              `${event.involvedObject.kind}/${event.involvedObject.name}`,
          },
          {
            key: "reason",
            header: "Reason",
            render: (event) => event.reason,
          },
          {
            key: "message",
            header: "Message",
            render: (event) => event.message,
          },
          {
            key: "last",
            header: "Last seen",
            render: (event) =>
              isShowingExamples
                ? "Example"
                : formatDateTime(event.lastTimestamp),
          },
        ]}
      />
    </section>
  );
}

function Overview() {
  const loadSummary = useCallback(getClusterSummary, []);
  const loadAlerts = useCallback(getAlerts, []);
  const loadEvents = useCallback(getRecentEvents, []);
  const summary = useApiResource(loadSummary, {
    refreshIntervalMs: OVERVIEW_REFRESH_INTERVAL_MS,
  });
  const alerts = useApiResource(loadAlerts, {
    refreshIntervalMs: OVERVIEW_REFRESH_INTERVAL_MS,
  });
  const events = useApiResource(loadEvents, {
    refreshIntervalMs: OVERVIEW_REFRESH_INTERVAL_MS,
  });

  if (summary.loading) {
    return <LoadingState title="Loading cluster summary" />;
  }

  if (summary.error || !summary.data) {
    return (
      <ErrorState
        title="Unable to load cluster summary"
        message={summary.error ?? "No summary response was returned."}
      />
    );
  }

  return (
    <div className="stack">
      <SourceBanner envelope={summary.data} />
      <SummaryCards summary={summary.data.data} />
      {alerts.loading ? <LoadingState title="Loading alerts" /> : null}
      {alerts.error ? (
        <ErrorState title="Unable to load alerts" message={alerts.error} />
      ) : null}
      {alerts.data ? <AlertPanel alerts={alerts.data} /> : null}
      {events.loading ? <LoadingState title="Loading events" /> : null}
      {events.error ? (
        <ErrorState title="Unable to load events" message={events.error} />
      ) : null}
      {events.data ? <RecentEvents events={events.data} /> : null}
    </div>
  );
}

function ResourceLoadState<TData>({
  resource,
  loadingTitle,
  errorTitle,
  children,
}: {
  resource: {
    data: TData | null;
    error: string | null;
    loading: boolean;
  };
  loadingTitle: string;
  errorTitle: string;
  children: (data: TData) => ReactNode;
}) {
  if (resource.loading && !resource.data) {
    return <LoadingState title={loadingTitle} />;
  }

  if (resource.error || !resource.data) {
    return (
      <ErrorState
        title={errorTitle}
        message={resource.error ?? "No API response was returned."}
      />
    );
  }

  return children(resource.data);
}

function NodesView() {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const loadNodes = useCallback(
    (signal: AbortSignal) => getNodes({ status, search }, signal),
    [search, status],
  );
  const nodes = useApiResource(loadNodes);

  return (
    <ResourceLoadState
      resource={nodes}
      loadingTitle="Loading nodes"
      errorTitle="Unable to load nodes"
    >
      {(envelope) => (
        <section className="panel">
          <SourceBanner envelope={envelope} />
          <div className="panel-heading">
            <div>
              <h2>Nodes</h2>
              <p>{envelope.data.items.length} nodes returned</p>
            </div>
            <FilterBar>
              <SelectFilter
                label="Readiness"
                value={status}
                onChange={setStatus}
                options={[
                  { label: "All", value: "all" },
                  { label: "Ready", value: "ready" },
                  { label: "NotReady", value: "notReady" },
                ]}
              />
              <TextFilter
                label="Name"
                value={search}
                placeholder="worker"
                onChange={setSearch}
              />
            </FilterBar>
          </div>
          {envelope.data.items.length === 0 ? (
            <EmptyState
              title="No nodes"
              message="The current filters returned no nodes."
            />
          ) : (
            <DataTable<NodeDto>
              items={envelope.data.items}
              getKey={(node) => node.name}
              columns={[
                {
                  key: "status",
                  header: "Status",
                  render: (node) => <span className="pill">{node.status}</span>,
                },
                { key: "name", header: "Name", render: (node) => node.name },
                {
                  key: "roles",
                  header: "Roles",
                  render: (node) => node.roles.join(", ") || "-",
                },
                {
                  key: "cpu",
                  header: "CPU",
                  render: (node) =>
                    formatResourceUsage(
                      node.usage.cpu,
                      node.allocatable.cpu,
                      "cpu",
                      "allocatable",
                    ),
                },
                {
                  key: "memory",
                  header: "Memory",
                  render: (node) =>
                    formatResourceUsage(
                      node.usage.memory,
                      node.allocatable.memory,
                      "memory",
                      "allocatable",
                    ),
                },
                {
                  key: "ip",
                  header: "Internal IP",
                  render: (node) => node.internalIP ?? "unknown",
                },
                {
                  key: "age",
                  header: "Age",
                  render: (node) => formatAge(node.ageSeconds),
                },
              ]}
            />
          )}
        </section>
      )}
    </ResourceLoadState>
  );
}

function NamespacesView() {
  const loadNamespaces = useCallback(getNamespaces, []);
  const namespaces = useApiResource(loadNamespaces);

  return (
    <ResourceLoadState
      resource={namespaces}
      loadingTitle="Loading namespaces"
      errorTitle="Unable to load namespaces"
    >
      {(envelope) => (
        <section className="panel">
          <SourceBanner envelope={envelope} />
          <div className="panel-heading">
            <div>
              <h2>Namespaces</h2>
              <p>{envelope.data.items.length} namespaces returned</p>
            </div>
          </div>
          {envelope.data.items.length === 0 ? (
            <EmptyState
              title="No namespaces"
              message="The backend returned no namespaces."
            />
          ) : (
            <DataTable<NamespaceDto>
              items={envelope.data.items}
              getKey={(namespace) => namespace.name}
              columns={[
                {
                  key: "name",
                  header: "Name",
                  render: (namespace) => namespace.name,
                },
                {
                  key: "status",
                  header: "Status",
                  render: (namespace) => (
                    <span className="pill">{namespace.status}</span>
                  ),
                },
                {
                  key: "pods",
                  header: "Pods",
                  render: (namespace) => namespace.counts.pods,
                },
                {
                  key: "services",
                  header: "Services",
                  render: (namespace) => namespace.counts.services,
                },
                {
                  key: "deployments",
                  header: "Deployments",
                  render: (namespace) => namespace.counts.deployments,
                },
                {
                  key: "age",
                  header: "Age",
                  render: (namespace) => formatAge(namespace.ageSeconds),
                },
              ]}
            />
          )}
        </section>
      )}
    </ResourceLoadState>
  );
}

function PodDetailPanel({
  podRef,
  onClose,
}: {
  podRef: { namespace: string; name: string };
  onClose: () => void;
}) {
  const loadPod = useCallback(
    (signal: AbortSignal) =>
      getPodDetail(podRef.namespace, podRef.name, signal),
    [podRef.name, podRef.namespace],
  );
  const pod = useApiResource(loadPod);

  return (
    <ResourceLoadState
      resource={pod}
      loadingTitle="Loading pod detail"
      errorTitle="Unable to load pod detail"
    >
      {(envelope) => <PodDetailContent pod={envelope.data} onClose={onClose} />}
    </ResourceLoadState>
  );
}

function PodDetailContent({
  pod,
  onClose,
}: {
  pod: PodDetailDto;
  onClose: () => void;
}) {
  return (
    <section className="inline-detail" aria-label="Selected pod detail">
      <div className="panel-heading">
        <div>
          <h2>
            Pod {pod.namespace}/{pod.name}
          </h2>
          <p>
            {pod.status} on {pod.nodeName ?? "unassigned"} · {pod.ready} ready ·{" "}
            {pod.restarts} restarts
          </p>
        </div>
        <button className="secondary-button" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="detail-grid">
        <span>Status</span>
        <strong>{pod.status}</strong>
        <span>Ready</span>
        <strong>{pod.ready}</strong>
        <span>Restarts</span>
        <strong>{pod.restarts}</strong>
        <span>Node</span>
        <strong>{pod.nodeName ?? "unassigned"}</strong>
        <span>Pod IP</span>
        <strong>{pod.podIP ?? "unknown"}</strong>
      </div>
      <h3>Containers</h3>
      {pod.containers.length === 0 ? (
        <EmptyState
          title="No containers"
          message="The backend returned no container details."
        />
      ) : (
        <DataTable
          items={pod.containers}
          getKey={(container) => container.name}
          columns={[
            {
              key: "ready",
              header: "Ready",
              render: (container) => (
                <span className="pill">
                  {container.ready ? "Ready" : "NotReady"}
                </span>
              ),
            },
            {
              key: "name",
              header: "Name",
              render: (container) => container.name,
            },
            {
              key: "restarts",
              header: "Restarts",
              render: (container) => container.restartCount,
            },
            {
              key: "cpu",
              header: "CPU",
              render: (container) =>
                formatResourceUsage(
                  container.usage.cpu,
                  container.resources.requests.cpu,
                  "cpu",
                  "request",
                ),
            },
            {
              key: "memory",
              header: "Memory",
              render: (container) =>
                formatResourceUsage(
                  container.usage.memory,
                  container.resources.requests.memory,
                  "memory",
                  "request",
                ),
            },
            {
              key: "limits",
              header: "Limits",
              render: (container) =>
                formatResourcePair(container.resources.limits),
            },
            {
              key: "image",
              header: "Image",
              render: (container) => container.image,
            },
          ]}
        />
      )}
      <PodLogsPanel key={`${pod.namespace}/${pod.name}`} pod={pod} />
      <h3>Recent events</h3>
      {pod.events.length === 0 ? (
        <EmptyState
          title="No pod events"
          message="The backend returned no related events."
        />
      ) : (
        <DataTable
          items={pod.events}
          getKey={(event) =>
            `${event.type}:${event.reason}:${event.lastTimestamp ?? ""}`
          }
          columns={[
            {
              key: "type",
              header: "Type",
              render: (event) => <span className="pill">{event.type}</span>,
            },
            {
              key: "reason",
              header: "Reason",
              render: (event) => event.reason,
            },
            {
              key: "message",
              header: "Message",
              render: (event) => event.message,
            },
            { key: "count", header: "Count", render: (event) => event.count },
            {
              key: "last",
              header: "Last seen",
              render: (event) => formatDateTime(event.lastTimestamp),
            },
          ]}
        />
      )}
    </section>
  );
}

function PodLogsPanel({ pod }: { pod: PodDetailDto }) {
  const [containerName, setContainerName] = useState(
    pod.containers[0]?.name ?? "",
  );
  const [tailLines, setTailLines] = useState<PodLogTailLines>("100");
  const [previous, setPrevious] = useState(false);
  const hasContainers = pod.containers.length > 0;
  const selectedContainer =
    pod.containers.find((container) => container.name === containerName) ??
    pod.containers[0];
  const effectiveContainerName = selectedContainer?.name ?? "";
  const loadLogs = useCallback(
    (signal: AbortSignal) =>
      getPodLogs(
        pod.namespace,
        pod.name,
        {
          container: effectiveContainerName || undefined,
          tailLines,
          previous,
        },
        signal,
      ),
    [effectiveContainerName, pod.name, pod.namespace, previous, tailLines],
  );
  const logs = useApiResource(loadLogs);

  if (!hasContainers) {
    return (
      <>
        <h3>Recent logs</h3>
        <EmptyState
          title="No log target"
          message="The backend returned no containers for this Pod."
        />
      </>
    );
  }

  return (
    <section className="log-section" aria-label="Pod logs">
      <div className="panel-heading log-heading">
        <div>
          <h3>Recent logs</h3>
          <p>
            {previous ? "Previous" : "Current"} container output · {tailLines}{" "}
            lines
          </p>
        </div>
        <FilterBar>
          <SelectFilter
            label="Container"
            value={effectiveContainerName}
            onChange={setContainerName}
            options={pod.containers.map((container) => ({
              label: container.name,
              value: container.name,
            }))}
          />
          <SelectFilter
            label="Lines"
            value={tailLines}
            onChange={(value) => setTailLines(value as PodLogTailLines)}
            options={[
              { label: "100", value: "100" },
              { label: "500", value: "500" },
            ]}
          />
          <label className="filter-control checkbox-control">
            <span>Mode</span>
            <span className="checkbox-box">
              <input
                checked={previous}
                type="checkbox"
                onChange={(event) => setPrevious(event.target.checked)}
              />
              Previous logs
            </span>
          </label>
        </FilterBar>
      </div>
      <PodLogsContent resource={logs} />
    </section>
  );
}

function PodLogsContent({
  resource,
}: {
  resource: {
    data: ApiEnvelope<PodLogsDto> | null;
    error: string | null;
    loading: boolean;
  };
}) {
  if (resource.loading && !resource.data) {
    return <LoadingState title="Loading pod logs" />;
  }

  if (resource.error || !resource.data) {
    return (
      <ErrorState
        title="Unable to load pod logs"
        message={resource.error ?? "No log response was returned."}
      />
    );
  }

  const logText = resource.data.data.logs;

  return (
    <div className="log-panel">
      <SourceBanner envelope={resource.data} />
      {logText.trim().length === 0 ? (
        <EmptyState
          title="No recent logs"
          message="The selected container returned an empty log response."
        />
      ) : (
        <pre className="log-output">{logText}</pre>
      )}
    </div>
  );
}

function WorkloadsView() {
  const [namespace, setNamespace] = useState("");
  const [kind, setKind] = useState<WorkloadKind | "all">("all");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [selectedPod, setSelectedPod] = useState<{
    namespace: string;
    name: string;
  } | null>(null);
  const loadWorkloads = useCallback(
    (signal: AbortSignal) =>
      getWorkloads({ namespace, kind, status, search }, signal),
    [kind, namespace, search, status],
  );
  const workloads = useApiResource(loadWorkloads);

  return (
    <div className="stack">
      <ResourceLoadState
        resource={workloads}
        loadingTitle="Loading workloads"
        errorTitle="Unable to load workloads"
      >
        {(envelope) => (
          <section className="panel">
            <SourceBanner envelope={envelope} />
            <div className="panel-heading">
              <div>
                <h2>Workloads</h2>
                <p>{envelope.data.items.length} workload resources returned</p>
              </div>
              <FilterBar>
                <TextFilter
                  label="Namespace"
                  value={namespace}
                  placeholder="default"
                  onChange={setNamespace}
                />
                <SelectFilter
                  label="Kind"
                  value={kind}
                  onChange={(value) => setKind(value as WorkloadKind | "all")}
                  options={workloadKinds.map((value) => ({
                    label: value === "all" ? "All" : value,
                    value,
                  }))}
                />
                <TextFilter
                  label="Status"
                  value={status}
                  placeholder="Running"
                  onChange={setStatus}
                />
                <TextFilter
                  label="Name"
                  value={search}
                  placeholder="web"
                  onChange={setSearch}
                />
              </FilterBar>
            </div>
            {envelope.data.items.length === 0 ? (
              <EmptyState
                title="No workloads"
                message="The current filters returned no workload resources."
              />
            ) : (
              <DataTable<WorkloadItemDto>
                items={envelope.data.items}
                getKey={(item) => `${item.kind}:${item.namespace}:${item.name}`}
                renderAfterRow={(item) =>
                  selectedPod &&
                  item.kind === "Pod" &&
                  item.namespace === selectedPod.namespace &&
                  item.name === selectedPod.name ? (
                    <PodDetailPanel
                      podRef={selectedPod}
                      onClose={() => setSelectedPod(null)}
                    />
                  ) : null
                }
                columns={[
                  {
                    key: "status",
                    header: "Status",
                    render: (item) => (
                      <span className="pill">{item.status}</span>
                    ),
                  },
                  {
                    key: "kind",
                    header: "Kind",
                    render: (item) => <span className="pill">{item.kind}</span>,
                  },
                  {
                    key: "namespace",
                    header: "Namespace",
                    render: (item) => item.namespace,
                  },
                  {
                    key: "name",
                    header: "Name",
                    render: (item) =>
                      item.kind === "Pod" ? (
                        <button
                          className="link-button"
                          type="button"
                          onClick={() =>
                            setSelectedPod({
                              namespace: item.namespace,
                              name: item.name,
                            })
                          }
                        >
                          {item.name}
                        </button>
                      ) : (
                        item.name
                      ),
                  },
                  {
                    key: "ready",
                    header: "Ready",
                    render: (item) => item.ready,
                  },
                  {
                    key: "restarts",
                    header: "Restarts",
                    render: (item) => item.restarts ?? "-",
                  },
                  {
                    key: "owner",
                    header: "Owner",
                    render: (item) => item.owner ?? "-",
                  },
                  {
                    key: "age",
                    header: "Age",
                    render: (item) => formatAge(item.ageSeconds),
                  },
                ]}
              />
            )}
          </section>
        )}
      </ResourceLoadState>
    </div>
  );
}

function EventsView() {
  const [namespace, setNamespace] = useState("");
  const [type, setType] = useState("all");
  const [involvedKind, setInvolvedKind] = useState("");
  const [limit, setLimit] = useState("50");
  const loadEvents = useCallback(
    (signal: AbortSignal) =>
      getEvents({ namespace, type, involvedKind, limit }, signal),
    [involvedKind, limit, namespace, type],
  );
  const events = useApiResource(loadEvents);

  return (
    <ResourceLoadState
      resource={events}
      loadingTitle="Loading events"
      errorTitle="Unable to load events"
    >
      {(envelope) => (
        <section className="panel">
          <SourceBanner envelope={envelope} />
          <div className="panel-heading">
            <div>
              <h2>Events</h2>
              <p>{envelope.data.items.length} events returned</p>
            </div>
            <FilterBar>
              <TextFilter
                label="Namespace"
                value={namespace}
                placeholder="default"
                onChange={setNamespace}
              />
              <SelectFilter
                label="Type"
                value={type}
                onChange={setType}
                options={[
                  { label: "All", value: "all" },
                  { label: "Normal", value: "Normal" },
                  { label: "Warning", value: "Warning" },
                ]}
              />
              <TextFilter
                label="Kind"
                value={involvedKind}
                placeholder="Pod"
                onChange={setInvolvedKind}
              />
              <TextFilter
                label="Limit"
                value={limit}
                placeholder="50"
                onChange={setLimit}
              />
            </FilterBar>
          </div>
          {envelope.data.items.length === 0 ? (
            <EmptyState
              title="No events"
              message="The current filters returned no events."
            />
          ) : (
            <DataTable<EventDto>
              items={envelope.data.items}
              getKey={(event) =>
                `${event.namespace ?? "_"}:${event.involvedObject.kind}:${event.involvedObject.name}:${event.reason}:${event.lastTimestamp ?? ""}`
              }
              columns={[
                {
                  key: "type",
                  header: "Type",
                  render: (event) => <span className="pill">{event.type}</span>,
                },
                {
                  key: "namespace",
                  header: "Namespace",
                  render: (event) => event.namespace ?? "-",
                },
                {
                  key: "object",
                  header: "Object",
                  render: (event) =>
                    `${event.involvedObject.kind}/${event.involvedObject.name}`,
                },
                {
                  key: "reason",
                  header: "Reason",
                  render: (event) => event.reason,
                },
                {
                  key: "message",
                  header: "Message",
                  render: (event) => event.message,
                },
                {
                  key: "count",
                  header: "Count",
                  render: (event) => event.count,
                },
                {
                  key: "last",
                  header: "Last seen",
                  render: (event) => formatDateTime(event.lastTimestamp),
                },
              ]}
            />
          )}
        </section>
      )}
    </ResourceLoadState>
  );
}

function KubectlView() {
  const [command, setCommand] = useState("kubectl get pods -A");
  const [result, setResult] =
    useState<ApiEnvelope<KubectlCommandResultDto> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submitCommand = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const envelope = await runKubectlCommand(command);
      setResult(envelope);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to run command",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel kubectl-panel">
      <div className="panel-heading">
        <div>
          <h2>Kubectl</h2>
          <p>Read-only command output from the current cluster</p>
        </div>
      </div>
      <form className="command-form" onSubmit={submitCommand}>
        <label className="command-input">
          <span>Command</span>
          <input
            value={command}
            spellCheck={false}
            onChange={(event) => setCommand(event.target.value)}
          />
        </label>
        <button className="secondary-button" disabled={loading} type="submit">
          {loading ? "Running" : "Run"}
        </button>
      </form>
      <div className="command-examples" aria-label="Supported examples">
        {[
          "kubectl get pods -A",
          "kubectl get nodes",
          "kubectl describe pod web -n default",
          "kubectl logs web -n default --tail=100",
        ].map((example) => (
          <button
            className="link-button"
            key={example}
            type="button"
            onClick={() => setCommand(example)}
          >
            {example}
          </button>
        ))}
      </div>
      {error ? (
        <ErrorState title="Unable to run command" message={error} />
      ) : null}
      {result ? (
        <div className="command-result">
          <SourceBanner envelope={result} />
          <div className="command-result-heading">
            <strong>{result.data.command}</strong>
            <span>exit {result.data.exitCode}</span>
          </div>
          <pre className="log-output">{result.data.output}</pre>
        </div>
      ) : (
        <EmptyState
          title="No command output"
          message="Run a supported read-only command to see the result."
        />
      )}
    </section>
  );
}

function AlertNotifications() {
  const activeAlertIds = useRef(new Set<string>());
  const [notifications, setNotifications] = useState<AlertItemDto[]>([]);

  useEffect(() => {
    let disposed = false;
    let controller: AbortController | null = null;

    const refreshAlerts = () => {
      controller?.abort();
      controller = new AbortController();

      getAlerts(controller.signal)
        .then((envelope) => {
          if (disposed) {
            return;
          }

          const currentActiveIds = new Set(
            envelope.data.items.map((alert) => alert.id),
          );
          const newAlerts = envelope.data.items.filter(
            (alert) => !activeAlertIds.current.has(alert.id),
          );

          activeAlertIds.current = currentActiveIds;

          if (newAlerts.length === 0) {
            return;
          }

          setNotifications((current) =>
            [...newAlerts, ...current].slice(
              0,
              MAX_VISIBLE_ALERT_NOTIFICATIONS,
            ),
          );
        })
        .catch(() => undefined);
    };

    refreshAlerts();
    const intervalId = window.setInterval(
      refreshAlerts,
      ALERT_NOTIFICATION_INTERVAL_MS,
    );

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      controller?.abort();
    };
  }, []);

  if (notifications.length === 0) {
    return null;
  }

  return (
    <aside
      aria-label="Alert notifications"
      aria-live="polite"
      className="toast-region"
    >
      {notifications.map((alert) => (
        <article
          className={`toast toast-${alert.severity}`}
          key={alert.id}
          role="status"
        >
          <div>
            <strong>{alert.title}</strong>
            <span>{alert.message}</span>
          </div>
          <button
            aria-label={`Dismiss ${alert.title}`}
            type="button"
            onClick={() =>
              setNotifications((current) =>
                current.filter((item) => item.id !== alert.id),
              )
            }
          >
            x
          </button>
        </article>
      ))}
    </aside>
  );
}

export default function App() {
  const [activeView, setActiveView] = useState<ViewId>("overview");
  const activeLabel = views.find((view) => view.id === activeView)?.label;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>Kubernetes Monitor</strong>
          <span>current cluster</span>
        </div>
        <nav aria-label="Dashboard navigation">
          {views.map((view) => (
            <button
              className={view.id === activeView ? "nav-active" : ""}
              key={view.id}
              type="button"
              onClick={() => setActiveView(view.id)}
            >
              {view.label}
            </button>
          ))}
        </nav>
      </aside>
      <main>
        <header className="page-header">
          <div>
            <span>Read-only Kubernetes status</span>
            <h1>{activeLabel}</h1>
          </div>
        </header>
        {activeView === "overview" ? <Overview /> : null}
        {activeView === "nodes" ? <NodesView /> : null}
        {activeView === "namespaces" ? <NamespacesView /> : null}
        {activeView === "workloads" ? <WorkloadsView /> : null}
        {activeView === "events" ? <EventsView /> : null}
        {activeView === "kubectl" ? <KubectlView /> : null}
      </main>
      <AlertNotifications />
    </div>
  );
}
