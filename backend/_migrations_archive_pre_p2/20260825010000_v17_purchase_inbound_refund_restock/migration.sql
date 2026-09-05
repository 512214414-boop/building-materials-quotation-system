-- 独立采购入库单 + 退货回库标记

CREATE TABLE `purchase_inbounds` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `purchase_no` VARCHAR(50) NOT NULL,
  `supplier_id` BIGINT NOT NULL,
  `supplierName` VARCHAR(200) NULL,
  `warehouse_id` BIGINT NOT NULL,
  `warehouseName` VARCHAR(200) NULL,
  `status` ENUM('pending', 'done', 'cancelled') NOT NULL DEFAULT 'pending',
  `total_qty` DECIMAL(14, 3) NOT NULL DEFAULT 0,
  `total_amount` DECIMAL(14, 2) NOT NULL DEFAULT 0,
  `remark` VARCHAR(500) NULL,
  `confirmed_at` DATETIME(3) NULL,
  `confirmed_by` BIGINT NULL,
  `confirmedName` VARCHAR(50) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `purchase_inbounds_purchase_no_key` (`purchase_no`),
  INDEX `purchase_inbounds_status_created_at_idx` (`status`, `created_at`),
  INDEX `purchase_inbounds_supplier_id_idx` (`supplier_id`),
  INDEX `purchase_inbounds_warehouse_id_idx` (`warehouse_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `purchase_inbound_lines` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `inbound_id` BIGINT NOT NULL,
  `spec_id` BIGINT NOT NULL,
  `brand_id` BIGINT NOT NULL,
  `unit_id` BIGINT NOT NULL,
  `productName` VARCHAR(200) NULL,
  `specModel` VARCHAR(200) NULL,
  `brandName` VARCHAR(100) NULL,
  `categoryName` VARCHAR(100) NULL,
  `unitName` VARCHAR(50) NULL,
  `qty` DECIMAL(14, 3) NOT NULL,
  `unit_cost` DECIMAL(14, 2) NOT NULL,
  `amount` DECIMAL(14, 2) NOT NULL,
  `seq` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  INDEX `purchase_inbound_lines_inbound_id_idx` (`inbound_id`),
  INDEX `purchase_inbound_lines_spec_id_brand_id_unit_id_idx` (`spec_id`, `brand_id`, `unit_id`),
  CONSTRAINT `purchase_inbound_lines_inbound_id_fkey` FOREIGN KEY (`inbound_id`) REFERENCES `purchase_inbounds`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `refund_lines`
  ADD COLUMN `restock` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `restock_warehouse_id` BIGINT NULL;
