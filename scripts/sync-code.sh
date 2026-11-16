#!/usr/bin/env bash
# ============================================================
# ABXY ARCADE 代码同步（不依赖 git 的部署通道）
#
# 适用场景：NAS 上的 git 缺 HTTP 传输模块，执行 git fetch 会报
#   git: 'remote-http' is not a git command
# 本脚本改用 Gitea 的归档下载接口取代码，再用 rsync 覆盖到项目目录。
#
# 数据安全：data/、backups/、.env、.git 全部排除，
#   既不会被覆盖，也不会被 --delete 删掉。
#
# 用法：
#   bash scripts/sync-code.sh              # 同步代码 + 自动重建部署
#   bash scripts/sync-code.sh --no-deploy  # 只同步代码，不重建镜像
#   bash scripts/sync-code.sh --dry-run    # 预演，只列出会变动的文件
#
# 可用环境变量覆盖：
#   ABXY_HOST=http://192.168.0.227:30001
#   ABXY_REPO=nas/ABXY
#   ABXY_REF=main
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

HOST="${ABXY_HOST:-http://192.168.0.227:30001}"
REPO_SLUG="${ABXY_REPO:-nas/ABXY}"
REF="${ABXY_REF:-main}"

DEPLOY=1
DRYRUN=0
for arg in "$@"; do
  case "$arg" in
    --no-deploy) DEPLOY=0 ;;
    --dry-run|-n) DRYRUN=1 ;;
    -h|--help) sed -n '2,25p' "$0"; exit 0 ;;
    *) echo "未知参数: $arg" >&2; exit 1 ;;
  esac
done

ARCHIVE="$HOST/$REPO_SLUG/archive/$REF.tar.gz"
API="$HOST/api/v1/repos/$REPO_SLUG/branches/$REF"

echo "============================================"
echo " ABXY ARCADE 代码同步"
echo " 项目目录: $ROOT"
echo " 代码来源: $ARCHIVE"
echo " 数据目录: ${DATA_PATH:-./data}   <- 本次同步不会修改它"
[ "$DRYRUN" = 1 ] && echo " 模式    : 预演（不写入）"
echo "============================================"
echo

# ---- 1. 查询远端最新提交（仅用于展示，失败不影响同步） ----
REMOTE_SHA=""
if command -v curl >/dev/null 2>&1; then
  REMOTE_SHA="$(curl -fsS -m 10 "$API" 2>/dev/null | sed -n 's/.*"commit":{"id":"\([0-9a-f]\{7,40\}\)".*/\1/p' | head -1 || true)"
elif command -v wget >/dev/null 2>&1; then
  REMOTE_SHA="$(wget -q -T 10 -O - "$API" 2>/dev/null | sed -n 's/.*"commit":{"id":"\([0-9a-f]\{7,40\}\)".*/\1/p' | head -1 || true)"
fi
if [ -n "$REMOTE_SHA" ]; then
  echo "[1/4] 远端最新提交: ${REMOTE_SHA:0:7}"
else
  echo "[1/4] 远端最新提交: 查询失败（继续，不影响后续步骤）"
fi

# ---- 2. 下载归档包 ----
# 优先用 /tmp：某些环境（Windows Git Bash）的 mktemp 会返回 C:\... 路径，
# 交给 tar -f 会被当成远程主机（Cannot connect to C:），必须避开。
if [ -d /tmp ] && [ -w /tmp ]; then
  TMP="/tmp/abxy-sync-$$"
  mkdir -p "$TMP"
else
  TMP="$(mktemp -d 2>/dev/null || echo "/tmp/abxy-sync-$$")"
  mkdir -p "$TMP"
fi
trap 'rm -rf "$TMP"' EXIT

SRC="$TMP/src"
TARBALL="$TMP/code.tar.gz"
mkdir -p "$SRC"

echo "[2/4] 下载代码归档（约 40MB）..."
if command -v curl >/dev/null 2>&1; then
  curl -fL --progress-bar -o "$TARBALL" "$ARCHIVE"
elif command -v wget >/dev/null 2>&1; then
  wget -q --show-progress -O "$TARBALL" "$ARCHIVE"
else
  echo "[错误] 需要 curl 或 wget 下载归档包" >&2
  exit 1
fi

if [ ! -s "$TARBALL" ]; then
  echo "[错误] 下载失败（文件为空），请检查 $HOST 是否可访问" >&2
  exit 1
fi
echo "      已下载 $(du -h "$TARBALL" | cut -f1)"

echo "[3/4] 解包..."
tar -xzf "$TARBALL" -C "$SRC" --strip-components=1
if [ ! -f "$SRC/docker-compose.yml" ]; then
  echo "[错误] 归档内容异常，未找到 docker-compose.yml" >&2
  exit 1
fi

# ---- 3. 覆盖到项目目录 ----
if [ "$DRYRUN" = 1 ] && ! command -v rsync >/dev/null 2>&1; then
  echo "[错误] 预演模式需要 rsync，请先安装（群晖套件中心 / sudo synopkg install rsync）" >&2
  exit 1
fi

# 受保护的运行时数据：既排除覆盖，也排除 --delete
PROTECT=(
  --exclude=/data/
  --exclude=/backups/
  --exclude=/.env
  --exclude=/.env.local
  --exclude=/.git/
  --exclude=/node_modules/
  --exclude=/web/node_modules/
  --exclude=/web/dist/
  --exclude=/.workbuddy/
  --exclude=/release-data/
)

RSYNC_ARGS=(-a --delete "${PROTECT[@]}")
if [ "$DRYRUN" = 1 ]; then
  RSYNC_ARGS+=(-n --itemize-changes)
else
  RSYNC_ARGS+=(--stats)
fi
# 以 root 运行时把文件属主交还给调用者，避免下次普通用户改不动
if [ "$(id -u)" -eq 0 ] && [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
  RSYNC_ARGS+=(--chown="$SUDO_USER")
fi

echo "[4/4] 覆盖代码（data / backups / .env 不受影响）..."
if command -v rsync >/dev/null 2>&1; then
  rsync "${RSYNC_ARGS[@]}" "$SRC/" "$ROOT/"
else
  # 没有 rsync 时降级：tar 流式覆盖。只会写文件、不删除任何东西，
  # data / backups / .env 不在归档里，自然不受影响。
  echo "      [提示] 未找到 rsync，改用 tar 覆盖（不会删除旧文件）"
  ( cd "$SRC" && tar -cf - \
      --exclude='./data' --exclude='./backups' --exclude='./.git' \
      --exclude='./node_modules' --exclude='./web/node_modules' \
      . ) | ( cd "$ROOT" && tar -xf - )
fi

if [ "$DRYRUN" = 1 ]; then
  echo
  echo "预演结束，未写入任何文件。去掉 --dry-run 即执行。"
  exit 0
fi

chmod +x "$ROOT"/scripts/*.sh 2>/dev/null || true

echo
echo "✅ 代码已同步到 ${REMOTE_SHA:0:7}"

# ---- 4. 重建部署 ----
if [ "$DEPLOY" = 1 ]; then
  echo
  echo "开始重建镜像并重启（首次或依赖变动时需数分钟）..."
  echo "--------------------------------------------"
  exec bash "$ROOT/scripts/update.sh" --no-pull
else
  echo
  echo "已跳过部署。需要生效时执行："
  echo "  bash scripts/update.sh --no-pull"
fi
