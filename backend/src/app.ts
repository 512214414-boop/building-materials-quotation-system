import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { auditMiddleware } from './middleware/auditLogger.js';
import { notFoundHandler, globalErrorHandler } from './middleware/errorHandler.js';
import { tenantMiddleware } from './middleware/tenant.js';
import { setupSwagger } from './docs/swagger.js';
import publicRouter from './routes/public.js';
import customerRouter from './routes/customer.js';
import staffRouter from './routes/staff/index.js';

export function createApp() {
  const app = express();

  app.use(helmet());
  // CORS 核心配置硬编码（源自 config，仅用户特定设置走 .env）
  app.use(cors(config.cors));
  app.use(morgan(config.isProd ? 'combined' : 'dev'));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));

  // 租户上下文：请求进入路由前用 TenantContext 包裹整条链路，全链路查询自动带 tenant 过滤
  app.use(tenantMiddleware);

  // 审计日志挂载（依赖 req.user/req.customer，在路由鉴权后调用）
  app.use(auditMiddleware);

  // 静态资源：上传文件
  // v11.0 性能优化：
  //   - maxAge: 浏览器强缓存 7 天，避免重复传输图片
  //   - etag: 弱 ETag 协商缓存，文件未变更返回 304
  //   - lastModified: Last-Modified 协商缓存
  //   - immutable: 静态文件名含随机 UUID，内容不变即永久缓存
  //   文件名变更 = 新 URL = 浏览器自动请求新文件，无需主动刷新
  app.use(
    '/uploads',
    express.static(path.resolve(config.upload.dir), {
      maxAge: '7d',
      etag: true,
      lastModified: true,
      immutable: true,
      fallthrough: true,
    }),
  );

  // API 路由
  app.use('/api', publicRouter);
  app.use('/api', customerRouter);
  app.use('/api', staffRouter);

  // 契约文档（Swagger UI 挂在 /api-docs，原始 JSON 在 /api-docs.json）
  setupSwagger(app);

  // 404 与全局错误处理
  app.use(notFoundHandler);
  app.use(globalErrorHandler);

  return app;
}

export default createApp;
