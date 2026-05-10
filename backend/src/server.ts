import { closeApp, createApp } from "./app.ts";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 3000;

function readPort(value: string | undefined): number {
  if (!value) {
    return DEFAULT_PORT;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return port;
}

const host = process.env.HOST ?? DEFAULT_HOST;
const port = readPort(process.env.PORT);
const app = createApp({
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
    redact: ["req.headers.authorization", "req.headers.cookie"],
  },
});

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  app.log.info({ signal }, "shutting down backend server");
  await closeApp(app);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void shutdown(signal).then(() => {
      process.exit(0);
    });
  });
}

try {
  await app.listen({ host, port });
  app.log.info({ host, port }, "backend server started");
} catch (error) {
  app.log.error({ err: error }, "failed to start backend server");
  await closeApp(app);
  process.exit(1);
}
