-- v1.7.0 配货行扩展 + 供应商应付（配货·成本推演方案落地）
--
-- 变更内容：
--   1. allocation_lines 新增 over_qty（超额入库数量）+ excess_target_warehouse_id（超额目标仓库）
--   2. 新增 supplier_payable_lines 表（外部调货成本账目：等额直发/超额入库/独立采购）
--
-- 设计依据（《配货与成本核算推演方案.md》9.6 / 9.8）：
--   - 超额部分归属本次最后选定的外部供应商，默认入主仓
--   - 外部调货成本计入该供应商应付账款，后续统一结算，无需走独立采购单

-- 1. allocation_lines 扩展
ALTER TABLE `allocation_lines`
  ADD COLUMN `over_qty` DECIMAL(14,3) NOT NULL DEFAULT 0 AFTER `pending_status`,
  ADD COLUMN `excess_target_warehouse_id` BIGINT NULL AFTER `over_qty`;

-- 2. 供应商应付明细表
CREATE TABLE `supplier_payable_lines` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `payable_no` VARCHAR(50) NOT NULL,
  `supplier_id` BIGINT NOT NULL,
  `supplierName` VARCHAR(200) NULL,
  `biz_type` VARCHAR(50) NOT NULL,
  `biz_no` VARCHAR(100) NOT NULL,
  `document_id` BIGINT NULL,
  `line_id` BIGINT NULL,
  `amount` DECIMAL(14,2) NOT NULL,
  `status` ENUM('pending','settled') NOT NULL DEFAULT 'pending',
  `settled_at` DATETIME(3) NULL,
  `remark` VARCHAR(500) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `supplier_payable_lines_payable_no_key` (`payable_no`),
  KEY `supplier_payable_lines_supplier_id_idx` (`supplier_id`),
  KEY `supplier_payable_lines_status_idx` (`status`),
  KEY `supplier_payable_lines_biz_no_idx` (`biz_no`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
