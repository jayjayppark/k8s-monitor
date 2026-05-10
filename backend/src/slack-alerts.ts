export interface SlackAlertItem {
  id: string;
  severity: "warning" | "critical";
  status: "active" | "resolved";
  title: string;
  message: string;
  resource: {
    kind: string;
    namespace: string | null;
    name: string;
    uid: string | null;
  } | null;
}

export interface SlackAlertNotifier {
  notify(alerts: SlackAlertItem[]): Promise<void>;
}

export interface SlackAlertNotifierOptions {
  webhookUrl: string;
  cooldownMs?: number;
  now?: () => number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000;

function formatResource(alert: SlackAlertItem): string {
  if (!alert.resource) {
    return "source";
  }

  const namespace = alert.resource.namespace
    ? `${alert.resource.namespace}/`
    : "";

  return `${alert.resource.kind} ${namespace}${alert.resource.name}`;
}

function formatSlackMessage(alert: SlackAlertItem): string {
  return [
    `[${alert.severity.toUpperCase()}] ${alert.title}`,
    `Resource: ${formatResource(alert)}`,
    alert.message,
  ].join("\n");
}

export class SlackWebhookAlertNotifier implements SlackAlertNotifier {
  private readonly webhookUrl: string;
  private readonly cooldownMs: number;
  private readonly now: () => number;
  private readonly fetchImpl: typeof fetch;
  private readonly lastSentAtByAlertId = new Map<string, number>();

  public constructor(options: SlackAlertNotifierOptions) {
    this.webhookUrl = options.webhookUrl;
    this.cooldownMs = options.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.now = options.now ?? Date.now;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public async notify(alerts: SlackAlertItem[]): Promise<void> {
    const activeAlerts = alerts.filter((alert) => alert.status === "active");

    for (const alert of activeAlerts) {
      if (!this.shouldSend(alert.id)) {
        continue;
      }

      await this.fetchImpl(this.webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          text: formatSlackMessage(alert),
        }),
      });

      this.lastSentAtByAlertId.set(alert.id, this.now());
    }
  }

  private shouldSend(alertId: string): boolean {
    const lastSentAt = this.lastSentAtByAlertId.get(alertId);

    return (
      lastSentAt === undefined || this.now() - lastSentAt >= this.cooldownMs
    );
  }
}

function readCooldownMs(value: string | undefined): number {
  if (!value) {
    return DEFAULT_COOLDOWN_MS;
  }

  const seconds = Number(value);

  if (!Number.isFinite(seconds) || seconds < 0) {
    return DEFAULT_COOLDOWN_MS;
  }

  return seconds * 1000;
}

export function createSlackAlertNotifierFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): SlackAlertNotifier | null {
  const webhookUrl = env.SLACK_ALERT_WEBHOOK_URL;

  if (!webhookUrl) {
    return null;
  }

  return new SlackWebhookAlertNotifier({
    webhookUrl,
    cooldownMs: readCooldownMs(env.SLACK_ALERT_COOLDOWN_SECONDS),
  });
}
