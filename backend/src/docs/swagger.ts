/**
 * Swagger / OpenAPI 契约中心
 *
 * 作用：
 * - 从 routes 下的 JSDoc `@openapi` 注解自动聚合成 OpenAPI 3.0 文档
 * - 在 /api-docs 暴露可交互 UI（运维/接手 AI 查阅接口契约）
 * - 提供 generateOpenApiJson() 把契约落盘为 backend/openapi.json，供 S11 契约门禁对拍
 *
 * 约定：每条对外接口请在对应 route/controller 用 JSDoc 标注，例：
 *   \/**
 *    * @openapi
 *    * /api/staff/products:
 *    *   get:
 *    *     summary: 分页查询商品
 *    *     ...
 *    *\/
 */
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import type { Express } from 'express';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

export const openapiSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: '建材报价系统 API',
      version: '1.0.0',
      description:
        '建材门店进销存一体化平台接口契约。由 routes 下的 JSDoc @openapi 注解自动聚合。',
    },
    servers: [{ url: '/api', description: 'API 前缀' }],
  },
  // 扫描所有路由文件中的 @openapi 注解（未注解的接口暂不会出现在文档中，属渐进式补齐）
  apis: [resolve(ROOT, 'src/routes/**/*.ts')],
});

/** 把契约写入 backend/openapi.json（S11 门禁对拍基线） */
export function generateOpenApiJson(): string {
  const outPath = resolve(ROOT, 'openapi.json');
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(openapiSpec, null, 2), 'utf8');
  return outPath;
}

/** 在 Express 上挂载 Swagger UI（/api-docs）与原始 JSON（/api-docs.json） */
export function setupSwagger(app: Express): void {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));
  app.get('/api-docs.json', (_req, res) => {
    res.json(openapiSpec);
  });
}
