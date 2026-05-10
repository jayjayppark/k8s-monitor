# Kubernetes Monitor

하나의 Kubernetes 클러스터를 읽기 전용으로 모니터링하는 경량 웹 애플리케이션입니다.

MVP는 EC2 한 대에서 단일 노드 Kubernetes를 실행하고, 같은 EC2에서 백엔드와 프론트엔드를 실행해 실제 클러스터 데이터를 확인하는 흐름을 1차 검증 기준으로 삼습니다.

## 진행 상황

- 스택 선택 완료: TypeScript, Fastify, React, Vite, pnpm workspace.
- 워크스페이스 스캐폴드 완료: `backend`, `frontend`, `packages/shared`.
- 제품 요구사항, 아키텍처, API 계약 초안 작성 완료.
- 런타임 백엔드/프론트엔드 구현은 아직 시작 전입니다.

## 저장소 구조

```text
.
├── backend/             # Fastify 백엔드
├── frontend/            # React + Vite 프론트엔드
├── packages/shared/     # 백엔드/프론트엔드 공유 DTO 타입
├── docs/                # 제품 기준, 아키텍처, API 계약
├── scripts/             # 운영 보조 스크립트
└── tools/slack-bot/     # Slack에서 Codex를 실행하는 로컬 봇
```

## 개발 명령

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

현재 각 workspace script는 구현 전 placeholder입니다. 구현이 진행되면 위 명령이 실제 백엔드, 프론트엔드, 테스트를 실행하도록 유지합니다.

## 백엔드 실행

구현 후 백엔드는 Fastify API server로 실행됩니다.

```sh
pnpm dev:backend
```

백엔드는 Kubernetes API에 직접 연결합니다. 로컬/EC2 개발에서는 kubeconfig를 사용하고, 나중에 클러스터 내부 배포가 필요해지면 in-cluster service account 방식을 추가합니다.

## 프론트엔드 실행

구현 후 프론트엔드는 Vite 개발 서버로 실행됩니다.

```sh
pnpm dev:frontend
```

프론트엔드는 Kubernetes API와 직접 통신하지 않고 백엔드 API만 호출합니다.

## 단일 노드 Kubernetes 실행

MVP 검증용 Kubernetes는 EC2에 K3s 단일 서버 노드로 설치하는 방식을 우선합니다. K3s 공식 quick-start는 설치 스크립트 방식의 단일 서버 실행을 안내합니다: <https://docs.k3s.io/quick-start>

설치 예시:

```sh
curl -sfL https://get.k3s.io | sh -
```

일반 사용자로 `kubectl`을 실행하려면 kubeconfig 접근 권한을 별도로 설정합니다. 예시는 환경마다 다를 수 있으므로 실제 EC2 보안 기준에 맞게 적용합니다.

```sh
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown "$USER:$USER" ~/.kube/config
kubectl get nodes
```

K3s에는 metrics-server가 기본 포함될 수 있습니다. metrics-server가 없거나 동작하지 않는 경우에도 MVP는 리소스 인벤토리를 보여주고 metrics 관련 값만 unavailable/degraded로 표시해야 합니다.

## 문서

- `docs/PRODUCT_SPEC.md`: MVP 제품 범위와 화면 요구사항.
- `docs/ARCHITECTURE.md`: 현재 아키텍처와 실행/검증 방식.
- `docs/API_CONTRACT.md`: 백엔드와 프론트엔드 사이의 API 계약.
- `TASKS.md`: 현재 구현 순서.

구현 중 요구사항이나 동작이 바뀌면 변경 이력을 따로 누적하지 말고, 관련 문서의 현재 기준 내용을 바로 수정합니다.

## 보안

- kubeconfig 내용, bearer token, Slack webhook URL, GitHub token, AWS credential은 커밋하지 않습니다.
- 프론트엔드는 Kubernetes secret이나 credential을 받지 않습니다.
- MVP의 Kubernetes 접근은 `get`, `list`, `watch` 중심의 읽기 전용 동작으로 제한합니다.
