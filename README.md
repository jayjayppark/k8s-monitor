# Kubernetes Monitor

하나의 Kubernetes 클러스터를 읽기 전용으로 모니터링하는 경량 웹 애플리케이션입니다.

MVP는 EC2 한 대에서 단일 노드 Kubernetes를 실행하고, 같은 EC2에서 백엔드와 프론트엔드를 실행해 실제 클러스터 데이터를 확인하는 흐름을 1차 검증 기준으로 삼습니다.

## 진행 상황

- 스택 선택 완료: TypeScript, Fastify, React, Vite, pnpm workspace.
- 워크스페이스 스캐폴드 완료: `backend`, `frontend`, `packages/shared`.
- 제품 요구사항, 아키텍처, API 계약 초안 작성 완료.
- 백엔드 Fastify 서버 skeleton과 `/api/health` 구현 완료.
- kubeconfig 또는 in-cluster service account 기반 Kubernetes client 초기화와 health connectivity check 구현 완료.
- 프론트엔드 런타임 구현은 아직 시작 전입니다.

## 저장소 구조

```text
.
├── backend/             # Fastify 백엔드
├── frontend/            # React + Vite 프론트엔드
├── packages/shared/     # 백엔드/프론트엔드 공유 DTO 타입
├── docs/                # 제품 기준, 아키텍처, API 계약
├── scripts/             # 운영 보조 스크립트
└── tools/slack-bot/     # Slack에서 AI 작업을 실행하는 로컬 봇
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

백엔드 workspace script는 실제 Fastify dev server, 타입체크, 테스트를 실행합니다. 아직 구현 전인 workspace script는 placeholder이며, 구현이 진행되면 위 명령이 실제 프론트엔드와 공유 패키지 검증을 실행하도록 유지합니다.

## 백엔드 실행

백엔드는 Fastify API server로 실행됩니다.

```sh
pnpm dev:backend
```

`/api/health`는 백엔드 프로세스 상태, Kubernetes API 연결 상태와 server version, metrics-server API group 상태를 반환합니다. metrics-server가 없으면 metrics만 degraded/unavailable로 표시하고 백엔드 프로세스는 계속 실행됩니다.

개발 서버는 기본적으로 `127.0.0.1:3000`에 bind합니다. EC2 내부와 외부 브라우저 접근이 필요하면 `HOST`와 `PORT` 환경 변수로 bind 주소와 port를 지정합니다.

Kubernetes 연결 설정:

- `KUBERNETES_AUTH_MODE`: optional. `default`, `kubeconfig`, `in-cluster` 중 하나입니다.
- `KUBECONFIG`: local kubeconfig 파일 경로입니다. 값이 있으면 기본적으로 kubeconfig mode를 사용합니다.
- `KUBERNETES_CONTEXT`: optional. kubeconfig 안의 특정 context를 선택합니다.
- `KUBERNETES_IN_CLUSTER`: optional. `true`, `1`, `yes`, `on`이면 in-cluster mode를 사용합니다.

실행 예시:

```sh
HOST=0.0.0.0 PORT=3000 KUBECONFIG=~/.kube/config pnpm dev:backend
```

클러스터 내부 service account로 실행할 때는 아래처럼 명시할 수 있습니다.

```sh
KUBERNETES_AUTH_MODE=in-cluster pnpm dev:backend
```

health check:

```sh
curl http://127.0.0.1:3000/api/health
```

## 프론트엔드 실행

구현 후 프론트엔드는 Vite 개발 서버로 실행됩니다.

```sh
pnpm dev:frontend
```

프론트엔드는 Kubernetes API와 직접 통신하지 않고 백엔드 API만 호출합니다.

외부 브라우저에서 EC2 public IP로 접속하려면 Vite dev server가 `0.0.0.0`에 bind되어야 합니다. Vite는 CLI에서 `--host 0.0.0.0`을 지원합니다.

예상 실행 형태:

```sh
pnpm dev:frontend -- --host 0.0.0.0
```

개발 중 접속 URL 예시:

```text
http://<EC2_PUBLIC_IP>:5173
```

프론트엔드는 백엔드 API base URL을 설정할 수 있어야 합니다. 실제 환경 변수 이름은 프론트엔드 구현 시 확정합니다.

## 단일 노드 Kubernetes 실행

MVP 검증용 Kubernetes는 EC2에 K3s 단일 서버 노드로 설치하는 방식을 우선합니다. K3s 공식 quick-start는 설치 스크립트 방식의 단일 서버 실행을 안내합니다: <https://docs.k3s.io/quick-start>

필요한 도구:

- Node.js 22 이상.
- pnpm.
- curl.
- K3s.
- kubectl.
- GitHub CLI는 issue 기반 작업에만 필요합니다.

아직 자동 설치 스크립트는 없습니다. 설치 자동화가 필요해지면 별도 script 또는 문서로 추가합니다.

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

## EC2 보안 그룹과 접속

개발 중 외부 브라우저에서 EC2 public IP로 접속하려면 EC2 security group inbound rule이 필요합니다.

개발 단계 예상 포트:

- `5173/tcp`: Vite frontend dev server.
- `3000/tcp`: Fastify backend dev server. 프론트엔드가 브라우저에서 직접 호출하는 구조라면 외부 접근이 필요합니다.
- `22/tcp`: SSH.

가능하면 `5173`과 `3000`은 본인 IP에서만 접근하도록 제한합니다. 운영 배포 전에는 HTTPS, 인증, reverse proxy 여부를 별도로 결정합니다.

MVP 패키징 후에는 백엔드가 빌드된 프론트엔드를 함께 제공하는 구조를 목표로 합니다. 이 경우 외부 공개 포트는 하나로 줄일 수 있습니다.

예상 접속 형태:

```text
개발 중: http://<EC2_PUBLIC_IP>:5173
패키징 후: http://<EC2_PUBLIC_IP>:3000
```

## 알림 테스트용 장애 시나리오

알림 기능을 검증하려면 의도적으로 문제가 있는 Kubernetes resource를 만들 수 있습니다. 이 명령은 EC2의 MVP 테스트용 단일 노드 클러스터에서만 실행합니다. 운영 클러스터에서는 실행하지 않습니다.

테스트 resource는 전용 namespace에만 만듭니다.

```sh
kubectl create namespace k8s-monitor-alert-test
```

이미지를 가져올 수 없는 pod를 만들어 `ImagePullBackOff`와 warning event를 확인합니다.

```sh
kubectl -n k8s-monitor-alert-test run bad-image \
  --image=ghcr.io/example/does-not-exist:never
```

계속 실패하는 pod를 만들어 restart 증가와 `CrashLoopBackOff` 계열 상태를 확인합니다.

```sh
kubectl -n k8s-monitor-alert-test run crash-loop \
  --image=busybox:1.36 \
  --restart=Always \
  -- /bin/sh -c 'exit 1'
```

단일 노드에서 감당하기 어려운 resource request를 가진 pod를 만들어 `Pending` 또는 scheduling warning을 확인합니다.

```sh
kubectl -n k8s-monitor-alert-test run unschedulable \
  --image=busybox:1.36 \
  --requests='cpu=1000,memory=1000Gi' \
  -- sleep 3600
```

상태와 event를 확인합니다.

```sh
kubectl -n k8s-monitor-alert-test get pods
kubectl -n k8s-monitor-alert-test get events --sort-by=.lastTimestamp
```

테스트가 끝나면 반드시 정리합니다.

```sh
kubectl delete namespace k8s-monitor-alert-test
```

이 시나리오들은 브라우저 alert banner/notification panel과 Slack alert 전송이 동작하는지 확인하기 위한 것입니다. cleanup 없이 오래 두면 동일한 alert가 반복될 수 있으므로 Slack 전송에는 cooldown이 필요합니다.

## Slack으로 작업시키는 방법

Slack에서는 봇을 멘션하고 자연어로 질문하거나 작업을 지시합니다. 별도의 하위 명령은 사용하지 않습니다.

```text
@AI Devbox Bot issues
@AI Devbox Bot issue 34 처리해줘
@AI Devbox Bot 다음에 할 일 추천해줘
@AI Devbox Bot 현재 아키텍처 기준으로 백엔드부터 구현해줘
```

봇은 핵심 문서와 언급된 GitHub Issue 본문을 AI 작업 컨텍스트에 넣습니다. 같은 Slack thread의 이전 대화도 작업 컨텍스트로 이어집니다.

질문이면 같은 thread에 답변만 합니다. 구현/수정 작업이면 가능한 테스트/검증을 실행하고, 통과하면 commit과 push까지 하도록 지시합니다. commit message는 conventional commit 제목과 bullet body를 함께 남깁니다. 테스트 또는 필수 검증이 실패하면 commit/push하지 않고 실패 내용을 보고합니다.

“가장 먼저 해야 할 일을 골라서 해라”처럼 시킬 수도 있습니다. 추천만 받고 싶으면 파일을 수정하지 말라고 명시합니다.

```text
@AI Devbox Bot GitHub issue들과 TASKS.md를 보고 다음에 해야 할 issue를 추천해줘. 파일은 수정하지 마.
```

그 다음 선택한 issue를 자연어로 실행합니다.

```text
@AI Devbox Bot issue 3 처리해줘
```

Slack bot은 같은 Slack thread의 이전 대화를 컨텍스트로 저장합니다. 작업 주제가 바뀌면 새 thread를 사용하거나 아래 명령으로 thread context를 지웁니다.

```text
@AI Devbox Bot reset context
```

AI 작업에는 항상 핵심 문서가 컨텍스트로 들어갑니다.

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
