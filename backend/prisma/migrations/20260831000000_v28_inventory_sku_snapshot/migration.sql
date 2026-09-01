-- v28：inventory 家族 SKU 维度名称快照（对齐 document_lines 快照范式）
--   背景：inventory / inventory_ledger / backorders 用逻辑外键，删品牌/单位/规格后
--         库存行既无 FK 校验也无名字可读，直接「隐形」（见 09 数据逻辑一致性分析 2.1/2.2）。
--   本迁移为三张表补 specModel/brandName/unitName 可空快照列；写入时由
--   inventoryService.resolveSkuNameSnapshot 落库，读路径 attachSkuSnapshots 优先用已存快照。
--   删除护栏见 src/services/dictInventoryGuard.ts（brand/unit/category 删除前校验 inventory 引用）。

ALTER TABLE `inventory`
  ADD COLUMN `specModel` VARCHAR(200) NULL,
  ADD COLUMN `brandName` VARCHAR(100) NULL,
  ADD COLUMN `unitName`  VARCHAR(50)  NULL;

ALTER TABLE `inventory_ledger`
  ADD COLUMN `specModel` VARCHAR(200) NULL,
  ADD COLUMN `brandName` VARCHAR(100) NULL,
  ADD COLUMN `unitName`  VARCHAR(50)  NULL;

ALTER TABLE `backorders`
  ADD COLUMN `specModel` VARCHAR(200) NULL,
  ADD COLUMN `brandName` VARCHAR(100) NULL,
  ADD COLUMN `unitName`  VARCHAR(50)  NULL;
