#!/usr/bin/env bash
# ============================================
# ABXY ARCADE — 离线安装包制作
#
# 在「已经有镜像的机器」上执行（本机 NAS / 构建机），产出可直接拷给玩家的目录。
#
# 用法：
#   bash scripts/make-offline-bundle.sh 1.1.0
#   bash scripts/make-offline-bundle.sh 1.1.0 --arch x86               # 只出 x86
#   bash scripts/make-offline-bundle.sh 1.1.0 --arch x86,arm           # 两种都出（默认）
#   bash scripts/make-offline-bundle.sh 1.1.0 --out /tmp/bundle
#
# 前置：镜像已在本机 docker 里，tag 为
#   x86   → abxy-arcade:<版本>
#   arm   → abxy-arm64:<版本>
# （arm 用 buildx --platform linux/arm64 --load 生成）
#
# 包内文件名用 x86 / arm 而不是 amd64 / arm64 —— 后者跟 AMD、跟 Apple 都没关系，
# 玩家看不懂。构建时仍接受 amd64 / arm64 作为别名。
#
# 产物结构（release/offline-<版本>/）：
#   abxy-arcade-offline-<版本>/
#   ├── images/abxy-arcade-<版本>-x86.tar.gz
#   ├── images/abxy-arcade-<版本>-arm.tar.gz
#   ├── install.sh            Linux / NAS 一键安装
#   ├── start.bat             Windows 一键启动
#   ├── docker-compose.yml    给熟悉 compose 的人
#   ├── README.txt            安装说明
#   └── SHA256SUMS.txt        校验值
# ============================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TPL="$ROOT/scripts/offline"

VER="${1:-}"
if [ -z "$VER" ] || [[ "$VER" == --* ]]; then
  echo "用法: bash scripts/make-offline-bundle.sh <版本号> [--arch amd64,arm64] [--out 目录]" >&2
  exit 1
fi
shift

ARCHS="x86,arm"
OUT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --arch) ARCHS="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    *) echo "未知参数: $1" >&2; exit 1 ;;
  esac
done

OUT="${OUT:-$ROOT/release/offline-$VER}"
NAME="abxy-arcade-offline-$VER"
BUNDLE="$OUT/$NAME"

# 需要 sudo 的环境（群晖/多数 NAS 的 docker 只给 root）
DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  if sudo -n docker info >/dev/null 2>&1; then
    DOCKER="sudo docker"
  else
    echo "!! 需要 docker 权限，请用 sudo 执行本脚本" >&2
    exit 1
  fi
fi

# 压缩器：有 pigz 就用多线程
if command -v pigz >/dev/null 2>&1; then GZ="pigz -9 -p $(nproc 2>/dev/null || echo 4)"; else GZ="gzip -9"; fi

echo "版本: $VER"
echo "芯片: $ARCHS"
echo "输出: $OUT"
echo "压缩: $GZ"
echo

rm -rf "$BUNDLE"
mkdir -p "$BUNDLE/images"

# ---------- 1. 导出镜像 ----------
# 两个 tar 里镜像名必须都是 abxy-arcade:<版本>，玩家 docker run 才不用改名字。
# 做法：导出前把 abxy-arcade:<版本> 临时指向目标架构，导出完再恢复原指向。
# （不能靠玩家端 retag —— 机器上万一两种镜像都在，会互相覆盖出错）
ORIG_ID="$($DOCKER image inspect -f '{{.Id}}' "abxy-arcade:$VER" 2>/dev/null || true)"

IFS=',' read -ra LIST <<< "$ARCHS"
for raw in "${LIST[@]}"; do
  case "$raw" in
    x86|amd64)   PKG=x86; SRC="abxy-arcade:$VER"; PLATFORM=linux/amd64 ;;
    arm|arm64)   PKG=arm; SRC="abxy-arm64:$VER";  PLATFORM=linux/arm64 ;;
    *) echo "!! 不支持的芯片类型: $raw（可选 x86 / arm）" >&2; exit 1 ;;
  esac
  if ! $DOCKER image inspect "$SRC" >/dev/null 2>&1; then
    echo "!! 本机没有镜像 $SRC，先构建：" >&2
    echo "   docker buildx build --builder <builder> --platform $PLATFORM \\" >&2
    echo "     -t $SRC --load ." >&2
    exit 1
  fi

  TAR="$BUNDLE/images/abxy-arcade-$VER-$PKG.tar.gz"
  echo "[$PKG] 导出 $SRC ($PLATFORM) ..."
  $DOCKER tag "$SRC" "abxy-arcade:$VER"
  $DOCKER save "abxy-arcade:$VER" | $GZ > "$TAR"
  echo "      $(du -h "$TAR" | cut -f1)  $TAR"
done

# 恢复导出前的 tag 指向，别把构建机的环境搞乱
if [ -n "$ORIG_ID" ]; then
  $DOCKER tag "$ORIG_ID" "abxy-arcade:$VER" >/dev/null 2>&1 || true
else
  $DOCKER rmi "abxy-arcade:$VER" >/dev/null 2>&1 || true
fi

# ---------- 2. 放脚本与说明 ----------
echo "[2/4] 写入安装脚本与说明 ..."
for f in install.sh start.bat docker-compose.yml README.txt; do
  sed "s/__VERSION__/$VER/g" "$TPL/$f" > "$BUNDLE/$f"
done
chmod +x "$BUNDLE/install.sh"
# bat / txt 给 Windows 用，统一 CRLF（记事本对纯 LF 的兼容性不好）
for f in start.bat README.txt; do
  sed -i 's/\r$//; s/$/\r/' "$BUNDLE/$f"
done
# 说明文件加 UTF-8 BOM，Windows 记事本直接双击不乱码
printf '\xEF\xBB\xBF' | cat - "$BUNDLE/README.txt" > "$BUNDLE/README.txt.tmp" && mv "$BUNDLE/README.txt.tmp" "$BUNDLE/README.txt"

# ---------- 3. 校验值 ----------
echo "[3/4] 生成 SHA256SUMS ..."
( cd "$BUNDLE/images" && sha256sum *.tar.gz > ../SHA256SUMS.txt )
sed -i 's|  |  images/|' "$BUNDLE/SHA256SUMS.txt"

# ---------- 4. 修权限 + 打 zip ----------
# 群晖/威联通这类卷上 chmod 有时不生效（group 位被 ACL 吃掉），
# 所以复制到本机临时目录再定权限，确保玩家解压出来的脚本能直接跑。
echo "[4/4] 修正权限并打包 ..."
STAGE="$(mktemp -d)"
cp -a "$BUNDLE" "$STAGE/"
CLEAN="$STAGE/$NAME"
find "$CLEAN" -type d -exec chmod 755 {} +
find "$CLEAN" -type f -exec chmod 644 {} +
chmod 755 "$CLEAN/install.sh"

ZIP="$OUT/$NAME.zip"
rm -f "$ZIP"
if command -v zip >/dev/null 2>&1; then
  ( cd "$STAGE" && zip -r -q "$ZIP" "$NAME" )
  ARTIFACT="$ZIP"
else
  ( cd "$STAGE" && tar czf "$ZIP.tar.gz" "$NAME" )
  ARTIFACT="$ZIP.tar.gz"
fi
rm -rf "$STAGE"

echo
echo "================ 完成 ================"
echo "目录  : $BUNDLE"
echo "安装包: $ARTIFACT  ($(du -h "$ARTIFACT" | cut -f1))"
echo
echo "包里内容："
ls -lh "$BUNDLE" "$BUNDLE/images" | grep -v '^total' | sed 's/^/  /'
echo
echo "上传这个就行：$ARTIFACT"
