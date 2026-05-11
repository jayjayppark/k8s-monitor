import { describe, expect, it } from "vitest";

import {
  KubernetesClientResourceReader,
  KubernetesResourceBadRequestError,
  KubernetesResourceNotFoundError,
} from "../src/kubernetes-resources.js";

function createClients(coreOverrides: Record<string, unknown> = {}) {
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
      async readNamespacedPod({
        name,
        namespace,
      }: {
        name: string;
        namespace: string;
      }) {
        return {
          metadata: {
            name,
            namespace,
          },
          spec: {
            containers: [
              {
                name: "app",
              },
            ],
          },
        };
      },
      async readNamespacedPodLog({
        container,
        previous,
        tailLines,
      }: {
        container: string;
        previous: boolean;
        tailLines: number;
      }) {
        return `container=${container} previous=${previous} tail=${tailLines}`;
      },
      ...coreOverrides,
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

  it("reads bounded pod logs for the resolved single container", async () => {
    const reader = new KubernetesClientResourceReader(createClients());

    await expect(
      reader.getPodLogs({
        namespace: "default",
        name: "web-abc",
        previous: true,
        tailLines: 100,
      }),
    ).resolves.toEqual({
      kind: "PodLog",
      namespace: "default",
      name: "web-abc",
      container: "app",
      previous: true,
      tailLines: 100,
      logs: "container=app previous=true tail=100",
    });
  });

  it("requires a container selection for multi-container pod logs", async () => {
    const reader = new KubernetesClientResourceReader(
      createClients({
        async readNamespacedPod() {
          return {
            spec: {
              containers: [{ name: "app" }, { name: "sidecar" }],
            },
          };
        },
      }),
    );

    await expect(
      reader.getPodLogs({
        namespace: "default",
        name: "web-abc",
        previous: false,
        tailLines: 100,
      }),
    ).rejects.toThrow(KubernetesResourceBadRequestError);
  });

  it("maps missing previous pod logs to a not-found resource error", async () => {
    const reader = new KubernetesClientResourceReader(
      createClients({
        async readNamespacedPodLog() {
          throw { code: 400 };
        },
      }),
    );

    await expect(
      reader.getPodLogs({
        namespace: "default",
        name: "web-abc",
        container: "app",
        previous: true,
        tailLines: 100,
      }),
    ).rejects.toThrow(KubernetesResourceNotFoundError);
  });
});
