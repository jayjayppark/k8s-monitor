import { useCallback, useMemo, useState } from "react";
import type {
  AlertItemDto,
  ApiEnvelope,
  ClusterSummaryDto,
  EventDto,
  ListResponse,
} from "@k8s-monitor/shared";

import { getAlerts, getClusterSummary, getRecentEvents } from "./api.ts";
import {
  DataTable,
  EmptyState,
  ErrorState,
  FilterBar,
  LoadingState,
  SelectFilter,
} from "./components.tsx";
import { formatCount, formatDateTime, getDegradedSources } from "./format.ts";
import { useApiResource } from "./useApiResource.ts";

type ViewId = "overview" | "nodes" | "namespaces" | "workloads" | "events";

const views: { id: ViewId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "nodes", label: "Nodes" },
  { id: "namespaces", label: "Namespaces" },
  { id: "workloads", label: "Workloads" },
  { id: "events", label: "Events" },
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
  return (
    <section className="metric-grid" aria-label="Cluster summary">
      <MetricCard
        label="Nodes"
        value={`${summary.nodes.ready}/${summary.nodes.total}`}
        detail={`${summary.nodes.notReady} not ready`}
        tone={summary.nodes.notReady > 0 ? "critical" : "good"}
      />
      <MetricCard
        label="Pods"
        value={summary.pods.total}
        detail={`${summary.pods.pending} pending, ${summary.pods.failed} failed`}
        tone={
          summary.pods.failed > 0
            ? "critical"
            : summary.pods.pending > 0
              ? "warning"
              : "good"
        }
      />
      <MetricCard
        label="Workloads"
        value={
          summary.workloads.deployments +
          summary.workloads.statefulSets +
          summary.workloads.daemonSets +
          summary.workloads.replicaSets
        }
        detail={`${summary.workloads.deployments} deploy, ${summary.workloads.daemonSets} daemon`}
      />
      <MetricCard
        label="Warnings"
        value={summary.events.recentWarnings}
        detail={`${summary.alerts.active} active alerts`}
        tone={summary.alerts.critical > 0 ? "critical" : "warning"}
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
  if (events.data.items.length === 0) {
    return (
      <section className="panel">
        <h2>Recent events</h2>
        <EmptyState
          title="No events"
          message="The backend returned no events."
        />
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Recent events</h2>
          <p>Latest Kubernetes events returned by the backend</p>
        </div>
      </div>
      <DataTable
        items={events.data.items}
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
            key: "last",
            header: "Last seen",
            render: (event) => formatDateTime(event.lastTimestamp),
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
  const summary = useApiResource(loadSummary);
  const alerts = useApiResource(loadAlerts);
  const events = useApiResource(loadEvents);

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

function PlaceholderView({ title }: { title: string }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <EmptyState
        title={`${title} view is next`}
        message="The dashboard shell is ready; this section will use the same API client and table controls."
      />
    </section>
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
        {activeView === "overview" ? (
          <Overview />
        ) : (
          <PlaceholderView title={activeLabel ?? "Dashboard"} />
        )}
      </main>
    </div>
  );
}
