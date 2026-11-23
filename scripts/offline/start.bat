@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title ABXY ARCADE 离线安装

set "VER=__VERSION__"
set "IMAGE=abxy-arcade:%VER%"
set "CONTAINER=abxy-arcade"
set "PORT=30000"
if not "%~1"=="" set "PORT=%~1"

echo.
echo  ==========================================
echo    ABXY ARCADE 离线安装  v%VER%
echo  ==========================================
echo.

rem ---------- 1. 检查 Docker ----------
docker version >nul 2>&1
if errorlevel 1 (
  echo  [失败] 没检测到 Docker。
  echo.
  echo   请先装 Docker Desktop： https://www.docker.com/products/docker-desktop/
  echo   装完启动它，托盘图标变绿后再双击本文件。
  echo.
  pause
  exit /b 1
)
echo  [1/4] Docker 正常

rem ---------- 2. 选架构 ----------
set "ARCH=amd64"
if /i "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "ARCH=arm64"
set "TAR=%~dp0images\abxy-arcade-%VER%-!ARCH!.tar.gz"
if not exist "!TAR!" (
  echo  [失败] 找不到镜像包： !TAR!
  echo         请确认压缩包解压完整。
  pause
  exit /b 1
)
echo  [2/4] 使用 !ARCH! 镜像包

rem ---------- 3. 导入镜像 ----------
docker image inspect "%IMAGE%" >nul 2>&1
if errorlevel 1 (
  echo  [3/4] 正在导入镜像，大约 1-3 分钟，请别关窗口 ...
  docker load -i "!TAR!"
  if errorlevel 1 (
    echo  [失败] 镜像导入失败，文件可能下载不完整。
    pause
    exit /b 1
  )
) else (
  echo  [3/4] 镜像已存在，跳过导入
)
docker tag "abxy-arm64:%VER%" "%IMAGE%" >nul 2>&1

rem ---------- 4. 启动容器 ----------
echo  [4/4] 启动容器 ...
docker rm -f "%CONTAINER%" >nul 2>&1
if not exist "%~dp0data" mkdir "%~dp0data"
docker run -d --name "%CONTAINER%" --restart always -p %PORT%:3000 -e TZ=Asia/Shanghai -v "%~dp0data:/data" "%IMAGE%" >nul
if errorlevel 1 (
  echo.
  echo  [失败] 容器启动失败，常见原因：
  echo    1. 端口 %PORT% 被占用了 -^> 换个端口：在本文件上右键「编辑」把 PORT 改成 30001
  echo    2. 上面 docker load 没成功
  echo.
  pause
  exit /b 1
)

echo.
echo  等待服务就绪 ...
set /a TRY=0
:WAIT
set /a TRY+=1
docker exec "%CONTAINER%" node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >nul 2>&1
if not errorlevel 1 goto READY
if %TRY% GEQ 40 goto TIMEOUT
timeout /t 1 /nobreak >nul
goto WAIT

:READY
echo.
echo  ==========================================
echo    启动成功
echo  ==========================================
echo.
echo    打开浏览器： http://localhost:%PORT%
echo    管理后台：   http://localhost:%PORT%/admin
echo    默认账号：   admin / admin123   ^(请登录后立刻改密码^)
echo.
echo    游戏放这里： %~dp0data\roms\fc\  之类
echo    放完去后台点「扫描 ROM」
echo.
echo    关掉这个窗口不影响运行，容器会随 Docker 自动启动。
echo.
timeout /t 3 /nobreak >nul
start "" http://localhost:%PORT%
goto END

:TIMEOUT
echo.
echo  ==========================================
echo    容器已启动，但健康检查超时
echo  ==========================================
echo.
echo    看日志： docker logs --tail 50 %CONTAINER%
echo    通常再等 10 秒就好了。
echo.
pause

:END
endlocal
