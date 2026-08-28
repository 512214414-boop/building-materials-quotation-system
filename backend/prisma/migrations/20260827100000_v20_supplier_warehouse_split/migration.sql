-- v20: 供应商 / 库房拆表（联系信息、地址、经营品类、区位、负责人）

CREATE TABLE `address_type` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(50) NOT NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `status` INTEGER NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `address_type_name_key`(`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `address_type` (`name`, `sortOrder`, `status`, `updatedAt`) VALUES
  ('公司地址', 1, 1, NOW(3)),
  ('库房地址', 2, 1, NOW(3)),
  ('门店地址', 3, 1, NOW(3)),
  ('办公地址', 4, 1, NOW(3));

CREATE TABLE `supplier_contact` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `supplierId` BIGINT NOT NULL,
  `name` VARCHAR(100) NOT NULL DEFAULT '',
  `method` VARCHAR(50) NOT NULL DEFAULT '',
  `value` VARCHAR(200) NOT NULL DEFAULT '',
  `isDefault` BOOLEAN NOT NULL DEFAULT false,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `supplier_contact_supplierId_idx`(`supplierId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `supplier_address` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `supplierId` BIGINT NOT NULL,
  `addressTypeId` BIGINT NULL,
  `addressText` VARCHAR(500) NOT NULL,
  `lng` DECIMAL(10, 7) NULL,
  `lat` DECIMAL(10, 7) NULL,
  `coordSource` ENUM('geocoded', 'manual') NULL,
  `isDefault` BOOLEAN NOT NULL DEFAULT false,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `remark` VARCHAR(200) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `supplier_address_supplierId_idx`(`supplierId`),
  INDEX `supplier_address_addressTypeId_idx`(`addressTypeId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `supplier_business_category` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `supplierId` BIGINT NOT NULL,
  `categoryId` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `supplier_business_category_supplierId_categoryId_key`(`supplierId`, `categoryId`),
  INDEX `supplier_business_category_supplierId_idx`(`supplierId`),
  INDEX `supplier_business_category_categoryId_idx`(`categoryId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `warehouse_zone` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `warehouseId` BIGINT NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `warehouse_zone_warehouseId_idx`(`warehouseId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `warehouse_contact` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `warehouseId` BIGINT NOT NULL,
  `name` VARCHAR(100) NOT NULL DEFAULT '',
  `method` VARCHAR(50) NOT NULL DEFAULT '',
  `value` VARCHAR(200) NOT NULL DEFAULT '',
  `isDefault` BOOLEAN NOT NULL DEFAULT false,
  `sortOrder` INTEGER NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `warehouse_contact_warehouseId_idx`(`warehouseId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 迁移 supplier.contacts JSON → supplier_contact（MySQL JSON_TABLE）
INSERT INTO `supplier_contact` (`supplierId`, `name`, `method`, `value`, `isDefault`, `sortOrder`, `updatedAt`)
SELECT
  s.id,
  COALESCE(jt.contact_name, ''),
  COALESCE(jt.contact_method, ''),
  COALESCE(jt.contact_value, ''),
  COALESCE(jt.is_default, 0) = 1,
  COALESCE(jt.row_ord, 0),
  NOW(3)
FROM `supplier` s
JOIN JSON_TABLE(
  COALESCE(s.contacts, JSON_ARRAY()),
  '$[*]' COLUMNS (
    row_ord FOR ORDINALITY,
    contact_name VARCHAR(100) PATH '$.name',
    contact_method VARCHAR(50) PATH '$.method',
    contact_value VARCHAR(200) PATH '$.value',
    is_default BOOLEAN PATH '$.isDefault'
  )
) jt
WHERE s.contacts IS NOT NULL AND JSON_LENGTH(s.contacts) > 0;

-- 迁移 supplier.address → supplier_address（默认公司地址类型）
INSERT INTO `supplier_address` (`supplierId`, `addressTypeId`, `addressText`, `isDefault`, `sortOrder`, `updatedAt`)
SELECT
  s.id,
  (SELECT id FROM `address_type` WHERE name = '公司地址' LIMIT 1),
  TRIM(s.address),
  true,
  0,
  NOW(3)
FROM `supplier` s
WHERE s.address IS NOT NULL AND TRIM(s.address) <> '';

-- 迁移 warehouse.zones JSON → warehouse_zone
INSERT INTO `warehouse_zone` (`warehouseId`, `name`, `sortOrder`, `updatedAt`)
SELECT
  w.id,
  COALESCE(jt.zone_name, ''),
  COALESCE(jt.sort_order, jt.row_ord - 1),
  NOW(3)
FROM `warehouse` w
JOIN JSON_TABLE(
  COALESCE(w.zones, JSON_ARRAY()),
  '$[*]' COLUMNS (
    row_ord FOR ORDINALITY,
    zone_name VARCHAR(100) PATH '$.name',
    sort_order INT PATH '$.sortOrder'
  )
) jt
WHERE w.zones IS NOT NULL AND JSON_LENGTH(w.zones) > 0;

-- 迁移 warehouse.manager → warehouse_contact
INSERT INTO `warehouse_contact` (`warehouseId`, `name`, `method`, `value`, `isDefault`, `sortOrder`, `updatedAt`)
SELECT
  w.id,
  TRIM(w.manager),
  '电话',
  '',
  true,
  0,
  NOW(3)
FROM `warehouse` w
WHERE w.manager IS NOT NULL AND TRIM(w.manager) <> '';

ALTER TABLE `supplier` DROP COLUMN `contacts`, DROP COLUMN `businessScope`, DROP COLUMN `address`;

ALTER TABLE `warehouse` DROP COLUMN `zones`, DROP COLUMN `manager`;
ALTER TABLE `warehouse` ADD COLUMN `lng` DECIMAL(10, 7) NULL,
  ADD COLUMN `lat` DECIMAL(10, 7) NULL,
  ADD COLUMN `coordSource` ENUM('geocoded', 'manual') NULL;

ALTER TABLE `inventory` ADD COLUMN `warehouse_zone_id` BIGINT NULL;
CREATE INDEX `inventory_warehouse_zone_id_idx` ON `inventory`(`warehouse_zone_id`);

ALTER TABLE `supplier_contact` ADD CONSTRAINT `supplier_contact_supplierId_fkey`
  FOREIGN KEY (`supplierId`) REFERENCES `supplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `supplier_address` ADD CONSTRAINT `supplier_address_supplierId_fkey`
  FOREIGN KEY (`supplierId`) REFERENCES `supplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `supplier_address` ADD CONSTRAINT `supplier_address_addressTypeId_fkey`
  FOREIGN KEY (`addressTypeId`) REFERENCES `address_type`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `supplier_business_category` ADD CONSTRAINT `supplier_business_category_supplierId_fkey`
  FOREIGN KEY (`supplierId`) REFERENCES `supplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `supplier_business_category` ADD CONSTRAINT `supplier_business_category_categoryId_fkey`
  FOREIGN KEY (`categoryId`) REFERENCES `category`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `warehouse_zone` ADD CONSTRAINT `warehouse_zone_warehouseId_fkey`
  FOREIGN KEY (`warehouseId`) REFERENCES `warehouse`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `warehouse_contact` ADD CONSTRAINT `warehouse_contact_warehouseId_fkey`
  FOREIGN KEY (`warehouseId`) REFERENCES `warehouse`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `inventory` ADD CONSTRAINT `inventory_warehouse_zone_id_fkey`
  FOREIGN KEY (`warehouse_zone_id`) REFERENCES `warehouse_zone`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
