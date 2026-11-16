#!/usr/bin/env bash
# ============================================================
# 构建并发布镜像到 Docker Hub（一条命令完成构建 + 推送 + 校验）
#
# 用法：
#   bash scripts/publish-dockerhub.sh <DockerHub用户名> [版本号]
#   bash scripts/publish-dockerhub.sh doulicon 1.0.0
#
# 选项：
#   --single     只构建当前机器架构（没有 buildx，或不想等跨架构编译时用）
#
# 认证：交互输入 Access Token（推荐），或用环境变量传入：
#   DOCKERHUB_TOKEN=xxx bash scripts/publish-dockerhub.sh doulicon 1.0.0
#
# 说明：Access Token 在 hub.docker.com -> Account settings ->
#       Personal access tokens 生成，权限选 Read & Write。
#       不要用登录密码。
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

SINGLE=0
USER_NAME=""
VERSION=""

while [ $# -gt 0 ]; do
  case "$1" in
    --single) SINGLE=1; shift ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "[错误] 未知参数: $1" >&2; exit 1 ;;
    *) if [ -z "$USER_NAME" ]; then USER_NAME="$1"; else VERSION="$1"; fi; shift ;;
  esac
done

if [ -z "$USER_NAME" ]; then
  echo "[错误] 请给出 Docker Hub 用户名，例如：" >&2
  echo "       bash scripts/publish-dockerhub.sh doulicon 1.0.0" >&2
  exit 1
fi
VERSION="${VERSION:-1.0.0}"
USER_NAME="${USER_NAME,,}"          # Docker Hub 用户名只能小写
REPO="abxy-arcade"
IMAGE="$USER_NAME/$REPO"

# ---- docker 命令（NAS 上守护进程通常只对 root 开放） ----
DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  if [ "$(id -u)" != "0" ] && command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
    DOCKER="sudo docker"
    echo "[提示] 当前用户无 docker 权限，自动改用 sudo docker"
  else
    echo "[错误] 无法连接 Docker 守护进程，请用：sudo bash scripts/publish-dockerhub.sh $USER_NAME $VERSION" >&2
    exit 1
  fi
fi

HOST_ARCH="$($DOCKER version --format '{{.Server.Arch}}' 2>/dev/null || echo unknown)"
HAS_BUILDX=0
$DOCKER buildx version >/dev/null 2>&1 && HAS_BUILDX=1

echo "============================================"
echo " 镜像    : $IMAGE"
echo " 标签    : $VERSION, latest"
echo " 本机架构: $HOST_ARCH"
if [ "$SINGLE" = 1 ] || [ "$HAS_BUILDX" = 0 ]; then
  echo " 架构    : 仅 $HOST_ARCH（单架构）"
else
  echo " 架构    : linux/amd64, linux/arm64（多架构）"
fi
echo "============================================"
echo

# ---- 1. 登录 ----
echo "[1/4] 登录 Docker Hub ..."
TOKEN="${DOCKERHUB_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  printf "      粘贴 Access Token（输入不回显）："
  read -rs TOKEN
  echo
fi
if [ -z "$TOKEN" ]; then
  echo "[错误] 未提供 Token" >&2
  exit 1
fi
printf '%s' "$TOKEN" | $DOCKER login -u "$USER_NAME" --password-stdin
unset TOKEN

# ---- 2. 构建 ----
if [ "$SINGLE" = 1 ] || [ "$HAS_BUILDX" = 0 ]; then
  echo
  echo "[2/4] 构建单架构镜像（$HOST_ARCH）..."
  # --platform 需要 Docker 19.03+，老版本不认识这个参数会直接报错
  PLAT=""
  if $DOCKER build --help 2>&1 | grep -q -- '--platform'; then
    PLAT="--platform linux/$HOST_ARCH"
  fi
  $DOCKER build $PLAT \
    -t "$IMAGE:$VERSION" -t "$IMAGE:latest" .
else
  echo
  echo "[2/4] 多架构构建（首次会拉取 QEMU 与 buildkit，比较慢）..."
  BUILDER="abxy-builder"
  if ! $DOCKER buildx inspect "$BUILDER" >/dev/null 2>&1; then
    echo "      创建构建器 $BUILDER ..."
    $DOCKER buildx create --name "$BUILDER" --driver docker-container --bootstrap >/dev/null
  fi
  PROV=""
  if $DOCKER buildx build --help 2>&1 | grep -q -- '--provenance'; then
    PROV="--provenance=false"
  fi
  $DOCKER buildx build \
    --builder "$BUILDER" \
    --platform linux/amd64,linux/arm64 \
    $PROV \
    -t "$IMAGE:$VERSION" -t "$IMAGE:latest" \
    --push \
    .
fi

# ---- 3. 推送（buildx 已在构建时 --push，这里只处理单架构分支） ----
echo
if [ "$SINGLE" = 1 ] || [ "$HAS_BUILDX" = 0 ]; then
  echo "[3/4] 推送两个标签 ..."
  $DOCKER push "$IMAGE:$VERSION"
  $DOCKER push "$IMAGE:latest"
else
  echo "[3/4] 多架构镜像已在构建阶段推送，跳过"
fi

# ---- 4. 校验 ----
echo
echo "[4/4] 校验 ..."
CODE=""
if command -v curl >/dev/null 2>&1; then
  CODE="$(curl -s -o /dev/null -w '%{http_code}' -m 20 "https://hub.docker.com/v2/repositories/$IMAGE/" || true)"
fi

DIGEST="?"
if [ "$HAS_BUILDX" = 1 ] && [ "$SINGLE" = 0 ]; then
  DIGEST="$($DOCKER buildx imagetools inspect "$IMAGE:$VERSION" 2>/dev/null | sed -n 's/^Digest: *//p' | head -1 || echo '?')"
fi

echo
echo "============================================"
if [ "$CODE" = "200" ]; then
  echo " ✅ 发布完成，仓库公开可拉"
else
  echo " ⚠️  镜像已推送，但仓库可能仍是私有（API 返回 ${CODE:-未知}）"
  echo
  echo "    去这里把可见性改成 Public（命令行创建的新仓库常见为私有）："
  echo "    https://hub.docker.com/repositories/$USER_NAME"
  echo "    → $REPO → Settings → Visibility → Public"
fi
[ "$DIGEST" != "?" ] && echo " Digest: $DIGEST"
echo
echo " 别人拉取：docker pull $IMAGE:latest"
echo " 自己验证：docker run --rm -d -p 30000:3000 -v /tmp/abxy-test:/data $IMAGE:latest"
echo "============================================"
