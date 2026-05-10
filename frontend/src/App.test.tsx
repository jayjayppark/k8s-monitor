// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App.tsx";

type FetchHandler = (url: URL) => unknown;

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const meta = {
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
    {
      name: "metrics-server",
      status: "degraded",
      message: "metrics.k8s.io is unavailable",
    },
  ],
};

const nodes = [
  {
    name: "worker-1",
    status: "Ready",
    roles: ["worker"],
    kubeletVersion: "v1.30.0",
    internalIP: "10.0.1.10",
    allocatable: {
      cpu: { raw: "4", value: 4000, unit: "millicores" },
      memory: { raw: "8Gi", value: 8589934592, unit: "bytes" },
    },
    usage: {
      cpu: null,
      memory: null,
    },
    ageSeconds: 3600,
  },
  {
    name: "worker-2",
    status: "NotReady",
    roles: ["worker"],
    kubeletVersion: "v1.30.0",
    internalIP: "10.0.1.11",
    allocatable: {
      cpu: { raw: "2", value: 2000, unit: "millicores" },
      memory: { raw: "4Gi", value: 4294967296, unit: "bytes" },
    },
    usage: {
      cpu: null,
      memory: null,
    },
    ageSeconds: 7200,
  },
];

const namespaces = [
  {
    name: "default",
    status: "Active",
    ageSeconds: 86400,
    counts: {
      pods: 2,
      services: 1,
      deployments: 1,
    },
  },
];

const workloads = [
  {
    kind: "Pod",
    namespace: "default",
    name: "web-abc",
    status: "Running",
    ready: "1/1",
    restarts: 0,
    labels: { app: "web" },
    owner: "ReplicaSet/web",
    ageSeconds: 120,
  },
  {
    kind: "Deployment",
    namespace: "default",
    name: "web",
    status: "Available",
    ready: "1/1",
    restarts: null,
    labels: { app: "web" },
    owner: null,
    ageSeconds: 180,
  },
];

const summary = {
  nodes: {
    total: 2,
    ready: 1,
    notReady: 1,
  },
  namespaces: {
    total: 1,
  },
  pods: {
    total: 1,
    running: 1,
    pending: 0,
    failed: 0,
    succeeded: 0,
    unknown: 0,
  },
  workloads: {
    deployments: 1,
    statefulSets: 0,
    daemonSets: 0,
    replicaSets: 0,
  },
  events: {
    recentWarnings: 0,
  },
  alerts: {
    active: 0,
    critical: 0,
    warning: 0,
  },
};

function envelope(data: unknown) {
  return {
    data,
    meta,
  };
}

async function waitForText(text: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (document.body.textContent?.includes(text)) {
      return;
    }

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  throw new Error(`Unable to find text: ${text}`);
}

async function renderApp(handler: FetchHandler): Promise<Root> {
  const rootElement = document.createElement("div");
  document.body.append(rootElement);
  const root = createRoot(rootElement);

  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input), "http://localhost");
    const response =
      url.pathname === "/api/cluster/summary"
        ? summary
        : url.pathname === "/api/alerts" || url.pathname === "/api/events"
          ? { items: [] }
          : handler(url);

    if (response instanceof Error) {
      return new Response(
        JSON.stringify({
          error: {
            code: "TEST_ERROR",
            message: response.message,
            details: {},
          },
        }),
        { status: 500 },
      );
    }

    return new Response(JSON.stringify(envelope(response)), {
      headers: {
        "content-type": "application/json",
      },
      status: 200,
    });
  });

  await act(async () => {
    root.render(<App />);
  });

  return root;
}

async function clickNav(label: string): Promise<void> {
  const button = [...document.querySelectorAll("button")].find(
    (element) => element.textContent === label,
  );

  if (!button) {
    throw new Error(`Unable to find nav button: ${label}`);
  }

  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function changeControl(label: string, value: string): Promise<void> {
  const labelElement = [...document.querySelectorAll("label")].find((element) =>
    element.textContent?.includes(label),
  );
  const control = labelElement?.querySelector("input, select");

  if (!control) {
    throw new Error(`Unable to find control: ${label}`);
  }

  await act(async () => {
    Object.defineProperty(control, "value", {
      configurable: true,
      value,
    });
    control.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("App resource views", () => {
  let root: Root | undefined;

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = undefined;
    vi.restoreAllMocks();
  });

  it("renders nodes with degraded metrics and filters by readiness", async () => {
    root = await renderApp((url) => {
      if (url.pathname === "/api/nodes") {
        const filtered =
          url.searchParams.get("status") === "notReady"
            ? nodes.filter((node) => node.status === "NotReady")
            : nodes;

        return { items: filtered };
      }

      return { items: [] };
    });

    await clickNav("Nodes");
    await waitForText("worker-1");
    expect(document.body.textContent).toContain("metrics-server");
    expect(document.body.textContent).toContain("CPU unavailable");
    expect(document.querySelector(".table-wrap")).not.toBeNull();

    await changeControl("Readiness", "notReady");
    await waitForText("worker-2");

    expect(document.body.textContent).not.toContain("worker-1");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/nodes?status=notReady",
      expect.any(Object),
    );
  });

  it("renders namespace counts and an empty node state", async () => {
    root = await renderApp((url) => {
      if (url.pathname === "/api/namespaces") {
        return { items: namespaces };
      }
      if (url.pathname === "/api/nodes") {
        return { items: [] };
      }

      return { items: [] };
    });

    await clickNav("Namespaces");
    await waitForText("default");
    expect(document.body.textContent).toContain("Deployments");
    expect(document.body.textContent).toContain("24h");

    await clickNav("Nodes");
    await waitForText("No nodes");
  });

  it("renders workload filters and opens pod detail", async () => {
    root = await renderApp((url) => {
      if (url.pathname === "/api/workloads") {
        const kind = url.searchParams.get("kind");
        const status = url.searchParams.get("status");
        const items = workloads.filter(
          (workload) =>
            (!kind || workload.kind === kind) &&
            (!status || workload.status === status),
        );

        return { items };
      }
      if (url.pathname === "/api/pods/default/web-abc") {
        return {
          kind: "Pod",
          namespace: "default",
          name: "web-abc",
          status: "Running",
          nodeName: "worker-1",
          podIP: "10.244.0.5",
          ready: "1/1",
          restarts: 0,
          containers: [
            {
              name: "app",
              ready: true,
              restartCount: 0,
              image: "example/web:1.0.0",
              resources: {
                requests: {
                  cpu: { raw: "100m", value: 100, unit: "millicores" },
                  memory: { raw: "128Mi", value: 134217728, unit: "bytes" },
                },
                limits: {
                  cpu: null,
                  memory: null,
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
              count: 1,
              lastTimestamp: "2026-05-06T00:00:00.000Z",
            },
          ],
        };
      }

      return { items: [] };
    });

    await clickNav("Workloads");
    await waitForText("web-abc");
    expect(document.body.textContent).toContain("app=web");

    await changeControl("Kind", "Pod");
    await waitForText("web-abc");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/workloads?kind=Pod",
      expect.any(Object),
    );

    await act(async () => {
      document
        .querySelector(".link-button")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitForText("Pod default/web-abc");
    expect(document.body.textContent).toContain("example/web:1.0.0");
    expect(document.body.textContent).toContain("CPU unavailable");
    expect(document.querySelector(".table-wrap")).not.toBeNull();
  });

  it("renders workload empty and pod not-found states", async () => {
    root = await renderApp((url) => {
      if (url.pathname === "/api/workloads") {
        const status = url.searchParams.get("status");

        return {
          items: status
            ? workloads.filter((workload) => workload.status === status)
            : workloads,
        };
      }
      if (url.pathname === "/api/pods/default/web-abc") {
        return new Error("Pod was not found");
      }

      return { items: [] };
    });

    await clickNav("Workloads");
    await changeControl("Status", "Failed");
    await waitForText("No workloads");

    await changeControl("Status", "");
    await waitForText("web-abc");
    await act(async () => {
      document
        .querySelector(".link-button")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await waitForText("TEST_ERROR: Pod was not found");
  });
});
