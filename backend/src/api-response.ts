import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

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

export interface ApiEnvelopeOptions {
  cluster?: Partial<ApiClusterMeta>;
  generatedAt?: Date;
  sources?: ApiSourceStatus[];
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
}

export const DEFAULT_CLUSTER_META: ApiClusterMeta = {
  name: "current",
  serverVersion: null,
};

export const PENDING_SOURCE_STATUSES: ApiSourceStatus[] = [
  {
    name: "kubernetes",
    status: "degraded",
    message: "Kubernetes client wiring is pending",
  },
  {
    name: "metrics-server",
    status: "degraded",
    message: "metrics-server check is pending",
  },
];

export function createApiEnvelope<TData>(
  data: TData,
  options: ApiEnvelopeOptions = {},
): ApiEnvelope<TData> {
  return {
    data,
    meta: {
      generatedAt: (options.generatedAt ?? new Date()).toISOString(),
      cluster: {
        ...DEFAULT_CLUSTER_META,
        ...options.cluster,
      },
      sources: options.sources ?? PENDING_SOURCE_STATUSES,
    },
  };
}

export function createApiErrorBody(
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): ApiErrorBody {
  return {
    error: {
      code,
      message,
      details,
    },
  };
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details: Record<string, unknown>;

  public constructor(
    statusCode: number,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

declare module "fastify" {
  interface FastifyReply {
    apiEnvelope<TData>(data: TData, options?: ApiEnvelopeOptions): FastifyReply;
  }
}

export function sendApiEnvelope<TData>(
  reply: FastifyReply,
  data: TData,
  options?: ApiEnvelopeOptions,
): FastifyReply {
  return reply.send(createApiEnvelope(data, options));
}

export function registerApiResponseHelpers(app: FastifyInstance): void {
  app.decorateReply("apiEnvelope", function apiEnvelope<
    TData,
  >(this: FastifyReply, data: TData, options?: ApiEnvelopeOptions): FastifyReply {
    return sendApiEnvelope(this, data, options);
  });

  app.setNotFoundHandler(async (_request: FastifyRequest, reply) => {
    return reply
      .status(404)
      .send(createApiErrorBody("NOT_FOUND", "Route not found"));
  });

  app.setErrorHandler(async (error, _request, reply) => {
    if (error instanceof ApiError) {
      return reply
        .status(error.statusCode)
        .send(createApiErrorBody(error.code, error.message, error.details));
    }

    if (isRecord(error) && error.statusCode === 400) {
      return reply.status(400).send(
        createApiErrorBody("BAD_REQUEST", "Request validation failed", {
          validation: error.validation,
        }),
      );
    }

    reply.log.error({ err: error }, "unhandled api error");
    return reply
      .status(500)
      .send(createApiErrorBody("INTERNAL_ERROR", "Unexpected backend error"));
  });
}

export function createBadRequestError(
  message: string,
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError(400, "BAD_REQUEST", message, details);
}

export function createKubernetesUnavailableError(
  message = "Unable to reach Kubernetes API",
  details?: Record<string, unknown>,
): ApiError {
  return new ApiError(503, "KUBERNETES_UNAVAILABLE", message, details);
}
