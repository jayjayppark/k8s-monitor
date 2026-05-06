# Decisions

## Accepted Initial Decisions

1. Use a monorepo.
   - Rationale: The MVP starts with one backend and one frontend, and shared planning is simpler in one repository.

2. Start with only `backend` and `frontend` applications.
   - Rationale: The project goal is a lightweight web app, not a monitoring platform with multiple runtime components.

3. Backend talks directly to Kubernetes.
   - Rationale: This keeps the initial deployment simple and avoids collector installation.

4. Do not build a collector, DaemonSet, Operator, or node agent for MVP.
   - Rationale: The initial use case is one cluster and read-only dashboarding.

5. Use metrics-server as the first source for CPU and memory usage.
   - Rationale: It is a common lightweight Kubernetes component and exposes `metrics.k8s.io`.

6. Keep Prometheus outside MVP scope.
   - Rationale: Prometheus adds deployment, discovery, query, and storage concerns that are not required for the initial dashboard.

7. Make the MVP read-only.
   - Rationale: Monitoring should not require mutation permissions, and read-only RBAC reduces risk.

8. Use normalized DTOs between backend and frontend.
   - Rationale: Raw Kubernetes objects are large, unstable for UI needs, and can accidentally expose sensitive fields.

9. Treat unavailable metrics as degraded data, not a full application failure.
   - Rationale: Inventory and status monitoring remain useful without metrics-server.

## Assumptions

- The first version monitors one configured cluster per backend process.
- Authentication for the web UI is not part of MVP unless added later.
- Development can use local kubeconfig.
- Deployment can later use in-cluster service account credentials.
- Initial frontend refresh can be polling-based.
- Long-term metric history is not required.
- Event retention depends on the Kubernetes cluster's event behavior.
- The backend language/framework and frontend framework are not decided yet.
- The Slack webhook is supplied by the existing environment file sourced by `scripts/slack-notify.sh`.

## Open Questions

1. Which backend stack should be used?
   - Candidate options: Go, Node.js/TypeScript, Python.
   - Decision criteria: Kubernetes client maturity, packaging simplicity, team familiarity.

2. Which frontend stack should be used?
   - Candidate options: React, Vue, Svelte, or another lightweight UI stack.
   - Decision criteria: table-heavy UI ergonomics, build complexity, team familiarity.

3. Should the backend serve the frontend static build in production?
   - Serving together simplifies deployment.
   - Serving separately can keep frontend hosting flexible.

4. What is the expected cluster size for MVP testing?
   - This affects cache strategy, pagination, and refresh intervals.

5. Is user-facing authentication needed before the first deploy?
   - If exposed beyond localhost or a private network, auth should be added before release.

6. Should namespace and workload lists support pagination in the first implementation?
   - Small clusters may not need it, but the API should avoid blocking pagination later.

7. What deployment target should be documented first?
   - Local-only, in-cluster Deployment, or a containerized external backend.

8. What minimum Kubernetes version should be supported?
   - The API contract should be checked against that version before implementation.
