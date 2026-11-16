# ABXY ARCADE · 像素复古游戏厅

一个用 Docker 一键部署的**网页复古游戏模拟器平台**：深海蓝霓虹像素风前端、按平台分区的游戏大厅、游戏库/详情/收藏、管理员后台（游戏 / 用户 / BIOS / 站点素材）、浏览器内直接开玩并支持手柄。

- 前端：React 18 + TypeScript + Vite + Tailwind（纯像素风 UI，深色霓虹）
- 后端：Node.js + Express + SQLite（better-sqlite3，单文件数据库，零外部依赖）
- 模拟器：[EmulatorJS](https://emulatorjs.org)（WebAssembly，浏览器内运行，支持手柄 / 存档 / 全屏 / 虚拟按键）
- 部署：多阶段 Docker 构建，单容器，数据卷持久化
- 站点图片：全部走后台「站点素材」槽位管理，可随时替换为自有图片，无需改代码
- 站点文案：Banner、平台卡片、页脚等展示文字走后台「文案管理」，按语言分别配置
- 多语言：简体中文 / 繁體中文 / English / 日本語 / 한국어 / Русский，右上角一键切换
- 主题：夜晚（默认）/ 白天两套配色，右上角太阳/月亮图标一键切换，偏好保存在本地
- 字体：全站像素字体（Press Start 2P + Fusion Pixel），随站点分发、不依赖外网，均为 SIL OFL 1.1

---

## 一、快速开始

> **给别人部署 / 发到论坛 / 装到 NAS？看 [DEPLOY.md](DEPLOY.md)** —— 镜像部署、源码部署、NAS 图形界面、反向代理、备份迁移、故障排查都在里面。

### 方式 0：直接用现成镜像（最快，不编译）

```bash
mkdir -p abxy && cd abxy
curl -fsSL -o docker-compose.yml \
  https://raw.githubusercontent.com/Doulicon/abxy-arcade/main/docker-compose.image.yml
docker compose up -d
```

打开 <http://localhost:30000>，`admin` / `admin123` 登录（记得改密码）。

镜像地址 `doulicon/abxy-arcade:latest`，同时支持 amd64 与 arm64。国内拉不动就配镜像加速器，或改用备用地址 `ghcr.io/doulicon/abxy-arcade:latest`。

### 方式 A：Docker Compose 源码构建（要改代码时用）

```bash
# 1. 进入项目目录
cd abxy

# 2. 准备配置，至少改 ADMIN_PASSWORD
cp .env.example .env

# 3. 构建并启动
docker compose up -d --build

# 4. 查看日志（首次启动会打印管理员账号）
docker compose logs -f
```

打开 <http://localhost:30000>，用 `admin` / `admin123`（或你自定义的密码）登录 → 右上角「管理后台」→「上传新游戏」。

### 方式 B：纯 docker 命令

```bash
docker build -t abxy-arcade .
docker run -d --name abxy-arcade \
  -p 30000:3000 \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -e ADMIN_PASSWORD="your-strong-password" \
  -v "$(pwd)/data:/data" \
  --restart unless-stopped \
  abxy-arcade
```

### 方式 C：本地开发（不用 Docker）

```bash
npm install
npm --prefix web install

# 终端 1：后端（:3000）
npm run dev

# 终端 2：前端热更新（:5173，已代理 /api 与 /uploads）
npm run dev:web
```

生产模式本地运行：

```bash
npm run build:web   # 产物在 web/dist，后端会自动托管
npm start
```

---

## 二、管理员账号

首次启动时自动创建，之后**不会覆盖**已存在的账号：

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `ADMIN_USERNAME` | `admin` | 管理员用户名 |
| `ADMIN_PASSWORD` | `admin123` | 初始密码，请在部署前修改 |

> 已有账号想改密码？登录后在数据库里重置，或临时把 `ADMIN_USERNAME` 改成新名字重启，再用 `/api/auth/password` 改密码。
> 简单做法：进入容器执行
> `docker compose exec abxy-arcade node -e "const b=require('bcryptjs');const D=require('better-sqlite3');const d=new D('/data/app.db');d.prepare('UPDATE users SET password_hash=? WHERE username=?').run(b.hashSync('新密码',10),'admin')"`

---

## 三、上传游戏

后台 → 上传新游戏，填写：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| ROM 文件 | ✅ | 见下方格式表，可直接传 `.zip`（zip 内放一个 ROM） |
| 游戏名称 | ⬜ | **留空则自动用 ROM 文件名（去扩展名）当名称**，其余字段全部走默认值 |
| 平台 | ⬜ | 默认「自动识别（按 ROM 后缀）」；`.zip` 归为街机。手动选择可强制指定 |
| 封面 | ⬜ | **建议 16:9 横图（如 1280×720）**，与卡片图框一致，直接传游戏截图即可；也可填外链 URL，不填会自动生成平台配色占位图 |
| 年份/开发商/发行商/类型/人数 | ⬜ | 展示用 |
| 简介 | ⬜ | 支持换行 |
| 模拟器核心 | ⬜ | 默认按平台自动选；街机可切 CPS1/CPS2 旧核心 |
| BIOS | ⬜ | 街机（尤其 NEOGEO）用，先在「BIOS 管理」上传再选 |
| 设为首页精选 | ⬜ | 会出现在首页顶部轮播 |

### 支持的平台与 ROM 格式

| 平台（目录名） | 显示名 | EJS 内核 | 可用扩展名 |
| --- | --- | --- | --- |
| `fc` | FC / 红白机 | `fceumm` | `.nes` `.unf` `.unif` `.zip` |
| `sfc` | SFC / 超任 | `snes9x` | `.sfc` `.smc` `.fig` `.zip` |
| `gb` | Game Boy | `gambatte` | `.gb` `.zip` |
| `gbc` | Game Boy Color | `gambatte` | `.gbc` `.zip` |
| `gba` | Game Boy Advance | `mgba` | `.gba` `.zip` |
| `n64` | Nintendo 64 | `mupen64plus_next` | `.n64` `.z64` `.v64` `.zip` |
| `md` | MD / 世嘉五代 | `genesis_plus_gx` | `.md` `.gen` `.smd` `.bin` `.zip` |
| `nds` | Nintendo DS | `melonds` | `.nds` `.zip` |
| `arcade` | Arcade / 街机 | `fbneo`（可切 `fbalpha2012_cps1/cps2`） | `.zip` |
| `neogeo` | NEOGEO / 街机 | `fbneo` + `neogeo.zip` | `.zip` |

> 平台 id 即 ROM 目录名，与显示简称一致；`emulatorCore` 是 EmulatorJS 的系统名（FC 对应 `nes`），两者解耦，改显示名不影响模拟器。
> PS1 需要 BIOS，默认未开放，可在 `server/platforms.js` 中自行扩展。
### ROM 资源目录（按平台分类）

上传的 ROM 不再平铺在 `data/roms/` 根目录，而是**每个平台一个文件夹，文件夹名就是平台 id（= 平台简称的小写）**：

```
data/roms/
├── fc/           resources/     # 红白机 ROM；resources/ 放该平台的附加资源
├── sfc/          resources/
├── gb/  gbc/  gba/  n64/  md/  nds/
├── arcade/       resources/
│   ├── mslug.zip
│   └── resources/fbneo/        # 内核存档、高分配置等资源文件
└── neogeo/       resources/
    ├── mslug.zip
    └── resources/neogeo.zip    # 平台 BIOS 备份（正式生效的是 data/bios/）
```

- 上传时自动落到对应平台目录（`server/roms.js` 的 `saveRom()`），文件名尽量保留原始名；街机仍是 `romset 短名.zip`。
- `resources/` 里的文件**不会被当成游戏扫描**，用来放 BIOS 备份、系统文件、说明等。
- 旧版本平铺在 `data/roms/` 根目录的记录，服务启动时会自动按记录的平台搬进对应文件夹并更新数据库（`migrateRomLayout()`）。
- 旧版本的 `nes/`、`snes/` 目录，启动时会自动迁移为 `fc/`、`sfc/`。

### 直接丢 ROM 也能上架（默认信息 + 文件名）

两种方式都支持「没录入信息就按默认处理」：

1. **后台 → 上传新游戏**：只选 ROM 文件，名称留空、平台保持「自动识别」，提交后会以文件名为标题、其余字段默认值建条目。
2. **后台 → 扫描 ROM 目录**：把 ROM 直接放进 `data/roms/<平台>/`（FTP / 挂载 / 复制都行），点右上角「扫描 ROM 目录」按钮。未登记的文件会批量建条目：标题 = 文件名，平台 = 所在文件夹，核心/BIOS 用平台默认值，其余留空；缺少必需 BIOS 的文件会跳过并在提示里给出数量。

> 扫描接口：`POST /api/admin/roms/scan`，返回 `created`（新建）、`restored`（找回丢失的 ROM）、`missing`（本次标记为缺 ROM）、`skipped`（文件名 + 原因）。

### 误删 ROM 不会丢资料（rom_missing）

扫描是**双向同步**，判定只比「ROM 文件名」，不看目录：

- 已登记的游戏，扫描时先按上传原名（`rom_name`）再按实际落盘名（`rom_file`）去找同名文件；目录被搬动、平台文件夹被改名都能自己认回来，并修正 `rom_file`。
- 找不到同名文件 → 只在 `games.rom_missing` 标 `1`（状态显示「ROM 丢失」，详情页显示「暂不可玩」），条目、封面、简介、收藏、游玩次数全部保留。
- 把文件放回 `data/roms/<任意平台>/`（同名即可）再扫一次，自动清掉标记并恢复可玩，返回里显示在 `restored`。
- 从没上传过 ROM 的条目（`rom_file = ''`）不参与该判定，仍显示「待上传」。

> 街机 `rom_name` 是内核匹配 romset 用的名字，扫描不会改写它，只在为空时补上。


### Arcade / NEOGEO（重点）

街机跟家用机完全不是一回事，三个坑提前说清：

1. **ROM 必须是 romset（保持 .zip，不要解压）**，且压缩包名就是 romset 短名，例如 `mslug.zip`、`sf2ce.zip`、`kof98.zip`。
   FBNeo 是**用压缩包文件名**去匹配驱动名的，改成中文名或随机名一定会报 `Romset is unknown`。
   后台已做校验：街机平台上传时文件名不符合 `小写字母+数字+下划线.zip` 会直接拒绝并提示。
2. **romset 版本要和 FBNeo 对齐**。老 romset（CPS1/CPS2 早期合集）可在游戏表单里把「模拟器核心」切到 `fbalpha2012_cps1` / `fbalpha2012_cps2`。版本不匹配时模拟器会列出缺哪个 ROM，按提示换对应版本的 romset 即可。
3. **NEOGEO 必须挂 BIOS**：管理员后台 →「BIOS 管理」上传 `neogeo.zip`（保持原名），然后在上传游戏时 BIOS 下拉里选中它。没挂 BIOS 的游戏会直接提示无法启动，不会黑屏。

扩展名报错、`Zip is not supported` 之类，基本都是把 romset 解压成散文件了——重新压回 `romset 名.zip` 即可。

### 游玩与操作

- 进入游戏页后自动加载模拟器。**内核已随项目分发（`server/public/emulatorjs`，约 35MB），走本地同源加载，不依赖外网**，首次进入只需几秒。
- **键盘**：方向键移动，`Z` 确认 / `X` 取消，`Enter` 开始，`Esc` 退出全屏。
- **手柄**：插上 USB / 蓝牙手柄后进入游戏即自动识别（浏览器 Gamepad API）。支持在模拟器设置里重新映射按键；手机端会自动显示虚拟按键。
- **存档**：游戏内菜单 → Save State / Load State，存档保存在浏览器本地（IndexedDB），换设备不通用。
- 画面比例、滤镜、音量、快进等均在模拟器菜单里调整。
- **退出**：顶部「返回」或模拟器菜单里的「退出模拟」都会先停内核（暂停主循环 + 挂起音频）再回到详情页；不会再出现「只剩白屏和背景音乐、回不去」的情况（`web/src/pages/Play.tsx` 在实例上监听 `exit` 事件，并在卸载时统一清理）。

### 启动流程与稳定性（`web/src/pages/Play.tsx`）

1. **ROM 预检**：进页面先对 ROM 地址发一次 `HEAD`，文件被移动/删除时直接提示「游戏文件（ROM）已丢失」，而不是让模拟器笼统报「网络错误」。
2. **核心预载**：自己下载 `<core>-legacy-wasm.data`（约 8MB），带超时、**3 次退避重试**和 `content-length` 完整性校验；成功后用 `blob:` URL 通过 `filePaths` 交给内核，内核直接读内存、不再发网络请求。
   > EmulatorJS 自带的下载没有重试，网络抖一次就转去连 `cdn.emulatorjs.org`（国内基本不可达），表现就是「有时候加载核心失败、刷新又好了」。预取失败时会照常启动，让它自己再试一次。
3. **运行时只注入一次**：`emulator.min.js` 全页面只加载一次，重试/重启只是重新 `new EmulatorJS(...)`。
   > 旧实现每次重挂 `loader.js` 会二次执行该脚本，直接抛 `Identifier 'EJS_STORAGE' has already been declared`，导致「重启 / 重试之后再起不来、只能刷新」。
4. **失败兜底**：核心类错误自动重试 2 次（进度条显示「重新载入核心 n/2」），其它错误把模拟器红字翻译成中文显示，并提供「重试 / 返回详情」按钮。

### 站点图片（后台 →「站点素材」）

网站所有静态图片都按**固定槽位**管理，后台直接替换即可生效，不用改代码、不用重新构建。

| 槽位 key | 位置 | 建议尺寸 |
| --- | --- | --- |
| `hero_banner` | 首页顶部主横幅 | 1920 × 720 |
| `site_logo` | 页头 LOGO（留空显示文字商标） | 240 × 64 |
| `og_image` | 分享到社交平台的预览图 | 1200 × 630 |
| `empty_state` | 空状态插画 | 600 × 600 |
| `game_placeholder` | 游戏无封面时的占位图 | 600 × 836 |
| `section_more` | 分区「查看更多」插图 | 400 × 300 |
| `platform_<平台id>` | 首页平台卡片头图 | 640 × 400（16:10） |

操作：登录管理员 →「管理后台」→「站点素材」→ 找到槽位 →「上传」选图，或「填外链」直接用站外地址；「恢复默认」会清空并回到内置像素风占位。
图片落在 `data/assets/`，随数据卷持久化；替换时旧图会自动删除，不会堆积。

### 站点文案（后台 →「文案管理」）

首页 Banner、平台卡片（名称 / 副名 / 简介 / 年份 / 厂商）、分区标题、空状态、页脚等**展示文字**都能在后台改，不用改代码。

- 顶部语言标签切换要编辑的语言，六种语言各自独立保存；
- 字段留空 = 删除该语言的覆盖，回到内置文案；某语言完全没配时**回退中文**；
- 「默认」按钮恢复单个字段，「全部恢复默认」清空该语言的所有覆盖；
- 保存后前台立刻生效（当前浏览器语言会自动刷新文案）；
- 系统级文字（错误提示、按钮状态、日期格式等）内置于 `web/src/i18n.tsx`，不在后台暴露。

---

## 四、界面规范与多语言

### 首页结构

> 背景图在 `web/src/pages/Home.tsx` 里作为绝对定位的背景层：桌面端按原图比例整宽铺开（`width:100%; height:auto`，不裁切），用 `mask-image` 让图片本身淡出到页面底色；同一张图再放大模糊一层（`.hero-bg-blur`）铺满整屏，补住原图比例之外的区域 —— 所以**没有分割线、不会把整张图切断，也不会出现大片死黑**。

1. **首屏 Hero**：桌面端高度 = `100vh - 4rem - var(--plat-peek)`，**首屏底边正好切在平台卡图片的下沿** —— 玩家一眼就能看到「下面还有平台」，但只看到图、看不到文字，滚一次才露全卡。`--plat-peek`（平台区抬头 + 卡片方图高）由 `Home.tsx` 用 `useLayoutEffect` + `ResizeObserver` 实测后写到 Hero 上，所以 1024 / 1366 / 1440 / 1920 各种宽度都精确对齐（不必按分辨率写死）；视口过矮时保底 `min-height: 340px`。文案用 `.hero-copy` 的 `padding-bottom: max(0, 100vh - 4rem - var(--plat-peek) - 41.2vw)` 居中到图片可见区域（横幅 1672×689，高度约 41.2vw）。只保留小字号标签 / 主标题 / 副标题 / 一行说明，**没有 CTA 按钮**。
2. **平台分区**：紧跟 Hero（首屏已露出第一行卡片的图片），**滚一次才完整显示第一行（含名称/简介/年份框）**。每行 5 个、整体居中，`.platform-grid` 最大宽 `min(1440px, 100%)`，1080p 下单卡约 275 × 401。
3. **精选推荐**：统一像素卡片展示游戏（标题 + 类型标签）。
4. 「最近上架」模块已移除；顶栏在「游戏库」后新增「游戏平台」（`/platforms`，全部平台总览页）。

窄屏（<768px）下 Hero 保持整屏（`100vh - 4rem`，最小 420px），2.43:1 的横幅放不进竖屏，`.hero-bg-img` 会退回 `object-fit: cover` 填满 Hero 区，同样在底部淡出，不会露出空白。

### 分段滚动

滚轮一次 = 翻一屏：Hero（露到卡片图片下沿）→ 平台分区（整屏）→ 精选推荐（及页脚自然滚动）。实现在 `web/src/pages/Home.tsx` 的 `wheel` 监听里，只在 **≥1024px** 且当前滚动位置停在这三个锚点之一时接管，其余情况保持原生滚动，不会把页脚卡住；移动端完全走原生滚动。

### 像素卡片规范

- `.px-card`：外层 3px 边框色 + 内层内容底色，配合 `clip-path` 的 10px 阶梯切角，形成非圆角的像素边框；悬停时边框变霓虹色、卡片轻微上浮。
- 游戏卡与平台卡共用同一个 `<PixelCard>` 组件，保证全站视觉一致。
- **平台卡 ≈ 275 × 401**（含 3px 边框，宽度随容器 5 等分自适应）：上方方图（`.card-art--platform`，1:1），下方 118px 文字区（`.card-body--platform`）= 名称（**13px**，左，白色）+ 全称（8px，右，同一行）／简介（**12px，左对齐、与名称同色**，两行截断）／年份方框（左下，10px）+ 厂商（右下，与年份同一行，不额外占行）。
- **游戏卡 = 横向**：上方 **16:9 横图**（`.card-art--game`，贴近显示器比例，直接传游戏截图即可），下方 **68px** 文字区（`.card-body--game`）只放游戏名（**13px**，两行截断）+ 类型标签（`.genre-chip`，**11px**，最多两枚、单行不换行）；类型在后台用 `/` 或 `、` 分隔即可拆成多个标签。1440 宽下 4 列，单卡约 288 × 230（图 162 高）。
  - 平台标签（`.platform-badge`，FC / ARCADE / NEOGEO…，**10px** 像素字）在**图片右下角**；精选星标仍在左上，缺 ROM 提示在右上，互不打架。
  - 视觉空档避让：文字区上下内边距压到 4px、名称与标签整体垂直居中、间距 4px —— 单行标题时不会在中间留一条空带，两行标题 + 两枚标签也刚好填满（不换行、不溢出）。
  - 游戏网格统一为 **1 / 2 / 3 / 4 列**（手机 / sm / lg / xl），首页精选、游戏库、我的收藏、详情页「同平台推荐」四处一致；封面在后台表单里也按 16:9 预览。
  - **详情页封面同样 16:9**（`.aspect-video`，宽 300 / 380px），和卡片同一比例，上传的横图不会再被裁掉两边。
- 文字区高度恒小于图片区，超出内容 `overflow: hidden` 裁掉，不会撑破卡片。
- 年份用 `.year-chip`：橙色 2px 边框 + 橙色文字 + 2px 硬阴影。
- 按钮 / 输入框 / 筛选标签统一 `.px-btn-shape`（4px 阶梯切角）+ `drop-shadow` 硬阴影，没有圆角。
- 卡片图片统一 `image-rendering: pixelated`，放大保持像素感。

### 多语言（i18n）

| 语言 | 代码 | 说明 |
| --- | --- | --- |
| 简体中文 | `zh` | 默认语言，缺省回退目标 |
| 繁體中文 | `zh-Hant` | 使用 TC 字形 |
| English | `en` | |
| 日本語 | `ja` | 使用 JP 字形 |
| 한국어 | `ko` | 使用 KR 字形 |
| Русский | `ru` | 西里尔字形来自 Press Start 2P / Fusion Pixel |

- 切换入口：页头右上角地球图标；选择结果存在 `localStorage`，并按 `navigator.language` 首次自动匹配。
- 展示文案（可后台改）走 `/api/texts?locale=`；系统文案（导航、按钮、字段名、错误提示）走 `web/src/i18n.tsx` 内置字典。
- **后台管理页同样跟随语言**：管理后台 / 站点素材 / 文案管理 / 游戏表单的全部界面文字在 `web/src/i18n-admin.ts`（约 160 个键 × 6 语言）；「文案管理」里每个字段的名字也按语言显示，平台字段自动拼上当前语言的平台名。
- 取值顺序：后台覆盖(当前语言) → 内置(当前语言) → 后台覆盖(中文) → 内置(中文)。

### 字体与许可

| 字体 | 用途 | 来源 | 许可证 |
| --- | --- | --- | --- |
| **Press Start 2P** | 标题、导航、数字等拉丁 / 西里尔文本 | [google/fonts · pressstart2p](https://github.com/google/fonts/tree/main/ofl/pressstart2p) | SIL OFL 1.1 |
| **Fusion Pixel 12px Proportional**（缝合像素字体） | 中日韩正文与标题回退（SC / TC / JP / KR 四套字形） | [TakWolf/fusion-pixel-font](https://github.com/TakWolf/fusion-pixel-font) | SIL OFL 1.1 |

字体文件在 `web/public/fonts/`，构建时随站点分发，运行时不请求 Google Fonts / CDN；许可证原文见 `web/public/fonts/LICENSE-fusion-pixel.txt`。
CJK 字形按界面语言自动切换（`html[data-locale]` → CSS 变量 `--font-cjk`），避免简繁日韩混用异体字。

---

## 五、数据与备份

所有数据都在挂载的 `./data` 目录：

```
data/
├── app.db          # SQLite 数据库（用户、游戏元数据、收藏、游玩记录）
├── app.db-wal      # WAL 日志（备份时请一并复制或先停容器）
├── .jwt-secret     # 自动生成的登录密钥
├── roms/           # ROM 按平台分目录：roms/<平台 id>/（内含 resources/ 附加资源）
├── bios/           # BIOS（neogeo.zip 等，随游戏库一起备份）
├── covers/         # 上传的游戏封面
└── assets/         # 站点素材图（首页横幅、平台插画等）
```

备份：

```bash
docker compose stop
tar -czf abxy-backup-$(date +%F).tar.gz data/
docker compose start
```

迁移到新机器：把整个 `data/` 目录拷过去，重新 `docker compose up -d` 即可。

### 更新到新版本（数据不丢）

**核心事实：数据不在镜像里。** `data/` 通过 bind mount 挂在宿主机，且同时被 `.gitignore` 和 `.dockerignore` 排除。所以不论 `git pull`、`docker compose build` 还是重建容器，**都不会碰到 `data/`**。

一键更新：

```bash
cd /你的项目目录
chmod +x scripts/update.sh   # 首次需要
./scripts/update.sh
```

> 群晖 / 威联通等 NAS 上 Docker 守护进程只对 root 开放，请用 `sudo bash scripts/update.sh`。
> 脚本会自动给 docker 命令补 `sudo`，并在拉取完成后把 `.git` 属主交还给 `$SUDO_USER`，后续普通用户也能继续 `git pull`。

脚本做的事：备份 `data/`（跳过体积大的 `roms/`）→ `git pull --ff-only` → 重建镜像 → 滚动重启 → 健康检查。

#### 服务器上的 git 用不了 HTTP 时（群晖 DSM 常见）

DSM 的 git 套件没有编译 HTTP 传输模块，`git fetch` 会直接报：

```
git: 'remote-http' is not a git command
```

这时改用不依赖 git 的同步脚本：从 Gitea 下载源码归档 → `rsync` 覆盖到项目目录 → 自动重建部署。

```bash
cd /你的项目目录
bash scripts/sync-code.sh              # 同步 + 重建（等价于上面的 update.sh）
bash scripts/sync-code.sh --no-deploy  # 只同步代码
bash scripts/sync-code.sh --dry-run    # 预演，列出会变动的文件（需 rsync）
```

`data/`、`backups/`、`.env`、`.git` 全部排除，既不会被覆盖也不会被删除。可用 `ABXY_REF=main`、`ABXY_HOST=http://192.168.0.227:30001`、`ABXY_REPO=nas/ABXY` 覆盖默认值。

可选参数：

| 参数 | 用途 |
| --- | --- |
| `--no-pull` | 新代码已手动覆盖到目录，只重建镜像 |
| `--skip-backup` | 跳过备份（不建议） |

手动步骤（不用脚本时等价于）：

```bash
sudo docker compose stop                   # 1. 停服务，让 SQLite 落盘
sudo tar -czf abxy-backup-$(date +%F).tar.gz data/   # 2. 备份
git pull origin main                       # 3. 取新代码
sudo docker compose up -d --build          # 4. 重建并启动
sudo docker compose logs -f --tail=50      # 5. 看日志确认
```

**线上不停机版本**：`build` 阶段旧容器仍在服务，只在最后 `up -d` 切一刀，停机约 1~2 秒。

#### 会导致数据丢失的操作（务必避开）

| 操作 | 后果 |
| --- | --- |
| `rm -rf data` / 手动删 `data/` | 数据库、封面、ROM、BIOS 全没 |
| 改 `.env` 里 `DATA_PATH` 指向新路径 | 新路径是空库，看起来像"数据丢了"（旧数据还在原目录） |
| 在新目录重新部署却忘了搬 `data/` | 同上 |
| 用 tar 备份只拷 `app.db` 而漏了 `app.db-wal` | 恢复后可能缺失最新写入 |

`docker compose down -v` 对本项目**不会**删 `data/`（`-v` 只删 named volume，本项目用的是 bind mount），但仍不建议在没备份时使用。

#### 数据库结构升级

新版本若加了字段或表，启动时会自动 `ALTER TABLE ADD COLUMN` / `CREATE TABLE IF NOT EXISTS`，无需手动迁移。降级到旧版本则可能不兼容（旧代码读不懂新字段），所以回滚时建议连数据一起回滚：

```bash
git reset --hard <旧提交>
tar -xzf backups/data-<时间戳>.tar.gz -C ./data
docker compose up -d --build
```

---

## 六、环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 监听端口 |
| `DATA_DIR` | `./data`（容器内 `/data`） | 数据目录 |
| `JWT_SECRET` | 自动生成并存入 data | 登录令牌密钥，生产环境务必固定 |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `admin123` | 初始管理员 |
| `ALLOW_REGISTER` | `true` | 设为 `false` 关闭注册（只能由管理员建号） |
| `EMULATOR_CDN` | `/emulatorjs/`（本地） | 模拟器运行时地址。默认走同源本地资源；改成 `https://cdn.emulatorjs.org/stable/data/` 可切回官方 CDN |

---

## 七、项目结构

```
.
├── Dockerfile                 # 多阶段构建：前端 → 依赖 → 运行镜像
├── docker-compose.yml
├── docker-entrypoint.sh       # 修正数据卷权限后降权运行
├── scripts/
│   └── fetch-emulator.sh      # 重新镜像 EmulatorJS 运行时（升级版本时执行）
├── server/
│   ├── public/emulatorjs/     # 本地模拟器运行时（loader / 内核 / 语言包，约 35MB）
│   ├── assets.js              # 站点素材槽位定义（key / 名称 / 尺寸建议）
│   ├── index.js               # Express 入口、静态托管、错误处理
│   ├── config.js              # 环境变量与密钥
│   ├── db.js                  # SQLite 建表与管理员初始化
│   ├── auth.js                # JWT 签发 / 鉴权中间件
│   ├── platforms.js           # 平台与模拟器内核映射
│   ├── upload.js              # 封面 / BIOS 上传与落盘
│   ├── roms.js                # ROM 平台目录、落盘、扫描与旧数据迁移
│   ├── texts.js               # 展示文案注册表（6 语言内置默认值）
│   └── routes/
│       ├── auth.js            # 注册 / 登录 / 改密
│       ├── assets.js          # 站点素材上传 / 替换 / 重置
│       ├── texts.js           # 文案读取 / 后台保存 / 恢复默认
│       └── games.js           # 游戏 CRUD、收藏、播放计数、后台接口
└── web/src/
    ├── pages/                 # Home / Library / Platforms / GameDetail / Play / Favorites / Admin / AdminTexts / AdminAssets / Login
    ├── components/            # Layout / GameCard / PlatformCard / PixelCard / UI / Toast / Icons
    ├── i18n.tsx               # 语言切换 + 系统文案 + 后台文案合并
    ├── api.ts                 # fetch 封装 + 上传进度
    └── auth.tsx               # 登录态上下文
```

---

## 八、接口一览

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | 公开 | 注册 |
| POST | `/api/auth/login` | 公开 | 登录（返回 token 并写入 cookie） |
| GET | `/api/auth/me` | 登录 | 当前用户 |
| POST | `/api/auth/password` | 登录 | 修改密码 |
| GET | `/api/home` | 公开 | 首页聚合：平台列表（含游戏数）+ 按平台分区的卡片 |
| GET | `/api/games` | 公开 | 列表：`q` `platform` `sort` `page` `pageSize` `featured` |
| GET | `/api/games/:id` | 公开 | 详情 + 同平台推荐 |
| GET | `/api/games/:id/rom` | 登录 | ROM 流（支持 Range） |
| POST | `/api/games/:id/favorite` | 登录 | 收藏 / 取消收藏 |
| POST | `/api/games/:id/play` | 登录 | 记录游玩（60s 内去重） |
| GET | `/api/me/favorites` | 登录 | 我的收藏 |
| GET | `/api/me/recent` | 登录 | 最近在玩 |
| POST | `/api/admin/games` | 管理员 | 新增（multipart：`cover` `rom` + 字段） |
| PUT | `/api/admin/games/:id` | 管理员 | 编辑 |
| DELETE | `/api/admin/games/:id` | 管理员 | 删除（连带文件） |
| PATCH | `/api/admin/games/:id/weight` | 管理员 | 行内改排序权重（body `{ weight }`，-9999~9999） |
| PUT | `/api/admin/platform-weights` | 管理员 | 批量保存平台权重（body `{ weights: { fc: 100 } }`） |
| POST | `/api/auth/password` | 登录 | 修改本人密码（body `{ oldPassword, newPassword }`） |
| POST | `/api/admin/roms/scan` | 管理员 | 扫描 `data/roms/<平台>/`：新文件按默认信息上架、丢失文件标记「ROM 丢失」、找回文件自动恢复 |
| GET | `/api/admin/stats` | 管理员 | 站点统计 |
| GET/DELETE | `/api/admin/users` `/api/admin/users/:id` | 管理员 | 用户管理 |
| GET | `/api/assets` | 公开 | 站点素材映射（`key → 图片地址`） |
| GET | `/api/admin/assets` | 管理员 | 全部素材槽位与当前图 |
| PUT | `/api/admin/assets/:key` | 管理员 | 上传图片（`image`）或填外链（`url`） |
| DELETE | `/api/admin/assets/:key` | 管理员 | 清空槽位，恢复内置占位 |
| GET | `/api/texts?locale=` | 公开 | 取某语言的展示文案（已合并默认与中文回退） |
| GET | `/api/admin/texts` | 管理员 | 全部语言文案 + 内置默认 + 已覆盖列表 |
| PUT | `/api/admin/texts` | 管理员 | 保存某语言文案（空值 = 删除覆盖，回退默认） |
| POST | `/api/admin/texts/reset` | 管理员 | 恢复单字段或整语言为默认 |

---

## 九、常见问题

**1. 模拟器一直卡在「载入模拟器」/ 提示内核加载失败**
默认已使用 `server/public/emulatorjs` 的本地资源，正常不需要外网。若提示加载失败，先确认该目录完整（含 `loader.js`、`cores/*.data`），可执行 `bash scripts/fetch-emulator.sh` 重新拉取；也可设置 `EMULATOR_CDN` 指向自建镜像（需包含 `loader.js` 与 `data/` 全套文件）。前端在本地资源异常时会自动回退到官方 CDN 一次。

**2. 游戏能进但黑屏 / 卡顿**
N64、NDS 对性能要求较高，建议关闭浏览器其他标签页；也可在模拟器设置里降低分辨率或切换渲染器。

**3. 上传大 ROM 失败**
默认上限 512MB，未做反向代理时直接可传。若前面有 Nginx，需要同步调大 `client_max_body_size`：

```nginx
server {
    listen 80;
    server_name game.example.com;
    client_max_body_size 600m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**4. 忘记管理员密码**
见「二、管理员账号」末尾的重置命令。

**5. 版权说明**
本项目只提供模拟器与游戏库管理能力，不附带任何 ROM。请仅上传你拥有合法权利的游戏，或用于自制 / 公有领域 / 已获授权的内容。

---

## 十、技术要点

- 密码使用 bcrypt（cost 10）哈希；登录失败 10 分钟内超过 8 次会临时锁定。
- 令牌支持 `Authorization: Bearer`、`httpOnly cookie`、`?t=` 三种方式（后者供模拟器内核拉取 ROM）。
- 所有 SQL 均使用参数绑定；上传文件按随机名落盘，原始文件名仅作展示。
- 收藏/列表查询使用 `EXISTS` 子查询与索引下推，避免应用层过滤。
- 删除游戏时同步清理 ROM 与封面文件，避免磁盘泄漏。
- 后台「游戏管理」支持**批量删除**：勾选多行（或「全选本页」）后点「删除选中」，一次清理多个游戏（`POST /api/admin/games/batch-delete`，body `{ ids: number[] }`）。
- **排序权重**：游戏与平台都有手动权重，`weight` 数字越大越靠前（可填负数把内容压后，0 为默认）。
  - 游戏：后台「游戏管理」表格里每行有权重输入框（失焦或回车即保存），也可在编辑表单的「排序权重」里改。
  - 平台：后台「平台排序」面板里逐平台设置，保存后首页平台分区与游戏平台页立即按权重排序。
  - 所有排序方式（最新 / 最热 / 名称 / 年份 / 收藏数）都会先按权重降序，权重相同再按各自规则。
- **个人信息**：顶栏用户菜单 →「个人信息」（`/account`），可查看用户名 / 角色 / 注册时间，并修改密码；任何角色都能改自己的密码。
- 主题为 CSS 变量驱动（`--ink/--surface/--panel/--line/--muted/--fg` 等），`html[data-theme]` 切换夜晚/白天，默认夜晚；用户选择存 `localStorage.abxy_theme`。
