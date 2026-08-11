-- v9.0 migration: supplier 独立表 + brand_unit_conversion + purchase_price.supplierId + unit 移除 conversionRate

-- Step 1: 创建新 supplier 表
CREATE TABLE `supplier` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(200) NOT NULL,
    `contacts` JSON NULL,
    `businessScope` VARCHAR(500) NULL,
    `address` VARCHAR(500) NULL,
    `remark` TEXT NULL,
    `status` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    INDEX `supplier_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Step 2: 从旧 suppliers 表迁移数据到新 supplier 表
-- contacts 用 JSON 格式：如果旧表有 contact 或 phone，组合为 JSON 数组
INSERT INTO `supplier` (`id`, `name`, `contacts`, `businessScope`, `address`, `remark`, `status`, `createdAt`, `updatedAt`)
SELECT
    `id`,
    `name`,
    CASE
        WHEN `contact` IS NOT NULL OR `phone` IS NOT NULL
        THEN JSON_ARRAY(
            CASE
                WHEN `contact` IS NOT NULL AND `phone` IS NOT NULL
                THEN JSON_OBJECT('name', `contact`, 'method', '电话', 'value', `phone`)
                WHEN `phone` IS NOT NULL
                THEN JSON_OBJECT('name', '', 'method', '电话', 'value', `phone`)
                WHEN `contact` IS NOT NULL
                THEN JSON_OBJECT('name', `contact`, 'method', '', 'value', '')
                ELSE NULL
            END
        )
        ELSE NULL
    END,
    NULL,  -- businessScope: 旧表无此字段
    `address`,
    `note`,
    CASE WHEN `status` = 'active' THEN 1 ELSE 0 END,
    `createdAt`,
    COALESCE(`updatedAt`, `createdAt`)
FROM `suppliers`;

-- Step 3: 处理 purchase_price 表：先添加 supplierId 列（可空）
ALTER TABLE `purchase_price` ADD COLUMN `supplierId` BIGINT NULL;

-- Step 4: 根据 supplierName 在新 supplier 表中查找或创建对应 ID，填入 purchase_price.supplierId
-- 对于已有 supplierName 的 purchase_price，先确保 supplier 表中有对应记录
INSERT IGNORE INTO `supplier` (`name`, `status`, `createdAt`, `updatedAt`)
SELECT DISTINCT `supplierName`, 1, NOW(), NOW()
FROM `purchase_price`
WHERE `supplierName` IS NOT NULL AND `supplierName` != ''
  AND `supplierName` NOT IN (SELECT `name` FROM `supplier`);

-- Step 5: 用 supplier 表的 id 填充 purchase_price.supplierId
UPDATE `purchase_price` pp
INNER JOIN `supplier` s ON s.`name` = pp.`supplierName`
SET pp.`supplierId` = s.`id`;

-- Step 6: purchase_price.supplierId 设为 NOT NULL（此时所有行应已有值）
ALTER TABLE `purchase_price` MODIFY COLUMN `supplierId` BIGINT NOT NULL;

-- Step 7: 添加 isDefault 字段
ALTER TABLE `purchase_price` ADD COLUMN `isDefault` BOOLEAN NOT NULL DEFAULT false;

-- Step 8: 删除旧唯一约束和索引
ALTER TABLE `purchase_price` DROP INDEX `purchase_price_brandId_unitId_supplierName_key`;
ALTER TABLE `purchase_price` DROP INDEX `purchase_price_supplierName_idx`;

-- Step 9: 删除 supplierName 列
ALTER TABLE `purchase_price` DROP COLUMN `supplierName`;

-- Step 10: 添加新唯一约束和索引
CREATE UNIQUE INDEX `purchase_price_brandId_unitId_supplierId_key` ON `purchase_price`(`brandId`, `unitId`, `supplierId`);
CREATE INDEX `purchase_price_supplierId_idx` ON `purchase_price`(`supplierId`);

-- Step 11: 添加 purchase_price → supplier 外键
ALTER TABLE `purchase_price` ADD CONSTRAINT `purchase_price_supplierId_fkey`
    FOREIGN KEY (`supplierId`) REFERENCES `supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 12: 创建 brand_unit_conversion 表
CREATE TABLE `brand_unit_conversion` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `brandId` BIGINT NOT NULL,
    `unitId` BIGINT NOT NULL,
    `conversionRate` DECIMAL(10, 4) NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),

    INDEX `brand_unit_conversion_brandId_idx`(`brandId`),
    INDEX `brand_unit_conversion_unitId_idx`(`unitId`),
    UNIQUE INDEX `brand_unit_conversion_brandId_unitId_key`(`brandId`, `unitId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Step 13: 从 unit.conversionRate 迁移数据到 brand_unit_conversion
-- 每个 brand + unit 组合都需要一条 conversion 记录
-- 同一 SPU 下所有品牌共享同一单位列表，但换算系数按品牌独立
-- v8.0 中 unit.conversionRate 是所有品牌共享的，迁移时每个 brand + unit 组合使用相同的 conversionRate
INSERT INTO `brand_unit_conversion` (`brandId`, `unitId`, `conversionRate`, `createdAt`, `updatedAt`)
SELECT b.`id`, u.`id`, u.`conversionRate`, NOW(), NOW()
FROM `brand` b
INNER JOIN `unit` u ON u.`productId` = b.`productId`;

-- Step 14: 添加 brand_unit_conversion 外键
ALTER TABLE `brand_unit_conversion` ADD CONSTRAINT `brand_unit_conversion_brandId_fkey`
    FOREIGN KEY (`brandId`) REFERENCES `brand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `brand_unit_conversion` ADD CONSTRAINT `brand_unit_conversion_unitId_fkey`
    FOREIGN KEY (`unitId`) REFERENCES `unit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 15: unit 表移除 conversionRate 列
ALTER TABLE `unit` DROP COLUMN `conversionRate`;

-- Step 16: 更新 allocation_lines / cost_lines 外键（从 suppliers → supplier）
ALTER TABLE `allocation_lines` DROP FOREIGN KEY `allocation_lines_source_id_fkey`;
ALTER TABLE `cost_lines` DROP FOREIGN KEY `cost_lines_source_id_fkey`;

ALTER TABLE `allocation_lines` ADD CONSTRAINT `allocation_lines_source_id_fkey`
    FOREIGN KEY (`source_id`) REFERENCES `supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `cost_lines` ADD CONSTRAINT `cost_lines_source_id_fkey`
    FOREIGN KEY (`source_id`) REFERENCES `supplier`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 17: 删除旧 suppliers 表
DROP TABLE `suppliers`;
