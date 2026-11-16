#!/usr/bin/env bash
# ============================================
# 构建多架构镜像并推送到 Docker Hub
#
# 用法：
#   bash scripts/build-push.sh <镜像名> [标签]
#   bash scripts/build-push.sh doulicon/abxy-arcade 1.0.0
#
# 也可用环境变量：
#   IMAGE_NAME=doulicon/abxy-arcade TAG=1.0.0 bash scripts/build-push.sh
#
# 其他参数：
#   --platforms linux/amd64,linux/arm64   目标架构（默认两者都出）
#   --no-push                             只在本机构建当前架构镜像并载入
#   --no-cache                            不用构建缓存
#
# 前置：docker login（推送必须），以及 buildx 能力（Docker 19.03+ 自带）
# ============================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

IMAGE="${IMAGE_NAME:-}"
TAG="${TAG:-latest}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"
PUSH=1
NOCACHE=""
BUILDER="abxy-builder"

usage() {
  awk 'NR>1 && /^#/ { sub(/^# ?/, ""); print; next } NR>1 { exit }' "$0"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --platforms) PLATFORMS="${2:-}"; shift 2 ;;
    --no-push) PUSH=0; shift ;;
    --no-cache) NOCACHE="--no-cache"; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "[错误] 未知参数: $1" >&2; exit 1 ;;
    *) if [ -z "$IMAGE" ]; then IMAGE="$1"; else TAG="$1"; fi; shift ;;
  esac
done

# ---- 从 .env 兜底读取镜像名 ----
if [ -z "$IMAGE" ] && [ -f .env ]; then
  IMAGE="$(sed -n 's/^IMAGE_NAME=//p' .env | tail -1 | tr -d '"'"'"' \r')"
fi
if [ -z "$IMAGE" ]; then
  echo "[错误] 请指定镜像名，例如：" >&2
  echo "       bash scripts/build-push.sh doulicon/abxy-arcade 1.0.0" >&2
  exit 1
fi
# 去掉误加的 :tag 后缀，标签统一由 TAG 控制
IMAGE="${IMAGE%%:*}"

# ---- docker 是否需要 sudo ----
DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  if [ "$(id -u)" != "0" ] && sudo -n docker info >/dev/null 2>&1; then
    DOCKER="sudo docker"
    echo "[提示] 当前用户无 docker 权限，自动改用 sudo docker"
  else
    echo "[错误] 无法连接 Docker 守护进程。请确认 Docker 已启动，或用 sudo 运行本脚本。" >&2
    exit 1
  fi
fi

if ! $DOCKER buildx version >/dev/null 2>&1; then
  echo "[错误] 未找到 docker buildx。请升级 Docker 到 19.03 以上，或在有 Docker 的电脑上构建。" >&2
  exit 1
fi

COMMIT="$(git rev-parse --short=7 HEAD 2>/dev/null || echo nogit)"
if [ -n "$(git status --porcelain 2>/dev/null | head -1)" ]; then
  echo "[提示] 工作区有未提交改动，镜像内容会与 $COMMIT 不完全一致"
fi

TAGS=(-t "$IMAGE:$TAG")
if [ "$TAG" != "latest" ]; then TAGS+=(-t "$IMAGE:latest"); fi
TAGS+=(-t "$IMAGE:sha-$COMMIT")

echo "============================================"
echo " 镜像     : $IMAGE"
echo " 标签     : $TAG, latest, sha-$COMMIT"
echo " 架构     : $PLATFORMS"
echo " 推送     : $([ "$PUSH" = 1 ] && echo 是 || echo 否（仅本机载入）)"
echo "============================================"

if [ "$PUSH" = 0 ]; then
  # 多架构镜像无法 load 到本地，只能取当前机器架构单平台
  HOST_ARCH="$($DOCKER version --format '{{.Server.Arch}}' 2>/dev/null || echo amd64)"
  echo "[1/2] 本机构建（linux/$HOST_ARCH）..."
  $DOCKER build $NOCACHE --platform "linux/$HOST_ARCH" "${TAGS[@]}" -t "$IMAGE:local" .
  echo "[2/2] 完成：本地镜像 $IMAGE:$TAG"
  echo "     直接跑：docker run -d --name abxy-arcade -p 30000:3000 -v \$PWD/data:/data $IMAGE:$TAG"
  exit 0
fi

# ---- 准备 buildx builder（docker-container 驱动才能跨架构）----
if ! $DOCKER buildx inspect "$BUILDER" >/dev/null 2>&1; then
  echo "[1/3] 创建 buildx 构建器 $BUILDER ..."
  $DOCKER buildx create --name "$BUILDER" --driver docker-container --bootstrap >/dev/null
fi

echo "[2/3] 构建并推送（首次需下载 QEMU，跨架构编译会更慢，请耐心等待）..."
# 老版本 buildx 没有 --provenance，按能力决定是否带上，避免直接报错退出
PROV=""
if $DOCKER buildx build --help 2>&1 | grep -q -- '--provenance'; then
  PROV="--provenance=false"
fi
$DOCKER buildx build \
  --builder "$BUILDER" \
  --platform "$PLATFORMS" \
  $NOCACHE \
  $PROV \
  "${TAGS[@]}" \
  --push \
  .

echo "[3/3] 完成。验证："
echo "     docker buildx imagetools inspect $IMAGE:$TAG"
echo ""
echo "别人部署时只需："
echo "     docker pull $IMAGE:$TAG"
