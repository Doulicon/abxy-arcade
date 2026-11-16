#!/usr/bin/env bash
# ============================================
# 打包论坛发布用的源码 zip
#
# 用法：
#   bash scripts/make-release.sh            # 版本号取 git tag，没有则用日期
#   bash scripts/make-release.sh 1.0.0      # 指定版本号
#
# 产物：release/abxy-arcade-<版本>-src.zip
# 只打包 git 已跟踪的文件，自动排除 data/roms、node_modules、.env 等。
# 解压后目录名固定为 abxy-arcade-<版本>，避免别人解压出一堆散文件。
# ============================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VER="${1:-}"
if [ -z "$VER" ]; then
  VER="$(git describe --tags --abbrev=0 2>/dev/null | sed 's/^v//' || true)"
fi
if [ -z "$VER" ]; then
  VER="$(date +%Y%m%d)"
fi

OUT_DIR="$ROOT/release"
NAME="abxy-arcade-$VER-src"
ZIP="$OUT_DIR/$NAME.zip"

mkdir -p "$OUT_DIR"
rm -f "$ZIP"

echo "[1/2] 打包 $NAME ..."
git archive --format=zip --prefix="$NAME/" -o "$ZIP" HEAD

echo "[2/2] 校验内容 ..."
echo "  文件数: $(unzip -l "$ZIP" 2>/dev/null | tail -1 | awk '{print $2}')"
echo "  体积  : $(du -h "$ZIP" | cut -f1)"
# 确认不含运行时数据（ROM / 数据库）——论坛分发不能带上这些
if unzip -l "$ZIP" 2>/dev/null | grep -qE '/data/(roms|covers)/[^/]'; then
  echo "  [警告] 压缩包内含 data 下的实际文件，请检查 .gitignore" >&2
else
  echo "  运行时数据: 未包含（干净）"
fi
echo ""
echo "完成：$ZIP"
echo "上传论坛时同时附上 .env.example，别人解压后 cp .env.example .env 即可。"
