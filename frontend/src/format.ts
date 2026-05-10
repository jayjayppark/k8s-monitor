import type { ApiSourceStatus } from "@k8s-monitor/shared";

export function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatAge(seconds: number | null): string {
  if (seconds === null) {
    return "unknown";
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 48) {
    return `${hours}h`;
  }

  return `${Math.floor(hours / 24)}d`;
}

export function formatDateTime(value: string | null): string {
  if (!value) {
    return "unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function getDegradedSources(
  sources: ApiSourceStatus[],
): ApiSourceStatus[] {
  return sources.filter((source) => source.status !== "ok");
}
