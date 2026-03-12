@echo off
echo ======================================
echo   DSAI PDF导出服务 - 安装脚本
echo ======================================
echo.

REM 检查Node.js
echo 检查Node.js版本...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [X] 未检测到Node.js,请先安装Node.js 16+版本
    pause
    exit /b 1
)

for /f "tokens=1" %%i in ('node -v') do set NODE_VERSION=%%i
echo [√] Node.js版本: %NODE_VERSION%
echo.

REM 检查npm
echo 检查npm...
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [X] 未检测到npm
    pause
    exit /b 1
)

for /f "tokens=1" %%i in ('npm -v') do set NPM_VERSION=%%i
echo [√] npm版本: %NPM_VERSION%
echo.

REM 安装依赖
echo 安装依赖包...
call npm install
if %errorlevel% neq 0 (
    echo [X] 依赖安装失败
    pause
    exit /b 1
)
echo [√] 依赖安装完成
echo.

REM 创建日志目录
echo 创建日志目录...
if not exist logs mkdir logs
echo [√] 日志目录创建完成
echo.

REM 复制环境配置
if not exist .env (
    echo 创建环境配置文件...
    copy .env.example .env >nul
    echo [√] 环境配置文件创建完成,请编辑 .env 文件配置参数
    echo.
    echo [!] 重要: 请务必修改以下配置:
    echo    - FRONTEND_URL: 前端地址
    echo    - MINIO_ENDPOINT: MinIO地址
    echo    - MINIO_ACCESS_KEY: MinIO访问密钥
    echo    - MINIO_SECRET_KEY: MinIO密钥
) else (
    echo [√] 环境配置文件已存在
)
echo.

REM 检查PM2
echo 检查PM2...
where pm2 >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] 未检测到PM2,推荐安装PM2用于生产环境:
    echo    npm install -g pm2
) else (
    for /f "tokens=1" %%i in ('pm2 -v') do set PM2_VERSION=%%i
    echo [√] PM2已安装: %PM2_VERSION%
)
echo.

echo ======================================
echo   安装完成!
echo ======================================
echo.
echo 下一步:
echo   1. 编辑 .env 文件配置参数
echo   2. 开发环境运行: npm run dev
echo   3. 生产环境运行: npm run pm2:start
echo.
echo API文档: http://localhost:8097
echo 健康检查: http://localhost:8097/api/health
echo.
pause
