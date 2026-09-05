-- DropForeignKey
ALTER TABLE `access_requests` DROP FOREIGN KEY `access_requests_reviewedBy_fkey`;

-- DropForeignKey
ALTER TABLE `allocation_lines` DROP FOREIGN KEY `allocation_lines_created_by_fkey`;

-- DropForeignKey
ALTER TABLE `allocation_lines` DROP FOREIGN KEY `allocation_lines_source_id_fkey`;

-- DropForeignKey
ALTER TABLE `audit_logs` DROP FOREIGN KEY `audit_logs_customer_id_fkey`;

-- DropForeignKey
ALTER TABLE `audit_logs` DROP FOREIGN KEY `audit_logs_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `authorization_codes` DROP FOREIGN KEY `authorization_codes_createdBy_fkey`;

-- DropForeignKey
ALTER TABLE `cost_lines` DROP FOREIGN KEY `cost_lines_source_id_fkey`;

-- DropForeignKey
ALTER TABLE `cost_lines` DROP FOREIGN KEY `cost_lines_verified_by_fkey`;

-- DropForeignKey
ALTER TABLE `document_lines` DROP FOREIGN KEY `document_lines_brandId_fkey`;

-- DropForeignKey
ALTER TABLE `document_lines` DROP FOREIGN KEY `document_lines_productId_fkey`;

-- DropForeignKey
ALTER TABLE `document_lines` DROP FOREIGN KEY `document_lines_unitId_fkey`;

-- DropForeignKey
ALTER TABLE `documents` DROP FOREIGN KEY `documents_created_by_fkey`;

-- DropForeignKey
ALTER TABLE `documents` DROP FOREIGN KEY `documents_customer_id_fkey`;

-- DropForeignKey
ALTER TABLE `documents` DROP FOREIGN KEY `documents_salesperson_id_fkey`;

-- DropForeignKey
ALTER TABLE `payment_records` DROP FOREIGN KEY `payment_records_created_by_fkey`;

-- DropForeignKey
ALTER TABLE `purchase_price` DROP FOREIGN KEY `purchase_price_supplierId_fkey`;

-- DropForeignKey
ALTER TABLE `refund_lines` DROP FOREIGN KEY `refund_lines_created_by_fkey`;

-- DropForeignKey
ALTER TABLE `reimbursement_bills` DROP FOREIGN KEY `reimbursement_bills_created_by_fkey`;

-- DropForeignKey
ALTER TABLE `spec_unit` DROP FOREIGN KEY `spec_unit_unit_fk`;

-- DropIndex
DROP INDEX `ft_brand_name` ON `brand`;

-- DropIndex
DROP INDEX `brand_unit_conversion_specId_idx` ON `brand_unit_conversion`;

-- DropIndex
DROP INDEX `ft_category_name` ON `category`;

-- DropIndex
DROP INDEX `ft_product_name` ON `product`;

-- DropIndex
DROP INDEX `ft_product_remark` ON `product`;

-- DropIndex
DROP INDEX `sale_price_brandId_unitId_priceTypeId_idx` ON `sale_price`;

-- DropIndex
DROP INDEX `ft_spec_model` ON `spec`;

-- DropIndex
DROP INDEX `ft_spec_remark` ON `spec`;

-- AlterTable
ALTER TABLE `brand_unit_conversion` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `cost_lines` ALTER COLUMN `cost_segment` DROP DEFAULT;

-- AlterTable
ALTER TABLE `inventory_ledger` ADD COLUMN `brandName` VARCHAR(100) NULL,
    ADD COLUMN `specModel` VARCHAR(200) NULL,
    ADD COLUMN `unitName` VARCHAR(50) NULL;

-- AlterTable
ALTER TABLE `spec` MODIFY `id` BIGINT NOT NULL AUTO_INCREMENT,
    MODIFY `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `supplier` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- AlterTable
ALTER TABLE `unit` ALTER COLUMN `updatedAt` DROP DEFAULT;

-- CreateIndex
CREATE INDEX `brand_unit_conversion_specId_idx` ON `brand_unit_conversion`(`specId`);

-- CreateIndex
CREATE INDEX `unit_status_idx` ON `unit`(`status`);

-- AddForeignKey
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

