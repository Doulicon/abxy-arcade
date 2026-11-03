# ---------- 1. 构建前端 ----------
FROM node:22-bookworm-slim AS webbuild
WORKDIR /app/web
COPY web/package.json web/package-lock.json* ./
RUN npm ci --no-audit --no-fund --registry=https://registry.npmmirror.com \
  || npm install --no-audit --no-fund --registry=https://registry.npmmirror.com
COPY web/ ./
RUN npm run build

# ---------- 2. 安装后端依赖（better-sqlite3 用预编译二进制，无需编译工具链） ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# 国内环境：Debian 源换成阿里云（只需 ca-certificates 用于 HTTPS）
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true \
  && sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list 2>/dev/null || true \
  && apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
# better-sqlite3 预编译二进制走 npmmirror 镜像，跳过 node-gyp 源码编译（大幅提速）
ENV npm_config_better_sqlite3_binary_host_mirror=https://cdn.npmmirror.com/binaries/better-sqlite3
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund --registry=https://registry.npmmirror.com \
  || npm install --omit=dev --no-audit --no-fund --registry=https://registry.npmmirror.com

# ---------- 3. 运行镜像 ----------
FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=3000

# 国内环境：Debian 源换成阿里云（gosu/ca-certificates 是轻量包，换源后明显加速）
RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true \
  && sed -i 's|deb.debian.org|mirrors.aliyun.com|g; s|security.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list 2>/dev/null || true \
  && apt-get update \
  && apt-get install -y --no-install-recommends gosu ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY --from=webbuild /app/web/dist ./web/dist
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/docker-entrypoint.sh \
  && chmod +x /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /data/roms /data/covers /data/bios \
  && chown -R node:node /data /app

EXPOSE 3000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server/index.js"]
