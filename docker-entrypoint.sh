#!/bin/sh
# 以 root 进入容器，修正数据卷权限后降权到 node 用户运行
set -e

DATA_DIR="${DATA_DIR:-/data}"
mkdir -p "$DATA_DIR/roms" "$DATA_DIR/covers" "$DATA_DIR/bios"

# /app 只读，通常无需动；仅在 node 用户读不到入口文件时才修一次权限
# （避免每次启动对 40MB 静态资源跑 chown -R，白等好几秒）
if ! gosu node test -r /app/server/index.js 2>/dev/null; then
  echo "[entrypoint] 修正代码目录权限: /app"
  chmod -R a+rX /app 2>/dev/null || true
fi

# 仅在 node 用户不可写时才递归修正，避免每次启动扫描大量 ROM
if ! gosu node test -w "$DATA_DIR" 2>/dev/null; then
  echo "[entrypoint] 修正数据目录权限: $DATA_DIR"
  chown -R node:node "$DATA_DIR" 2>/dev/null || true
fi

exec gosu node "$@"
