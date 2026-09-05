-- v31：补齐 inventory 快照列（v28 已定义但未落库的历史遗漏）
--
-- 背景：schema.prisma 的 inventory model 在 v28 就声明了三个 SKU 名称快照列
--   （specModel / brandName / unitName），用于「删除品牌/单位/规格后库存行仍能读出名字」，
--   与 document_lines 的快照范式对齐（写入时落库）。
--   但这三列**从未通过 migration 真正建到数据库**，导致：
--     prisma.inventory.findMany() 报 P2022「column does not exist」
--     → GET /api/staff/inventory 与 /api/staff/ops/turnover 一直返回 500。
--   （宽表存在时同样 500——与本轮去宽表改造无关，是遗留未同步项。）
--
-- 处置：按 schema 定义补建三列（可空），与 v28 设计一致。
--   已有库存行的快照列为 NULL，展示时由 attachSkuSnapshots 回退实时 join 补出名称
--   （去宽表改造后回退源为范式表 spec/product/brand/unit），因此无需停机回填；
--   后续写入（入库/调整）会按 v28 逻辑落库快照。

ALTER TABLE `inventory`
  ADD COLUMN `specModel` VARCHAR(200) NULL,
  ADD COLUMN `brandName` VARCHAR(100) NULL,
  ADD COLUMN `unitName` VARCHAR(50) NULL;
