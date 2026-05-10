# 구현 작업

이 파일은 현재 기준의 실행 순서만 남깁니다. 완료된 배경 설명이나 오래된 결정 히스토리는 유지하지 않습니다.

## 0. 문서와 이슈 정리

1. [x] 문서를 현재 기준으로 정리합니다.
2. [x] GitHub Issue를 현재 MVP 방향과 문서 구조에 맞게 갱신합니다.
3. [x] Slack bot이 자연어 요청으로 질문/작업을 처리하고, 핵심 문서와 issue 본문을 자동 컨텍스트로 전달하도록 개선합니다.
4. [ ] #28 EC2에서 필요한 설치 항목과 실행 명령을 구현 결과에 맞게 최신화합니다.

## 1. 백엔드 기반

1. [x] #3 Fastify API server skeleton과 `/api/health`를 구현합니다.
2. [x] #5 공통 API envelope과 error response helper를 구현합니다.
3. [x] #4 kubeconfig 기반 Kubernetes config loading과 client 초기화를 구현합니다.
4. [x] #6 Kubernetes connectivity와 metrics-server availability check를 구현합니다.

## 2. Kubernetes 데이터 정규화

1. [x] #7 Namespace와 Node DTO normalization을 구현합니다.
2. [x] #8 Pod inventory와 Pod detail DTO normalization을 구현합니다.
3. [x] #9 Deployment와 ReplicaSet workload normalization을 구현합니다.
4. [x] #10 StatefulSet, DaemonSet, Service workload normalization을 구현합니다.
5. [x] #11 Event listing과 normalization을 구현합니다.
6. [ ] #12 Node와 Pod metrics 조회 및 병합을 구현합니다.

## 3. 백엔드 API

1. [x] #13 `GET /api/cluster/summary`를 구현합니다.
2. [x] #14 `GET /api/nodes`, `GET /api/namespaces`를 구현합니다.
3. [x] #15 `GET /api/workloads`와 filter를 구현합니다.
4. [x] #16 `GET /api/pods/{namespace}/{name}`을 구현합니다.
5. [x] #17 `GET /api/events`를 구현합니다.
6. [x] #34 alert candidate 계산과 `GET /api/alerts`를 구현합니다.

## 4. 프론트엔드

1. [x] #18 React app shell과 dashboard navigation을 구현합니다.
2. [x] #19 백엔드 API client와 DTO handling을 구현합니다.
3. [x] #20 loading, empty, degraded, error state component를 구현합니다.
4. [x] #21 table과 filter component를 구현합니다.
5. [x] #22 cluster summary dashboard를 구현합니다.
6. [ ] #23 nodes와 namespaces view를 구현합니다.
7. [ ] #24 workloads view와 filter를 구현합니다.
8. [ ] #25 pod detail view를 구현합니다.
9. [x] #26 events view 또는 recent events panel을 구현합니다.
10. [x] #35 브라우저 alert banner/notification panel을 구현합니다.
11. [ ] #27 frontend regression/responsive checks를 추가합니다.

## 5. 실행 문서와 검증

1. [ ] #28 로컬/EC2 개발 설정을 문서화합니다.
2. [ ] #29 읽기 전용 Kubernetes RBAC 요구사항을 문서화합니다.
3. [ ] #30 EC2 단일 노드 Kubernetes smoke test 절차를 문서화하고 실행합니다.
4. [ ] #36 Slack webhook 기반 alert 전송을 구현합니다.
5. [ ] #32 install, lint, typecheck, test를 실행하는 CI를 추가합니다.
6. [ ] #31 MVP release 전 보안 경계와 읽기 전용 동작을 검증합니다.
