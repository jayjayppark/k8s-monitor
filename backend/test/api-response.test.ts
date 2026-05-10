import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import {
  ApiError,
  createApiEnvelope,
  createBadRequestError,
  createKubernetesUnavailableError,
} from "../src/api-response.js";
import { createApp } from "../src/app.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("API response helpers", () => {
  it("creates success envelopes with UTC ISO timestamps and source metadata", () => {
    const generatedAt = new Date("2026-05-06T00:00:00.000Z");

    expect(
      createApiEnvelope(
        { items: [] },
        {
          generatedAt,
          cluster: {
            serverVersion: "v1.30.0",
          },
          sources: [
            {
              name: "kubernetes",
              status: "ok",
            },
            {
              name: "metrics-server",
              status: "degraded",
              message: "metrics.k8s.io is unavailable",
            },
          ],
        },
      ),
    ).toEqual({
      data: {
        items: [],
      },
      meta: {
        generatedAt: "2026-05-06T00:00:00.000Z",
        cluster: {
          name: "current",
          serverVersion: "v1.30.0",
        },
        sources: [
          {
            name: "kubernetes",
            status: "ok",
          },
          {
            name: "metrics-server",
            status: "degraded",
            message: "metrics.k8s.io is unavailable",
          },
        ],
      },
    });
  });

  it("lets handlers return the common envelope consistently", async () => {
    app = createApp();
    app.get("/api/test-envelope", async (_request, reply) => {
      return reply.apiEnvelope(
        { ok: true },
        {
          generatedAt: new Date("2026-05-06T00:00:00.000Z"),
          sources: [
            {
              name: "kubernetes",
              status: "ok",
            },
            {
              name: "metrics-server",
              status: "ok",
            },
          ],
        },
      );
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/test-envelope",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: {
        ok: true,
      },
      meta: {
        generatedAt: "2026-05-06T00:00:00.000Z",
        cluster: {
          name: "current",
          serverVersion: null,
        },
        sources: [
          {
            name: "kubernetes",
            status: "ok",
          },
          {
            name: "metrics-server",
            status: "ok",
          },
        ],
      },
    });
  });

  it("normalizes representative 400, 404, 503, and 500 error responses", async () => {
    app = createApp();
    app.get("/api/test-bad-request", async () => {
      throw createBadRequestError("Invalid query parameter", {
        parameter: "status",
      });
    });
    app.get("/api/test-kubernetes-unavailable", async () => {
      throw createKubernetesUnavailableError();
    });
    app.get("/api/test-internal-error", async () => {
      throw new Error("do not leak this message");
    });

    const badRequest = await app.inject({
      method: "GET",
      url: "/api/test-bad-request",
    });
    const notFound = await app.inject({
      method: "GET",
      url: "/api/missing",
    });
    const kubernetesUnavailable = await app.inject({
      method: "GET",
      url: "/api/test-kubernetes-unavailable",
    });
    const internalError = await app.inject({
      method: "GET",
      url: "/api/test-internal-error",
    });

    expect(badRequest.statusCode).toBe(400);
    expect(badRequest.json()).toEqual({
      error: {
        code: "BAD_REQUEST",
        message: "Invalid query parameter",
        details: {
          parameter: "status",
        },
      },
    });

    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Route not found",
        details: {},
      },
    });

    expect(kubernetesUnavailable.statusCode).toBe(503);
    expect(kubernetesUnavailable.json()).toEqual({
      error: {
        code: "KUBERNETES_UNAVAILABLE",
        message: "Unable to reach Kubernetes API",
        details: {},
      },
    });

    expect(internalError.statusCode).toBe(500);
    expect(internalError.json()).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unexpected backend error",
        details: {},
      },
    });
  });

  it("supports explicit API errors for future handlers", async () => {
    app = createApp();
    app.get("/api/test-explicit-error", async () => {
      throw new ApiError(404, "POD_NOT_FOUND", "Pod not found", {
        namespace: "default",
        name: "missing",
      });
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/test-explicit-error",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: "POD_NOT_FOUND",
        message: "Pod not found",
        details: {
          namespace: "default",
          name: "missing",
        },
      },
    });
  });
});
