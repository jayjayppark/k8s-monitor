import type {
  AlertItemDto,
  ApiEnvelope,
  ClusterSummaryDto,
  EventDto,
  ListResponse,
  NamespaceDto,
  NodeDto,
  PodDetailDto,
  PodLogsDto,
  WorkloadItemDto,
  WorkloadKind,
} from "@k8s-monitor/shared";

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly code: string;

  public constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
  }
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

function createApiUrl(path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (!API_BASE_URL) {
    return normalizedPath;
  }

  return `${API_BASE_URL.replace(/\/$/, "")}${normalizedPath}`;
}

function createQuery(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value && value !== "all") {
      query.set(key, value);
    }
  }

  const serialized = query.toString();

  return serialized ? `?${serialized}` : "";
}

function createPodLogsQuery(params: {
  container?: string;
  tailLines: "100" | "500";
  previous: boolean;
}): string {
  const query = new URLSearchParams();

  if (params.container) {
    query.set("container", params.container);
  }

  query.set("tailLines", params.tailLines);

  if (params.previous) {
    query.set("previous", "true");
  }

  return `?${query.toString()}`;
}

async function requestEnvelope<TData>(
  path: string,
  signal?: AbortSignal,
): Promise<ApiEnvelope<TData>> {
  const response = await fetch(createApiUrl(path), {
    headers: {
      Accept: "application/json",
    },
    signal,
  });
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    const errorBody = body as {
      error?: {
        code?: string;
        message?: string;
      };
    };

    throw new ApiClientError(
      response.status,
      errorBody.error?.code ?? "API_ERROR",
      errorBody.error?.message ?? "Request failed",
    );
  }

  return body as ApiEnvelope<TData>;
}

export function getClusterSummary(
  signal?: AbortSignal,
): Promise<ApiEnvelope<ClusterSummaryDto>> {
  return requestEnvelope<ClusterSummaryDto>("/api/cluster/summary", signal);
}

export function getAlerts(
  signal?: AbortSignal,
): Promise<ApiEnvelope<ListResponse<AlertItemDto>>> {
  return requestEnvelope<ListResponse<AlertItemDto>>(
    "/api/alerts?status=active",
    signal,
  );
}

export function getRecentEvents(
  signal?: AbortSignal,
): Promise<ApiEnvelope<ListResponse<EventDto>>> {
  return requestEnvelope<ListResponse<EventDto>>(
    "/api/events?limit=10",
    signal,
  );
}

export function getEvents(
  options: {
    namespace?: string;
    type?: string;
    involvedKind?: string;
    limit?: string;
  } = {},
  signal?: AbortSignal,
): Promise<ApiEnvelope<ListResponse<EventDto>>> {
  return requestEnvelope<ListResponse<EventDto>>(
    `/api/events${createQuery(options)}`,
    signal,
  );
}

export function getNodes(
  options: { status?: string; search?: string } = {},
  signal?: AbortSignal,
): Promise<ApiEnvelope<ListResponse<NodeDto>>> {
  return requestEnvelope<ListResponse<NodeDto>>(
    `/api/nodes${createQuery(options)}`,
    signal,
  );
}

export function getNamespaces(
  signal?: AbortSignal,
): Promise<ApiEnvelope<ListResponse<NamespaceDto>>> {
  return requestEnvelope<ListResponse<NamespaceDto>>("/api/namespaces", signal);
}

export function getWorkloads(
  options: {
    namespace?: string;
    kind?: WorkloadKind | "all";
    status?: string;
    search?: string;
  } = {},
  signal?: AbortSignal,
): Promise<ApiEnvelope<ListResponse<WorkloadItemDto>>> {
  return requestEnvelope<ListResponse<WorkloadItemDto>>(
    `/api/workloads${createQuery(options)}`,
    signal,
  );
}

export function getPodDetail(
  namespace: string,
  name: string,
  signal?: AbortSignal,
): Promise<ApiEnvelope<PodDetailDto>> {
  return requestEnvelope<PodDetailDto>(
    `/api/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`,
    signal,
  );
}

export function getPodLogs(
  namespace: string,
  name: string,
  options: {
    container?: string;
    tailLines: "100" | "500";
    previous: boolean;
  },
  signal?: AbortSignal,
): Promise<ApiEnvelope<PodLogsDto>> {
  return requestEnvelope<PodLogsDto>(
    `/api/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/logs${createPodLogsQuery(options)}`,
    signal,
  );
}

export const apiInternals = {
  createApiUrl,
  createQuery,
  createPodLogsQuery,
};
