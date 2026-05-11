# 장애 알림 테스트

## 목적

이 문서는 브라우저 alert panel과 Slack alert 전송을 검증하기 위해 의도적으로 문제가 있는 Kubernetes resource를 만드는 선택 절차입니다. 테스트 전용 EC2 K3s 클러스터에서만 실행하고, 운영 클러스터에는 실행하지 않습니다.

AI 작업은 운영 Kubernetes 클러스터에 mutation을 적용하지 않습니다. 아래 명령은 사람이 테스트 의도를 확인한 뒤 직접 실행하는 절차입니다.

## 사전 조건

- 테스트 전용 Kubernetes cluster.
- `KUBECONFIG`가 테스트 클러스터를 가리킵니다.
- 백엔드가 해당 kubeconfig로 실행 중입니다.
- Slack alert를 검증하려면 `SLACK_ALERT_WEBHOOK_URL`을 백엔드 실행 환경 변수로만 제공합니다.

```sh
HOST=0.0.0.0 PORT=3000 KUBECONFIG=$HOME/.kube/config pnpm dev:backend
```

Slack alert 전송 검증:

```sh
SLACK_ALERT_WEBHOOK_URL=<provided-at-runtime> \
SLACK_ALERT_COOLDOWN_SECONDS=300 \
HOST=0.0.0.0 \
PORT=3000 \
KUBECONFIG=$HOME/.kube/config \
pnpm dev:backend
```

webhook URL은 파일에 저장하거나 로그에 남기지 않습니다.

## 테스트 namespace

모든 테스트 resource는 전용 namespace에만 만듭니다.

```sh
KUBECONFIG=$HOME/.kube/config kubectl create namespace k8s-monitor-alert-test
```

## ImagePullBackOff

존재하지 않는 이미지를 사용해 image pull 실패와 warning event를 만듭니다.

```sh
KUBECONFIG=$HOME/.kube/config kubectl -n k8s-monitor-alert-test run bad-image \
  --image=ghcr.io/example/does-not-exist:never
```

기대 결과:

- Workloads 화면에서 `bad-image` Pod 상태가 실패 계열로 표시됩니다.
- Events 화면에 image pull 관련 Warning event가 표시됩니다.
- Alert panel에 warning alert 후보가 표시됩니다.
- Slack webhook이 설정되어 있으면 cooldown 정책에 따라 Slack message가 전송됩니다.

## CrashLoopBackOff

즉시 종료되는 컨테이너로 restart 증가와 crash loop 계열 상태를 만듭니다.

```sh
KUBECONFIG=$HOME/.kube/config kubectl -n k8s-monitor-alert-test run crash-loop \
  --image=busybox:1.36 \
  --restart=Always \
  -- /bin/sh -c 'exit 1'
```

기대 결과:

- Workloads 화면에서 restart count가 증가합니다.
- Pod detail에서 container restart count와 관련 event가 표시됩니다.
- Alert panel에 restart 또는 warning event 기반 alert 후보가 표시됩니다.

## Pending Pod

단일 노드가 감당하기 어려운 resource request를 가진 Pod를 만들어 scheduling warning을 확인합니다.

```sh
KUBECONFIG=$HOME/.kube/config kubectl -n k8s-monitor-alert-test run unschedulable \
  --image=busybox:1.36 \
  --requests='cpu=1000,memory=1000Gi' \
  -- sleep 3600
```

기대 결과:

- Workloads 화면에서 `unschedulable` Pod가 Pending으로 표시됩니다.
- Events 화면에 scheduling Warning event가 표시됩니다.
- Alert panel에 pending pod 또는 warning event 기반 alert 후보가 표시됩니다.

## 상태 확인

```sh
KUBECONFIG=$HOME/.kube/config kubectl -n k8s-monitor-alert-test get pods
KUBECONFIG=$HOME/.kube/config kubectl -n k8s-monitor-alert-test get events --sort-by=.lastTimestamp
curl http://127.0.0.1:3000/api/alerts
curl "http://127.0.0.1:3000/api/events?namespace=k8s-monitor-alert-test&limit=20"
```

브라우저에서는 Overview, Workloads, Events, Pod detail을 새로고침해 alert와 event가 표시되는지 확인합니다.

## 정리

테스트 후 namespace를 삭제합니다.

```sh
KUBECONFIG=$HOME/.kube/config kubectl delete namespace k8s-monitor-alert-test
```

정리 후 확인:

```sh
KUBECONFIG=$HOME/.kube/config kubectl get namespace k8s-monitor-alert-test
curl http://127.0.0.1:3000/api/alerts
```

namespace 조회는 NotFound가 기대값입니다. Alert panel은 refresh와 cooldown 이후 테스트 resource alert가 사라져야 합니다.
