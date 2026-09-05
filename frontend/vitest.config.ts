import { defineConfig } from 'vitest/config';

/**
 * 前端单测配置（G2）
 *
 * 约定：
 *   - 用例放 tests/**\/*.test.ts，与 backend/tests 的位置约定对齐
 *   - 默认 environment=node：首批测的是平台层纯逻辑，不需要 DOM / 浏览器
 *   - fileParallelism=false：部分平台层模块持有模块级单例（如 PanelTree 注册表），
 *     并行会让结果不可复现 —— 门禁要求结果确定，宁慢勿假
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
  },
});
