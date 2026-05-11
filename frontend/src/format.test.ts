import { describe, expect, it } from "vitest";

import {
  formatAge,
  formatLabels,
  formatQuantity,
  formatResourcePair,
  formatResourceUsage,
  getDegradedSources,
} from "./format.ts";

describe("frontend formatting helpers", () => {
  it("formats ages into compact units", () => {
    expect(formatAge(null)).toBe("unknown");
    expect(formatAge(45)).toBe("45s");
    expect(formatAge(180)).toBe("3m");
    expect(formatAge(7200)).toBe("2h");
    expect(formatAge(172800)).toBe("2d");
  });

  it("filters degraded API sources", () => {
    expect(
      getDegradedSources([
        {
          name: "kubernetes",
          status: "ok",
        },
        {
          name: "metrics-server",
          status: "degraded",
          message: "metrics.k8s.io is unavailable",
        },
      ]),
    ).toEqual([
      {
        name: "metrics-server",
        status: "degraded",
        message: "metrics.k8s.io is unavailable",
      },
    ]);
  });

  it("formats resource quantities and label summaries", () => {
    expect(
      formatResourcePair({
        cpu: {
          raw: "250m",
          value: 250,
          unit: "millicores",
        },
        memory: {
          raw: "128Mi",
          value: 134217728,
          unit: "bytes",
        },
      }),
    ).toBe("CPU 0.25 cores (250m) / Mem 128 MiB");
    expect(formatQuantity(null)).toBe("unavailable");
    expect(formatLabels({ app: "web", tier: "frontend" })).toBe(
      "app=web, tier=frontend",
    );
    expect(formatLabels({})).toBe("-");
  });

  it("formats resource usage against an operational baseline", () => {
    expect(
      formatResourceUsage(
        { raw: "250m", value: 250, unit: "millicores" },
        { raw: "1", value: 1000, unit: "millicores" },
        "cpu",
        "request",
      ),
    ).toBe("0.25 cores / 1.0 cores request (25%)");
  });
});
