import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";

import { registerApiResponseHelpers } from "./api-response.ts";
import {
  createDefaultKubernetesHealthChecker,
  type ComponentStatus,
  type KubernetesHealthChecker,
} from "./kubernetes-health.ts";

export interface HealthResponse {
  status: "ok";
  kubernetes: {
    status: ComponentStatus;
    serverVersion: string | null;
    message?: string;
  };
  metrics: {
    status: ComponentStatus;
    message?: string;
  };
}

export interface CreateAppOptions {
  logger?: FastifyServerOptions["logger"];
  kubernetesHealthChecker?: KubernetesHealthChecker;
}

export function createApp(options: CreateAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
  });
  const kubernetesHealthChecker =
    options.kubernetesHealthChecker ?? createDefaultKubernetesHealthChecker();

  registerApiResponseHelpers(app);

  app.get("/api/health", async (): Promise<HealthResponse> => {
    const health = await kubernetesHealthChecker.check();

    return {
      status: "ok",
      kubernetes: health.kubernetes,
      metrics: health.metrics,
    };
  });

  return app;
}

export async function closeApp(
  app: FastifyInstance,
  logger: FastifyBaseLogger = app.log,
): Promise<void> {
  try {
    await app.close();
  } catch (error) {
    logger.error({ err: error }, "failed to close backend server");
  }
}
