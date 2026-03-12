const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const config = require('./config');
const logger = require('./utils/logger');
const pdfRoutes = require('./routes/pdfRoutes');
const pdfExportService = require('./services/pdfExportService');

// 创建Express应用
const app = express();

// 中间件
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// 请求日志中间件
app.use((req, res, next) => {
  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// 路由
app.use('/api', pdfRoutes);

// 根路径
app.get('/', (req, res) => {
  res.json({
    name: 'DSAI PDF Export Service',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: 'GET /api/health',
      exportPdf: 'POST /api/export-pdf',
      exportPdfBatch: 'POST /api/export-pdf-batch'
    }
  });
});

// 404处理
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在',
    path: req.path
  });
});

// 错误处理中间件
app.use((err, req, res, next) => {
  logger.error('服务器错误:', err);
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: config.env === 'development' ? err.message : undefined
  });
});

// 启动服务器
const server = app.listen(config.port, async () => {
  logger.info('=================================');
  logger.info(`DSAI PDF导出服务已启动`);
  logger.info(`环境: ${config.env}`);
  logger.info(`端口: ${config.port}`);
  logger.info(`前端地址: ${config.frontendUrl}`);
  logger.info('=================================');

  // 初始化浏览器实例
  try {
    await pdfExportService.initBrowser();
  } catch (error) {
    logger.error('浏览器初始化失败,服务可能无法正常工作', error);
  }
});

// 优雅关闭
process.on('SIGTERM', async () => {
  logger.info('收到SIGTERM信号,开始优雅关闭...');

  server.close(async () => {
    logger.info('HTTP服务器已关闭');

    // 关闭浏览器
    try {
      await pdfExportService.closeBrowser();
    } catch (error) {
      logger.error('浏览器关闭失败', error);
    }

    logger.info('服务已完全关闭');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('收到SIGINT信号,开始优雅关闭...');

  server.close(async () => {
    logger.info('HTTP服务器已关闭');

    // 关闭浏览器
    try {
      await pdfExportService.closeBrowser();
    } catch (error) {
      logger.error('浏览器关闭失败', error);
    }

    logger.info('服务已完全关闭');
    process.exit(0);
  });
});

// 未捕获异常处理
process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的Promise拒绝:', reason);
});

module.exports = app;
