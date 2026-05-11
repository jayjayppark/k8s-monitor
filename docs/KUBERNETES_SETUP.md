# EC2 Kubernetes 설정

## 목적

이 문서는 EC2 dev box에서 MVP smoke test에 사용할 K3s 단일 노드 Kubernetes를 준비하는 기준입니다. AWS security group, IAM, VPC 같은 AWS 구성은 이 프로젝트 작업 범위가 아니며 여기서 변경하지 않습니다.

## 설치 대상

- K3s single-node server.
- `kubectl` symlink.
- 현재 사용자에서 읽을 수 있는 kubeconfig.
- K3s 기본 addon으로 제공되는 metrics-server.

Node.js와 pnpm은 애플리케이션 개발 도구이고, K3s와 별도로 준비합니다.

```sh
node --version
pnpm --version
```

## K3s 설치

K3s 설치는 systemd service, `/usr/local/bin`, `/etc/rancher/k3s`를 수정하므로 `sudo`가 필요합니다. Slack 작업에서는 사용자가 명시적으로 허용한 경우에만 실행합니다.

```sh
curl -sfL https://get.k3s.io | sudo sh -s - --write-kubeconfig-mode 600
```

서비스 상태 확인:

```sh
systemctl is-active k3s
```

`active`가 기대값입니다.

## kubeconfig 준비

K3s는 기본 kubeconfig를 `/etc/rancher/k3s/k3s.yaml`에 만듭니다. 백엔드와 smoke test는 일반 사용자에서 실행되므로 사용자 홈에 kubeconfig를 준비합니다. kubeconfig 내용은 출력하거나 저장소에 커밋하지 않습니다.

```sh
mkdir -p "$HOME/.kube"
sudo install -o "$(id -u)" -g "$(id -g)" -m 600 /etc/rancher/k3s/k3s.yaml "$HOME/.kube/config"
```

K3s의 `kubectl` wrapper는 `/etc/rancher/k3s/k3s.yaml`을 먼저 보려고 할 수 있으므로, 일반 사용자 명령에는 `KUBECONFIG`를 명시합니다.

```sh
KUBECONFIG=$HOME/.kube/config kubectl get nodes
KUBECONFIG=$HOME/.kube/config kubectl get namespaces
KUBECONFIG=$HOME/.kube/config kubectl get --raw /version
```

## metrics-server 확인

K3s 기본 설치에는 metrics-server가 포함됩니다. Pod가 Running 상태가 될 때까지 기다린 뒤 확인합니다.

```sh
KUBECONFIG=$HOME/.kube/config kubectl get pods -n kube-system
KUBECONFIG=$HOME/.kube/config kubectl top nodes
KUBECONFIG=$HOME/.kube/config kubectl get --raw /apis/metrics.k8s.io/v1beta1/nodes
```

metrics-server가 준비되기 전에는 `kubectl top`이나 metrics raw API가 일시적으로 실패할 수 있습니다. 이 경우 백엔드는 inventory API를 계속 반환하고 usage만 `null` 또는 unavailable로 표시해야 합니다.

## 애플리케이션 실행

백엔드:

```sh
HOST=0.0.0.0 PORT=3000 KUBECONFIG=$HOME/.kube/config pnpm dev:backend
```

프론트엔드:

```sh
VITE_BACKEND_PROXY_TARGET=http://127.0.0.1:3000 pnpm --filter @k8s-monitor/frontend dev --host 0.0.0.0
```

브라우저:

```text
http://<EC2_PUBLIC_IP>:5173
```

외부 브라우저 접근에는 EC2 security group에서 `5173/tcp`가 허용되어 있어야 합니다. AWS 보안 그룹 변경은 이 문서의 절차에 포함하지 않습니다.

## 제거

테스트용 EC2에서 K3s를 제거해야 할 때만 실행합니다.

```sh
sudo /usr/local/bin/k3s-uninstall.sh
```

제거 명령은 Kubernetes 클러스터와 로컬 K3s 데이터를 삭제합니다. 필요한 테스트가 끝났고 삭제해도 되는 EC2에서만 실행합니다.
