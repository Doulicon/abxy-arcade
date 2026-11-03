@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Retro Arcade Server

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Please install Node.js 18+ first.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/2] Installing server dependencies...
  call npm install --no-audit --no-fund
)

if not exist "web\dist\index.html" (
  echo [2/2] Building web frontend...
  call npm run build
)

echo.
echo ============================================
echo   Server starting:  http://localhost:3000
echo   Admin account:    admin / admin123
echo   Close this window to stop the server
echo ============================================
echo.

start "" http://localhost:3000
node server/index.js

echo.
echo Server stopped.
pause
