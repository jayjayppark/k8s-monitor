import type {
  CoreV1Event,
  V1ContainerStatus,
  V1DaemonSet,
  V1Deployment,
  V1Namespace,
  V1Node,
  V1Pod,
  V1ReplicaSet,
  V1Service,
  V1StatefulSet,
} from "@kubernetes/client-node";
import { describe, expect, it } from "vitest";

import {
  MAX_EVENT_LIMIT,
  normalizeCpuQuantity,
  normalizeDaemonSetWorkloadItem,
  normalizeDeploymentWorkloadItem,
  normalizeEvent,
  normalizeEventList,
  normalizeMemoryQuantity,
  normalizeNamespace,
  normalizeNode,
  normalizePodDetail,
  normalizePodWorkloadItem,
  normalizeReplicaSetWorkloadItem,
  normalizeServiceWorkloadItem,
  normalizeStatefulSetWorkloadItem,
} from "../src/kubernetes-normalizers.js";

const NOW = new Date("2026-05-06T00:00:00Z");

describe("quantity normalization", () => {
  it("normalizes CPU cores, millicores, and missing values", () => {
    expect(normalizeCpuQuantity("4")).toEqual({
      raw: "4",
      value: 4000,
      unit: "millicores",
    });
    expect(normalizeCpuQuantity("250m")).toEqual({
      raw: "250m",
      value: 250,
      unit: "millicores",
    });
    expect(normalizeCpuQuantity(undefined)).toBeNull();
  });

  it("normalizes binary memory quantities and missing values", () => {
    expect(normalizeMemoryQuantity("512Ki")).toEqual({
      raw: "512Ki",
      value: 524288,
      unit: "bytes",
    });
    expect(normalizeMemoryQuantity("128Mi")).toEqual({
      raw: "128Mi",
      value: 134217728,
      unit: "bytes",
    });
    expect(normalizeMemoryQuantity("2Gi")).toEqual({
      raw: "2Gi",
      value: 2147483648,
      unit: "bytes",
    });
    expect(normalizeMemoryQuantity(undefined)).toBeNull();
  });
});

describe("namespace and node normalization", () => {
  it("maps namespaces to the API contract shape", () => {
    const namespace: V1Namespace = {
      metadata: {
        name: "default",
        creationTimestamp: new Date("2026-05-05T23:00:00Z"),
      },
      status: {
        phase: "Active",
      },
    };

    expect(
      normalizeNamespace(
        namespace,
        {
          pods: 8,
          services: 2,
          deployments: 3,
        },
        NOW,
      ),
    ).toEqual({
      name: "default",
      status: "Active",
      ageSeconds: 3600,
      counts: {
        pods: 8,
        services: 2,
        deployments: 3,
      },
    });
  });

  it("maps nodes with readiness, roles, addresses, and allocatable resources", () => {
    const node: V1Node = {
      metadata: {
        name: "worker-1",
        labels: {
          "node-role.kubernetes.io/worker": "",
          "kubernetes.io/role": "infra",
        },
        creationTimestamp: new Date("2026-05-05T00:00:00Z"),
      },
      status: {
        conditions: [
          {
            type: "Ready",
            status: "True",
          },
        ],
        addresses: [
          {
            type: "Hostname",
            address: "worker-1.local",
          },
          {
            type: "InternalIP",
            address: "10.0.1.10",
          },
        ],
        nodeInfo: {
          architecture: "amd64",
          bootID: "boot",
          containerRuntimeVersion: "containerd://1.7.0",
          kernelVersion: "6.1.0",
          kubeProxyVersion: "v1.30.0",
          kubeletVersion: "v1.30.0",
          machineID: "machine",
          operatingSystem: "linux",
          osImage: "Ubuntu",
          systemUUID: "uuid",
        },
        allocatable: {
          cpu: "4",
          memory: "16Gi",
        },
      },
    };

    expect(normalizeNode(node, NOW)).toEqual({
      name: "worker-1",
      status: "Ready",
      roles: ["infra", "worker"],
      kubeletVersion: "v1.30.0",
      internalIP: "10.0.1.10",
      allocatable: {
        cpu: {
          raw: "4",
          value: 4000,
          unit: "millicores",
        },
        memory: {
          raw: "16Gi",
          value: 17179869184,
          unit: "bytes",
        },
      },
      usage: {
        cpu: null,
        memory: null,
      },
      ageSeconds: 86400,
    });
  });

  it("treats missing or false Ready condition as NotReady", () => {
    const node: V1Node = {
      metadata: {
        name: "control-plane",
        labels: {
          "node-role.kubernetes.io/control-plane": "",
        },
      },
      status: {
        conditions: [
          {
            type: "Ready",
            status: "False",
          },
        ],
      },
    };

    expect(normalizeNode(node, NOW)).toMatchObject({
      name: "control-plane",
      status: "NotReady",
      roles: ["control-plane"],
    });
  });
});

describe("pod normalization", () => {
  it("maps a running pod to a workload list item", () => {
    const pod: V1Pod = {
      metadata: {
        namespace: "default",
        name: "web-abc123",
        labels: {
          app: "web",
        },
        ownerReferences: [
          {
            apiVersion: "apps/v1",
            kind: "ReplicaSet",
            name: "web-abc",
            uid: "owner-uid",
          },
        ],
        creationTimestamp: new Date("2026-05-05T23:30:00Z"),
      },
      spec: {
        containers: [
          {
            name: "web",
            image: "example/web:1.0.0",
          },
          {
            name: "sidecar",
            image: "example/sidecar:1.0.0",
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
            restartCount: 1,
          },
          {
            name: "sidecar",
            image: "example/sidecar:1.0.0",
            imageID: "image-b",
            ready: false,
            restartCount: 2,
          },
        ],
      },
    };

    expect(normalizePodWorkloadItem(pod, NOW)).toEqual({
      kind: "Pod",
      namespace: "default",
      name: "web-abc123",
      status: "Running",
      ready: "1/2",
      restarts: 3,
      labels: {
        app: "web",
      },
      owner: "ReplicaSet/web-abc",
      ageSeconds: 1800,
    });
  });

  it("maps pod detail containers without exposing sensitive pod spec fields", () => {
    const pod: V1Pod = {
      metadata: {
        namespace: "default",
        name: "web-abc123",
      },
      spec: {
        nodeName: "worker-1",
        containers: [
          {
            name: "web",
            image: "example/web:1.0.0",
            env: [
              {
                name: "TOKEN",
                valueFrom: {
                  secretKeyRef: {
                    name: "app-token",
                    key: "token",
                  },
                },
              },
            ],
            resources: {
              requests: {
                cpu: "100m",
                memory: "128Mi",
              },
              limits: {
                cpu: "1",
                memory: "512Mi",
              },
            },
          },
        ],
      },
      status: {
        phase: "Running",
        podIP: "10.244.1.5",
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

    const detail = normalizePodDetail(pod, [
      {
        type: "Warning",
        reason: "BackOff",
        message: "Back-off restarting failed container",
        count: 3,
        lastTimestamp: "2026-05-06T00:00:00Z",
      },
    ]);

    expect(detail).toEqual({
      kind: "Pod",
      namespace: "default",
      name: "web-abc123",
      status: "Running",
      nodeName: "worker-1",
      podIP: "10.244.1.5",
      ready: "1/1",
      restarts: 0,
      containers: [
        {
          name: "web",
          ready: true,
          restartCount: 0,
          image: "example/web:1.0.0",
          resources: {
            requests: {
              cpu: {
                raw: "100m",
                value: 100,
                unit: "millicores",
              },
              memory: {
                raw: "128Mi",
                value: 134217728,
                unit: "bytes",
              },
            },
            limits: {
              cpu: {
                raw: "1",
                value: 1000,
                unit: "millicores",
              },
              memory: {
                raw: "512Mi",
                value: 536870912,
                unit: "bytes",
              },
            },
          },
          usage: {
            cpu: null,
            memory: null,
          },
        },
      ],
      events: [
        {
          type: "Warning",
          reason: "BackOff",
          message: "Back-off restarting failed container",
          count: 3,
          lastTimestamp: "2026-05-06T00:00:00Z",
        },
      ],
    });
    expect(JSON.stringify(detail)).not.toContain("TOKEN");
    expect(JSON.stringify(detail)).not.toContain("app-token");
    expect(JSON.stringify(detail)).not.toContain("secretKeyRef");
  });

  const podPhaseCases: Array<
    [string, V1ContainerStatus[] | undefined, string, number]
  > = [
    ["Pending", undefined, "0/1", 0],
    [
      "Failed",
      [
        {
          name: "job",
          image: "example/job:1.0.0",
          imageID: "image-job",
          ready: false,
          restartCount: 5,
        },
      ],
      "0/1",
      5,
    ],
  ];

  it.each(podPhaseCases)(
    "normalizes %s pod readiness and restarts deterministically",
    (phase, containerStatuses, ready, restarts) => {
      const pod: V1Pod = {
        metadata: {
          namespace: "jobs",
          name: `${phase.toLowerCase()}-pod`,
        },
        spec: {
          containers: [
            {
              name: "job",
              image: "example/job:1.0.0",
            },
          ],
        },
        status: {
          phase,
          containerStatuses,
        },
      };

      expect(normalizePodWorkloadItem(pod, NOW)).toMatchObject({
        namespace: "jobs",
        name: `${phase.toLowerCase()}-pod`,
        status: phase,
        ready,
        restarts,
      });
    },
  );
});

describe("apps workload normalization", () => {
  it("maps an available deployment to a ready workload item", () => {
    const deployment: V1Deployment = {
      metadata: {
        namespace: "default",
        name: "web",
        labels: {
          app: "web",
        },
        creationTimestamp: new Date("2026-05-05T23:00:00Z"),
      },
      spec: {
        replicas: 3,
        selector: {
          matchLabels: {
            app: "web",
          },
        },
        template: {
          metadata: {
            labels: {
              app: "web",
            },
          },
          spec: {
            containers: [
              {
                name: "web",
                image: "example/web:1.0.0",
              },
            ],
          },
        },
      },
      status: {
        replicas: 3,
        readyReplicas: 3,
        availableReplicas: 3,
        unavailableReplicas: 0,
      },
    };

    expect(normalizeDeploymentWorkloadItem(deployment, NOW)).toEqual({
      kind: "Deployment",
      namespace: "default",
      name: "web",
      status: "Available",
      ready: "3/3",
      restarts: null,
      labels: {
        app: "web",
      },
      owner: null,
      ageSeconds: 3600,
    });
  });

  it("maps a progressing deployment as degraded readiness", () => {
    const deployment: V1Deployment = {
      metadata: {
        namespace: "default",
        name: "api",
      },
      spec: {
        replicas: 2,
        selector: {
          matchLabels: {
            app: "api",
          },
        },
        template: {
          spec: {
            containers: [
              {
                name: "api",
                image: "example/api:1.0.0",
              },
            ],
          },
        },
      },
      status: {
        replicas: 2,
        readyReplicas: 1,
        availableReplicas: 1,
        unavailableReplicas: 1,
        conditions: [
          {
            type: "Progressing",
            status: "True",
          },
        ],
      },
    };

    expect(normalizeDeploymentWorkloadItem(deployment, NOW)).toMatchObject({
      kind: "Deployment",
      name: "api",
      status: "Progressing",
      ready: "1/2",
      restarts: null,
    });
  });

  it("maps replicasets with and without owner references", () => {
    const ownedReplicaSet: V1ReplicaSet = {
      metadata: {
        namespace: "default",
        name: "web-abc123",
        ownerReferences: [
          {
            apiVersion: "apps/v1",
            kind: "Deployment",
            name: "web",
            uid: "deployment-uid",
          },
        ],
      },
      spec: {
        replicas: 3,
        selector: {
          matchLabels: {
            app: "web",
          },
        },
      },
      status: {
        replicas: 3,
        readyReplicas: 3,
      },
    };
    const orphanReplicaSet: V1ReplicaSet = {
      metadata: {
        namespace: "jobs",
        name: "batch-orphan",
      },
      spec: {
        replicas: 1,
        selector: {},
      },
      status: {
        replicas: 1,
        readyReplicas: 0,
      },
    };

    expect(normalizeReplicaSetWorkloadItem(ownedReplicaSet, NOW)).toMatchObject(
      {
        kind: "ReplicaSet",
        namespace: "default",
        name: "web-abc123",
        status: "Ready",
        ready: "3/3",
        owner: "Deployment/web",
      },
    );
    expect(
      normalizeReplicaSetWorkloadItem(orphanReplicaSet, NOW),
    ).toMatchObject({
      kind: "ReplicaSet",
      namespace: "jobs",
      name: "batch-orphan",
      status: "Unavailable",
      ready: "0/1",
      owner: null,
    });
  });

  it("maps statefulsets and daemonsets with readiness summaries", () => {
    const statefulSet: V1StatefulSet = {
      metadata: {
        namespace: "data",
        name: "postgres",
      },
      spec: {
        replicas: 2,
        serviceName: "postgres",
        selector: {
          matchLabels: {
            app: "postgres",
          },
        },
        template: {
          spec: {
            containers: [
              {
                name: "postgres",
                image: "postgres:16",
              },
            ],
          },
        },
      },
      status: {
        replicas: 2,
        readyReplicas: 1,
      },
    };
    const daemonSet: V1DaemonSet = {
      metadata: {
        namespace: "kube-system",
        name: "node-agent",
      },
      spec: {
        selector: {
          matchLabels: {
            app: "node-agent",
          },
        },
        template: {
          spec: {
            containers: [
              {
                name: "node-agent",
                image: "example/node-agent:1.0.0",
              },
            ],
          },
        },
      },
      status: {
        currentNumberScheduled: 2,
        desiredNumberScheduled: 3,
        numberMisscheduled: 0,
        numberReady: 2,
        numberUnavailable: 1,
      },
    };

    expect(normalizeStatefulSetWorkloadItem(statefulSet, NOW)).toMatchObject({
      kind: "StatefulSet",
      namespace: "data",
      name: "postgres",
      status: "Unavailable",
      ready: "1/2",
    });
    expect(normalizeDaemonSetWorkloadItem(daemonSet, NOW)).toMatchObject({
      kind: "DaemonSet",
      namespace: "kube-system",
      name: "node-agent",
      status: "Unavailable",
      ready: "2/3",
    });
  });

  it("maps service rows without readiness or restarts", () => {
    const clusterIpService: V1Service = {
      metadata: {
        namespace: "default",
        name: "web",
        labels: {
          app: "web",
        },
      },
      spec: {
        type: "ClusterIP",
        ports: [
          {
            port: 80,
          },
        ],
      },
    };
    const pendingLoadBalancer: V1Service = {
      metadata: {
        namespace: "default",
        name: "public-web",
      },
      spec: {
        type: "LoadBalancer",
        ports: [
          {
            port: 80,
          },
        ],
      },
      status: {
        loadBalancer: {},
      },
    };

    expect(normalizeServiceWorkloadItem(clusterIpService, NOW)).toMatchObject({
      kind: "Service",
      namespace: "default",
      name: "web",
      status: "Active",
      ready: "n/a",
      restarts: null,
      labels: {
        app: "web",
      },
    });
    expect(
      normalizeServiceWorkloadItem(pendingLoadBalancer, NOW),
    ).toMatchObject({
      kind: "Service",
      name: "public-web",
      status: "Pending",
      ready: "n/a",
      restarts: null,
    });
  });
});

describe("event normalization", () => {
  it("maps warning and normal events to the API contract shape", () => {
    const event: CoreV1Event = {
      metadata: {
        namespace: "default",
        name: "web.123",
      },
      involvedObject: {
        kind: "Pod",
        namespace: "default",
        name: "web-abc123",
        uid: "pod-uid",
      },
      type: "Warning",
      reason: "BackOff",
      message: "Back-off restarting failed container",
      count: 3,
      lastTimestamp: new Date("2026-05-05T23:59:00Z"),
    };

    expect(normalizeEvent(event)).toEqual({
      namespace: "default",
      type: "Warning",
      reason: "BackOff",
      message: "Back-off restarting failed container",
      involvedObject: {
        kind: "Pod",
        namespace: "default",
        name: "web-abc123",
        uid: "pod-uid",
      },
      count: 3,
      lastTimestamp: "2026-05-05T23:59:00.000Z",
    });
  });

  it("falls back to eventTime and creation timestamp when lastTimestamp is missing", () => {
    const eventWithEventTime: CoreV1Event = {
      metadata: {
        name: "scheduled.123",
      },
      involvedObject: {
        kind: "Pod",
        namespace: "default",
        name: "scheduled-pod",
      },
      type: "Normal",
      reason: "Scheduled",
      eventTime: new Date("2026-05-05T23:58:00Z"),
    };
    const eventWithCreationTimestamp: CoreV1Event = {
      metadata: {
        namespace: "default",
        name: "created.123",
        creationTimestamp: new Date("2026-05-05T23:57:00Z"),
      },
      involvedObject: {
        kind: "Deployment",
        namespace: "default",
        name: "web",
      },
    };

    expect(normalizeEvent(eventWithEventTime)).toMatchObject({
      lastTimestamp: "2026-05-05T23:58:00.000Z",
      count: 1,
    });
    expect(normalizeEvent(eventWithCreationTimestamp)).toMatchObject({
      type: "Normal",
      reason: "",
      message: "",
      lastTimestamp: "2026-05-05T23:57:00.000Z",
    });
  });

  it("filters, sorts, and limits event lists", () => {
    const events: CoreV1Event[] = [
      {
        metadata: {
          namespace: "default",
          name: "old-warning",
        },
        involvedObject: {
          kind: "Pod",
          namespace: "default",
          name: "old",
        },
        type: "Warning",
        reason: "BackOff",
        lastTimestamp: new Date("2026-05-05T23:50:00Z"),
      },
      {
        metadata: {
          namespace: "default",
          name: "new-warning",
        },
        involvedObject: {
          kind: "Pod",
          namespace: "default",
          name: "new",
        },
        type: "Warning",
        reason: "FailedScheduling",
        lastTimestamp: new Date("2026-05-05T23:59:00Z"),
      },
      {
        metadata: {
          namespace: "kube-system",
          name: "normal",
        },
        involvedObject: {
          kind: "Node",
          name: "worker-1",
        },
        type: "Normal",
        reason: "NodeReady",
        lastTimestamp: new Date("2026-05-05T23:58:00Z"),
      },
    ];

    expect(
      normalizeEventList(events, {
        namespace: "default",
        type: "Warning",
        involvedKind: "Pod",
        limit: 1,
      }),
    ).toEqual([
      expect.objectContaining({
        reason: "FailedScheduling",
        lastTimestamp: "2026-05-05T23:59:00.000Z",
      }),
    ]);
  });

  it("caps event list limits at the documented upper bound", () => {
    const events = Array.from({ length: MAX_EVENT_LIMIT + 10 }, (_, index) => ({
      metadata: {
        namespace: "default",
        name: `event-${index}`,
      },
      involvedObject: {
        kind: "Pod",
        namespace: "default",
        name: `pod-${index}`,
      },
      lastTimestamp: new Date(
        `2026-05-05T23:${String(index % 60).padStart(2, "0")}:00Z`,
      ),
    })) satisfies CoreV1Event[];

    expect(normalizeEventList(events, { limit: 999 })).toHaveLength(
      MAX_EVENT_LIMIT,
    );
  });
});
