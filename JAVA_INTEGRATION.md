# Java集成示例

## 架构说明

**Node.js服务只负责生成PDF,Java后端负责接收PDF并上传到MinIO**

```
┌─────────────────┐
│   Java后端      │
│  调用PDF服务     │
└────────┬────────┘
         │ 1. POST请求
         ↓
┌─────────────────┐
│  Node.js服务    │
│  生成PDF        │
└────────┬────────┘
         │ 2. 返回PDF文件流
         ↓
┌─────────────────┐
│   Java后端      │
│ 3. 接收PDF字节流 │
│ 4. 上传到MinIO  │
│ 5. 更新数据库   │
└─────────────────┘
```

## 1. 添加依赖

如果使用Maven,在 `pom.xml` 中确保有以下依赖(项目已有):

```xml
<!-- Spring Web -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>

<!-- FastJson -->
<dependency>
    <groupId>com.alibaba</groupId>
    <artifactId>fastjson</artifactId>
</dependency>
```

## 2. 配置文件

在 `application.yml` 中添加配置:

```yaml
# PDF导出服务配置
pdf:
  export:
    service:
      url: http://localhost:8098
      timeout: 60000  # 超时时间(毫秒)
```

## 3. 创建配置类

`dsai-common/src/main/java/pwc/config/PdfExportConfig.java`:

```java
package pwc.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "pdf.export.service")
public class PdfExportConfig {
    /**
     * PDF导出服务地址
     */
    private String url = "http://localhost:8098";

    /**
     * 超时时间(毫秒)
     */
    private Integer timeout = 60000;
}
```

## 4. 创建服务类

`dsai-workflow/src/main/java/pwc/engine/service/PdfExportService.java`:

```java
package pwc.engine.service;

/**
 * PDF导出服务接口
 */
public interface PdfExportService {

    /**
     * 导出单个审批单PDF
     *
     * @param flowTaskId 流程任务ID
     * @param token      用户Token
     * @return PDF文件URL
     */
    String exportSinglePdf(String flowTaskId, String token);

    /**
     * 导出单个审批单PDF并更新数据库
     *
     * @param flowTaskId 流程任务ID
     * @param token      用户Token
     * @return 是否成功
     */
    boolean exportAndSavePdf(String flowTaskId, String token);

    /**
     * 批量导出审批单PDF
     *
     * @param startTime 开始时间
     * @param endTime   结束时间
     * @param token     用户Token
     * @return 导出结果
     */
    BatchExportResult exportBatchPdf(Long startTime, Long endTime, String token);

    /**
     * 批量导出结果
     */
    class BatchExportResult {
        private Integer total;
        private Integer successCount;
        private Integer failedCount;

        public Integer getTotal() {
            return total;
        }

        public void setTotal(Integer total) {
            this.total = total;
        }

        public Integer getSuccessCount() {
            return successCount;
        }

        public void setSuccessCount(Integer successCount) {
            this.successCount = successCount;
        }

        public Integer getFailedCount() {
            return failedCount;
        }

        public void setFailedCount(Integer failedCount) {
            this.failedCount = failedCount;
        }
    }
}
```

## 5. 实现服务类

`dsai-workflow/src/main/java/pwc/engine/service/impl/PdfExportServiceImpl.java`:

```java
package pwc.engine.service.impl;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.JSONArray;
import com.alibaba.fastjson.JSONObject;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;
import pwc.config.PdfExportConfig;
import pwc.engine.entity.FlowTaskEntity;
import pwc.engine.service.FlowTaskService;
import pwc.engine.service.PdfExportService;
import pwc.util.MinioUploadUtil;

import java.io.ByteArrayInputStream;
import java.util.*;

@Slf4j
@Service
public class PdfExportServiceImpl implements PdfExportService {

    @Autowired
    private PdfExportConfig pdfExportConfig;

    @Autowired
    private FlowTaskService flowTaskService;

    @Autowired
    private RestTemplate restTemplate;

    @Autowired
    private MinioUploadUtil minioUploadUtil;

    @Override
    public String exportSinglePdf(String flowTaskId, String token) {
        log.info("开始导出PDF - FlowTaskId: {}", flowTaskId);

        try {
            // 1. 调用Node.js服务生成PDF
            String url = pdfExportConfig.getUrl() + "/api/export-pdf";

            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("flowTaskId", flowTaskId);
            requestBody.put("token", token);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            HttpEntity<Map<String, Object>> request = new HttpEntity<>(requestBody, headers);

            // 接收PDF文件流
            ResponseEntity<byte[]> response = restTemplate.postForEntity(url, request, byte[].class);

            if (response.getStatusCode() == HttpStatus.OK && response.getBody() != null) {
                byte[] pdfBytes = response.getBody();
                log.info("PDF生成成功 - FlowTaskId: {}, 大小: {} KB", flowTaskId, pdfBytes.length / 1024);

                // 2. 上传到MinIO
                String fileName = "approval_pdf/" + flowTaskId + "_" + System.currentTimeMillis() + ".pdf";
                String fileUrl = minioUploadUtil.uploadFile(
                        new ByteArrayInputStream(pdfBytes),
                        fileName,
                        pdfBytes.length,
                        "application/pdf"
                );

                log.info("PDF上传MinIO成功 - FlowTaskId: {}, FileUrl: {}", flowTaskId, fileUrl);

                return fileUrl;

            } else {
                log.error("PDF导出失败 - FlowTaskId: {}, StatusCode: {}", flowTaskId, response.getStatusCode());
                return null;
            }

        } catch (Exception e) {
            log.error("PDF导出异常 - FlowTaskId: " + flowTaskId, e);
            return null;
        }
    }

    @Override
    public boolean exportAndSavePdf(String flowTaskId, String token) {
        String pdfUrl = exportSinglePdf(flowTaskId, token);

        if (pdfUrl != null) {
            // 更新flow_task表的PDF字段
            FlowTaskEntity flowTask = flowTaskService.getById(flowTaskId);
            if (flowTask != null) {
                flowTask.setPdfFileUrl(pdfUrl);
                flowTaskService.updateById(flowTask);
                log.info("PDF URL已保存到数据库 - FlowTaskId: {}, URL: {}", flowTaskId, pdfUrl);
                return true;
            }
        }

        return false;
    }

    @Override
    public BatchExportResult exportBatchPdf(Long startTime, Long endTime, String token) {
        log.info("开始批量导出PDF - StartTime: {}, EndTime: {}", startTime, endTime);

        BatchExportResult result = new BatchExportResult();

        try {
            // 1. 查询指定时间范围内的审批单
            List<FlowTaskEntity> flowTasks = flowTaskService.lambdaQuery()
                    .ge(FlowTaskEntity::getCreatorTime, new Date(startTime))
                    .le(FlowTaskEntity::getCreatorTime, new Date(endTime))
                    .eq(FlowTaskEntity::getDeleteMark, 0)
                    .list();

            log.info("查询到 {} 条审批单", flowTasks.size());

            if (flowTasks.isEmpty()) {
                result.setSuccessCount(0);
                result.setFailedCount(0);
                result.setTotal(0);
                return result;
            }

            // 2. 调用Node.js服务批量生成PDF
            String url = pdfExportConfig.getUrl() + "/api/export-pdf-batch";

            JSONArray tasks = new JSONArray();
            for (FlowTaskEntity flowTask : flowTasks) {
                JSONObject task = new JSONObject();
                task.put("flowTaskId", flowTask.getId());
                task.put("token", token);
                tasks.add(task);
            }

            Map<String, Object> requestBody = new HashMap<>();
            requestBody.put("tasks", tasks);
            requestBody.put("concurrency", 3);

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            HttpEntity<Map<String, Object>> request = new HttpEntity<>(requestBody, headers);

            ResponseEntity<String> response = restTemplate.postForEntity(url, request, String.class);

            if (response.getStatusCode() == HttpStatus.OK) {
                JSONObject responseData = JSON.parseObject(response.getBody());
                if (responseData.getBoolean("success")) {
                    JSONObject data = responseData.getJSONObject("data");
                    JSONArray results = data.getJSONArray("results");

                    int successCount = 0;
                    int failedCount = 0;

                    // 3. 处理每个PDF结果
                    for (int i = 0; i < results.size(); i++) {
                        JSONObject item = results.getJSONObject(i);
                        String flowTaskId = item.getString("flowTaskId");

                        if (item.getBoolean("success")) {
                            try {
                                // 解码Base64为字节数组
                                String pdfBase64 = item.getString("pdfBase64");
                                byte[] pdfBytes = Base64.getDecoder().decode(pdfBase64);

                                // 上传到MinIO
                                String fileName = "approval_pdf/" + flowTaskId + "_" + System.currentTimeMillis() + ".pdf";
                                String fileUrl = minioUploadUtil.uploadFile(
                                        new ByteArrayInputStream(pdfBytes),
                                        fileName,
                                        pdfBytes.length,
                                        "application/pdf"
                                );

                                // 更新数据库
                                FlowTaskEntity flowTask = flowTaskService.getById(flowTaskId);
                                if (flowTask != null) {
                                    flowTask.setPdfFileUrl(fileUrl);
                                    flowTaskService.updateById(flowTask);
                                    successCount++;
                                    log.info("PDF处理成功 - FlowTaskId: {}, URL: {}", flowTaskId, fileUrl);
                                }

                            } catch (Exception e) {
                                failedCount++;
                                log.error("PDF处理失败 - FlowTaskId: " + flowTaskId, e);
                            }
                        } else {
                            failedCount++;
                            log.error("PDF生成失败 - FlowTaskId: {}, Error: {}", flowTaskId, item.getString("error"));
                        }
                    }

                    result.setSuccessCount(successCount);
                    result.setFailedCount(failedCount);
                    result.setTotal(flowTasks.size());

                    log.info("批量PDF导出完成 - 成功: {}, 失败: {}", successCount, failedCount);
                }
            }

        } catch (Exception e) {
            log.error("批量PDF导出异常", e);
        }

        return result;
    }
}
```

## 6. 创建Controller

`dsai-workflow/src/main/java/pwc/engine/controller/PdfExportController.java`:

```java
package pwc.engine.controller;

import io.swagger.annotations.Api;
import io.swagger.annotations.ApiOperation;
import io.swagger.annotations.ApiParam;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import pwc.base.ActionResult;
import pwc.engine.service.PdfExportService;
import pwc.util.UserProvider;

@Slf4j
@RestController
@Api(tags = "PDF导出")
@RequestMapping("/api/workflow/pdf")
public class PdfExportController {

    @Autowired
    private PdfExportService pdfExportService;

    @Autowired
    private UserProvider userProvider;

    @ApiOperation("导出单个审批单PDF")
    @PostMapping("/export")
    public ActionResult exportPdf(@ApiParam("流程任务ID") @RequestParam String flowTaskId) {
        try {
            String token = userProvider.getToken();
            String pdfUrl = pdfExportService.exportSinglePdf(flowTaskId, token);

            if (pdfUrl != null) {
                return ActionResult.success("PDF导出成功", pdfUrl);
            } else {
                return ActionResult.fail("PDF导出失败");
            }
        } catch (Exception e) {
            log.error("PDF导出失败", e);
            return ActionResult.fail("PDF导出失败: " + e.getMessage());
        }
    }

    @ApiOperation("导出并保存审批单PDF")
    @PostMapping("/export-and-save")
    public ActionResult exportAndSavePdf(@ApiParam("流程任务ID") @RequestParam String flowTaskId) {
        try {
            String token = userProvider.getToken();
            boolean success = pdfExportService.exportAndSavePdf(flowTaskId, token);

            if (success) {
                return ActionResult.success("PDF导出并保存成功");
            } else {
                return ActionResult.fail("PDF导出失败");
            }
        } catch (Exception e) {
            log.error("PDF导出失败", e);
            return ActionResult.fail("PDF导出失败: " + e.getMessage());
        }
    }

    @ApiOperation("批量导出审批单PDF")
    @PostMapping("/export-batch")
    public ActionResult exportBatchPdf(
            @ApiParam("开始时间(时间戳)") @RequestParam Long startTime,
            @ApiParam("结束时间(时间戳)") @RequestParam Long endTime
    ) {
        try {
            String token = userProvider.getToken();
            PdfExportService.BatchExportResult result = pdfExportService.exportBatchPdf(startTime, endTime, token);
            return ActionResult.success("批量导出完成", result);
        } catch (Exception e) {
            log.error("批量PDF导出失败", e);
            return ActionResult.fail("批量PDF导出失败: " + e.getMessage());
        }
    }
}
```

## 7. 数据库变更

在 `flow_task` 表添加字段:

```sql
ALTER TABLE flow_task ADD COLUMN F_PDF_FILE_URL VARCHAR(500) COMMENT 'PDF文件URL';
```

然后在 `FlowTaskEntity.java` 中添加字段:

```java
/**
 * PDF文件URL
 */
@TableField("F_PDF_FILE_URL")
private String pdfFileUrl;
```

## 8. 使用示例

### 在Service中调用

```java
@Autowired
private PdfExportService pdfExportService;

public void someMethod() {
    // 导出单个PDF
    String token = userProvider.getToken();
    String pdfUrl = pdfExportService.exportSinglePdf("flowTaskId", token);
    System.out.println("PDF URL: " + pdfUrl);

    // 导出并保存
    boolean success = pdfExportService.exportAndSavePdf("flowTaskId", token);

    // 批量导出
    Long startTime = System.currentTimeMillis() - 30 * 24 * 60 * 60 * 1000L; // 30天前
    Long endTime = System.currentTimeMillis();
    PdfExportService.BatchExportResult result = pdfExportService.exportBatchPdf(startTime, endTime, token);

    System.out.println("成功: " + result.getSuccessCount());
    System.out.println("失败: " + result.getFailedCount());
}
```

### API调用示例

```bash
# 导出单个PDF
curl -X POST "http://localhost:8096/api/workflow/pdf/export?flowTaskId=123456" \
  -H "token: your-token-here"

# 导出并保存
curl -X POST "http://localhost:8096/api/workflow/pdf/export-and-save?flowTaskId=123456" \
  -H "token: your-token-here"

# 批量导出
curl -X POST "http://localhost:8096/api/workflow/pdf/export-batch?startTime=1704067200000&endTime=1706745600000" \
  -H "token: your-token-here"
```

## 9. 配置RestTemplate (如果项目中没有)

如果项目中没有RestTemplate Bean,需要添加配置:

`dsai-common/src/main/java/pwc/config/RestTemplateConfig.java`:

```java
package pwc.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

@Configuration
public class RestTemplateConfig {

    @Bean
    public RestTemplate restTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(60000); // 连接超时60秒
        factory.setReadTimeout(60000);    // 读取超时60秒
        return new RestTemplate(factory);
    }
}
```

## 10. MinIO上传工具使用

项目中已有 `MinioUploadUtil`,使用方法:

```java
@Autowired
private MinioUploadUtil minioUploadUtil;

// 上传文件
String fileUrl = minioUploadUtil.uploadFile(
    inputStream,      // 文件输入流
    fileName,         // 文件名(带路径)
    fileSize,         // 文件大小
    contentType       // Content-Type
);
```

## 注意事项

1. **Token获取**: 确保 `UserProvider` 能正确获取当前用户Token
2. **数据库字段**: 需要先执行SQL添加 `F_PDF_FILE_URL` 字段
3. **超时配置**: 复杂表单可能需要较长时间,建议配置合理的超时时间(60秒以上)
4. **并发控制**: 批量导出时Node.js服务默认并发数为3,可根据服务器性能调整
5. **MinIO配置**: 确保MinIO服务正常运行且已配置
6. **Node.js服务**: 确保PDF导出服务已启动在8098端口
7. **文件大小**: Base64传输会增加约33%的数据量,超大PDF可能需要优化传输方式

## 完整流程

1. Java后端调用Node.js服务 `/api/export-pdf` 接口
2. Node.js使用Puppeteer访问前端页面并生成PDF
3. Node.js返回PDF文件流(单个)或Base64编码(批量)
4. Java后端接收PDF数据
5. Java后端使用 `MinioUploadUtil` 上传到MinIO
6. Java后端更新 `flow_task` 表的 `F_PDF_FILE_URL` 字段
7. 完成!
