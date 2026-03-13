const puppeteer = require('puppeteer');
const config = require('../config');
const logger = require('../utils/logger');

class PdfExportService {
  constructor() {
    this.browser = null;
    this.requestCount = 0; // 请求计数器
    this.lastRestartTime = Date.now(); // 上次重启时间
  }

  /**
   * 检查是否需要重启浏览器（双重保障机制）
   * 1. 请求次数达到阈值
   * 2. 或距离上次重启时间超过阈值
   */
  shouldRestartBrowser() {
    const { browserRestartInterval, browserRestartIntervalMs } = config.puppeteer;

    // 检查请求次数
    if (this.requestCount >= browserRestartInterval) {
      logger.info(`触发浏览器重启：请求次数达到 ${this.requestCount}/${browserRestartInterval}`);
      return true;
    }

    // 检查时间间隔
    const elapsed = Date.now() - this.lastRestartTime;
    if (elapsed >= browserRestartIntervalMs) {
      const hours = (elapsed / (60 * 60 * 1000)).toFixed(1);
      logger.info(`触发浏览器重启：距上次重启已过 ${hours} 小时`);
      return true;
    }

    return false;
  }

  /**
   * 检查浏览器实例是否健康
   */
  async isBrowserHealthy() {
    if (!this.browser) {
      return false;
    }

    try {
      // 尝试获取浏览器版本，检查是否响应
      await this.browser.version();
      return true;
    } catch (error) {
      logger.warn('浏览器健康检查失败:', error.message);
      return false;
    }
  }

  /**
   * 初始化浏览器实例
   */
  async initBrowser() {
    // 检查是否需要重启
    if (this.browser && this.shouldRestartBrowser()) {
      logger.info('正在重启浏览器实例...');
      await this.closeBrowser();
    }

    // 检查现有实例是否健康
    if (this.browser) {
      const healthy = await this.isBrowserHealthy();
      if (healthy) {
        return this.browser;
      }
      logger.warn('浏览器实例不健康，正在重新启动...');
      await this.closeBrowser();
    }

    try {
      logger.info('正在启动Puppeteer浏览器...');
      const launchOptions = {
        headless: config.puppeteer.headless,
        args: config.puppeteer.args,
        protocolTimeout: config.puppeteer.protocolTimeout
      };

      // 如果配置了executablePath,则使用指定的Chrome
      if (config.puppeteer.executablePath) {
        launchOptions.executablePath = config.puppeteer.executablePath;
        logger.info(`使用指定的Chrome路径: ${config.puppeteer.executablePath}`);
      }

      this.browser = await puppeteer.launch(launchOptions);

      // 重置计数器和时间
      this.requestCount = 0;
      this.lastRestartTime = Date.now();

      logger.info('Puppeteer浏览器启动成功');
      return this.browser;
    } catch (error) {
      logger.error('Puppeteer浏览器启动失败:', error);
      throw error;
    }
  }

  /**
   * 关闭浏览器实例
   */
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info('Puppeteer浏览器已关闭');
    }
  }

  /**
   * 生成审批单PDF
   * @param {Object} options - 导出选项
   * @param {string} options.flowTaskId - 流程任务ID
   * @param {string} options.token - 用户Token
   * @param {string} options.layoutId - 布局ID(可选)
   * @returns {Promise<Buffer>} PDF文件Buffer
   */
  async generateApprovalPdf(options) {
    const { flowTaskId, token, layoutId } = options;

    if (!flowTaskId || !token) {
      throw new Error('flowTaskId和token参数不能为空');
    }

    // 增加请求计数
    this.requestCount++;

    logger.info(`开始生成PDF - FlowTaskId: ${flowTaskId}, 当前请求计数: ${this.requestCount}`);

    let page = null;
    try {
      // 确保浏览器已启动
      const browser = await this.initBrowser();

      // 创建新页面
      page = await browser.newPage();

      // 设置视口大小
      await page.setViewport({
        width: 1920,
        height: 1080,
        deviceScaleFactor: 2 // 提高分辨率
      });

      // 设置Cookie (Token) - 尝试多种方式
      try {
        // 方式1: 设置为当前域名
        const url = new URL(config.frontendUrl);
        await page.setCookie({
          name: 'token',
          value: token,
          domain: url.hostname,
          path: '/',
          httpOnly: false,
          secure: false
        });

        // 方式2: 也尝试不设置domain (让浏览器自动处理)
        await page.setCookie({
          name: 'token',
          value: token,
          path: '/',
          httpOnly: false,
          secure: false
        });
      } catch (err) {
        logger.warn('设置Cookie失败,尝试使用localStorage:', err.message);
      }

      logger.info('Cookie已设置');

      // 构建URL - 访问审批单详情页面
      let url = `${config.frontendUrl}/workFlow/detail/${flowTaskId}?opType=4`;
      if (layoutId) {
        url += `&layoutId=${layoutId}`;
      }

      logger.info(`正在访问页面: ${url}`);

      // 访问页面
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: config.puppeteer.timeout
      });

      // 在localStorage中设置token (使用前端的存储格式)
      await page.evaluate((tokenValue) => {
        // 前端使用 dsai_ 前缀,并且值格式为 "token|String"
        localStorage.setItem('dsai_token', tokenValue + '|String');
        // 也尝试设置sessionStorage
        sessionStorage.setItem('dsai_token', tokenValue + '|String');
        console.log('Token已设置到 localStorage 和 sessionStorage');
      }, token);

      logger.info('Token已写入localStorage (dsai_token)');

      // 重新加载页面以使token生效
      await page.reload({
        waitUntil: 'networkidle2',
        timeout: config.puppeteer.timeout
      });

      logger.info('页面加载完成,等待FlowBox组件初始化...');

      // 等待FlowBox组件加载完成(检查loading状态)
      logger.info('等待页面数据加载完成...');
      await page.waitForFunction(() => {
        const app = document.querySelector('#app');
        if (!app || !app.__vue__) return false;

        // 查找FlowBox组件并检查loading状态
        const findComponentWithPrintVisible = (vm) => {
          if (vm.$data && 'printVisible' in vm.$data) {
            return vm;
          }
          if (vm.$children) {
            for (const child of vm.$children) {
              const found = findComponentWithPrintVisible(child);
              if (found) return found;
            }
          }
          return null;
        };

        const flowBoxComponent = findComponentWithPrintVisible(app.__vue__);

        // 检查组件是否存在且loading为false
        if (flowBoxComponent && flowBoxComponent.$data) {
          const isLoading = flowBoxComponent.$data.loading;
          console.log('FlowBox loading状态:', isLoading);
          return !isLoading; // 当loading为false时返回true
        }

        return false;
      }, {
        timeout: 60000, // 最多等待60秒
        polling: 500 // 每500ms检查一次
      });

      logger.info('页面数据加载完成,等待额外2秒确保渲染完成...');
      await page.waitForTimeout(2000);

      // 在页面中执行JavaScript,找到FlowBox组件实例并触发打印
      const result = await page.evaluate(() => {
        // 递归查找所有Vue组件实例
        const findAllComponents = (vm, result = []) => {
          if (vm) {
            result.push({
              name: vm.$options.name || 'Anonymous',
              hasData: !!vm.$data,
              hasPrintVisible: vm.$data && 'printVisible' in vm.$data
            });
            if (vm.$children) {
              vm.$children.forEach(child => findAllComponents(child, result));
            }
          }
          return result;
        };

        const app = document.querySelector('#app');
        if (!app || !app.__vue__) {
          return { success: false, message: '未找到Vue根实例', components: [] };
        }

        // 查找所有组件
        const allComponents = findAllComponents(app.__vue__);

        // 查找有printVisible属性的组件(不管名字是什么)
        const findComponentWithPrintVisible = (vm) => {
          if (vm.$data && 'printVisible' in vm.$data) {
            return vm;
          }
          if (vm.$children) {
            for (const child of vm.$children) {
              const found = findComponentWithPrintVisible(child);
              if (found) return found;
            }
          }
          return null;
        };

        const targetComponent = findComponentWithPrintVisible(app.__vue__);

        if (targetComponent) {
          // 设置printVisible为true
          targetComponent.printVisible = true;

          // 在$nextTick中调用printForm.init()和Print.init()
          targetComponent.$nextTick(() => {
            // 1. 先调用printForm.init()加载数据
            if (targetComponent.$refs && targetComponent.$refs.printForm && targetComponent.printFormData) {
              targetComponent.$refs.printForm.init(targetComponent.printFormData);
              console.log('printForm.init() 已调用');
            } else {
              console.warn('printForm或printFormData不存在');
            }

            // 2. 调用Print.init() - 初始化打印组件
            if (targetComponent.$refs && targetComponent.$refs.Print) {
              targetComponent.$refs.Print.init();
              console.log('Print.init() 已调用');

              // 3. 增强的内容检查逻辑，确保所有数据都加载完成
              const checkContentLoaded = () => {
                const printContent = document.getElementById('printContent');
                if (!printContent) return false;

                // 检查表单元素
                const formElements = printContent.querySelectorAll('input, select, textarea, .el-form-item');

                // 检查表格行（子表数据）
                const tableRows = printContent.querySelectorAll('.el-table__row, table tbody tr');

                // 检查内容长度
                const contentLength = printContent.innerText.trim().length;

                // 检查图片加载状态
                const images = printContent.querySelectorAll('img');
                const imagesLoaded = Array.from(images).every(img => img.complete && img.naturalHeight !== 0);

                // 检查是否有loading状态
                const loadingElements = printContent.querySelectorAll('.el-loading-mask, .is-loading, [class*="loading"]');
                const isLoading = loadingElements.length > 0;

                // 检查子表组件是否有数据
                const childTables = printContent.querySelectorAll('.childTable, .brand-child-table');
                let childTablesReady = true;
                childTables.forEach(table => {
                  const rows = table.querySelectorAll('.el-table__row');
                  if (rows.length === 0) {
                    childTablesReady = false;
                  }
                });

                console.log('内容检查 - 表单元素:', formElements.length,
                            '表格行:', tableRows.length,
                            '内容长度:', contentLength,
                            '图片数量:', images.length,
                            '图片加载完成:', imagesLoaded,
                            '��在加载:', isLoading,
                            '子表就绪:', childTablesReady);

                // 条件：表单元素 > 10，内容 > 1000字符，没有loading状态
                const basicReady = formElements.length > 10 && contentLength > 1000 && !isLoading;
                const imagesReady = images.length === 0 || imagesLoaded;

                return basicReady && imagesReady && childTablesReady;
              };

              // 轮询检查内容是否加载完成
              let attempts = 0;
              const maxAttempts = 90; // 最多等90秒
              const checkInterval = setInterval(() => {
                attempts++;
                if (checkContentLoaded() || attempts >= maxAttempts) {
                  clearInterval(checkInterval);
                  // 内容加载完成或超时，再额外等待2秒确保Vue渲染完成
                  setTimeout(() => {
                    if (targetComponent.$refs && targetComponent.$refs.Print && targetComponent.$refs.Print.drawCanvas) {
                      targetComponent.$refs.Print.drawCanvas();
                      console.log('Print.drawCanvas() 已调用, 等待了', attempts, '秒');
                    }
                  }, 2000);
                }
              }, 1000);  // 每秒检查一次
            } else {
              console.warn('Print组件不存在');
            }

            targetComponent.$forceUpdate();
          });

          return {
            success: true,
            message: '已触发打印内容显示并调用init',
            componentName: targetComponent.$options.name || 'Anonymous',
            printVisibleSet: targetComponent.printVisible,
            hasPrintForm: !!(targetComponent.$refs && targetComponent.$refs.printForm),
            hasPrintFormData: !!targetComponent.printFormData,
            components: allComponents.filter(c => c.hasPrintVisible)
          };
        }

        return {
          success: false,
          message: '未找到包含printVisible的组件',
          components: allComponents.filter(c => c.hasPrintVisible)
        };
      });

      logger.info(`触发打印结果: ${JSON.stringify(result)}`);

      if (!result.success) {
        logger.error(`组件查找失败,找到的组件:`, result.components);
        throw new Error(`${result.message} - 请检查页面是否正确加载`);
      }

      logger.info('打印已触发,等待前端生成PDF...');

      // 等待iframe加载PDF
      logger.info('等待前端PDF生成完成(最多60秒)...');

      try {
        // 等待iframe的src被设置为blob URL
        await page.waitForFunction(() => {
          const iframe = document.getElementById('printIframe');
          if (!iframe) {
            console.log('printIframe不存在');
            return false;
          }

          const src = iframe.src;
          console.log('printIframe src:', src);

          // 检查是否是blob URL
          return src && src.startsWith('blob:');
        }, {
          timeout: 60000,
          polling: 1000
        });

        logger.info('PDF已生成在iframe中');
      } catch (err) {
        logger.error('等待PDF生成超时');
        await page.screenshot({ path: 'debug_pdf_timeout.png', fullPage: true });
        throw new Error('等待PDF生成超时');
      }

      // 从iframe获取PDF
      logger.info('从iframe获取PDF数据...');
      const pdfData = await page.evaluate(async () => {
        const iframe = document.getElementById('printIframe');
        if (!iframe || !iframe.src || !iframe.src.startsWith('blob:')) {
          throw new Error('iframe中没有找到PDF blob');
        }

        // 获取blob
        const response = await fetch(iframe.src);
        const blob = await response.blob();

        // 将blob转换为ArrayBuffer
        const arrayBuffer = await blob.arrayBuffer();

        // 转换为普通数组以便传输
        return {
          data: Array.from(new Uint8Array(arrayBuffer)),
          size: blob.size,
          type: blob.type
        };
      });

      logger.info(`PDF数据获取成功 - 大小: ${(pdfData.size / 1024).toFixed(2)} KB`);

      // 转换为Buffer
      const pdfBuffer = Buffer.from(pdfData.data);

      logger.info(`PDF生成成功 - FlowTaskId: ${flowTaskId}, 大小: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);

      return pdfBuffer;

    } catch (error) {
      logger.error(`PDF生成失败 - FlowTaskId: ${flowTaskId}`, error);
      throw error;
    } finally {
      // 关闭页面
      if (page) {
        await page.close();
      }
    }
  }

  /**
   * 批量生成审批单PDF
   * @param {Array} tasks - 任务列表
   * @param {string} tasks[].flowTaskId - 流程任务ID
   * @param {string} tasks[].token - 用户Token
   * @param {string} tasks[].layoutId - 布局ID(可选)
   * @param {number} concurrency - 并发数(默认3)
   * @returns {Promise<Array>} 结果数组
   */
  async generateBatchPdf(tasks, concurrency = 3) {
    logger.info(`开始批量生成PDF - 总数: ${tasks.length}, 并发数: ${concurrency}`);

    const results = [];
    const queue = [...tasks];

    // 并发控制
    const workers = Array(concurrency).fill(null).map(async (_, index) => {
      while (queue.length > 0) {
        const task = queue.shift();
        if (!task) break;

        try {
          logger.info(`Worker ${index + 1} - 正在处理任务: ${task.flowTaskId}`);
          const pdfBuffer = await this.generateApprovalPdf(task);
          results.push({
            flowTaskId: task.flowTaskId,
            success: true,
            pdfBuffer,
            error: null
          });
        } catch (error) {
          logger.error(`Worker ${index + 1} - 任务失败: ${task.flowTaskId}`, error);
          results.push({
            flowTaskId: task.flowTaskId,
            success: false,
            pdfBuffer: null,
            error: error.message
          });
        }
      }
    });

    await Promise.all(workers);

    logger.info(`批量生成PDF完成 - 成功: ${results.filter(r => r.success).length}, 失败: ${results.filter(r => !r.success).length}`);

    return results;
  }
}

// 导出单例
module.exports = new PdfExportService();
