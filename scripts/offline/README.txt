ABXY ARCADE 离线安装包  v__VERSION__
==========================================

这是一个装好就能玩的复古游戏门户（FC / 超任 / GB / GBA / NDS / MD / N64 / 街机），
镜像已经打包在 images/ 里，全程不联网、不去 GHCR 拉镜像。


【我的机器该用哪个包】

  images/ 里有两个镜像包，按芯片分，跟品牌无关：

      abxy-arcade-__VERSION__-x86.tar.gz    Intel / AMD 芯片（笔记本电脑、绝大多数 NAS）
      abxy-arcade-__VERSION__-arm.tar.gz    ARM 芯片（群晖 DS223、树莓派、Mac M 系列、ARM 版 NAS）

  不用自己挑 —— install.sh 和 start.bat 会自动判断，选错了也起不来，
  脚本会告诉你是哪一步。想知道自己属于哪种，可以在终端里敲：

      Linux / NAS    uname -m        x86_64 → x86 包      aarch64 → arm 包
      Windows        echo %PROCESSOR_ARCHITECTURE%        AMD64 → x86 包   ARM64 → arm 包
      群晖 / 威联通   控制面板 → 系统信息 → CPU 型号

  看到「armv7l」这种老 32 位 ARM（DS118 这类），本包不支持，只能用源码构建。


【先看这里：你需要什么】

  · Docker
      Windows / Mac  → Docker Desktop（https://www.docker.com/products/docker-desktop/）
      群晖           → 套件中心装 Container Manager
      威联通         → App Center 装 Container Station
      Linux          → 装 docker 和 compose 插件
  · 磁盘空间 2GB 左右（镜像约 300MB，加上游戏和封面）
  · 不用联网，不用配镜像加速，不用改 DNS


【方式一：Windows（最省事）】

  1. 装好 Docker Desktop 并启动，等右下角鲸鱼图标变绿
  2. 把本压缩包解压到任意目录（路径尽量别带中文和空格）
  3. 双击 start.bat
  4. 等 1-3 分钟导入镜像，浏览器会自动打开 http://localhost:30000

  默认账号 admin  密码 admin123

  如果双击后窗口一闪就没：右键 start.bat →「以管理员身份运行」，
  或者在解压目录里按住 Shift 右键 →「在此处打开 PowerShell」→ 输入 .\start.bat 看报错。


【方式二：群晖 / 威联通 / unRAID / Linux】

  把整个目录传上去（File Station 上传压缩包再解压最方便），SSH 登录后：

      cd /你解压的路径/abxy-arcade-offline-__VERSION__
      sudo sh install.sh

  换端口：
      sudo sh install.sh 8080

  指定数据目录（推荐放存储卷，别放系统盘）：
      sudo DATA=/vol1/1000/Game/abxy sh install.sh

  群晖上如果 sudo 提示没有 docker 权限，说明这台机器 docker 只给 root，
  用 root 账号执行，或者把当前用户加进 docker 组。


【方式三：熟悉 compose 的】

      cd 解压目录
      docker compose up -d
      # 换端口
      PORT=8080 docker compose up -d


【装完第一件事：改密码】

  浏览器打开 http://你的IP:30000/admin
  默认 admin / admin123，登录后立刻改。

  Windows 上就是 http://localhost:30000


【游戏放哪】

  数据目录（Windows 是解压目录下的 data，Linux 看 install.sh 打印的路径）
  里面的 roms 下按机种分文件夹：

      data/roms/fc/           红白机      xxx.zip
      data/roms/sfc/          超任
      data/roms/gb/           GB
      data/roms/gbc/          GB Color
      data/roms/gba/          GBA
      data/roms/md/           世嘉 MD
      data/roms/nds/          NDS
      data/roms/n64/          N64
      data/roms/neogeo/       NEOGEO
      data/roms/arcade/       街机

  拷完去后台点「扫描 ROM」，它自己上架。
  目录名不用管，乱起也行，程序会按名字猜平台。


【封面是自动配的，不用一张张传】

  两条规则，满足一条就行，外面那个目录叫什么都不影响：

      data/roms/fc/media/魂斗罗/boxFront.jpg       文件夹名 = ROM 名
      data/roms/fc/魂斗罗.jpg                      图片名 = ROM 名

  汉化包的 ROM 叫「超级魂斗罗 (版本2)[星空汉化]」也不要紧，
  程序会靠内置资料库把「超级魂斗罗」对上「魂斗罗2」的封面。
  实在没有就显示首字占位块，不影响玩。


【常见问题】

  Q: docker load 卡着不动 / 很慢
  A: 正常。300MB 镜像解压导入要 1-3 分钟，硬盘慢的机器更久。别关窗口。

  Q: 提示端口被占用
  A: 换个端口。Windows 改 start.bat 里的 PORT，Linux 用 sh install.sh 30001。

  Q: 群晖上装完打不开
  A: 先看日志： sudo docker logs --tail 50 abxy-arcade
     再看群晖防火墙有没有放行端口。

  Q: 我的 NAS 是 ARM 的（DS223、TS-233 这类）
  A: 不用管，install.sh 和 start.bat 会自动选 arm 那个包。

  Q: 提示「32 位 ARM（armv7l）」直接退出
  A: 那是老款 ARM 机型（DS118 这类），本包只有 64 位镜像。
     要么换台机器，要么自己用源码构建（见最后一页）。

  Q: 怎么确认文件下载完整
  A: sha256sum -c SHA256SUMS.txt
     Windows 上可以用 7-Zip 的「CRC 校验」，或者 PowerShell：
     Get-FileHash images\*.tar.gz -Algorithm SHA256

  Q: 想换个封面 / 改游戏名字
  A: 后台点进去改，改过的内容不会被扫描覆盖。


【备份与迁移】

  整个 data 目录复制走就是完整备份（数据库、封面、ROM 都在里面）。
  换机器时把 data 拷回去，重新起容器即可，账号和密码都还在。


【卸载】

      docker rm -f abxy-arcade
      docker rmi abxy-arcade:__VERSION__
      然后删掉解压目录（data 在里面，删之前先备份）


【更新到新版本】

  拿到新版离线包后，重复一遍安装步骤即可：
  新镜像导入 → 脚本会自动删旧容器、用同一个 data 目录重新起。
  游戏、账号、封面、设置全都保留。


【包里的镜像跑不了怎么办（32 位 ARM）】

  只能自己构建。需要一台能联网的机器，装好 git 和 docker：

      git clone https://github.com/Doulicon/abxy-arcade.git
      cd abxy-arcade
      cp .env.example .env          # 至少改掉 ADMIN_PASSWORD
      docker compose up -d --build

  国内构建报 failed to resolve source metadata，就在 .env 里加一行：
      BASE_IMAGE=docker.1panel.live/library/node:22-bookworm-slim

  armv7 这条路没有验证过，跑不通别花太多时间在这台上。


------------------------------------------
版本 __VERSION__    镜像 abxy-arcade:__VERSION__
源码 https://github.com/Doulicon/abxy-arcade
