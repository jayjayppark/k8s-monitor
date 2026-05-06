#!/usr/bin/env bash
set -euo pipefail

source ~/.config/ai-devbox/env

MESSAGE="${1:-No message}"

curl -sS -X POST \
  -H 'Content-type: application/json' \
  --data "$(jq -n --arg text "$MESSAGE" '{text: $text}')" \
  "$SLACK_WEBHOOK_URL" >/dev/null
