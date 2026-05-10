# 결정 사항

## 승인된 초기 결정

1. 모노레포를 사용합니다.
   - 근거: MVP는 하나의 백엔드와 하나의 프론트엔드로 시작하며, 공유 계획을 하나의 저장소에서 관리하는 편이 단순합니다.

2. `backend`와 `frontend` 애플리케이션만으로 시작합니다.
   - 근거: 프로젝트 목표는 여러 runtime component를 가진 monitoring platform이 아니라 경량 웹 앱입니다.

3. 백엔드는 Kubernetes와 직접 통신합니다.
   - 근거: 초기 배포를 단순하게 유지하고 collector 설치를 피할 수 있습니다.

4. MVP에는 collector, DaemonSet, Operator, node agent를 만들지 않습니다.
   - 근거: 초기 사용 사례는 하나의 클러스터와 read-only dashboard입니다.

5. CPU와 memory usage의 첫 번째 source로 metrics-server를 사용합니다.
   - 근거: metrics-server는 일반적인 경량 Kubernetes component이며 `metrics.k8s.io`를 노출합니다.

6. Prometheus는 MVP 범위 밖으로 둡니다.
   - 근거: Prometheus는 초기 dashboard에 필요하지 않은 배포, discovery, query, storage 부담을 추가합니다.

7. MVP를 read-only로 만듭니다.
   - 근거: monitoring에는 mutation permission이 필요하지 않아야 하며, read-only RBAC는 risk를 줄입니다.

8. 백엔드와 프론트엔드 사이에는 정규화된 DTO를 사용합니다.
   - 근거: raw Kubernetes object는 크고 UI 요구에 비해 불안정하며 민감한 field가 실수로 노출될 수 있습니다.

9. metrics를 사용할 수 없는 상태는 전체 애플리케이션 실패가 아니라 degraded data로 처리합니다.
   - 근거: metrics-server가 없어도 inventory와 status monitoring은 유용합니다.

10. pnpm workspaces로 관리되는 TypeScript 모노레포를 사용합니다.
    - 근거: TypeScript는 백엔드, 프론트엔드, 공유 DTO 패키지에 하나의 언어와 타입 시스템을 제공하고, pnpm workspaces는 dependency installation과 local package linking을 단순하게 유지합니다.

11. 백엔드 API server로 Fastify를 사용합니다.
    - 근거: Fastify는 경량이고 TypeScript 친화적이며, 구조화된 request validation과 testable handler가 필요한 read-only REST API에 잘 맞습니다.

12. 프론트엔드 애플리케이션에 React with Vite를 사용합니다.
    - 근거: React는 table-heavy dashboard에 대한 지원이 강하고, Vite는 로컬 개발과 production build를 단순하게 유지합니다.

13. 공유 TypeScript API type과 DTO helper에는 `packages/shared`를 사용합니다.
    - 근거: shared contract type은 raw Kubernetes object를 browser에 노출하지 않으면서 Fastify 백엔드와 React 프론트엔드 사이의 drift를 줄입니다.

14. Kubernetes API client로 `@kubernetes/client-node`를 사용합니다.
    - 근거: 공식 JavaScript/TypeScript Kubernetes client이며 kubeconfig와 in-cluster service account loading을 지원합니다.

15. 백엔드, 프론트엔드, 공유 패키지 테스트에 Vitest를 사용합니다.
    - 근거: 하나의 test runner는 TypeScript workspace 전반의 명령을 일관되게 유지하고 Vite 기반 프론트엔드 tooling과 잘 맞습니다.

16. linting과 formatting에는 ESLint와 Prettier를 사용합니다.
    - 근거: ESLint는 TypeScript와 React code quality check를 담당하고, Prettier는 모노레포 전체에 일관된 formatting을 제공합니다.

17. 첫 packaged MVP에서는 Fastify 백엔드가 frontend static build를 제공하고, 로컬 개발 중에는 별도의 백엔드/프론트엔드 dev server를 유지합니다.
    - 근거: 빌드된 프론트엔드를 백엔드에서 제공하면 첫 deployable artifact가 단순해지고, 별도의 dev server는 Vite의 빠른 로컬 개발 workflow를 보존합니다.

18. implementation scaffolding이 존재한 뒤 아래 초기 로컬 개발 명령을 사용합니다:
    - `pnpm install`: workspace dependency를 설치합니다.
    - `pnpm dev`: 백엔드와 프론트엔드 development server를 함께 실행합니다.
    - `pnpm dev:backend`: Fastify 백엔드를 development mode로 실행합니다.
    - `pnpm dev:frontend`: Vite frontend development server를 실행합니다.
    - `pnpm build`: 모든 workspace를 build합니다.
    - `pnpm test`: 백엔드, 프론트엔드, 공유 패키지에 Vitest를 실행합니다.
    - `pnpm lint`: workspace 전체에 ESLint를 실행합니다.
    - `pnpm format`: Prettier formatting을 실행합니다.

## 가정

- 첫 버전은 백엔드 프로세스 하나당 설정된 클러스터 하나를 모니터링합니다.
- 웹 UI authentication은 나중에 추가되지 않는 한 MVP에 포함하지 않습니다.
- 개발은 local kubeconfig를 사용할 수 있습니다.
- 배포는 이후 in-cluster service account credential을 사용할 수 있습니다.
- 초기 프론트엔드 refresh는 polling 기반일 수 있습니다.
- 장기 metric history는 필요하지 않습니다.
- Event retention은 Kubernetes cluster의 event 동작에 의존합니다.
- Slack webhook은 `scripts/slack-notify.sh`가 source하는 기존 environment file에서 제공됩니다.
- Package manifest와 workspace scaffold는 stack approval 이후 도입되었으며, runtime application source는 관련 implementation issue까지 보류됩니다.

## 미해결 질문

1. MVP testing에 예상되는 cluster size는 어느 정도인가요?
   - 이는 cache strategy, pagination, refresh interval에 영향을 줍니다.

2. 첫 deploy 전에 user-facing authentication이 필요한가요?
   - localhost 또는 private network 밖으로 노출된다면 release 전에 auth가 추가되어야 합니다.

3. namespace와 workload list가 첫 구현에서 pagination을 지원해야 하나요?
   - 작은 cluster에는 필요하지 않을 수 있지만, API는 이후 pagination을 막지 않아야 합니다.

4. 어떤 deployment target을 먼저 문서화해야 하나요?
   - Local-only, in-cluster Deployment, containerized external backend 중 선택이 필요합니다.

5. 지원해야 하는 최소 Kubernetes version은 무엇인가요?
   - 구현 전에 해당 version에 대해 API contract를 확인해야 합니다.
