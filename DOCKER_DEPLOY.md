# Docker 部署指南

本文档介绍如何使用 Docker 和 Docker Compose 部署 DSAI PDF 导出服务。

## 前置要求

- Docker 20.10+
- Docker Compose 2.0+
- 至少 2GB 可用内存
- 至少 10GB 磁盘空间

## 快速开始

### 1. 配置环境变量

编辑 `.env` 文件，配置必要的环境变量：

```bash
# 服务配置
PORT=8098
NODE_ENV=production

# 前端地址 - 请修改为实际的前端地址
FRONTEND_URL=http://your-frontend-host:3000

# Puppeteer配置
PUPPETEER_HEADLESS=true
PUPPETEER_TIMEOUT=60000

# 日志配置
LOG_LEVEL=info
```

**重要**: 必须将 `FRONTEND_URL` 修改为实际的前端应用地址。

### 2. 构建并启动服务

使用 Docker Compose 一键部署：

```bash
# 构建并后台启动
docker-compose up -d --build

# 查看日志
docker-compose logs -f

# 查看服务状态
docker-compose ps
```

### 3. 验证服务

服务启动后，访问健康检查接口：

```bash
# 健康检查
curl http://localhost:8098/api/health

# 查看服务信息
curl http://localhost:8098/
```

预期响应：

```json
{
  "status": "ok",
  "message": "PDF导出服务运行正常",
  "timestamp": 1234567890
}
```

## Docker 常用命令

### 构建镜像

```bash
# 使用 docker-compose 构建
docker-compose build

# 或单独构建镜像
docker build -t dsai-pdf-export-service:1.0.0 .
```

### 启动/停止服务

```bash
# 启动服务
docker-compose up -d

# 停止服务
docker-compose stop

# 重启服务
docker-compose restart

# 停止并删除容器
docker-compose down

# 停止并删除容器及镜像
docker-compose down --rmi all
```

### 查看日志

```bash
# 实时查看日志
docker-compose logs -f

# 查看最近100行日志
docker-compose logs --tail=100

# 查看特定服务的日志
docker logs dsai-pdf-export
```

### 进入容器

```bash
# 进入运行中的容器
docker exec -it dsai-pdf-export /bin/bash

# 以 root 用户进入（调试用）
docker exec -it -u root dsai-pdf-export /bin/bash
```

### 清理资源

```bash
# 删除停止的容器
docker container prune

# 删除未使用的镜像
docker image prune

# 删除所有未使用的资源
docker system prune -a
```

## 配置说明

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| PORT | 8098 | 服务监听端口 |
| NODE_ENV | production | 运行环境 |
| FRONTEND_URL | http://localhost:3000 | 前端应用地址 |
| PUPPETEER_HEADLESS | true | 是否使用无头模式 |
| PUPPETEER_TIMEOUT | 60000 | Puppeteer 超时时间（毫秒）|
| LOG_LEVEL | info | 日志级别 |

### 端口映射

默认映射: `8098:8098`

如需修改外部端口，编辑 `docker-compose.yml`:

```yaml
ports:
  - "9000:8098"  # 将外部9000端口映射到容器8098端口
```

### 资源限制

默认配置：

- **内存限制**: 2GB
- **CPU 限制**: 2核
- **共享内存**: 2GB (Puppeteer 需要)

可在 `docker-compose.yml` 的 `deploy.resources` 部分调整。

### 日志持久化

日志文件挂载到宿主机 `./logs` 目录：

```yaml
volumes:
  - ./logs:/app/logs
```

## 生产环境部署建议

### 1. 使用环境变量文件

创建不同环境的配置文件：

```bash
# 开发环境
.env.development

# 生产环境
.env.production
```

启动时指定环境：

```bash
docker-compose --env-file .env.production up -d
```

### 2. 配置反向代理

推荐使用 Nginx 作为反向代理：

```nginx
upstream pdf_service {
    server localhost:8098;
}

server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://pdf_service;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 增加超时时间（PDF生成可能较慢）
        proxy_read_timeout 120s;
        proxy_connect_timeout 120s;
    }
}
```

### 3. 启用 HTTPS

使用 Let's Encrypt 免费证书：

```bash
# 安装 certbot
sudo apt-get install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

### 4. 监控和告警

- 使用 Prometheus + Grafana 监控容器资源
- 配置健康检查告警
- 监控日志错误率

### 5. 日志轮转

Docker 默认会处理日志轮转，也可以自定义：

```yaml
services:
  pdf-export-service:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

## 故障排查

### 1. 容器无法启动

检查日志：

```bash
docker-compose logs pdf-export-service
```

常见问题：

- **端口被占用**: 修改端口映射或停止占用端口的服务
- **内存不足**: 增加系统可用内存或降低容器内存限制
- **依赖安装失败**: 检查网络连接，可能需要配置代理

### 2. PDF 生成失败

检查以下项：

```bash
# 进入容器测试
docker exec -it dsai-pdf-export /bin/bash

# 测试 Chromium
chromium --version

# 检查环境变量
env | grep PUPPETEER

# 查看详细日志
tail -f /app/logs/error.log
```

### 3. 内存占用过高

Puppeteer 会占用较多内存，建议：

- 限制并发请求数
- 定期重启容器
- 增加内存限制
- 配置浏览器自动重启（已内置）

### 4. 健康检查失败

```bash
# 手动测试健康检查
docker exec dsai-pdf-export wget -q --spider http://localhost:8098/api/health && echo "OK"

# 检查服务是否运行
docker exec dsai-pdf-export ps aux | grep node
```

### 5. 网络连接问题

如果需要访问外部网络或前端页面：

```bash
# 检查容器网络
docker network ls
docker network inspect pdf-export-service_pdf-network

# 测试网络连接
docker exec dsai-pdf-export ping your-frontend-host
```

## 性能优化

### 1. 镜像优化

当前镜像大小约 900MB，主要包含：

- Node.js 运行时
- Chromium 浏览器
- 系统依赖

优化方案：

- 使用多阶段构建（不推荐，可能影响 Puppeteer）
- 清理 apt 缓存（已优化）
- 使用 alpine 基础镜像（需要额外配置）

### 2. 运行时优化

已内置的优化：

- ✅ 浏览器实例复用
- ✅ 定期自动重启浏览器（每50次请求或6小时）
- ✅ 单进程模式减少资源占用
- ✅ 非 root 用户运行提高安全性

### 3. 并发控制

批量导出时建议：

- 并发数设置为 3-5
- 单个请求超时设置为 60-120 秒
- 根据服务器配置调整实例数量

## 更新部署

### 更新代码

```bash
# 拉取最新代码
git pull

# 重新构建并启动
docker-compose up -d --build

# 查看日志确认
docker-compose logs -f
```

### 滚动更新（零停机）

```bash
# 构建新镜像
docker-compose build

# 启动新容器
docker-compose up -d

# 旧容器会自动停止和删除
```

## 备份和恢复

### 备份

```bash
# 备份日志
tar -czf logs-backup-$(date +%Y%m%d).tar.gz logs/

# 备份配置
tar -czf config-backup-$(date +%Y%m%d).tar.gz .env docker-compose.yml
```

### 恢复

```bash
# 恢复配置
tar -xzf config-backup-20240101.tar.gz

# 重启服务
docker-compose restart
```

## 安全建议

1. **不要使用 root 用户运行**（已配置）
2. **限制容器权限**，仅保留必要权限（已配置）
3. **定期更新基础镜像**：
   ```bash
   docker-compose build --no-cache
   ```
4. **使用私有镜像仓库**存储生产镜像
5. **配置网络隔离**，仅暴露必要端口
6. **定期检查安全漏洞**：
   ```bash
   docker scan dsai-pdf-export-service:1.0.0
   ```

## 多环境部署

### 开发环境

```yaml
# docker-compose.dev.yml
version: '3.8'
services:
  pdf-export-service:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8098:8098"
    environment:
      - NODE_ENV=development
    volumes:
      - ./src:/app/src  # 挂载源码，支持热重载
```

### 生产环境

```yaml
# docker-compose.prod.yml
version: '3.8'
services:
  pdf-export-service:
    image: your-registry.com/dsai-pdf-export-service:1.0.0
    restart: always
    ports:
      - "8098:8098"
    environment:
      - NODE_ENV=production
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '2'
          memory: 2G
```

部署命令：

```bash
# 开发环境
docker-compose -f docker-compose.dev.yml up -d

# 生产环境
docker-compose -f docker-compose.prod.yml up -d
```

## 故障恢复

### 服务自动重启

已配置 `restart: unless-stopped`，服务会在以下情况自动重启：

- 容器崩溃
- Docker 守护进程重启
- 系统重启

### 数据恢复

日志文件存储在宿主机，即使容器删除也不会丢失：

```bash
# 查看历史日志
ls -lh logs/
```

## 联系支持

如有问题，请：

1. 查看本文档的故障排查部分
2. 检查日志文件 `logs/error.log`
3. 联系 DSAI Team

---

**最后更新**: 2024年
**维护者**: DSAI Team
