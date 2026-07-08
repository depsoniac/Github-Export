@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul
title ClipDock - desarrollo

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] No encontre Node.js.
  echo Instala Node.js LTS para usar el modo desarrollo.
  pause
  exit /b 1
)

node "build-tools\arrancar.js"
set "ERR=%ERRORLEVEL%"
echo.
pause
exit /b %ERR%
