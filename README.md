# Kubernetes Monitor

하나의 Kubernetes 클러스터를 위한 경량 모니터링 웹 애플리케이션입니다. 현재 저장소에는 초기 pnpm 워크스페이스 스캐폴드가 들어 있으며, 런타임 애플리케이션 구현은 아직 진행 전입니다.

## 선택된 MVP 스택

- 모노레포: pnpm workspaces
- 언어: TypeScript
- 백엔드: Fastify
- 프론트엔드: React + Vite
- 공유 패키지: `packages/shared`
- Kubernetes 클라이언트: `@kubernetes/client-node`
- 테스트: Vitest
- 린트 및 포맷: ESLint + Prettier

백엔드만 Kubernetes와 직접 통신하는 런타임 컴포넌트입니다. 프론트엔드는 백엔드 API와만 통신하며, 구현이 시작된 뒤에는 `packages/shared`의 공유 DTO 타입을 사용합니다.

## 초안 로컬 개발 명령

아래 명령은 구현 단계에서 사용할 합의된 명령 형태입니다. 워크스페이스 명령은 스캐폴드에 연결되어 있지만, 대부분의 런타임 동작은 백엔드, 프론트엔드, 공유 패키지 구현이 추가되기 전까지 placeholder 상태입니다.

```sh
pnpm install
pnpm dev
pnpm dev:backend
pnpm dev:frontend
pnpm build
pnpm test
pnpm lint
pnpm format
```

각 명령의 예상 역할:

- `pnpm install`: 워크스페이스 의존성을 설치합니다.
- `pnpm dev`: 백엔드와 프론트엔드 개발 서버를 함께 실행합니다.
- `pnpm dev:backend`: Fastify 백엔드를 개발 모드로 실행합니다.
- `pnpm dev:frontend`: Vite 프론트엔드 개발 서버를 실행합니다.
- `pnpm build`: 모든 워크스페이스를 빌드합니다.
- `pnpm test`: 백엔드, 프론트엔드, 공유 패키지의 Vitest 테스트를 실행합니다.
- `pnpm lint`: 워크스페이스 전체에 ESLint를 실행합니다.
- `pnpm format`: Prettier 포맷팅을 실행합니다.

## 현재 제약

- 관련 구현 이슈가 시작되기 전까지 런타임 애플리케이션 소스 코드를 추가하지 않습니다.
- MVP에는 collector, DaemonSet, Operator, node-level agent를 추가하지 않습니다.
- kubeconfig 내용, Slack webhook URL, 토큰 또는 기타 secret을 커밋하지 않습니다.
