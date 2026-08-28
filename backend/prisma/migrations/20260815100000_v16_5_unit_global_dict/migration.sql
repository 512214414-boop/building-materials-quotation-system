-- v16.5 迁移：单位重构为全局字典（路线 A）
-- 变更性质（单位改为全局字典 {unitName 全局唯一}；新增 spec_unit 承载规格级基准/显示标记）：
--   1. 新建 spec_unit 表（specId, unitId, isBase, isDisplay）
--   2. 同名 unit 归一为一条全局记录（保留最小 id，其余引用改指向保留 id）
--   3. brand_unit_conversion / sale_price / purchase_price / product_sku_search / document_lines
--      的 unitId 全部指向归一后的全局 unit id（多表 UPDATE + JOIN）
--   4. unit 表删除 specId/isBase/isDisplay 列（含外键 unit_specId_fkey），
--      加 updatedAt，加 @@unique([unitName])
--   5. 填 spec_unit（从 brand_unit_conversion 反推 spec-unit 组合；每规格首个单位设为基础+显示）
--
-- 注意：原 unit 表的 unit_productId_fkey 为历史孤儿外键（productId 列早已删除），本迁移忽略。

-- ============ A. 创建 spec_unit 表 ============
CREATE TABLE `spec_unit` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `specId` BIGINT NOT NULL,
  `unitId` BIGINT NOT NULL,
  `isBase` TINYINT(1) NOT NULL DEFAULT 0,
  `isDisplay` TINYINT(1) NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `spec_unit_specId_unitId_key` (`specId`, `unitId`),
  INDEX `spec_unit_specId_idx` (`specId`),
  INDEX `spec_unit_unitId_idx` (`unitId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `spec_unit`
  ADD CONSTRAINT `spec_unit_spec_fk` FOREIGN KEY (`specId`) REFERENCES `spec` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `spec_unit_unit_fk` FOREIGN KEY (`unitId`) REFERENCES `unit` (`id`) ON DELETE CASCADE;

-- ============ B. 同名 unit 归一（保留最小 id，其余引用改指向保留 id） ============
UPDATE `brand_unit_conversion` buc
  JOIN `unit` u ON buc.`unitId` = u.`id`
  JOIN `unit` keep ON keep.`unitName` = u.`unitName` AND keep.`id` = (
    SELECT MIN(`id`) FROM `unit` u2 WHERE u2.`unitName` = u.`unitName`
  )
  SET buc.`unitId` = keep.`id`;

UPDATE `sale_price` sp
  JOIN `unit` u ON sp.`unitId` = u.`id`
  JOIN `unit` keep ON keep.`unitName` = u.`unitName` AND keep.`id` = (
    SELECT MIN(`id`) FROM `unit` u2 WHERE u2.`unitName` = u.`unitName`
  )
  SET sp.`unitId` = keep.`id`;

UPDATE `purchase_price` pp
  JOIN `unit` u ON pp.`unitId` = u.`id`
  JOIN `unit` keep ON keep.`unitName` = u.`unitName` AND keep.`id` = (
    SELECT MIN(`id`) FROM `unit` u2 WHERE u2.`unitName` = u.`unitName`
  )
  SET pp.`unitId` = keep.`id`;

UPDATE `product_sku_search` s
  JOIN `unit` u ON s.`defaultUnitId` = u.`id`
  JOIN `unit` keep ON keep.`unitName` = u.`unitName` AND keep.`id` = (
    SELECT MIN(`id`) FROM `unit` u2 WHERE u2.`unitName` = u.`unitName`
  )
  SET s.`defaultUnitId` = keep.`id`;

UPDATE `document_lines` dl
  JOIN `unit` u ON dl.`unitId` = u.`id`
  JOIN `unit` keep ON keep.`unitName` = u.`unitName` AND keep.`id` = (
    SELECT MIN(`id`) FROM `unit` u2 WHERE u2.`unitName` = u.`unitName`
  )
  SET dl.`unitId` = keep.`id`
  WHERE dl.`unitId` IS NOT NULL;

-- ============ C. unit 表结构变更 ============
DELETE FROM `unit`
  WHERE `id` NOT IN (
    SELECT `keepId` FROM (
      SELECT MIN(`id`) AS keepId FROM `unit` GROUP BY `unitName`
    ) AS t
  );

ALTER TABLE `unit` DROP FOREIGN KEY `unit_specId_fkey`;
ALTER TABLE `unit` DROP COLUMN `specId`;
ALTER TABLE `unit` DROP COLUMN `isBase`;
ALTER TABLE `unit` DROP COLUMN `isDisplay`;
ALTER TABLE `unit` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
ALTER TABLE `unit` ADD CONSTRAINT `unit_unitName_key` UNIQUE (`unitName`);

-- ============ D. 填 spec_unit（从 brand_unit_conversion 反推 spec-unit 组合） ============
INSERT INTO `spec_unit` (`specId`, `unitId`, `isBase`, `isDisplay`, `createdAt`)
SELECT DISTINCT sb.`specId`, buc.`unitId`, 0, 0, NOW()
FROM `brand_unit_conversion` buc
JOIN `spec_brand` sb ON sb.`id` = buc.`specBrandId`
ON DUPLICATE KEY UPDATE `specId` = VALUES(`specId`);

-- 每规格首个单位设为该规格的基础单位 + 默认显示单位（兜底，确保每规格有且仅有一个）
UPDATE `spec_unit` SET `isBase` = 0, `isDisplay` = 0;
UPDATE `spec_unit` su JOIN (
  SELECT `specId`, MIN(`id`) AS minId FROM `spec_unit` GROUP BY `specId`
) m ON su.`specId` = m.`specId` AND su.`id` = m.minId
SET su.`isBase` = 1, su.`isDisplay` = 1;
