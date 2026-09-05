# P2-d 迁移方案 · 历史 drift 清理（待确认执行）

> 状态：**已只读枚举真实 drift（连库 `diff --from-url`，只生成 SQL 不改库）**。按纪律须用户确认后执行。
> 成因：db-push 时代留下的游离外键 / 索引 / 列定义与当前 schema 不一致。

## 已生成的 drift SQL（只读枚举，未执行）
- 路径：`docs/architecture/sql/p2d_drift_cleanup.sql`（132 行）
- 生成方式：`prisma migrate diff --from-url mysql://.../bm_quotation --to-schema-datamodel 当前schema.prisma --script`（仅读取 DB 结构生成差异，**零写入**）。
- 构成：19 DROP FOREIGN KEY / 2 ADD CONSTRAINT / 2 MODIFY / 8 DROP INDEX / 5 RENAME INDEX / 2 CREATE INDEX / 3 ALTER COLUMN(updatedAt DROP DEFAULT 等) / inventory_ledger 补 3 列。

## drift 分类与处置建议
| 类别 | 内容 | 处置 |
|---|---|---|
| 游离外键（19 处） | `documents_created_by_fkey`、`audit_logs_user_id_fkey`、`spec_unit_unit_fk` 等 schema 已无定义的 FK | **删除**（漂移，无引用方） |
| 索引重命名（5 处） | `documents_*`、`spec_v22_*`、`supplier_payable_lines_*` | **RENAME**（对齐 schema 命名） |
| 缺失索引补建（2 处） | `brand_unit_conversion_specId_idx`、`unit_status_idx` | **CREATE**（schema 有、库缺） |
| 缺失外键补建（2 处） | `spec_unit_unitId_fkey`、`inbound_lines_task_id_fkey` | **ADD** |
| 列定义对齐（2 MODIFY + 3 ALTER） | `spec.id` 回 AUTO_INCREMENT、`updatedAt`/`cost_segment` DROP DEFAULT | **对齐 schema** |
| inventory_ledger 补列 | `brandName`/`specModel`/`unitName` VARCHAR NULL | **ADD**（schema 要求） |
| **FULLTEXT 全文索引（6 处 `ft_*`）** | `ft_brand_name`、`ft_category_name`、`ft_product_name`、`ft_product_remark`、`ft_spec_model`、`ft_spec_remark` | ⚠️ **建议保留**（搜索当前依赖 DB FULLTEXT ngram；P4 独立搜索服务就位前删除会伤搜索） |
| 复合索引 `sale_price_brandId_unitId_priceTypeId_idx` | DB 有、schema 无 | ⚠️ 建议保留或补登 schema（高频查询索引） |

## ⚠️ 关键决策点（需你拍板）
- **6 个 `ft_*` FULLTEXT 索引**：当前搜索功能依赖它们。直接按 drift 删会降级搜索。
  - 推荐：**保留**（把 `@@fulltext` 补登进 schema，让 Prisma 不再视为 drift），等 P4 搜索服务（ES/独立索引）接管后再撤。
- `sale_price_brandId_unitId_priceTypeId_idx` 同理建议保留/补登。
- 上述两项若选「保留」，执行 SQL 时**跳过对应 DROP INDEX 行**即可，不影响其余清理。

## 执行顺序
- **P2-d 先于 P2-b**：本迁移让 DB 对齐「当前 schema」，P2-b 再基于「当前 schema」把 PK 升 Snowflake（P2-b 的 SQL 正是从当前 schema diff 出来的，DB 先对齐才能保证 P2-b 干净应用）。
- 单独立迁移目录：`backend/prisma/migrations/<timestamp>_p2d_drift_cleanup/migration.sql`，经 `migrate deploy` 应用（不用 db push）。

## 回滚
- 执行前全量 `mysqldump` 备份；异常 `mysql < 备份` 还原。
- 因本迁移多为「删游离约束 / 重命名」，还原备份即完整回退。

## 验收
- `prisma migrate status` 全绿；`_prisma_migrations` 新增本迁移。
- 孤儿行扫描：对删除的 19 个 FK，确认无「引用了已不存在父行」的孤儿数据（迁移前先 `SELECT ... LEFT JOIN ... WHERE parent.id IS NULL` 摸底，有则先处置）。
- 搜索冒烟：`ft_*` 索引仍在（若选保留）→ 搜索接口返回正常。
- P2-b 可顺接执行（DB 已对齐当前 schema）。

## 待你确认项
- 是否在电脑上点头执行。
- FULLTEXT / 复合索引「保留 or 删除」的最终选择（我推荐保留至 P4）。
- 孤儿数据摸底结果（我可在你确认执行前先跑只读摸底查询，不改库）。
