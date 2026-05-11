import type {
  PodDetailDto,
  WorkloadItemDto,
} from "./kubernetes-normalizers.ts";
import type { KubernetesResourceReader } from "./kubernetes-resources.ts";

const DEFAULT_NAMESPACE = "default";
const DEFAULT_LOG_TAIL_LINES = 100;
const MAX_LOG_TAIL_LINES = 500;

const KIND_ALIASES = new Map<
  WorkloadItemDto["kind"] | "Node" | "Namespace" | "Event",
  string[]
>([
  ["Node", ["node", "nodes", "no"]],
  ["Namespace", ["namespace", "namespaces", "ns"]],
  ["Pod", ["pod", "pods", "po"]],
  ["Deployment", ["deployment", "deployments", "deploy"]],
  ["ReplicaSet", ["replicaset", "replicasets", "rs"]],
  ["StatefulSet", ["statefulset", "statefulsets", "sts"]],
  ["DaemonSet", ["daemonset", "daemonsets", "ds"]],
  ["Service", ["service", "services", "svc"]],
  ["Event", ["event", "events", "ev"]],
]);

type SupportedKind = WorkloadItemDto["kind"] | "Node" | "Namespace" | "Event";

export class KubectlCommandValidationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "KubectlCommandValidationError";
  }
}

interface ParsedFlags {
  namespace?: string;
  allNamespaces: boolean;
  container?: string;
  previous: boolean;
  tailLines: number;
}

function tokenize(command: string): string[] {
  const tokens = command.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];

  return tokens.map((token) => token.replace(/^["']|["']$/g, ""));
}

function normalizeKind(value: string | undefined): SupportedKind {
  if (!value) {
    throw new KubectlCommandValidationError("resource type is required");
  }

  const normalized = value.toLowerCase();

  for (const [kind, aliases] of KIND_ALIASES.entries()) {
    if (aliases.includes(normalized)) {
      return kind;
    }
  }

  throw new KubectlCommandValidationError(
    `${value} is not supported by the read-only kubectl console`,
  );
}

function parseFlags(args: string[]): {
  flags: ParsedFlags;
  positionals: string[];
} {
  const flags: ParsedFlags = {
    allNamespaces: false,
    previous: false,
    tailLines: DEFAULT_LOG_TAIL_LINES,
  };
  const positionals: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];

    if (token === "-A" || token === "--all-namespaces") {
      flags.allNamespaces = true;
      continue;
    }

    if (token === "-n" || token === "--namespace") {
      const namespace = args[index + 1];

      if (!namespace) {
        throw new KubectlCommandValidationError(
          `${token} requires a namespace`,
        );
      }

      flags.namespace = namespace;
      index += 1;
      continue;
    }

    if (token.startsWith("--namespace=")) {
      flags.namespace = token.slice("--namespace=".length);
      continue;
    }

    if (token === "-c" || token === "--container") {
      const container = args[index + 1];

      if (!container) {
        throw new KubectlCommandValidationError(
          `${token} requires a container`,
        );
      }

      flags.container = container;
      index += 1;
      continue;
    }

    if (token.startsWith("--container=")) {
      flags.container = token.slice("--container=".length);
      continue;
    }

    if (token === "--previous" || token === "-p") {
      flags.previous = true;
      continue;
    }

    if (token === "--tail") {
      const tailLines = args[index + 1];

      if (!tailLines) {
        throw new KubectlCommandValidationError("--tail requires a line count");
      }

      flags.tailLines = parseTailLines(tailLines);
      index += 1;
      continue;
    }

    if (token.startsWith("--tail=")) {
      flags.tailLines = parseTailLines(token.slice("--tail=".length));
      continue;
    }

    if (token.startsWith("-")) {
      throw new KubectlCommandValidationError(`${token} is not supported`);
    }

    positionals.push(token);
  }

  return { flags, positionals };
}

function parseTailLines(raw: string): number {
  const tailLines = Number(raw);

  if (
    !Number.isInteger(tailLines) ||
    tailLines < 1 ||
    tailLines > MAX_LOG_TAIL_LINES
  ) {
    throw new KubectlCommandValidationError(
      `--tail must be an integer between 1 and ${MAX_LOG_TAIL_LINES}`,
    );
  }

  return tailLines;
}

function formatRows(headers: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return "No resources found.\n";
  }

  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0)),
  );
  const renderRow = (row: string[]) =>
    row
      .map((cell, index) => cell.padEnd(widths[index]))
      .join("  ")
      .trimEnd();

  return `${renderRow(headers)}\n${rows.map(renderRow).join("\n")}\n`;
}

function formatValue(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === ""
    ? "<none>"
    : String(value);
}

function namespaceMatches(itemNamespace: string, flags: ParsedFlags): boolean {
  if (flags.allNamespaces) {
    return true;
  }

  return itemNamespace === (flags.namespace ?? DEFAULT_NAMESPACE);
}

function filterWorkloadItems(
  workloads: WorkloadItemDto[],
  kind: WorkloadItemDto["kind"],
  flags: ParsedFlags,
  resourceName: string | undefined,
): WorkloadItemDto[] {
  return workloads
    .filter((item) => item.kind === kind)
    .filter((item) => namespaceMatches(item.namespace, flags))
    .filter((item) => !resourceName || item.name === resourceName);
}

function formatWorkloads(
  kind: WorkloadItemDto["kind"],
  workloads: WorkloadItemDto[],
  flags: ParsedFlags,
  resourceName: string | undefined,
): string {
  const items = filterWorkloadItems(workloads, kind, flags, resourceName);
  const includeNamespace = flags.allNamespaces || Boolean(resourceName);
  const headers = includeNamespace
    ? ["NAMESPACE", "NAME", "STATUS", "READY", "RESTARTS", "AGE"]
    : ["NAME", "STATUS", "READY", "RESTARTS", "AGE"];
  const rows = items.map((item) => {
    const row = [
      item.name,
      item.status,
      item.ready,
      item.restarts === null ? "<none>" : String(item.restarts),
      item.ageSeconds === null
        ? "<unknown>"
        : `${Math.floor(item.ageSeconds / 60)}m`,
    ];

    return includeNamespace ? [item.namespace, ...row] : row;
  });

  return formatRows(headers, rows);
}

function formatPodDescribe(pod: PodDetailDto): string {
  const containers = pod.containers
    .map(
      (container) =>
        `  ${container.name}\n    Image: ${container.image}\n    Ready: ${container.ready}\n    Restarts: ${container.restartCount}`,
    )
    .join("\n");
  const events =
    pod.events.length === 0
      ? "  <none>"
      : pod.events
          .map((event) => `  ${event.type} ${event.reason}: ${event.message}`)
          .join("\n");

  return [
    `Name: ${pod.name}`,
    `Namespace: ${pod.namespace}`,
    `Status: ${pod.status}`,
    `Node: ${formatValue(pod.nodeName)}`,
    `IP: ${formatValue(pod.podIP)}`,
    `Ready: ${pod.ready}`,
    `Restarts: ${pod.restarts}`,
    "Containers:",
    containers || "  <none>",
    "Events:",
    events,
    "",
  ].join("\n");
}

async function runGet(
  reader: KubernetesResourceReader,
  args: string[],
): Promise<string> {
  const { flags, positionals } = parseFlags(args);
  const kind = normalizeKind(positionals[0]);
  const resourceName = positionals[1];

  if (positionals.length > 2) {
    throw new KubectlCommandValidationError("too many arguments for get");
  }

  if (kind === "Node") {
    const nodes = await reader.listNodes();
    return formatRows(
      ["NAME", "STATUS", "ROLES", "VERSION"],
      nodes
        .filter((node) => !resourceName || node.name === resourceName)
        .map((node) => [
          node.name,
          node.status,
          node.roles.join(",") || "<none>",
          formatValue(node.kubeletVersion),
        ]),
    );
  }

  if (kind === "Namespace") {
    const namespaces = await reader.listNamespaces();
    return formatRows(
      ["NAME", "STATUS", "AGE"],
      namespaces
        .filter((namespace) => !resourceName || namespace.name === resourceName)
        .map((namespace) => [
          namespace.name,
          namespace.status,
          namespace.ageSeconds === null
            ? "<unknown>"
            : `${Math.floor(namespace.ageSeconds / 60)}m`,
        ]),
    );
  }

  if (kind === "Event") {
    const events = await reader.listEvents({
      namespace: flags.allNamespaces
        ? undefined
        : (flags.namespace ?? DEFAULT_NAMESPACE),
      limit: 50,
    });
    const includeNamespace = flags.allNamespaces;

    return formatRows(
      includeNamespace
        ? ["NAMESPACE", "TYPE", "REASON", "OBJECT", "MESSAGE"]
        : ["TYPE", "REASON", "OBJECT", "MESSAGE"],
      events.map((event) => {
        const row = [
          event.type,
          event.reason,
          `${event.involvedObject.kind}/${event.involvedObject.name}`,
          event.message,
        ];

        return includeNamespace ? [event.namespace ?? "<none>", ...row] : row;
      }),
    );
  }

  const workloads = await reader.listWorkloads();
  return formatWorkloads(kind, workloads, flags, resourceName);
}

async function runDescribe(
  reader: KubernetesResourceReader,
  args: string[],
): Promise<string> {
  const { flags, positionals } = parseFlags(args);
  const kind = normalizeKind(positionals[0]);
  const resourceName = positionals[1];

  if (kind !== "Pod") {
    throw new KubectlCommandValidationError(
      "describe currently supports Pod only",
    );
  }

  if (!resourceName || positionals.length > 2) {
    throw new KubectlCommandValidationError("describe pod requires a pod name");
  }

  const pod = await reader.getPod(
    flags.namespace ?? DEFAULT_NAMESPACE,
    resourceName,
  );

  if (!pod) {
    throw new KubectlCommandValidationError("Pod not found");
  }

  return formatPodDescribe(pod);
}

async function runLogs(
  reader: KubernetesResourceReader,
  args: string[],
): Promise<string> {
  const { flags, positionals } = parseFlags(args);
  const podName = positionals[0];

  if (!podName || positionals.length > 1) {
    throw new KubectlCommandValidationError(
      "logs requires exactly one pod name",
    );
  }

  const logs = await reader.getPodLogs({
    namespace: flags.namespace ?? DEFAULT_NAMESPACE,
    name: podName,
    container: flags.container,
    previous: flags.previous,
    tailLines: flags.tailLines,
  });

  if (!logs) {
    throw new KubectlCommandValidationError("Pod logs not found");
  }

  return logs.logs.endsWith("\n") ? logs.logs : `${logs.logs}\n`;
}

export async function runKubectlCommand(
  reader: KubernetesResourceReader,
  command: string,
): Promise<string> {
  const trimmed = command.trim();

  if (!trimmed) {
    throw new KubectlCommandValidationError("command is required");
  }

  const tokens = tokenize(trimmed);
  const [binary, verb, ...args] =
    tokens[0] === "kubectl" ? tokens : ["kubectl", ...tokens];

  if (binary !== "kubectl") {
    throw new KubectlCommandValidationError("command must start with kubectl");
  }

  if (verb === "get") {
    return runGet(reader, args);
  }

  if (verb === "describe") {
    return runDescribe(reader, args);
  }

  if (verb === "logs") {
    return runLogs(reader, args);
  }

  throw new KubectlCommandValidationError(
    `${verb ?? "command"} is not supported by the read-only kubectl console`,
  );
}
