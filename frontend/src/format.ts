import type {
  ApiSourceStatus,
  QuantityDto,
  ResourceQuantityDto,
} from "@k8s-monitor/shared";

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

export function formatQuantity(quantity: QuantityDto | null): string {
  if (!quantity) {
    return "unavailable";
  }

  if (quantity.unit === "millicores") {
    return `${formatCount(quantity.value)}m`;
  }

  const gib = quantity.value / 1024 ** 3;
  if (gib >= 1) {
    return `${gib.toFixed(gib >= 10 ? 0 : 1)}Gi`;
  }

  const mib = quantity.value / 1024 ** 2;
  if (mib >= 1) {
    return `${mib.toFixed(mib >= 10 ? 0 : 1)}Mi`;
  }

  return `${formatCount(quantity.value)}B`;
}

export function formatResourcePair(resources: ResourceQuantityDto): string {
  return `CPU ${formatQuantity(resources.cpu)} / Memory ${formatQuantity(resources.memory)}`;
}

export function formatLabels(labels: Record<string, string>): string {
  const entries = Object.entries(labels);

  if (entries.length === 0) {
    return "-";
  }

  return entries
    .slice(0, 3)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

export function getDegradedSources(
  sources: ApiSourceStatus[],
): ApiSourceStatus[] {
  return sources.filter((source) => source.status !== "ok");
}
