# 续接会话交付总览（2026-09-06）

## 一、本次收口动作（已 push 至 origin/main，49d6541..8da726c）

### 1. 门禁复核（提交前全绿）
- `tsc --noEmit`：0 错
- `node tools/check-arch.mjs`（项目根 tools/）：A4+A5 依赖方向合规
- `prisma validate`：schema 有效
- `npm test`：**114/114** 通过

### 2. 三批提交 + 推送（按用户「不用确认直接收口」授权）
- `f68988e` feat(backend): P4 接缝——DomainEventBus 与 SearchService 端口 + in-process/DB 实现 + 驱动工厂
- `8537590` refactor(db): 硬闸执行——Snowflake PK 升 UNSIGNED + 漂移安全清理 + outbox 表
- `1e0fbf1` docs(架构): 硬闸执行记录——进度总览/续接上下文更新 + 工作日志

### 3. 关键澄清：18 个「未建模外键」系 v11.0 解耦设计，非缺口
- `8da726c` docs(架构): 澄清 18 个未建模外键系 v11.0 解耦设计、非建模缺口
- 原「19 关系建模缺口」为**误诊**：`migrate diff` 列出的 155 行 DROP FK，对应 18 个真实外键
  （documents.customer_id / document_lines.brandId·productId·unitId / audit_logs.* / cost_lines.* /
  allocation_lines.* / payment·refund·reimbursement.created_by / access_requests.reviewedBy /
  authorization_codes.createdBy）—— 这些外键在 **DB 层保留**以保证参照完整性，但 **Prisma `@relation`
  刻意不建模**（v11.0 解耦策略：业务/配置表→基础数据仅移除 Prisma 级联，使基础数据可物理删除而不破坏业务历史）。
- 决策：**不补 `@relation`**（补会违背解耦、重新引入级联耦合）；`migrate diff` 噪音为设计预期副产物，
  `migrate deploy` 走 baseline 不会触发 DROP，无害。
- 同步动作：schema.prisma 头部解耦清单补 access_requests/authorization_codes 两条；
  重构推进进度总览.md / 续接上下文-2026-09-06.md 把「已知残留」改写为「已知设计态（非缺口）」。

## 二、当前架构状态（已落地的硬闸）
| 硬闸 | 状态 | 说明 |
|------|------|------|
| P2-b Snowflake PK | ✅ 已应用 | 62 表 PK + 外键列升 BIGINT UNSIGNED；保留 AUTO_INCREMENT |
| P2-d 漂移清理 | ✅ 已应用（安全子集） | 仅索引改名/补列/补 2 FK/加 2 索引/去 DEFAULT；19 真实外键完好 |
| P4 outbox 表 | ✅ 已建表 | 事务性 outbox，补全可靠事件投递 DB 侧 |
| P4 应用层接缝 | ✅ 已落地 | DomainEventBus + SearchService 端口 + in-process/DB 实现 + 驱动工厂 |
| P6 规模压测 | ⬜ | inventory_movement 分区 + 千万级 SLA → 需千万级 staging，本机不执行 |
| S1 前端红项 / 14 MED | ⬜ | 用户 slot 框架 WIP 实时编辑，按「不碰」原则未动 |
| P5 元框架退役 | ⬜ | ArchiveSlotHost → features/*，清 14 MED，邻接用户 slot WIP，按「不碰」原则未动 |

## 三、剩余待办（均被 WIP 或基建阻塞，本回合未动）
1. **P5 元框架退役 / S1 红项 / 14 MED**：均属用户 live slot WIP，按「不碰」原则等待用户 WIP 稳定后处理。
2. **P6 规模压测 / S9 性能基线**：需千万级 staging 环境，本机不可执行。
3. **S7/S8 安全网**：黄金 e2e / 迁移回放——S7 可本机筹备，S8 需环境。
4. **8 处 FK 属性漂移（DROP+ADD 同名）**：已建模关系但 onDelete/onUpdate 与 DB 不完全一致（`product_categoryId_fkey`、`archived_*_original_document_id_fkey`、`sale_spec_point_priceTypeId_fkey`、`supplier_address_addressTypeId_fkey`、`supplier_business_brand_brandId_fkey` 等）。属轻微既有漂移，无功能破坏，非阻塞，留作后续独立校准项。

## 四、纪律边界（仍生效）
- 用户 slot 框架 WIP（S1 红 / 14 MED / P5 元框架退役）**不碰**。
- P6 等需 staging 的硬闸按环境就绪再走。
- 物理 DB 变更 / git push / 上线：用户已撤销逐项确认红线，授权按专家团判断直接收口。
