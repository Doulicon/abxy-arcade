#!/bin/sh
# 以 root 进入容器，修正数据卷权限后降权到 node 用户运行
set -e

DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR/roms" "$DATA_DIR/covers" "$DATA_DIR/bios"

# 确保 /app 代码目录对 node 用户可读（兜底，避免 COPY 后权限异常导致 EACCES）
chown -R node:node /app 2>/dev/null || true
chmod -R a+rX /app 2>/dev/null || true

# 仅在 node 用户不可写时才递归修正，避免每次启动扫描大量 ROM
if ! gosu node test -w "$DATA_DIR" 2>/dev/null; then
  echo "[entrypoint] 修正数据目录权限: $DATA_DIR"
  chown -R node:node "$DATA_DIR" 2>/dev/null || true
fi

exec gosu node "$@"
