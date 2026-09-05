-- v21: 供应商经营品牌（supplier_business_brand）

CREATE TABLE `supplier_business_brand` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `supplierId` BIGINT NOT NULL,
  `brandId` BIGINT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `supplier_business_brand_supplierId_brandId_key`(`supplierId`, `brandId`),
  INDEX `supplier_business_brand_supplierId_idx`(`supplierId`),
  INDEX `supplier_business_brand_brandId_idx`(`brandId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `supplier_business_brand`
  ADD CONSTRAINT `supplier_business_brand_supplierId_fkey`
    FOREIGN KEY (`supplierId`) REFERENCES `supplier`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `supplier_business_brand_brandId_fkey`
    FOREIGN KEY (`brandId`) REFERENCES `brand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
