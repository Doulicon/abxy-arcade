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
│  │  端口: ${HOST_PORT}(30000) → 容器 3000   │  │
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

**代码从哪来**：Gitea 下载归档包 → NAS 上解压 → 本地构建镜像 → compose 启动。

**三种方式任选**：

| 方式 | 操作 | 优点 | 缺点 |
|---|---|---|---|
| **A. 归档包 + 一键脚本**（推荐） | 下载 zip + 数据包 → 传 NAS → `./deploy.sh` | 不用折腾 NAS 的 git，一条命令搞定 | 后续更新要重新下载包 |
| B. NAS 上 git clone | 修好 git 后 clone | 后续可 `git pull` 更新 | 飞牛 git 有坑，要先修 |
| C. 免 git 直接下载 | `curl -u` 下载归档解压 | 最少命令 | 同 A，仍需重新下载更新 |

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
mkdir -p abxy-arcade
cd abxy-arcade
```

> **建议**：把 `data` 放在大容量存储池（如机械盘 RAID），Docker 镜像放 SSD。
> 飞牛在首次打开 Docker 应用时会让你选镜像存储位置。

---

## 阶段二：获取代码与数据

有两条路，**推荐走路线 A**（省事，不用折腾 NAS 上的 git）。

### 路线 A：下载归档包 + 一键脚本（推荐）

#### A1. 下载代码归档

**方式 1：浏览器下载（最简单）**

1. 浏览器登录 Gitea：`http://192.168.0.227:30001`
2. 打开仓库 `ABXY`
3. 右侧边栏 → **「克隆」/「下载」** 按钮 → 选择 **下载 ZIP**
4. 得到 `abxy-main.zip`（约 38MB）

**方式 2：命令行下载（NAS 上直接下）**

```bash
cd /vol1/1000/docker/abxy-arcade
curl -u "<Gitea用户名>:<密码或令牌>" -L -o abxy-code.zip \
  "http://192.168.0.227:30001/Gitea/ABXY/archive/main.zip"
```

#### A2. 上传两个文件到 NAS

需要这两个文件（都在项目的 `release/` 输出里）：

| 文件 | 大小 | 来源 |
|---|---|---|
| `abxy-code.zip` | ~38MB | Gitea 归档下载 |
| `abxy-data.tar.gz` | ~27MB | 本机导出（完整迁移现有游戏数据时需要）|

用**飞牛文件管理器**上传到 `/vol1/1000/docker/abxy-arcade/` 即可。

> 也可从 Windows 直接传：
> ```powershell
> scp C:\Users\pc\WorkBuddy\enlu\abxy-data.tar.gz <用户名>@<NAS-IP>:/vol1/1000/docker/abxy-arcade/
> ```

#### A3. 执行一键部署

```bash
cd /vol1/1000/docker/abxy-arcade

# 解压整合包（若你用的是 abxy-bundle.tar.gz）
tar -xzf abxy-bundle.tar.gz
# 或单独上传的两个文件无需解压这一步

chmod +x deploy.sh
./deploy.sh
```

`deploy.sh` 会自动完成：

1. 定位并解压代码归档（自动剥离 Gitea 归档的顶层 `abxy/` 目录）
2. 解压数据包到 `./data`（会先自动备份旧数据目录）
3. 生成 `.env`（**随机 JWT 密钥** + **自动填入你当前用户的 UID/GID**）
4. 修正数据目录属主
5. `docker compose up -d --build`
6. 健康检查

#### A4. 收尾

脚本执行完会打印访问地址。**记得手动改两处**：

```bash
vi .env
# ADMIN_PASSWORD=改成你自己的强密码
# ALLOW_REGISTER=false        # 私人使用建议关闭注册
```

改完重启生效：

```bash
docker compose up -d
```

### 路线 B：在 NAS 上 git clone

若想保留 git 能力（后续可 `git pull` 更新），先按文末「常见问题」里的
**`git: 'remote-http' is not a git command`** 条目修好 Git，再执行：

```bash
cd /vol1/1000/docker/abxy-arcade
git clone http://192.168.0.227:30001/Gitea/ABXY.git .
```

仓库是私有的，需 Gitea 用户名 + 密码或 Personal Access Token。

---

## 阶段三：配置环境变量（路线 B 手动执行时需要）

路线 A 的 `deploy.sh` 已自动生成 `.env`，无需手动操作。若手动部署：

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
| `HOST_PORT` | NAS 上对外端口 | 30000（冲突就改，如 8080）|
| `ADMIN_PASSWORD` | 初始管理员密码 | 改成自己的强密码 |
| `ALLOW_REGISTER` | 是否开放注册 | 私人用建议 `false` |

**生成随机 JWT 密钥**：

```bash
openssl rand -hex 32
```

---

## 阶段四：恢复数据（路线 B 手动执行时需要）

路线 A 的 `deploy.sh` 已自动解压数据包，无需手动操作。若手动部署：

```bash
cd /vol1/1000/docker/abxy-arcade

# 解压数据（会覆盖同名文件）
tar -xzf abxy-data.tar.gz -C .

# 修正属主，让容器内 node 用户可读写
chown -R 1000:1001 data
chmod -R u+rwX data

# 确认内容
ls -la data/
```

**数据包内容**：
- `app.db` —— 用户、游戏、系列、平台配置（完整保留）
- `roms/` `covers/` `bios/` `assets/` —— 全部游戏文件与素材
- `.jwt-secret` —— JWT 密钥（迁移后登录态延续，不用重新登录）

---

## 阶段五：构建并启动（路线 B 手动执行时需要）

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
curl http://127.0.0.1:30000/api/health
# 应返回：{"ok":true,"uptime":...}

# 容器状态
docker compose ps
# STATUS 应为 healthy
```

浏览器访问：`http://<NAS-IP>:30000`

---

## 阶段六：日常运维

### 更新版本

**路线 A（归档包方式）**：重新下载 → 覆盖代码 → 重建（`data/` 不会被动）

```bash
cd /vol1/1000/docker/abxy-arcade

# 1. 重新下载最新代码（浏览器下载后上传，或用 curl）
curl -u "<Gitea用户名>:<密码或令牌>" -L -o abxy-code.zip \
  "http://192.168.0.227:30001/Gitea/ABXY/archive/main.zip"

# 2. 只覆盖代码部分，保留 data/ 和 .env
mkdir -p _x && unzip -qo abxy-code.zip -d _x && cp -a _x/abxy/. ./ && rm -rf _x

# 3. 重新构建并重启（数据目录不受影响）
docker compose up -d --build

# 4. 清理旧镜像
docker image prune -f
```

**路线 B（git 方式）**

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

### git: 'remote-http' is not a git command

飞牛 fnOS 应用中心安装的 Git 缺少 PATH 配置，`git-remote-http` 找不到。
**解决办法**（最常用的是建软链接，把 git 的 HTTP 助手加回 PATH）：

```bash
sudo ln -sf /vol1/@appcenter/git/libexec/git-core/git-remote-http  /usr/local/bin/git-remote-http
sudo ln -sf /vol1/@appcenter/git/libexec/git-core/git-remote-https /usr/local/bin/git-remote-https
```

### git clone 提示 Authentication failed

仓库是私有的。生成 Gitea 的 Personal Access Token（设置 → 应用 → 生成令牌，勾 `repo` 权限）：

```bash
git clone http://<用户名>:<令牌>@192.168.0.227:30001/Gitea/ABXY.git .
```

保存凭据免密输入：`git config --global credential.helper store`

### 不想用 git 拉代码（兜底方案）

直接从 Gitea 下载归档包解压到部署目录，效果与 clone 相同（但无法 `git pull` 更新）：

```bash
cd /vol1/1000/docker/abxy-arcade

curl -u "<Gitea用户名>:<密码或令牌>" -L -o ABXY.tar.gz \
  "http://192.168.0.227:30001/Gitea/ABXY/archive/main.tar.gz"

tar -xzf ABXY.tar.gz --strip-components=1
rm ABXY.tar.gz
```

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
sudo ss -tlnp | grep 30000
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
4. **不要把 30000 端口直接暴露到公网** —— 若需外网访问，用飞牛的远程访问（FN Connect）或反向代理 + HTTPS + 访问控制
5. **定期备份 `data/` 目录**
