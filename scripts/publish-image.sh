#!/usr/bin/env bash
# ============================================================
# 构建并发布镜像（阿里云 ACR / GHCR / Docker Hub 通用）
#
# 用法：
#   bash scripts/publish-image.sh <仓库前缀> [版本号]
#
#   # 阿里云 ACR（推荐，国内最快）
#   bash scripts/publish-image.sh registry.cn-hangzhou.aliyuncs.com/你的命名空间 1.0.0
#
#   # GHCR
#   bash scripts/publish-image.sh ghcr.io/你的GitHub用户名 1.0.0
#
#   # Docker Hub
#   bash scripts/publish-image.sh doulicon 1.0.0
#
# 选项：
#   --single     只构建当前机器架构（没有 buildx，或不想等跨架构编译）
#   --platforms  指定架构，默认 linux/amd64,linux/arm64
#
# 认证：会提示输入密码/令牌（不回显），也可用环境变量：
#   REGISTRY_USER=xxx REGISTRY_PASS=xxx bash scripts/publish-image.sh ...
#
# 注意：阿里云 ACR 的密码不是阿里云登录密码，而是
#       「容器镜像服务 → 访问凭证」里设置的固定密码。
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."

BASE=""
VERSION=""
SINGLE=0
PLATFORMS="linux/amd64,linux/arm64"

while [ $# -gt 0 ]; do
  case "$1" in
    --single) SINGLE=1; shift ;;
    --platforms) PLATFORMS="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*) echo "[错误] 未知参数: $1" >&2; exit 1 ;;
    *) if [ -z "$BASE" ]; then BASE="$1"; else VERSION="$1"; fi; shift ;;
  esac
done

if [ -z "$BASE" ]; then
  echo "[错误] 请给出仓库前缀，例如：" >&2
  echo "       bash scripts/publish-image.sh registry.cn-hangzhou.aliyuncs.com/你的命名空间 1.0.0" >&2
  exit 1
fi
VERSION="${VERSION:-1.0.0}"
BASE="${BASE%/}"
IMAGE="$BASE/abxy-arcade"

# 第一段带点或带端口视为仓库域名，否则是 Docker Hub
FIRST="${BASE%%/*}"
if [ "$FIRST" = "$BASE" ]; then
  REGISTRY="docker.io"
  LOGIN_HOST=""
  LOGIN_USER_DEFAULT="$BASE"
else
  case "$FIRST" in
    *.*|*:*) REGISTRY="$FIRST"; LOGIN_HOST="$FIRST"
             # 默认用户名取路径第二段（ghcr.io/doulicon -> doulicon）
             LOGIN_USER_DEFAULT="${BASE#*/}"; LOGIN_USER_DEFAULT="${LOGIN_USER_DEFAULT%%/*}" ;;
    *) REGISTRY="docker.io"; LOGIN_HOST=""; LOGIN_USER_DEFAULT="$FIRST" ;;
  esac
fi

# ---- docker 命令（NAS 上守护进程通常只对 root 开放） ----
DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  if [ "$(id -u)" != "0" ] && command -v sudo >/dev/null 2>&1 && sudo -n docker info >/dev/null 2>&1; then
    DOCKER="sudo docker"
    echo "[提示] 当前用户无 docker 权限，自动改用 sudo docker"
  else
    echo "[错误] 无法连接 Docker 守护进程，请用 sudo 运行本脚本。" >&2
    exit 1
  fi
fi

HOST_ARCH="$($DOCKER version --format '{{.Server.Arch}}' 2>/dev/null || echo unknown)"
HAS_BUILDX=0
$DOCKER buildx version >/dev/null 2>&1 && HAS_BUILDX=1
MULTI=0
if [ "$SINGLE" = 0 ] && [ "$HAS_BUILDX" = 1 ]; then MULTI=1; fi

echo "============================================"
echo " 仓库     : $REGISTRY"
echo " 镜像     : $IMAGE"
echo " 标签     : $VERSION, latest"
echo " 本机架构 : $HOST_ARCH"
if [ "$MULTI" = 1 ]; then
  echo " 目标架构 : $PLATFORMS"
else
  echo " 目标架构 : 仅 linux/$HOST_ARCH（单架构）"
fi
echo "============================================"
echo

# ---- 1. 登录 ----
echo "[1/4] 登录 $REGISTRY ..."
U="${REGISTRY_USER:-}"
P="${REGISTRY_PASS:-}"
if [ -z "$U" ]; then
  printf "      用户名（%s）：" "${LOGIN_USER_DEFAULT:-$REGISTRY}"
  read -r U
  [ -z "$U" ] && U="${LOGIN_USER_DEFAULT:-}"
fi
if [ -z "$P" ]; then
  printf "      密码 / 令牌（不回显）："
  read -rs P
  echo
fi
if [ -z "$U" ] || [ -z "$P" ]; then
  echo "[错误] 用户名或密码为空" >&2
  exit 1
fi
if [ -n "$LOGIN_HOST" ]; then
  printf '%s' "$P" | $DOCKER login "$LOGIN_HOST" -u "$U" --password-stdin
else
  printf '%s' "$P" | $DOCKER login -u "$U" --password-stdin
fi
unset P

# ---- 2. 构建 ----
echo
if [ "$MULTI" = 1 ]; then
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
    --platform "$PLATFORMS" \
    $PROV \
    -t "$IMAGE:$VERSION" -t "$IMAGE:latest" \
    --push \
    .
else
  echo "[2/4] 构建单架构镜像（$HOST_ARCH）..."
  PLAT=""
  if $DOCKER build --help 2>&1 | grep -q -- '--platform'; then
    PLAT="--platform linux/$HOST_ARCH"
  fi
  $DOCKER build $PLAT -t "$IMAGE:$VERSION" -t "$IMAGE:latest" .
fi

# ---- 3. 推送 ----
echo
if [ "$MULTI" = 1 ]; then
  echo "[3/4] 多架构镜像已在构建阶段推送，跳过"
else
  echo "[3/4] 推送两个标签 ..."
  $DOCKER push "$IMAGE:$VERSION"
  $DOCKER push "$IMAGE:latest"
fi

# ---- 4. 校验 ----
echo
echo "[4/4] 校验 ..."
DIGEST="?"
if [ "$MULTI" = 1 ]; then
  DIGEST="$($DOCKER buildx imagetools inspect "$IMAGE:$VERSION" 2>/dev/null | sed -n 's/^Digest: *//p' | head -1 || echo '?')"
else
  DIGEST="$($DOCKER inspect --format '{{index .RepoDigests 0}}' "$IMAGE:$VERSION" 2>/dev/null | sed 's/.*@//' || echo '?')"
fi

echo
echo "============================================"
echo " 推送完成"
[ "$DIGEST" != "?" ] && echo " Digest: $DIGEST"
echo
echo " 下一步：把仓库设为「公开」，否则别人拉不动"
case "$REGISTRY" in
  registry.cn-*.aliyuncs.com)
    echo "   阿里云控制台 → 容器镜像服务 → 命名空间 → 仓库 abxy-arcade → 编辑 → 仓库类型改为「公开」" ;;
  ghcr.io)
    echo "   GitHub → Your packages → abxy-arcade → Package settings → Change visibility → Public" ;;
  docker.io)
    echo "   https://hub.docker.com/repositories → abxy-arcade → Settings → Visibility → Public" ;;
  *) echo "   在仓库管理界面把 abxy-arcade 的可见性设为公开" ;;
esac
echo
echo " 验证别人能否匿名拉取（退出登录后试拉一次）："
echo "   $DOCKER logout $REGISTRY"
echo "   $DOCKER pull $IMAGE:$VERSION"
echo "   （拉取成功 = 已公开；之后需要推送时重新 login 即可）"
echo "============================================"
