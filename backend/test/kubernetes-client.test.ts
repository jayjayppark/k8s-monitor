import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  KubernetesConfigError,
  loadKubeConfig,
  resolveKubernetesRuntimeConfig,
} from "../src/kubernetes-client.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

async function writeKubeconfig(contents: string): Promise<string> {
  tempDir = await mkdtemp(join(tmpdir(), "k8s-monitor-"));
  const path = join(tempDir, "config.yaml");
  await writeFile(path, contents);
  return path;
}

describe("Kubernetes config loading", () => {
  it("prefers explicit in-cluster mode over KUBECONFIG", () => {
    expect(
      resolveKubernetesRuntimeConfig({
        KUBERNETES_AUTH_MODE: "in-cluster",
        KUBECONFIG: "/tmp/ignored",
      }),
    ).toEqual({
      mode: "in-cluster",
      context: undefined,
    });
  });

  it("uses KUBECONFIG with an optional context for local mode", () => {
    expect(
      resolveKubernetesRuntimeConfig({
        KUBECONFIG: "/home/ubuntu/.kube/config",
        KUBERNETES_CONTEXT: "dev",
      }),
    ).toEqual({
      mode: "kubeconfig",
      kubeconfigPath: "/home/ubuntu/.kube/config",
      context: "dev",
    });
  });

  it("requires KUBECONFIG when kubeconfig mode is explicit", () => {
    expect(() =>
      resolveKubernetesRuntimeConfig({
        KUBERNETES_AUTH_MODE: "kubeconfig",
      }),
    ).toThrow(
      new KubernetesConfigError(
        "KUBECONFIG is required when KUBERNETES_AUTH_MODE=kubeconfig",
      ),
    );
  });

  it("rejects unknown auth modes with a controlled error", () => {
    expect(() =>
      resolveKubernetesRuntimeConfig({
        KUBERNETES_AUTH_MODE: "token",
      }),
    ).toThrow(
      new KubernetesConfigError(
        "KUBERNETES_AUTH_MODE must be one of default, kubeconfig, or in-cluster",
      ),
    );
  });

  it("loads a kubeconfig file without exposing credential material", async () => {
    const kubeconfigPath = await writeKubeconfig(`
apiVersion: v1
kind: Config
clusters:
  - name: local
    cluster:
      server: https://127.0.0.1:6443
users:
  - name: local-user
    user:
      token: secret-token-that-must-not-appear
contexts:
  - name: local-context
    context:
      cluster: local
      user: local-user
current-context: local-context
`);

    const kubeConfig = loadKubeConfig({
      mode: "kubeconfig",
      kubeconfigPath,
    });

    expect(kubeConfig.getCurrentContext()).toBe("local-context");
    expect(kubeConfig.getCurrentCluster()?.server).toBe(
      "https://127.0.0.1:6443",
    );
  });

  it("returns a controlled error for an invalid kubeconfig path", () => {
    expect(() =>
      loadKubeConfig({
        mode: "kubeconfig",
        kubeconfigPath: "/tmp/does-not-exist/kubeconfig.yaml",
      }),
    ).toThrow(
      new KubernetesConfigError("Unable to load Kubernetes configuration"),
    );
  });
});
