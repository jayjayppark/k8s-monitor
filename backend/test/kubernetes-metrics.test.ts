import type { CoreV1Event, V1Node, V1Pod } from "@kubernetes/client-node";
import { describe, expect, it } from "vitest";

import { KubernetesClientResourceReader } from "../src/kubernetes-resources.js";

const createdAt = new Date("2026-05-06T00:00:00Z");

function createClients(customObjects: {
  listClusterCustomObject?: (params: { plural: string }) => Promise<unknown>;
  listCustomObjectForAllNamespaces?: (params: {
    plural: string;
  }) => Promise<unknown>;
  getNamespacedCustomObject?: (params: {
    namespace: string;
    name: string;
  }) => Promise<unknown>;
}) {
  const node: V1Node = {
    metadata: {
      name: "worker-1",
      creationTimestamp: createdAt,
    },
    status: {
      conditions: [
        {
          type: "Ready",
          status: "True",
        },
      ],
    },
  };
  const pod: V1Pod = {
    metadata: {
      namespace: "default",
      name: "web",
      creationTimestamp: createdAt,
    },
    spec: {
      containers: [
        {
          name: "web",
          image: "example/web:1.0.0",
        },
      ],
    },
    status: {
      phase: "Running",
      containerStatuses: [
        {
          name: "web",
          image: "example/web:1.0.0",
          imageID: "image-a",
          ready: true,
          restartCount: 0,
        },
      ],
    },
  };
  const event: CoreV1Event = {
    metadata: {
      namespace: "default",
      name: "web.123",
    },
    involvedObject: {
      kind: "Pod",
      namespace: "default",
      name: "web",
    },
    type: "Normal",
    reason: "Scheduled",
    message: "Successfully assigned default/web",
    count: 1,
    lastTimestamp: createdAt,
  };

  return {
    core: {
      async listNode() {
        return { items: [node] };
      },
      async listNamespace() {
        return { items: [] };
      },
      async listPodForAllNamespaces() {
        return { items: [pod] };
      },
      async listServiceForAllNamespaces() {
        return { items: [] };
      },
      async listEventForAllNamespaces() {
        return { items: [event] };
      },
      async readNamespacedPod() {
        return pod;
      },
      async listNamespacedEvent() {
        return { items: [event] };
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
    customObjects,
  } as never;
}

describe("Kubernetes metrics merge", () => {
  it("merges node and pod container metrics when metrics-server returns data", async () => {
    const reader = new KubernetesClientResourceReader(
      createClients({
        async listClusterCustomObject(params) {
          expect(params.plural).toBe("nodes");

          return {
            items: [
              {
                metadata: {
                  name: "worker-1",
                },
                usage: {
                  cpu: "250m",
                  memory: "512Mi",
                },
              },
            ],
          };
        },
        async listCustomObjectForAllNamespaces(params) {
          expect(params.plural).toBe("pods");
          return {
            items: [
              {
                metadata: {
                  namespace: "default",
                  name: "web",
                },
                containers: [
                  {
                    name: "web",
                    usage: {
                      cpu: "125m",
                      memory: "64Mi",
                    },
                  },
                ],
              },
            ],
          };
        },
        async getNamespacedCustomObject() {
          return {
            metadata: {
              namespace: "default",
              name: "web",
            },
            containers: [
              {
                name: "web",
                usage: {
                  cpu: "125m",
                  memory: "64Mi",
                },
              },
            ],
          };
        },
      }),
    );

    const [snapshot, pod] = await Promise.all([
      reader.getSnapshot(),
      reader.getPod("default", "web"),
    ]);

    expect(snapshot.nodes[0]?.usage).toEqual({
      cpu: {
        raw: "250m",
        value: 250,
        unit: "millicores",
      },
      memory: {
        raw: "512Mi",
        value: 536870912,
        unit: "bytes",
      },
    });
    expect(pod?.containers[0]?.usage).toEqual({
      cpu: {
        raw: "125m",
        value: 125,
        unit: "millicores",
      },
      memory: {
        raw: "64Mi",
        value: 67108864,
        unit: "bytes",
      },
    });
  });

  it("keeps usage null when metrics-server is unavailable or partial", async () => {
    const reader = new KubernetesClientResourceReader(
      createClients({
        async listClusterCustomObject() {
          throw new Error("metrics unavailable");
        },
        async listCustomObjectForAllNamespaces() {
          throw new Error("metrics unavailable");
        },
        async getNamespacedCustomObject() {
          return {
            metadata: {
              namespace: "default",
              name: "web",
            },
            containers: [],
          };
        },
      }),
    );

    const [snapshot, pod] = await Promise.all([
      reader.getSnapshot(),
      reader.getPod("default", "web"),
    ]);

    expect(snapshot.nodes[0]?.usage).toEqual({
      cpu: null,
      memory: null,
    });
    expect(pod?.containers[0]?.usage).toEqual({
      cpu: null,
      memory: null,
    });
  });
});
