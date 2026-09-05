# 开发约定（Contributing）

> 给本项目贡献代码前，先读 `ARCHITECTURE.md` 了解整体结构。本文专讲「怎么动手不改坏」。

## 一、提交前必跑（门禁）

```bash
npm run verify:static -- --full
```

全绿（12 道门禁）才允许合入。任何一道非 0 即失败、即阻断。**不要用「我看了觉得没问题」代替门禁结果。**

门禁卡住时：看 `verify-report.json`，定位失败 stage，修代码后重跑。禁止用 `|| true` / 静默跳过。

## 二、新增一个后端接口

1. 在 `backend/src/routes/<域>/` 下加路由，指向 `controllers/` 的处理器。
2. **必须补 Swagger 注解**（让契约门禁 S11 能捕捉破坏）：

   ```ts
   /**
    * @openapi
    * /your/path:
    *   get:
    *     summary: 一句话说明
    *     tags: [YourTag]
    *     responses:
    *       '200':
    *         description: 成功
    */
   router.get('/your/path', handler);
   ```
3. 改完注解后刷新契约：`cd backend && npm run gen:openapi`。
4. 契约门禁只拦「删除/重命名已有路径」这类 breaking 变更；新增端点放行。

## 三、新增一个前端页面 / 表格列

1. 页面放 `frontend/src/apps/<app>/pages/`；公共能力放 `frontend/src/shared/*`。
2. 表格列**优先走 L4 三维参数**（display × editEntry × valueState）体系，不要用 `renderMode:'custom'` 手搓。
   - 例外：业务页手写 custom 列当前有 **17 处白名单**（见 `质量白名单.json`），新增 custom 会被 S9 门禁拦截。
   - 关系展示（如「仓库名反查」）应归为单一展示原语，不要每页重复手写。
3. 纯逻辑（定价/税额/库存分配等）补 vitest 单测，放 `frontend/tests/`。

## 四、数据模型变更（重要）

- **涉及表结构 / 迁移**：必须走 Prisma migration，**需项目 owner 在电脑上确认后**才执行（手机端无法审批）。
- 禁止 `prisma db push` 直接改库；所有 schema 变更要可版本化回放。
- 新增表/字段请同步更新 `prisma/schema.prisma` 与（如有）登记表 `data-source/entity-meta.yml`，再跑 `node tools/gen-entity-meta.mjs`。

## 五、主键与 ID

- 新表主键用 **Snowflake**（`backend/src/utils/snowflake.ts` 的 `snowflake.nextId()`，返回 `bigint`，存 `BIGINT UNSIGNED`）。
- 业务单号（如采购单号）是独立唯一列，**不是主键**。
- 禁止再引入 `P+时间戳+随机` 式反范式主键。

## 六、质量白名单

`质量白名单.json` 登记了已知技术债（含 17 处 custom 逃逸，回收日 2026-10-05）。
门禁命中白名单项时放行但打印提示；**超期自动转红**，届时必须清零或续期（带原因+审批人）。

## 七、提交信息

普通提交即可，但涉及「接口变更 / 数据迁移 / 基建改动」请在 PR 描述里写清楚影响范围，方便 owner 评审与回滚。
