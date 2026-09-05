/**
 * 生成 OpenAPI 契约文件（backend/openapi.json）
 * 由 `npm run gen:openapi` 调用，产出供 S11 契约门禁对拍的基线。
 */
import { generateOpenApiJson, openapiSpec } from './swagger.js';

const path = generateOpenApiJson();
const spec = openapiSpec as { paths?: Record<string, unknown>; info?: { version?: string } };
const pathCount = Object.keys(spec.paths ?? {}).length;
console.log(`✓ 已生成 OpenAPI 契约: ${path}`);
console.log(`  接口路径数: ${pathCount}`);
console.log(`  版本: ${spec.info?.version ?? 'n/a'}`);
