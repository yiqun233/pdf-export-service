# 使用 node:18-bullseye 作为基础镜像
FROM node:18-bullseye

# 设置工作目录
WORKDIR /app

# 安装 Puppeteer 所需的 Chromium 依赖
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# 设置 Puppeteer 跳过 Chromium 下载，使用系统安装的
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# 安装 Chromium 浏览器
RUN apt-get update && apt-get install -y chromium && rm -rf /var/lib/apt/lists/*

# 复制 package.json 和 yarn.lock
COPY package.json yarn.lock ./

# 安装项目依赖
RUN yarn install --frozen-lockfile --production

# 复制项目文件
COPY src ./src

# 创建非 root 用户运行应用
RUN groupadd -r pptruser && useradd -r -g pptruser pptruser \
    && chown -R pptruser:pptruser /app

USER pptruser

# 暴露端口
EXPOSE 8098

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=8098

# 启动服务
CMD ["node", "src/server.js"]
