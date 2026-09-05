-- v9.2 迁移：建立全局价格类型字典表（交互优先准则 ask1）
-- 变更性质：
--   1. 新增 price_type 字典表（全局公用）
--   2. sale_price.priceType 字符串 → priceTypeId BigInt 外键
--   3. 售价矩阵行 = 全局所有价格类型（无论单位多少、有无进价，都有所有价格类型行）

-- ============== 1. 创建 price_type 字典表 ==============
CREATE TABLE `price_type` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(50) NOT NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `status` INTEGER NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `price_type_name_key`(`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============== 2. 从 sale_price.priceType 字符串去重提取，插入字典 ==============
INSERT INTO `price_type` (`name`, `sortOrder`, `status`, `createdAt`, `updatedAt`)
SELECT DISTINCT `priceType`, 0, 1, NOW(3), NOW(3)
FROM `sale_price`
WHERE `priceType` IS NOT NULL AND `priceType` <> ''
ORDER BY `priceType`;

-- ============== 3. sale_price 新增 priceTypeId 列（先允许 NULL，迁移数据后设为 NOT NULL） ==============
ALTER TABLE `sale_price`
  ADD COLUMN `priceTypeId` BIGINT NULL;

-- ============== 4. 根据 priceType 字符串反查 price_type.id 填充 priceTypeId ==============
UPDATE `sale_price` sp
INNER JOIN `price_type` pt ON sp.`priceType` = pt.`name`
SET sp.`priceTypeId` = pt.`id`
WHERE sp.`priceTypeId` IS NULL;

-- ============== 5. 兜底：仍未填充的行（理论不存在），删除 ==============
DELETE FROM `sale_price` WHERE `priceTypeId` IS NULL;

-- ============== 6. 设为 NOT NULL ==============
ALTER TABLE `sale_price`
  MODIFY COLUMN `priceTypeId` BIGINT NOT NULL;

-- ============== 7. 添加外键约束 ==============
ALTER TABLE `sale_price`
  ADD CONSTRAINT `sale_price_priceTypeId_fkey`
  FOREIGN KEY (`priceTypeId`) REFERENCES `price_type`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ============== 8. 添加中文 COMMENT ==============
ALTER TABLE `sale_price`
  MODIFY COLUMN `priceTypeId` BIGINT NOT NULL COMMENT '价格类型ID外键（关联 price_type 表，v9.2 替代原 priceType 字符串）';

ALTER TABLE `price_type`
  MODIFY COLUMN `name` VARCHAR(50) NOT NULL COMMENT '价格类型名称（如零售价、批发价、工程价）',
  MODIFY COLUMN `sortOrder` INTEGER NOT NULL DEFAULT 0 COMMENT '排序',
  MODIFY COLUMN `status` INTEGER NOT NULL DEFAULT 1 COMMENT '状态 1启用 0禁用';

-- ============== 9. 添加索引 ==============
CREATE INDEX `sale_price_brandId_unitId_priceTypeId_idx` ON `sale_price`(`brandId`, `unitId`, `priceTypeId`);
CREATE INDEX `sale_price_priceTypeId_idx` ON `sale_price`(`priceTypeId`);

-- ============== 10. 添加唯一约束 ==============
-- 原 @@unique([brandId, unitId, priceType]) 已存在，先删除再新建 priceTypeId 版本
ALTER TABLE `sale_price` DROP INDEX `sale_price_brandId_unitId_priceType_key`;
ALTER TABLE `sale_price` ADD UNIQUE INDEX `sale_price_brandId_unitId_priceTypeId_key`(`brandId`, `unitId`, `priceTypeId`);

-- ============== 11. 删除原 priceType 字符串列 ==============
ALTER TABLE `sale_price` DROP COLUMN `priceType`;

-- ============== 12. 添加默认字典数据（如字典为空时） ==============
INSERT INTO `price_type` (`name`, `sortOrder`, `status`, `createdAt`, `updatedAt`)
SELECT * FROM (
  SELECT '零售价' AS name, 1 AS sortOrder, 1 AS status, NOW(3) AS createdAt, NOW(3) AS updatedAt
  UNION SELECT '批发价', 2, 1, NOW(3), NOW(3)
  UNION SELECT '工程价', 3, 1, NOW(3), NOW(3)
) AS defaults
WHERE NOT EXISTS (SELECT 1 FROM `price_type` LIMIT 1);
