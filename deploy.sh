#!/bin/sh
# ============================================================================
# ABXY ARCADE —— NAS 一键部署脚本（飞牛 fnOS 优先，通用 Linux 同样适用）
#
# 前提：已把以下两个文件放到部署目录（可由 Gitea 归档包 + 本地数据包得到）
#   1. 代码归档   abxy-code.zip   或   abxy-code.tar.gz
#   2. 数据归档   abxy-data.tar.gz（可选，不放则全新部署）
#
# 用法：
#   cd /vol1/1000/docker/abxy-arcade
#   chmod +x deploy.sh
#   ./deploy.sh
#
# 脚本做的事：
#   1. 解压代码到部署目录（自动剥离顶层目录）
#   2. 解压数据到 ./data
#   3. 生成 .env（首次）或沿用已有 .env
#   4. 修正数据目录属主
#   5. docker compose up -d --build
#   6. 健康检查
# ============================================================================
set -e

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DEPLOY_DIR"

CODE_ZIP=""
CODE_TGZ=""
CODE_TAR=""
DATA_TGZ=""
BUNDLE=""

# ---------- 0. 环境检查 ----------
echo "=============================================="
echo " ABXY ARCADE 一键部署"
echo " 部署目录: $DEPLOY_DIR"
echo "=============================================="
echo ""

if ! command -v docker >/dev/null 2>&1; then
  echo "[错误] 未找到 docker 命令。请先在 NAS 应用中心安装 Docker 应用。"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "[错误] 未找到 docker compose 插件。"
  exit 1
fi

# ---------- 1. 定位归档文件 ----------
echo "[1/6] 查找归档文件..."
for f in abxy-code.zip ABXY.zip abxy.zip code.zip; do
  [ -f "$f" ] && CODE_ZIP="$f" && break
done
for f in abxy-code.tar.gz ABXY.tar.gz abxy.tar.gz code.tar.gz main.tar.gz; do
  [ -f "$f" ] && CODE_TGZ="$f" && break
done
for f in abxy-code.tar ABXY.tar code.tar; do
  [ -f "$f" ] && CODE_TAR="$f" && break
done
for f in abxy-data.tar.gz data.tar.gz; do
  [ -f "$f" ] && DATA_TGZ="$f" && break
done
# 整合包：内含 abxy-code.zip + abxy-data.tar.gz
for f in abxy-bundle.tar.gz abxy-bundle.tar ABXY-bundle.tar.gz; do
  [ -f "$f" ] && BUNDLE="$f" && break
done

# ---------- 2. 解压 ----------
echo "[2/6] 解压..."

# 2a. 先处理整合包：解开后里面才是 code + data
if [ -n "$BUNDLE" ]; then
  echo "      发现整合包: $BUNDLE"
  case "$BUNDLE" in
    *.tar.gz) tar -xzf "$BUNDLE" ;;
    *.tar)    tar -xf  "$BUNDLE" ;;
    *.zip)    unzip -qo "$BUNDLE" ;;
  esac
  # 解开后重新扫描
  for f in abxy-code.zip ABXY.zip abxy.zip code.zip; do
    [ -f "$f" ] && CODE_ZIP="$f" && break
  done
  for f in abxy-code.tar.gz ABXY.tar.gz abxy.tar.gz code.tar.gz main.tar.gz; do
    [ -f "$f" ] && CODE_TGZ="$f" && break
  done
  for f in abxy-data.tar.gz data.tar.gz; do
    [ -f "$f" ] && DATA_TGZ="$f" && break
  done
fi

# 2b. 解压代码
if [ -n "$CODE_ZIP" ]; then
  echo "      代码归档: $CODE_ZIP"
  rm -rf ./_extract && mkdir -p ./_extract
  if command -v unzip >/dev/null 2>&1; then
    unzip -qo "$CODE_ZIP" -d ./_extract
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "import zipfile; zipfile.ZipFile('$CODE_ZIP').extractall('./_extract')"
  else
    echo "[错误] 系统既没有 unzip 也没有 python3，无法解压 zip。"
    exit 1
  fi
elif [ -n "$CODE_TGZ" ]; then
  echo "      代码归档: $CODE_TGZ"
  rm -rf ./_extract && mkdir -p ./_extract
  tar -xzf "$CODE_TGZ" -C ./_extract
elif [ -n "$CODE_TAR" ]; then
  echo "      代码归档: $CODE_TAR"
  rm -rf ./_extract && mkdir -p ./_extract
  tar -xf "$CODE_TAR" -C ./_extract
elif [ -f Dockerfile ] && [ -d server ] && [ -d web ]; then
  # 代码已经解压好在当前目录（用户手动解过），直接跳过
  echo "      检测到代码已就位（Dockerfile / server / web 均存在），跳过解压"
elif [ -f abxy/Dockerfile ] && [ -d abxy/server ] && [ -d abxy/web ]; then
  # 代码解压在 abxy/ 子目录里（Gitea 归档的默认结构）
  echo "      检测到 abxy/ 子目录中已有代码，搬运到部署目录"
  cp -a abxy/. ./
  rm -rf abxy
  echo "      代码已就位"
else
  echo "[错误] 没找到代码归档包。请确认以下任一文件存在于 $DEPLOY_DIR :"
  echo "         abxy-code.zip / ABXY.zip / abxy.zip / code.zip"
  echo "         abxy-code.tar.gz / ABXY.tar.gz / abxy.tar.gz / code.tar.gz"
  echo "         abxy-code.tar / ABXY.tar"
  echo "         abxy-bundle.tar.gz / abxy-bundle.tar"
  echo "       或者先把代码解压到当前目录（需含 Dockerfile、server/、web/）"
  exit 1
fi

# 只有找到归档才需要搬运目录
if [ -n "$CODE_ZIP" ] || [ -n "$CODE_TGZ" ] || [ -n "$CODE_TAR" ]; then
  # Gitea 归档包解压后是 abxy/ 单层目录，需要剥离
  SRC_DIR="./_extract/abxy"
  if [ ! -d "$SRC_DIR" ]; then
    # 兜底：取第一个子目录
    SRC_DIR="$(find ./_extract -mindepth 1 -maxdepth 1 -type d | head -1)"
  fi
  if [ ! -d "$SRC_DIR" ]; then
    echo "[错误] 归档结构异常，未找到顶层目录。"
    exit 1
  fi
  echo "      归档顶层: $SRC_DIR"

  # 拷贝代码（保留已存在的 data/ 和 .env）
  cp -a "$SRC_DIR"/. ./
  rm -rf ./_extract
  echo "      代码已就位"
fi

# ---------- 3. 解压数据 ----------
echo "[3/6] 解压数据..."
if [ -n "$DATA_TGZ" ]; then
  echo "      数据归档: $DATA_TGZ"
  # 先备份现有数据
  if [ -d data ] && [ -n "$(ls -A data 2>/dev/null)" ]; then
    BAK="data.bak.$(date +%Y%m%d-%H%M%S)"
    echo "      备份现有数据到 $BAK"
    mv data "$BAK"
  fi
  mkdir -p data
  tar -xzf "$DATA_TGZ" -C .
  # 数据包里是 data/ 目录结构，会覆盖上面的空目录
  echo "      数据已恢复"
else
  echo "      未找到数据归档，将全新部署（需在后台手动上传 ROM）"
  mkdir -p data
fi

# ---------- 4. 生成 .env ----------
echo "[4/6] 配置环境变量..."
if [ -f .env ]; then
  echo "      .env 已存在，沿用（未做任何修改）"
else
  cp .env.example .env

  # 自动生成随机 JWT 密钥
  if command -v openssl >/dev/null 2>&1; then
    SECRET="$(openssl rand -hex 32)"
  else
    SECRET="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  fi
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$SECRET|" .env

  # 自动填入当前用户的 UID/GID（飞牛默认 1000:1001）
  MY_UID="$(id -u)"
  MY_GID="$(id -g)"
  sed -i "s|^PUID=.*|PUID=$MY_UID|" .env
  sed -i "s|^PGID=.*|PGID=$MY_GID|" .env

  echo "      已生成 .env："
  echo "        PUID=$MY_UID  PGID=$MY_GID"
  echo "        JWT_SECRET=（已随机生成）"
  echo "        HOST_PORT=$(grep '^HOST_PORT=' .env | cut -d= -f2)"
  echo "      ⚠ 请手动修改 ADMIN_PASSWORD 和 ALLOW_REGISTER"
fi

# ---------- 5. 修正权限 ----------
echo "[5/6] 修正数据目录权限..."
CHOWN_DATA="$(grep '^CHOWN_DATA=' .env 2>/dev/null | cut -d= -f2)"
[ -z "$CHOWN_DATA" ] && CHOWN_DATA="auto"
if [ "$CHOWN_DATA" != "never" ]; then
  MY_UID="$(id -u)"; MY_GID="$(id -g)"
  chmod -R u+rwX data 2>/dev/null || true
  chown -R "$MY_UID:$MY_GID" data 2>/dev/null \
    || echo "      (部分文件属主修改失败，容器启动时会自动兜底修正)"
  echo "      属主设为 $MY_UID:$MY_GID"
fi

# ---------- 6. 构建并启动 ----------
echo "[6/6] 构建镜像并启动..."
echo "      首次构建需 5-15 分钟（编译 better-sqlite3 + 构建前端），请耐心等待"
echo ""
docker compose up -d --build

echo ""
echo "=============================================="
echo " 部署完成！"
echo "=============================================="
PORT="$(grep '^HOST_PORT=' .env | cut -d= -f2)"
IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo " 访问地址: http://${IP:-<NAS-IP>}:${PORT:-30000}"
echo ""
echo " 常用命令:"
echo "   查看日志   docker compose logs -f"
echo "   查看状态   docker compose ps"
echo "   重启服务   docker compose restart"
echo ""
echo " 健康检查中..."
sleep 5
if curl -fsS "http://127.0.0.1:${PORT:-30000}/api/health" 2>/dev/null; then
  echo ""
  echo " ✓ 服务健康检查通过"
else
  echo ""
  echo " ⚠ 健康检查未通过，请查看日志: docker compose logs --tail=50"
fi
