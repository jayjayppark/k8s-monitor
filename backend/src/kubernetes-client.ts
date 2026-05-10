import {
  ApisApi,
  AppsV1Api,
  CoreV1Api,
  CustomObjectsApi,
  EventsV1Api,
  KubeConfig,
  Metrics,
  VersionApi,
} from "@kubernetes/client-node";

export type KubernetesAuthMode = "default" | "kubeconfig" | "in-cluster";

export interface KubernetesRuntimeConfig {
  mode: KubernetesAuthMode;
  kubeconfigPath?: string;
  context?: string;
}

export interface KubernetesClients {
  core: CoreV1Api;
  apps: AppsV1Api;
  events: EventsV1Api;
  customObjects: CustomObjectsApi;
  version: VersionApi;
  apis: ApisApi;
  metrics: Metrics;
}

export interface KubernetesClientBundle {
  config: KubernetesRuntimeConfig;
  kubeConfig: KubeConfig;
  clients: KubernetesClients;
}

export class KubernetesConfigError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "KubernetesConfigError";
  }
}

function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parseAuthMode(
  value: string | undefined,
): KubernetesAuthMode | undefined {
  if (!value) {
    return undefined;
  }

  if (value === "default" || value === "kubeconfig" || value === "in-cluster") {
    return value;
  }

  throw new KubernetesConfigError(
    "KUBERNETES_AUTH_MODE must be one of default, kubeconfig, or in-cluster",
  );
}

export function resolveKubernetesRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): KubernetesRuntimeConfig {
  const explicitMode = parseAuthMode(env.KUBERNETES_AUTH_MODE);
  const context = env.KUBERNETES_CONTEXT;

  if (
    explicitMode === "in-cluster" ||
    parseBooleanFlag(env.KUBERNETES_IN_CLUSTER)
  ) {
    return {
      mode: "in-cluster",
      context,
    };
  }

  if (explicitMode === "kubeconfig") {
    if (!env.KUBECONFIG) {
      throw new KubernetesConfigError(
        "KUBECONFIG is required when KUBERNETES_AUTH_MODE=kubeconfig",
      );
    }

    return {
      mode: "kubeconfig",
      kubeconfigPath: env.KUBECONFIG,
      context,
    };
  }

  if (env.KUBECONFIG) {
    return {
      mode: "kubeconfig",
      kubeconfigPath: env.KUBECONFIG,
      context,
    };
  }

  return {
    mode: explicitMode ?? "default",
    context,
  };
}

function validateKubeConfig(kubeConfig: KubeConfig): void {
  const cluster = kubeConfig.getCurrentCluster();

  if (!cluster) {
    throw new KubernetesConfigError(
      "Kubernetes configuration has no current cluster",
    );
  }
}

export function loadKubeConfig(config: KubernetesRuntimeConfig): KubeConfig {
  const kubeConfig = new KubeConfig();

  try {
    if (config.mode === "in-cluster") {
      kubeConfig.loadFromCluster();
    } else if (config.mode === "kubeconfig") {
      if (!config.kubeconfigPath) {
        throw new KubernetesConfigError("Kubeconfig path is required");
      }
      kubeConfig.loadFromFile(config.kubeconfigPath);
    } else {
      kubeConfig.loadFromDefault();
    }

    if (config.context) {
      kubeConfig.setCurrentContext(config.context);
    }

    validateKubeConfig(kubeConfig);
    return kubeConfig;
  } catch (error) {
    if (error instanceof KubernetesConfigError) {
      throw error;
    }

    throw new KubernetesConfigError("Unable to load Kubernetes configuration");
  }
}

export function createKubernetesClientBundle(
  config: KubernetesRuntimeConfig = resolveKubernetesRuntimeConfig(),
): KubernetesClientBundle {
  const kubeConfig = loadKubeConfig(config);

  return {
    config,
    kubeConfig,
    clients: {
      core: kubeConfig.makeApiClient(CoreV1Api),
      apps: kubeConfig.makeApiClient(AppsV1Api),
      events: kubeConfig.makeApiClient(EventsV1Api),
      customObjects: kubeConfig.makeApiClient(CustomObjectsApi),
      version: kubeConfig.makeApiClient(VersionApi),
      apis: kubeConfig.makeApiClient(ApisApi),
      metrics: new Metrics(kubeConfig),
    },
  };
}
