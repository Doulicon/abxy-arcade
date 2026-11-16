# ============================================
# ABXY ARCADE 镜像
#
# 构建参数（国内默认值，国外构建机可全部覆盖）：
#   NPM_REGISTRY          npm 源，留空则用官方 registry.npmjs.org
#   APT_MIRROR            Debian 源，设为 default 则不换源
#   SQLITE_BINARY_MIRROR  better-sqlite3 预编译二进制源，留空走 GitHub
#
# 例（国外/CI 构建）：
#   docker build --build-arg NPM_REGISTRY= --build-arg APT_MIRROR=default \
#                --build-arg SQLITE_BINARY_MIRROR= -t abxy-arcade .
# ============================================
ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG APT_MIRROR=mirrors.aliyun.com
ARG SQLITE_BINARY_MIRROR=https://cdn.npmmirror.com/binaries/better-sqlite3

# ---------- 1. 构建前端 ----------
FROM node:22-bookworm-slim AS webbuild
ARG NPM_REGISTRY
WORKDIR /app/web
COPY web/package.json web/package-lock.json* ./
RUN NPM_FLAG=""; if [ -n "$NPM_REGISTRY" ]; then NPM_FLAG="--registry=$NPM_REGISTRY"; fi; \
  npm ci --no-audit --no-fund $NPM_FLAG || npm install --no-audit --no-fund $NPM_FLAG
COPY web/ ./
RUN npm run build

# ---------- 2. 安装后端依赖（better-sqlite3 用预编译二进制，无需编译工具链） ----------
FROM node:22-bookworm-slim AS deps
ARG NPM_REGISTRY
ARG APT_MIRROR
ARG SQLITE_BINARY_MIRROR
WORKDIR /app
# 只需 ca-certificates 用于 HTTPS；国内换源加速
RUN if [ -n "$APT_MIRROR" ] && [ "$APT_MIRROR" != "default" ]; then \
      sed -i "s|deb.debian.org|$APT_MIRROR|g; s|security.debian.org|$APT_MIRROR|g" /etc/apt/sources.list.d/debian.sources 2>/dev/null || true; \
      sed -i "s|deb.debian.org|$APT_MIRROR|g; s|security.debian.org|$APT_MIRROR|g" /etc/apt/sources.list 2>/dev/null || true; \
    fi; \
    apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# better-sqlite3 预编译二进制走镜像，跳过 node-gyp 源码编译（大幅提速；arm64 同样有预编译包）
ENV npm_config_better_sqlite3_binary_host_mirror=$SQLITE_BINARY_MIRROR
COPY package.json package-lock.json* ./
RUN NPM_FLAG=""; if [ -n "$NPM_REGISTRY" ]; then NPM_FLAG="--registry=$NPM_REGISTRY"; fi; \
  npm ci --omit=dev --no-audit --no-fund $NPM_FLAG || npm install --omit=dev --no-audit --no-fund $NPM_FLAG

# ---------- 3. 运行镜像 ----------
FROM node:22-bookworm-slim
ARG APT_MIRROR
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000

LABEL org.opencontainers.image.title="ABXY ARCADE" \
      org.opencontainers.image.description="Pixel-style retro game emulator portal (NES/SNES/GB/GBA/N64/MD/NDS/Arcade)" \
      org.opencontainers.image.source="https://github.com/Doulicon/abxy-arcade" \
      org.opencontainers.image.documentation="https://github.com/Doulicon/abxy-arcade/blob/main/DEPLOY.md"

# 只需要 gosu（降权启动）与 ca-certificates
RUN if [ -n "$APT_MIRROR" ] && [ "$APT_MIRROR" != "default" ]; then \
      sed -i "s|deb.debian.org|$APT_MIRROR|g; s|security.debian.org|$APT_MIRROR|g" /etc/apt/sources.list.d/debian.sources 2>/dev/null || true; \
      sed -i "s|deb.debian.org|$APT_MIRROR|g; s|security.debian.org|$APT_MIRROR|g" /etc/apt/sources.list 2>/dev/null || true; \
    fi; \
    apt-get update \
    && apt-get install -y --no-install-recommends gosu ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY --from=webbuild /app/web/dist ./web/dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# 注意：只 chown /data。对 /app 做 chown -R 会把 40MB 静态资源整层复制，镜像白白变大
# 且拖慢启动；运行时只需 node 用户可读，COPY 出来的权限默认就是 644。
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
  && chmod +x /usr/local/bin/docker-entrypoint.sh \
  && chmod -R a+rX /app \
  && mkdir -p /data/roms /data/covers /data/bios \
  && chown -R node:node /data

EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server/index.js"]
