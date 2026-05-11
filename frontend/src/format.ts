import type {
  ApiSourceStatus,
  QuantityDto,
  ResourceQuantityDto,
} from "@k8s-monitor/shared";

type ResourceKind = "cpu" | "memory";

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
    return `${(quantity.value / 1000).toFixed(quantity.value < 1000 ? 2 : 1)} cores (${formatCount(quantity.value)}m)`;
  }

  const gib = quantity.value / 1024 ** 3;
  if (gib >= 1) {
    return `${gib.toFixed(gib >= 10 ? 0 : 1)} GiB`;
  }

  const mib = quantity.value / 1024 ** 2;
  if (mib >= 1) {
    return `${mib.toFixed(mib >= 10 ? 0 : 1)} MiB`;
  }

  return `${formatCount(quantity.value)}B`;
}

export function formatResourcePair(resources: ResourceQuantityDto): string {
  return `CPU ${formatQuantity(resources.cpu)} / Mem ${formatQuantity(resources.memory)}`;
}

function formatResourcePercent(
  usage: QuantityDto | null,
  capacity: QuantityDto | null,
): string | null {
  if (
    !usage ||
    !capacity ||
    capacity.value <= 0 ||
    usage.unit !== capacity.unit
  ) {
    return null;
  }

  return `${Math.round((usage.value / capacity.value) * 100)}%`;
}

export function formatSingleResource(
  quantity: QuantityDto | null,
  kind: ResourceKind,
): string {
  if (!quantity) {
    return "unavailable";
  }

  if (kind === "cpu") {
    return `${(quantity.value / 1000).toFixed(quantity.value < 1000 ? 2 : 1)} cores`;
  }

  return formatQuantity(quantity);
}

export function formatResourceUsage(
  usage: QuantityDto | null,
  baseline: QuantityDto | null,
  kind: ResourceKind,
  baselineLabel = "capacity",
): string {
  if (!usage && !baseline) {
    return "unavailable";
  }

  const percent = formatResourcePercent(usage, baseline);
  const usageLabel = usage
    ? formatSingleResource(usage, kind)
    : "usage unavailable";
  const baselineValue = baseline
    ? formatSingleResource(baseline, kind)
    : `${baselineLabel} unavailable`;
  const baselineText = baseline
    ? `${baselineValue} ${baselineLabel}`
    : baselineValue;

  return percent
    ? `${usageLabel} / ${baselineText} (${percent})`
    : `${usageLabel} / ${baselineText}`;
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
