#!/bin/sh
# ============================================
# ABXY ARCADE 离线安装（Linux / 群晖 / 威联通 / unRAID）
#
# 用法：
#   sudo sh install.sh              # 默认端口 30000，数据放 ./data
#   sudo sh install.sh 8080         # 指定端口
#   sudo sh PORT=8080 DATA=/vol1/1000/Game/abxy sh install.sh
#
# 做的事：载入镜像 → 起容器 → 等它健康 → 打印访问地址
# 出问题看最后打印的那段提示。
# ============================================
set -e

VER="__VERSION__"
IMAGE="abxy-arcade:$VER"
CONTAINER="abxy-arcade"
PORT="${PORT:-${1:-30000}}"
DATA="${DATA:-$(pwd)/data}"

say() { printf '%s\n' "$*"; }
die() { printf '\n[失败] %s\n' "$*" >&2; exit 1; }

# ---------- 0. 环境检查 ----------
command -v docker >/dev/null 2>&1 || die "没装 docker。群晖/威联通请先在套件中心装 Container Manager / Container Studio，Linux 请参考 https://docs.docker.com/engine/install/"

SUDO=""
if ! docker info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
    sudo -n docker info >/dev/null 2>&1 || die "当前用户没有 docker 权限。请用 sudo 执行： sudo sh install.sh"
  else
    die "当前用户没有 docker 权限，请切到 root 执行"
  fi
fi

# ---------- 1. 选对应芯片的包 ----------
# 对外只说人话：Intel/AMD 用 x86 包，ARM 用 arm 包。
# amd64 / arm64 是 Docker 里的叫法，跟 AMD 或 Apple 一点关系都没有。
MACHINE="$(uname -m)"
case "$MACHINE" in
  x86_64|amd64)
    PKG=x86
    CHIP="Intel / AMD 芯片（$MACHINE）"
    ;;
  aarch64|arm64)
    PKG=arm
    CHIP="ARM 芯片（$MACHINE）"
    ;;
  armv7l|armv8l|armv6l)
    die "这台机器是 32 位 ARM（$MACHINE），本包里只有 64 位镜像，跑不了。
       32 位 ARM 目前只能自己用源码构建（见 README.txt 末页），Dockerfile 未针对 armv7 验证过。"
    ;;
  *)
    die "认不出这台机器的芯片类型（$MACHINE）。本包提供两种：Intel/AMD 用 x86，ARM 用 arm。"
    ;;
esac

TAR="images/abxy-arcade-$VER-$PKG.tar.gz"
[ -f "$TAR" ] || die "找不到镜像包 $TAR。请确认压缩包解压完整。"

say "检测到 $CHIP → 使用 $PKG 镜像包"

# ---------- 2. 载入镜像 ----------
if $SUDO docker image inspect "$IMAGE" >/dev/null 2>&1; then
  say "镜像 $IMAGE 已存在，跳过导入"
else
  say "正在导入镜像（约 1-3 分钟，慢是正常的，别关窗口）..."
  $SUDO docker load -i "$TAR" || die "镜像导入失败，文件可能下载不完整，请对照 SHA256SUMS.txt 校验"
fi
# 兜底：早期 arm64 包里的镜像名是 abxy-arm64:x，统一成主名，脚本和 compose 才通用。
# 必须「主名不存在时才补」——机器上同时有两个架构的镜像时，无条件 retag 会互相覆盖。
if ! $SUDO docker image inspect "$IMAGE" >/dev/null 2>&1; then
  $SUDO docker tag "abxy-arm64:$VER" "$IMAGE" >/dev/null 2>&1 || true
fi
say "镜像就绪：$IMAGE"

# ---------- 3. 端口检查 ----------
if $SUDO docker ps --format '{{.Ports}}' | grep -q ":$PORT->"; then
  die "端口 $PORT 已被其它容器占用。换个端口重试，例如： sudo sh install.sh 30001"
fi

# ---------- 4. 起容器 ----------
mkdir -p "$DATA"
ABS_DATA="$(cd "$DATA" && pwd)"
say "数据目录：$ABS_DATA"

if $SUDO docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  say "发现同名容器，先删除旧的（数据在 $ABS_DATA，不会丢）"
  $SUDO docker rm -f "$CONTAINER" >/dev/null
fi

say "启动容器 ..."
$SUDO docker run -d --name "$CONTAINER" --restart always \
  -p "$PORT:3000" \
  -e TZ=Asia/Shanghai \
  -v "$ABS_DATA:/data" \
  "$IMAGE" >/dev/null

# ---------- 5. 等健康 ----------
say "等待服务就绪 ..."
OK=""
i=0
while [ $i -lt 40 ]; do
  if $SUDO docker exec "$CONTAINER" node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    OK=1; break
  fi
  sleep 1; i=$((i+1))
done

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
[ -n "$IP" ] || IP="这台机器的IP"

echo
if [ -n "$OK" ]; then
  echo "================ 启动成功 ================"
else
  echo "================ 容器已启动，但健康检查未通过 ================"
  echo "看日志： $SUDO docker logs --tail 50 $CONTAINER"
fi
echo "  本机访问： http://localhost:$PORT"
echo "  局域网：   http://$IP:$PORT"
echo "  管理后台： http://$IP:$PORT/admin"
echo "  默认账号： admin / admin123  （登录后请立刻改密码）"
echo
echo "  数据目录： $ABS_DATA"
echo "    游戏放： $ABS_DATA/roms/<平台>/   例如 roms/fc/、roms/arcade/"
echo "    放完去后台点「扫描 ROM」"
echo
echo "  常用命令："
echo "    看日志   $SUDO docker logs -f $CONTAINER"
echo "    重启     $SUDO docker restart $CONTAINER"
echo "    停止删除 $SUDO docker rm -f $CONTAINER"
echo "=========================================="
