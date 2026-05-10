import { describe, expect, it, vi } from "vitest";

import {
  SlackWebhookAlertNotifier,
  createSlackAlertNotifierFromEnv,
  type SlackAlertItem,
} from "../src/slack-alerts.js";

const alert: SlackAlertItem = {
  id: "pod/default/web/high-restarts",
  severity: "warning",
  status: "active",
  title: "Pod default/web has high restarts",
  message: "Pod restart count is 7",
  resource: {
    kind: "Pod",
    namespace: "default",
    name: "web",
    uid: "pod-uid",
  },
};

describe("Slack alert notifier", () => {
  it("is disabled when the webhook URL is not configured", () => {
    expect(createSlackAlertNotifierFromEnv({})).toBeNull();
  });

  it("sends concise active alert messages to the configured webhook", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("ok"));
    const notifier = new SlackWebhookAlertNotifier({
      webhookUrl: "https://hooks.slack.test/services/example",
      fetchImpl,
    });

    await notifier.notify([alert]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://hooks.slack.test/services/example",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("Pod default/web has high restarts"),
      }),
    );
    expect(fetchImpl.mock.calls[0]?.[1]?.body).not.toContain("pod-uid");
  });

  it("suppresses duplicates during the cooldown window", async () => {
    let now = 1_000;
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("ok"));
    const notifier = new SlackWebhookAlertNotifier({
      webhookUrl: "https://hooks.slack.test/services/example",
      cooldownMs: 5_000,
      now: () => now,
      fetchImpl,
    });

    await notifier.notify([alert]);
    now += 1_000;
    await notifier.notify([alert]);
    now += 5_000;
    await notifier.notify([alert]);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("surfaces delivery failures so the API can log sanitized errors", async () => {
    const notifier = new SlackWebhookAlertNotifier({
      webhookUrl: "https://hooks.slack.test/services/example",
      fetchImpl: vi.fn<typeof fetch>(async () => {
        throw new Error("network failure");
      }),
    });

    await expect(notifier.notify([alert])).rejects.toThrow("network failure");
  });
});
