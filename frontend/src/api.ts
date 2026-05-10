import type {
  AlertItemDto,
  ApiEnvelope,
  ClusterSummaryDto,
  EventDto,
  ListResponse,
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

export const apiInternals = {
  createApiUrl,
};
