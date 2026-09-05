-- v22.0 迁移：规格挂在品牌下（product → brand → spec），合并 spec_brand 进 spec
-- ============================================================
-- 目标模型（对齐 文档可视化/js/data.js）：
--   product_brand(productId, brandId) — 产品售卖哪些品牌
--   spec(productId, brandId, specModel, remark) — UNIQUE(productId, brandId, specModel)
--   每条旧 spec_brand → 一条 spec；保留 spec_brand.id 作为 spec.id（FK 连续）
--   子表 specBrandId → specId；删除 spec_brand
--   spec_unit 从容器 spec（spec_brand.specId）复制到每条新 spec（spec_brand.id）
--
-- 执行顺序：
--   A. 建 product_brand + 回填
--   B. 复制 spec_unit 到 spec_brand.id
--   C. 更新 document_lines / 库存类业务表 specId
--   D. 解除子表 → spec_brand 外键，重命名 specBrandId → specId
--   E. 重建 spec 表（容器 spec 删除，spec_brand 行升格为 spec）
--   F. 宽表 product_sku_search 收敛 specId，删 specBrandId
--   G. 删 spec_brand
-- ============================================================

-- ============ 0. 清理孤儿规格（产品已删但 spec/spec_brand 残留，会触发 product_brand FK 1452）============
DELETE sb FROM `spec_brand` sb
JOIN `spec` s ON s.`id` = sb.`specId`
LEFT JOIN `product` p ON p.`id` = s.`productId`
WHERE p.`id` IS NULL;

DELETE s FROM `spec` s
LEFT JOIN `product` p ON p.`id` = s.`productId`
WHERE p.`id` IS NULL;

-- ============ A. product_brand ============
CREATE TABLE `product_brand` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `productId` BIGINT NOT NULL,
  `brandId` BIGINT NOT NULL,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `status` INT NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `product_brand_productId_brandId_key`(`productId`, `brandId`),
  INDEX `product_brand_productId_idx`(`productId`),
  INDEX `product_brand_brandId_idx`(`brandId`),
  CONSTRAINT `product_brand_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `product_brand_brandId_fkey` FOREIGN KEY (`brandId`) REFERENCES `brand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `product_brand` (`productId`, `brandId`, `sortOrder`, `status`, `createdAt`, `updatedAt`)
SELECT s.`productId`, sb.`brandId`, MIN(sb.`sortOrder`), MIN(sb.`status`), MIN(sb.`createdAt`), NOW(3)
FROM `spec_brand` sb
JOIN `spec` s ON s.`id` = sb.`specId`
JOIN `product` p ON p.`id` = s.`productId`
GROUP BY s.`productId`, sb.`brandId`;

-- ============ B. spec_unit：容器 spec → 每条 spec_brand（新 spec id） ============
-- 复制目标 specId = spec_brand.id，此时尚未写入 spec 表，须先解除 FK
ALTER TABLE `spec_unit` DROP FOREIGN KEY `spec_unit_spec_fk`;

INSERT INTO `spec_unit` (`specId`, `unitId`, `isBase`, `isDisplay`, `createdAt`)
SELECT sb.`id`, su.`unitId`, su.`isBase`, su.`isDisplay`, su.`createdAt`
FROM `spec_brand` sb
JOIN `spec_unit` su ON su.`specId` = sb.`specId`
WHERE NOT EXISTS (
  SELECT 1 FROM `spec_unit` x WHERE x.`specId` = sb.`id` AND x.`unitId` = su.`unitId`
);

-- ============ C. 业务表 specId 对齐（旧容器 specId + brandId → spec_brand.id） ============
UPDATE `document_lines` dl
JOIN `spec_brand` sb ON sb.`specId` = dl.`specId` AND sb.`brandId` = dl.`brandId`
SET dl.`specId` = sb.`id`
WHERE dl.`specId` IS NOT NULL AND dl.`brandId` IS NOT NULL;

UPDATE `inventory` i
JOIN `spec_brand` sb ON sb.`specId` = i.`spec_id` AND sb.`brandId` = i.`brand_id`
SET i.`spec_id` = sb.`id`;

UPDATE `inventory_ledger` il
JOIN `spec_brand` sb ON sb.`specId` = il.`spec_id` AND sb.`brandId` = il.`brand_id`
SET il.`spec_id` = sb.`id`;

UPDATE `inbound_lines` il
JOIN `spec_brand` sb ON sb.`specId` = il.`spec_id` AND sb.`brandId` = il.`brand_id`
SET il.`spec_id` = sb.`id`;

UPDATE `backorders` bo
JOIN `spec_brand` sb ON sb.`specId` = bo.`spec_id` AND sb.`brandId` = bo.`brand_id`
SET bo.`spec_id` = sb.`id`;

UPDATE `purchase_inbound_lines` pil
JOIN `spec_brand` sb ON sb.`specId` = pil.`spec_id` AND sb.`brandId` = pil.`brand_id`
SET pil.`spec_id` = sb.`id`;

-- ============ D. 解除子表 → spec_brand 外键（值已是 spec_brand.id，稍后改列名） ============
ALTER TABLE `brand_unit_conversion` DROP FOREIGN KEY `brand_unit_conversion_specBrandId_fkey`;
ALTER TABLE `sale_price` DROP FOREIGN KEY `sale_price_specBrandId_fkey`;
ALTER TABLE `purchase_price` DROP FOREIGN KEY `purchase_price_specBrandId_fkey`;
ALTER TABLE `product_image` DROP FOREIGN KEY `product_image_specBrandId_fkey`;
ALTER TABLE `sale_spec_point` DROP FOREIGN KEY `sale_spec_point_specBrandId_fkey`;
ALTER TABLE `purchase_spec_point` DROP FOREIGN KEY `purchase_spec_point_specBrandId_fkey`;

-- ============ E. 重建 spec（staging → swap） ============
CREATE TABLE `spec_v22` (
  `id` BIGINT NOT NULL,
  `productId` BIGINT NOT NULL,
  `brandId` BIGINT NOT NULL,
  `specModel` VARCHAR(200) NOT NULL,
  `remark` VARCHAR(500) NOT NULL DEFAULT '',
  `sortOrder` INT NOT NULL DEFAULT 0,
  `status` INT NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL,
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `spec_v22_productId_brandId_specModel_key`(`productId`, `brandId`, `specModel`),
  INDEX `spec_v22_productId_brandId_idx`(`productId`, `brandId`),
  INDEX `spec_v22_productId_idx`(`productId`),
  INDEX `spec_v22_brandId_idx`(`brandId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- spec_brand 行 → 新 spec（id 保留）
INSERT INTO `spec_v22` (`id`, `productId`, `brandId`, `specModel`, `remark`, `sortOrder`, `status`, `createdAt`, `updatedAt`)
SELECT sb.`id`, s.`productId`, sb.`brandId`, s.`specModel`, sb.`remark`, sb.`sortOrder`, sb.`status`, sb.`createdAt`, sb.`updatedAt`
FROM `spec_brand` sb
JOIN `spec` s ON s.`id` = sb.`specId`;

-- 无 spec_brand 的孤儿容器 spec：挂默认品牌「普通品牌」
INSERT INTO `product_brand` (`productId`, `brandId`, `sortOrder`, `status`, `createdAt`, `updatedAt`)
SELECT s.`productId`, b.`id`, 0, 1, s.`createdAt`, NOW(3)
FROM `spec` s
CROSS JOIN (SELECT `id` FROM `brand` WHERE `name` = '普通品牌' LIMIT 1) b
WHERE NOT EXISTS (SELECT 1 FROM `spec_brand` sb WHERE sb.`specId` = s.`id`)
  AND NOT EXISTS (SELECT 1 FROM `product_brand` pb WHERE pb.`productId` = s.`productId` AND pb.`brandId` = b.`id`);

INSERT INTO `spec_v22` (`id`, `productId`, `brandId`, `specModel`, `remark`, `sortOrder`, `status`, `createdAt`, `updatedAt`)
SELECT s.`id`, s.`productId`, b.`id`, s.`specModel`, '', 0, 1, s.`createdAt`, s.`updatedAt`
FROM `spec` s
CROSS JOIN (SELECT `id` FROM `brand` WHERE `name` = '普通品牌' LIMIT 1) b
WHERE NOT EXISTS (SELECT 1 FROM `spec_brand` sb WHERE sb.`specId` = s.`id`)
  AND NOT EXISTS (SELECT 1 FROM `spec_v22` v WHERE v.`id` = s.`id`);

-- ID 冲突：容器 spec.id 与某 spec_brand.id 撞号但非同一行 → 临时挪走阻塞容器
UPDATE `spec` s
JOIN `spec_brand` sb ON sb.`id` = s.`id` AND sb.`specId` <> s.`id`
SET s.`id` = s.`id` + 9000000000000000;

-- 删除容器 spec 的 spec_unit（已复制到 spec_brand.id）
DELETE su FROM `spec_unit` su
JOIN `spec` s ON s.`id` = su.`specId`
WHERE EXISTS (SELECT 1 FROM `spec_brand` sb WHERE sb.`specId` = s.`id`);

-- 删除旧 spec 表（spec_brand→spec 外键若仍存在则先解除）
SET @fk := (
  SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'spec_brand'
    AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME LIKE '%specId%'
  LIMIT 1
);
SET @drop_fk := IF(@fk IS NOT NULL, CONCAT('ALTER TABLE `spec_brand` DROP FOREIGN KEY `', @fk, '`'), 'SELECT 1');
PREPARE stmt FROM @drop_fk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

DELETE FROM `spec`;

DROP TABLE `spec`;

RENAME TABLE `spec_v22` TO `spec`;

ALTER TABLE `spec`
  ADD CONSTRAINT `spec_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `spec_brandId_fkey` FOREIGN KEY (`brandId`) REFERENCES `brand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- spec_unit 重新挂 FK（B 步已 DROP spec_unit_spec_fk）
ALTER TABLE `spec_unit`
  ADD CONSTRAINT `spec_unit_specId_fkey` FOREIGN KEY (`specId`) REFERENCES `spec`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ============ F. 子表 specBrandId → specId ============
ALTER TABLE `brand_unit_conversion`
  CHANGE COLUMN `specBrandId` `specId` BIGINT NOT NULL,
  DROP INDEX `brand_unit_conversion_specBrandId_unitId_key`,
  DROP INDEX `brand_unit_conversion_specBrandId_idx`,
  ADD UNIQUE INDEX `brand_unit_conversion_specId_unitId_key`(`specId`, `unitId`),
  ADD INDEX `brand_unit_conversion_specId_idx`(`specId`),
  ADD CONSTRAINT `brand_unit_conversion_specId_fkey` FOREIGN KEY (`specId`) REFERENCES `spec`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `sale_price`
  CHANGE COLUMN `specBrandId` `specId` BIGINT NOT NULL,
  DROP INDEX `sale_price_specBrandId_unitId_priceTypeId_key`,
  DROP INDEX `sale_price_specBrandId_unitId_idx`,
  ADD UNIQUE INDEX `sale_price_specId_unitId_priceTypeId_key`(`specId`, `unitId`, `priceTypeId`),
  ADD INDEX `sale_price_specId_unitId_idx`(`specId`, `unitId`),
  ADD CONSTRAINT `sale_price_specId_fkey` FOREIGN KEY (`specId`) REFERENCES `spec`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `purchase_price`
  CHANGE COLUMN `specBrandId` `specId` BIGINT NOT NULL,
  DROP INDEX `purchase_price_specBrandId_unitId_supplierId_key`,
  DROP INDEX `purchase_price_specBrandId_unitId_idx`,
  ADD UNIQUE INDEX `purchase_price_specId_unitId_supplierId_key`(`specId`, `unitId`, `supplierId`),
  ADD INDEX `purchase_price_specId_unitId_idx`(`specId`, `unitId`),
  ADD CONSTRAINT `purchase_price_specId_fkey` FOREIGN KEY (`specId`) REFERENCES `spec`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `product_image`
  CHANGE COLUMN `specBrandId` `specId` BIGINT NOT NULL,
  DROP INDEX `product_image_specBrandId_idx`,
  ADD INDEX `product_image_specId_idx`(`specId`),
  ADD CONSTRAINT `product_image_specId_fkey` FOREIGN KEY (`specId`) REFERENCES `spec`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `sale_spec_point`
  CHANGE COLUMN `specBrandId` `specId` BIGINT NOT NULL,
  DROP INDEX `sale_spec_point_specBrandId_priceTypeId_key`,
  DROP INDEX `sale_spec_point_specBrandId_idx`,
  ADD UNIQUE INDEX `sale_spec_point_specId_priceTypeId_key`(`specId`, `priceTypeId`),
  ADD INDEX `sale_spec_point_specId_idx`(`specId`),
  ADD CONSTRAINT `sale_spec_point_specId_fkey` FOREIGN KEY (`specId`) REFERENCES `spec`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `purchase_spec_point`
  CHANGE COLUMN `specBrandId` `specId` BIGINT NOT NULL,
  DROP INDEX `purchase_spec_point_specBrandId_supplierId_key`,
  DROP INDEX `purchase_spec_point_specBrandId_idx`,
  ADD UNIQUE INDEX `purchase_spec_point_specId_supplierId_key`(`specId`, `supplierId`),
  ADD INDEX `purchase_spec_point_specId_idx`(`specId`),
  ADD CONSTRAINT `purchase_spec_point_specId_fkey` FOREIGN KEY (`specId`) REFERENCES `spec`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ============ G. product_sku_search：specId = 旧 specBrandId，删 specBrandId ============
UPDATE `product_sku_search` SET `specId` = `specBrandId`;

ALTER TABLE `product_sku_search`
  DROP INDEX `product_sku_search_specBrandId_key`,
  DROP COLUMN `specBrandId`,
  ADD UNIQUE INDEX `product_sku_search_specId_key`(`specId`);

-- ============ H. 删除 spec_brand ============
ALTER TABLE `spec_brand` DROP FOREIGN KEY `spec_brand_brandId_fkey`;
DROP TABLE `spec_brand`;
