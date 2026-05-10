import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import {
  DefaultKubernetesHealthChecker,
  type KubernetesHealthProbe,
} from "../src/kubernetes-health.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("GET /api/health", () => {
  it("returns Kubernetes and metrics health when both are reachable", async () => {
    app = createApp({
      kubernetesHealthChecker: new DefaultKubernetesHealthChecker({
        async getServerVersion() {
          return "v1.30.0";
        },
        async checkMetricsApi() {
          return undefined;
        },
      }),
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.json()).toEqual({
      status: "ok",
      kubernetes: {
        status: "ok",
        serverVersion: "v1.30.0",
      },
      metrics: {
        status: "ok",
      },
    });
  });

  it("reports unavailable Kubernetes and skips metrics when Kubernetes cannot be reached", async () => {
    app = createApp({
      kubernetesHealthChecker: new DefaultKubernetesHealthChecker({
        async getServerVersion() {
          throw new Error("network failure with sensitive internals");
        },
        async checkMetricsApi() {
          throw new Error("should not be called");
        },
      }),
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      kubernetes: {
        status: "unavailable",
        serverVersion: null,
        message: "Kubernetes API is unavailable",
      },
      metrics: {
        status: "unavailable",
        message:
          "metrics-server check skipped because Kubernetes API is unavailable",
      },
    });
  });

  it("reports degraded metrics independently from healthy Kubernetes", async () => {
    app = createApp({
      kubernetesHealthChecker: new DefaultKubernetesHealthChecker({
        async getServerVersion() {
          return "v1.30.0";
        },
        async checkMetricsApi() {
          throw new Error("metrics API unavailable");
        },
      }),
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: "ok",
      kubernetes: {
        status: "ok",
        serverVersion: "v1.30.0",
      },
      metrics: {
        status: "degraded",
        message: "metrics.k8s.io is unavailable",
      },
    });
  });

  it("does not call the metrics probe when the Kubernetes probe fails", async () => {
    let metricsCalls = 0;
    const probe: KubernetesHealthProbe = {
      async getServerVersion() {
        throw new Error("unreachable");
      },
      async checkMetricsApi() {
        metricsCalls += 1;
      },
    };

    app = createApp({
      kubernetesHealthChecker: new DefaultKubernetesHealthChecker(probe),
    });

    await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(metricsCalls).toBe(0);
  });
});
