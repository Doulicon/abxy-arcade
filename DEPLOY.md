# ABXY ARCADE —— NAS 部署指南（飞牛 fnOS / 群晖 / 威联通 / Unraid）

本文档以 **飞牛 fnOS** 为主线，其他 NAS 的差异在文末列出。

---

## 部署架构

```
┌─────────────────────────────────────────────┐
│  NAS (飞牛 fnOS)                             │
│                                             │
│  ┌───────────────────────────────────────┐  │
│  │  Docker 容器: abxy-arcade             │  │
│  │  ├─ Node.js 22 + Express 后端          │  │
│  │  ├─ web/dist 前端静态资源              │  │
│  │  └─ EmulatorJS 运行时（本地同源加载）   │  │
│  │  端口: ${HOST_PORT} → 容器 3000        │  │
│  └───────────────────────────────────────┘  │
│              ↕ 挂载                         │
│  /vol1/1000/docker/abxy-arcade/data         │
│    ├─ app.db        SQLite 数据库            │
│    ├─ roms/         游戏 ROM                │
│    ├─ covers/       封面                     │
│    ├─ bios/         BIOS                     │
│    └─ assets/       站点资源                 │
└─────────────────────────────────────────────┘
```

**代码从哪来**：NAS 上 `git clone` Gitea 仓库 → 本地构建镜像 → compose 启动。
**数据怎么来**：从本机导出的数据包恢复到 `data/` 目录（保留现有用户、游戏、系列配置）。

---

## 阶段一：NAS 准备

### 1. 开启 SSH

飞牛 fnOS：**系统设置 → 远程访问 → SSH**，开启并记下端口（默认 22）。
群晖：**控制面板 → 终端机和 SNMP → 启用 SSH**。
威联通：**控制面板 → 网络与文件服务 → SSH**。

### 2. 确认运行身份（关键，决定权限）

SSH 登录后执行：

```bash
id
```

飞牛 fnOS 通常输出 `uid=1000(Fan) gid=1001(Users)`。
记下这两个数字，部署时填进 `.env` 的 `PUID` / `PGID`。

> 也可以在飞牛文件管理器里右键任意文件夹 → 属性 → 权限，直接看属主 UID/GID。

### 3. 准备目录

```bash
# 飞牛 fnOS（/vol1 请按你的实际存储卷调整）
cd /vol1/1000/docker
mkdir -p abxy-arcade/data
cd abxy-arcade
```

> **建议**：把 `data` 放在大容量存储池（如机械盘 RAID），Docker 镜像放 SSD。
> 飞牛在首次打开 Docker 应用时会让你选镜像存储位置。

---

## 阶段二：拉取代码

```bash
cd /vol1/1000/docker/abxy-arcade

# 克隆仓库（若提示输入用户名密码，用你的 Gitea 账号）
git clone http://192.168.0.227:30001/Gitea/ABXY.git .

# 若仓库要求密码，配置免密（可选）
git config credential.helper store
```

克隆后目录结构：

```
/vol1/1000/docker/abxy-arcade/
├── Dockerfile
├── docker-compose.yml
├── .env.example          ← 复制成 .env 后修改
├── server/
├── web/
├── data/                 ← 恢复数据到这里
└── ...
```

---

## 阶段三：配置环境变量

```bash
cd /vol1/1000/docker/abxy-arcade
cp .env.example .env
vi .env      # 或用飞牛文件管理器图形化编辑
```

**必须修改的项**：

| 变量 | 说明 | 建议值 |
|---|---|---|
| `JWT_SECRET` | JWT 签名密钥 | 换成随机长字符串 |
| `PUID` / `PGID` | 容器内 node 用户身份 | 填上面 `id` 命令查到的值（飞牛默认 `1000` / `1001`）|
| `HOST_PORT` | NAS 上对外端口 | 3000（冲突就改，如 8080）|
| `ADMIN_PASSWORD` | 初始管理员密码 | 改成自己的强密码 |
| `ALLOW_REGISTER` | 是否开放注册 | 私人用建议 `false` |

**生成随机 JWT 密钥**：

```bash
openssl rand -hex 32
```

---

## 阶段四：恢复数据（可选，但推荐）

如果是从本机迁移，要先把 `abxy-data.tar.gz` 传到 NAS。

### 4.1 传输数据��

**方式 A：飞牛文件管理器（最简单）**
用浏览器登录飞牛，把 `abxy-data.tar.gz` 上传到 `/vol1/1000/docker/abxy-arcade/`。

**方式 B：scp（Windows PowerShell）**

```powershell
scp C:\Users\pc\WorkBuddy\enlu\abxy-data.tar.gz \
    <你的飞牛用户名>@192.168.0.xxx:/vol1/1000/docker/abxy-arcade/
```

> NAS 的 IP 是飞牛本机 IP（`http://192.168.0.227:30001` 是 Gitea 所在机器）。
> 在飞牛「系统设置 → 网络」里查本机 IP。

### 4.2 解压恢复

```bash
cd /vol1/1000/docker/abxy-arcade

# 解压（会覆盖同名文件）
tar -xzf abxy-data.tar.gz -C .

# 修正属主，让容器内 node 用户可读写
chown -R 1000:1001 data
chmod -R u+rwX data

# 确认内容
ls -la data/
```

**若 NAS 上是全新部署（无旧数据），解压后 `data/` 会包含：**
- `app.db` —— 用户、游戏、系列、平台配置（完整保留）
- `roms/` `covers/` `bios/` `assets/` —— 全部游戏文件与素材
- `.jwt-secret` —— JWT 密钥（迁移后登录态延续，不用重新登录）

---

## 阶段五：构建并启动

```bash
cd /vol1/1000/docker/abxy-arcade

# 构建镜像并后台启动
docker compose up -d --build

# 查看启动日志
docker compose logs -f abxy-arcade
```

**首次构建较慢**（要装 better-sqlite3 编译工具链 + 构建前端），耐心等待 5-15 分钟，取决于 NAS 性能。

### 验证

```bash
# 健康检查
curl http://127.0.0.1:3000/api/health
# 应返回：{"ok":true,"uptime":...}

# 容器状态
docker compose ps
# STATUS 应为 healthy
```

浏览器访问：`http://<NAS-IP>:3000`

---

## 阶段六：日常运维

### 更新版本

```bash
cd /vol1/1000/docker/abxy-arcade

# 拉取新代码
git pull

# 重新构建并重启（数据目录不受影响）
docker compose up -d --build

# 清理旧镜像
docker image prune -f
```

### 查看日志

```bash
docker compose logs -f --tail=100 abxy-arcade
```

### 备份数据

```bash
cd /vol1/1000/docker/abxy-arcade

# 停机保证一致性
docker compose stop

tar -czf /vol1/1000/backup/abxy-$(date +%Y%m%d).tar.gz data/
docker compose start
```

> 更规范的做法：在 NAS 上配定时任务，用 SQLite 的 `.backup` 或停机窗口做热备。

### 飞牛 GUI 方式部署（可选）

飞牛 fnOS 的 Docker 应用支持图形化 Compose 管理：

1. 打开 **Docker 应用 → Compose → 新增项目**
2. 项目名称填 `abxy-arcade`
3. 路径选 `/vol1/1000/docker/abxy-arcade`
4. 系统会自动识别现有的 `docker-compose.yml`，勾选「创建后立即启动」
5. 在 Docker 应用里查看容器状态与日志

> 注意：GUI 方式无法执行 `docker compose build`，需要先在 SSH 里构建一次镜像，
> 再通过 GUI 创建项目并指定 `image: abxy-arcade:latest`（去掉 `build:` 段）。

---

## 常见问题

### 容器起不来 / 反复重启

```bash
docker compose logs --tail=50 abxy-arcade
```

**权限问题**（最常见）——日志出现 `EACCES: permission denied`：

```bash
# 确认 id 输出与 .env 里的 PUID/PGID 一致
id
# 修正属主
sudo chown -R 1000:1001 data
# 或在 .env 里把 CHOWN_DATA 改成 always 让容器自己修正
```

### 端口被占用

```bash
# 查看占用
sudo ss -tlnp | grep 3000
# 改 .env 里的 HOST_PORT，比如 8080
```

### 模拟器启动失败 / 内核加载不出来

项目已自带 EmulatorJS 运行时，默认同源加载不依赖外网。若仍有问题：

```bash
# 确认容器内内核文件存在
docker compose exec abxy-arcade ls /app/server/public/emulatorjs/cores/ | head
```

若 NAS 存储卷里没有内核文件，可在 `.env` 里启用官方 CDN：

```
EMULATOR_CDN=https://cdn.emulatorjs.org/stable/data/
```

### 中文文件名乱码

NAS 存储卷的字符集问题。检查挂载参数：

```bash
docker inspect abxy-arcade | grep -A2 "Mounts"
```

飞牛一般默认 UTF-8，无需处理。

### 构建时 better-sqlite3 编译失败

ARM 架构 NAS 上偶尔会失败。确认 Docker 能联网拉取 Debian 源：

```bash
docker compose build --no-cache
```

若仍失败，尝试在 `.env` 中设置 `DOCKER_BUILDKIT=1` 后重建。

---

## 其他 NAS 的差异

| NAS | 部署目录 | 默认 UID:GID | 备注 |
|---|---|---|---|
| **飞牛 fnOS** | `/vol1/1000/docker/xxx` | `1000:1001` | Docker 应用在应用中心 |
| **群晖 DSM** | `/volume1/docker/xxx` | `1026:100` | 用 Container Manager |
| **威联通 QTS** | `/share/Container/xxx` | `1000:100` | 用 Container Station |
| **Unraid** | `/mnt/user/appdata/xxx` | `1000:100` | 用 Portainer / Dockge |

把路径填进 `.env` 的 `DATA_PATH`，或直接改 `docker-compose.yml` 里的 volumes 即可。

### 群晖额外注意

群晖的 Docker 默认不装 git，需先通过套件中心安装 **Git Server**，或改用
「File Station 上传代码 + 手动上传数据」的方式。

---

## 常用命令速查

```bash
cd /vol1/1000/docker/abxy-arcade

docker compose up -d --build      # 构建并启动
docker compose restart            # 重启
docker compose stop               # 停止
docker compose down               # 停止并删除容器（数据保留）
docker compose logs -f            # 实时日志
docker compose ps                 # 查看状态
docker compose exec abxy-arcade sh   # 进入容器
```

---

## 安全建议

1. **修改默认管理员密码**（后台 → 账号，或改 `.env` 后重建）
2. **设置 `ALLOW_REGISTER=false`** 关闭公开注册（私人使用）
3. **使用随机 `JWT_SECRET`**
4. **不要把 3000 端口直接暴露到公网** —— 若需外网访问，用飞牛的远程访问（FN Connect）或反向代理 + HTTPS + 访问控制
5. **定期备份 `data/` 目录**
