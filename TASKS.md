# Implementation Tasks

## Phase 0: Design Baseline

1. Confirm repository structure and initial constraints.
2. Write `AGENTS.md` with project rules and scope boundaries.
3. Write MVP requirements in `docs/REQUIREMENTS.md`.
4. Write initial architecture in `docs/ARCHITECTURE.md`.
5. Write backend/frontend API contract in `docs/API_CONTRACT.md`.
6. Record initial decisions, assumptions, and open questions in `docs/DECISIONS.md`.
7. Send Slack completion summary with `scripts/slack-notify.sh`.

## Phase 1: Stack Selection

1. Choose backend language and framework.
2. Choose frontend framework and build tool.
3. Choose test frameworks for backend and frontend.
4. Decide whether the backend serves frontend static assets.
5. Define local development commands.
6. Create package/workspace manifests only after stack decisions are accepted.

## Phase 2: Backend Foundation

1. Create backend application skeleton.
2. Add configuration loading for kubeconfig and in-cluster mode.
3. Add structured logging without secret output.
4. Add `/api/health`.
5. Add Kubernetes client initialization.
6. Add Kubernetes connectivity checks.
7. Add common API envelope and error response types.
8. Add unit tests for config and response helpers.

## Phase 3: Kubernetes Inventory

1. Implement namespace listing.
2. Implement node listing and readiness mapping.
3. Implement pod listing and phase/readiness/restart mapping.
4. Implement workload listing for Deployments.
5. Implement workload listing for ReplicaSets.
6. Implement workload listing for StatefulSets.
7. Implement workload listing for DaemonSets.
8. Implement service listing.
9. Implement recent event listing.
10. Add tests for Kubernetes object normalization.

## Phase 4: Metrics Integration

1. Detect metrics-server availability.
2. Implement node metrics retrieval.
3. Implement pod metrics retrieval.
4. Normalize CPU to millicores and memory to bytes.
5. Merge metrics into node and pod DTOs.
6. Return degraded source metadata when metrics are unavailable.
7. Add tests for quantity parsing and missing metrics behavior.

## Phase 5: Backend API Endpoints

1. Implement `GET /api/cluster/summary`.
2. Implement `GET /api/nodes`.
3. Implement `GET /api/namespaces`.
4. Implement `GET /api/workloads`.
5. Implement `GET /api/pods/{namespace}/{name}`.
6. Implement `GET /api/events`.
7. Add query validation for filters.
8. Add integration tests with mocked Kubernetes clients or fixtures.

## Phase 6: Frontend Foundation

1. Create frontend application skeleton.
2. Add API client for backend endpoints.
3. Add layout shell for dashboard navigation.
4. Add shared loading, empty, degraded, and error states.
5. Add shared table and filter components.
6. Add frontend tests for API client and state rendering.

## Phase 7: Frontend Views

1. Build cluster summary dashboard.
2. Build nodes table with readiness and usage columns.
3. Build namespaces table.
4. Build workloads table with namespace, kind, status, and search filters.
5. Build pod detail view.
6. Build events view or recent events panel.
7. Add responsive layout checks for desktop and mobile.

## Phase 8: Local Run and Packaging

1. Document local development setup.
2. Document required Kubernetes RBAC permissions.
3. Add container build files if needed.
4. Add example read-only RBAC manifest if deployment target requires it.
5. Add smoke test instructions against a real or local cluster.
6. Update README with setup, run, and troubleshooting steps.

## Phase 9: MVP Validation

1. Test against a cluster with metrics-server installed.
2. Test against a cluster without metrics-server.
3. Test behavior with Kubernetes API unavailable.
4. Validate that frontend never receives secrets.
5. Validate no mutation permissions are required.
6. Review open questions and promote resolved items into decisions.
