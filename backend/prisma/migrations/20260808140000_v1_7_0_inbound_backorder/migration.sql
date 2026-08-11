-- v1.7.0 待入库 + 欠库台账（配货·成本推演方案落地）
--
-- 变更内容：
--   1. 新增 inbound_tasks 表：待入库单主表（订单内超额调货后置环节，一键确认入库）
--   2. 新增 inbound_lines 表：待入库行（超额数量 × 约定进价）
--   3. 新增 backorders 表：欠库台账（库存不足兜底，补货入库后自动冲抵）
--
-- 设计依据（《配货与成本核算推演方案.md》3.4 / 4 / 9.4 / 9.5）：
--   - 超额部分归属最后选定外部供应商，默认入主自有库房（可改）
--   - 后置入库不阻塞配货开单主线；确认入库时加库存 + 增供应商应付 + 冲抵欠库

-- 1. 待入库单主表
CREATE TABLE `inbound_tasks` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `inbound_no` VARCHAR(50) NOT NULL,
  `document_id` BIGINT NOT NULL,
  `supplier_id` BIGINT NOT NULL,
  `supplierName` VARCHAR(200) NULL,
  `target_warehouse_id` BIGINT NOT NULL,
  `total_qty` DECIMAL(14,3) NOT NULL DEFAULT 0,
  `total_amount` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `status` ENUM('pending','done','cancelled') NOT NULL DEFAULT 'pending',
  `confirmed_at` DATETIME(3) NULL,
  `confirmed_by` BIGINT NULL,
  `confirmedName` VARCHAR(50) NULL,
  `note` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `inbound_tasks_inbound_no_key` (`inbound_no`),
  KEY `inbound_tasks_status_idx` (`status`),
  KEY `inbound_tasks_document_id_idx` (`document_id`),
  KEY `inbound_tasks_supplier_id_idx` (`supplier_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. 待入库行表
CREATE TABLE `inbound_lines` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `task_id` BIGINT NOT NULL,
  `line_id` BIGINT NULL,
  `brand_id` BIGINT NOT NULL,
  `unit_id` BIGINT NOT NULL,
  `productName` VARCHAR(200) NULL,
  `brandName` VARCHAR(100) NULL,
  `categoryName` VARCHAR(100) NULL,
  `specModel` VARCHAR(200) NULL,
  `unitName` VARCHAR(50) NULL,
  `qty` DECIMAL(14,3) NOT NULL,
  `unit_cost` DECIMAL(14,2) NOT NULL,
  `amount` DECIMAL(14,2) NOT NULL,
  `status` ENUM('pending','done','cancelled') NOT NULL DEFAULT 'pending',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `inbound_lines_task_id_idx` (`task_id`),
  KEY `inbound_lines_line_id_idx` (`line_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3. 欠库台账表
CREATE TABLE `backorders` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `document_id` BIGINT NOT NULL,
  `line_id` BIGINT NOT NULL,
  `warehouse_id` BIGINT NOT NULL,
  `brand_id` BIGINT NOT NULL,
  `unit_id` BIGINT NOT NULL,
  `qty` DECIMAL(14,3) NOT NULL,
  `status` ENUM('pending','fulfilled','cancelled') NOT NULL DEFAULT 'pending',
  `fulfilled_at` DATETIME(3) NULL,
  `fulfilled_by` BIGINT NULL,
  `fulfilledName` VARCHAR(50) NULL,
  `note` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `backorders_status_idx` (`status`),
  KEY `backorders_document_id_idx` (`document_id`),
  KEY `backorders_warehouse_id_brand_id_unit_id_idx` (`warehouse_id`, `brand_id`, `unit_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
