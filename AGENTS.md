# AGENTS.md

## 프로젝트 기준

이 저장소는 하나의 Kubernetes 클러스터를 모니터링하는 경량 웹 애플리케이션입니다. 백엔드와 프론트엔드로 구성하며, MVP는 EC2 한 대에서 단일 노드 Kubernetes와 앱을 함께 실행해 실제 클러스터 연결을 검증합니다.

## 작업 규칙

- 변경 전 현재 문서를 먼저 확인합니다: `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/API_CONTRACT.md`, `TASKS.md`.
- Slack으로 실행되는 AI 작업은 핵심 문서를 우선 컨텍스트로 사용하고, 작업별로 필요한 파일만 추가로 탐색합니다.
- GitHub Issue가 지정된 작업은 해당 issue 본문과 acceptance criteria를 먼저 확인합니다.
- Slack 입력이 질문, 분석, 추천 요청이면 파일 수정 없이 답변합니다.
- Slack 입력이 구현, 수정, 문서화, issue 처리, 실행 요청이면 실제 작업을 수행합니다.
- Slack 작업에서 파일을 수정했다면 관련 테스트/검증을 실행하고, 통과한 경우에만 conventional commit 형식으로 commit한 뒤 push합니다.
- 구현 commit은 제목만 쓰지 않고 body에 주요 변경 bullet과 테스트 요약을 포함합니다.
- 테스트 또는 필수 검증이 실패하면 commit/push하지 않고 실패 내용을 보고합니다.
- 구현으로 요구사항, API, 아키텍처, 실행 방법이 바뀌면 관련 문서를 현재 기준으로 바로 수정합니다.
- 문서에는 변경 히스토리를 누적하지 않습니다. 바뀐 뒤의 최신 기준만 남깁니다.
- 백엔드만 Kubernetes API와 직접 통신합니다.
- 프론트엔드는 백엔드 API와만 통신합니다.
- Kubernetes resource mutation 기능은 MVP에 추가하지 않습니다.
- MVP에는 collector, DaemonSet, Operator, sidecar, node-level agent를 추가하지 않습니다.
- Prometheus 통합은 MVP 범위 밖입니다.
- `sudo`를 실행하지 않습니다.
- AWS 구성을 변경하지 않습니다.
- Slack 작업에서 검증이 통과한 구현 변경은 push합니다. 그 외에는 명시적으로 요청받지 않는 한 push하지 않습니다.
- Slack webhook URL, token, kubeconfig 내용, bearer token, AWS credential 또는 기타 secret을 파일에 쓰지 않습니다.

## 현재 기술 방향

- Monorepo: pnpm workspaces.
- Language: TypeScript.
- Backend: Fastify.
- Frontend: React + Vite.
- Shared DTO package: `packages/shared`.
- Kubernetes client: `@kubernetes/client-node`.
- Tests: Vitest.
- Lint/format: ESLint + Prettier.

## 저장소 구조

- `backend/`: Fastify 백엔드 workspace.
- `frontend/`: React + Vite 프론트엔드 workspace.
- `packages/shared/`: 공유 DTO 타입과 작은 contract helper.
- `docs/PRODUCT_SPEC.md`: MVP 제품 범위와 화면 요구사항.
- `docs/ARCHITECTURE.md`: 현재 런타임 아키텍처와 EC2/Kubernetes 검증 방식.
- `docs/API_CONTRACT.md`: 백엔드/프론트엔드 API 계약.
- `TASKS.md`: 구현 순서와 남은 작업.
- `tools/slack-bot/`: Slack에서 AI 작업을 실행하는 로컬 봇.

## 완료 기준

- 요청된 코드 또는 문서 변경이 실제 파일에 반영되어 있습니다.
- 관련 문서가 최신 기준으로 업데이트되어 있습니다.
- 가능한 검증 명령을 실행하고 결과를 보고합니다.
- 구현 작업은 commit hash 또는 commit하지 않은 이유를 보고합니다.
- secret, kubeconfig, 로컬 로그, `.agent/` 컨텍스트는 커밋하지 않습니다.
