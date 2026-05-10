import {
  KubernetesConfigError,
  createKubernetesClientBundle,
} from "./kubernetes-client.ts";

export type ComponentStatus = "ok" | "degraded" | "unavailable";

export interface KubernetesComponentHealth {
  status: ComponentStatus;
  message?: string;
}

export interface KubernetesApiHealth extends KubernetesComponentHealth {
  serverVersion: string | null;
}

export interface KubernetesHealthResult {
  kubernetes: KubernetesApiHealth;
  metrics: KubernetesComponentHealth;
}

export interface KubernetesHealthProbe {
  getServerVersion(): Promise<string>;
  checkMetricsApi(): Promise<void>;
}

export interface KubernetesHealthChecker {
  check(): Promise<KubernetesHealthResult>;
}

interface ApiGroupList {
  groups?: Array<{
    name?: string;
    versions?: Array<{
      groupVersion?: string;
      version?: string;
    }>;
  }>;
}

interface VersionInfo {
  gitVersion?: string;
  major?: string;
  minor?: string;
}

function versionToString(version: VersionInfo): string {
  if (version.gitVersion) {
    return version.gitVersion;
  }

  if (version.major && version.minor) {
    return `v${version.major}.${version.minor}`;
  }

  return "unknown";
}

function describeError(error: unknown, fallback: string): string {
  if (error instanceof KubernetesConfigError) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String((error as { code: unknown }).code);
    return `${fallback} (${code})`;
  }

  return fallback;
}

export class KubernetesClientHealthProbe implements KubernetesHealthProbe {
  private readonly clients;

  public constructor(clients = createKubernetesClientBundle().clients) {
    this.clients = clients;
  }

  public async getServerVersion(): Promise<string> {
    const version = (await this.clients.version.getCode()) as VersionInfo;
    return versionToString(version);
  }

  public async checkMetricsApi(): Promise<void> {
    const apiGroups =
      (await this.clients.apis.getAPIVersions()) as ApiGroupList;
    const metricsGroup = apiGroups.groups?.find(
      (group) =>
        group.name === "metrics.k8s.io" &&
        group.versions?.some(
          (version) => version.groupVersion === "metrics.k8s.io/v1beta1",
        ),
    );

    if (!metricsGroup) {
      throw new Error("metrics.k8s.io/v1beta1 API group is unavailable");
    }
  }
}

export class DefaultKubernetesHealthChecker implements KubernetesHealthChecker {
  private readonly probe: KubernetesHealthProbe;

  public constructor(probe: KubernetesHealthProbe) {
    this.probe = probe;
  }

  public async check(): Promise<KubernetesHealthResult> {
    let serverVersion: string;

    try {
      serverVersion = await this.probe.getServerVersion();
    } catch (error) {
      return {
        kubernetes: {
          status: "unavailable",
          serverVersion: null,
          message: describeError(error, "Kubernetes API is unavailable"),
        },
        metrics: {
          status: "unavailable",
          message:
            "metrics-server check skipped because Kubernetes API is unavailable",
        },
      };
    }

    try {
      await this.probe.checkMetricsApi();

      return {
        kubernetes: {
          status: "ok",
          serverVersion,
        },
        metrics: {
          status: "ok",
        },
      };
    } catch (error) {
      return {
        kubernetes: {
          status: "ok",
          serverVersion,
        },
        metrics: {
          status: "degraded",
          message: describeError(error, "metrics.k8s.io is unavailable"),
        },
      };
    }
  }
}

export function createDefaultKubernetesHealthChecker(): KubernetesHealthChecker {
  try {
    return new DefaultKubernetesHealthChecker(
      new KubernetesClientHealthProbe(),
    );
  } catch (error) {
    const message = describeError(
      error,
      "Unable to initialize Kubernetes client",
    );

    return {
      async check(): Promise<KubernetesHealthResult> {
        return {
          kubernetes: {
            status: "unavailable",
            serverVersion: null,
            message,
          },
          metrics: {
            status: "unavailable",
            message:
              "metrics-server check skipped because Kubernetes client is unavailable",
          },
        };
      },
    };
  }
}
