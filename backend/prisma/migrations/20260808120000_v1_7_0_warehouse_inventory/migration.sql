-- v1.7.0 配货·库存·成本推演方案落地（用户定稿《配货与成本核算推演方案.md》）
--
-- 变更内容：
--   1. 新增 warehouse 表：内部仓库档案（与外部供应商永久拆分，含 zones 多库区点位）
--   2. 新增 inventory 表：库存台账（仓库 × SKU，加权平均进价）
--   3. 新增 inventory_ledger 表：库存流水（加权平均进价演变与追溯依据）
--   4. 新增枚举：inventory_movement_type（入/出/盘点调整）
--      backorder_status / inbound_task_status / payable_status 枚举先行声明（后续步骤建表）
--
-- 设计依据（《配货与成本核算推演方案.md》v1.0）：
--   - 内部仓库、外部供应商底层架构永久拆分
--   - 内部出库成本 = 当前仓库加权平均进价；库存同步扣减
--   - 三原则对齐 v11.0 全域解耦：业务台账 → 基础档案 无物理外键 + 名称快照 + ID 聚合

-- 1. 内部仓库档案表
CREATE TABLE `warehouse` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(200) NOT NULL,
  `code` VARCHAR(50) NULL,
  `zones` JSON NULL,
  `address` VARCHAR(500) NULL,
  `manager` VARCHAR(50) NULL,
  `isMain` TINYINT(1) NOT NULL DEFAULT 0,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `status` INT NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `warehouse_code_key` (`code`),
  KEY `warehouse_status_idx` (`status`),
  KEY `warehouse_isMain_idx` (`isMain`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2. 库存台账表（仓库 × SKU）
CREATE TABLE `inventory` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `warehouse_id` BIGINT NOT NULL,
  `brand_id` BIGINT NOT NULL,
  `unit_id` BIGINT NOT NULL,
  `qty` DECIMAL(14,3) NOT NULL DEFAULT 0,
  `weighted_avg_cost` DECIMAL(14,2) NOT NULL DEFAULT 0,
  `last_in_at` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `inventory_warehouse_id_brand_id_unit_id_key` (`warehouse_id`, `brand_id`, `unit_id`),
  KEY `inventory_warehouse_id_idx` (`warehouse_id`),
  KEY `inventory_brand_id_unit_id_idx` (`brand_id`, `unit_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 3. 库存流水表（加权平均进价依据）
CREATE TABLE `inventory_ledger` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `ledger_no` VARCHAR(50) NOT NULL,
  `warehouse_id` BIGINT NOT NULL,
  `brand_id` BIGINT NOT NULL,
  `unit_id` BIGINT NOT NULL,
  `movement_type` ENUM('in','out','adjust') NOT NULL,
  `qty` DECIMAL(14,3) NOT NULL,
  `unit_cost` DECIMAL(14,2) NOT NULL,
  `balance_qty` DECIMAL(14,3) NOT NULL,
  `balance_avg_cost` DECIMAL(14,2) NOT NULL,
  `biz_type` VARCHAR(50) NULL,
  `biz_no` VARCHAR(100) NULL,
  `line_id` BIGINT NULL,
  `remark` VARCHAR(500) NULL,
  `created_by` BIGINT NULL,
  `creatorName` VARCHAR(50) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `inventory_ledger_ledger_no_key` (`ledger_no`),
  KEY `inventory_ledger_warehouse_id_brand_id_unit_id_idx` (`warehouse_id`, `brand_id`, `unit_id`),
  KEY `inventory_ledger_biz_no_idx` (`biz_no`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
