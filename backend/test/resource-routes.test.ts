import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import type { KubernetesHealthChecker } from "../src/kubernetes-health.js";
import {
  KubernetesResourceNotFoundError,
  type KubernetesResourceReader,
  type KubernetesResourceSnapshot,
  type NodeListOptions,
  type PodLogReadOptions,
  type WorkloadListOptions,
} from "../src/kubernetes-resources.js";
import type { EventListOptions } from "../src/kubernetes-normalizers.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

const healthChecker: KubernetesHealthChecker = {
  async check() {
    return {
      kubernetes: {
        status: "ok",
        serverVersion: "v1.30.0",
      },
      metrics: {
        status: "degraded",
        message: "metrics.k8s.io is unavailable",
      },
    };
  },
};

const snapshot: KubernetesResourceSnapshot = {
  nodes: [
    {
      name: "worker-1",
      status: "Ready",
      roles: ["worker"],
      kubeletVersion: "v1.30.0",
      internalIP: "10.0.1.10",
      allocatable: {
        cpu: null,
        memory: null,
      },
      usage: {
        cpu: null,
        memory: null,
      },
      ageSeconds: 60,
    },
    {
      name: "worker-2",
      status: "NotReady",
      roles: ["worker"],
      kubeletVersion: "v1.30.0",
      internalIP: "10.0.1.11",
      allocatable: {
        cpu: null,
        memory: null,
      },
      usage: {
        cpu: null,
        memory: null,
      },
      ageSeconds: 120,
    },
  ],
  namespaces: [
    {
      name: "default",
      status: "Active",
      ageSeconds: 60,
      counts: {
        pods: 2,
        services: 1,
        deployments: 1,
      },
    },
  ],
  workloads: [
    {
      kind: "Pod",
      namespace: "default",
      name: "web",
      status: "Running",
      ready: "1/1",
      restarts: 0,
      labels: {
        app: "web",
      },
      owner: "ReplicaSet/web-abc",
      ageSeconds: 60,
    },
    {
      kind: "Pod",
      namespace: "default",
      name: "crashy",
      status: "Failed",
      ready: "0/1",
      restarts: 7,
      labels: {
        app: "crashy",
      },
      owner: null,
      ageSeconds: 60,
    },
    {
      kind: "Deployment",
      namespace: "default",
      name: "web",
      status: "Available",
      ready: "1/1",
      restarts: null,
      labels: {
        app: "web",
      },
      owner: null,
      ageSeconds: 60,
    },
    {
      kind: "ReplicaSet",
      namespace: "default",
      name: "web-abc",
      status: "Ready",
      ready: "1/1",
      restarts: null,
      labels: {
        app: "web",
      },
      owner: "Deployment/web",
      ageSeconds: 60,
    },
  ],
  events: [
    {
      namespace: "default",
      type: "Warning",
      reason: "BackOff",
      message: "Back-off restarting failed container",
      involvedObject: {
        kind: "Pod",
        namespace: "default",
        name: "crashy",
        uid: "pod-uid",
      },
      count: 3,
      lastTimestamp: "2026-05-06T00:00:00.000Z",
    },
  ],
};

function createReader(
  overrides: Partial<KubernetesResourceReader> = {},
): KubernetesResourceReader {
  return {
    async getSnapshot() {
      return snapshot;
    },
    async listNodes(options: NodeListOptions = {}) {
      return snapshot.nodes.filter(
        (node) =>
          (!options.status ||
            (options.status === "ready"
              ? node.status === "Ready"
              : node.status === "NotReady")) &&
          (!options.search || node.name.includes(options.search)),
      );
    },
    async listNamespaces() {
      return snapshot.namespaces;
    },
    async listWorkloads(options: WorkloadListOptions = {}) {
      return snapshot.workloads.filter(
        (item) =>
          (!options.namespace || item.namespace === options.namespace) &&
          (!options.kind || item.kind === options.kind) &&
          (!options.status || item.status === options.status) &&
          (!options.search || item.name.includes(options.search)),
      );
    },
    async listEvents(options: EventListOptions = {}) {
      return snapshot.events.filter(
        (event) =>
          (!options.namespace || event.namespace === options.namespace) &&
          (!options.type || event.type === options.type) &&
          (!options.involvedKind ||
            event.involvedObject.kind === options.involvedKind),
      );
    },
    async getPod(namespace: string, name: string) {
      if (namespace !== "default" || name !== "web") {
        return null;
      }

      return {
        kind: "Pod",
        namespace,
        name,
        status: "Running",
        nodeName: "worker-1",
        podIP: "10.244.0.5",
        ready: "1/1",
        restarts: 0,
        containers: [],
        events: [],
      };
    },
    async getPodLogs(options: PodLogReadOptions) {
      if (options.namespace !== "default" || options.name !== "web") {
        return null;
      }

      return {
        kind: "PodLog",
        namespace: options.namespace,
        name: options.name,
        container: options.container ?? "app",
        previous: options.previous,
        tailLines: options.tailLines,
        logs: "started\nready\n",
      };
    },
    ...overrides,
  };
}

function createTestApp(reader = createReader()): FastifyInstance {
  return createApp({
    kubernetesHealthChecker: healthChecker,
    kubernetesResourceReader: reader,
    slackAlertNotifier: null,
  });
}

describe("resource API routes", () => {
  it("returns cluster summary with envelope metadata and alert counts", async () => {
    app = createTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/cluster/summary",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        nodes: {
          total: 2,
          ready: 1,
          notReady: 1,
        },
        namespaces: {
          total: 1,
        },
        pods: {
          total: 2,
          running: 1,
          failed: 1,
        },
        workloads: {
          deployments: 1,
          replicaSets: 1,
        },
        events: {
          recentWarnings: 1,
        },
        alerts: {
          active: 5,
          critical: 2,
          warning: 3,
        },
      },
      meta: {
        cluster: {
          name: "current",
          serverVersion: "v1.30.0",
        },
        sources: [
          {
            name: "kubernetes",
            status: "ok",
          },
          {
            name: "metrics-server",
            status: "degraded",
            message: "metrics.k8s.io is unavailable",
          },
        ],
      },
    });
    expect(response.json().meta.generatedAt).toEqual(expect.any(String));
  });

  it("returns filtered node, workload, event, and pod detail responses", async () => {
    app = createTestApp();

    const [nodes, workloads, events, pod] = await Promise.all([
      app.inject({
        method: "GET",
        url: "/api/nodes?status=notReady&search=worker",
      }),
      app.inject({
        method: "GET",
        url: "/api/workloads?kind=Deployment&namespace=default&search=web",
      }),
      app.inject({
        method: "GET",
        url: "/api/events?type=Warning&involvedKind=Pod&limit=10",
      }),
      app.inject({
        method: "GET",
        url: "/api/pods/default/web",
      }),
    ]);

    expect(nodes.statusCode).toBe(200);
    expect(nodes.json().data.items).toEqual([
      expect.objectContaining({
        name: "worker-2",
        status: "NotReady",
      }),
    ]);
    expect(workloads.statusCode).toBe(200);
    expect(workloads.json().data.items).toEqual([
      expect.objectContaining({
        kind: "Deployment",
        name: "web",
      }),
    ]);
    expect(events.statusCode).toBe(200);
    expect(events.json().data.items).toEqual([
      expect.objectContaining({
        reason: "BackOff",
      }),
    ]);
    expect(pod.statusCode).toBe(200);
    expect(pod.json().data).toMatchObject({
      kind: "Pod",
      namespace: "default",
      name: "web",
    });
  });

  it("returns pod logs with selected container and bounded tail lines", async () => {
    app = createTestApp();

    const response = await app.inject({
      method: "GET",
      url: "/api/pods/default/web/logs?container=app&tailLines=500&previous=true",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      kind: "PodLog",
      namespace: "default",
      name: "web",
      container: "app",
      previous: true,
      tailLines: 500,
      logs: "started\nready\n",
    });
  });

  it("runs supported read-only kubectl commands through the API", async () => {
    app = createTestApp();

    const [getPods, describePod, logs] = await Promise.all([
      app.inject({
        method: "POST",
        url: "/api/kubectl",
        payload: {
          command: "kubectl get pods -A",
        },
      }),
      app.inject({
        method: "POST",
        url: "/api/kubectl",
        payload: {
          command: "kubectl describe pod web -n default",
        },
      }),
      app.inject({
        method: "POST",
        url: "/api/kubectl",
        payload: {
          command: "kubectl logs web -n default -c app --tail=100",
        },
      }),
    ]);

    expect(getPods.statusCode).toBe(200);
    expect(getPods.json().data.output).toContain("NAMESPACE");
    expect(getPods.json().data.output).toMatch(/default\s+web\s+Running/);
    expect(describePod.statusCode).toBe(200);
    expect(describePod.json().data.output).toContain("Name: web");
    expect(logs.statusCode).toBe(200);
    expect(logs.json().data).toMatchObject({
      command: "kubectl logs web -n default -c app --tail=100",
      exitCode: 0,
      output: "started\nready\n",
    });
  });

  it("rejects unsupported kubectl mutation commands", async () => {
    app = createTestApp();

    const response = await app.inject({
      method: "POST",
      url: "/api/kubectl",
      payload: {
        command: "kubectl delete pod web -n default",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: "BAD_REQUEST",
        message: "delete is not supported by the read-only kubectl console",
      },
    });
  });

  it("maps unavailable previous pod logs to 404", async () => {
    app = createTestApp(
      createReader({
        async getPodLogs() {
          throw new KubernetesResourceNotFoundError("Pod logs not found");
        },
      }),
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/pods/default/web/logs?container=app&previous=true",
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Pod logs not found",
        details: {},
      },
    });
  });

  it("returns namespaces and active alerts", async () => {
    app = createTestApp();

    const [namespaces, alerts] = await Promise.all([
      app.inject({
        method: "GET",
        url: "/api/namespaces",
      }),
      app.inject({
        method: "GET",
        url: "/api/alerts?severity=critical&status=active",
      }),
    ]);

    expect(namespaces.statusCode).toBe(200);
    expect(namespaces.json().data.items).toEqual([
      expect.objectContaining({
        name: "default",
        counts: {
          pods: 2,
          services: 1,
          deployments: 1,
        },
      }),
    ]);
    expect(alerts.statusCode).toBe(200);
    expect(alerts.json().data.items).toEqual([
      expect.objectContaining({
        id: "node/worker-2/not-ready",
        severity: "critical",
      }),
      expect.objectContaining({
        id: "pod/default/crashy/failed",
        severity: "critical",
      }),
    ]);
  });

  it("keeps alert APIs successful when Slack delivery fails", async () => {
    app = createApp({
      kubernetesHealthChecker: healthChecker,
      kubernetesResourceReader: createReader(),
      logger: false,
      slackAlertNotifier: {
        async notify() {
          throw new Error("network failure");
        },
      },
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/alerts",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.items.length).toBeGreaterThan(0);
  });

  it("validates query parameters and maps missing pods to 404", async () => {
    app = createTestApp();

    const [badNodes, badWorkloads, badEvents, badLogs, missingPod] =
      await Promise.all([
        app.inject({
          method: "GET",
          url: "/api/nodes?status=broken",
        }),
        app.inject({
          method: "GET",
          url: "/api/workloads?kind=Secret",
        }),
        app.inject({
          method: "GET",
          url: "/api/events?limit=999",
        }),
        app.inject({
          method: "GET",
          url: "/api/pods/default/web/logs?tailLines=999",
        }),
        app.inject({
          method: "GET",
          url: "/api/pods/default/missing",
        }),
      ]);

    expect(badNodes.statusCode).toBe(400);
    expect(badWorkloads.statusCode).toBe(400);
    expect(badEvents.statusCode).toBe(400);
    expect(badLogs.statusCode).toBe(400);
    expect(missingPod.statusCode).toBe(404);
  });

  it("maps Kubernetes resource reader failures to 503", async () => {
    app = createTestApp(
      createReader({
        async listNamespaces() {
          throw new Error("connection refused with implementation detail");
        },
      }),
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/namespaces",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: {
        code: "KUBERNETES_UNAVAILABLE",
        message: "Unable to reach Kubernetes API",
        details: {},
      },
    });
  });

  it("maps Kubernetes pod log reader failures to 503", async () => {
    app = createTestApp(
      createReader({
        async getPodLogs() {
          throw new Error("log api timeout with implementation detail");
        },
      }),
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/pods/default/web/logs?container=app",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: {
        code: "KUBERNETES_UNAVAILABLE",
        message: "Unable to reach Kubernetes API",
        details: {},
      },
    });
  });
});
