-- ===========================================================================
-- P2-d（实际应用修正版 · 2026-09-06 · 安全子集）
-- 剔除 19 个被 prisma migrate diff 误判为“漂移”、实为 schema.prisma 真实关系的
-- 外键 DROP；保留 ft_* 全文索引（P4 搜索用）与被外键占用的 sale_price 索引。
-- 仅做：索引改名 / inventory_ledger 补 3 列 / 补 2 个新 FK / 加 2 索引 / 去 DEFAULT。
-- ===========================================================================




















-- DropIndex
DROP INDEX `brand_unit_conversion_specId_idx` ON `brand_unit_conversion`;







-- AlterTable
ALTER TABLE `brand_unit_conversion` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `cost_lines` ALTER COLUMN `cost_segment` DROP DEFAULT;

-- AlterTable
ALTER TABLE `inventory_ledger` ADD COLUMN `brandName` VARCHAR(100) NULL,
    ADD COLUMN `specModel` VARCHAR(200) NULL,
    ADD COLUMN `unitName` VARCHAR(50) NULL;


-- AlterTable
ALTER TABLE `supplier` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `unit` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- CreateIndex
CREATE INDEX `brand_unit_conversion_specId_idx` ON `brand_unit_conversion`(`specId`);

-- CreateIndex
CREATE INDEX `unit_status_idx` ON `unit`(`status`);

-- AddForeignKey
ALTER TABLE `spec_unit` DROP FOREIGN KEY `spec_unit_unit_fk`;
ALTER TABLE `spec_unit` ADD CONSTRAINT `spec_unit_unitId_fkey` FOREIGN KEY (`unitId`) REFERENCES `unit`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inbound_lines` ADD CONSTRAINT `inbound_lines_task_id_fkey` FOREIGN KEY (`task_id`) REFERENCES `inbound_tasks`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER TABLE `documents` RENAME INDEX `documents_status_archived_created_idx` TO `documents_status_sales_archived_at_created_at_idx`;

-- RenameIndex
ALTER TABLE `spec` RENAME INDEX `spec_v22_brandId_idx` TO `spec_brandId_idx`;

-- RenameIndex
ALTER TABLE `spec` RENAME INDEX `spec_v22_productId_brandId_idx` TO `spec_productId_brandId_idx`;

-- RenameIndex
ALTER TABLE `spec` RENAME INDEX `spec_v22_productId_brandId_specModel_key` TO `spec_productId_brandId_specModel_key`;

-- RenameIndex
ALTER TABLE `spec` RENAME INDEX `spec_v22_productId_idx` TO `spec_productId_idx`;

-- RenameIndex
ALTER TABLE `supplier_payable_lines` RENAME INDEX `supplier_payable_lines_status_created_idx` TO `supplier_payable_lines_status_created_at_idx`;

