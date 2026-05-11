import { describe, expect, it } from "vitest";

import { KubernetesClientResourceReader } from "../src/kubernetes-resources.js";

function createClients() {
  return {
    core: {
      async listNode() {
        return { items: [] };
      },
      async listNamespace() {
        return { items: [] };
      },
      async listPodForAllNamespaces() {
        return {
          items: [
            {
              metadata: {
                name: "web-abc",
                namespace: "default",
                creationTimestamp: new Date(),
              },
              status: {
                phase: "Running",
                containerStatuses: [
                  {
                    name: "app",
                    ready: true,
                    restartCount: 0,
                  },
                ],
              },
              spec: {
                containers: [
                  {
                    name: "app",
                  },
                ],
              },
            },
          ],
        };
      },
      async listServiceForAllNamespaces() {
        return { items: [] };
      },
      async listEventForAllNamespaces() {
        return { items: [] };
      },
    },
    apps: {
      async listDeploymentForAllNamespaces() {
        return { items: [] };
      },
      async listReplicaSetForAllNamespaces() {
        return { items: [] };
      },
      async listStatefulSetForAllNamespaces() {
        return { items: [] };
      },
      async listDaemonSetForAllNamespaces() {
        return { items: [] };
      },
    },
    customObjects: {
      async listClusterCustomObject() {
        return { items: [] };
      },
      async listCustomObjectForAllNamespaces() {
        return { items: [] };
      },
    },
  } as unknown as ConstructorParameters<
    typeof KubernetesClientResourceReader
  >[0];
}

describe("KubernetesClientResourceReader", () => {
  it("filters workload namespace and status by case-insensitive partial text", async () => {
    const reader = new KubernetesClientResourceReader(createClients());

    await expect(
      reader.listWorkloads({
        namespace: "defa",
        status: "running",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        kind: "Pod",
        namespace: "default",
        name: "web-abc",
        status: "Running",
      }),
    ]);
  });
});
