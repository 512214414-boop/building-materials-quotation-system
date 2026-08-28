-- 售价组默认 + 售/进价规格例外。实际价 = 面价 × 点位，点位读时算。

CREATE TABLE `sale_point_rule` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `priceTypeId` BIGINT NOT NULL,
  `brandName` VARCHAR(100) NOT NULL,
  `categoryName` VARCHAR(100) NOT NULL,
  `point` DECIMAL(10, 4) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `sale_point_rule_priceTypeId_brandName_categoryName_key` (`priceTypeId`, `brandName`, `categoryName`),
  INDEX `sale_point_rule_priceTypeId_idx` (`priceTypeId`),
  INDEX `sale_point_rule_brandName_idx` (`brandName`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `sale_spec_point` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `specBrandId` BIGINT NOT NULL,
  `priceTypeId` BIGINT NOT NULL,
  `point` DECIMAL(10, 4) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `sale_spec_point_specBrandId_priceTypeId_key` (`specBrandId`, `priceTypeId`),
  INDEX `sale_spec_point_specBrandId_idx` (`specBrandId`),
  INDEX `sale_spec_point_priceTypeId_idx` (`priceTypeId`),
  CONSTRAINT `sale_spec_point_specBrandId_fkey` FOREIGN KEY (`specBrandId`) REFERENCES `spec_brand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `sale_spec_point_priceTypeId_fkey` FOREIGN KEY (`priceTypeId`) REFERENCES `price_type`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `purchase_spec_point` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `specBrandId` BIGINT NOT NULL,
  `supplierId` BIGINT NOT NULL,
  `point` DECIMAL(10, 4) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `purchase_spec_point_specBrandId_supplierId_key` (`specBrandId`, `supplierId`),
  INDEX `purchase_spec_point_specBrandId_idx` (`specBrandId`),
  INDEX `purchase_spec_point_supplierId_idx` (`supplierId`),
  CONSTRAINT `purchase_spec_point_specBrandId_fkey` FOREIGN KEY (`specBrandId`) REFERENCES `spec_brand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
