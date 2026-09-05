# P2-b 迁移方案 · 存量 62 表 PK 切 Snowflake（待确认执行）

> 状态：**已离线生成 SQL 草稿，未执行**。按项目纪律，真实 DB 结构变更须用户在电脑上确认后我才跑 `migrate deploy`。
> 关联：P2（已落地，tenant_id/legacy_code 已注入）、蓝图 P0–P6、重构推进进度总览。

## 目标态
- 62 张存量表主键由 `BigInt @id @default(autoincrement())` → `BigInt @id @db.UnsignedBigInt`，由**应用层 Snowflake 生成器**写号（生成器 `backend/src/utils/snowflake.ts` 已就绪）。
- 所有引用这些 PK 的外键列（46 处）同步升 `UnsignedBigInt`，保证 FK 类型一致（Prisma 强约束）。
- 旧自增 id 值保留在现有行；`legacyCode` 列（P2 已加）保留旧业务编码只读。
- `roles` 表原 PK 是 `Int`，本次一并升 `BigInt Unsigned`（62 改写主键 + 1 个 Int→BigInt）。

## 已生成的 SQL（离线，未连库）
- 路径：`docs/architecture/sql/p2b_snowflake_pk.sql`（632 行）
- 生成方式：`prisma migrate diff --from-schema-datamodel 当前schema --to-schema-datamodel 目标schema --script`（两个 datamodel 比对，**不发任何 DB 连接**）。
- 排序安全性已校验：
  - DROP FOREIGN KEY（1–140 行）→ MODIFY 列（141–495）→ ADD CONSTRAINT（496–632）。
  - **DROP INDEX 出现 0 次** —— 这正是之前 P2 踩 P3018 的根因（自动 diff 误带删索引）。本次只动 PK/FK 类型，不碰索引，故无此坑。

## 双写过渡策略（应用层，零停机）
Snowflake ID 是 64 位时间序正整数，远大于现有自增 1..N，天然不冲突。故无需新增双写列：
1. **Phase 1（先发应用）**：所有 insert 改为「应用生成 Snowflake id 并显式传入」；DB 仍保留 autoincrement 但被显式 id 旁路，不触发。部署后新行全部 Snowflake 号，旧行自增号原样保留，无碰撞。
2. **Phase 2（再跑本迁移）**：`MODIFY id BIGINT UNSIGNED NOT NULL`（去掉 autoincrement 属性）。因 app 始终显式传 id，去掉自增属性安全。46 处 FK 列同步改 unsigned。
3. **Phase 3（可选）**：把 `legacyCode` 回填历史业务编码（如原 `P+时间戳+随机`），设为只读，完成旧编码归档。

## 回滚
- 主回滚：**执行前对 `bm_quotation` 做全量 `mysqldump` 备份**，异常即 `mysql < 备份` 还原（最稳，强一致）。
- 次回滚：逆向 DDL（`MODIFY id BIGINT` 恢复 autoincrement + FK 列回 signed）—— 但生产首选备份还原。

## 验收（执行后机器可判）
- `prisma migrate status` → `Database schema is up to date!`（全绿，新迁移入 `_prisma_migrations`）。
- 抽查 3 张表：`SELECT COLUMN_TYPE FROM information_schema.columns WHERE COLUMN_KEY='PRI'` → `bigint unsigned`。
- 新写入一行，`SELECT id` 为 Snowflake 号（>> 历史 max）；旧行 id 不变、可正常关联。
- 应用冒烟：开单→配货→收款链路无 FK / 类型报错。

## 待你确认项
- 是否在电脑上点头执行（我会在你确认后：备份 → shadow DB dry-run → staging 试跑 → 你二次确认 → 生产执行）。
- Phase 1 应用改动的波及面：需确认是否存在「依赖 DB 自增回填 id 后再读」的旧代码路径（若有，Phase 1 需先改这些路径为显式传 id）。
