import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";

import {
  ApiError,
  createBadRequestError,
  createKubernetesUnavailableError,
  registerApiResponseHelpers,
  type ApiEnvelopeOptions,
  type ApiSourceStatus,
} from "./api-response.ts";
import {
  createDefaultKubernetesHealthChecker,
  type ComponentStatus,
  type KubernetesHealthChecker,
} from "./kubernetes-health.ts";
import {
  createDefaultKubernetesResourceReader,
  KubernetesResourceBadRequestError,
  KubernetesResourceNotFoundError,
  type KubernetesResourceReader,
  type KubernetesResourceSnapshot,
  type NodeListOptions,
  type PodLogReadOptions,
  type WorkloadListOptions,
} from "./kubernetes-resources.ts";
import {
  DEFAULT_EVENT_LIMIT,
  MAX_EVENT_LIMIT,
} from "./kubernetes-normalizers.ts";
import {
  createSlackAlertNotifierFromEnv,
  type SlackAlertNotifier,
} from "./slack-alerts.ts";

export interface HealthResponse {
  status: "ok";
  kubernetes: {
    status: ComponentStatus;
    serverVersion: string | null;
    message?: string;
  };
  metrics: {
    status: ComponentStatus;
    message?: string;
  };
}

export interface CreateAppOptions {
  logger?: FastifyServerOptions["logger"];
  kubernetesHealthChecker?: KubernetesHealthChecker;
  kubernetesResourceReader?: KubernetesResourceReader;
  slackAlertNotifier?: SlackAlertNotifier | null;
}

type AlertSeverity = "warning" | "critical";
type AlertStatus = "active" | "resolved";

interface AlertItem {
  id: string;
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string;
  resource: {
    kind: string;
    namespace: string | null;
    name: string;
    uid: string | null;
  } | null;
  startedAt: string;
  lastSeenAt: string;
}

interface SummaryResponse {
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

const WORKLOAD_KINDS = [
  "Pod",
  "Deployment",
  "ReplicaSet",
  "StatefulSet",
  "DaemonSet",
  "Service",
] as const;

const DEFAULT_POD_LOG_TAIL_LINES = 100;
const MAX_POD_LOG_TAIL_LINES = 500;

function queryValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseLimit(value: unknown): number | undefined {
  const raw = queryValue(value);

  if (!raw) {
    return undefined;
  }

  const limit = Number(raw);

  if (!Number.isInteger(limit) || limit < 0 || limit > MAX_EVENT_LIMIT) {
    throw createBadRequestError(
      `limit must be an integer between 0 and ${MAX_EVENT_LIMIT}`,
    );
  }

  return limit;
}

function parseBooleanQuery(value: unknown, name: string): boolean {
  const raw = queryValue(value);

  if (!raw) {
    return false;
  }

  if (raw === "true") {
    return true;
  }

  if (raw === "false") {
    return false;
  }

  throw createBadRequestError(`${name} must be true or false`);
}

function parsePodLogOptions(
  params: { namespace: string; name: string },
  query: unknown,
): PodLogReadOptions {
  const queryParams = query as Record<string, unknown>;
  const rawTailLines = queryValue(queryParams.tailLines);
  const tailLines =
    rawTailLines === undefined
      ? DEFAULT_POD_LOG_TAIL_LINES
      : Number(rawTailLines);

  if (
    !Number.isInteger(tailLines) ||
    tailLines < 1 ||
    tailLines > MAX_POD_LOG_TAIL_LINES
  ) {
    throw createBadRequestError(
      `tailLines must be an integer between 1 and ${MAX_POD_LOG_TAIL_LINES}`,
    );
  }

  return {
    namespace: params.namespace,
    name: params.name,
    container: queryValue(queryParams.container),
    tailLines,
    previous: parseBooleanQuery(queryParams.previous, "previous"),
  };
}

function parseNodeOptions(query: unknown): NodeListOptions {
  const params = query as Record<string, unknown>;
  const status = queryValue(params.status);

  if (status && status !== "ready" && status !== "notReady") {
    throw createBadRequestError("status must be ready or notReady");
  }

  return {
    status: status as NodeListOptions["status"],
    search: queryValue(params.search),
  };
}

function parseWorkloadOptions(query: unknown): WorkloadListOptions {
  const params = query as Record<string, unknown>;
  const kind = queryValue(params.kind);

  if (
    kind &&
    !WORKLOAD_KINDS.includes(kind as (typeof WORKLOAD_KINDS)[number])
  ) {
    throw createBadRequestError(
      `kind must be one of ${WORKLOAD_KINDS.join(", ")}`,
    );
  }

  return {
    namespace: queryValue(params.namespace),
    kind: kind as WorkloadListOptions["kind"] | undefined,
    status: queryValue(params.status),
    search: queryValue(params.search),
  };
}

function parseEventOptions(query: unknown) {
  const params = query as Record<string, unknown>;
  const type = queryValue(params.type);

  if (type && type !== "Normal" && type !== "Warning") {
    throw createBadRequestError("type must be Normal or Warning");
  }

  return {
    namespace: queryValue(params.namespace),
    type,
    involvedKind: queryValue(params.involvedKind),
    limit: parseLimit(params.limit) ?? DEFAULT_EVENT_LIMIT,
  };
}

function sourceStatusesFromHealth(health: HealthResponse): ApiSourceStatus[] {
  return [
    {
      name: "kubernetes",
      status: health.kubernetes.status,
      ...(health.kubernetes.message
        ? { message: health.kubernetes.message }
        : {}),
    },
    {
      name: "metrics-server",
      status: health.metrics.status,
      ...(health.metrics.message ? { message: health.metrics.message } : {}),
    },
  ];
}

function createMetaOptions(
  health: HealthResponse,
  generatedAt = new Date(),
): ApiEnvelopeOptions {
  return {
    generatedAt,
    cluster: {
      serverVersion: health.kubernetes.serverVersion,
    },
    sources: sourceStatusesFromHealth(health),
  };
}

async function getMetaOptions(
  kubernetesHealthChecker: KubernetesHealthChecker,
): Promise<ApiEnvelopeOptions> {
  const health = await kubernetesHealthChecker.check();

  return createMetaOptions({
    status: "ok",
    kubernetes: health.kubernetes,
    metrics: health.metrics,
  });
}

function summarizeSnapshot(
  snapshot: KubernetesResourceSnapshot,
  alerts: AlertItem[],
): SummaryResponse {
  const podWorkloads = snapshot.workloads.filter((item) => item.kind === "Pod");

  return {
    nodes: {
      total: snapshot.nodes.length,
      ready: snapshot.nodes.filter((node) => node.status === "Ready").length,
      notReady: snapshot.nodes.filter((node) => node.status === "NotReady")
        .length,
    },
    namespaces: {
      total: snapshot.namespaces.length,
    },
    pods: {
      total: podWorkloads.length,
      running: podWorkloads.filter((pod) => pod.status === "Running").length,
      pending: podWorkloads.filter((pod) => pod.status === "Pending").length,
      failed: podWorkloads.filter((pod) => pod.status === "Failed").length,
      succeeded: podWorkloads.filter((pod) => pod.status === "Succeeded")
        .length,
      unknown: podWorkloads.filter((pod) => pod.status === "Unknown").length,
    },
    workloads: {
      deployments: snapshot.workloads.filter(
        (item) => item.kind === "Deployment",
      ).length,
      statefulSets: snapshot.workloads.filter(
        (item) => item.kind === "StatefulSet",
      ).length,
      daemonSets: snapshot.workloads.filter((item) => item.kind === "DaemonSet")
        .length,
      replicaSets: snapshot.workloads.filter(
        (item) => item.kind === "ReplicaSet",
      ).length,
    },
    events: {
      recentWarnings: snapshot.events.filter(
        (event) => event.type === "Warning",
      ).length,
    },
    alerts: {
      active: alerts.filter((alert) => alert.status === "active").length,
      critical: alerts.filter((alert) => alert.severity === "critical").length,
      warning: alerts.filter((alert) => alert.severity === "warning").length,
    },
  };
}

function createAlert(
  alert: Omit<AlertItem, "status" | "startedAt" | "lastSeenAt">,
  timestamp: string,
): AlertItem {
  return {
    ...alert,
    status: "active",
    startedAt: timestamp,
    lastSeenAt: timestamp,
  };
}

function calculateAlerts(
  snapshot: KubernetesResourceSnapshot,
  health: HealthResponse,
  now = new Date(),
): AlertItem[] {
  const timestamp = now.toISOString();
  const alerts: AlertItem[] = [];

  for (const node of snapshot.nodes) {
    if (node.status === "NotReady") {
      alerts.push(
        createAlert(
          {
            id: `node/${node.name}/not-ready`,
            severity: "critical",
            title: `Node ${node.name} is NotReady`,
            message: `Node ${node.name} has Ready condition False`,
            resource: {
              kind: "Node",
              namespace: null,
              name: node.name,
              uid: null,
            },
          },
          timestamp,
        ),
      );
    }
  }

  for (const pod of snapshot.workloads.filter((item) => item.kind === "Pod")) {
    if (pod.status === "Failed" || pod.status === "Pending") {
      alerts.push(
        createAlert(
          {
            id: `pod/${pod.namespace}/${pod.name}/${pod.status.toLowerCase()}`,
            severity: pod.status === "Failed" ? "critical" : "warning",
            title: `Pod ${pod.namespace}/${pod.name} is ${pod.status}`,
            message: `Pod ${pod.namespace}/${pod.name} phase is ${pod.status}`,
            resource: {
              kind: "Pod",
              namespace: pod.namespace,
              name: pod.name,
              uid: null,
            },
          },
          timestamp,
        ),
      );
    }

    if ((pod.restarts ?? 0) >= 5) {
      alerts.push(
        createAlert(
          {
            id: `pod/${pod.namespace}/${pod.name}/high-restarts`,
            severity: "warning",
            title: `Pod ${pod.namespace}/${pod.name} has high restarts`,
            message: `Pod restart count is ${pod.restarts}`,
            resource: {
              kind: "Pod",
              namespace: pod.namespace,
              name: pod.name,
              uid: null,
            },
          },
          timestamp,
        ),
      );
    }
  }

  for (const event of snapshot.events.filter(
    (item) => item.type === "Warning",
  )) {
    alerts.push(
      createAlert(
        {
          id: `event/${event.involvedObject.kind}/${event.involvedObject.namespace ?? "_"}/${event.involvedObject.name}/${event.reason}`,
          severity: "warning",
          title: `${event.reason} on ${event.involvedObject.kind} ${event.involvedObject.name}`,
          message: event.message,
          resource: event.involvedObject,
        },
        event.lastTimestamp ?? timestamp,
      ),
    );
  }

  if (health.kubernetes.status === "unavailable") {
    alerts.push(
      createAlert(
        {
          id: "source/kubernetes/unavailable",
          severity: "critical",
          title: "Kubernetes API is unavailable",
          message:
            health.kubernetes.message ?? "Unable to reach Kubernetes API",
          resource: null,
        },
        timestamp,
      ),
    );
  }

  if (health.metrics.status !== "ok") {
    alerts.push(
      createAlert(
        {
          id: "source/metrics-server/degraded",
          severity: "warning",
          title: "metrics-server is degraded",
          message: health.metrics.message ?? "metrics.k8s.io is unavailable",
          resource: null,
        },
        timestamp,
      ),
    );
  }

  return alerts;
}

function filterAlerts(alerts: AlertItem[], query: unknown): AlertItem[] {
  const params = query as Record<string, unknown>;
  const severity = queryValue(params.severity);
  const status = queryValue(params.status);

  if (severity && severity !== "warning" && severity !== "critical") {
    throw createBadRequestError("severity must be warning or critical");
  }

  if (status && status !== "active" && status !== "resolved") {
    throw createBadRequestError("status must be active or resolved");
  }

  return alerts
    .filter((alert) => !severity || alert.severity === severity)
    .filter((alert) => !status || alert.status === status);
}

function mapResourceError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof KubernetesResourceBadRequestError) {
    return createBadRequestError(error.message);
  }

  if (error instanceof KubernetesResourceNotFoundError) {
    return new ApiError(404, "NOT_FOUND", error.message);
  }

  return createKubernetesUnavailableError();
}

async function notifySlackAlerts(
  app: FastifyInstance,
  slackAlertNotifier: SlackAlertNotifier | null,
  alerts: AlertItem[],
): Promise<void> {
  if (!slackAlertNotifier) {
    return;
  }

  try {
    await slackAlertNotifier.notify(alerts);
  } catch (error) {
    app.log.warn(
      {
        err:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : undefined,
      },
      "failed to deliver Slack alerts",
    );
  }
}

export function createApp(options: CreateAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
  });
  const kubernetesHealthChecker =
    options.kubernetesHealthChecker ?? createDefaultKubernetesHealthChecker();
  const kubernetesResourceReader =
    options.kubernetesResourceReader ?? createDefaultKubernetesResourceReader();
  const slackAlertNotifier =
    options.slackAlertNotifier === undefined
      ? createSlackAlertNotifierFromEnv()
      : options.slackAlertNotifier;

  registerApiResponseHelpers(app);

  app.get("/api/health", async (): Promise<HealthResponse> => {
    const health = await kubernetesHealthChecker.check();

    return {
      status: "ok",
      kubernetes: health.kubernetes,
      metrics: health.metrics,
    };
  });

  app.get("/api/cluster/summary", async (_request, reply) => {
    try {
      const [health, snapshot] = await Promise.all([
        kubernetesHealthChecker.check(),
        kubernetesResourceReader.getSnapshot(),
      ]);
      const healthResponse: HealthResponse = {
        status: "ok",
        kubernetes: health.kubernetes,
        metrics: health.metrics,
      };
      const alerts = calculateAlerts(snapshot, healthResponse);
      await notifySlackAlerts(app, slackAlertNotifier, alerts);

      return reply.apiEnvelope(
        summarizeSnapshot(snapshot, alerts),
        createMetaOptions(healthResponse),
      );
    } catch (error) {
      throw mapResourceError(error);
    }
  });

  app.get("/api/nodes", async (request, reply) => {
    try {
      const items = await kubernetesResourceReader.listNodes(
        parseNodeOptions(request.query),
      );
      return reply.apiEnvelope(
        { items },
        await getMetaOptions(kubernetesHealthChecker),
      );
    } catch (error) {
      throw mapResourceError(error);
    }
  });

  app.get("/api/namespaces", async (_request, reply) => {
    try {
      const items = await kubernetesResourceReader.listNamespaces();
      return reply.apiEnvelope(
        { items },
        await getMetaOptions(kubernetesHealthChecker),
      );
    } catch (error) {
      throw mapResourceError(error);
    }
  });

  app.get("/api/workloads", async (request, reply) => {
    try {
      const items = await kubernetesResourceReader.listWorkloads(
        parseWorkloadOptions(request.query),
      );
      return reply.apiEnvelope(
        { items },
        await getMetaOptions(kubernetesHealthChecker),
      );
    } catch (error) {
      throw mapResourceError(error);
    }
  });

  app.get<{
    Params: {
      namespace: string;
      name: string;
    };
  }>("/api/pods/:namespace/:name", async (request, reply) => {
    try {
      const pod = await kubernetesResourceReader.getPod(
        request.params.namespace,
        request.params.name,
      );

      if (!pod) {
        throw new ApiError(404, "NOT_FOUND", "Pod not found");
      }

      return reply.apiEnvelope(
        pod,
        await getMetaOptions(kubernetesHealthChecker),
      );
    } catch (error) {
      throw mapResourceError(error);
    }
  });

  app.get<{
    Params: {
      namespace: string;
      name: string;
    };
  }>("/api/pods/:namespace/:name/logs", async (request, reply) => {
    try {
      const podLogs = await kubernetesResourceReader.getPodLogs(
        parsePodLogOptions(request.params, request.query),
      );

      if (!podLogs) {
        throw new ApiError(404, "NOT_FOUND", "Pod not found");
      }

      return reply.apiEnvelope(
        podLogs,
        await getMetaOptions(kubernetesHealthChecker),
      );
    } catch (error) {
      throw mapResourceError(error);
    }
  });

  app.get("/api/events", async (request, reply) => {
    try {
      const items = await kubernetesResourceReader.listEvents(
        parseEventOptions(request.query),
      );
      return reply.apiEnvelope(
        { items },
        await getMetaOptions(kubernetesHealthChecker),
      );
    } catch (error) {
      throw mapResourceError(error);
    }
  });

  app.get("/api/alerts", async (request, reply) => {
    try {
      const [health, snapshot] = await Promise.all([
        kubernetesHealthChecker.check(),
        kubernetesResourceReader.getSnapshot(),
      ]);
      const healthResponse: HealthResponse = {
        status: "ok",
        kubernetes: health.kubernetes,
        metrics: health.metrics,
      };
      const items = filterAlerts(
        calculateAlerts(snapshot, healthResponse),
        request.query,
      );
      await notifySlackAlerts(app, slackAlertNotifier, items);

      return reply.apiEnvelope({ items }, createMetaOptions(healthResponse));
    } catch (error) {
      throw mapResourceError(error);
    }
  });

  return app;
}

export async function closeApp(
  app: FastifyInstance,
  logger: FastifyBaseLogger = app.log,
): Promise<void> {
  try {
    await app.close();
  } catch (error) {
    logger.error({ err: error }, "failed to close backend server");
  }
}
