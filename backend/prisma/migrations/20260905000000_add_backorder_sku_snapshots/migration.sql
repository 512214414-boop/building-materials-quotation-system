-- v32：补齐 backorders 快照列（与 v31 inventory 同一类历史遗漏）
--
-- 背景：schema.prisma 的 backorders model 声明了三个 SKU 名称快照列
--   （specModel / brandName / unitName），用于「删除品牌/单位/规格后欠库行仍能读出名字」，
--   与 document_lines 的快照范式对齐（写入时落库）。
--   但这三列从未通过 migration 建到数据库，导致：
--     prisma.backorders.findMany() 报 P2022「column does not exist」
--     → GET /api/staff/backorders 返回 500 → 欠库台账页面完全不可用。
--   实测表列为：id,document_id,line_id,warehouse_id,brand_id,unit_id,
--               qty,status,fulfilled_at,fulfilled_by,fulfilledName,
--               note,created_at,updated_at,spec_id（缺 specModel/brandName/unitName）
--
-- 处置：按 schema 定义补建三列（可空）。
--   已有欠库行快照为 NULL，展示时由 attachSkuSnapshots 回退实时 join 补出名称，
--   无需停机回填；后续写入按 v28 逻辑落库快照。
--
-- 仅 ADD COLUMN，不删除、不改动既有数据。

ALTER TABLE `backorders`
  ADD COLUMN `specModel` VARCHAR(200) NULL,
  ADD COLUMN `brandName` VARCHAR(100) NULL,
  ADD COLUMN `unitName`  VARCHAR(50)  NULL;
