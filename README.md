# DSAI PDF 导出服务

基于 Node.js + Puppeteer 的审批单PDF导出服务，**专注于PDF生成，MinIO上传由Java后端处理**。

## 架构说明

```
┌─────────────────┐
│   Java后端      │
│  调用PDF服务     │
└────────┬────────┘
         │ 1. POST请求
         ↓
┌─────────────────────────────┐
│  Node.js服务 (Puppeteer)    │
│                             │
│  ① 访问审批单详情页面        │
│  ② 触发打印功能             │
│  ③ 等待前端生成PDF          │
│     (html2canvas + jsPDF)   │
│  ④ 获取blob数据返回         │
└────────┬────────────────────┘
         │ 2. 返回PDF文件流
         ↓
┌─────────────────┐
│   Java后端      │
│ 3. 接收PDF字节流 │
│ 4. 上传到MinIO  │
│ 5. 更新数据库   │
└─────────────────┘
```

## PDF生成原理

**核心思路**: 让前端自己生成PDF，而不是用Puppeteer截图。

### 技术实现流程

1. **Puppeteer访问审批单详情页** - `http://localhost:3000/workFlow/detail/{flowTaskId}?opType=4`
2. **设置Token认证** - 将Token写入localStorage (`dsai_token = token|String`)
3. **等待页面数据加载** - 检测FlowBox组件的loading状态变为false
4. **触发打印功能** - 调用Vue组件方法:
   - `printVisible = true` - ���示打印内容
   - `printForm.init(printFormData)` - 加载表单数据
   - `Print.init()` - 初始化打印组件(显示drawer，出现"拼命加载中...")
5. **等待内容渲染完成** - 轮询检查 `#printContent` 的表单元素数量和内容长度
6. **触发PDF生成** - 调用 `Print.drawCanvas()`
   - 前端使用 `html2canvas` 截图 `#printContent`
   - 前端使用 `jsPDF` 生成PDF
   - 前端将PDF blob设置到 `iframe.src`
7. **获取PDF数据** - 等待 `iframe.src` 变成 blob URL，获取blob数据返回

### 为什么这样做？

- **完全还原前端打印效果** - 和用户手动点击"打印"按钮看到的完全一样
- **自动处理分页** - 前端jsPDF自动处理A4分页
- **保持样式一致** - 使用前端已有的打印样式
- **避免截图失真** - 不是截图，而是前端精确生成

## 功能特性

- 单个审批单PDF导出
- 批量审批单PDF导出(支持并发控制)
- 返回PDF文件流或Base64编码
- 完全还原前端打印效果(CSS样式、表格、图片等)
- 让前端生成PDF(html2canvas + jsPDF)，不是截图
- 自动等待内容加载完成
- 无头Chrome浏览器，稳定高效
- 支持Token认证
- 完善的日志记录
- PM2进程管理
- 健康检查接口

## 技术栈

- **Node.js** 16+
- **Express** - Web框架
- **Puppeteer** - 无头Chrome浏览器(用于访问页面和调用前端方法)
- **前端 html2canvas + jsPDF** - 真正的PDF生成
- **Winston** - 日志记录
- **PM2** - 进程管理

## 目录结构

```
pdf-export-service/
├── src/
│   ├── config/           # 配置文件
│   │   └── index.js
│   ├── routes/           # 路由
│   │   └── pdfRoutes.js
│   ├── services/         # 服务层
│   │   └── pdfExportService.js   # PDF导出服务(核心)
│   ├── utils/            # 工具函数
│   │   └── logger.js     # 日志工具
│   └── server.js         # 服务入口
├── logs/                 # 日志目录
├── .env                  # 环境配置
├── .env.example          # 环境配置示例
├── .gitignore
├── package.json
├── ecosystem.config.js   # PM2配置
├── README.md
├── JAVA_INTEGRATION.md   # Java集成文档
└── install.sh/bat        # 安装脚本
```

## 快速开始

### 1. 安装依赖

```bash
cd pdf-export-service
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并修改配置:

```bash
cp .env.example .env
```

编辑 `.env` 文件:

```env
# 服务配置
PORT=8098
NODE_ENV=production

# 前端地址
FRONTEND_URL=http://localhost:3000

# Puppeteer配置
PUPPETEER_HEADLESS=true
PUPPETEER_TIMEOUT=60000

# 日志配置
LOG_LEVEL=info
```

### 3. 启动服务

#### 开发模式

```bash
npm run dev
```

#### 生产模式 (使用PM2)

```bash
# 启动服务
npm run pm2:start

# 停止服务
npm run pm2:stop

# 重启服务
npm run pm2:restart

# 查看日志
npm run pm2:logs
```

#### 直接启动

```bash
npm start
# 或
node src/server.js
```

服务启动后访问: `http://localhost:8098`

## API 接口

### 1. 健康检查

**接口**: `GET /api/health`

**响应示例**:
```json
{
  "status": "ok",
  "message": "PDF导出服务运行正常",
  "timestamp": 1234567890
}
```

### 2. 导出单个审批单PDF

**接口**: `POST /api/export-pdf`

**请求参数**:
```json
{
  "flowTaskId": "审批单ID",
  "token": "用户Token",
  "layoutId": "布局ID (可选)"
}
```

**响应**: 直接返回PDF文件流

**响应头**:
- `Content-Type: application/pdf`
- `Content-Disposition: attachment; filename="approval_123456.pdf"`
- `Content-Length: 文件大小`
- `X-Duration: 生成耗时(毫秒)`
- `X-File-Size: 文件大小(字节)`

### 3. 批量导出审批单PDF

**接口**: `POST /api/export-pdf-batch`

**请求参数**:
```json
{
  "tasks": [
    {
      "flowTaskId": "审批单ID1",
      "token": "用户Token",
      "layoutId": "布局ID (可选)"
    },
    {
      "flowTaskId": "审批单ID2",
      "token": "用户Token"
    }
  ],
  "concurrency": 3
}
```

**响应示例**:
```json
{
  "success": true,
  "message": "批量PDF导出完成",
  "data": {
    "results": [
      {
        "flowTaskId": "123456",
        "success": true,
        "pdfBase64": "JVBERi0xLjQK...",
        "fileSize": 245678,
        "error": null
      }
    ],
    "successCount": 2,
    "failedCount": 0,
    "duration": 7500
  }
}
```

## 调用示例

### cURL

```bash
# 导出单个PDF(直接获取文件流)
curl -X POST http://localhost:8098/api/export-pdf \
  -H "Content-Type: application/json" \
  -d '{
    "flowTaskId": "123456",
    "token": "your-token-here"
  }' \
  --output approval.pdf

# 批量导出PDF(获取Base64数据)
curl -X POST http://localhost:8098/api/export-pdf-batch \
  -H "Content-Type: application/json" \
  -d '{
    "tasks": [
      {"flowTaskId": "123456", "token": "your-token"},
      {"flowTaskId": "789012", "token": "your-token"}
    ],
    "concurrency": 3
  }'
```

### Java集成

**详见 `JAVA_INTEGRATION.md` 文档**，包含完整的Java后端集成代码示例。

核心流程:
1. Java后端调用Node.js服务生成PDF
2. 接收PDF文件流/Base64数据
3. 使用 `MinioUploadUtil` 上传到MinIO
4. 更新 `flow_task` 表的 `F_PDF_FILE_URL` 字段

### JavaScript (Axios)

```javascript
const axios = require('axios');
const fs = require('fs');

// 单个导出 - 获取文件流
const response = await axios.post(
  'http://localhost:8098/api/export-pdf',
  {
    flowTaskId: '123456',
    token: 'your-token-here'
  },
  { responseType: 'arraybuffer' }
);

// 保存为文件
fs.writeFileSync('approval.pdf', response.data);

// 批量导出 - 获取Base64数据
const batchResponse = await axios.post(
  'http://localhost:8098/api/export-pdf-batch',
  {
    tasks: [
      { flowTaskId: '123456', token: 'your-token' },
      { flowTaskId: '789012', token: 'your-token' }
    ],
    concurrency: 3
  }
);

console.log(batchResponse.data);
```

## 性能建议

1. **并发控制**: 批量导出时建议并发数设置为 3-5
2. **超时时间**: 复杂表单建议设置超时时间 >= 60秒(因为需要等待前端生成PDF)
3. **内存限制**: 建议服务器内存 >= 2GB
4. **PM2配置**: 建议启动 2-4 个实例(根据服务器配置)

## 常见问题

### 1. Puppeteer 安装失败

如果在国内网络环境下安装 Puppeteer 失败，可以使用淘宝镜像:

```bash
npm config set puppeteer_download_host=https://npm.taobao.org/mirrors
npm install
```

### 2. Chrome 无法启动

确保服务器安装了Chrome所需的依赖:

**CentOS/RHEL**:
```bash
yum install -y \
  pango.x86_64 \
  libXcomposite.x86_64 \
  libXcursor.x86_64 \
  libXdamage.x86_64 \
  libXext.x86_64 \
  libXi.x86_64 \
  libXtst.x86_64 \
  cups-libs.x86_64 \
  libXScrnSaver.x86_64 \
  libXrandr.x86_64 \
  GConf2.x86_64 \
  alsa-lib.x86_64 \
  atk.x86_64 \
  gtk3.x86_64 \
  nss libdrm
```

**Ubuntu/Debian**:
```bash
apt-get install -y \
  libx11-xcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxi6 \
  libxtst6 \
  libnss3 \
  libcups2 \
  libxss1 \
  libxrandr2 \
  libasound2 \
  libpangocairo-1.0-0 \
  libatk1.0-0 \
  libatk-bridge2.0-0 \
  libgtk-3-0
```

### 3. PDF生成失败

检查以下几点:
- 前端页面是否可正常访问
- Token是否有效
- 网络是否通畅
- 查看日志文件 `logs/error.log`

### 4. PDF内容不完整

可能原因:
- 内容加载时间不够 - 增加 `PUPPETEER_TIMEOUT` 配置
- 表单数据未完全渲染 - 检查 `printForm.init()` 是否被正确调用

### 5. 文件流接收失败

如果Java后端无法接收PDF文件流:
- 检查RestTemplate配置的超时时间
- 检查网络连通性
- 确认请求的Content-Type为application/json
- 查看Node.js服务日志

## 日志

日志文件位于 `logs/` 目录:

- `combined.log` - 所有日志
- `error.log` - 错误日志

使用PM2查看实时日志:

```bash
pm2 logs dsai-pdf-export
```

## 监控

### PM2 监控

```bash
# 查看进程状态
pm2 status

# 查看详细信息
pm2 show dsai-pdf-export

# 查看实时监控
pm2 monit
```

### 健康检查

可以配置定时任务定期访问健康检查接口:

```bash
# crontab示例 (每分钟检查一次)
* * * * * curl -s http://localhost:8098/api/health || echo "Service Down"
```

## 部署

### Docker部署 (可选)

创建 `Dockerfile`:

```dockerfile
FROM node:16-alpine

# 安装Chrome依赖
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# 设置Puppeteer使用系统Chrome
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 8098

CMD ["node", "src/server.js"]
```

构建和运行:

```bash
docker build -t dsai-pdf-export .
docker run -d -p 8098:8098 --name pdf-export dsai-pdf-export
```

## 许可证

MIT

## 联系方式

如有问题请联系: DSAI Team
