#!/usr/bin/env bash
# ============================================================
# ABXY ARCADE 安全更新脚本
#
# 设计原则：数据目录完全不参与更新流程。
#   - data/ 已在 .gitignore 和 .dockerignore 中排除，git pull 不会动它
#   - docker-compose 用 bind mount 把宿主机 data/ 挂进容器，重建镜像不影响
#   - 本脚本只做「备份 + 取新代码 + 重建镜像 + 滚动重启」
#
# 用法：
#   chmod +x scripts/update.sh
#   ./scripts/update.sh              # git 拉取模式（默认）
#   ./scripts/update.sh --no-pull    # 已手动放好新代码，只重建
#   ./scripts/update.sh --skip-backup
# ============================================================
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"

PULL=1
BACKUP=1
for arg in "$@"; do
  case "$arg" in
    --no-pull) PULL=0 ;;
    --skip-backup) BACKUP=0 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "未知参数: $arg" >&2; exit 1 ;;
  esac
done

# ---- 读取 .env（DATA_PATH / ROM_PATH / HOST_PORT） ----
if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi
DATA_DIR="${DATA_PATH:-./data}"
HOST_PORT="${HOST_PORT:-30000}"

# ---- 选择 docker 命令（群晖 / NAS 上 docker 守护进程通常只对 root 开放） ----
DOCKER="docker"
if ! docker info >/dev/null 2>&1 && [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  DOCKER="sudo docker"
fi
if ! $DOCKER info >/dev/null 2>&1; then
  echo "[错误] 当前用户无法访问 Docker 守护进程。" >&2
  echo "       请改用：sudo bash scripts/update.sh" >&2
  exit 1
fi

# ---- 选择 compose 命令（兼容新版插件与旧版独立二进制） ----
if $DOCKER compose version >/dev/null 2>&1; then
  DC="$DOCKER compose"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
  [ "$DOCKER" = "sudo docker" ] && DC="sudo docker-compose"
else
  echo "[错误] 未找到 docker compose，请先安装 Docker Compose" >&2
  exit 1
fi

echo "============================================"
echo " ABXY ARCADE 更新"
echo " 项目目录: $ROOT"
echo " 数据目录: $DATA_DIR   <- 本次更新不会修改它"
echo " 访问端口: $HOST_PORT"
echo "============================================"
echo

# ---- 1. 备份数据（只备份小文件，跳过 roms/tmp） ----
if [ "$BACKUP" = 1 ]; then
  if [ -d "$DATA_DIR" ]; then
    STAMP="$(date +%Y%m%d-%H%M%S)"
    mkdir -p backups
    TARGET="backups/data-$STAMP.tar.gz"
    echo "[1/5] 备份数据（数据库 / 封面 / 素材 / BIOS / JWT 密钥）..."
    # roms 体积通常很大且更新流程不碰它，默认不打包，避免备份耗时数十分钟
    tar -czf "$TARGET" \
      -C "$DATA_DIR" \
      --exclude='./roms' \
      --exclude='./tmp' \
      . 2>/dev/null || true
    if [ -s "$TARGET" ]; then
      echo "      已备份到 $TARGET ($(du -h "$TARGET" | cut -f1))"
    else
      echo "      [警告] 备份文件为空，已跳过（数据目录可能尚未初始化）"
      rm -f "$TARGET"
    fi
  else
    echo "[1/5] 数据目录 $DATA_DIR 不存在，全新部署，跳过备份"
  fi
else
  echo "[1/5] 已跳过备份 (--skip-backup)"
fi

# ---- 2. 取新代码 ----
# 用 sudo 运行时 Git 会因仓库属主与当前用户不同而报 dubious ownership，
# 统一用 -c safe.directory 规避，不去改全局配置。
gitc() { git -c safe.directory="$ROOT" "$@"; }

if [ "$PULL" = 1 ]; then
  if [ -d .git ] && gitc rev-parse --verify --quiet HEAD >/dev/null 2>&1; then
    echo "[2/5] 拉取最新代码..."
    gitc rev-parse --abbrev-ref HEAD | grep -qx main || echo "      [提示] 当前不在 main 分支"
    # 本地有未提交改动时先停下，避免 merge 冲突弄坏工作区
    if [ -n "$(gitc status --porcelain)" ]; then
      echo "      [错误] 工作区有未提交改动，请先处理：" >&2
      gitc status --short >&2
      exit 1
    fi
    BEFORE="$(gitc rev-parse --short HEAD)"
    gitc pull --ff-only origin main
    AFTER="$(gitc rev-parse --short HEAD)"
    if [ "$BEFORE" = "$AFTER" ]; then
      echo "      已是最新版本 ($AFTER)"
    else
      echo "      已更新 $BEFORE -> $AFTER"
    fi
    # sudo 拉取会产生 root 属主的 .git，交还给调用者，避免下次普通用户 git 报权限错误
    if [ "$(id -u)" -eq 0 ] && [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
      chown -R "$SUDO_USER": .git 2>/dev/null || true
    fi
  else
    echo "[2/5] 未检测到可用的 git 仓库，跳过代码拉取"
    echo "      如需从 Gitea 取新代码：bash scripts/sync-code.sh --no-deploy"
  fi
else
  echo "[2/5] 已跳过代码拉取 (--no-pull)"
fi

# ---- 3. 重建镜像（旧容器继续提供服务，网站不停机） ----
echo "[3/5] 重建镜像（旧版本仍在提供服务）..."
$DC build

# ---- 4. 滚动重启 ----
echo "[4/5] 切换到新版本..."
if ! $DC up -d --remove-orphans; then
  # 常见于旧容器是手工 docker run 起的，compose 认不出它的归属，只报名字冲突
  if $DOCKER ps -a --format '{{.Names}}' | grep -qx 'abxy-arcade'; then
    echo "      [提示] 容器名冲突，移除旧容器后重试（data 是 bind mount，不受影响）..."
    $DOCKER rm -f abxy-arcade
    $DC up -d --remove-orphans
  else
    echo "[错误] 启动失败，请查看：$DC logs --tail=50" >&2
    exit 1
  fi
fi

# ---- 5. 健康检查 ----
echo "[5/5] 等待服务就绪..."
# 宿主机不一定装了 curl，按 curl -> wget -> docker ps 顺序降级
probe() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS -m 2 "http://127.0.0.1:${HOST_PORT}/api/health" >/dev/null 2>&1
  elif command -v wget >/dev/null 2>&1; then
    wget -q -T 2 -O /dev/null "http://127.0.0.1:${HOST_PORT}/api/health" 2>/dev/null
  else
    # 没有 HTTP 工具时退化为「容器是否 running」，healthcheck 由 Docker 自己判定
    [ "$($DC ps --format '{{.State}}' 2>/dev/null | head -1)" = "running" ]
  fi
}

OK=0
for _ in $(seq 1 30); do
  if probe; then
    OK=1
    break
  fi
  sleep 1
done

echo
if [ "$OK" = 1 ]; then
  echo "✅ 更新完成，服务运行正常"
  echo "   访问地址: http://<服务器IP>:${HOST_PORT}"
else
  echo "⚠️  服务未在 30 秒内就绪，请查看日志："
  echo "   $DC logs --tail=50"
  echo
  echo "   如需回滚到上一版本："
  echo "   1) 代码：git reset --hard <上一个提交>"
  echo "   2) 数据：tar -xzf backups/data-<时间戳>.tar.gz -C $DATA_DIR"
  exit 1
fi
