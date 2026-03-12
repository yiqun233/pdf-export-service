#!/bin/bash

echo "======================================"
echo "  DSAI PDF导出服务 - 安装脚本"
echo "======================================"
echo ""

# 检查Node.js版本
echo "检查Node.js版本..."
if ! command -v node &> /dev/null; then
    echo "❌ 未检测到Node.js,请先安装Node.js 16+版本"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'.' -f1 | sed 's/v//')
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js版本过低,需要16+版本,当前版本: $(node -v)"
    exit 1
fi
echo "✅ Node.js版本: $(node -v)"
echo ""

# 检查npm
echo "检查npm..."
if ! command -v npm &> /dev/null; then
    echo "❌ 未检测到npm"
    exit 1
fi
echo "✅ npm版本: $(npm -v)"
echo ""

# 安装依赖
echo "安装依赖包..."
npm install
if [ $? -ne 0 ]; then
    echo "❌ 依赖安装失败"
    echo ""
    echo "如果在国内,可以尝试使用淘宝镜像:"
    echo "  npm config set puppeteer_download_host=https://npm.taobao.org/mirrors"
    echo "  npm config set registry=https://registry.npmmirror.com"
    echo "  npm install"
    exit 1
fi
echo "✅ 依赖安装完成"
echo ""

# 创建日志目录
echo "创建日志目录..."
mkdir -p logs
echo "✅ 日志���录创建完成"
echo ""

# 复制环境配置
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo "创建环境配置文件..."
        cp .env.example .env
        echo "✅ 环境配置文件创建完成,请编辑 .env 文件配置参数"
    else
        echo "⚠️  .env.example 文件不存在,请手动创建 .env 文件"
    fi
    echo ""
    echo "⚠️  重要: 请务必修改 .env 文件中的配置:"
    echo "   - FRONTEND_URL: 前端地址"
    echo "   - PORT: 服务端口 (默认8098)"
else
    echo "✅ 环境配置文件已存在"
fi
echo ""

# 检查PM2
echo "检查PM2..."
if ! command -v pm2 &> /dev/null; then
    echo "⚠️  未检测到PM2,推荐安装PM2用于生产环境:"
    echo "   npm install -g pm2"
else
    echo "✅ PM2已安装: $(pm2 -v)"
fi
echo ""

echo "======================================"
echo "  安装完成!"
echo "======================================"
echo ""
echo "下一步:"
echo "  1. 编辑 .env 文件配置参数"
echo "  2. 开发环境运行: npm run dev"
echo "  3. 生产环境运行: npm run pm2:start"
echo ""
echo "服务端口: 8098"
echo "健康检查: http://localhost:8098/api/health"
echo ""
