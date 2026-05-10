import { describe, expect, it } from "vitest";

import type { ApiEnvelope, ClusterSummaryDto } from "../src/index.ts";

describe("shared API contracts", () => {
  it("types cluster summary envelopes used by frontend and backend", () => {
    const response = {
      data: {
        nodes: {
          total: 1,
          ready: 1,
          notReady: 0,
        },
        namespaces: {
          total: 4,
        },
        pods: {
          total: 3,
          running: 2,
          pending: 1,
          failed: 0,
          succeeded: 0,
          unknown: 0,
        },
        workloads: {
          deployments: 1,
          statefulSets: 0,
          daemonSets: 1,
          replicaSets: 1,
        },
        events: {
          recentWarnings: 1,
        },
        alerts: {
          active: 1,
          critical: 0,
          warning: 1,
        },
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
        ],
      },
    } satisfies ApiEnvelope<ClusterSummaryDto>;

    expect(response.data.pods.pending).toBe(1);
  });
});
