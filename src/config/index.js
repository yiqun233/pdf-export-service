require('dotenv').config();

module.exports = {
  // 服务配置
  port: process.env.PORT || 8097,
  env: process.env.NODE_ENV || 'development',

  // 前端地址
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  // Puppeteer配置
  puppeteer: {
    headless: process.env.PUPPETEER_HEADLESS !== 'false',
    timeout: parseInt(process.env.PUPPETEER_TIMEOUT) || 30000,
    protocolTimeout: parseInt(process.env.PUPPETEER_PROTOCOL_TIMEOUT) || 180000, // 协议超时时间(ms)
    // Chrome可执行文件路径(优先使用环境变量配置)
    executablePath: process.env.CHROME_EXECUTABLE_PATH || '/usr/bin/google-chrome',
    // 浏览器自动重启配置（双重保障机制）
    browserRestartInterval: parseInt(process.env.BROWSER_RESTART_INTERVAL) || 50, // 每50次请求重启
    browserRestartIntervalMs: parseInt(process.env.BROWSER_RESTART_INTERVAL_MS) || 6 * 60 * 60 * 1000, // 每6小时重启
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--single-process' // 单进程模式，减少资源占用
    ]
  },

  // PDF配置
  pdf: {
    format: 'A4',
    printBackground: true,
    margin: {
      top: '20px',
      right: '20px',
      bottom: '20px',
      left: '20px'
    }
  },

  // 日志配置
  log: {
    level: process.env.LOG_LEVEL || 'info'
  }
};
