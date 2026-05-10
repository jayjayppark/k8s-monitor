import Fastify, {
  type FastifyBaseLogger,
  type FastifyInstance,
  type FastifyServerOptions,
} from "fastify";

import { registerApiResponseHelpers } from "./api-response.ts";

export type ComponentStatus = "ok" | "degraded" | "unavailable";

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
}

export function createApp(options: CreateAppOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
  });

  registerApiResponseHelpers(app);

  app.get("/api/health", async (): Promise<HealthResponse> => {
    return {
      status: "ok",
      kubernetes: {
        status: "degraded",
        serverVersion: null,
        message: "Kubernetes client wiring is pending",
      },
      metrics: {
        status: "degraded",
        message: "metrics-server check is pending",
      },
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
