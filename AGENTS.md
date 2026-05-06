# AGENTS.md

## Project Role

This repository starts as a lightweight Kubernetes monitoring web application for one cluster. The initial delivery is documentation and planning only; application implementation starts after the MVP scope and architecture are agreed.

## Working Rules

- Do not create backend or frontend source code during the initial design phase.
- Do not create `package.json` until the implementation phase starts.
- Do not add a collector, DaemonSet, Operator, or node-level agent for the MVP.
- Do not run `sudo`.
- Do not change AWS configuration.
- Do not push to GitHub unless explicitly requested.
- Do not write Slack webhook URLs, tokens, kubeconfig contents, or other secrets into files.
- Record unclear requirements as assumptions or open questions in `docs/DECISIONS.md`.

## Repository Layout

- `docs/REQUIREMENTS.md`: MVP product and functional requirements.
- `docs/ARCHITECTURE.md`: Initial monorepo and runtime architecture.
- `docs/API_CONTRACT.md`: Backend/frontend API boundary for the MVP.
- `docs/DECISIONS.md`: Accepted decisions, assumptions, and unresolved questions.
- `TASKS.md`: Ordered implementation plan split into small work items.
- `scripts/slack-notify.sh`: Sends a short completion summary to Slack using environment-provided secrets.

## Engineering Direction

- Start with a monorepo containing `backend` and `frontend` workspaces only when implementation begins.
- Backend is the only component that talks directly to the Kubernetes API.
- Frontend talks only to the backend API.
- Use Kubernetes watch/list APIs for resource state, and consider metrics-server through `metrics.k8s.io` for CPU and memory.
- Keep Prometheus integration outside MVP scope, but avoid API choices that would block adding it later.
- Prefer simple polling or server-sent updates first; introduce heavier realtime infrastructure only if the UX needs it.

## Definition of Done for Initial Design

- MVP requirements, architecture, API contract, decisions, and implementation task plan are written.
- No application code or package manifest is introduced.
- Slack receives a completion summary through `scripts/slack-notify.sh`.
