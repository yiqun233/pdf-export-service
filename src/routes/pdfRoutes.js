const express = require('express');
const pdfExportService = require('../services/pdfExportService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * @api {post} /api/export-pdf 导出单个审批单PDF
 * @apiName ExportSinglePdf
 * @apiGroup PDF
 *
 * @apiParam {String} flowTaskId 流程任务ID
 * @apiParam {String} token 用户Token
 * @apiParam {String} [layoutId] 布局ID(可选)
 *
 * @apiSuccess {Buffer} PDF文件流
 */
router.post('/export-pdf', async (req, res) => {
  const startTime = Date.now();
  const { flowTaskId, token, layoutId } = req.body;

  try {
    // 参数验证
    if (!flowTaskId || !token) {
      return res.status(400).json({
        success: false,
        message: 'flowTaskId和token参数不能为空'
      });
    }

    logger.info(`收到PDF导出请求 - FlowTaskId: ${flowTaskId}`);

    // 生成PDF
    const pdfBuffer = await pdfExportService.generateApprovalPdf({
      flowTaskId,
      token,
      layoutId
    });

    const duration = Date.now() - startTime;
    logger.info(`PDF导出成功 - FlowTaskId: ${flowTaskId}, 耗时: ${duration}ms`);

    // 返回PDF文件流
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="approval_${flowTaskId}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('X-Duration', duration);
    res.setHeader('X-File-Size', pdfBuffer.length);

    return res.send(pdfBuffer);

  } catch (error) {
    logger.error(`PDF导出失败 - FlowTaskId: ${flowTaskId}`, error);
    return res.status(500).json({
      success: false,
      message: `PDF导出失败: ${error.message}`
    });
  }
});

/**
 * @api {post} /api/export-pdf-batch 批量导出审批单PDF
 * @apiName ExportBatchPdf
 * @apiGroup PDF
 *
 * @apiParam {Array} tasks 任务列表
 * @apiParam {String} tasks.flowTaskId 流程任务ID
 * @apiParam {String} tasks.token 用户Token
 * @apiParam {String} [tasks.layoutId] 布局ID(可选)
 * @apiParam {Number} [concurrency=3] 并发数
 *
 * @apiSuccess {Boolean} success 是否成功
 * @apiSuccess {String} message 消息
 * @apiSuccess {Object} data 数据
 * @apiSuccess {Array} data.results 结果数组(包含pdfBase64字段)
 * @apiSuccess {Number} data.successCount 成功数量
 * @apiSuccess {Number} data.failedCount 失败数量
 */
router.post('/export-pdf-batch', async (req, res) => {
  const startTime = Date.now();
  const { tasks, concurrency = 3 } = req.body;

  try {
    // 参数验证
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'tasks参数必须是非空数组'
      });
    }

    logger.info(`收到批量PDF导出请求 - 任务数: ${tasks.length}`);

    // 批量生成PDF
    const pdfResults = await pdfExportService.generateBatchPdf(tasks, concurrency);

    // 将PDF Buffer转为Base64供Java端接收
    const results = pdfResults.map(r => ({
      flowTaskId: r.flowTaskId,
      success: r.success,
      pdfBase64: r.success && r.pdfBuffer ? r.pdfBuffer.toString('base64') : null,
      fileSize: r.success && r.pdfBuffer ? r.pdfBuffer.length : 0,
      error: r.error
    }));

    const successCount = results.filter(r => r.success).length;
    const failedCount = results.filter(r => !r.success).length;
    const duration = Date.now() - startTime;

    logger.info(`批量PDF导出完成 - 成功: ${successCount}, 失败: ${failedCount}, 耗时: ${duration}ms`);

    return res.json({
      success: true,
      message: '批量PDF导出完成',
      data: {
        results,
        successCount,
        failedCount,
        duration
      }
    });

  } catch (error) {
    logger.error('批量PDF导出失败', error);
    return res.status(500).json({
      success: false,
      message: `批量PDF导出失败: ${error.message}`
    });
  }
});

/**
 * @api {get} /api/health 健康检查
 * @apiName HealthCheck
 * @apiGroup System
 *
 * @apiSuccess {String} status 状态
 * @apiSuccess {String} message 消息
 * @apiSuccess {Number} timestamp 时间戳
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'PDF导出服务运行正常',
    timestamp: Date.now()
  });
});

module.exports = router;
