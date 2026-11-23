# ABXY ARCADE 部署指南

像素风复古游戏门户，浏览器里直接玩 FC / SFC / GB / GBC / GBA / N64 / MD / NDS / 街机 / NEOGEO。
服务端只负责发文件和管理数据，模拟器全部跑在玩家浏览器里，所以**对服务器要求极低**，NAS、小主机、树莓派都能带动。

本文提供四种部署方式，按自己的机器情况选一种即可：

| 方式 | 命令数 | 要不要编译 | 适合谁 | 更新方式 |
| --- | --- | --- | --- | --- |
| **① 镜像部署**（推荐） | 2 条 | 否 | 绝大多数人，含 NAS | `docker compose pull` |
| ② 源码构建 | 4 条 | 是（3~10 分钟） | 想改代码、想自己魔改 | `git pull` + 重建 |
| ③ 一条 docker run | 1 条 | 否 | 只想先试玩看看 | `docker rm -f` 重跑 |
| ④ NAS 图形界面 | 0 条 | 否 | 完全不想碰命令行 | 界面点「更新」 |

---

## 一、部署前准备

### 硬件要求

| 项目 | 最低 | 建议 |
| --- | --- | --- |
| CPU | 任意 x86_64 或 ARM64 | 同上，1 核即可 |
| 内存 | 512 MB | 1 GB |
| 磁盘 | 2 GB（不含 ROM） | ROM 按自己的收藏算，一个 FC 全集约 300 MB，N64 / NDS 单游戏可达 64 / 512 MB |
| 系统 | Linux / 群晖 DSM 7 / 威联通 QTS 5 / macOS / Windows + Docker | 优先 Linux |
| 软件 | Docker 20.10+ 与 Docker Compose v2 | 群晖 DSM 7.2 自带的就够 |

> 模拟器在浏览器端跑，**服务器不承担游戏运算**。一台 1 核 512MB 的 ARM 小盒子带十几个人在线玩是没问题的。

### 支持架构

镜像同时发布 `linux/amd64` 与 `linux/arm64`，`docker pull` 会自动匹配你机器的架构，不用手动选。
覆盖：常规 x86 服务器 / 群晖 x86 机型 / 群晖 ARM 机型 / 威联通 / 树莓派 4-5 / 各类 ARM 小主机 / Apple Silicon Mac。

### 镜像地址

```
ghcr.io/doulicon/abxy-arcade:latest   # 官方地址，amd64 + arm64 多架构
```

镜像托管在 GitHub 容器仓库（GHCR），**公开可拉，不需要登录任何账号**。国内直连有时偏慢，拉取卡住就按 2.4 节换成南京大学镜像源，只是改一行前缀。

---

## 二、方式①：Docker 镜像部署（推荐）

### 2.1 建目录并生成配置

在服务器上执行（一条命令，不需要下载、不需要编辑器）：

```bash
mkdir -p /opt/abxy && cd /opt/abxy

cat > docker-compose.yml <<'EOF'
services:
  abxy-arcade:
    image: ghcr.io/doulicon/abxy-arcade:latest
    container_name: abxy-arcade
    ports:
      - "30000:3000"
    environment:
      DATA_DIR: /data
      ROM_DIR: /data/roms
      ADMIN_USERNAME: admin
      ADMIN_PASSWORD: admin123
      ALLOW_REGISTER: "true"
      TZ: Asia/Shanghai
    volumes:
      - ./data:/data
    restart: unless-stopped
EOF
```

> **有代理、能访问 GitHub 的**，也可以用官方完整版覆盖（注释更详细，参数更全）：
> ```bash
> curl -fsSL -o docker-compose.yml \
>   https://raw.githubusercontent.com/Doulicon/abxy-arcade/main/docker-compose.image.yml
> ```
> 两份内容等价，上面这份是精简过的，去掉注释便于直接粘贴。

### 2.2 启动

```bash
docker compose up -d
```

就这两条。默认端口 **30000**，数据落在 `./data`。

打开浏览器访问 `http://你的服务器IP:30000`，能看到首页就成功了。

### 2.3 自定义配置（可选）

想改端口、改数据路径、改管理员密码，就在同目录建一个 `.env`：

```bash
cat > .env <<'EOF'
# 对外端口，浏览器访问 http://IP:30000
HOST_PORT=30000

# 数据目录：数据库、封面、素材、BIOS、密钥都在这里
# 建议改成绝对路径，避免以后换目录时找错
DATA_PATH=/opt/abxy/data

# ROM 目录：往这里丢游戏文件即可被扫描到
ROM_PATH=/opt/abxy/data/roms

# 管理员账号（仅首次启动、库里还没有这个账号时生效）
ADMIN_USERNAME=admin
ADMIN_PASSWORD=改成你自己的强密码

# 是否允许别人注册（false = 只有你能开号）
ALLOW_REGISTER=true

# 时区
TZ=Asia/Shanghai
EOF

docker compose up -d    # 重新拉起，配置生效
```

> `ADMIN_PASSWORD` 只在**第一次**创建管理员时生效。库建好之后再改这里不会改密码，改密码请到「后台 → 点右上角 → 修改密码」。

### 2.4 国内拉不动镜像怎么办

`ghcr.io` 在国内的典型症状：卡在 `Waiting`、拉到一半断流、或者直接 `timeout`。按顺序试。

**办法一：换成南京大学镜像源**（推荐，改一行前缀）

[ghcr.nju.edu.cn](https://ghcr.nju.edu.cn) 是南京大学开源镜像站提供的 GHCR 反向代理，内容与官方完全一致：

```bash
docker pull ghcr.nju.edu.cn/doulicon/abxy-arcade:latest
docker tag  ghcr.nju.edu.cn/doulicon/abxy-arcade:latest ghcr.io/doulicon/abxy-arcade:latest
```

更省事的做法是直接让 compose 用加速地址，连 tag 都不用打。编辑 `.env`：

```bash
IMAGE_NAME=ghcr.nju.edu.cn/doulicon/abxy-arcade:latest
```

```bash
docker compose -f docker-compose.image.yml up -d
```

> 这是高校公益服务，不保证永久可用。失效了搜「ghcr 镜像加速」换一个源，或者改用办法二、三。

**办法二：给 Docker 配代理**

```bash
sudo mkdir -p /etc/systemd/system/docker.service.d
sudo tee /etc/systemd/system/docker.service.d/proxy.conf <<'EOF'
[Service]
Environment="HTTP_PROXY=http://127.0.0.1:7890"
Environment="HTTPS_PROXY=http://127.0.0.1:7890"
Environment="NO_PROXY=localhost,127.0.0.1"
EOF
sudo systemctl daemon-reload && sudo systemctl restart docker
```

把 `7890` 换成你自己代理的端口。群晖在「Container Manager → 设置 → Docker Daemon」里也能填代理。

**办法三：离线导入镜像**（完全没网也行）

在一台能拉镜像的机器上：

```bash
docker pull ghcr.io/doulicon/abxy-arcade:latest
docker save ghcr.io/doulicon/abxy-arcade:latest | gzip > abxy-arcade.tar.gz
```

把 `abxy-arcade.tar.gz` 拷到目标机器：

```bash
docker load < abxy-arcade.tar.gz
cd /opt/abxy && docker compose -f docker-compose.image.yml up -d
```

> `docker load` 之后本地镜像名就是 `ghcr.io/doulicon/abxy-arcade:latest`，与 compose 默认值一致，不用改任何配置。

**现成的离线包（推荐给不会用命令的人）**

`scripts/make-offline-bundle.sh` 把镜像、一键脚本、图文说明打成一个 zip，拿到的人解压就能装，不需要懂 `docker save`：

```bash
# 在已经有镜像的构建机上执行（需要 abxy-arcade:1.1.0 和 abxy-arm64:1.1.0 两个镜像）
bash scripts/make-offline-bundle.sh 1.1.0
# 产物：release/offline-1.1.0/abxy-arcade-offline-1.1.0.zip（双架构约 245 MB）
```

包内结构：

```
abxy-arcade-offline-1.1.0/
├── images/abxy-arcade-1.1.0-amd64.tar.gz    123 MB
├── images/abxy-arcade-1.1.0-arm64.tar.gz    123 MB
├── install.sh          Linux / 群晖 / 威联通：sudo sh install.sh
├── start.bat           Windows：双击
├── docker-compose.yml  给熟悉 compose 的人
├── README.txt          图文说明（UTF-8 BOM，记事本直接看）
└── SHA256SUMS.txt      校验值
```

两个架构的 tar 里镜像名**都是** `abxy-arcade:<版本>`，脚本按 `uname -m` 自动选包，ARM 机型不用手动改任何东西。真要只出一个架构：`--arch amd64`。

> 打包时会把镜像临时 retag 成 `abxy-arcade:<版本>` 再 save，完成后自动恢复原指向。这一步不能省——否则 arm64 包导入后会覆盖 amd64 的 tag，玩家在 x86 机器上会看到 `platform (linux/arm64) does not match` 的告警，容器起不来。

**如果是 `unauthorized` 而不是超时**

那不是网络问题，是仓库被设成了私有（只有发布者能改，见帖子里的说明），或者干脆用办法三离线导入。

### 2.5 确认运行正常

```bash
docker compose ps                      # STATUS 应为 Up (healthy)
docker compose logs --tail=50          # 看启动日志
curl -s http://127.0.0.1:30000/api/health
```

`curl` 返回 `{"ok":true,"uptime":...}` 就正常。启动日志里会打印一行初始管理员账号密码，**记得截图保存**。

---

## 三、方式②：源码构建部署

适合想改代码、加平台、改界面的。**要求机器至少 2 核 2 GB**，ARM 机器编译会明显更慢（10 分钟以上）。

```bash
# 1. 拿代码（二选一）
git clone https://github.com/Doulicon/abxy-arcade.git
# 或：解压论坛附件里的 abxy-arcade-x.x.x-src.zip

cd abxy-arcade

# 2. 准备配置
cp .env.example .env
vi .env                      # 至少改一下 ADMIN_PASSWORD

# 3. 构建并启动（首次 3~10 分钟，取决于 CPU 和网速）
docker compose up -d --build

# 4. 看进度
docker compose logs -f
```

关键是 `docker-compose.yml`（源码版）与 `docker-compose.image.yml`（镜像版）**内容等价**，只是把 `build:` 换成了 `image:`。两者共用同一套 `data/` 目录格式，可以随时互换，数据不会丢。

### 构建慢的优化

Dockerfile 已内置国内源（npmmirror + 阿里云 Debian 源）和 better-sqlite3 预编译二进制，正常情况下不会触发 C++ 编译。如果卡在某一步：

```bash
docker compose build --progress=plain     # 看具体卡在哪一层
```

海外机器可以换回官方源，速度更快：

```bash
docker build \
  --build-arg NPM_REGISTRY= \
  --build-arg APT_MIRROR=default \
  --build-arg SQLITE_BINARY_MIRROR= \
  -t abxy-arcade:latest .
```

### 报 `failed to resolve source metadata for docker.io/library/node:22-bookworm-slim`

这是**拉不到基础镜像**，不是代码问题。国内直连 Docker Hub 基本都这样（`registry-1.docker.io` 被 DNS 污染，常见表现为 `dial tcp 103.246.246.144:443: connection refused`）。

Dockerfile 已支持整体替换基础镜像，用 `--build-arg BASE_IMAGE=` 指到加速源即可：

```bash
# 单架构构建（群晖 / 威联通 / x86 小主机基本都是 amd64）
docker build \
  --build-arg BASE_IMAGE=docker.1panel.live/library/node:22-bookworm-slim \
  -t abxy-arcade:latest .

# 或者直接跑发布脚本，它会自动探测 Docker Hub 是否可达并切加速源
sudo bash scripts/publish-image.sh ghcr.io/你的用户名 1.0.0
```

可用的加速源（按实测速度排序，某个挂了就换下一个）：

| 加速源 | 地址前缀 |
| --- | --- |
| 1Panel | `docker.1panel.live/library/...` |
| DaoCloud | `docker.m.daocloud.io/library/...` |
| 1ms | `docker.1ms.run/library/...` |

其他镜像同理，把 `node:22-bookworm-slim` 换成 `加速源/library/镜像名:标签` 就行。

**想一次治本**（让所有 `docker pull` 都走镜像），配 daemon 级镜像源，注意要重启 Docker，正在跑的容器会重启一次：

```bash
sudo vi /etc/docker/daemon.json
```

```json
{
  "registry-mirrors": ["https://docker.1panel.live", "https://docker.m.daocloud.io"]
}
```

```bash
sudo systemctl restart docker     # 群晖：sudo synosystemctl restart docker
```

**多架构构建为什么会额外失败**：`docker buildx build --platform linux/amd64,linux/arm64` 除基础镜像外，还要从 Docker Hub 拉 `moby/buildkit` 和 `tonistiigi/binfmt`（QEMU），国内几乎必挂。所以：

- 只跑当前机器架构 → 加 `--single`，或直接 `docker build`
- 确实要 amd64 + arm64 双架构 → 推 `v*` tag 让 GitHub Actions 构建（`.github/workflows/docker-publish.yml`，CI 在国外网络通畅）

---

## 四、方式③：一条命令试玩

不想建目录、不想写 compose，只想先看看长什么样：

```bash
docker run -d \
  --name abxy-arcade \
  --restart unless-stopped \
  -p 30000:3000 \
  -v $(pwd)/abxy-data:/data \
  -e ADMIN_PASSWORD=改成你的密码 \
  -e TZ=Asia/Shanghai \
  ghcr.io/doulicon/abxy-arcade:latest
```

打开 `http://IP:30000`。

想停掉并删除：

```bash
docker rm -f abxy-arcade
```

> 数据在 `$(pwd)/abxy-data`，删容器不会删数据。

---

## 五、方式④：NAS 图形界面部署

### 群晖 DSM 7.2+

1. 套件中心装 **Container Manager**
2. 打开 → 左侧 **项目** → **新增**
3. 项目名称填 `abxy-arcade`，路径选 `/volume1/docker/abxy-arcade`，来源选「创建 docker-compose.yml」
4. 把 **2.1 节** 里的 compose 内容整段粘贴进去
5. 点「下一步」→「完成」，等它拉镜像启动
6. 浏览器访问 `http://群晖IP:30000`

数据会落在 `/volume1/docker/abxy-arcade/data`，在 File Station 里能直接看到，往 `data/roms/` 里丢 ROM 即可。

> 群晖的 Docker 命令在 SSH 里都要加 `sudo`。端口冲突就把 `HOST_PORT` 改掉。

### 威联通 QTS 5

1. App Center 装 **Container Station**
2. 左侧 **应用程序** → **创建** → 粘贴 **2.1 节** 的 compose 内容
3. 项目路径选 `/share/Container/abxy-arcade`
4. 创建并启动

### 极空间 / 绿联 / 铁威马

这些系统的「Docker → 项目 / Compose」功能都能直接粘贴 **2.1 节** 的 compose 内容，思路一致：**新建项目 → 粘贴 YAML → 启动**。

---

## 六、首次配置（必看）

### 6.1 登录后台

用启动日志里打印的账号密码登录（默认 `admin` / `admin123`，如果 `.env` 里改过就用改过的）。

**第一件事：改密码。** 在后台右上角账号菜单里修改。

### 6.2 放 ROM

两种方式，效果一样：

**方式一：直接往目录里丢文件**（推荐，一次放一堆）

```
data/roms/
├── fc/           .nes .unf .unif .zip
├── sfc/          .sfc .smc .fig .zip
├── gb/           .gb .zip
├── gbc/          .gbc .zip
├── gba/          .gba .zip
├── n64/          .n64 .z64 .v64 .zip
├── md/           .md .gen .smd .bin .zip
├── nds/          .nds .zip
├── arcade/       .zip（必须是 FBNeo romset 短名，如 mslug.zip）
└── neogeo/       .zip（同上，另需 neogeo.zip 作 BIOS）
```

丢完文件后进 **后台 → 游戏管理 → 扫描 ROM 目录**，它会自动识别平台、按文件名建条目上架。

> 目录名就是平台简称，别改成 `NES` 或 `红白机`，扫描靠目录名判断平台。

**方式二：后台上传**

后台 → 游戏管理 → 右上「上传游戏」，单文件上限 512 MB。适合零散补几个游戏。

### 6.3 BIOS（街机 / NEOGEO 必看）

NEOGEO 和部分街机游戏缺 BIOS 会黑屏或直接失败：

- 后台 → **BIOS 管理** → 上传 `neogeo.zip`
- 或者直接丢进 `data/bios/neogeo.zip`

其他平台（FC/SFC/GB/GBA/MD）不需要 BIOS。NDS 通常也不需要。

### 6.4 站点个性化

- **后台 → 站点素材**：换 LOGO、favicon、平台插画、捐赠二维码。清空某项就回到内置默认图
- **后台 → 文案管理**：改首页标题、副标题、页脚，六种语言分别可改
- **后台 → 平台排序**：拖动调整首页平台卡片顺序，也能隐藏某平台
- **前台右上角**：玩家可切换简体 / 繁体 / 英文 / 日文 / 韩文 / 俄文

### 6.5 关闭公开注册

不想让陌生人注册，`.env` 里设 `ALLOW_REGISTER=false` 后重启：

```bash
docker compose up -d
```

---

## 七、反向代理与 HTTPS

想让玩家用域名访问、或者挂到已有网站上，走反向代理。**三个参数必须设对**，否则会出各种怪问题。

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name game.example.com;

    ssl_certificate     /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;

    # ① 上传 ROM 必需，否则大文件报 413
    client_max_body_size 1024m;

    location / {
        proxy_pass http://127.0.0.1:30000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # ② 大 ROM 下载慢，超时放宽，否则传到一半断
        proxy_read_timeout  300s;
        proxy_send_timeout  300s;
        proxy_buffering     off;

        # ③ 不要对 wasm 做 gzip，省 CPU 也没意义（镜像里已是压缩态）
        gzip off;
    }
}
```

### Caddy（自动 HTTPS，最省事）

```caddyfile
game.example.com {
    reverse_proxy 127.0.0.1:30000
    encode zstd gzip
}
```

Caddy 默认不限上传体积，不用额外配置。

### 群晖自带反代

控制面板 → 登录门户 → 高级 → 反向代理服务器 → 新增：

- 来源：`HTTPS` / 你的域名 / `443`
- 目的地：`HTTP` / `localhost` / `30000`
- 自定义标题里勾选 **WebSocket**（虽然本项目不依赖，勾上无害）

群晖反代默认上传上限在 nginx 模板里，遇到 413 需要改 `/usr/syno/etc/synoservice/nginx/` 下的配置，比较麻烦，建议直接用 Nginx 或 Caddy。

### 一个容易踩的坑

**不要**把服务挂在子路径（如 `https://example.com/games/`），前端路由和静态资源都按根路径写死，子路径会白屏。用独立子域名（`game.example.com`）最稳。

---

## 八、更新版本

### 镜像部署的更新

```bash
cd /opt/abxy
docker compose pull
docker compose up -d
```

`up -d` 只会替换有变化的容器，停机 1~2 秒。数据库结构如有变化，启动时会自动迁移，**数据不会丢**。

### 源码部署的更新

```bash
cd abxy-arcade
git pull
docker compose up -d --build
```

### 建议：更新前先备份

```bash
cd /opt/abxy
docker compose stop
tar -czf ~/abxy-backup-$(date +%F).tar.gz data/
docker compose start
```

ROM 体积大的话，备份时排除掉：

```bash
tar -czf ~/abxy-backup-$(date +%F).tar.gz --exclude=data/roms data/
```

---

## 九、备份、迁移、换机器

**整个项目的数据只有 `data/` 一个目录**，没有外部数据库、没有 Redis、没有对象存储。迁移就三步：

```bash
# 老机器
docker compose stop
tar -czf abxy-full.tar.gz data/

# 拷到新机器后
mkdir -p /opt/abxy && cd /opt/abxy
tar -xzf abxy-full.tar.gz            # 解出 data/
# 放好 docker-compose.yml 和 .env
docker compose up -d
```

不用改任何配置，用户账号、密码、收藏、游戏库、封面、站点设置全部原样保留。
`data/.jwt-secret` 会一起带过去，所以**玩家不用重新登录**。

> SQLite 是文件数据库，备份前务必先 `stop`，否则可能拷到写入一半的文件。

---

## 十、故障排查

### 容器起不来，日志报 `EACCES` / `permission denied`

宿主机上的 `data` 目录属主不对（常见于用 root 创建后普通用户跑）。

```bash
sudo chown -R 1000:1000 /opt/abxy/data
docker compose restart
```

容器内以 uid 1000 的 `node` 用户运行，entrypoint 只在检测到不可写时才会自动修权限，所以先手动改一次最稳。

### 页面打开白屏

按 F12 看 Console。常见原因：

- **`/api/health` 请求 502** → 容器没起来，`docker compose logs` 看报错
- **JS/CSS 404** → 反代把 `/assets` 路径搞丢了，检查 `proxy_pass` 末尾有没有多余的斜杠
- **一直是旧界面** → 浏览器缓存，`Ctrl + F5` 强制刷新

### 点游戏提示 `Failed to start game`

模拟器资源没加载到。先在能访问服务器的机器上验证：

```bash
curl -s -o /dev/null -w "%{http_code} %{size_download}\n" http://127.0.0.1:30000/emulatorjs/emulator.min.js
```

- 返回 `200 426346` → 静态资源正常，问题在浏览器端缓存，强刷
- 返回 `404` → 反代把 `/emulatorjs` 拦了，检查 Nginx 有没有针对 `.js` 的特殊规则
- 页面走到了公网 CDN（Console 里能看到 `cdn.emulatorjs.org`）→ 说明本地资源没命中，同上检查反代

### 上传 ROM 报 413 / 传到一半失败

反代的上传限制。Nginx 加 `client_max_body_size 1024m;`，群晖改 nginx 模板或直接用独立 Nginx 反代。
后台上传单文件上限是 512 MB，更大的 NDS ROM 建议直接丢 `data/roms/nds/` 再扫描。

### 街机游戏黑屏 / 直接退出

- NEOGEO 必须先有 `neogeo.zip`（后台 BIOS 管理上传）
- FBNeo 对 romset 版本敏感，romset 与内核版本不匹配就会失败
- 文件名必须是 romset 短名（`mslug.zip`），**不要改名、不要解压**

### `exec format error` / 提示架构不匹配

镜像拉错了架构。本项目是多架构镜像，正常不会出现；如果手动指定过 tag，去掉 `--platform` 重拉即可：

```bash
docker rmi ghcr.io/doulicon/abxy-arcade:latest
docker compose pull && docker compose up -d
```

### 忘记管理员密码

容器里跑一条命令重置（把 `新密码` 换掉）：

```bash
docker exec abxy-arcade node -e "
const D=require('/app/node_modules/better-sqlite3');
const bcrypt=require('/app/node_modules/bcryptjs');
const db=new D('/data/app.db');
const h=bcrypt.hashSync('新密码',10);
const r=db.prepare('UPDATE users SET password_hash=? WHERE username=?').run(h,'admin');
console.log(r.changes?'已重置':'没找到该用户');
"
```

改完直接登录，不用重启。

### 时区不对 / 日志时间差 8 小时

`.env` 里加 `TZ=Asia/Shanghai`，然后 `docker compose up -d`。

### 端口 30000 被占用

`.env` 里改 `HOST_PORT=30001`（或任意空闲端口），`docker compose up -d`。

### 想看实时日志

```bash
docker compose logs -f --tail=100
```

---

## 十一、目录结构与数据说明

```
/opt/abxy/
├── docker-compose.yml      # 部署配置
├── .env                    # 你的参数（端口、密码、路径）
└── data/                   # ★ 所有数据都在这里，备份只需这一个目录
    ├── app.db              # SQLite 数据库：游戏、用户、系列、设置
    ├── .jwt-secret         # 登录态密钥（别删，删了所有人要重新登录）
    ├── roms/               # ROM，按平台分子目录
    │   ├── fc/  sfc/  gb/  gbc/  gba/  n64/  md/  nds/  arcade/  neogeo/
    │   └── <平台>/resources/   # 该平台的附加资源（说明文档等）
    ├── covers/             # 游戏封面、系列封面
    ├── bios/               # BIOS 文件（neogeo.zip 等）
    └── assets/             # 你自己上传的站点素材
```

内置的模拟器内核、平台默认插画、站点 LOGO 都打包在镜像里，不属于数据目录，升级时会被新版本替换。

---

## 十二、免责声明

- 本项目只提供**游戏库管理与模拟器前端**，不附带任何 ROM 文件。
- ROM 的版权归各自权利人所有。请仅使用你**合法拥有**的卡带 / 光盘自行备份的 ROM，或在法律允许的范围内使用。
- 将本站公开到互联网前，请自行确认你所在地区的法律要求，并设置合理的访问控制（如 `ALLOW_REGISTER=false`）。

---

## 附录 A：常用命令速查

```bash
docker compose up -d              # 启动（后台）
docker compose stop               # 停止（保留容器）
docker compose restart            # 重启
docker compose down               # 删除容器（数据在 data/ 里，不受影响）
docker compose pull && docker compose up -d   # 更新到最新版
docker compose ps                 # 看状态
docker compose logs -f --tail=100 # 实时日志
docker exec -it abxy-arcade sh    # 进容器看看
```

## 附录 B：自己构建并发布镜像

改完代码想发自己的镜像，`scripts/publish-image.sh` 对任何容器仓库都通用。

### 推送到 GHCR（项目官方用的就是这个）

先在 GitHub 建一个 Personal Access Token，勾上 **`write:packages`**：

> github.com → 右上头像 → Settings → Developer settings → Personal access tokens → Tokens (classic) → Generate new token

```bash
echo "你的PAT" | docker login ghcr.io -u 你的GitHub用户名 --password-stdin
bash scripts/publish-image.sh ghcr.io/你的GitHub用户名 1.0.0
```

**推完必须把包设为公开**，否则别人 pull 会提示未授权：

> GitHub → 头像 → Your packages → `abxy-arcade` → Package settings → Change visibility → Public

这一步最容易漏。

### 推送到阿里云 ACR（国内最快）

```bash
docker login registry.cn-hangzhou.aliyuncs.com      # 密码是「访问凭证」里的固定密码，不是阿里云登录密码
bash scripts/publish-image.sh registry.cn-hangzhou.aliyuncs.com/你的命名空间 1.0.0
```

控制台里把仓库类型改成「公开」，别人才能匿名拉。

### 推送到 Docker Hub

```bash
docker login -u 你的用户名                          # 密码用 Access Token
bash scripts/publish-image.sh 你的用户名 1.0.0
```

> 国内大多数网络直连 `registry-1.docker.io` 会被 DNS 污染，推不上去；能推说明你有代理。

### 只在本机测试，不推送

```bash
bash scripts/publish-image.sh ghcr.io/你的用户名 1.0.0 --single
```

脚本默认用 buildx 同时构建 amd64 + arm64，推 `1.0.0`、`latest` 两个标签。
机器没有 buildx 时会自动降级为单架构（`--single` 可手动强制）。
