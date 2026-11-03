#!/bin/sh
# 以 root 进入容器，修正数据卷权限后降权到 node 用户运行
#
# 支持通过环境变量自定义运行身份（适配各类 NAS 的权限模型）：
#   PUID / PGID  —— 指定容器内 node 用户的 UID/GID，默认沿用镜像内的 1000:1000
#                  飞牛 fnOS 默认用户为 1000:1001，Unraid 常用 1000:100
#   CHOWN_DATA   —— 是否递归修正数据目录属主，默认 auto（仅在不可写时才递归扫描）
#                  设成 always 可强制修正；设成 never 则完全不动权限
set -e

DATA_DIR="${DATA_DIR:-/data}"
PUID="${PUID:-}"
PGID="${PGID:-}"
CHOWN_DATA="${CHOWN_DATA:-auto}"

mkdir -p "$DATA_DIR/roms" "$DATA_DIR/covers" "$DATA_DIR/bios" "$DATA_DIR/assets"

# ---------- 1. 按需调整 node 用户的 UID/GID ----------
if [ -n "$PUID" ] || [ -n "$PGID" ]; then
  NEW_UID="${PUID:-$(id -u node)}"
  NEW_GID="${PGID:-$(id -g node)}"
  CUR_UID="$(id -u node)"
  CUR_GID="$(id -g node)"

  if [ "$NEW_UID" != "$CUR_UID" ] || [ "$NEW_GID" != "$CUR_GID" ]; then
    echo "[entrypoint] 调整运行身份: node ${CUR_UID}:${CUR_GID} -> ${NEW_UID}:${NEW_GID}"
    # 先改 GID 再改 UID，避免 userdel 失败导致组残留
    if [ "$NEW_GID" != "$CUR_GID" ]; then
      groupmod -o -g "$NEW_GID" node 2>/dev/null || true
    fi
    if [ "$NEW_UID" != "$CUR_UID" ]; then
      usermod -o -u "$NEW_UID" node 2>/dev/null || true
    fi
    # 归属到新 GID，避免节点用户丢失补充组
    usermod -g "$NEW_GID" node 2>/dev/null || true
  fi
fi

# ---------- 2. 修正数据目录权限 ----------
# auto  : 仅当 node 不可写时才递归 chown（避免每次启动扫描大量 ROM）
# always: 始终递归 chown
# never : 完全不碰权限（数据卷已由宿主正确授权时使用，启动最快）
should_chown="no"
case "$CHOWN_DATA" in
  always) should_chown="yes" ;;
  never)  should_chown="no" ;;
  *)      if ! gosu node test -w "$DATA_DIR" 2>/dev/null; then should_chown="yes"; fi ;;
esac

if [ "$should_chown" = "yes" ]; then
  echo "[entrypoint] 修正数据目录权限: $DATA_DIR"
  chown -R node:node "$DATA_DIR" 2>/dev/null || true
fi

# ---------- 3. 降权运行 ----------
exec gosu node "$@"
