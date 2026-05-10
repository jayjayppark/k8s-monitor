import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const backendSources = [
  "../src/app.ts",
  "../src/kubernetes-client.ts",
  "../src/kubernetes-health.ts",
  "../src/kubernetes-normalizers.ts",
  "../src/kubernetes-resources.ts",
].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

describe("MVP Kubernetes read-only boundary", () => {
  it("does not call Kubernetes mutation APIs from the backend source", () => {
    const source = backendSources.join("\n");
    const forbiddenClientCalls =
      /\.(?:create|replace|patch|delete)(?:Namespaced|Cluster|Collection)[A-Za-z0-9_]*\s*\(/g;

    expect(source.match(forbiddenClientCalls) ?? []).toEqual([]);
  });

  it("does not read Kubernetes Secret resources or expose raw credential APIs", () => {
    const source = backendSources.join("\n");

    expect(source).not.toMatch(
      /\.(?:read|list)(?:Namespaced|Cluster)?Secret[A-Za-z0-9_]*\s*\(/,
    );
    expect(source).not.toContain("readNamespacedSecret");
    expect(source).not.toContain("listSecretForAllNamespaces");
  });
});
