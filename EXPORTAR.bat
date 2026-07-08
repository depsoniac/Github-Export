@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul
title Exportar ClipDock

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] No encontre Node.js en esta PC de desarrollo.
  echo Instala Node.js LTS. El usuario final no lo necesitara.
  pause
  exit /b 1
)

node "build-tools\exportar.js"
set "ERR=%ERRORLEVEL%"
echo.
pause
exit /b %ERR%
