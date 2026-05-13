@echo off
chcp 65001 >nul
echo Starting Mimo Media Proxy...
echo.

cd /d "%~dp0"

:: 读取 .env 文件并设置环境变量
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
    set "line=%%a"
    if not "!line:~0,1!"=="#" if not "!line!"=="" set "%%a=%%b"
)

:: 启动代理
node dist/index.js
