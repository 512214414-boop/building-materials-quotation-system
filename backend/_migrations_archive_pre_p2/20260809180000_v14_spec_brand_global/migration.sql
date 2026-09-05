-- v14.0 迁移：品牌全局档案 + 规格拆表 + SKU 升级（规格×品牌×单位）
-- ============================================================
-- 变更性质（用户「产品表下面有规格的变体表，品牌/单位挂在规格变体下面；
-- 品牌是全局独立档案，通过 id 引用，改名全局生效；层级不会改变」）：
--   1. product 拆出 spec（规格变体）表：product 只存产品名，spec 存规格型号
--   2. brand 归并为全局档案：name 全局唯一，移除 productId/remark/sortOrder
--   3. 新增 spec_brand（规格×品牌关联）：specId + brandId，承载规格内品牌备注/排序/状态
--   4. unit 挂 spec（unit.specId），原 unit.productId → spec
--   5. SKU 升级：sale_price/purchase_price/brand_unit_conversion/product_image/product_sku_search
--      的 brandId 全部改为 specBrandId（规格×品牌维度）
--   6. 业务表（document_lines/inventory/inbound_lines/backorders）新增 spec 维度
--
-- 执行顺序关键（解除外键依赖后再删行，避免 CASCADE 误删）：
--   A. 建 spec 表 + 填数据（每个旧 SPU 一行）
--   B. unit 挂 spec（解除 unit→product 外键，删 productId 列）
--   C. 品牌归并：建 spec_brand + 填数据（旧 brand → spec_brand）
--   D. 价格/换算/图片/宽表/单据/库存 brandId → specBrandId
--   E. brand 表：解除 productId 外键，删列，删非保留行（保留每 name 最小 id）
--   F. product 表：删非保留行（此时无子表 CASCADE），删 specModel 列，改唯一约束
-- ============================================================

-- ============================================================
-- 迁移历史补欠账：以下列存在于 schema 但早期迁移未覆盖（重建库缺失）。
-- 注意：本段在「重建库 + 恢复数据」后、作为单独脚本执行（见 v14 迁移说明），
--       此处不再重复 ADD（避免列已存在冲突）——重建流程见 README 或迁移头注释。
-- ============================================================
-- （补欠账列由独立脚本执行，不在此迁移内）

-- ============ A. 创建 spec 表 + 填充（每个旧 SPU 生成一条规格变体） ============
CREATE TABLE `spec` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `productId` BIGINT NOT NULL,
  `specModel` VARCHAR(200) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `spec_productId_specModel_key`(`productId`, `specModel`),
  INDEX `spec_productId_idx`(`productId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 归并策略：同一 (categoryId, name) 组保留最小 product.id 作为产品记录，
-- 每行旧 product（SPU）的规格型号拆为一条 spec 记录（productId 指向组内保留产品）
INSERT INTO `spec` (`productId`, `specModel`, `createdAt`, `updatedAt`)
SELECT t.newPid, t.specModel, t.createdAt, t.updatedAt
FROM (
  SELECT p.*,
    (SELECT MIN(p2.id) FROM product p2 WHERE p2.categoryId = p.categoryId AND p2.name = p.name) AS newPid
  FROM product p
) t;

-- 建立 旧SPU(旧product.id) → 新spec.id 映射
CREATE TEMPORARY TABLE tmp_spu_map (
  old_pid BIGINT PRIMARY KEY,
  new_pid BIGINT,
  spec_id BIGINT
);
INSERT INTO tmp_spu_map (old_pid, new_pid, spec_id)
SELECT p.id, p.newPid, s.id
FROM (
  SELECT p.*,
    (SELECT MIN(p2.id) FROM product p2 WHERE p2.categoryId = p.categoryId AND p2.name = p.name) AS newPid
  FROM product p
) p
JOIN spec s
  ON s.productId = p.newPid AND s.specModel = p.specModel;

-- ============ B. unit 挂 spec ============
-- B1. 加 specId 列并回填（旧 unit.productId = 旧 SPU → 新 spec.id）
ALTER TABLE `unit` ADD COLUMN `specId` BIGINT NULL;
UPDATE unit u
JOIN tmp_spu_map m ON m.old_pid = u.productId
SET u.specId = m.spec_id;

-- B2. 解除 unit → product 外键与索引，删 productId 列，改唯一约束为 (specId, unitName)
ALTER TABLE `unit` DROP FOREIGN KEY `unit_productId_fkey`;
ALTER TABLE `unit` DROP INDEX `unit_productId_unitName_key`;
ALTER TABLE `unit` DROP INDEX `unit_productId_idx`;
ALTER TABLE `unit` DROP COLUMN `productId`;
ALTER TABLE `unit` MODIFY COLUMN `specId` BIGINT NOT NULL;
ALTER TABLE `unit` ADD UNIQUE INDEX `unit_specId_unitName_key`(`specId`, `unitName`);
ALTER TABLE `unit` ADD INDEX `unit_specId_idx`(`specId`);
ALTER TABLE `unit` ADD CONSTRAINT `unit_specId_fkey` FOREIGN KEY (`specId`) REFERENCES `spec`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ============ C. 品牌归并：建 spec_brand + 填充 ============
-- C1. 旧 brand → 新 brand（按 name 取最小 id）映射 + 规格/备注/排序/状态
CREATE TEMPORARY TABLE tmp_brand_map (
  old_brand_id BIGINT PRIMARY KEY,
  new_brand_id BIGINT,
  spec_id BIGINT,
  remark VARCHAR(500),
  sort_order INT,
  status INT
);
INSERT INTO tmp_brand_map (old_brand_id, new_brand_id, spec_id, remark, sort_order, status)
SELECT b.id,
  (SELECT MIN(b2.id) FROM brand b2 WHERE b2.name = b.name) AS new_brand_id,
  m.spec_id,
  b.remark,
  b.sortOrder,
  b.status
FROM brand b
JOIN tmp_spu_map m ON m.old_pid = b.productId;

-- C2. 创建 spec_brand 表
CREATE TABLE `spec_brand` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `specId` BIGINT NOT NULL,
  `brandId` BIGINT NOT NULL,
  `remark` VARCHAR(500) NOT NULL DEFAULT '',
  `sortOrder` INT NOT NULL DEFAULT 0,
  `status` INT NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `spec_brand_specId_brandId_key`(`specId`, `brandId`),
  INDEX `spec_brand_specId_idx`(`specId`),
  INDEX `spec_brand_brandId_idx`(`brandId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- C3. 填充 spec_brand（每个旧 brand 行 → 一条规格×品牌关联；同一 (specId,brandId) 去重保留最小 id）
INSERT INTO `spec_brand` (`specId`, `brandId`, `remark`, `sortOrder`, `status`, `createdAt`, `updatedAt`)
SELECT t.spec_id, t.new_brand_id, t.remark, t.sort_order, t.status, NOW(3), NOW(3)
FROM (
  SELECT spec_id, new_brand_id, remark, sort_order, status,
    ROW_NUMBER() OVER (PARTITION BY spec_id, new_brand_id ORDER BY old_brand_id) AS rn
  FROM tmp_brand_map
) t
WHERE t.rn = 1;

-- C4. 建立 旧brand.id → 新spec_brand.id 映射
CREATE TEMPORARY TABLE tmp_brand_sb_map (
  old_brand_id BIGINT PRIMARY KEY,
  spec_brand_id BIGINT
);
INSERT INTO tmp_brand_sb_map (old_brand_id, spec_brand_id)
SELECT bm.old_brand_id, sb.id
FROM tmp_brand_map bm
JOIN spec_brand sb
  ON sb.specId = bm.spec_id AND sb.brandId = bm.new_brand_id;

-- ============ D. 价格/换算/图片/宽表/单据/库存 brandId → specBrandId ============

-- D1. brand_unit_conversion
ALTER TABLE `brand_unit_conversion` ADD COLUMN `specBrandId` BIGINT NULL;
UPDATE `brand_unit_conversion` buc
JOIN tmp_brand_sb_map m ON m.old_brand_id = buc.brandId
SET buc.specBrandId = m.spec_brand_id;
ALTER TABLE `brand_unit_conversion` DROP FOREIGN KEY `brand_unit_conversion_brandId_fkey`;
ALTER TABLE `brand_unit_conversion` DROP INDEX `brand_unit_conversion_brandId_unitId_key`;
ALTER TABLE `brand_unit_conversion` DROP INDEX `brand_unit_conversion_brandId_idx`;
ALTER TABLE `brand_unit_conversion` DROP COLUMN `brandId`;
ALTER TABLE `brand_unit_conversion` MODIFY COLUMN `specBrandId` BIGINT NOT NULL;
ALTER TABLE `brand_unit_conversion` ADD UNIQUE INDEX `brand_unit_conversion_specBrandId_unitId_key`(`specBrandId`, `unitId`);
ALTER TABLE `brand_unit_conversion` ADD INDEX `brand_unit_conversion_specBrandId_idx`(`specBrandId`);
ALTER TABLE `brand_unit_conversion` ADD CONSTRAINT `brand_unit_conversion_specBrandId_fkey` FOREIGN KEY (`specBrandId`) REFERENCES `spec_brand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- D2. sale_price
ALTER TABLE `sale_price` ADD COLUMN `specBrandId` BIGINT NULL;
UPDATE `sale_price` sp
JOIN tmp_brand_sb_map m ON m.old_brand_id = sp.brandId
SET sp.specBrandId = m.spec_brand_id;
ALTER TABLE `sale_price` DROP FOREIGN KEY `sale_price_brandId_fkey`;
ALTER TABLE `sale_price` DROP INDEX `sale_price_brandId_unitId_priceTypeId_key`;
ALTER TABLE `sale_price` DROP INDEX `sale_price_brandId_unitId_idx`;
ALTER TABLE `sale_price` DROP COLUMN `brandId`;
ALTER TABLE `sale_price` MODIFY COLUMN `specBrandId` BIGINT NOT NULL;
ALTER TABLE `sale_price` ADD UNIQUE INDEX `sale_price_specBrandId_unitId_priceTypeId_key`(`specBrandId`, `unitId`, `priceTypeId`);
ALTER TABLE `sale_price` ADD INDEX `sale_price_specBrandId_unitId_idx`(`specBrandId`, `unitId`);
ALTER TABLE `sale_price` ADD CONSTRAINT `sale_price_specBrandId_fkey` FOREIGN KEY (`specBrandId`) REFERENCES `spec_brand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- D3. purchase_price
ALTER TABLE `purchase_price` ADD COLUMN `specBrandId` BIGINT NULL;
UPDATE `purchase_price` pp
JOIN tmp_brand_sb_map m ON m.old_brand_id = pp.brandId
SET pp.specBrandId = m.spec_brand_id;
ALTER TABLE `purchase_price` DROP FOREIGN KEY `purchase_price_brandId_fkey`;
ALTER TABLE `purchase_price` DROP INDEX `purchase_price_brandId_unitId_supplierId_key`;
ALTER TABLE `purchase_price` DROP INDEX `purchase_price_brandId_unitId_idx`;
ALTER TABLE `purchase_price` DROP COLUMN `brandId`;
ALTER TABLE `purchase_price` MODIFY COLUMN `specBrandId` BIGINT NOT NULL;
ALTER TABLE `purchase_price` ADD UNIQUE INDEX `purchase_price_specBrandId_unitId_supplierId_key`(`specBrandId`, `unitId`, `supplierId`);
ALTER TABLE `purchase_price` ADD INDEX `purchase_price_specBrandId_unitId_idx`(`specBrandId`, `unitId`);
ALTER TABLE `purchase_price` ADD CONSTRAINT `purchase_price_specBrandId_fkey` FOREIGN KEY (`specBrandId`) REFERENCES `spec_brand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- D4. product_image
ALTER TABLE `product_image` ADD COLUMN `specBrandId` BIGINT NULL;
UPDATE `product_image` pi
JOIN tmp_brand_sb_map m ON m.old_brand_id = pi.brandId
SET pi.specBrandId = m.spec_brand_id;
ALTER TABLE `product_image` DROP FOREIGN KEY `product_image_brandId_fkey`;
ALTER TABLE `product_image` DROP INDEX `product_image_brandId_idx`;
ALTER TABLE `product_image` DROP COLUMN `brandId`;
ALTER TABLE `product_image` MODIFY COLUMN `specBrandId` BIGINT NOT NULL;
ALTER TABLE `product_image` ADD INDEX `product_image_specBrandId_idx`(`specBrandId`);
ALTER TABLE `product_image` ADD CONSTRAINT `product_image_specBrandId_fkey` FOREIGN KEY (`specBrandId`) REFERENCES `spec_brand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- D5. product_sku_search 宽表：每「规格×品牌」一行
-- 注意：先 DROP brandId 唯一索引再更新 brandId（多行归并到同一全局品牌时避免唯一冲突）
ALTER TABLE `product_sku_search` ADD COLUMN `specId` BIGINT NULL, ADD COLUMN `specBrandId` BIGINT NULL;
UPDATE `product_sku_search` ps
JOIN tmp_brand_sb_map m ON m.old_brand_id = ps.brandId
SET ps.specBrandId = m.spec_brand_id;
UPDATE `product_sku_search` ps
JOIN spec_brand sb ON sb.id = ps.specBrandId
SET ps.specId = sb.specId;
UPDATE `product_sku_search` ps
JOIN tmp_spu_map m ON m.old_pid = ps.productId
SET ps.productId = m.new_pid;
ALTER TABLE `product_sku_search` DROP INDEX `product_sku_search_brandId_idx`;
UPDATE `product_sku_search` ps
JOIN spec_brand sb ON sb.id = ps.specBrandId
SET ps.brandId = sb.brandId;
ALTER TABLE `product_sku_search` ADD UNIQUE INDEX `product_sku_search_specBrandId_key`(`specBrandId`);
ALTER TABLE `product_sku_search` ADD INDEX `product_sku_search_specId_idx`(`specId`);

-- D6. document_lines：新增 specId + 品牌 id 归并
ALTER TABLE `document_lines` ADD COLUMN `specId` BIGINT NULL;
UPDATE `document_lines` dl
JOIN tmp_spu_map m ON m.old_pid = dl.productId
SET dl.specId = m.spec_id,
    dl.productId = m.new_pid;
UPDATE `document_lines` dl
JOIN tmp_brand_map bm ON bm.old_brand_id = dl.brandId
SET dl.brandId = bm.new_brand_id;
-- v14.0.1：未匹配到规格的历史孤儿行回填兜底 0（未关联规格），物理层 NOT NULL（统计基于 ID 聚合）
UPDATE `document_lines` SET `specId` = 0 WHERE `specId` IS NULL;
ALTER TABLE `document_lines` MODIFY COLUMN `specId` BIGINT NOT NULL;
ALTER TABLE `document_lines` ADD INDEX `document_lines_specId_idx`(`specId`);

-- D7. 库存/流水/入库/欠库 新增 spec 维度 + 品牌 id 归并
ALTER TABLE `inventory` ADD COLUMN `spec_id` BIGINT NULL;
UPDATE `inventory` i
JOIN tmp_brand_map bm ON bm.old_brand_id = i.brand_id
SET i.spec_id = bm.spec_id,
    i.brand_id = bm.new_brand_id;
ALTER TABLE `inventory` DROP INDEX `inventory_warehouse_id_brand_id_unit_id_key`;
ALTER TABLE `inventory` DROP INDEX `inventory_brand_id_unit_id_idx`;
ALTER TABLE `inventory` MODIFY COLUMN `spec_id` BIGINT NOT NULL;
ALTER TABLE `inventory` ADD UNIQUE INDEX `inventory_warehouse_id_spec_id_brand_id_unit_id_key`(`warehouse_id`, `spec_id`, `brand_id`, `unit_id`);
ALTER TABLE `inventory` ADD INDEX `inventory_spec_id_brand_id_unit_id_idx`(`spec_id`, `brand_id`, `unit_id`);

ALTER TABLE `inventory_ledger` ADD COLUMN `spec_id` BIGINT NULL;
UPDATE `inventory_ledger` il
JOIN tmp_brand_map bm ON bm.old_brand_id = il.brand_id
SET il.spec_id = bm.spec_id,
    il.brand_id = bm.new_brand_id;
ALTER TABLE `inventory_ledger` DROP INDEX `inventory_ledger_warehouse_id_brand_id_unit_id_idx`;
ALTER TABLE `inventory_ledger` MODIFY COLUMN `spec_id` BIGINT NOT NULL;
ALTER TABLE `inventory_ledger` ADD INDEX `inventory_ledger_warehouse_id_spec_id_brand_id_unit_id_idx`(`warehouse_id`, `spec_id`, `brand_id`, `unit_id`);

ALTER TABLE `inbound_lines` ADD COLUMN `spec_id` BIGINT NULL;
UPDATE `inbound_lines` il
JOIN tmp_brand_map bm ON bm.old_brand_id = il.brand_id
SET il.spec_id = bm.spec_id,
    il.brand_id = bm.new_brand_id;
-- v14.0.1：未匹配到规格的历史孤儿行回填兜底 0（未关联规格），物理层 NOT NULL（统计基于 ID 聚合）
UPDATE `inbound_lines` SET `spec_id` = 0 WHERE `spec_id` IS NULL;
ALTER TABLE `inbound_lines` MODIFY COLUMN `spec_id` BIGINT NOT NULL;

ALTER TABLE `backorders` ADD COLUMN `spec_id` BIGINT NULL;
UPDATE `backorders` bo
JOIN tmp_brand_map bm ON bm.old_brand_id = bo.brand_id
SET bo.spec_id = bm.spec_id,
    bo.brand_id = bm.new_brand_id;
-- v14.0.1：未匹配到规格的历史孤儿行回填兜底 0（未关联规格），物理层 NOT NULL（统计基于 ID 聚合）
UPDATE `backorders` SET `spec_id` = 0 WHERE `spec_id` IS NULL;
ALTER TABLE `backorders` MODIFY COLUMN `spec_id` BIGINT NOT NULL;
ALTER TABLE `backorders` DROP INDEX `backorders_warehouse_id_brand_id_unit_id_idx`;
ALTER TABLE `backorders` ADD INDEX `backorders_warehouse_id_spec_id_brand_id_unit_id_idx`(`warehouse_id`, `spec_id`, `brand_id`, `unit_id`);

-- ============ E. brand 归并为全局档案 ============
-- 先解除 brand → product 外键（product 后续删行时不 CASCADE 误删品牌）
ALTER TABLE `brand` DROP FOREIGN KEY `brand_productId_fkey`;
ALTER TABLE `brand` DROP INDEX `brand_productId_name_key`;
ALTER TABLE `brand` DROP INDEX `brand_productId_idx`;
ALTER TABLE `brand` DROP COLUMN `productId`;
-- 删除非保留品牌行（保留每 name 最小 id）
DELETE b FROM brand b
LEFT JOIN (
  SELECT MIN(id) AS keep_id FROM brand GROUP BY name
) k ON k.keep_id = b.id
WHERE k.keep_id IS NULL;
-- 删除 remark/sortOrder（迁至 spec_brand），name 全局唯一
ALTER TABLE `brand` DROP COLUMN `remark`;
ALTER TABLE `brand` DROP COLUMN `sortOrder`;
ALTER TABLE `brand` ADD UNIQUE INDEX `brand_name_key`(`name`);
ALTER TABLE `brand` ADD INDEX `brand_status_idx`(`status`);

-- ============ F. product 归并 + 结构收敛 ============
-- 此时 unit/brand 已解除对 product 的外键引用，删除非保留产品行无 CASCADE 副作用
DELETE p FROM product p
LEFT JOIN (
  SELECT MIN(id) AS keep_id FROM product GROUP BY categoryId, name
) k ON k.keep_id = p.id
WHERE k.keep_id IS NULL;

-- 移除 specModel 列（规格已入 spec 表），唯一约束改为 (categoryId, name)
ALTER TABLE `product` DROP INDEX `product_categoryId_name_specModel_key`;
ALTER TABLE `product` DROP COLUMN `specModel`;
ALTER TABLE `product` ADD UNIQUE INDEX `product_categoryId_name_key`(`categoryId`, `name`);

-- ============ G. 清理临时表 ============
DROP TEMPORARY TABLE IF EXISTS tmp_spu_map;
DROP TEMPORARY TABLE IF EXISTS tmp_brand_map;
DROP TEMPORARY TABLE IF EXISTS tmp_brand_sb_map;
