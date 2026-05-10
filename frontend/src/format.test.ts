import { describe, expect, it } from "vitest";

import { formatAge, getDegradedSources } from "./format.ts";

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
});
