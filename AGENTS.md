# AGENTS.md

## 프로젝트 역할

이 저장소는 하나의 클러스터를 위한 경량 Kubernetes 모니터링 웹 애플리케이션으로 시작합니다. 초기 산출물은 문서와 계획만 포함하며, 애플리케이션 구현은 MVP 범위와 아키텍처가 합의된 뒤 시작합니다.

## 작업 규칙

- 초기 설계 단계에서는 백엔드 또는 프론트엔드 소스 코드를 만들지 않습니다.
- 구현 단계가 시작되기 전까지 `package.json`을 만들지 않습니다.
- MVP에는 collector, DaemonSet, Operator, node-level agent를 추가하지 않습니다.
- `sudo`를 실행하지 않습니다.
- AWS 구성을 변경하지 않습니다.
- 명시적으로 요청받지 않는 한 GitHub에 push하지 않습니다.
- Slack webhook URL, 토큰, kubeconfig 내용 또는 기타 secret을 파일에 쓰지 않습니다.
- 불명확한 요구사항은 `docs/DECISIONS.md`에 가정 또는 open question으로 기록합니다.

## 저장소 구조

- `docs/REQUIREMENTS.md`: MVP 제품 및 기능 요구사항.
- `docs/ARCHITECTURE.md`: 초기 모노레포 및 런타임 아키텍처.
- `docs/API_CONTRACT.md`: MVP의 백엔드/프론트엔드 API 경계.
- `docs/DECISIONS.md`: 승인된 결정, 가정, 미해결 질문.
- `TASKS.md`: 작은 작업 단위로 나눈 순서 있는 구현 계획.
- `scripts/slack-notify.sh`: 환경에서 제공되는 secret을 사용해 짧은 완료 요약을 Slack으로 보냅니다.

## 엔지니어링 방향

- 구현이 시작되면 `backend`와 `frontend` 워크스페이스만 포함하는 모노레포로 시작합니다.
- 백엔드만 Kubernetes API와 직접 통신합니다.
- 프론트엔드는 백엔드 API와만 통신합니다.
- 리소스 상태에는 Kubernetes watch/list API를 사용하고, CPU 및 메모리에는 `metrics.k8s.io`를 통한 metrics-server 사용을 고려합니다.
- Prometheus 통합은 MVP 범위 밖으로 유지하되, 이후 추가를 막는 API 선택은 피합니다.
- 먼저 단순 polling 또는 server-sent update를 선호하고, UX가 필요로 할 때만 더 무거운 realtime 인프라를 도입합니다.

## 초기 설계 완료 기준

- MVP 요구사항, 아키텍처, API 계약, 결정 사항, 구현 작업 계획이 작성되어 있습니다.
- 애플리케이션 코드 또는 package manifest가 추가되지 않았습니다.
- `scripts/slack-notify.sh`를 통해 Slack이 완료 요약을 받았습니다.
