#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${K8S_MONITOR_ALERT_NAMESPACE:-k8s-monitor-alert-test}"
KUBECONFIG_PATH="${KUBECONFIG:-$HOME/.kube/config}"
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}"
HOLD_SECONDS="${HOLD_SECONDS:-180}"
ALERT_TIMEOUT_SECONDS="${ALERT_TIMEOUT_SECONDS:-90}"

usage() {
  cat <<EOF
Usage:
  $0 run [hold-seconds]
  $0 status
  $0 cleanup

Defaults:
  namespace: ${NAMESPACE}
  kubeconfig: ${KUBECONFIG_PATH}
  backend:   ${BACKEND_URL}
  hold:      ${HOLD_SECONDS}s

Environment overrides:
  K8S_MONITOR_ALERT_NAMESPACE
  KUBECONFIG
  BACKEND_URL
  HOLD_SECONDS
  ALERT_TIMEOUT_SECONDS
  KEEP_ALERT_DEMO_RESOURCES=1  # skip automatic cleanup after run
EOF
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

kubectl_cmd() {
  kubectl --kubeconfig "$KUBECONFIG_PATH" "$@"
}

cleanup() {
  echo "Cleaning up demo namespace: ${NAMESPACE}"
  kubectl_cmd delete namespace "$NAMESPACE" --ignore-not-found=true --wait=true
}

print_status() {
  echo "Kubernetes demo resources:"
  kubectl_cmd get namespace "$NAMESPACE" >/dev/null 2>&1 || {
    echo "  namespace ${NAMESPACE}: not found"
    return 0
  }
  kubectl_cmd -n "$NAMESPACE" get pods
  echo
  echo "Recent demo events:"
  kubectl_cmd -n "$NAMESPACE" get events --sort-by=.lastTimestamp || true
  echo
  echo "Backend alerts:"
  curl -fsS "${BACKEND_URL}/api/alerts" || true
  echo
}

wait_for_alert() {
  local deadline
  deadline=$((SECONDS + ALERT_TIMEOUT_SECONDS))

  echo "Waiting up to ${ALERT_TIMEOUT_SECONDS}s for backend alert detection..."
  while ((SECONDS < deadline)); do
    if curl -fsS "${BACKEND_URL}/api/alerts" | grep -F "\"namespace\":\"${NAMESPACE}\"" >/dev/null; then
      echo "Alert detected by backend for namespace ${NAMESPACE}."
      return 0
    fi
    sleep 5
  done

  echo "Alert was not detected within ${ALERT_TIMEOUT_SECONDS}s. Current status follows." >&2
  print_status
  return 1
}

run_demo() {
  local hold_seconds="${1:-$HOLD_SECONDS}"

  if [[ "${KEEP_ALERT_DEMO_RESOURCES:-0}" != "1" ]]; then
    trap cleanup EXIT INT TERM
  fi

  cleanup
  echo "Creating demo namespace: ${NAMESPACE}"
  kubectl_cmd create namespace "$NAMESPACE"

  echo "Creating CrashLoopBackOff pod: ${NAMESPACE}/crash-loop"
  kubectl_cmd -n "$NAMESPACE" run crash-loop \
    --image=busybox:1.36 \
    --restart=Always \
    -- /bin/sh -c 'echo "k8s-monitor alert demo: intentional crash"; exit 1'

  wait_for_alert

  echo
  echo "Open the dashboard and refresh Overview or Workloads while the demo is held:"
  echo "  ${BACKEND_URL%:3000}:5173"
  echo
  echo "Holding demo resources for ${hold_seconds}s before cleanup."
  sleep "$hold_seconds"
}

main() {
  local command="${1:-run}"
  shift || true

  require_command kubectl
  require_command curl

  case "$command" in
    run)
      run_demo "$@"
      ;;
    status)
      print_status
      ;;
    cleanup)
      cleanup
      ;;
    -h | --help | help)
      usage
      ;;
    *)
      echo "Unknown command: ${command}" >&2
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
