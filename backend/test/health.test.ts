import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("GET /api/health", () => {
  it("returns process health with placeholder Kubernetes and metrics status", async () => {
    app = createApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(response.json()).toEqual({
      status: "ok",
      kubernetes: {
        status: "degraded",
        serverVersion: null,
        message: "Kubernetes client wiring is pending",
      },
      metrics: {
        status: "degraded",
        message: "metrics-server check is pending",
      },
    });
  });
});
