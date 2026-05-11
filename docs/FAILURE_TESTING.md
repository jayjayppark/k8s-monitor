# 장애 알림 테스트

## 목적

이 문서는 브라우저 alert panel과 Slack alert 전송을 검증하기 위해 의도적으로 문제가 있는 Kubernetes resource를 만드는 선택 절차입니다. 테스트 전용 EC2 K3s 클러스터에서만 실행하고, 운영 클러스터에는 실행하지 않습니다.

알림 데모는 `scripts/trigger-alert-demo.sh`를 기준으로 반복 실행합니다. 이 스크립트는 전용 namespace에 CrashLoopBackOff Pod를 만들고, 백엔드 alert API가 해당 namespace의 alert를 감지할 때까지 기다린 뒤, 지정한 시간 동안 데모 상태를 유지하고 namespace를 삭제해 원상복구합니다. 앱 런타임은 계속 읽기 전용이며, Kubernetes resource mutation은 이 데모 스크립트에만 포함합니다.

## 사전 조건

- 테스트 전용 Kubernetes cluster.
- `KUBECONFIG`가 테스트 클러스터를 가리킵니다.
- 백엔드가 해당 kubeconfig로 실행 중입니다.
- Slack alert를 검증하려면 `SLACK_ALERT_WEBHOOK_URL`을 백엔드 실행 환경 변수로만 제공합니다. Slack bot 데모 환경처럼 현재 대화 채널용 `SLACK_WEBHOOK_URL`만 있는 경우 백엔드는 그 값을 fallback으로 사용합니다.

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

## 반복 실행 데모 스크립트

기본 실행:

```sh
scripts/trigger-alert-demo.sh run
```

기본값:

- namespace: `k8s-monitor-alert-test`
- kubeconfig: `$KUBECONFIG` 또는 `$HOME/.kube/config`
- backend URL: `http://127.0.0.1:3000`
- 데모 유지 시간: 180초
- alert 감지 timeout: 90초

수동 실행 예:

```sh
KUBECONFIG=$HOME/.kube/config \
BACKEND_URL=http://127.0.0.1:3000 \
scripts/trigger-alert-demo.sh run 240
```

위 명령은 240초 동안 장애 상태를 유지한 뒤 자동 cleanup합니다. 발표 중에는 브라우저를 열어 둔 상태에서 우하단 alert toast, Overview alert panel, risky pod, recent warning event가 자동으로 갱신되는지 확인합니다.

## CrashLoopBackOff

스크립트가 사용하는 기본 시나리오입니다. 즉시 종료되는 컨테이너로 restart 증가와 crash loop 계열 상태를 만듭니다.

```sh
KUBECONFIG=$HOME/.kube/config kubectl create namespace k8s-monitor-alert-test
KUBECONFIG=$HOME/.kube/config kubectl -n k8s-monitor-alert-test run crash-loop \
  --image=busybox:1.36 \
  --restart=Always \
  -- /bin/sh -c 'echo "k8s-monitor alert demo: intentional crash"; exit 1'
```

기대 결과:

- Workloads 화면에서 restart count가 증가합니다.
- Pod detail에서 container restart count와 관련 event가 표시됩니다.
- Alert panel에 restart 또는 warning event 기반 alert 후보가 표시됩니다.
- Slack webhook이 설정되어 있으면 cooldown 정책에 따라 Slack message가 전송됩니다.

## 수동 상태 확인

스크립트 실행 중 또는 실행 후 상태를 확인합니다.

```sh
scripts/trigger-alert-demo.sh status
```

동일한 확인을 직접 실행할 수도 있습니다.

```sh
KUBECONFIG=$HOME/.kube/config kubectl -n k8s-monitor-alert-test get pods
KUBECONFIG=$HOME/.kube/config kubectl -n k8s-monitor-alert-test get events --sort-by=.lastTimestamp
curl http://127.0.0.1:3000/api/alerts
curl "http://127.0.0.1:3000/api/events?namespace=k8s-monitor-alert-test&limit=20"
```

브라우저에서는 Overview, Workloads, Events, Pod detail에서 alert와 event가 표시되는지 확인합니다. Overview와 우하단 alert toast는 주기적으로 갱신되며, 다른 화면은 화면 진입 또는 필터 변경 시 다시 조회합니다.

## 정리

`run` 명령은 기본적으로 종료 시 namespace를 삭제합니다. 스크립트가 중간에 끊겼거나 수동으로 정리하려면 아래 명령을 실행합니다.

```sh
scripts/trigger-alert-demo.sh cleanup
```

정리 후 확인:

```sh
KUBECONFIG=$HOME/.kube/config kubectl get namespace k8s-monitor-alert-test
curl http://127.0.0.1:3000/api/alerts
```

namespace 조회는 NotFound가 기대값입니다. Alert panel은 다음 polling 이후 테스트 resource alert가 사라져야 합니다.

## 기타 수동 시나리오

반복 발표 데모에는 `CrashLoopBackOff`가 가장 안정적입니다. `ImagePullBackOff` 또는 `Pending` 시나리오도 warning event 검증에 사용할 수 있지만, 발표 직후 원상복구를 놓치지 않도록 반드시 전용 namespace에서만 실행하고 마지막에 namespace를 삭제합니다.
